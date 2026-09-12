/* =========================================================================
   API/SITEMAP.JS — Enrutador Unificado de Sitemaps XML para Nolli
   Soporta índice general y sitemaps específicos por query param (?type=)
   Cumple con el límite de 12 funciones Serverless del plan Hobby de Vercel.
   ========================================================================= */

const { getCategorySlugs } = require('./_lib/categories.js');
const { getMultilingualSitemapEntries, escapeXml } = require('./_lib/i18n.js');
const { slugify, extractCityName, isIgnoredArchitect } = require('./_lib/slugs.js');
const { createRateLimiter } = require('./_lib/rateLimiter.js');

const checkRateLimit = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 30 });

const SITE_URL = 'https://nollimap.app';
const FALLBACK_SUPABASE_URL = 'https://ldtfvpjigzvcagtciipn.supabase.co';
const FALLBACK_SUPABASE_KEY = 'sb_publishable_kYQ7Fa8nBsrkp1f8C4AuAg_4-5uBFm0';
const FALLBACK_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdGZ2cGppZ3p2Y2FndGNpaXBuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU3OTg2NywiZXhwIjoyMTAzMTU1ODY3fQ.iRn-X5EzmW9eoKqL5qdW3s6I7NfcLfnJRmXTNwjCNnY';

async function fetchAllArchitectSlugs() {
  const supabaseUrl = process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || FALLBACK_SERVICE_ROLE_KEY;
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
            const slug = slugify(name);
            if (slug && slug.length > 1 && !archMap.has(slug)) {
              archMap.set(slug, name);
            }
          }
        }
      }
    }

    if (data.length < pageSize) break;
    start += pageSize;
  }

  return [...archMap.keys()].sort();
}

async function fetchAllCitySlugs() {
  const supabaseUrl = process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || FALLBACK_SERVICE_ROLE_KEY;
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
        getMultilingualSitemapEntries('/itinerarios', today, 'weekly', '0.8', SITE_URL),
        getMultilingualSitemapEntries('/public-profile', today, 'weekly', '0.7', SITE_URL),
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

    // 6. Sitemaps de edificios obsoletos
    if (type === 'buildings') {
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      response.setHeader('X-Robots-Tag', 'noindex, nofollow');
      return response.status(404).send('Sitemap obsoleto: Las fichas individuales de obra (/obra/:id) están configuradas como noindex y han sido retiradas de los sitemaps.');
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