// The dashboard's only connection to the backend: Supabase with the PUBLISHABLE key (safe in a browser).
// Every permission is enforced by the database (RLS, guards, workflow functions); the UI only hides what would fail.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const configured = Boolean(url && key);
export const supabase = createClient(url ?? 'http://localhost:1', key ?? 'not-configured', {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Where the live app serves audio and media (for previews). */
export const LIVE = 'https://koko.dhm-institute.com';

/** Message of a Supabase/PostgREST error, readable by a person. */
export function errText(e: unknown): string {
  if (!e) return '';
  if (typeof e === 'string') return e;
  const o = e as { message?: string; details?: string; hint?: string };
  return [o.message, o.details, o.hint].filter(Boolean).join(' — ') || String(e);
}

/** Throws the Supabase error, so callers can use try/catch with one message helper. */
export function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}
