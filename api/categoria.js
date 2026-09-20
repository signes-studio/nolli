/* =========================================================================
   API/CATEGORIA.JS — Página de Agregación por Categoría Tipológica (SSR)
   ========================================================================= */

const { categoryLabel, categoryDescription, getCategorySlugs, isValidCategory } = require('./_lib/categories.js');
const { detectServerLanguage, getLangPrefix, getSSRText, getHreflangTags, getOgLocaleTags, renderSiteFooter } = require('./_lib/i18n.js');
const { slugify, extractCityName, isIgnoredArchitect, escapeHtml, getOptimizedUrl, cleanArchitectName } = require('./_lib/slugs.js');
const { createRateLimiter } = require('./_lib/rateLimiter.js');
const { getSupabaseConfig } = require('./_lib/supabaseEnv.js');

const checkRateLimit = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 60 });

const SITE_URL = 'https://nollimap.app';
const PAGE_SIZE = 120;

const CATEGORY_COLORS = {
  residencial: '#EA560D',
  dotacional_equipamiento: '#F6A600',
  industrial_logistico: '#163D62',
  religioso_funerario: '#F6B9C5',
  comercial_terciario: '#007BC3',
  espacio_publico_paisaje: '#007446',
  infraestructura_urbanismo: '#E02523',
  otro: '#492900',
};

async function fetchCategoryData(slug, page) {
  const { supabaseUrl, serviceRoleKey: supabaseKey } = getSupabaseConfig();

  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE - 1;

  // 1. Consulta paginada para las tarjetas de la página actual
  const pageParams = new URLSearchParams({
    select: 'id,nombre_obra,arquitecto,año_construccion,place,foto_url,categoria,latitud,longitud',
    categoria: `eq.${slug}`,
    or: '(estado_revision.eq.publicada,estado_revision.is.null)',
    order: 'año_construccion.desc.nullslast,id.asc',
  });

  // 2. Consulta ligera para enlazado cruzado (arquitectos y ciudades principales)
  const metaParams = new URLSearchParams({
    select: 'arquitecto,place',
    categoria: `eq.${slug}`,
    or: '(estado_revision.eq.publicada,estado_revision.is.null)',
    limit: '400',
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
    throw new Error(`Supabase devolvió ${pageRes.status} al consultar categoría.`);
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

  // Extraer arquitectos y ciudades principales de esta categoría
  const archMap = new Map();
  const cityMap = new Map();

  allMetadata.forEach((b) => {
    if (b.arquitecto) {
      const parts = b.arquitecto.split(/[;,]/).map((p) => cleanArchitectName(p)).filter(Boolean);
      parts.forEach((name) => {
        if (!isIgnoredArchitect(name)) {
          const aSlug = slugify(name);
          if (aSlug && aSlug.length > 1) {
            if (!archMap.has(aSlug)) {
              archMap.set(aSlug, { name, count: 1 });
            } else {
              archMap.get(aSlug).count++;
            }
          }
        }
      });
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
  });

  const topArchitects = [...archMap.entries()]
    .map(([aSlug, data]) => ({ slug: aSlug, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topCities = [...cityMap.entries()]
    .map(([cSlug, data]) => ({ slug: cSlug, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    buildings,
    totalCount,
    topArchitects,
    topCities,
  };
}

function renderCategoryPage(slug, data, page, lang = 'es') {
  const { buildings, totalCount, topArchitects, topCities } = data;
  const prefix = getLangPrefix(lang);
  const categoriaText = categoryLabel(slug, lang);
  const editorialDesc = categoryDescription(slug, lang);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageParam = page > 1 ? `?page=${page}` : '';
  const canonicalUrl = `${SITE_URL}/categoria/${encodeURIComponent(slug)}${pageParam}`;
  const isIndexable = lang === 'es' && totalCount > 0;

  const title = getSSRText('category_title', lang, { categoria: categoriaText });
  const description = editorialDesc || getSSRText('category_desc', lang, {
    count: totalCount,
    categoria: categoriaText,
  });

  // Imagen Open Graph
  const heroBuilding = buildings.find((b) => b.foto_url);
  const ogImage = heroBuilding ? getOptimizedUrl(heroBuilding.foto_url, 1200) : `${SITE_URL}/icons/logo.png`;

  // Renderizado de tarjetas de obra
  const cardsHtml = buildings.map((b) => {
    const catSlug = b.categoria || slug || 'otro';
    const catLabel = categoryLabel(catSlug, lang);
    const catColor = CATEGORY_COLORS[catSlug] || CATEGORY_COLORS.otro;
    const yearVal = parseInt(b.año_construccion, 10) || 0;
    const yearText = yearVal > 0 ? String(yearVal) : (b.año_construccion ? String(b.año_construccion) : '');
    const cityName = extractCityName(b.place || '');
    const metaParts = [b.arquitecto, b.place, yearText].filter(Boolean).join(' · ');
    const searchTokens = `${b.nombre_obra || ''} ${b.arquitecto || ''} ${b.place || ''} ${cityName} ${yearText} ${catLabel} ${catSlug}`.toLowerCase();

    return `
      <article class="work-card"
        data-id="${escapeHtml(b.id)}"
        data-title="${escapeHtml((b.nombre_obra || '').toLowerCase())}"
        data-year="${yearVal}"
        data-category="${escapeHtml(catSlug)}"
        data-category-name="${escapeHtml(catLabel.toLowerCase())}"
        data-city="${escapeHtml(cityName.toLowerCase())}"
        data-architect="${escapeHtml((b.arquitecto || '').toLowerCase())}"
        data-search="${escapeHtml(searchTokens)}">
        <a href="${SITE_URL}${prefix}/obra/${encodeURIComponent(b.id)}" class="card-link">
          ${b.foto_url
            ? `<img class="card-img" src="${escapeHtml(getOptimizedUrl(b.foto_url, 480))}" alt="${escapeHtml(b.nombre_obra)}" loading="lazy" decoding="async">`
            : `<div class="card-img-placeholder"><span class="card-tag">${escapeHtml(categoriaText)}</span></div>`
          }
          <div class="card-body">
            <h2 class="card-title">${escapeHtml(b.nombre_obra)}</h2>
            <div class="card-category-wrap">
              <span class="card-category-badge" title="${escapeHtml(catLabel)}">
                <span class="cat-dot" style="background-color: ${catColor};"></span>
                <span class="cat-text">${escapeHtml(catLabel)}</span>
              </span>
            </div>
            ${metaParts ? `<p class="card-meta">${escapeHtml(metaParts)}</p>` : ''}
          </div>
          <div class="card-list-side">
            <span class="card-category-badge list-badge" title="${escapeHtml(catLabel)}">
              <span class="cat-dot" style="background-color: ${catColor};"></span>
              <span class="cat-text">${escapeHtml(catLabel)}</span>
            </span>
            <span class="card-arrow" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </span>
          </div>
        </a>
      </article>
    `;
  }).join('');

  // Enlazado cruzado a arquitectos
  const architectsChipsHtml = topArchitects.map((a) => `
    <a href="${SITE_URL}${prefix}/arquitecto/${encodeURIComponent(a.slug)}" class="chip">
      ${escapeHtml(a.name)} <span class="chip-count">${a.count}</span>
    </a>
  `).join('');

  // Enlazado cruzado a ciudades
  const citiesChipsHtml = topCities.map((c) => `
    <a href="${SITE_URL}${prefix}/ciudad/${encodeURIComponent(c.slug)}" class="chip">
      ${escapeHtml(c.name)} <span class="chip-count">${c.count}</span>
    </a>
  `).join('');

  // Navegador de otras categorías
  const siblingSlugs = getCategorySlugs().filter((s) => s !== slug);
  const siblingCategoriesHtml = siblingSlugs.map((s) => `
    <a href="${SITE_URL}${prefix}/categoria/${encodeURIComponent(s)}" class="chip">
      ${escapeHtml(categoryLabel(s, lang))}
    </a>
  `).join('');

  // Datos estructurados JSON-LD ItemList con LandmarksOrHistoricalBuildings / Place
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: getSSRText('category_page_name', lang, { categoria: categoriaText }),
    description,
    url: canonicalUrl,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: buildings.length,
      itemListElement: buildings.map((b, idx) => {
        const itemObj = {
          '@type': ['Place', 'LandmarksOrHistoricalBuildings'],
          name: b.nombre_obra,
          description: `Obra de arquitectura ${categoriaText}${b.arquitecto ? ` proyectada por ${b.arquitecto}` : ''}${b.place ? ` en ${b.place}` : ''}${b.año_construccion ? ` (${b.año_construccion})` : ''}.`,
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
        name: getSSRText('breadcrumb_categories', lang),
        item: `${SITE_URL}${prefix}/`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: categoriaText,
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
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=League+Spartan:wght@700;800;900&family=Montserrat:wght@200;300;700;800&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=League+Spartan:wght@700;800;900&family=Montserrat:wght@200;300;700;800&display=swap">
  </noscript>
  <script type="application/ld+json">${schemaJson}</script>
  <script type="application/ld+json">${breadcrumbJson}</script>
  <style>
    :root {
      --bg: #F8F1DF;
      --bg-card: #FFFFFF;
      --bg-elevated: #F0E9D2;
      --ink: #141411;
      --ink-dim: #6B6B6B;
      --border: #D8D6CE;
      --border-subtle: rgba(20, 20, 17, 0.08);
      --brand: #EA560D;
      --accent: #EA560D;
      --accent-hover: #C44605;
      --font-display: 'League Spartan', sans-serif;
      --font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      --space-1: 8px;
      --space-2: 16px;
      --space-3: 24px;
      --space-4: 32px;
      --space-6: 48px;
      --space-8: 64px;
      --radius-sm: 6px;
      --radius-md: 12px;
      --radius-pill: 9999px;
      --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02);
      --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.03);
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #141411;
        --bg-card: #1B1B18;
        --bg-elevated: #242420;
        --ink: #F4F1EA;
        --ink-dim: #9E9E94;
        --border: rgba(255, 255, 255, 0.12);
        --border-subtle: rgba(255, 255, 255, 0.08);
        --shadow-sm: 0 1px 4px rgba(0, 0, 0, 0.3);
        --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.4);
      }
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: var(--font-body);
      font-size: 15px;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }
    .page {
      width: min(100% - 32px, 1160px);
      margin: 0 auto;
      padding: var(--space-3) 0 var(--space-8);
    }
    .site-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-2) 0;
      border-bottom: 1px solid var(--border);
      margin-bottom: var(--space-3);
    }
    .brand-group {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .brand-logo {
      color: var(--ink);
      font-family: var(--font-display);
      font-size: 26px;
      font-weight: 900;
      letter-spacing: -0.03em;
      text-decoration: none;
      line-height: 1;
    }
    .brand-logo .dot {
      color: var(--brand);
    }
    .site-tagline {
      color: var(--ink-dim);
      font-size: 12px;
      font-weight: 500;
    }
    .header-nav-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-card);
      color: var(--ink);
      font-family: var(--font-body);
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      box-shadow: var(--shadow-sm);
      transition: all 0.15s ease;
    }
    .header-nav-btn:hover {
      border-color: var(--brand);
      color: var(--brand);
      transform: translateY(-1px);
    }
    .breadcrumb-nav {
      margin-bottom: var(--space-4);
    }
    .breadcrumb-list {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      list-style: none;
      margin: 0;
      padding: 0;
      font-size: 12px;
      font-weight: 500;
      color: var(--ink-dim);
    }
    .breadcrumb-item a {
      color: var(--ink-dim);
      text-decoration: none;
      transition: color 0.12s;
    }
    .breadcrumb-item a:hover {
      color: var(--brand);
    }
    .breadcrumb-sep {
      color: var(--ink-dim);
      opacity: 0.5;
    }
    .breadcrumb-item.active {
      color: var(--ink);
      font-weight: 600;
    }
    .hub-header {
      margin: var(--space-3) 0 var(--space-4);
    }
    .hub-badge {
      display: inline-block;
      padding: 4px 12px;
      background: var(--bg-elevated);
      color: var(--ink);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-pill);
      font-family: var(--font-display);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
      margin-bottom: var(--space-2);
    }
    .hub-title {
      margin: 0;
      font-family: var(--font-display);
      font-size: clamp(32px, 5vw, 56px);
      font-weight: 900;
      letter-spacing: -0.03em;
      line-height: .98;
      color: var(--ink);
    }
    .hub-editorial {
      margin: var(--space-2) 0 0;
      font-size: 16px;
      line-height: 1.6;
      max-width: 800px;
      color: var(--ink);
    }
    .hub-subtitle {
      margin: var(--space-2) 0 var(--space-3);
      color: var(--ink-dim);
      font-size: 14.5px;
      font-weight: 500;
    }
    .hub-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }
    .btn-action-primary {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 22px;
      background: var(--brand);
      color: #fff;
      text-decoration: none;
      font-family: var(--font-display);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: .04em;
      text-transform: uppercase;
      border-radius: var(--radius-sm);
      box-shadow: 0 3px 12px rgba(234, 86, 13, 0.28);
      transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
    }
    .btn-action-primary:hover {
      background: var(--accent-hover);
      transform: translateY(-2px);
      box-shadow: 0 5px 16px rgba(234, 86, 13, 0.4);
      color: #fff;
    }
    .cross-links-section {
      margin-top: var(--space-4);
      padding: var(--space-3);
      background: var(--bg-card);
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      box-shadow: var(--shadow-sm);
    }
    .cross-links-title {
      margin: 0 0 var(--space-2);
      font-family: var(--font-display);
      font-size: 12.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: var(--ink);
    }
    .chips-group {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: var(--space-2);
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-pill);
      color: var(--ink);
      text-decoration: none;
      font-family: var(--font-display);
      font-size: 11.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .02em;
      transition: transform .12s ease, border-color .12s ease, background .12s ease;
    }
    .chip:hover {
      transform: translateY(-1px);
      border-color: var(--brand);
      color: var(--brand);
      background: var(--bg);
    }
    .chip-count {
      font-size: 10px;
      background: var(--ink);
      color: var(--bg);
      padding: 2px 7px;
      border-radius: var(--radius-pill);
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: var(--space-3);
      margin-top: var(--space-4);
    }
    .work-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      overflow: hidden;
      box-shadow: var(--shadow-sm);
      transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
      display: flex;
      flex-direction: column;
    }
    .work-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.03);
      border-color: rgba(234, 86, 13, 0.3);
    }
    .card-link {
      color: inherit;
      text-decoration: none;
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .card-img {
      width: 100%;
      height: 180px;
      object-fit: cover;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-elevated);
    }
    .card-img-placeholder {
      width: 100%;
      height: 180px;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card-tag {
      font-family: var(--font-display);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .06em;
      color: var(--ink-dim);
      text-transform: uppercase;
    }
    .card-body {
      padding: var(--space-2);
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .card-title {
      margin: 0 0 var(--space-1);
      font-family: var(--font-display);
      font-size: 16px;
      font-weight: 800;
      line-height: 1.25;
      color: var(--ink);
    }
    .card-category-wrap {
      margin: 0 0 var(--space-1);
    }
    .card-category-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 9px;
      border-radius: var(--radius-pill);
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      font-family: var(--font-display);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .03em;
      text-transform: uppercase;
      color: var(--ink);
      line-height: 1.1;
      max-width: 100%;
    }
    .cat-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
      display: inline-block;
    }
    .cat-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card-list-side {
      display: none;
    }
    .card-meta {
      margin: auto 0 0;
      font-size: 12px;
      color: var(--ink-dim);
      font-weight: 500;
    }
    .pagination-wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: var(--space-6);
      padding-top: var(--space-3);
      border-top: 1px solid var(--border);
      font-family: var(--font-display);
      font-size: 13px;
      font-weight: 800;
    }
    .btn-page {
      display: inline-flex;
      align-items: center;
      padding: 9px 18px;
      background: var(--bg-card);
      color: var(--ink);
      text-decoration: none;
      text-transform: uppercase;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      box-shadow: var(--shadow-sm);
      transition: transform .12s ease, border-color .12s ease, color .12s ease;
    }
    .btn-page:hover {
      border-color: var(--brand);
      color: var(--brand);
      transform: translateY(-1px);
    }
    .page-indicator {
      color: var(--ink-dim);
      text-transform: uppercase;
    }
    .empty-msg {
      padding: var(--space-6) 0;
      font-size: 15px;
      color: var(--ink-dim);
    }
    .site-footer {
      margin-top: var(--space-8);
      padding: var(--space-4) 0;
      border-top: 1px solid var(--border);
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      font-size: 13px;
      color: var(--ink-dim);
    }
    .footer-brand {
      display: flex;
      align-items: center;
    }
    .footer-by {
      font-size: 12.5px;
      color: var(--ink-dim);
      display: inline-flex;
      align-items: baseline;
      gap: 5px;
      flex-wrap: wrap;
    }
    .brand-signes {
      font-family: 'Montserrat', sans-serif;
      text-decoration: none;
      color: var(--ink);
      display: inline-flex;
      align-items: baseline;
      letter-spacing: 0.04em;
      transition: color 0.15s ease;
    }
    .brand-signes:hover {
      color: var(--brand);
    }
    .brand-signes-bold {
      font-weight: 800;
    }
    .brand-signes-thin {
      font-weight: 200;
    }
    .brand-nolli {
      font-family: var(--font-display);
      font-weight: 800;
      font-size: 1.22em;
      line-height: 1;
      letter-spacing: -0.02em;
      text-transform: lowercase;
      display: inline-block;
      vertical-align: baseline;
    }
    .footer-links {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }
    .footer-links a {
      color: var(--ink-dim);
      text-decoration: none;
      font-weight: 500;
      transition: color 0.12s;
    }
    .footer-links a:hover {
      color: var(--brand);
    }
    /* =========================================================================
       TOOLBAR: Buscador, Filtros, Ordenación y Vistas (Cuadrícula / Listado)
       ========================================================================= */
    .catalog-toolbar {
      margin-top: var(--space-4);
      margin-bottom: var(--space-3);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .toolbar-primary-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .toolbar-search-wrap {
      position: relative;
      display: flex;
      align-items: center;
      flex: 1 1 240px;
      min-width: 200px;
    }
    .search-icon {
      position: absolute;
      left: 12px;
      color: var(--ink-dim);
      pointer-events: none;
    }
    .toolbar-search-input {
      width: 100%;
      padding: 8px 32px 8px 34px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-card);
      color: var(--ink);
      font-family: var(--font-body);
      font-size: 13px;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      outline: none;
    }
    .toolbar-search-input:focus {
      border-color: var(--brand);
      box-shadow: 0 0 0 3px rgba(234, 86, 13, 0.15);
    }
    .search-clear-btn {
      position: absolute;
      right: 6px;
      background: transparent;
      border: none;
      font-size: 18px;
      line-height: 1;
      color: var(--ink-dim);
      cursor: pointer;
      padding: 3px 6px;
      border-radius: 50%;
    }
    .search-clear-btn:hover {
      color: var(--ink);
    }
    .toolbar-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .toolbar-select-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .toolbar-select {
      appearance: none;
      -webkit-appearance: none;
      padding: 7px 28px 7px 11px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-card);
      color: var(--ink);
      font-family: var(--font-body);
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .toolbar-select:focus,
    .toolbar-select:hover {
      border-color: var(--brand);
    }
    .select-caret {
      position: absolute;
      right: 9px;
      color: var(--ink-dim);
      pointer-events: none;
    }
    .view-toggle-group {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-card);
      overflow: hidden;
      box-shadow: var(--shadow-sm);
    }
    .btn-view-toggle {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 11px;
      background: transparent;
      border: none;
      color: var(--ink-dim);
      cursor: pointer;
      font-family: var(--font-display);
      font-size: 11.5px;
      font-weight: 800;
      letter-spacing: .04em;
      text-transform: uppercase;
      transition: all .15s ease;
    }
    .btn-view-toggle.active {
      background: var(--ink);
      color: var(--bg);
    }
    body.dark-mode .btn-view-toggle.active {
      background: #F4F1EA;
      color: #141411;
    }
    .btn-view-toggle:hover:not(.active) {
      color: var(--brand);
    }
    .toolbar-status-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 12px;
      color: var(--ink-dim);
      font-weight: 500;
      min-height: 22px;
    }
    .toolbar-counter {
      display: inline-flex;
      align-items: center;
    }
    .btn-reset-filters {
      background: transparent;
      border: none;
      color: var(--brand);
      font-weight: 700;
      font-size: 12px;
      cursor: pointer;
      padding: 2px 6px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }
    .btn-reset-filters:hover {
      text-decoration: underline;
    }
    .hidden {
      display: none !important;
    }

    /* =========================================================================
       MODO LISTADO (is-list-view)
       ========================================================================= */
    .cards-grid.is-list-view {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .cards-grid.is-list-view .work-card {
      border-radius: var(--radius-sm);
      overflow: hidden;
      border: 1px solid var(--border);
      box-shadow: var(--shadow-sm);
      background: var(--bg-card);
      transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .cards-grid.is-list-view .work-card:hover {
      transform: translateY(-2px);
      border-color: var(--brand);
      box-shadow: var(--shadow-md);
    }
    .cards-grid.is-list-view .card-link {
      display: flex;
      flex-direction: row;
      align-items: center;
      padding: 10px 14px;
      gap: 16px;
      width: 100%;
      height: auto;
      text-decoration: none;
    }
    .cards-grid.is-list-view .card-img,
    .cards-grid.is-list-view .card-img-placeholder {
      width: 68px;
      height: 68px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-subtle);
      border-bottom: none;
      flex-shrink: 0;
      object-fit: cover;
    }
    .cards-grid.is-list-view .card-body {
      padding: 0;
      flex: 1 1 auto;
      min-width: 0;
      gap: 3px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .cards-grid.is-list-view .card-category-wrap {
      display: none;
    }
    .cards-grid.is-list-view .card-title {
      margin: 0;
      font-size: 15.5px;
      font-weight: 800;
      color: var(--ink);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cards-grid.is-list-view .card-meta {
      margin: 0;
      font-size: 12.5px;
      color: var(--ink-dim);
      font-weight: 500;
    }
    .cards-grid.is-list-view .card-list-side {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-shrink: 0;
      margin-left: auto;
    }
    .cards-grid.is-list-view .card-arrow {
      color: var(--ink-dim);
      display: flex;
      align-items: center;
      transition: transform 0.15s ease, color 0.15s ease;
    }
    .cards-grid.is-list-view .work-card:hover .card-arrow {
      color: var(--brand);
      transform: translateX(3px);
    }

    @media (max-width: 768px) {
      .site-tagline { display: none; }
      .hub-title { font-size: 32px; }
      .cards-grid:not(.is-list-view) { grid-template-columns: 1fr; }
      .toolbar-controls {
        width: 100%;
        justify-content: flex-start;
      }
      .toolbar-select-wrap {
        flex: 1 1 calc(50% - 4px);
      }
      .toolbar-select {
        width: 100%;
      }
      .view-toggle-group {
        margin-left: auto;
      }
      .btn-view-text {
        display: none;
      }
    }
    @media (max-width: 640px) {
      .cards-grid.is-list-view .card-link {
        padding: 8px 10px;
        gap: 12px;
      }
      .cards-grid.is-list-view .card-img,
      .cards-grid.is-list-view .card-img-placeholder {
        width: 54px;
        height: 54px;
      }
      .cards-grid.is-list-view .card-title {
        font-size: 14px;
        white-space: normal;
        line-height: 1.25;
      }
      .cards-grid.is-list-view .card-list-side {
        display: none;
      }
      .cards-grid.is-list-view .card-category-wrap {
        display: flex;
        margin-top: 2px;
        margin-bottom: 0;
      }
    }
  </style>
</head>
<body>
<main class="page">
  <header class="site-header">
    <div class="brand-group">
      <a href="${SITE_URL}${prefix}/" class="brand-logo">nolli<span class="dot">.</span></a>
      <span class="site-tagline">${escapeHtml(getSSRText('tagline', lang))}</span>
    </div>
    <a href="${SITE_URL}${prefix}/" class="header-nav-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
      ${escapeHtml(getSSRText('go_to_map', lang))}
    </a>
  </header>

  <nav aria-label="breadcrumb" class="breadcrumb-nav">
    <ol class="breadcrumb-list">
      <li class="breadcrumb-item"><a href="${SITE_URL}${prefix}/"><span class="brand-nolli">nolli.</span></a></li>
      <li class="breadcrumb-sep" aria-hidden="true">/</li>
      <li class="breadcrumb-item"><a href="${SITE_URL}${prefix}/">${getSSRText('breadcrumb_categories', lang)}</a></li>
      <li class="breadcrumb-sep" aria-hidden="true">/</li>
      <li class="breadcrumb-item active" aria-current="page">${escapeHtml(categoriaText)}</li>
    </ol>
  </nav>

  <section class="hub-header">
    <span class="hub-badge">${getSSRText('breadcrumb_categories', lang)}</span>
    <h1 class="hub-title">${escapeHtml(categoriaText)}</h1>
    ${editorialDesc ? `<p class="hub-editorial">${escapeHtml(editorialDesc)}</p>` : ''}
    <p class="hub-subtitle">
      ${totalCount} ${getSSRText('cataloged_works', lang)} · ${getSSRText('page_of', lang, { page, totalPages })}
    </p>

    <div class="hub-actions">
      <a href="${SITE_URL}${prefix}/?categoria=${encodeURIComponent(slug)}" class="btn-action-primary">
        ${getSSRText('explore_on_map', lang)} ↗
      </a>
    </div>
  </section>

  ${(topArchitects.length > 0 || topCities.length > 0 || siblingCategoriesHtml) ? `
    <section class="cross-links-section">
      ${topArchitects.length > 0 ? `
        <h2 class="cross-links-title">${getSSRText('cross_architects_in_category', lang, { categoria: categoriaText })}</h2>
        <div class="chips-group">
          ${architectsChipsHtml}
        </div>
      ` : ''}

      ${topCities.length > 0 ? `
        <h2 class="cross-links-title" style="margin-top: ${topArchitects.length > 0 ? 'var(--space-3)' : '0'};">${getSSRText('cross_cities_in_category', lang, { categoria: categoriaText })}</h2>
        <div class="chips-group">
          ${citiesChipsHtml}
        </div>
      ` : ''}

      <h2 class="cross-links-title" style="margin-top: ${(topArchitects.length > 0 || topCities.length > 0) ? 'var(--space-3)' : '0'};">${getSSRText('other_categories', lang)}</h2>
      <div class="chips-group">
        ${siblingCategoriesHtml}
      </div>
    </section>
  ` : ''}

  ${buildings.length > 0
    ? `
    <section class="catalog-toolbar" aria-label="Herramientas del catálogo">
      <div class="toolbar-primary-row">
        <!-- Buscador -->
        <div class="toolbar-search-wrap">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="search" id="works-search-input" class="toolbar-search-input" placeholder="${escapeHtml(getSSRText('search_works_placeholder_cat', lang))}" aria-label="${escapeHtml(getSSRText('search_works_placeholder_cat', lang))}">
          <button type="button" id="works-search-clear" class="search-clear-btn hidden" aria-label="${escapeHtml(getSSRText('clear_filters', lang))}">&times;</button>
        </div>

        <div class="toolbar-controls">
          <!-- Filtro Ciudad -->
          ${topCities.length > 1 ? `
          <div class="toolbar-select-wrap">
            <select id="filter-city-select" class="toolbar-select" aria-label="${escapeHtml(getSSRText('filter_all_cities', lang))}">
              <option value="all">${escapeHtml(getSSRText('filter_all_cities', lang))}</option>
              ${topCities.map((c) => `<option value="${escapeHtml(c.name.toLowerCase())}">${escapeHtml(c.name)} (${c.count})</option>`).join('')}
            </select>
            <svg class="select-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>` : ''}

          <!-- Filtro Arquitecto -->
          ${topArchitects.length > 1 ? `
          <div class="toolbar-select-wrap">
            <select id="filter-architect-select" class="toolbar-select" aria-label="${escapeHtml(getSSRText('filter_all_architects', lang))}">
              <option value="all">${escapeHtml(getSSRText('filter_all_architects', lang))}</option>
              ${topArchitects.map((a) => `<option value="${escapeHtml(a.name.toLowerCase())}">${escapeHtml(a.name)} (${a.count})</option>`).join('')}
            </select>
            <svg class="select-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>` : ''}

          <!-- Ordenación -->
          <div class="toolbar-select-wrap">
            <select id="sort-works-select" class="toolbar-select" aria-label="${escapeHtml(getSSRText('sort_by', lang))}">
              <option value="year-desc">${escapeHtml(getSSRText('sort_year_desc', lang))}</option>
              <option value="year-asc">${escapeHtml(getSSRText('sort_year_asc', lang))}</option>
              <option value="name-asc">${escapeHtml(getSSRText('sort_name_asc', lang))}</option>
              <option value="city-asc">${escapeHtml(getSSRText('sort_city_asc', lang))}</option>
              <option value="arch-asc">${escapeHtml(getSSRText('sort_architect_asc', lang))}</option>
            </select>
            <svg class="select-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>

          <!-- Selector de Vista -->
          <div class="view-toggle-group" role="group" aria-label="Visualización">
            <button type="button" id="btn-view-grid" class="btn-view-toggle active" data-view="grid" title="${escapeHtml(getSSRText('view_grid', lang))}" aria-label="${escapeHtml(getSSRText('view_grid', lang))}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
              <span class="btn-view-text">${escapeHtml(getSSRText('view_grid', lang))}</span>
            </button>
            <button type="button" id="btn-view-list" class="btn-view-toggle" data-view="list" title="${escapeHtml(getSSRText('view_list', lang))}" aria-label="${escapeHtml(getSSRText('view_list', lang))}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
              <span class="btn-view-text">${escapeHtml(getSSRText('view_list', lang))}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="toolbar-status-row">
        <span id="toolbar-counter" class="toolbar-counter" data-template="${escapeHtml(getSSRText('showing_works_count', lang, { count: '{count}', total: '{total}' }))}">
          ${escapeHtml(getSSRText('showing_works_count', lang, { count: buildings.length, total: buildings.length }))}
        </span>
        <button type="button" id="btn-reset-filters" class="btn-reset-filters hidden">
          ${escapeHtml(getSSRText('clear_filters', lang))} &times;
        </button>
      </div>
    </section>

    <div id="no-filter-results" class="empty-msg hidden">
      <p>${escapeHtml(getSSRText('no_results_filtered', lang))}</p>
      <button type="button" class="btn-page" id="btn-empty-reset">${escapeHtml(getSSRText('clear_filters', lang))}</button>
    </div>

    <div class="cards-grid">${cardsHtml}</div>
    `
    : `<p class="empty-msg">${getSSRText('empty_category', lang)}</p>`
  }

  ${totalPages > 1 ? `
    <div class="pagination-wrap">
      ${page > 1 ? `<a class="btn-page" href="${SITE_URL}${prefix}/categoria/${encodeURIComponent(slug)}?page=${page - 1}">${getSSRText('prev_page', lang)}</a>` : '<span></span>'}
      <span class="page-indicator">${getSSRText('page_of', lang, { page, totalPages })}</span>
      ${page < totalPages ? `<a class="btn-page" href="${SITE_URL}${prefix}/categoria/${encodeURIComponent(slug)}?page=${page + 1}">${getSSRText('next_page', lang)}</a>` : '<span></span>'}
    </div>
  ` : ''}

  ${renderSiteFooter(lang, SITE_URL)}
</main>
<script>
  (function() {
    var searchInput = document.getElementById('works-search-input');
    var searchClear = document.getElementById('works-search-clear');
    var filterCity = document.getElementById('filter-city-select');
    var filterArch = document.getElementById('filter-architect-select');
    var sortSelect = document.getElementById('sort-works-select');
    var btnViewGrid = document.getElementById('btn-view-grid');
    var btnViewList = document.getElementById('btn-view-list');
    var counterEl = document.getElementById('toolbar-counter');
    var btnReset = document.getElementById('btn-reset-filters');
    var btnEmptyReset = document.getElementById('btn-empty-reset');
    var emptyMsg = document.getElementById('no-filter-results');
    var grid = document.querySelector('.cards-grid');

    if (!grid) return;
    var originalCards = Array.prototype.slice.call(grid.querySelectorAll('.work-card'));
    if (!originalCards.length) return;

    var template = counterEl ? (counterEl.getAttribute('data-template') || 'Mostrando {count} de {total} obras') : '';
    var totalCount = originalCards.length;

    function setViewMode(mode) {
      if (mode === 'list') {
        grid.classList.add('is-list-view');
        if (btnViewList) btnViewList.classList.add('active');
        if (btnViewGrid) btnViewGrid.classList.remove('active');
      } else {
        grid.classList.remove('is-list-view');
        if (btnViewGrid) btnViewGrid.classList.add('active');
        if (btnViewList) btnViewList.classList.remove('active');
      }
      try {
        localStorage.setItem('nolli_catalog_view', mode);
        localStorage.setItem('nolli_arch_view', mode);
      } catch (e) {}
    }

    try {
      var savedView = localStorage.getItem('nolli_catalog_view') || localStorage.getItem('nolli_arch_view');
      if (savedView === 'list') setViewMode('list');
    } catch (e) {}

    if (btnViewGrid) btnViewGrid.addEventListener('click', function() { setViewMode('grid'); });
    if (btnViewList) btnViewList.addEventListener('click', function() { setViewMode('list'); });

    function applyFilterAndSort() {
      var q = (searchInput ? searchInput.value : '').trim().toLowerCase();
      var city = filterCity ? filterCity.value : 'all';
      var arch = filterArch ? filterArch.value : 'all';
      var sortVal = sortSelect ? sortSelect.value : 'year-desc';

      if (searchClear) {
        if (q) searchClear.classList.remove('hidden');
        else searchClear.classList.add('hidden');
      }

      var isFiltered = Boolean(q || city !== 'all' || arch !== 'all');
      if (btnReset) {
        if (isFiltered) btnReset.classList.remove('hidden');
        else btnReset.classList.add('hidden');
      }

      var currentCards = originalCards.slice();
      currentCards.sort(function(a, b) {
        if (sortVal === 'year-desc') {
          var yA = parseInt(a.getAttribute('data-year') || '0', 10) || 0;
          var yB = parseInt(b.getAttribute('data-year') || '0', 10) || 0;
          if (yA !== yB) return yB - yA;
          return (a.getAttribute('data-title') || '').localeCompare(b.getAttribute('data-title') || '');
        }
        if (sortVal === 'year-asc') {
          var yA2 = parseInt(a.getAttribute('data-year') || '0', 10) || 9999;
          var yB2 = parseInt(b.getAttribute('data-year') || '0', 10) || 9999;
          if (yA2 !== yB2) return yA2 - yB2;
          return (a.getAttribute('data-title') || '').localeCompare(b.getAttribute('data-title') || '');
        }
        if (sortVal === 'name-asc') {
          return (a.getAttribute('data-title') || '').localeCompare(b.getAttribute('data-title') || '');
        }
        if (sortVal === 'city-asc') {
          var cA = a.getAttribute('data-city') || '';
          var cB = b.getAttribute('data-city') || '';
          if (cA !== cB) return cA.localeCompare(cB);
          return (a.getAttribute('data-title') || '').localeCompare(b.getAttribute('data-title') || '');
        }
        if (sortVal === 'arch-asc') {
          var aA = a.getAttribute('data-architect') || '';
          var aB = b.getAttribute('data-architect') || '';
          if (aA !== aB) return aA.localeCompare(aB);
          return (a.getAttribute('data-title') || '').localeCompare(b.getAttribute('data-title') || '');
        }
        return 0;
      });

      var visibleCount = 0;
      currentCards.forEach(function(card) {
        grid.appendChild(card);
        var searchData = card.getAttribute('data-search') || '';
        var cardCity = card.getAttribute('data-city') || '';
        var cardArch = card.getAttribute('data-architect') || '';

        var matchSearch = !q || searchData.indexOf(q) !== -1;
        var matchCity = city === 'all' || cardCity.indexOf(city) !== -1;
        var matchArch = arch === 'all' || cardArch.indexOf(arch) !== -1;

        if (matchSearch && matchCity && matchArch) {
          card.style.display = '';
          visibleCount++;
        } else {
          card.style.display = 'none';
        }
      });

      if (counterEl && template) {
        counterEl.textContent = template.replace('{count}', String(visibleCount)).replace('{total}', String(totalCount));
      }

      if (emptyMsg) {
        if (visibleCount === 0) {
          emptyMsg.classList.remove('hidden');
          grid.style.display = 'none';
        } else {
          emptyMsg.classList.add('hidden');
          grid.style.display = '';
        }
      }
    }

    function resetAllFilters() {
      if (searchInput) searchInput.value = '';
      if (filterCity) filterCity.value = 'all';
      if (filterArch) filterArch.value = 'all';
      if (sortSelect) sortSelect.value = 'year-desc';
      applyFilterAndSort();
      if (searchInput) searchInput.focus();
    }

    if (searchInput) searchInput.addEventListener('input', applyFilterAndSort);
    if (searchClear) searchClear.addEventListener('click', resetAllFilters);
    if (filterCity) filterCity.addEventListener('change', applyFilterAndSort);
    if (filterArch) filterArch.addEventListener('change', applyFilterAndSort);
    if (sortSelect) sortSelect.addEventListener('change', applyFilterAndSort);
    if (btnReset) btnReset.addEventListener('click', resetAllFilters);
    if (btnEmptyReset) btnEmptyReset.addEventListener('click', resetAllFilters);
  })();
</script>
</body>
</html>`;
}

function renderCategoryNotFoundPage(slug, lang = 'es') {
  const prefix = getLangPrefix(lang);
  const title = getSSRText('not_found_category_title', lang);
  const heading = getSSRText('not_found_title', lang);
  const tag = getSSRText('not_found_tag', lang);
  const text = getSSRText('not_found_category_text', lang);
  const mapBtnText = getSSRText('go_to_map', lang);

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <base href="/">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="robots" content="noindex, follow">
  <link rel="icon" type="image/png" sizes="48x48" href="${SITE_URL}/icon.png">
  <link rel="icon" type="image/png" sizes="192x192" href="${SITE_URL}/icons/icon-192.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=League+Spartan:wght@700;800;900&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=League+Spartan:wght@700;800;900&display=swap">
  </noscript>
  <style>
    :root {
      --bg: #F8F1DF;
      --bg-card: #FFFFFF;
      --bg-elevated: #F0E9D2;
      --ink: #141411;
      --ink-dim: #6B6B6B;
      --border: #D8D6CE;
      --brand: #EA560D;
      --font-display: 'League Spartan', sans-serif;
      --font-body: 'Inter', sans-serif;
      --radius-sm: 6px;
      --radius-md: 12px;
      --radius-lg: 16px;
      --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.06);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #141411;
        --bg-card: #1B1B18;
        --bg-elevated: #242420;
        --ink: #F4F1EA;
        --ink-dim: #9E9E94;
        --border: rgba(255, 255, 255, 0.12);
        --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.4);
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: var(--font-body);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      -webkit-font-smoothing: antialiased;
    }
    .nf-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 40px 32px;
      max-width: 520px;
      width: 100%;
      text-align: center;
      box-shadow: var(--shadow-md);
    }
    .nf-badge {
      display: inline-block;
      font-family: var(--font-display);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .08em;
      color: var(--brand);
      margin-bottom: 12px;
    }
    .nf-title {
      font-family: var(--font-display);
      font-size: 28px;
      font-weight: 900;
      margin: 0 0 14px;
      color: var(--ink);
      line-height: 1.1;
    }
    .nf-text {
      font-size: 14.5px;
      line-height: 1.6;
      color: var(--ink-dim);
      margin: 0 0 28px;
    }
    .nf-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 13px 26px;
      background: var(--brand);
      color: #fff;
      text-decoration: none;
      font-family: var(--font-display);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: .04em;
      border-radius: var(--radius-sm);
      box-shadow: 0 3px 12px rgba(234, 86, 13, 0.28);
      transition: all 0.15s ease;
    }
    .nf-btn:hover {
      background: #C44605;
      transform: translateY(-2px);
      box-shadow: 0 5px 16px rgba(234, 86, 13, 0.4);
    }
  </style>
</head>
<body>
  <div class="nf-card not-found-card">
    <span class="nf-badge">${escapeHtml(tag)}</span>
    <h1 class="nf-title">${escapeHtml(heading)}</h1>
    <p class="nf-text">${escapeHtml(text)}</p>
    <a href="${SITE_URL}${prefix}/" class="nf-btn">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
      ${escapeHtml(mapBtnText)}
    </a>
  </div>
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
    const rawSlug = String(request.query?.slug || '').trim();
    if (!rawSlug) {
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
      return response.status(400).send('Falta el parámetro de categoría.');
    }

    const slug = rawSlug.toLowerCase();

    // 2. Si la categoría no es válida en el catálogo: HTTP 404 + noindex, follow
    if (!isValidCategory(slug)) {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
      response.setHeader('Vercel-Cache-Tag', 'category-404,catalog');
      response.setHeader('Cache-Tag', 'category-404,catalog');
      response.setHeader('X-Robots-Tag', 'noindex, follow');
      return response.status(404).send(renderCategoryNotFoundPage(slug, lang));
    }

    const page = Math.max(1, parseInt(String(request.query?.page || '1'), 10) || 1);

    const categoryData = await fetchCategoryData(slug, page);

    // 3. Si la categoría no contiene obras: HTTP 404 + noindex, follow
    if (!categoryData || categoryData.totalCount === 0) {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
      response.setHeader('Vercel-Cache-Tag', 'category-404,catalog');
      response.setHeader('Cache-Tag', 'category-404,catalog');
      response.setHeader('X-Robots-Tag', 'noindex, follow');
      return response.status(404).send(renderCategoryNotFoundPage(slug, lang));
    }

    // 4. Renderizado exitoso (200 OK)
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=172800, stale-while-revalidate=604800');
    const cacheTag = `category-${slug},category,catalog`;
    response.setHeader('Vercel-Cache-Tag', cacheTag);
    response.setHeader('Cache-Tag', cacheTag);

    if (lang !== 'es') {
      response.setHeader('X-Robots-Tag', 'noindex, follow');
    }
    return response.status(200).send(renderCategoryPage(slug, categoryData, page, lang));
  } catch (error) {
    console.error('No se pudo generar la página de categoría:', error);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
    return response.status(500).send('No se pudo cargar la página de categoría.');
  }
};

module.exports.renderCategoryPage = renderCategoryPage;
module.exports.renderCategoryNotFoundPage = renderCategoryNotFoundPage;
