/**
 * Service Worker — Kiosque
 * Permet l'installation comme PWA et un fonctionnement hors-ligne basique.
 * Les données restent dans Firestore (sync cloud) ; le SW ne cache que
 * les ressources statiques (HTML, polices, Quill, Firebase SDK).
 */

const CACHE_NOM = 'kiosque-v1';

const RESSOURCES_STATIQUES = [
  '/kiosque/',
  '/kiosque/index.html',
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js'
];

// Installation : mise en cache des ressources statiques
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NOM).then((cache) => {
      return cache.addAll(RESSOURCES_STATIQUES).catch((err) => {
        console.warn('SW: certaines ressources n\'ont pas pu être mises en cache', err);
      });
    })
  );
  self.skipWaiting();
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cles) =>
      Promise.all(
        cles
          .filter((cle) => cle !== CACHE_NOM)
          .map((cle) => caches.delete(cle))
      )
    )
  );
  self.clients.claim();
});

// Interception des requêtes : réseau d'abord, cache en secours
self.addEventListener('fetch', (event) => {
  // Ne pas intercepter les requêtes Firestore (toujours en ligne)
  if (event.request.url.includes('firestore.googleapis.com') ||
      event.request.url.includes('firebase') && event.request.url.includes('googleapis')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((reponse) => {
        // Mettre à jour le cache avec la réponse fraîche
        if (reponse && reponse.status === 200 && event.request.method === 'GET') {
          const reponseClonee = reponse.clone();
          caches.open(CACHE_NOM).then((cache) => cache.put(event.request, reponseClonee));
        }
        return reponse;
      })
      .catch(() => {
        // Hors ligne : servir depuis le cache
        return caches.match(event.request).then((reponseCache) => {
          if (reponseCache) return reponseCache;
          // Pour les navigations, renvoyer la page principale
          if (event.request.mode === 'navigate') {
            return caches.match('/kiosque/index.html');
          }
        });
      })
  );
});
