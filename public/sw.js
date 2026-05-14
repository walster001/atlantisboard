// Service Worker for PWA functionality
// Bump version when fetch/caching strategy changes so old caches are purged on activate.
const STATIC_CACHE_NAME = 'atlantisboard-static-v8';
const DYNAMIC_CACHE_NAME = 'atlantisboard-dynamic-v8';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/index.js',
  '/index.css',
  '/manifest.json',
  '/icons/browserconfig.xml',
  '/icons/favicon.ico',
  '/icons/favicon-16x16.png',
  '/icons/favicon-32x32.png',
  '/icons/apple-touch-icon.png',
  '/icons/android-chrome-192x192.png',
  '/icons/android-chrome-512x512.png',
  '/icons/safari-pinned-tab.svg',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      // Use Promise.allSettled to ensure all promises are handled, even if some fail
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          fetch(url).then((response) => {
            if (!response.ok) {
              console.warn(`Failed to cache ${url}: ${response.statusText}`);
              return Promise.reject(new Error(`Failed to cache ${url}`));
            }
            return cache.put(url, response);
          }).catch((error) => {
            console.warn(`Failed to fetch and cache ${url}:`, error);
            return Promise.reject(error);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE_NAME && name !== DYNAMIC_CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Local dev: do not intercept — avoids stale SW fighting HMR, transient fetch
  // failures, and confusing errors while the backend restarts.
  if (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]'
  ) {
    return;
  }

  // Do not intercept API traffic. Let the browser handle `/api/*` directly.
  // Intercepting here caused transient `fetch()` failures (e.g. after bfcache
  // restore, dev reloads) to become synthetic 503 responses and broke PUT/POST.
  // Offline API behavior is handled by the app (Dexie / queue), not SW caching.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // App shell assets (fixed URLs like /index.js) — network-first so deploys show up on normal refresh;
  // cache is updated after a successful fetch and used only when offline.
  if (
    request.method === 'GET' &&
    (url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.jpg') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.ico') ||
      url.pathname.endsWith('.xml') ||
      url.pathname.endsWith('.webmanifest') ||
      url.pathname.endsWith('.woff') ||
      url.pathname.endsWith('.woff2'))
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone).catch((error) => {
                console.error(`Failed to cache static asset ${request.url}:`, error);
              });
            });
          }
          return response;
        })
        .catch((error) => {
          console.error(`Network error for static asset ${request.url}:`, error);
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response(null, { status: 503, statusText: 'Service Unavailable' });
          });
        })
    );
    return;
  }

  // HTML pages - network first
  if (request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone).catch((error) => {
                console.error(`Failed to cache HTML page ${request.url}:`, error);
              });
            });
          }
          return response;
        })
        .catch((error) => {
          console.error(`Network error for HTML page ${request.url}:`, error);
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return caches.match('/index.html').then((indexHtml) => {
              if (indexHtml) {
                return indexHtml;
              }
              return new Response('Offline', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
              });
            });
          });
        })
    );
    return;
  }

  // Default - network first, only for GET requests
  if (request.method === 'GET') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone).catch((error) => {
                console.error(`Failed to cache default request ${request.url}:`, error);
              });
            });
          }
          return response;
        })
        .catch((error) => {
          console.error(`Network error for default request ${request.url}:`, error);
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response(null, { status: 503, statusText: 'Service Unavailable' });
          });
        })
    );
  } else {
    // For non-GET requests, just fetch without caching
    event.respondWith(fetch(request));
  }
});
