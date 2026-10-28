// sw.js — Service Worker for offline PWA support.
// Estrategia NETWORK-FIRST para el app shell: siempre intenta traer la
// versión más reciente de la red; si no hay conexión, cae al cache.
// Esto evita quedarse con código viejo cuando hay internet.
const CACHE_NAME = 'restobar-v16';
const FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './css/style.css',
  './js/firebase-config.js',
  './js/firebase-init.js',
  './js/db.js',
  './js/utils.js',
  './js/store.js',
  './js/seed.js',
  './js/mesas.js',
  './js/carta.js',
  './js/comanda.js',
  './js/cuenta.js',
  './js/caja.js',
  './js/cocina.js',
  './js/reportes.js',
  './js/config.js',
  './js/mantenimiento.js',
  './js/auth.js',
  './js/app.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES))
  );
  // Activa el SW nuevo de inmediato, sin esperar a que cierren las pestañas
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Permite que la página pida activar el SW en espera (usado por app.js)
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// Solo gestionamos peticiones de nuestro mismo origen (app shell).
// Firebase, gstatic y otras URLs externas pasan directo a la red.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // deja pasar externas

  // NETWORK-FIRST: intenta la red; si funciona, actualiza el cache y
  // devuelve lo fresco. Si falla (sin conexión), usa el cache.
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return resp;
      })
      .catch(() =>
        caches.match(e.request).then((cached) => cached || caches.match('./index.html'))
      )
  );
});
