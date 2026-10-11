/* Offline support. App shell: network first (so updates arrive), cache as fallback.
   Media and audio: cache first (they never change once published). */
const SHELL = 'koko-shell-v2', MEDIA = 'koko-media-v1';
const CORE = ['./', 'index.html', 'app.css?v=2', 'app.js?v=2', 'manifest.webmanifest', 'content/catalog.json',
  'media/koko-wave.png', 'media/koko-cheer.png', 'media/dhm-logo.png', 'media/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const isMedia = /\/(audio|media)\//.test(u.pathname) && !/\.mp4$/.test(u.pathname);
  if (isMedia) {
    e.respondWith(caches.open(MEDIA).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
  } else if (!/\.mp4$/.test(u.pathname)) {
    e.respondWith(fetch(e.request).then(r => { if (r.ok) caches.open(SHELL).then(c => c.put(e.request, r.clone())); return r; })
      .catch(() => caches.match(e.request)));
  }
});
