// POST — a signed-in parent deletes their Koko account (App Store rule 5.1.1(v): accounts can be deleted in the app).
// A website subscription is cancelled at once, so it is never charged again. App Store and Google Play
// subscriptions belong to the store account: the app tells the parent to cancel them in the store.
import { serviceClient } from '../_shared/admin.ts';
import { cors, json, parentFrom } from '../_shared/parents.ts';
import { stripe } from '../_shared/stripe.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const db = serviceClient();
  const parent = await parentFrom(req, db);
  if (!parent) return json(401, { error: 'Please sign in again' });
  const { data: admin } = await db.from('admins').select('user_id').eq('user_id', parent.id).maybeSingle();
  if (admin) return json(400, { error: 'Admin accounts are removed by the owner in the dashboard.' });

  const { data: cust } = await db.from('billing_customers').select('stripe_customer_id').eq('user_id', parent.id).maybeSingle();
  const s = stripe();
  if (cust && s) {
    for await (const sub of s.subscriptions.list({ customer: cust.stripe_customer_id, status: 'all' })) {
      if (!['canceled', 'incomplete_expired'].includes(sub.status)) await s.subscriptions.cancel(sub.id);
    }
  }
  const { error } = await db.auth.admin.deleteUser(parent.id);   // entitlements and billing rows go with it
  if (error) return json(500, { error: 'The account could not be deleted. Please try again.' });
  return json(200, { ok: true });
});
