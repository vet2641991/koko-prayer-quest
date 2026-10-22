// POST { email, display_name, role } — owner only. Creates the auth account (confirmed, no password yet) and the admins
// row. There is no self-signup anywhere: this is the only way in. The new admin sets a password with
// "Forgot your password?" on the dashboard's sign-in page.
import { cors, json, requireAdmin, serviceClient } from '../_shared/admin.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const db = serviceClient();
  const who = await requireAdmin(req, db, 'can_manage_admins');
  if (who.error) return who.error;

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const display_name = String(body.display_name ?? '').trim();
  const role = String(body.role ?? 'editor');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !display_name) return json(400, { error: 'An email and a name are needed' });
  const { data: r } = await db.from('roles').select('id').eq('id', role).maybeSingle();
  if (!r) return json(400, { error: `Unknown role ${role}` });

  // find the account, or create it (confirmed, without a password)
  let userId: string | null = null;
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  if (created.data.user) userId = created.data.user.id;
  else {
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
      userId = data.users.find(u => u.email?.toLowerCase() === email)?.id ?? null;
      if (data.users.length < 200) break;
    }
  }
  if (!userId) return json(500, { error: created.error?.message ?? 'Could not create the account' });

  const { error } = await db.from('admins').insert({ user_id: userId, email, display_name, role, created_by: who.admin!.user_id });
  if (error) return json(409, { error: error.code === '23505' ? 'This person is already an admin' : error.message });
  return json(200, { ok: true, message: `${email} can now set a password with "Forgot your password?" on the sign-in page.` });
});
