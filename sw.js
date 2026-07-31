// sw.js – Service Worker corrigé pour Kiosque

const CACHE_NAME = 'kiosque-cache-v1';
const STATIC_ASSETS = [
  '/kiosque/',
  '/kiosque/index.html',
  // Ajoutez ici tous les fichiers statiques que vous voulez mettre en cache
  // Exemple : '/kiosque/style.css', '/kiosque/script.js', etc.
];

// Installation : pré-cache des assets statiques
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activation : nettoyer les anciens caches
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

  // Stratégie pour les requêtes de navigation (pages HTML)
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // On tente d'abord le réseau
          const networkResponse = await fetch(request);
          // Clone avant de mettre en cache (car on va lire le corps)
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
          return networkResponse;
        } catch (error) {
          // Si le réseau échoue, on sert le cache
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // Fallback : page d'erreur (optionnelle)
          return new Response('Page non disponible hors ligne', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        }
      })()
    );
    return;
  }

  // Pour les autres requêtes (images, CSS, JS, etc.) : stratégie cache-first
  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        // On retourne la réponse du cache, et on met à jour en arrière-plan
        // sans consommer le corps de la réponse du cache.
        // On clone pour ne pas corrompre le cache.
        const fetchPromise = fetch(request).then(networkResponse => {
          // Mise à jour du cache avec le clone
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, networkResponse.clone());
          });
          return networkResponse;
        }).catch(() => {});
        // On ne bloque pas sur fetchPromise
        return cachedResponse;
      }

      // Pas dans le cache : on va chercher sur le réseau
      try {
        const networkResponse = await fetch(request);
        // Clone avant de mettre en cache
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
        return networkResponse;
      } catch (error) {
        // Erreur réseau, pas de cache -> retourne une erreur
        return new Response('Ressource non disponible', {
          status: 404,
          statusText: 'Not Found'
        });
      }
    })()
  );
});
