/* =========================================================================
   API/ARQUITECTO.JS — Página de Agregación por Arquitecto (SSR)
   ========================================================================= */

const { categoryLabel } = require('./_lib/categories.js');
const { detectServerLanguage, getLangPrefix, getSSRText, getHreflangTags, getOgLocaleTags } = require('./_lib/i18n.js');
const { slugify, slugToRegex, extractCityName, escapeHtml, getOptimizedUrl } = require('./_lib/slugs.js');
const { createRateLimiter } = require('./_lib/rateLimiter.js');

const checkRateLimit = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 60 });

const SITE_URL = 'https://nollimap.app';
const PAGE_SIZE = 50;
const FALLBACK_SUPABASE_URL = 'https://ldtfvpjigzvcagtciipn.supabase.co';
const FALLBACK_SUPABASE_KEY = 'sb_publishable_kYQ7Fa8nBsrkp1f8C4AuAg_4-5uBFm0';
const FALLBACK_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdGZ2cGppZ3p2Y2FndGNpaXBuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU3OTg2NywiZXhwIjoyMTAzMTU1ODY3fQ.iRn-X5EzmW9eoKqL5qdW3s6I7NfcLfnJRmXTNwjCNnY';

async function fetchArchitectData(rawInput, page) {
  const supabaseUrl = process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || FALLBACK_SERVICE_ROLE_KEY;

  const cleanSlug = slugify(rawInput);
  const regex = slugToRegex(cleanSlug);

  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE - 1;

  // 1. Consulta paginada para las tarjetas de la página actual
  const pageParams = new URLSearchParams({
    select: 'id,nombre_obra,arquitecto,año_construccion,place,foto_url,categoria,latitud,longitud',
    arquitecto: `imatch.${regex}`,
    or: '(estado_revision.eq.publicada,estado_revision.is.null)',
    order: 'año_construccion.desc.nullslast,id.asc',
  });

  // 2. Consulta ligera para enlazado cruzado (ciudades y categorías)
  const metaParams = new URLSearchParams({
    select: 'arquitecto,place,categoria,año_construccion',
    arquitecto: `imatch.${regex}`,
    or: '(estado_revision.eq.publicada,estado_revision.is.null)',
    limit: '300',
  });

  const [pageRes, metaRes] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/Buildings?${pageParams}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: 'count=exact',
        Range: `${start}-${end}`,
      },
    }),
    fetch(`${supabaseUrl}/rest/v1/Buildings?${metaParams}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }),
  ]);

  if (!pageRes.ok) {
    throw new Error(`Supabase devolvió ${pageRes.status} al consultar arquitecto.`);
  }

  let totalCount = 0;
  const contentRange = pageRes.headers.get('content-range');
  if (contentRange && contentRange.includes('/')) {
    const totalPart = contentRange.split('/')[1];
    if (totalPart && totalPart !== '*') {
      totalCount = parseInt(totalPart, 10) || 0;
    }
  }

  const buildings = await pageRes.json();
  if (!totalCount) totalCount = buildings.length;

  const allMetadata = metaRes.ok ? await metaRes.json() : buildings;

  // Determinar nombre canónico del arquitecto más frecuente en los registros
  const nameCounts = new Map();
  const cityMap = new Map();
  const catMap = new Map();
  const years = [];

  allMetadata.forEach((b) => {
    if (b.arquitecto) {
      const archName = b.arquitecto.trim();
      nameCounts.set(archName, (nameCounts.get(archName) || 0) + 1);
    }
    if (b.place) {
      const city = extractCityName(b.place);
      const cSlug = slugify(city);
      if (cSlug && cSlug.length > 1) {
        if (!cityMap.has(cSlug)) {
          cityMap.set(cSlug, { name: city, count: 1 });
        } else {
          cityMap.get(cSlug).count++;
        }
      }
    }
    if (b.categoria) {
      catMap.set(b.categoria, (catMap.get(b.categoria) || 0) + 1);
    }
    if (b.año_construccion) {
      const y = parseInt(b.año_construccion, 10);
      if (y > 1000 && y < 2100) years.push(y);
    }
  });

  // Ordenar nombre canónico
  const sortedNames = [...nameCounts.entries()].sort((a, b) => b[1] - a[1]);
  const canonicalName = sortedNames.length > 0 ? sortedNames[0][0] : rawInput;
  const canonicalSlug = slugify(canonicalName) || cleanSlug;

  // Top ciudades (hasta 12)
  const topCities = [...cityMap.entries()]
    .map(([slug, data]) => ({ slug, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // Categorías presentes
  const categoriesList = [...catMap.entries()]
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count);

  let activeYears = '';
  if (years.length > 0) {
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    activeYears = minYear === maxYear ? `${minYear}` : `${minYear} – ${maxYear}`;
  }

  return {
    buildings,
    totalCount,
    canonicalName,
    canonicalSlug,
    topCities,
    categoriesList,
    activeYears,
  };
}

function renderArchitectPage(data, page, lang = 'es') {
  const {
    buildings,
    totalCount,
    canonicalName,
    canonicalSlug,
    topCities,
    categoriesList,
    activeYears,
  } = data;

  const prefix = getLangPrefix(lang);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageParam = page > 1 ? `?page=${page}` : '';
  const canonicalUrl = `${SITE_URL}/arquitecto/${encodeURIComponent(canonicalSlug)}${pageParam}`;
  const isIndexable = lang === 'es';

  const title = getSSRText('architect_title', lang, { nombre: canonicalName });
  const description = getSSRText('architect_desc', lang, {
    nombre: canonicalName,
    count: totalCount,
  });

  // Imagen para Open Graph: primera obra con foto de calidad, o logotipo
  const heroBuilding = buildings.find((b) => b.foto_url);
  const ogImage = heroBuilding ? getOptimizedUrl(heroBuilding.foto_url, 1200) : `${SITE_URL}/icons/logo.png`;

  // Renderizado de tarjetas de obra
  const cardsHtml = buildings.map((b) => {
    const catLabel = categoryLabel(b.categoria, lang);
    const metaItems = [b.place, b.año_construccion].filter(Boolean).join(' · ');
    return `
      <article class="work-card">
        <a href="${SITE_URL}${prefix}/obra/${encodeURIComponent(b.id)}" class="card-link">
          ${b.foto_url
            ? `<img class="card-img" src="${escapeHtml(getOptimizedUrl(b.foto_url, 480))}" alt="${escapeHtml(b.nombre_obra)}" loading="lazy" decoding="async">`
            : `<div class="card-img-placeholder"><span class="card-tag">${escapeHtml(catLabel)}</span></div>`
          }
          <div class="card-body">
            <h2 class="card-title">${escapeHtml(b.nombre_obra)}</h2>
            ${b.categoria ? `<p class="card-category">${escapeHtml(catLabel)}</p>` : ''}
            ${metaItems ? `<p class="card-meta">${escapeHtml(metaItems)}</p>` : ''}
          </div>
        </a>
      </article>
    `;
  }).join('');

  // Enlazado cruzado a ciudades
  const citiesChipsHtml = topCities.map((c) => `
    <a href="${SITE_URL}${prefix}/ciudad/${encodeURIComponent(c.slug)}" class="chip">
      ${escapeHtml(c.name)} <span class="chip-count">${c.count}</span>
    </a>
  `).join('');

  // Enlazado cruzado a categorías
  const categoriesChipsHtml = categoriesList.map((c) => `
    <a href="${SITE_URL}${prefix}/categoria/${encodeURIComponent(c.slug)}" class="chip">
      ${escapeHtml(categoryLabel(c.slug, lang))} <span class="chip-count">${c.count}</span>
    </a>
  `).join('');

  // Datos estructurados JSON-LD ItemList con LandmarksOrHistoricalBuildings / Place
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: getSSRText('architect_page_name', lang, { nombre: canonicalName }),
    description,
    url: canonicalUrl,
    about: {
      '@type': 'Person',
      name: canonicalName,
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: buildings.length,
      itemListElement: buildings.map((b, idx) => {
        const itemObj = {
          '@type': ['Place', 'LandmarksOrHistoricalBuildings'],
          name: b.nombre_obra,
          description: `Obra arquitectónica proyectada por ${canonicalName}${b.place ? ` en ${b.place}` : ''}${b.año_construccion ? ` (${b.año_construccion})` : ''}.`,
          url: `${SITE_URL}${prefix}/obra/${encodeURIComponent(b.id)}`,
        };
        if (b.foto_url) {
          itemObj.image = getOptimizedUrl(b.foto_url, 800);
        }
        if (b.latitud && b.longitud) {
          itemObj.geo = {
            '@type': 'GeoCoordinates',
            latitude: Number(b.latitud),
            longitude: Number(b.longitud),
          };
        }
        if (b.place) {
          itemObj.address = {
            '@type': 'PostalAddress',
            addressLocality: b.place,
          };
        }
        return {
          '@type': 'ListItem',
          position: (page - 1) * PAGE_SIZE + idx + 1,
          item: itemObj,
        };
      }),
    },
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'nolli.',
        item: `${SITE_URL}${prefix}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: getSSRText('breadcrumb_architects', lang),
        item: `${SITE_URL}${prefix}/`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: canonicalName,
        item: canonicalUrl,
      },
    ],
  };

  const schemaJson = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
  const breadcrumbJson = JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="${lang}">
<head>
  <base href="/">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${isIndexable ? 'index, follow' : 'noindex, follow'}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="nolli.">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  ${getOgLocaleTags(lang)}
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/png" sizes="48x48" href="${SITE_URL}/icon.png">
  <link rel="icon" type="image/png" sizes="192x192" href="${SITE_URL}/icons/icon-192.png">
  <link rel="apple-touch-icon" href="${SITE_URL}/icons/icon-192.png">
  <link rel="shortcut icon" href="${SITE_URL}/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://wsrv.nl" crossorigin>
  <link rel="dns-prefetch" href="https://wsrv.nl">
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=League+Spartan:wght@700;800;900&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=League+Spartan:wght@700;800;900&display=swap">
  </noscript>
  <script type="application/ld+json">${schemaJson}</script>
  <script type="application/ld+json">${breadcrumbJson}</script>
  <style>
    :root {
      --bg: #F8F1DF;
      --bg-panel: #F8F1DF;
      --bg-elevated: #F0E9D2;
      --ink: #141411;
      --ink-dim: #6B6B6B;
      --border: #D8D6CE;
      --border-strong: #141411;
      --brand: #E95C0C;
      --brand-yellow: #E5B800;
      --font-display: 'League Spartan', sans-serif;
      --font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      --space-1: 8px;
      --space-2: 16px;
      --space-3: 24px;
      --space-4: 32px;
      --space-6: 48px;
      --space-8: 64px;
      --border-width-hairline: 1px;
      --border-width-strong: 2px;
      --shadow-hard: 4px 4px 0 var(--ink);
      --shadow-hard-sm: 2px 2px 0 var(--ink);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font-body); font-size: 16px; line-height: 1.5; }
    .page { width: min(100% - var(--space-4), 1160px); margin: 0 auto; padding: var(--space-4) 0 var(--space-8); }
    .site-header { display: flex; align-items: baseline; gap: var(--space-1); padding-bottom: var(--space-2); border-bottom: var(--border-width-strong) solid var(--border-strong); color: var(--ink-dim); font-size: 12px; text-transform: uppercase; }
    .site-header a { color: var(--brand); font-family: var(--font-display); font-size: 24px; font-weight: 900; letter-spacing: -0.02em; text-decoration: none; text-transform: lowercase; }
    .breadcrumb-nav { margin-top: var(--space-2); }
    .breadcrumb-list { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); list-style: none; margin: 0; padding: 0; font-family: var(--font-display); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-dim); }
    .breadcrumb-item a { color: var(--ink-dim); text-decoration: none; border-bottom: 1px solid transparent; }
    .breadcrumb-item a:hover { color: var(--brand); border-bottom-color: var(--brand); }
    .breadcrumb-separator { color: var(--border-strong); user-select: none; }
    .breadcrumb-item.active { color: var(--ink); }
    .hub-header { margin: var(--space-4) 0 var(--space-4); }
    .hub-badge { display: inline-block; padding: 4px 10px; background: var(--ink); color: var(--bg); font-family: var(--font-display); font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; margin-bottom: var(--space-2); }
    .hub-title { margin: 0; font-family: var(--font-display); font-size: clamp(34px, 5.5vw, 60px); font-weight: 900; letter-spacing: -0.03em; line-height: .95; text-transform: uppercase; }
    .hub-subtitle { margin: var(--space-2) 0 var(--space-3); color: var(--ink-dim); font-size: 15px; font-weight: 500; }
    .hub-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }
    .btn-action-primary { display: inline-flex; align-items: center; gap: 8px; padding: 12px 20px; background: var(--brand); color: #fff; text-decoration: none; font-family: var(--font-display); font-size: 13px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; border: var(--border-width-strong) solid var(--border-strong); transition: transform .15s ease, box-shadow .15s ease; }
    .btn-action-primary:hover { transform: translate(-2px, -2px); box-shadow: var(--shadow-hard); color: #fff; }
    .cross-links-section { margin-top: var(--space-4); padding: var(--space-3); background: var(--bg-elevated); border: var(--border-width-strong) solid var(--border-strong); }
    .cross-links-title { margin: 0 0 var(--space-2); font-family: var(--font-display); font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: var(--ink); }
    .chips-group { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: var(--space-2); }
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: var(--bg); border: var(--border-width-hairline) solid var(--border-strong); color: var(--ink); text-decoration: none; font-family: var(--font-display); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; transition: transform .1s ease, box-shadow .1s ease; }
    .chip:hover { transform: translate(-1px, -1px); box-shadow: var(--shadow-hard-sm); border-color: var(--brand); color: var(--brand); }
    .chip-count { font-size: 10px; background: var(--ink); color: var(--bg); padding: 1px 5px; border-radius: 2px; }
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-3); margin-top: var(--space-4); }
    .work-card { background: var(--bg-elevated); border: var(--border-width-strong) solid var(--border-strong); transition: transform 0.15s ease, box-shadow 0.15s ease; display: flex; flex-direction: column; }
    .work-card:hover { transform: translate(-2px, -2px); box-shadow: var(--shadow-hard); }
    .card-link { color: inherit; text-decoration: none; display: flex; flex-direction: column; height: 100%; }
    .card-img { width: 100%; height: 180px; object-fit: cover; border-bottom: var(--border-width-strong) solid var(--border-strong); background: var(--border); }
    .card-img-placeholder { width: 100%; height: 180px; background: var(--bg); border-bottom: var(--border-width-strong) solid var(--border-strong); display: flex; align-items: center; justify-content: center; }
    .card-tag { font-family: var(--font-display); font-size: 11px; font-weight: 800; letter-spacing: .06em; color: var(--ink-dim); text-transform: uppercase; }
    .card-body { padding: var(--space-2); flex: 1; display: flex; flex-direction: column; }
    .card-title { margin: 0 0 var(--space-1); font-family: var(--font-display); font-size: 16px; font-weight: 800; line-height: 1.2; text-transform: uppercase; color: var(--ink); }
    .card-category { margin: 0 0 var(--space-1); font-size: 12px; font-weight: 700; color: var(--brand); text-transform: uppercase; font-family: var(--font-display); letter-spacing: 0.04em; }
    .card-meta { margin: auto 0 0; font-size: 12px; color: var(--ink-dim); font-weight: 500; }
    .pagination-wrap { display: flex; align-items: center; justify-content: space-between; margin-top: var(--space-6); padding-top: var(--space-3); border-top: var(--border-width-strong) solid var(--border-strong); font-family: var(--font-display); font-size: 13px; font-weight: 800; }
    .btn-page { display: inline-flex; align-items: center; padding: 10px 18px; background: var(--ink); color: var(--bg); text-decoration: none; text-transform: uppercase; border: var(--border-width-hairline) solid var(--border-strong); transition: transform .1s ease, box-shadow .1s ease; }
    .btn-page:hover { transform: translate(-2px, -2px); box-shadow: var(--shadow-hard); }
    .page-indicator { color: var(--ink-dim); text-transform: uppercase; }
    .empty-msg { padding: var(--space-6) 0; font-size: 15px; color: var(--ink-dim); }
    .site-footer { margin-top: var(--space-8); padding-top: var(--space-3); border-top: var(--border-width-hairline) solid var(--border); font-size: 12px; color: var(--ink-dim); display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-2); }
    .site-footer a { color: var(--ink); text-decoration: none; font-weight: 600; }
    .site-footer a:hover { color: var(--brand); }
  </style>
</head>
<body>
<main class="page">
  <header class="site-header">
    <a href="${SITE_URL}${prefix}/">nolli.</a>
    <span>${getSSRText('tagline', lang)}</span>
  </header>

  <nav aria-label="breadcrumb" class="breadcrumb-nav">
    <ol class="breadcrumb-list">
      <li class="breadcrumb-item"><a href="${SITE_URL}${prefix}/">nolli.</a></li>
      <li class="breadcrumb-separator" aria-hidden="true">/</li>
      <li class="breadcrumb-item"><a href="${SITE_URL}${prefix}/">${getSSRText('breadcrumb_architects', lang)}</a></li>
      <li class="breadcrumb-separator" aria-hidden="true">/</li>
      <li class="breadcrumb-item active" aria-current="page">${escapeHtml(canonicalName)}</li>
    </ol>
  </nav>

  <section class="hub-header">
    <span class="hub-badge">${getSSRText('breadcrumb_architects', lang)}</span>
    <h1 class="hub-title">${escapeHtml(canonicalName)}</h1>
    <p class="hub-subtitle">
      ${totalCount} ${getSSRText('cataloged_works', lang)}${activeYears ? ` · ${activeYears}` : ''} · ${getSSRText('page_of', lang, { page, totalPages })}
    </p>

    <div class="hub-actions">
      <a href="${SITE_URL}${prefix}/?q=${encodeURIComponent(canonicalName)}" class="btn-action-primary">
        ${getSSRText('explore_on_map', lang)} ↗
      </a>
    </div>
  </section>

  ${(topCities.length > 0 || categoriesList.length > 0) ? `
    <section class="cross-links-section">
      ${topCities.length > 0 ? `
        <h2 class="cross-links-title">${getSSRText('cross_cities_by_architect', lang, { nombre: canonicalName })}</h2>
        <div class="chips-group">
          ${citiesChipsHtml}
        </div>
      ` : ''}

      ${categoriesList.length > 0 ? `
        <h2 class="cross-links-title" style="margin-top: ${topCities.length > 0 ? 'var(--space-3)' : '0'};">${getSSRText('cross_categories_by_architect', lang, { nombre: canonicalName })}</h2>
        <div class="chips-group">
          ${categoriesChipsHtml}
        </div>
      ` : ''}
    </section>
  ` : ''}

  ${buildings.length > 0
    ? `<div class="cards-grid">${cardsHtml}</div>`
    : `<p class="empty-msg">${getSSRText('empty_architect', lang)}</p>`
  }

  ${totalPages > 1 ? `
    <div class="pagination-wrap">
      ${page > 1 ? `<a class="btn-page" href="${SITE_URL}${prefix}/arquitecto/${encodeURIComponent(canonicalSlug)}?page=${page - 1}">${getSSRText('prev_page', lang)}</a>` : '<span></span>'}
      <span class="page-indicator">${getSSRText('page_of', lang, { page, totalPages })}</span>
      ${page < totalPages ? `<a class="btn-page" href="${SITE_URL}${prefix}/arquitecto/${encodeURIComponent(canonicalSlug)}?page=${page + 1}">${getSSRText('next_page', lang)}</a>` : '<span></span>'}
    </div>
  ` : ''}

  <footer class="site-footer">
    <span>nolli. — Catálogo colaborativo de arquitectura con más de 10.000 obras geolocalizadas.</span>
    <div>
      <a href="${SITE_URL}${prefix}/landing">Landing</a> ·
      <a href="${SITE_URL}${prefix}/itinerarios">Itinerarios</a> ·
      <a href="${SITE_URL}${prefix}/">Mapa</a>
    </div>
  </footer>
</main>
</body>
</html>`;
}

module.exports = async (request, response) => {
  // 1. Rate limiting defensivo por IP en caso de cache MISS
  const rate = checkRateLimit(request, response);
  if (rate.limited) {
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return response.status(429).send('Límite de solicitudes excedido. Por favor, espera un momento.');
  }

  try {
    const lang = detectServerLanguage(request);
    const rawInput = String(request.query?.slug || request.query?.nombre || '').trim();
    if (!rawInput) {
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
      return response.status(400).send('Falta el nombre o slug del arquitecto.');
    }

    const page = Math.max(1, parseInt(String(request.query?.page || '1'), 10) || 1);

    const architectData = await fetchArchitectData(rawInput, page);

    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Cache Edge CDN: 48 horas fresca (172800s), hasta 7 días sirviendo stale mientras revalida en background
    response.setHeader('Cache-Control', 'public, s-maxage=172800, stale-while-revalidate=604800');
    const canonicalSlug = architectData?.canonicalSlug || slugify(rawInput);
    const cacheTag = `architect-${canonicalSlug},architect,catalog`;
    response.setHeader('Vercel-Cache-Tag', cacheTag);
    response.setHeader('Cache-Tag', cacheTag);

    if (lang !== 'es') {
      response.setHeader('X-Robots-Tag', 'noindex, follow');
    }
    return response.status(200).send(renderArchitectPage(architectData, page, lang));
  } catch (error) {
    console.error('No se pudo generar la página de arquitecto:', error);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
    return response.status(500).send('No se pudo cargar la página de arquitecto.');
  }
};
