const CACHE_NAME = 'nolli-shell-v69';
const APP_SHELL = [
  './',
  './index.html',
  './admin.html',
  './itinerarios.html',
  './perfil.html',
  './public-profile.html',
  './landing.html',
  './legal.html',
  './css/base.css',
  './css/admin.css',
  './css/components.css',
  './css/legal.css',
  './css/legal-components.css',
  './css/map-hud.css',
  './css/panels.css',
  './css/profile.css',
  './css/utilities.css',
  './js/lucide.min.js',
  './js/admin.js',
  './js/itinerarios.js',
  './js/itinerariesConfig.js',
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
  './js/renderUtils.js',
  './js/searchUI.js',
  './js/sheetUI.js',
  './js/cookieConsent.js',
  './js/siteFooter.js',
  './js/imageProxy.js',
  './js/state.js',
  './img/light-thumb.webp',
  './img/dark-thumb.webp',
  './img/hybrid-thumb.webp',
  './img/satellite-thumb.webp',
  './manifest.webmanifest',
  './icon.svg',
  './icon.png',
  './favicon.ico',
  './icons/logo.png',
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
  const url = new URL(event.request.url);
  const isStaticAsset = /^\/(?:css|js|icons|img)\//.test(url.pathname) || /\.(?:webp|png|svg|ico|webmanifest|json)$/.test(url.pathname);

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const network = fetch(event.request).then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          return response;
        });
        if (cached) {
          event.waitUntil(network.catch(() => undefined));
          return cached;
        }
        return network;
      }),
    );
    return;
  }

  // Estrategia Stale-While-Revalidate para /api/catalog (permite uso offline del catálogo y mapa)
  if (url.pathname === '/api/catalog') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch((err) => {
            if (cachedResponse) return cachedResponse;
            throw err;
          });

        if (cachedResponse) {
          event.waitUntil(fetchPromise.catch(() => undefined));
          return cachedResponse;
        }

        return fetchPromise;
      }),
    );
    return;
  }

  // Estrategia Network-First con fallback a cache para páginas y navegación
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
