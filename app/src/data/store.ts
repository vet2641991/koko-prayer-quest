// Offline copy of the static site on the device (Android / iOS), under the app's document directory:
// content JSON, audio clips and posters, mirrored at the same paths as on the site. Nothing here is ever edited:
// files are downloaded byte for byte, and replaced only by a newer copy from the site (ETag changed), so a
// re-cut, re-approved clip reaches children the same way it does in the PWA.
import { Directory, File, Paths } from 'expo-file-system';
import { remote } from '../config';

const ROOT = new Directory(Paths.document, 'koko-site');
const ETAGS = new File(ROOT, 'etags.json');
let etags: Record<string, string> | null = null;

function fileFor(path: string): File {
  const parts = path.split('/').filter(p => p && p !== '..');
  return new File(ROOT, ...parts);
}
function ensureParent(path: string) {
  const parts = path.split('/').filter(p => p && p !== '..');
  new Directory(ROOT, ...parts.slice(0, -1)).create({ intermediates: true, idempotent: true });
}
async function loadEtags() {
  if (etags) return etags;
  try { etags = ETAGS.exists ? JSON.parse(await ETAGS.text()) : {}; } catch { etags = {}; }
  return etags!;
}
async function saveEtags() {
  try { ROOT.create({ intermediates: true, idempotent: true }); await ETAGS.write(JSON.stringify(etags ?? {})); } catch { /* best effort */ }
}

export const supportsOffline = true;

/** Network first (so updates arrive), the saved copy when offline. */
export async function readText(path: string, timeoutMs = 8000): Promise<string | null> {
  const f = fileFor(path);
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(remote(path), { signal: ctl.signal, headers: { 'Cache-Control': 'no-cache' } });
    clearTimeout(t);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();
    ensureParent(path);
    await f.write(text);
    return text;
  } catch {
    try { return f.exists ? await f.text() : null; } catch { return null; }
  }
}

/** A playable URI: the saved copy when there is one, otherwise the site (and it is saved for next time). */
export function mediaUri(path: string): string {
  const f = fileFor(path);
  if (f.exists) return f.uri;
  void saveMedia([path]);
  return remote(path);
}

const inflight = new Map<string, Promise<void>>();

/** Saves files for offline use. Already-saved files are re-checked with their ETag and replaced only if changed. */
export async function saveMedia(paths: string[], concurrency = 4): Promise<void> {
  const tags = await loadEtags();
  const queue = [...new Set(paths)];
  const worker = async () => {
    for (let path = queue.shift(); path; path = queue.shift()) {
      if (inflight.has(path)) { await inflight.get(path); continue; }
      const job = (async () => {
        const f = fileFor(path!);
        try {
          if (f.exists && tags[path!]) {
            const head = await fetch(remote(path!), { method: 'HEAD', headers: { 'Cache-Control': 'no-cache' } });
            const etag = head.headers.get('etag');
            if (head.ok && etag && etag === tags[path!]) return;   // unchanged
          }
          ensureParent(path!);
          const tmp = new File(f.parentDirectory, `.${f.name}.part`);
          const res = await fetch(remote(path!), { headers: { 'Cache-Control': 'no-cache' } });
          if (!res.ok) return;
          await tmp.write(new Uint8Array(await res.arrayBuffer()));
          if (f.exists) f.delete();
          await tmp.move(f);
          const etag = res.headers.get('etag');
          if (etag) tags[path!] = etag;
        } catch { /* offline: keep what we have */ }
      })();
      inflight.set(path!, job);
      await job;
      inflight.delete(path!);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  await saveEtags();
}

export function isSaved(path: string): boolean {
  try { return fileFor(path).exists; } catch { return false; }
}
