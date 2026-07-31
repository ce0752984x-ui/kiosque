// sw.js – Service Worker corrigé (ignore les requêtes non-GET)

const CACHE_NAME = 'kiosque-cache-v1';
const STATIC_ASSETS = [
  '/kiosque/',
  '/kiosque/index.html'
  // Ajoutez ici d'autres fichiers statiques si nécessaire
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  // ⚠️ Ignorer les requêtes non-GET (POST, PUT, DELETE, etc.)
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // Stratégie pour les pages HTML (navigation)
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
          return networkResponse;
        } catch (error) {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          return new Response('Page non disponible hors ligne', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        }
      })()
    );
    return;
  }

  // Autres ressources (images, CSS, JS) : cache-first
  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        fetch(request).then(networkResponse => {
          if (networkResponse.ok) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, networkResponse.clone());
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
        return networkResponse;
      } catch (error) {
        return new Response('Ressource non disponible', {
          status: 404,
          statusText: 'Not Found'
        });
      }
    })()
  );
});
