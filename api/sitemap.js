/* =========================================================================
   API/SITEMAP.JS — Enrutador Unificado de Sitemaps XML para nolli.
   Soporta índice general y sitemaps específicos por query param (?type=)
   Cumple con el límite de 12 funciones Serverless del plan Hobby de Vercel.
   ========================================================================= */

const { getCategorySlugs } = require('./_lib/categories.js');
const { getMultilingualSitemapEntries, escapeXml } = require('./_lib/i18n.js');
const { slugify, extractCityName, isIgnoredArchitect, ARCHITECT_ALIASES } = require('./_lib/slugs.js');
const { createRateLimiter } = require('./_lib/rateLimiter.js');
const { getSupabaseConfig } = require('./_lib/supabaseEnv.js');

const checkRateLimit = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 30 });

const SITE_URL = 'https://nollimap.app';
const CHUNK_SIZE = 1000;

async function fetchTotalPublicBuildingsCount() {
  const { supabaseUrl, serviceRoleKey: supabaseKey } = getSupabaseConfig();
  if (!supabaseUrl || !supabaseKey) return 0;

  try {
    const params = new URLSearchParams({
      select: 'id',
      or: '(estado_revision.eq.publicada,estado_revision.is.null)',
      limit: '1',
    });

    const response = await fetch(`${supabaseUrl}/rest/v1/Buildings?${params.toString()}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: 'count=exact',
      },
    });

    if (!response.ok) return 0;

    const contentRange = response.headers.get('content-range');
    if (contentRange && contentRange.includes('/')) {
      const totalPart = contentRange.split('/')[1];
      if (totalPart && totalPart !== '*') {
        return parseInt(totalPart, 10) || 0;
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

async function fetchAllArchitectSlugs() {
  const { supabaseUrl, serviceRoleKey: supabaseKey } = getSupabaseConfig();
  const pageSize = 1000;
  const archMap = new Map();
  let start = 0;

  const params = new URLSearchParams({
    select: 'arquitecto',
    or: '(estado_revision.eq.publicada,estado_revision.is.null)',
    order: 'id.asc',
  });

  while (true) {
    const res = await fetch(`${supabaseUrl}/rest/v1/Buildings?${params.toString()}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Range: `${start}-${start + pageSize - 1}`,
      },
    });

    if (!res.ok) {
      if (res.status === 416) break;
      break;
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    for (const b of data) {
      if (b.arquitecto) {
        const names = b.arquitecto.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
        for (const name of names) {
          if (!isIgnoredArchitect(name)) {
            const rawSlug = slugify(name);
            const slug = (ARCHITECT_ALIASES && ARCHITECT_ALIASES[rawSlug]) || rawSlug;
            if (slug && slug.length > 1 && !isIgnoredArchitect(slug)) {
              archMap.set(slug, (archMap.get(slug) || 0) + 1);
            }
          }
        }
      }
    }

    if (data.length < pageSize) break;
    start += pageSize;
  }

  return [...archMap.entries()]
    .filter(([_, count]) => count > 0)
    .map(([slug]) => slug)
    .sort();
}

async function fetchAllCitySlugs() {
  const { supabaseUrl, serviceRoleKey: supabaseKey } = getSupabaseConfig();
  const pageSize = 1000;
  const cityMap = new Map();
  let start = 0;

  const params = new URLSearchParams({
    select: 'place',
    or: '(estado_revision.eq.publicada,estado_revision.is.null)',
    order: 'id.asc',
  });

  while (true) {
    const res = await fetch(`${supabaseUrl}/rest/v1/Buildings?${params.toString()}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Range: `${start}-${start + pageSize - 1}`,
      },
    });

    if (!res.ok) {
      if (res.status === 416) break;
      break;
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    for (const b of data) {
      if (b.place) {
        const city = extractCityName(b.place);
        if (city && city.length > 1) {
          const slug = slugify(city);
          if (slug && slug.length > 1 && !cityMap.has(slug)) {
            cityMap.set(slug, city);
          }
        }
      }
    }

    if (data.length < pageSize) break;
    start += pageSize;
  }

  return [...cityMap.keys()].sort();
}

module.exports = async (request, response) => {
  // 1. Rate limiting defensivo por IP en caso de cache MISS
  const rate = checkRateLimit(request, response);
  if (rate.limited) {
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return response.status(429).send('Límite de solicitudes de sitemaps excedido. Por favor, espera unos minutos.');
  }

  const type = String(request.query?.type || 'index').toLowerCase().trim();
  const today = new Date().toISOString().slice(0, 10);

  try {
    // 1. Sitemap Index (por defecto en /sitemap.xml)
    if (type === 'index') {
      const totalCount = await fetchTotalPublicBuildingsCount();
      const totalPages = Math.max(1, Math.ceil(totalCount / CHUNK_SIZE));

      const sitemaps = [
        '  <sitemap>',
        `    <loc>${escapeXml(`${SITE_URL}/sitemap-static.xml`)}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        '  </sitemap>',
        '  <sitemap>',
        `    <loc>${escapeXml(`${SITE_URL}/sitemap-categories.xml`)}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        '  </sitemap>',
        '  <sitemap>',
        `    <loc>${escapeXml(`${SITE_URL}/sitemap-architects.xml`)}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        '  </sitemap>',
        '  <sitemap>',
        `    <loc>${escapeXml(`${SITE_URL}/sitemap-cities.xml`)}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        '  </sitemap>',
      ];

      for (let page = 0; page < totalPages; page++) {
        sitemaps.push([
          '  <sitemap>',
          `    <loc>${escapeXml(`${SITE_URL}/sitemap-buildings-${page}.xml`)}</loc>`,
          `    <lastmod>${today}</lastmod>`,
          '  </sitemap>',
        ].join('\n'));
      }

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>',
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...sitemaps,
        '</sitemapindex>',
      ].join('\n');

      response.setHeader('Content-Type', 'application/xml; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      response.setHeader('Vercel-Cache-Tag', 'sitemap-index,sitemap,catalog');
      response.setHeader('Cache-Tag', 'sitemap-index,sitemap,catalog');
      return response.status(200).send(xml);
    }

    // 2. Sitemap de páginas estáticas
    if (type === 'static') {
      const staticEntries = [
        getMultilingualSitemapEntries('/', today, 'daily', '1.0', SITE_URL),
        getMultilingualSitemapEntries('/landing', today, 'monthly', '0.9', SITE_URL),
        getMultilingualSitemapEntries('/perfil', today, 'weekly', '0.8', SITE_URL),
        getMultilingualSitemapEntries('/legal', today, 'monthly', '0.3', SITE_URL),
      ];

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        ...staticEntries,
        '</urlset>',
      ].join('\n');

      response.setHeader('Content-Type', 'application/xml; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      response.setHeader('Vercel-Cache-Tag', 'sitemap-static,sitemap,catalog');
      response.setHeader('Cache-Tag', 'sitemap-static,sitemap,catalog');
      return response.status(200).send(xml);
    }

    // 3. Sitemap de Categorías
    if (type === 'categories') {
      const categorySlugs = getCategorySlugs();
      const categoryEntries = categorySlugs.map((slug) => (
        getMultilingualSitemapEntries(`/categoria/${encodeURIComponent(slug)}`, today, 'weekly', '0.8', SITE_URL)
      ));

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        ...categoryEntries,
        '</urlset>',
      ].join('\n');

      response.setHeader('Content-Type', 'application/xml; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      response.setHeader('Vercel-Cache-Tag', 'sitemap-categories,sitemap,catalog');
      response.setHeader('Cache-Tag', 'sitemap-categories,sitemap,catalog');
      return response.status(200).send(xml);
    }

    // 4. Sitemap de Arquitectos
    if (type === 'architects') {
      const architectSlugs = await fetchAllArchitectSlugs();
      const architectEntries = architectSlugs.map((slug) => (
        getMultilingualSitemapEntries(`/arquitecto/${encodeURIComponent(slug)}`, today, 'weekly', '0.8', SITE_URL)
      ));

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        ...architectEntries,
        '</urlset>',
      ].join('\n');

      response.setHeader('Content-Type', 'application/xml; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      response.setHeader('Vercel-Cache-Tag', 'sitemap-architects,sitemap,catalog');
      response.setHeader('Cache-Tag', 'sitemap-architects,sitemap,catalog');
      return response.status(200).send(xml);
    }

    // 5. Sitemap de Ciudades
    if (type === 'cities') {
      const citySlugs = await fetchAllCitySlugs();
      const cityEntries = citySlugs.map((slug) => (
        getMultilingualSitemapEntries(`/ciudad/${encodeURIComponent(slug)}`, today, 'weekly', '0.8', SITE_URL)
      ));

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        ...cityEntries,
        '</urlset>',
      ].join('\n');

      response.setHeader('Content-Type', 'application/xml; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      response.setHeader('Vercel-Cache-Tag', 'sitemap-cities,sitemap,catalog');
      response.setHeader('Cache-Tag', 'sitemap-cities,sitemap,catalog');
      return response.status(200).send(xml);
    }

    // 6. Sitemaps de edificios paginados (/sitemap-buildings-:page.xml)
    if (type === 'buildings') {
      const page = Math.max(0, parseInt(request.query?.page || '0', 10) || 0);
      const start = page * CHUNK_SIZE;
      const end = start + CHUNK_SIZE - 1;

      const { supabaseUrl, serviceRoleKey: supabaseKey } = getSupabaseConfig();
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Configuración de Supabase no disponible.');
      }

      const params = new URLSearchParams({
        select: 'id,updated_at',
        or: '(estado_revision.eq.publicada,estado_revision.is.null)',
        order: 'id.asc',
      });

      const res = await fetch(`${supabaseUrl}/rest/v1/Buildings?${params.toString()}`, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Range: `${start}-${end}`,
        },
      });

      if (!res.ok && res.status !== 416) {
        throw new Error(`Supabase devolvió ${res.status} al consultar sitemap de obras.`);
      }

      const buildings = res.status === 416 ? [] : await res.json().catch(() => []);

      const entries = (Array.isArray(buildings) ? buildings : []).map((b) => {
        const lastmod = b.updated_at ? new Date(b.updated_at).toISOString().slice(0, 10) : today;
        return getMultilingualSitemapEntries(`/obra/${encodeURIComponent(b.id)}`, lastmod, 'monthly', '0.6', SITE_URL);
      });

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        ...entries,
        '</urlset>',
      ].join('\n');

      response.setHeader('Content-Type', 'application/xml; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      response.setHeader('Vercel-Cache-Tag', `sitemap-buildings-${page},sitemap,catalog`);
      response.setHeader('Cache-Tag', `sitemap-buildings-${page},sitemap,catalog`);
      return response.status(200).send(xml);
    }

    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return response.status(400).send('Tipo de sitemap no reconocido.');
  } catch (error) {
    console.error(`No se pudo generar el sitemap (tipo: ${type}):`, error);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
    return response.status(500).send('No se pudo generar el sitemap.');
  }
};