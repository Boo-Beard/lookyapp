const CACHE_NAME = 'peeek-cache-v7';

const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/styles.css?v=8',
  '/app.js',
  '/app.js?v=8',
  '/manifest.json?v=5',
  '/peeek-icon.png?v=5',
  '/icons/icon-192.png?v=5',
  '/icons/icon-512.png?v=5',
  '/icons/apple-touch-icon.png?v=5',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? Promise.resolve() : caches.delete(k))))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  // Never cache API responses. Always go to network so portfolio scans reflect the latest on-chain state.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req));
    return;
  }

  const isRuntimeFreshAsset = url.pathname === '/styles.css' || url.pathname === '/app.js';
  const isHtmlShell = url.pathname === '/' || url.pathname === '/index.html';

  // For CSS/JS/HTML shell, prefer the network so updates apply immediately.
  if (isRuntimeFreshAsset || isHtmlShell) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          try {
            if (res && res.status === 200 && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
          } catch {}
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('/index.html')))
    );
    return;
  }

  // Default: cache-first for everything else.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Cache successful basic responses.
          try {
            if (res && res.status === 200 && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
          } catch {}
          return res;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});
