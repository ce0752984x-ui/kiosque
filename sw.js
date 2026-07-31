// sw.js – Service Worker avec stratégie Stale-While-Revalidate et clone sécurisé

const CACHE_NAME = 'kiosque-cache-v1';
const STATIC_ASSETS = [
  '/kiosque/',
  '/kiosque/index.html'
  // Ajoutez ici vos fichiers statiques (CSS, JS, icônes)
];

// Installation : pré-cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activation : nettoyage des anciens caches
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

// Interception des requêtes
self.addEventListener('fetch', event => {
  const request = event.request;

  // Stratégie pour les pages HTML (navigation)
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          // Clone obligatoire avant de mettre en cache
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
        // Mise à jour en arrière-plan (sans bloquer)
        fetch(request).then(networkResponse => {
          if (networkResponse.ok) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, networkResponse.clone());
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }

      // Pas dans le cache : réseau
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
