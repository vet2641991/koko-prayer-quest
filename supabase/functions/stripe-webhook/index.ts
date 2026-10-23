// Stripe → Koko: keeps public.entitlements in step with website subscriptions. Stripe signs every call with
// STRIPE_WEBHOOK_SECRET; anything unsigned or tampered with is refused. Each event is handled once.
// The subscription is always re-read from Stripe, so events that arrive late or out of order cannot undo a newer state.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { serviceClient } from '../_shared/admin.ts';
import { fromStripe, isUuid, stripeCustomerId, type StripeSub } from '../_shared/billing.ts';
import { accountFor, firstTime, forget, json } from '../_shared/parents.ts';
import { cryptoProvider, stripe, type Stripe } from '../_shared/stripe.ts';

async function link(db: SupabaseClient, userId: string, customer: string) {
  const { error } = await db.from('billing_customers').upsert({ user_id: userId, stripe_customer_id: customer }, { onConflict: 'user_id' });
  if (error && error.code !== '23505') throw new Error(error.message);   // 23505: this customer already belongs to someone
}

/** The Koko account a Stripe customer pays for: linked before, named in the subscription, or by the customer's email. */
async function accountOf(db: SupabaseClient, s: Stripe, sub: StripeSub): Promise<string | null> {
  const customer = stripeCustomerId(sub);
  const { data } = await db.from('billing_customers').select('user_id').eq('stripe_customer_id', customer).maybeSingle();
  if (data) return data.user_id;
  let userId = isUuid(sub.metadata?.koko_user_id) ? sub.metadata!.koko_user_id : null;
  if (!userId) {
    const c = await s.customers.retrieve(customer);
    const email = 'deleted' in c && c.deleted ? null : (c as Stripe.Customer).email;
    userId = email ? await accountFor(db, email) : null;
  }
  if (userId) await link(db, userId, customer);
  return userId;
}

async function save(db: SupabaseClient, userId: string, sub: StripeSub) {
  const { error } = await db.from('entitlements').upsert({ user_id: userId, ...fromStripe(sub) }, { onConflict: 'source,external_id' });
  if (error) throw new Error(error.message);
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const s = stripe(), secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!s || !secret) return json(503, { error: 'Stripe is not configured' });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await s.webhooks.constructEventAsync(body, req.headers.get('stripe-signature') ?? '', secret, undefined, cryptoProvider);
  } catch {
    return json(400, { error: 'Bad signature' });
  }
  const db = serviceClient();
  if (!(await firstTime(db, 'stripe', event.id, event.type))) return json(200, { ok: true, duplicate: true });
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === 'subscription' && session.subscription && session.customer) {
        const customer = typeof session.customer === 'string' ? session.customer : session.customer.id;
        const email = session.customer_details?.email ?? session.customer_email;
        const userId = isUuid(session.client_reference_id) ? session.client_reference_id : email ? await accountFor(db, email) : null;
        if (userId) {
          await link(db, userId, customer);
          const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
          await save(db, userId, await s.subscriptions.retrieve(subId) as unknown as StripeSub);
        }
      }
    } else if (event.type.startsWith('customer.subscription.')) {
      const sub = await s.subscriptions.retrieve((event.data.object as { id: string }).id) as unknown as StripeSub;
      const userId = await accountOf(db, s, sub);
      if (userId) await save(db, userId, sub);
    }
    return json(200, { ok: true });
  } catch (e) {
    await forget(db, 'stripe', event.id);   // let Stripe's retry try again
    console.error(event.type, event.id, e);
    return json(500, { error: 'Could not record this event' });
  }
});
