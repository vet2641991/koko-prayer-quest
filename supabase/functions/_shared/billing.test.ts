// deno test supabase/functions/_shared — the subscription rules, and Stripe's signature check as the webhook runs it.
import { assert, assertEquals, assertFalse, assertRejects } from 'jsr:@std/assert@1.0.14';
import Stripe from 'npm:stripe@23.0.0';
import { fromRevenueCat, fromStripe, revenueCatUserIds, sameSecret, type StripeSub } from './billing.ts';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const day = 86_400_000;
const at = (ms: number) => new Date(ms).toISOString();
const U = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';

Deno.test('RevenueCat: an active App Store subscription', () => {
  const r = fromRevenueCat(U, {
    entitlements: { premium: { expires_date: at(NOW + 20 * day), product_identifier: 'koko_premium_monthly' } },
    subscriptions: { koko_premium_monthly: { store: 'app_store', expires_date: at(NOW + 20 * day) } },
  }, NOW)!;
  assertEquals(r, { source: 'revenuecat', external_id: U, store: 'app_store', product_id: 'koko_premium_monthly',
    active_until: at(NOW + 20 * day), will_renew: true, status: 'active' });
});

Deno.test('RevenueCat: cancelled but paid until the end of the month stays Premium, without renewal', () => {
  const r = fromRevenueCat(U, {
    entitlements: { premium: { expires_date: at(NOW + 5 * day), product_identifier: 'koko_premium' } },
    subscriptions: { koko_premium: { store: 'play_store', unsubscribe_detected_at: at(NOW - day) } },
  }, NOW)!;
  assertEquals([r.status, r.will_renew, r.active_until], ['cancelled', false, at(NOW + 5 * day)]);
});

Deno.test('RevenueCat: a failed renewal in the store grace period keeps Premium until the grace period ends', () => {
  const r = fromRevenueCat(U, {
    entitlements: { premium: { expires_date: at(NOW - day), grace_period_expires_date: at(NOW + 6 * day), product_identifier: 'p' } },
    subscriptions: { p: { store: 'app_store', billing_issues_detected_at: at(NOW - day) } },
  }, NOW)!;
  assertEquals([r.status, r.active_until], ['billing_issue', at(NOW + 6 * day)]);
});

Deno.test('RevenueCat: expired, refunded, sandbox, lifetime and never-subscribed', () => {
  const expired = fromRevenueCat(U, { entitlements: { premium: { expires_date: at(NOW - day), product_identifier: 'p' } },
    subscriptions: { p: { store: 'app_store' } } }, NOW)!;
  assertEquals([expired.status, expired.will_renew], ['expired', false]);
  const refunded = fromRevenueCat(U, { entitlements: { premium: { expires_date: at(NOW + 9 * day), product_identifier: 'p' } },
    subscriptions: { p: { store: 'app_store', refunded_at: at(NOW - day) } } }, NOW)!;
  assertEquals([refunded.status, refunded.active_until], ['expired', at(NOW - day)]);
  const sandbox = fromRevenueCat(U, { entitlements: { premium: { expires_date: at(NOW + day), product_identifier: 'p' } },
    subscriptions: { p: { store: 'app_store', is_sandbox: true } } }, NOW)!;
  assertEquals(sandbox.store, 'app_store (sandbox)');
  const lifetime = fromRevenueCat(U, { entitlements: { premium: { expires_date: null, product_identifier: 'gift' } },
    non_subscriptions: { gift: [{ store: 'promotional' }] } }, NOW)!;
  assertEquals([lifetime.active_until, lifetime.status, lifetime.store], [null, 'active', 'promotional']);
  assertEquals(fromRevenueCat(U, { entitlements: {} }, NOW), null);
});

Deno.test('RevenueCat: only Koko account ids are followed, never anonymous ones', () => {
  const ids = revenueCatUserIds({ app_user_id: U.toUpperCase(), original_app_user_id: '$RCAnonymousID:abc',
    aliases: ['$RCAnonymousID:abc', U], transferred_from: ['$RCAnonymousID:x'], transferred_to: ['0f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b'] });
  assertEquals(ids.sort(), ['0f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b', U].sort());
});

Deno.test('the RevenueCat secret check needs the exact value', () => {
  assert(sameSecret('s3cret-value', 's3cret-value'));
  assertFalse(sameSecret('s3cret-valuE', 's3cret-value'));
  assertFalse(sameSecret('s3cret-value-and-more', 's3cret-value'));
  assertFalse(sameSecret('', ''), 'an empty configured secret never matches');
});

const sub = (o: Partial<StripeSub>): StripeSub => ({ id: 'sub_1', status: 'active', customer: 'cus_1',
  items: { data: [{ current_period_end: (NOW + 30 * day) / 1000, price: { id: 'price_35' } }] }, ...o });

Deno.test('Stripe: active, cancelling at period end, past due, cancelled, incomplete', () => {
  assertEquals(fromStripe(sub({}), NOW), { source: 'stripe', external_id: 'sub_1', store: 'stripe', product_id: 'price_35',
    active_until: at(NOW + 30 * day), will_renew: true, status: 'active' });
  const cancelling = fromStripe(sub({ cancel_at_period_end: true }), NOW);
  assertEquals([cancelling.status, cancelling.will_renew, cancelling.active_until], ['cancelled', false, at(NOW + 30 * day)]);
  assertEquals(fromStripe(sub({ status: 'past_due' }), NOW).status, 'billing_issue');
  const ended = fromStripe(sub({ status: 'canceled', ended_at: (NOW - day) / 1000 }), NOW);
  assertEquals([ended.status, ended.active_until, ended.will_renew], ['expired', at(NOW - day), false]);
  const incomplete = fromStripe(sub({ status: 'incomplete' }), NOW);
  assert(Date.parse(incomplete.active_until!) <= NOW, 'an unpaid first invoice is not Premium');
  assertEquals(fromStripe(sub({ current_period_end: (NOW + 3 * day) / 1000, items: { data: [] } }), NOW).active_until,
    at(NOW + 3 * day), 'older API versions keep the period end on the subscription');
});

Deno.test('Stripe webhook signatures: accepted when signed with the secret, refused otherwise', async () => {
  const s = new Stripe('sk_test_dummy', { httpClient: Stripe.createFetchHttpClient() });
  const crypto = Stripe.createSubtleCryptoProvider();
  const secret = 'whsec_test_secret';
  const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } });
  const header = await s.webhooks.generateTestHeaderStringAsync({ payload, secret, cryptoProvider: crypto });
  const event = await s.webhooks.constructEventAsync(payload, header, secret, undefined, crypto);
  assertEquals(event.id, 'evt_1');
  await assertRejects(() => s.webhooks.constructEventAsync(payload.replace('sub_1', 'sub_2'), header, secret, undefined, crypto));
  await assertRejects(() => s.webhooks.constructEventAsync(payload, header, 'whsec_other', undefined, crypto));
});
