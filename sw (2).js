/**
 * Service Worker — Kiosque PWA
 * Gère le cache hors-ligne et l'affichage des notifications système natives.
 */

const CACHE_NOM = 'kiosque-v2';

const RESSOURCES_STATIQUES = [
  '/kiosque/',
  '/kiosque/index.html',
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js'
];

// ── Installation ──────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NOM).then((cache) =>
      cache.addAll(RESSOURCES_STATIQUES).catch((err) =>
        console.warn('SW: ressources non mises en cache', err)
      )
    )
  );
  self.skipWaiting();
});

// ── Activation ────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cles) =>
      Promise.all(
        cles.filter((cle) => cle !== CACHE_NOM).map((cle) => caches.delete(cle))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch : réseau d'abord, cache en secours ──────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('firestore.googleapis.com') ||
      (event.request.url.includes('firebase') && event.request.url.includes('googleapis'))) {
    return; // Ne pas intercepter Firestore
  }

  event.respondWith(
    fetch(event.request)
      .then((reponse) => {
        if (reponse && reponse.status === 200 && event.request.method === 'GET') {
          caches.open(CACHE_NOM).then((cache) =>
            cache.put(event.request, reponse.clone())
          );
        }
        return reponse;
      })
      .catch(() =>
        caches.match(event.request).then((reponseCache) => {
          if (reponseCache) return reponseCache;
          if (event.request.mode === 'navigate') {
            return caches.match('/kiosque/index.html');
          }
        })
      )
  );
});

// ── Clic sur une notification → ouvrir le Kiosque ────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlCible = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/kiosque/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsOuverts) => {
      // Si le Kiosque est déjà ouvert dans un onglet, le mettre au premier plan
      for (const client of clientsOuverts) {
        if (client.url.includes('/kiosque/') && 'focus' in client) {
          return client.focus();
        }
      }
      // Sinon ouvrir un nouvel onglet
      if (clients.openWindow) {
        return clients.openWindow(urlCible);
      }
    })
  );
});
