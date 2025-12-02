const CACHE_VERSION = "v3";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;

// Core app files (install required)
const APP_SHELL = [
  "/",
  "/studio.html",
  "/view.html",
  "/manifest.json",
  "/service-worker.js",
  "/customer-192.png",
  "/customer-512.png"
];

// ===== INSTALL =====
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ===== ACTIVATE =====
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (![STATIC_CACHE, DYNAMIC_CACHE, IMAGE_CACHE, API_CACHE].includes(key)) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// ===== FETCH HANDLER =====
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // HANDLE NAVIGATION (HTML)
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  // GOOGLE APPS SCRIPT API CACHE
  if (url.href.includes("script.google.com")) {
    event.respondWith(networkFirstAPI(request));
    return;
  }

  // IMAGES CACHE
  if (request.destination === "image") {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  // CSS, JS, FONTS
  if (["style", "script", "font"].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // DEFAULT FALLBACK STRATEGY
  event.respondWith(networkFirst(request));
});


// ===== STRATEGIES =====

// Network First (HTML pages, API)
async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(DYNAMIC_CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    return caches.match(request) || caches.match("/studio.html");
  }
}

// Network First API
async function networkFirstAPI(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(API_CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    return caches.match(request);
  }
}

// Cache First (Images)
async function cacheFirstImage(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const fresh = await fetch(request);
  const cache = await caches.open(IMAGE_CACHE);
  cache.put(request, fresh.clone());
  return fresh;
}

// Stale While Revalidate (CSS/JS)
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request).then(response => {
    return caches.open(DYNAMIC_CACHE).then(cache => {
      cache.put(request, response.clone());
      return response;
    });
  });

  return cached || network;
}


// ===== OFFLINE MESSAGE =====
self.addEventListener("fetch", event => {
  if (!navigator.onLine && event.request.mode === "navigate") {
    event.respondWith(
      new Response("<h2 style='text-align:center;padding:30px'>You are offline</h2>", {
        headers: { "Content-Type": "text/html" }
      })
    );
  }
});

