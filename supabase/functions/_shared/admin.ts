// Shared by the Edge Functions: CORS for the dashboard, and "is the caller an active admin with permission X?".
// Runs on Supabase (Deno). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform; never sent to a browser.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

const allowedOrigin = Deno.env.get('ADMIN_ORIGIN') ?? '*';
export const cors = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};
export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Perm = 'can_edit_content' | 'can_publish' | 'can_approve_sacred' | 'can_manage_admins';

/** The caller's admin record if their JWT is valid, they are an active admin, and their role has `perm`. */
export async function requireAdmin(req: Request, db: SupabaseClient, perm: Perm) {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return { error: json(401, { error: 'Sign in first' }) };
  const { data: u, error } = await db.auth.getUser(jwt);
  if (error || !u.user) return { error: json(401, { error: 'Your session has expired: sign in again' }) };
  const { data: a } = await db.from('admins').select('user_id, email, display_name, active, role, roles(*)').eq('user_id', u.user.id).maybeSingle();
  const role = (a?.roles ?? null) as Record<Perm, boolean> | null;
  if (!a?.active || !role?.[perm]) return { error: json(403, { error: 'Your role does not allow this' }) };
  return { admin: a as { user_id: string; email: string; display_name: string } };
}
