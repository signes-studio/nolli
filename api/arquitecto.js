/* =========================================================================
   API/ARQUITECTO.JS — Página de Agregación por Arquitecto (SSR)
   ========================================================================= */

const { categoryLabel } = require('./_lib/categories.js');
const { detectServerLanguage, getLangPrefix, getSSRText, getHreflangTags, getOgLocaleTags, renderSiteFooter } = require('./_lib/i18n.js');
const { slugify, slugToRegex, extractCityName, escapeHtml, getOptimizedUrl, isIgnoredArchitect, ARCHITECT_ALIASES, cleanArchitectName } = require('./_lib/slugs.js');
const { createRateLimiter } = require('./_lib/rateLimiter.js');
const { getSupabaseConfig } = require('./_lib/supabaseEnv.js');
const {
  getAssociatedSearchTerms,
  getStudioMembers,
  getMemberStudios,
  isStudio,
  getCanonicalArchitectName,
} = require('./_lib/architectRelationships.js');

const checkRateLimit = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 60 });

const SITE_URL = 'https://nollimap.app';
const PAGE_SIZE = 50;

async function fetchArchitectData(rawInput, page) {
  const { supabaseUrl, serviceRoleKey: supabaseKey } = getSupabaseConfig();

  const cleanSlug = slugify(rawInput);
  const terms = getAssociatedSearchTerms(rawInput);

  let regex;
  if (terms.length > 1) {
    const regexParts = terms.map((t) => slugToRegex(slugify(t)).replace(/^\.\*/, '').replace(/\.\*$/, ''));
    regex = `.*(?:${regexParts.join('|')}).*`;
  } else {
    regex = slugToRegex(cleanSlug);
  }

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

  // Determinar nombre canónico del arquitecto más frecuente en los registros o del registro
  const regCanonical = getCanonicalArchitectName(rawInput);
  const nameCounts = new Map();
  const cityMap = new Map();
  const catMap = new Map();
  const years = [];
  const validSlugs = new Set([cleanSlug, ...terms.map((t) => slugify(t))]);

  allMetadata.forEach((b) => {
    if (b.arquitecto) {
      const parts = b.arquitecto.split(/[;,]/).map((p) => cleanArchitectName(p)).filter(Boolean);
      parts.forEach((archName) => {
        const archSlug = slugify(archName);
        if (validSlugs.has(archSlug)) {
          nameCounts.set(archName, (nameCounts.get(archName) || 0) + 1);
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
  const canonicalName = (regCanonical && regCanonical !== rawInput)
    ? regCanonical
    : (sortedNames.length > 0 ? sortedNames[0][0] : rawInput);
  const canonicalSlug = slugify(canonicalName) || cleanSlug;

  const isStudioMode = isStudio(canonicalName);
  const studioMembers = isStudioMode ? getStudioMembers(canonicalName) : [];
  const memberStudios = !isStudioMode ? getMemberStudios(canonicalName) : [];

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
    isStudioMode,
    studioMembers,
    memberStudios,
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
    isStudioMode,
    studioMembers,
    memberStudios,
  } = data;

  const prefix = getLangPrefix(lang);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageParam = page > 1 ? `?page=${page}` : '';
  const canonicalUrl = `${SITE_URL}/arquitecto/${encodeURIComponent(canonicalSlug)}${pageParam}`;
  const isIndexable = lang === 'es' && totalCount > 0;

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
    about: isStudioMode
      ? {
          '@type': 'Organization',
          name: canonicalName,
          ...(studioMembers && studioMembers.length > 0
            ? {
                member: studioMembers.map((m) => ({
                  '@type': 'Person',
                  name: m.name,
                  url: `${SITE_URL}${prefix}/arquitecto/${encodeURIComponent(m.slug)}`,
                })),
              }
            : {}),
        }
      : {
          '@type': 'Person',
          name: canonicalName,
          ...(memberStudios && memberStudios.length > 0
            ? {
                memberOf: memberStudios.map((s) => ({
                  '@type': 'Organization',
                  name: s.studio,
                  url: `${SITE_URL}${prefix}/arquitecto/${encodeURIComponent(s.slug)}`,
                })),
              }
            : {}),
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

  let relationsHtml = '';
  if (isStudioMode && studioMembers && studioMembers.length > 0) {
    const label = lang === 'en' ? 'Studio members / founded by:' : (lang === 'ca' ? 'Estudi format per:' : 'Estudio formado por:');
    relationsHtml = `
      <div class="hub-relations">
        <span class="hub-relations-label">${escapeHtml(label)}</span>
        <div class="hub-relation-pills">
          ${studioMembers.map((m) => `<a href="${SITE_URL}${prefix}/arquitecto/${encodeURIComponent(m.slug)}" class="relation-chip">${escapeHtml(m.name)}</a>`).join('')}
        </div>
      </div>
    `;
  } else if (!isStudioMode && memberStudios && memberStudios.length > 0) {
    const label = lang === 'en' ? 'Studio / Collective:' : (lang === 'ca' ? 'Estudi / Col·lectiu:' : 'Estudio / Colectivo:');
    relationsHtml = `
      <div class="hub-relations">
        <span class="hub-relations-label">${escapeHtml(label)}</span>
        <div class="hub-relation-pills">
          ${memberStudios.map((s) => `<a href="${SITE_URL}${prefix}/arquitecto/${encodeURIComponent(s.slug)}" class="relation-chip">${escapeHtml(s.studio)}</a>`).join('')}
        </div>
      </div>
    `;
  }

  const studioKicker = lang === 'en' ? 'ARCHITECTURE STUDIO' : (lang === 'ca' ? "ESTUDI D'ARQUITECTURA" : 'ESTUDIO DE ARQUITECTURA');

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
    .hub-relations {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      margin-bottom: 8px;
    }
    .hub-relations-label {
      font-family: var(--font-display);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: var(--ink-dim);
    }
    .hub-relation-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .relation-chip {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 600;
      color: var(--ink);
      text-decoration: none;
      transition: all .15s ease;
    }
    .relation-chip:hover {
      border-color: var(--brand);
      color: var(--brand);
      transform: translateY(-1px);
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
    .card-category {
      margin: 0 0 var(--space-1);
      font-size: 12px;
      font-weight: 700;
      color: var(--brand);
      text-transform: uppercase;
      font-family: var(--font-display);
      letter-spacing: 0.04em;
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
    @media (max-width: 768px) {
      .site-tagline { display: none; }
      .hub-title { font-size: 32px; }
      .cards-grid { grid-template-columns: 1fr; }
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
      <li class="breadcrumb-item"><a href="${SITE_URL}${prefix}/">${getSSRText('breadcrumb_architects', lang)}</a></li>
      <li class="breadcrumb-sep" aria-hidden="true">/</li>
      <li class="breadcrumb-item active" aria-current="page">${escapeHtml(canonicalName)}</li>
    </ol>
  </nav>

  <section class="hub-header">
    <span class="hub-badge">${isStudioMode ? studioKicker : getSSRText('breadcrumb_architects', lang)}</span>
    <h1 class="hub-title">${escapeHtml(canonicalName)}</h1>
    ${relationsHtml}
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

  ${renderSiteFooter(lang, SITE_URL)}
</main>
</body>
</html>`;
}

function renderArchitectNotFoundPage(rawInput, lang = 'es') {
  const prefix = getLangPrefix(lang);
  const title = getSSRText('not_found_architect_title', lang);
  const heading = getSSRText('not_found_title', lang);
  const tag = getSSRText('not_found_tag', lang);
  const text = getSSRText('not_found_architect_text', lang);
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
    const rawInput = String(request.query?.slug || request.query?.nombre || '').trim();
    if (!rawInput) {
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
      return response.status(400).send('Falta el nombre o slug del arquitecto.');
    }

    const cleanSlug = slugify(rawInput);
    const page = Math.max(1, parseInt(String(request.query?.page || '1'), 10) || 1);
    const prefix = getLangPrefix(lang);

    // 2. Si es un arquitecto genérico o ignorado (p.ej. 'autor-desconocido', 'sin-arquitecto')
    if (isIgnoredArchitect(rawInput) || isIgnoredArchitect(cleanSlug)) {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      response.setHeader('Vercel-Cache-Tag', 'architect-404,catalog');
      response.setHeader('Cache-Tag', 'architect-404,catalog');
      response.setHeader('X-Robots-Tag', 'noindex, follow');
      return response.status(404).send(renderArchitectNotFoundPage(rawInput, lang));
    }

    // 3. Comprobación de alias directo (p.ej. javier-goerlich-lleo -> francisco-javier-goerlich)
    if (ARCHITECT_ALIASES[cleanSlug]) {
      const aliasTarget = ARCHITECT_ALIASES[cleanSlug];
      const pageParam = page > 1 ? `?page=${page}` : '';
      const redirectUrl = `${SITE_URL}${prefix}/arquitecto/${encodeURIComponent(aliasTarget)}${pageParam}`;
      response.setHeader('Location', redirectUrl);
      response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      response.setHeader('Vercel-Cache-Tag', `architect-redirect,architect-${aliasTarget},catalog`);
      return response.status(301).send(`Redirecting to ${redirectUrl}`);
    }

    // 4. Consulta de datos del arquitecto
    let architectData = await fetchArchitectData(rawInput, page);

    // 5. Si no hay obras con el slug exacto: intentar búsqueda relajada si tiene 3 o más palabras (p.ej. nombre-apellido1-apellido2)
    if (!architectData || architectData.totalCount === 0) {
      const parts = cleanSlug.split('-').filter(Boolean);
      if (parts.length >= 3) {
        const relaxedSlug = parts.slice(0, -1).join('-');
        const relaxedData = await fetchArchitectData(relaxedSlug, page).catch(() => null);
        if (relaxedData && relaxedData.totalCount > 0 && relaxedData.canonicalSlug) {
          const pageParam = page > 1 ? `?page=${page}` : '';
          const redirectUrl = `${SITE_URL}${prefix}/arquitecto/${encodeURIComponent(relaxedData.canonicalSlug)}${pageParam}`;
          response.setHeader('Location', redirectUrl);
          response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
          response.setHeader('Vercel-Cache-Tag', `architect-redirect,architect-${relaxedData.canonicalSlug},catalog`);
          return response.status(301).send(`Redirecting to ${redirectUrl}`);
        }
      }

      // Si tras la búsqueda relajada no existen obras: 404 estricto + noindex, follow
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
      response.setHeader('Vercel-Cache-Tag', 'architect-404,catalog');
      response.setHeader('Cache-Tag', 'architect-404,catalog');
      response.setHeader('X-Robots-Tag', 'noindex, follow');
      return response.status(404).send(renderArchitectNotFoundPage(rawInput, lang));
    }

    // 6. Redirección canónica si el slug consultado difiere del slug canónico del arquitecto
    const canonicalSlug = architectData.canonicalSlug;
    if (canonicalSlug && canonicalSlug !== cleanSlug) {
      const pageParam = page > 1 ? `?page=${page}` : '';
      const redirectUrl = `${SITE_URL}${prefix}/arquitecto/${encodeURIComponent(canonicalSlug)}${pageParam}`;
      response.setHeader('Location', redirectUrl);
      response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      response.setHeader('Vercel-Cache-Tag', `architect-redirect,architect-${canonicalSlug},catalog`);
      return response.status(301).send(`Redirecting to ${redirectUrl}`);
    }

    // 7. Verificación estricta de seguridad: si no hay obras catalogadas, NUNCA generar ficha ni indexar
    if (!architectData || !architectData.totalCount || architectData.totalCount <= 0 || !Array.isArray(architectData.buildings) || (architectData.buildings.length === 0 && page === 1)) {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
      response.setHeader('Vercel-Cache-Tag', 'architect-404,catalog');
      response.setHeader('Cache-Tag', 'architect-404,catalog');
      response.setHeader('X-Robots-Tag', 'noindex, follow');
      return response.status(404).send(renderArchitectNotFoundPage(rawInput, lang));
    }

    // 8. Renderizado exitoso (200 OK)
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=172800, stale-while-revalidate=604800');
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
