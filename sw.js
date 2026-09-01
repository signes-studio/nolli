const CACHE_NAME = 'nolli-shell-v16';
const APP_SHELL = [
  './',
  './index.html',
  './admin.html',
  './perfil.html',
  './public-profile.html',
  './landing.html',
  './legal.html',
  './css/base.css',
  './css/admin.css',
  './css/components.css',
  './css/legal.css',
  './css/map-hud.css',
  './css/panels.css',
  './css/profile.css',
  './js/admin.js',
  './js/api.js',
  './js/adminUI.js',
  './js/config.js',
  './js/exploreUI.js',
  './js/filtersUI.js',
  './js/icons.js',
  './js/main.js',
  './js/mapController.js',
  './js/mapData.js',
  './js/mobileBottomNav.js',
  './js/modalsUI.js',
  './js/myPlacesUI.js',
  './js/profile.js',
  './js/radarUI.js',
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
  if (!event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    fetch(new Request(event.request, { cache: 'no-store' }))
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
