// sw.js — Improved offline-first PWA support for DC Riverside Chat (2026 edition)
// Version bump required when HTML/CSS/JS or manifest changes

const CACHE_NAME = 'service-line-v1';
  // ← increment this when you update files

const STATIC_ASSETS = [
  '/',                        // root → usually resolves to index.html
  '/login.html',
  '/index.html',
  '/announce.html',
  '/manifest.json',
  '/customer-192.png',
  '/customer-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  // Add these if you have them locally or want stronger offline
  // '/icons/icon-192-maskable.png',
  // '/icons/icon-512-maskable.png',
];

// Names of other caches we want to keep (if you ever add e.g. images cache, dynamic cache…)
const EXPECTED_CACHES = [CACHE_NAME];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Installing v' + CACHE_NAME + ' — caching core assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        // Skip waiting → new service worker activates immediately
        return self.skipWaiting();
      })
      .catch(err => console.error('[SW] Install failed:', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key => !EXPECTED_CACHES.includes(key))
            .map(key => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        )
      ),
      // Take control of all open clients immediately
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // ────────────────────────────────────────────────
  // 1. Google Apps Script API calls → always network-first + offline fallback response
  // ────────────────────────────────────────────────
  if (url.hostname.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Optional: could cache successful GET responses if they are cacheable
          // (most Apps Script endpoints are not cacheable due to Cache-Control)
          return response;
        })
        .catch(() => {
          // Return structured offline response that your frontend can understand
          return new Response(
            JSON.stringify({
              status: 'offline',
              offline: true,
              message: 'You are currently offline. Some features (sending messages, loading new content) are unavailable until you reconnect.'
            }),
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }

  // ────────────────────────────────────────────────
  // NEW: Let HTML pages & navigation requests try the network first
  //      (prevents serving stale login.html forever)
  // ────────────────────────────────────────────────
  if (event.request.mode === 'navigate' || 
      url.pathname.endsWith('.html') || 
      url.pathname === '/') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // ────────────────────────────────────────────────
  // 2. Everything else → cache-first + stale-while-revalidate pattern
  // ────────────────────────────────────────────────
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Return from cache if available (fast + offline support)
      if (cachedResponse) {
        // Background revalidation (stale-while-revalidate)
        fetch(event.request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseToCache);
              });
            }
          })
          .catch(() => {}); // silent fail — we already have cache

        return cachedResponse;
      }

      // No cache → go to network and cache successful response
      return fetch(event.request).then(networkResponse => {
        // Only cache valid GET responses
        if (
          !networkResponse ||
          networkResponse.status !== 200 ||
          event.request.method !== 'GET' ||
          networkResponse.type === 'opaque' // don't cache cross-origin opaque responses
        ) {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          // Prefer login if no user session, otherwise index
          // You could also return a custom offline.html if you create one
          return caches.match('/login.html')
            .then(r => r || caches.match('/index.html'))
            .then(r => r || new Response(
              '<h1>Offline</h1><p>Please reconnect to use the chat.</p>',
              { headers: { 'Content-Type': 'text/html' } }
            ));
        }

        // For other resources (images, etc.) — just fail silently or placeholder
        return new Response('', { status: 503 });
      });
    })
  );
});

// Optional: listen for periodicsync / sync events in the future
// (for background message sync — requires permission & registration)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-pending-messages') {
    event.waitUntil(syncPendingMessages());
  }
});

// Placeholder for future background sync logic
async function syncPendingMessages() {
  // You would read IndexedDB queue here and send via fetch
  console.log('[SW] Background sync triggered — messages pending');
}