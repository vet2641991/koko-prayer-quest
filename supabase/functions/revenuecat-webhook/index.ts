// RevenueCat → Koko: keeps public.entitlements in step with App Store and Google Play subscriptions.
// RevenueCat sends the Authorization value set in its dashboard (REVENUECAT_WEBHOOK_AUTH). For each Koko account an
// event concerns, the current state is read back from RevenueCat's API (REVENUECAT_SECRET_KEY), so late or
// repeated events cannot undo a newer state. Purchases made before a parent signs in stay anonymous in RevenueCat
// (the app checks those itself) until the parent signs in and RevenueCat moves them to the account.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { serviceClient } from '../_shared/admin.ts';
import { fromRevenueCat, revenueCatUserIds, sameSecret, type RcSubscriber } from '../_shared/billing.ts';
import { firstTime, forget, json } from '../_shared/parents.ts';

const RC_API = Deno.env.get('REVENUECAT_API_URL') ?? 'https://api.revenuecat.com';

async function refresh(db: SupabaseClient, userId: string, apiKey: string) {
  const r = await fetch(`${RC_API}/v1/subscribers/${encodeURIComponent(userId)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!r.ok) throw new Error(`RevenueCat ${r.status}`);
  const row = fromRevenueCat(userId, ((await r.json()) as { subscriber: RcSubscriber }).subscriber);
  if (row) {
    const { error } = await db.from('entitlements').upsert({ user_id: userId, ...row }, { onConflict: 'source,external_id' });
    if (error && error.code !== '23503') throw new Error(error.message);   // 23503: no Koko account with this id
  } else {
    // nothing in RevenueCat any more (e.g. moved to another account by a restore): end what we had
    const now = new Date().toISOString();
    const { error } = await db.from('entitlements').update({ status: 'expired', will_renew: false, active_until: now })
      .eq('source', 'revenuecat').eq('external_id', userId).or(`active_until.is.null,active_until.gt."${now}"`);
    if (error) throw new Error(error.message);
  }
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '', apiKey = Deno.env.get('REVENUECAT_SECRET_KEY');
  if (!expected || !apiKey) return json(503, { error: 'RevenueCat is not configured' });
  const got = req.headers.get('Authorization') ?? '';
  if (!sameSecret(got, expected) && !sameSecret(got, `Bearer ${expected}`)) return json(401, { error: 'Unauthorized' });

  const body = await req.json().catch(() => null) as { event?: Record<string, unknown> } | null;
  const event = body?.event;
  if (!event || typeof event.id !== 'string') return json(400, { error: 'No event' });
  const db = serviceClient();
  if (!(await firstTime(db, 'revenuecat', event.id, String(event.type ?? '')))) return json(200, { ok: true, duplicate: true });
  try {
    for (const id of revenueCatUserIds(event)) await refresh(db, id, apiKey);
    return json(200, { ok: true });
  } catch (e) {
    await forget(db, 'revenuecat', event.id);
    console.error(event.type, event.id, e);
    return json(500, { error: 'Could not record this event' });
  }
});
