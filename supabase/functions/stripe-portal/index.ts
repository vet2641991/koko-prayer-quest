// POST — a signed-in parent opens Stripe's billing portal (card, invoices, cancel) for their website subscription.
import { serviceClient } from '../_shared/admin.ts';
import { SITE_URL, cors, json, parentFrom } from '../_shared/parents.ts';
import { stripe } from '../_shared/stripe.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const s = stripe();
  if (!s) return json(503, { error: 'Website subscriptions are not open yet.' });
  const db = serviceClient();
  const parent = await parentFrom(req, db);
  if (!parent) return json(401, { error: 'Please sign in again' });
  const { data: c } = await db.from('billing_customers').select('stripe_customer_id').eq('user_id', parent.id).maybeSingle();
  if (!c) return json(404, { error: 'No website subscription on this account. App Store and Google Play subscriptions are managed in the store.' });
  const portal = await s.billingPortal.sessions.create({ customer: c.stripe_customer_id, return_url: `${SITE_URL}/account.html` });
  return json(200, { url: portal.url });
});
