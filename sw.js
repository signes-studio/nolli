const CACHE_NAME = 'nolli-shell-v96';
const CATALOG_FRESHNESS_MINUTES = 60;
const CATALOG_CACHE_TTL_MS = CATALOG_FRESHNESS_MINUTES * 60 * 1000;
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
  './js/filterEngine.js',
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
  './js/workCard.js',
  './js/i18n.js',
  './locales/es.json',
  './locales/en.json',
  './locales/ca.json',
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
  const isStaticAsset = /^\/(?:css|js|icons|img|locales)\//.test(url.pathname) || /\.(?:webp|png|svg|ico|webmanifest|json)$/.test(url.pathname);

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

  // Estrategia Stale-While-Revalidate con control de frescura para /api/catalog (permite uso offline y evita descargas redundantes)
  if (url.pathname === '/api/catalog') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const [cachedResponse, timestampRes] = await Promise.all([
          (await cache.match(event.request)) || (await cache.match('/api/catalog')),
          cache.match('/api/catalog-timestamp'),
        ]);

        const fetchPromise = async () => {
          try {
            const networkResponse = await fetch(event.request);
            if (networkResponse && networkResponse.ok) {
          const clone1 = networkResponse.clone();
          const clone2 = networkResponse.clone();
          await cache.put(event.request, clone1);
          try {
            await cache.put('/api/catalog', clone2);
            } catch {}
            if (cachedResponse) return cachedResponse;
            throw err;
          }
        };

        if (cachedResponse) {
          let isStale = true;
          if (timestampRes) {
            try {
              const savedTime = Number(await timestampRes.text());
              if (Number.isFinite(savedTime) && (Date.now() - savedTime < CATALOG_CACHE_TTL_MS)) {
                isStale = false;
              }
            } catch {}
          }

          if (isStale) {
            event.waitUntil(fetchPromise().catch(() => undefined));
          }
          return cachedResponse;
        }

        return fetchPromise();
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
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;

        // Fallback para navegación offline en rutas con o sin prefijo (/en/, /ca/, etc.)
        if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
          const path = url.pathname;
          if (path.includes('/perfil')) {
            return (await caches.match('./perfil.html')) || (await caches.match('/perfil.html'));
          }
          if (path.includes('/itinerarios')) {
            return (await caches.match('./itinerarios.html')) || (await caches.match('/itinerarios.html'));
          }
          if (path.includes('/admin')) {
            return (await caches.match('./admin.html')) || (await caches.match('/admin.html'));
          }
          if (path.includes('/landing')) {
            return (await caches.match('./landing.html')) || (await caches.match('/landing.html'));
          }
          if (path.includes('/legal')) {
            return (await caches.match('./legal.html')) || (await caches.match('/legal.html'));
          }
          // Rutas principales /en/, /ca/, /obra/..., etc. -> index.html (SPA Shell)
          return (await caches.match('./index.html')) || (await caches.match('/index.html')) || (await caches.match('./'));
        }

        return undefined;
      }),
  );
});
