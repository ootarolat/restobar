// sw.js — Service Worker for offline PWA support
const CACHE_NAME = 'restobar-v12';
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
  './js/auth.js',
  './js/app.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((resp) => {
          if (resp.ok && resp.type === 'basic') {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return resp;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
