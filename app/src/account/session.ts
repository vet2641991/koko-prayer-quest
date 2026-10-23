// The parent's Koko account: email + 6-digit code, no password. Talks to Supabase Auth's REST API directly (no SDK):
// ask for a code (Edge Function parent-signin), verify it, refresh the session, sign out. The session stays on
// this device. A parent account is optional: it links Koko Premium across devices and with the website.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_KEY, SUPABASE_URL } from '../config';

export type Session = { userId: string; email: string; accessToken: string; refreshToken: string; expiresAt: number };
const KEY = 'koko-parent';
let current: Session | null = null, loaded = false;
const listeners = new Set<(s: Session | null) => void>();

export const accountsConfigured = () => Boolean(SUPABASE_KEY);
const headers = (token?: string) => ({ 'Content-Type': 'application/json', apikey: SUPABASE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) });

async function set(s: Session | null) {
  current = s;
  try { if (s) await AsyncStorage.setItem(KEY, JSON.stringify(s)); else await AsyncStorage.removeItem(KEY); } catch { /* best effort */ }
  listeners.forEach(l => l(s));
}
export function onSession(l: (s: Session | null) => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export async function loadSession(): Promise<Session | null> {
  if (!loaded) {
    loaded = true;
    try { const raw = await AsyncStorage.getItem(KEY); current = raw ? JSON.parse(raw) as Session : null; } catch { current = null; }
  }
  return current;
}

async function readError(r: Response, fallback: string) {
  const b = await r.json().catch(() => ({})) as { error?: string; msg?: string; error_description?: string };
  return b.error ?? b.msg ?? b.error_description ?? fallback;
}

/** Emails a 6-digit code to the parent (the account is created the first time). */
export async function requestCode(email: string): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/parent-signin`, { method: 'POST', headers: headers(), body: JSON.stringify({ email }) });
  if (!r.ok) throw new Error(await readError(r, 'The code could not be sent. Please try again.'));
}

function toSession(b: { access_token: string; refresh_token: string; expires_in: number; user: { id: string; email: string } }): Session {
  return { userId: b.user.id, email: b.user.email, accessToken: b.access_token, refreshToken: b.refresh_token, expiresAt: Date.now() + b.expires_in * 1000 };
}

export async function verifyCode(email: string, code: string): Promise<Session> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/verify`, { method: 'POST', headers: headers(), body: JSON.stringify({ type: 'email', email, token: code.trim() }) });
  if (!r.ok) throw new Error(r.status === 403 || r.status === 400 ? 'That code is not right or has expired. Ask for a new one.' : await readError(r, 'Could not sign in'));
  const s = toSession(await r.json());
  await set(s);
  return s;
}

/** A valid access token, refreshed when it is about to expire; null when signed out (or the session ended). */
export async function accessToken(): Promise<string | null> {
  const s = await loadSession();
  if (!s) return null;
  if (s.expiresAt - Date.now() > 60_000) return s.accessToken;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: headers(), body: JSON.stringify({ refresh_token: s.refreshToken }) })
    .catch(() => null);
  if (!r) return s.accessToken;               // offline: try with what we have
  if (!r.ok) { await set(null); return null; } // revoked or account deleted
  const next = toSession(await r.json());
  await set(next);
  return next.accessToken;
}

export async function signOut() {
  const s = await loadSession();
  if (s) await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: headers(s.accessToken) }).catch(() => {});
  await set(null);
}

/** Calls a parent-facing Edge Function with the session (when there is one). */
export async function callFunction<T>(name: string, body: unknown = {}): Promise<T> {
  const token = await accessToken();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: 'POST', headers: headers(token ?? undefined), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await readError(r, 'Something went wrong. Please try again.'));
  return await r.json() as T;
}

export type Access = { premium: boolean; until: string | null; will_renew: boolean; sources: string[] };
/** Koko Premium of the signed-in parent, from every source (website, App Store, Google Play). */
export async function fetchAccess(): Promise<Access | null> {
  const token = await accessToken();
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/my_access`, { method: 'POST', headers: headers(token), body: '{}' });
  return r.ok ? await r.json() as Access : null;
}

export async function deleteAccount() {
  await callFunction('parent-delete');
  await set(null);
}
