// Network first, so the app always opens with the latest files; the cache is only a fallback.
const CACHE = 'all-wrapped-v1';
const CACHEABLE = [self.location.origin, 'https://cdn.jsdelivr.net'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || !CACHEABLE.includes(url.origin)) return;
  // Our own files skip the browser's HTTP cache, so a new deploy shows up on the next open.
  const req = url.origin === self.location.origin ? new Request(e.request.url, { cache: 'no-cache' }) : e.request;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request)));
});
