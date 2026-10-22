// Web build: the browser's own HTTP cache does the caching (the PWA keeps its service worker for offline use).
import { remote } from '../config';

export const supportsOffline = false;

export async function readText(path: string, timeoutMs = 8000): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(remote(path), { signal: ctl.signal, cache: 'no-cache' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(t); }
}
export const mediaUri = (path: string) => remote(path);
export async function saveMedia(_paths: string[]): Promise<void> { /* nothing to do on the web */ }
export const isSaved = (_path: string) => false;
