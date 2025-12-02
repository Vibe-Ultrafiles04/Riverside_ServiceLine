const CACHE_NAME = 'social-app-cache-v1';
const urlsToCache = [
  '/', // Assumes view.html is the root index, or change to '/view.html'
  '/view.html',
  '/studio.html',
  'https://cdn.tailwindcss.com'
  // Note: External Google Drive links and the Apps Script URL should NOT be precached.
];

// 1. Install Event: Caching static assets
self.addEventListener('install', event => {
  console.log('[Service Worker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Pre-caching static assets');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. Activate Event: Cleaning up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activate');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Ensure the service worker takes control of the page immediately
  return self.clients.claim();
});

// 3. Fetch Event: Intercepting network requests
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Strategy 1: Cache-First for static assets (app shell)
  if (urlsToCache.includes(requestUrl.pathname) || requestUrl.hostname === 'cdn.tailwindcss.com') {
    event.respondWith(
      caches.match(event.request).then(response => {
        // Return cache hit, or fetch from network and cache for next time
        return response || fetch(event.request);
      })
    );
    return;
  }
  
  // Strategy 2: Network-Only for the Google Apps Script API endpoint
  // This content is dynamic and should always be fresh.
  if (requestUrl.host === 'script.google.com' && requestUrl.pathname.includes('/macros/s/')) {
    // If offline, the fetch will throw an error and fall back to the browser's default offline experience.
    return; 
  }

  // Strategy 3: Default (Network-First or Cache-First for others)
  // For images and other resources not explicitly handled: try network, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Check if we received a valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // IMPORTANT: Clone the response. A response is a stream and can only be consumed once.
        const responseToCache = response.clone();

        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          });

        return response;
      })
      .catch(() => {
        // Fallback to the cache if network fails
        return caches.match(event.request);
      })
  );
});