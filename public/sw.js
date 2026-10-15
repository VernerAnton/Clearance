// Clearance's service worker: makes the app installable and lets it open offline.
//
// Network first: when you're online you always get the newest version, straight
// from the server. Each response is also saved, and the saved copy is only used
// when the network fails (offline). The tutor (/api) is never saved: it needs
// the internet.
//
// Build: __BUILD_ID__
// (Replaced with the commit and build time by scripts/vite-plugin-build-info.ts.
// The browser only notices a new deploy when this file's bytes change, so this
// line is what makes the app's "a newer version is ready" prompt work.)
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
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

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
