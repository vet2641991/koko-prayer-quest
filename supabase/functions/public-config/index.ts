// GET — the public settings the website (koko.dhm-institute.com) needs for Koko Premium: the project URL and its
// publishable key (made to be public; every browser and app has it), and whether website subscriptions are open.
// Nothing secret can come out of here: the publishable key is checked to be one before it is sent.
import { cors, json } from '../_shared/parents.ts';

function publishableKey(): string | null {
  let key: string | undefined;
  try { key = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default; } catch { /* not set */ }
  key ??= Deno.env.get('SUPABASE_ANON_KEY') ?? undefined;
  if (!key) return null;
  if (key.startsWith('sb_publishable_')) return key;
  // a legacy anon JWT: send it only if its role really is anon
  try { return JSON.parse(atob(key.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon' ? key : null; } catch { return null; }
}

Deno.serve(req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return json(405, { error: 'GET only' });
  return json(200, {
    supabaseUrl: Deno.env.get('PUBLIC_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'),
    publishableKey: publishableKey(),
    stripe: Boolean(Deno.env.get('STRIPE_SECRET_KEY') && Deno.env.get('STRIPE_PRICE_ID')),
    portal: Deno.env.get('STRIPE_PORTAL_LOGIN_URL') || null,
  });
});
