// Peeek! Service Worker - Offline Support & Caching
const CACHE_VERSION = 'peeek-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/mobile-gestures.js',
  '/styles.css',
  '/ticker.css',
  '/mobile-gestures.css',
  '/portfolio-score.css',
  '/allocation.css',
  '/wallet-holdings.css',
  '/share-modal.css',
  '/tooltip.css',
  '/manifest.json',
  '/peeek-icon.png'
];

// API endpoints to cache with TTL
const API_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
      })
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.error('[SW] Failed to cache static assets:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('peeek-') && name !== STATIC_CACHE && name !== DYNAMIC_CACHE && name !== API_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Handle different types of requests
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (isAPIRequest(url)) {
    event.respondWith(networkFirstWithCache(request, API_CACHE));
  } else if (isExternalAsset(url)) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
  } else {
    event.respondWith(networkFirst(request));
  }
});

// Cache-first strategy (for static assets)
async function cacheFirst(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    if (cached) {
      // Return cached version immediately
      return cached;
    }

    // If not in cache, fetch from network
    const response = await fetch(request);
    
    if (response.ok) {
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.error('[SW] Cache-first failed:', error);
    
    // Try to return cached version as fallback
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    
    // Return offline page or error
    return new Response('Offline - Asset not available', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({ 'Content-Type': 'text/plain' })
    });
  }
}

// Network-first strategy with cache fallback (for API requests)
async function networkFirstWithCache(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    
    try {
      const response = await fetch(request);
      
      if (response.ok) {
        // Clone and cache the response with timestamp
        const responseToCache = response.clone();
        const cachedResponse = new Response(responseToCache.body, {
          status: responseToCache.status,
          statusText: responseToCache.statusText,
          headers: new Headers(responseToCache.headers)
        });
        
        // Add timestamp header for TTL checking
        cachedResponse.headers.set('sw-cached-at', Date.now().toString());
        
        cache.put(request, cachedResponse);
      }
      
      return response;
    } catch (networkError) {
      console.log('[SW] Network failed, trying cache:', request.url);
      
      // Network failed, try cache
      const cached = await cache.match(request);
      
      if (cached) {
        // Check if cache is still valid (TTL)
        const cachedAt = cached.headers.get('sw-cached-at');
        if (cachedAt) {
          const age = Date.now() - parseInt(cachedAt, 10);
          if (age < API_CACHE_TTL) {
            console.log('[SW] Serving from cache (age:', Math.round(age / 1000), 's)');
            return cached;
          } else {
            console.log('[SW] Cache expired (age:', Math.round(age / 1000), 's)');
          }
        } else {
          // No timestamp, serve anyway when offline
          return cached;
        }
      }
      
      throw networkError;
    }
  } catch (error) {
    console.error('[SW] Network-first failed:', error);
    return new Response(JSON.stringify({ error: 'Offline - Data not available' }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({ 'Content-Type': 'application/json' })
    });
  }
}

// Network-first strategy (for dynamic content)
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    const cache = await caches.open(DYNAMIC_CACHE);
    const cached = await cache.match(request);
    
    if (cached) {
      return cached;
    }
    
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Helper: Check if request is for static asset
function isStaticAsset(url) {
  return url.origin === self.location.origin && (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.json') ||
    url.pathname === '/'
  );
}

// Helper: Check if request is for API
function isAPIRequest(url) {
  return url.hostname.includes('api.coingecko.com') ||
         url.hostname.includes('public-api.birdeye.so') ||
         url.hostname.includes('api.helius.xyz') ||
         url.hostname.includes('api.etherscan.io') ||
         url.hostname.includes('api.bscscan.com') ||
         url.hostname.includes('api.polygonscan.com');
}

// Helper: Check if request is for external asset (fonts, icons, etc.)
function isExternalAsset(url) {
  return url.hostname.includes('fonts.googleapis.com') ||
         url.hostname.includes('fonts.gstatic.com') ||
         url.hostname.includes('cdnjs.cloudflare.com') ||
         url.hostname.includes('cdn.jsdelivr.net') ||
         url.hostname.includes('cryptologos.cc');
}

// Background sync for failed requests
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-portfolio') {
    event.waitUntil(syncPortfolioData());
  }
});

async function syncPortfolioData() {
  try {
    // Notify clients to refresh data
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        timestamp: Date.now()
      });
    });
  } catch (error) {
    console.error('[SW] Sync failed:', error);
  }
}

// Listen for messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => caches.delete(name))
        );
      })
    );
  }
});

console.log('[SW] Service worker loaded');
