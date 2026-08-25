const CACHE_NAME = 'nolli-shell-v2';
const APP_SHELL = [
  './',
  './index.html',
  './css/base.css',
  './css/components.css',
  './css/map-hud.css',
  './css/panels.css',
  './js/api.js',
  './js/config.js',
  './js/filtersUI.js',
  './js/icons.js',
  './js/main.js',
  './js/mapController.js',
  './js/mapData.js',
  './js/modalsUI.js',
  './js/myPlacesUI.js',
  './js/searchUI.js',
  './js/sheetUI.js',
  './js/state.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames.filter((cacheName) => cacheName !== CACHE_NAME).map((cacheName) => caches.delete(cacheName)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});
