const CACHE_NAME = 'birrgo-offline-v1';
const OFFLINE_URL = 'offline.html';

// Cache the offline fallback page on installation
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Safely request and cache the offline file
            return cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))
                .catch((err) => console.log("Offline asset caching failed: ", err));
        })
    );
    // Force the waiting service worker to become the active service worker immediately
    self.skipWaiting();
});

// Force active service worker activation immediately across all open tabs
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Intercept network failures for ALL navigation requests
self.addEventListener('fetch', (event) => {
    // We only want to intercept main page transitions (html pages)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => {
                // If network fails, serve your beautiful custom layout directly from cache
                return caches.match(OFFLINE_URL).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Emergency plain-text fallback if the cache somehow misses
                    return new Response('Connection lost. Please reconnect to continue.', {
                        headers: { 'Content-Type': 'text/html' }
                    });
                });
            })
        );
    }
});
