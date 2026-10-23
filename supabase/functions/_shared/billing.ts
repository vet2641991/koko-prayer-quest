// Koko Premium: turns what the stores report into one entitlement row. Pure functions (no I/O), so the webhook
// handlers stay thin and these rules are unit-tested (billing.test.ts).

export const ENTITLEMENT = 'premium';   // the entitlement id in RevenueCat
export type Status = 'active' | 'cancelled' | 'billing_issue' | 'expired' | 'paused';
export type EntitlementRow = {
  source: 'revenuecat' | 'stripe';
  external_id: string;
  store: string | null;
  product_id: string | null;
  active_until: string | null;   // ISO; null only for a purchase with no end (RevenueCat lifetime/promotional)
  will_renew: boolean;
  status: Status;
};

export const isUuid = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** Compares two secrets in constant time (the RevenueCat webhook's Authorization header). */
export function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0 && b.length > 0;
}

const iso = (ms: number) => new Date(ms).toISOString();
const later = (a: string | null | undefined, b: string | null | undefined) =>
  !a ? b ?? null : !b ? a : (Date.parse(a) >= Date.parse(b) ? a : b);

// ---------------------------------------------------------------------------------------------------------------
// RevenueCat (App Store and Google Play). Input: GET /v1/subscribers/{app_user_id} → .subscriber
// ---------------------------------------------------------------------------------------------------------------
type RcEntitlement = { expires_date: string | null; grace_period_expires_date?: string | null; product_identifier: string };
type RcSubscription = {
  store?: string; expires_date?: string | null; unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null; is_sandbox?: boolean; refunded_at?: string | null;
};
export type RcSubscriber = {
  entitlements?: Record<string, RcEntitlement>;
  subscriptions?: Record<string, RcSubscription>;
  non_subscriptions?: Record<string, { store?: string }[]>;
};

/**
 * The entitlement row of one RevenueCat customer, or null if they never had Koko Premium.
 * The paid period runs to the later of the expiry and the store's grace period (a failed renewal the store is
 * still retrying keeps Premium on, as Apple and Google ask).
 */
export function fromRevenueCat(appUserId: string, sub: RcSubscriber, now = Date.now()): EntitlementRow | null {
  const ent = sub.entitlements?.[ENTITLEMENT];
  if (!ent) return null;
  const s = sub.subscriptions?.[ent.product_identifier];
  const store = s?.store ?? sub.non_subscriptions?.[ent.product_identifier]?.[0]?.store ?? null;
  const until = ent.expires_date === null ? null : later(ent.expires_date, ent.grace_period_expires_date);
  const ended = until !== null && Date.parse(until) <= now;
  const status: Status = ended || s?.refunded_at ? 'expired'
    : s?.billing_issues_detected_at ? 'billing_issue'
    : s?.unsubscribe_detected_at ? 'cancelled' : 'active';
  return {
    source: 'revenuecat',
    external_id: appUserId,
    store: store ? (s?.is_sandbox ? `${store} (sandbox)` : store) : null,
    product_id: ent.product_identifier,
    active_until: s?.refunded_at ? iso(Math.min(now, Date.parse(s.refunded_at))) : until,
    will_renew: !ended && !s?.refunded_at && !s?.unsubscribe_detected_at && until !== null,
    status,
  };
}

/** Every Koko account an event may concern (a purchase, a restore that moved purchases, aliases). */
export function revenueCatUserIds(event: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  for (const k of ['app_user_id', 'original_app_user_id']) if (isUuid(event[k])) ids.add(String(event[k]).toLowerCase());
  for (const k of ['aliases', 'transferred_from', 'transferred_to']) {
    const v = event[k];
    if (Array.isArray(v)) for (const x of v) if (isUuid(x)) ids.add(x.toLowerCase());
  }
  return [...ids];   // anonymous ids ($RCAnonymousID:…) have no Koko account: the app reads those from RevenueCat itself
}

// ---------------------------------------------------------------------------------------------------------------
// Stripe (the website). Input: a Subscription object from a webhook or the API.
// ---------------------------------------------------------------------------------------------------------------
export type StripeSub = {
  id: string; status: string; customer: string | { id: string }; cancel_at_period_end?: boolean;
  current_period_end?: number | null; ended_at?: number | null; cancel_at?: number | null;
  items?: { data?: { current_period_end?: number | null; price?: { id?: string } }[] };
  metadata?: Record<string, string>;
};

export const stripeCustomerId = (s: StripeSub) => (typeof s.customer === 'string' ? s.customer : s.customer.id);

export function fromStripe(s: StripeSub, now = Date.now()): EntitlementRow {
  // the period end moved from the subscription to its items in newer API versions: read both
  const periodEnd = Math.max(s.current_period_end ?? 0, ...(s.items?.data ?? []).map(i => i.current_period_end ?? 0));
  const end = periodEnd ? periodEnd * 1000 : now;
  const live = ['active', 'trialing', 'past_due'].includes(s.status);
  const status: Status = s.status === 'past_due' ? 'billing_issue'
    : s.status === 'paused' ? 'paused'
    : !live ? 'expired'
    : s.cancel_at_period_end || s.cancel_at ? 'cancelled' : 'active';
  // not live (canceled, unpaid, incomplete…): Premium ends now, or when Stripe says it ended
  const until = live ? end : Math.min(now, s.ended_at ? s.ended_at * 1000 : now);
  return {
    source: 'stripe',
    external_id: s.id,
    store: 'stripe',
    product_id: s.items?.data?.[0]?.price?.id ?? null,
    active_until: iso(until),
    will_renew: live && !s.cancel_at_period_end && !s.cancel_at,
    status,
  };
}
