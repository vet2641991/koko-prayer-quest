// POST { email } — a parent asks for a 6-digit sign-in code (Koko Premium on another device, or on the website).
// Sign-ups stay off for the whole project: this function creates the parent account (confirmed, no password)
// when it does not exist yet, then Supabase Auth emails the code. The answer is the same either way, so it does
// not reveal who has an account. The app then calls Supabase Auth's /verify with the code.
import { serviceClient } from '../_shared/admin.ts';
import { accountFor, cors, json, validEmail } from '../_shared/parents.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!validEmail(email)) return json(400, { error: 'Please type a valid email address' });

  const db = serviceClient();
  const { data: admin } = await db.from('admins').select('user_id').eq('email', email).maybeSingle();
  if (admin) return json(400, { error: 'This email belongs to a Koko admin. Please use another email for your family account.' });
  if (!(await accountFor(db, email))) return json(500, { error: 'Could not prepare your account. Please try again.' });

  const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) return json(error.status === 429 ? 429 : 502, { error: error.status === 429
    ? 'A code was sent a moment ago. Please wait a minute and try again.' : 'The code could not be sent. Please try again.' });
  return json(200, { ok: true });
});
