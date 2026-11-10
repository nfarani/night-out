// Offline support: a plan you've opened still works in the Underground. Kept deliberately
// simple, because a bad service worker sticks around for returning visitors:
//   pages, /p/<id> plans, API reads  network first, saved copy only when offline
//   venue and area data               saved copy at once, refreshed in the background
//   versioned CDN files (libs, fonts) saved copy forever (their URLs change per version)
//   everything else, and all POSTs    straight to the network, never cached
// Bump VERSION to drop every saved copy.

const VERSION = 'v1';
const SHELL = 'owlabout-shell-' + VERSION, DATA = 'owlabout-data-' + VERSION, LIBS = 'owlabout-libs-' + VERSION;
const PRECACHE = ['/', '/icon.svg', '/favicon.ico', '/manifest.webmanifest', '/data/areas.json', '/data/cities.json'];
const LIB_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('owlabout-') && ![SHELL, DATA, LIBS].includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req, cacheName, fallbackUrl){
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return (await cache.match(req)) || (fallbackUrl && await caches.match(fallbackUrl)) ||
      new Response('Offline', { status:503, headers:{ 'Content-Type':'text/plain' } });
  }
}
async function staleWhileRevalidate(req, cacheName){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return cached || (await fresh) || new Response('Offline', { status:503 });
}
async function cacheFirst(req, cacheName){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (req.mode === 'navigate') return e.respondWith(networkFirst(req, SHELL, '/'));
    if (url.pathname.startsWith('/data/')) return e.respondWith(staleWhileRevalidate(req, DATA));
    if (url.pathname.startsWith('/api/plans/') || url.pathname === '/api/signals') return e.respondWith(networkFirst(req, DATA));
    return;                                        // stats, curation, icons etc.: normal network
  }
  if (LIB_HOSTS.includes(url.hostname)) return e.respondWith(cacheFirst(req, LIBS));
  // Map tiles and anything else: normal network.
});
