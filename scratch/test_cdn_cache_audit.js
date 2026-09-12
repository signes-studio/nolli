/**
 * TEST AUTOMATIZADO DE AUDITORÍA CDN Y BLINDAJE ANTI-EGRESS
 * Verifica headers Cache-Control, Vercel-Cache-Tag, Cache-Tag y Rate Limiting
 * en todos los endpoints públicos de Nolli:
 * - api/obra.js
 * - api/arquitecto.js
 * - api/categoria.js
 * - api/ciudad.js
 * - api/sitemap.js
 * - api/_lib/cdnPurge.js (invalidación selectiva de tags y URLs por ID)
 */

function createMockRes() {
  const headers = {};
  return {
    statusCode: 200,
    headers,
    body: null,
    setHeader(key, val) {
      headers[key.toLowerCase()] = val;
      headers[key] = val;
    },
    getHeader(key) {
      return headers[key.toLowerCase()] || headers[key];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(content) {
      this.body = content;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function runCdnAudit() {
  console.log('================================================================');
  console.log('BATERÍA DE VERIFICACIÓN: AUDITORÍA DE CACHÉ CDN Y RATE LIMITING');
  console.log('Objetivo: Cero Egress restante en Supabase mediante Edge Caching');
  console.log('================================================================\n');

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${message}`);
    }
  }

  // -------------------------------------------------------------
  // TEST 1: api/obra.js (Fichas de Obra Individuales)
  // -------------------------------------------------------------
  console.log('--- TEST 1: api/obra.js (Fichas de Obra Individuales) ---');
  const obraHandler = require('../api/obra.js');

  // 1.1 Ficha no encontrada / ID inválido (debe devolver 404 con caché corto para evitar martilleo)
  const res404 = createMockRes();
  await obraHandler({ query: { id: 'inexistente-9999999' }, headers: { 'x-forwarded-for': '1.1.1.1' } }, res404);
  assert(res404.statusCode === 404, `Respuesta 404 ante obra inexistente (HTTP ${res404.statusCode})`);
  assert(res404.getHeader('cache-control')?.includes('s-maxage=600'), `Caché en 404 configurado para proteger Supabase (s-maxage=600): ${res404.getHeader('cache-control')}`);
  assert(res404.getHeader('vercel-cache-tag')?.includes('obra-404'), `Cache-Tag presente en 404: ${res404.getHeader('vercel-cache-tag')}`);

  // 1.2 Ficha existente: interceptamos fetch para simular retorno de obra real
  const originalFetch = global.fetch;
  const mockBuilding = {
    id: 'mad-01',
    nombre_obra: 'Edificio España',
    arquitecto: 'Otamendi Machimbarrena',
    año_construccion: 1953,
    categoria: 'racionalismo',
    place: 'Madrid, España',
    foto_url: 'https://photos.nollimap.app/visits/mad-01/foto.webp',
  };

  global.fetch = async (url) => {
    if (url.includes('/rest/v1/Buildings')) {
      return {
        ok: true,
        json: async () => [mockBuilding],
        headers: new Map([['content-range', '0-0/1']]),
      };
    }
    return originalFetch(url);
  };

  const res200 = createMockRes();
  await obraHandler({ query: { id: 'mad-01' }, headers: { 'x-forwarded-for': '1.1.1.1' } }, res200);

  assert(res200.statusCode === 200, `Respuesta 200 para obra existente (HTTP ${res200.statusCode})`);
  assert(res200.getHeader('cache-control') === 'public, s-maxage=86400, stale-while-revalidate=604800', `Cache-Control de 24h con 7 días de revalidación en edge: ${res200.getHeader('cache-control')}`);
  assert(res200.getHeader('vercel-cache-tag') === 'building-mad-01,obra-mad-01,catalog', `Vercel-Cache-Tag granular por ID: ${res200.getHeader('vercel-cache-tag')}`);
  assert(res200.getHeader('cache-tag') === 'building-mad-01,obra-mad-01,catalog', `Cache-Tag estándar para Cloudflare/CDN: ${res200.getHeader('cache-tag')}`);

  // -------------------------------------------------------------
  // TEST 2: api/arquitecto.js (Páginas de Agregación por Arquitecto)
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: api/arquitecto.js (Páginas de Arquitecto) ---');
  const arquitectoHandler = require('../api/arquitecto.js');
  const resArch = createMockRes();
  await arquitectoHandler({ query: { slug: 'antonio-palacios' }, headers: { 'x-forwarded-for': '2.2.2.2' } }, resArch);

  assert(resArch.statusCode === 200, `Respuesta 200 para arquitecto (HTTP ${resArch.statusCode})`);
  assert(resArch.getHeader('cache-control') === 'public, s-maxage=172800, stale-while-revalidate=604800', `Cache-Control de 48h con 7 días de revalidación: ${resArch.getHeader('cache-control')}`);
  assert(resArch.getHeader('vercel-cache-tag')?.includes('architect-'), `Vercel-Cache-Tag específico por arquitecto: ${resArch.getHeader('vercel-cache-tag')}`);
  assert(resArch.getHeader('cache-tag')?.includes('architect-'), `Cache-Tag estándar presente: ${resArch.getHeader('cache-tag')}`);

  // -------------------------------------------------------------
  // TEST 3: api/categoria.js (Páginas de Agregación por Categoría)
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: api/categoria.js (Páginas de Categoría) ---');
  const categoriaHandler = require('../api/categoria.js');
  const resCat = createMockRes();
  await categoriaHandler({ query: { slug: 'racionalismo' }, headers: { 'x-forwarded-for': '3.3.3.3' } }, resCat);

  assert(resCat.statusCode === 200, `Respuesta 200 para categoría (HTTP ${resCat.statusCode})`);
  assert(resCat.getHeader('cache-control') === 'public, s-maxage=172800, stale-while-revalidate=604800', `Cache-Control de 48h con 7 días de revalidación: ${resCat.getHeader('cache-control')}`);
  assert(resCat.getHeader('vercel-cache-tag') === 'category-racionalismo,category,catalog', `Vercel-Cache-Tag específico por categoría: ${resCat.getHeader('vercel-cache-tag')}`);

  // -------------------------------------------------------------
  // TEST 4: api/ciudad.js (Páginas de Agregación por Ciudad)
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: api/ciudad.js (Páginas de Ciudad) ---');
  const ciudadHandler = require('../api/ciudad.js');
  const resCity = createMockRes();
  await ciudadHandler({ query: { slug: 'madrid' }, headers: { 'x-forwarded-for': '4.4.4.4' } }, resCity);

  assert(resCity.statusCode === 200, `Respuesta 200 para ciudad (HTTP ${resCity.statusCode})`);
  assert(resCity.getHeader('cache-control') === 'public, s-maxage=172800, stale-while-revalidate=604800', `Cache-Control de 48h con 7 días de revalidación: ${resCity.getHeader('cache-control')}`);
  assert(resCity.getHeader('vercel-cache-tag')?.includes('city-'), `Vercel-Cache-Tag específico por ciudad: ${resCity.getHeader('vercel-cache-tag')}`);

  // -------------------------------------------------------------
  // TEST 5: api/sitemap.js (Sitemaps XML)
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: api/sitemap.js (Sitemaps XML) ---');
  const sitemapHandler = require('../api/sitemap.js');
  const resSitemap = createMockRes();
  await sitemapHandler({ query: { type: 'categories' }, headers: { 'x-forwarded-for': '5.5.5.5' } }, resSitemap);

  assert(resSitemap.statusCode === 200, `Respuesta 200 para sitemap (HTTP ${resSitemap.statusCode})`);
  assert(resSitemap.getHeader('cache-control') === 'public, s-maxage=86400, stale-while-revalidate=604800', `Cache-Control de 24h para sitemaps: ${resSitemap.getHeader('cache-control')}`);
  assert(resSitemap.getHeader('vercel-cache-tag')?.includes('sitemap'), `Vercel-Cache-Tag presente en sitemap: ${resSitemap.getHeader('vercel-cache-tag')}`);

  // -------------------------------------------------------------
  // TEST 6: Rate Limiting Defensivo por IP (Defensa en Profundidad)
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Rate Limiting Defensivo por IP ---');
  const spamIp = '99.99.99.99';
  let rateLimitHit = false;

  // Realizamos 65 peticiones con la misma IP (límite configurado: 60/min)
  for (let i = 0; i < 65; i++) {
    const resSpam = createMockRes();
    await obraHandler({ query: { id: 'mad-01' }, headers: { 'x-forwarded-for': spamIp } }, resSpam);
    if (resSpam.statusCode === 429) {
      rateLimitHit = true;
      assert(resSpam.getHeader('retry-after') !== undefined, `Cabecera Retry-After devuelta en HTTP 429: ${resSpam.getHeader('retry-after')}s`);
      assert(resSpam.getHeader('x-ratelimit-remaining') === '0', `Cabecera X-RateLimit-Remaining en 0`);
      break;
    }
  }
  assert(rateLimitHit, `Rate limiter activo bloquea tráfico abusivo con HTTP 429 ante cache MISS continuados.`);

  // -------------------------------------------------------------
  // TEST 7: Invalidación Granular de Caché CDN (api/_lib/cdnPurge.js)
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: Invalidación Granular de Caché CDN ---');
  const { purgeBuildingCdnCache } = require('../api/_lib/cdnPurge.js');

  // Simulamos llamadas con VERCEL_TOKEN activo
  process.env.VERCEL_TOKEN = 'mock_vercel_token';
  process.env.VERCEL_PROJECT_ID = 'mock_project';

  let capturedPurgePayload = null;
  global.fetch = async (url, options) => {
    if (url.includes('api.vercel.com/v1/edge-cache/invalidate-by-tags')) {
      capturedPurgePayload = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({}) };
    }
    return originalFetch(url, options);
  };

  await purgeBuildingCdnCache('mad-01', {
    architectSlug: 'otamendi-machimbarrena',
    categorySlug: 'racionalismo',
    citySlug: 'madrid',
  });

  assert(Array.isArray(capturedPurgePayload?.tags), `Purga envía array de tags`);
  assert(capturedPurgePayload.tags.includes('catalog'), `Incluye tag general 'catalog'`);
  assert(capturedPurgePayload.tags.includes('building-mad-01'), `Incluye tag específico 'building-mad-01'`);
  assert(capturedPurgePayload.tags.includes('architect-otamendi-machimbarrena'), `Incluye tag de arquitecto`);
  assert(capturedPurgePayload.tags.includes('category-racionalismo'), `Incluye tag de categoría`);
  assert(capturedPurgePayload.tags.includes('city-madrid'), `Incluye tag de ciudad`);

  // Restaurar fetch original
  global.fetch = originalFetch;

  console.log('\n================================================================');
  console.log(`RESULTADO FINAL DE LA AUDITORÍA: ${passedTests} / ${totalTests} PRUEBAS SUPERADAS`);
  console.log('================================================================');

  if (passedTests !== totalTests) {
    process.exitCode = 1;
  }
}

runCdnAudit().catch((err) => {
  console.error('Error crítico en el test de auditoría:', err);
  process.exitCode = 1;
});
