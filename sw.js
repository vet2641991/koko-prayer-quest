/* Offline support. App shell: network first (so updates arrive), cache as fallback.
   Media and audio: network first (corrections reach devices at once), cache as the offline fallback. */
const SHELL = 'koko-shell-v7', MEDIA = 'koko-media-v3';   // old caches are dropped on activate
const CORE = ['./', 'index.html', 'app.css?v=7', 'app.js?v=7', 'manifest.webmanifest', 'content/catalog.json',
  'media/koko-wave.png', 'media/koko-cheer.png', 'media/dhm-logo.png', 'media/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys()   // drop old app + audio caches so re-cut clips reach every device
  .then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== MEDIA).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const isMedia = /\/(audio|media)\//.test(u.pathname) && !/\.mp4$/.test(u.pathname);
  if (isMedia) {   // network first so a corrected clip is heard at once; the cached copy is only the offline fallback
    e.respondWith(caches.open(MEDIA).then(c => fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })
      .catch(async () => (await c.match(e.request)) || Response.error())));
  } else if (!/\.mp4$/.test(u.pathname)) {
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) caches.open(SHELL).then(c => c.put(e.request, r.clone())); return r; })
      .catch(() => caches.match(e.request)));
  }
});
