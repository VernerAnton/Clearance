// Clearance's service worker: makes the app installable and lets it open offline.
//
// Network first: when you're online you always get the newest version, straight
// from the server. Each response is also saved, and the saved copy is only used
// when the network fails (offline). The tutor (/api) is never saved: it needs
// the internet. Nor is /version.json: an old saved copy could announce a
// "newer version" that isn't there.
//
// Build: __BUILD_ID__
// (Replaced with the commit and build time by scripts/vite-plugin-build-info.ts.
// The browser only updates this worker when the file's bytes change, so this
// line is what keeps the offline copy current after a deploy.)
const CACHE = 'clearance-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/version.json') return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(async () => {
        const saved = await caches.match(request);
        if (saved) return saved;
        // Opening the app offline: fall back to the saved page.
        if (request.mode === 'navigate') return (await caches.match('/')) ?? Response.error();
        return Response.error();
      }),
  );
});
