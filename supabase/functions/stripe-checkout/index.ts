// POST — starts a Stripe Checkout for Koko Premium ($35 a month, the price STRIPE_PRICE_ID) and answers { url }.
// From the website, nobody needs to be signed in: Stripe asks for the parent's email, and the webhook links the
// subscription to the Koko account of that email (creating it if needed). A signed-in parent's session, when sent,
// links it directly and stops a second subscription. GET answers whether subscriptions are open, and Stripe's
// customer-portal login link (STRIPE_PORTAL_LOGIN_URL) where website subscribers manage or cancel.
import { serviceClient } from '../_shared/admin.ts';
import { SITE_URL, cors, json, parentFrom } from '../_shared/parents.ts';
import { stripe } from '../_shared/stripe.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  // GET: what the website's account page needs to know (nothing secret)
  if (req.method === 'GET') return json(200, { open: Boolean(Deno.env.get('STRIPE_SECRET_KEY') && Deno.env.get('STRIPE_PRICE_ID')),
    portal: Deno.env.get('STRIPE_PORTAL_LOGIN_URL') || null });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const s = stripe(), price = Deno.env.get('STRIPE_PRICE_ID');
  if (!s || !price) return json(503, { error: 'Subscriptions on the website are not open yet.' });
  const db = serviceClient();
  const parent = await parentFrom(req, db);

  let customer: string | undefined;
  if (parent) {
    const { data: access } = await db.from('entitlements').select('id')
      .eq('user_id', parent.id).or(`active_until.is.null,active_until.gt."${new Date().toISOString()}"`).limit(1);
    if (access?.length) return json(409, { error: 'This account already has Koko Premium.' });
    const { data: c } = await db.from('billing_customers').select('stripe_customer_id').eq('user_id', parent.id).maybeSingle();
    customer = c?.stripe_customer_id;
  }
  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    success_url: `${SITE_URL}/account.html?subscribed=1`,
    cancel_url: `${SITE_URL}/account.html`,
    allow_promotion_codes: true,
    ...(customer ? { customer } : parent?.email ? { customer_email: parent.email } : {}),
    ...(parent ? { client_reference_id: parent.id, subscription_data: { metadata: { koko_user_id: parent.id } } } : {}),
    metadata: { app: 'koko' },
  });
  return json(200, { url: session.url });
});
