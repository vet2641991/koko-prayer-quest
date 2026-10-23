// Shared by the parent-facing Edge Functions (sign-in, subscription, account) and the store webhooks.
// Parents call these from the phone app and from https://koko.dhm-institute.com, so any origin may call them; they
// carry no cookies, and anything personal requires the parent's own session token.
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2.118.0';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://koko.dhm-institute.com';

export const validEmail = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** The signed-in parent, from the Authorization header, or null (no header, or an expired/invalid token). */
export async function parentFrom(req: Request, db: SupabaseClient): Promise<User | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt || !jwt.includes('.')) return null;   // a publishable key is not a session
  const { data, error } = await db.auth.getUser(jwt);
  return error ? null : data.user;
}

/** Finds the account of an email address, or creates it (confirmed, no password: parents sign in with a code). */
export async function accountFor(db: SupabaseClient, email: string): Promise<string | null> {
  const addr = email.trim().toLowerCase();
  const found = await db.rpc('billing_user_by_email', { addr });
  if (typeof found.data === 'string') return found.data;
  const created = await db.auth.admin.createUser({ email: addr, email_confirm: true, user_metadata: { kind: 'parent' } });
  if (created.data.user) return created.data.user.id;
  const again = await db.rpc('billing_user_by_email', { addr });   // created by a parallel request
  return typeof again.data === 'string' ? again.data : null;
}

/** Records a webhook event; false if it was already handled (stores and Stripe retry and may send twice). */
export async function firstTime(db: SupabaseClient, provider: 'stripe' | 'revenuecat', id: string, type: string) {
  const { error } = await db.from('billing_events').insert({ provider, event_id: id, event_type: type });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw new Error(error.message);
}

/** Forgets an event whose handling failed, so the provider's retry is not skipped. */
export async function forget(db: SupabaseClient, provider: 'stripe' | 'revenuecat', id: string) {
  await db.from('billing_events').delete().eq('provider', provider).eq('event_id', id);
}
