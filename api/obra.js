const { categoryClass, categoryLabel } = require('./_lib/categories.js');
const { detectServerLanguage, getLangPrefix, getSSRText, getHreflangTags, getOgLocaleTags, renderSiteFooter } = require('./_lib/i18n.js');
const { slugify, isIgnoredArchitect, ARCHITECT_ALIASES, cleanArchitectName, parseArchitectsAndInterventions } = require('./_lib/slugs.js');
const { createRateLimiter } = require('./_lib/rateLimiter.js');
const { getSupabaseConfig } = require('./_lib/supabaseEnv.js');

const checkRateLimit = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 60 });

const SITE_URL = 'https://nollimap.app';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildingDescription(building) {
  return [building.nombre_obra, building.arquitecto, building.place, building.año_construccion]
    .filter(Boolean)
    .join(' | ');
}

function getOptimizedUrl(fotoUrl, width = 1200) {
  if (!fotoUrl) return '';
  try {
    const url = new URL(fotoUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return fotoUrl;
    return `https://wsrv.nl/?url=${encodeURIComponent(url.href)}&w=${width}&q=80&output=webp`;
  } catch {
    return fotoUrl;
  }
}

async function fetchPublicBuilding(id) {
  const { supabaseUrl, serviceRoleKey: supabaseKey } = getSupabaseConfig();

  const fields = 'id,nombre_obra,arquitecto,año_construccion,categoria,place,foto_url,foto_credito,foto_licencia,enlace_url,latitud,longitud,estado_revision';
  const params = new URLSearchParams({
    select: fields,
    id: `eq.${id}`,
    or: '(estado_revision.eq.publicada,estado_revision.is.null)',
    limit: '1',
  });
  const result = await fetch(`${supabaseUrl}/rest/v1/Buildings?${params}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });
  if (!result.ok) return null;
  const buildings = await result.json().catch(() => []);
  return buildings[0] || null;
}

function renderBuildingPage(building, lang = 'es') {
  const prefix = getLangPrefix(lang);
  const canonicalUrl = `${SITE_URL}/obra/${encodeURIComponent(building.id)}`;
  const title = `${building.nombre_obra} | nolli.`;
  const description = buildingDescription(building) || getSSRText('default_work_desc', lang);
  const image = building.foto_url || `${SITE_URL}/icon.svg`;
  const categoriaSlug = building.categoria || 'otro';
  const categoriaText = categoryLabel(building.categoria, lang);
  const isIndexable = lang === 'es';

  let architectHtml = '';
  let interventionsHtml = '';
  let interventionsSubtitleHtml = '';
  const validArchitects = [];

  const { arquitectos: cleanArchitects, intervenciones } = parseArchitectsAndInterventions(building.arquitecto);

  if (cleanArchitects.length > 0) {
    const renderedParts = cleanArchitects.map((name) => {
      if (isIgnoredArchitect(name)) {
        return escapeHtml(name);
      }
      const rawSlug = slugify(name);
      const slug = (ARCHITECT_ALIASES && ARCHITECT_ALIASES[rawSlug]) || rawSlug;
      if (!slug || isIgnoredArchitect(slug)) {
        return escapeHtml(name);
      }
      validArchitects.push(name);
      return `<a class="architect-link" href="${SITE_URL}${prefix}/arquitecto/${encodeURIComponent(slug)}">${escapeHtml(name)}</a>`;
    });
    architectHtml = renderedParts.join(', ');
  }

  if (intervenciones.length > 0) {
    interventionsHtml = intervenciones.map((inv) => {
      const rawSlug = slugify(inv.arquitecto);
      const slug = (ARCHITECT_ALIASES && ARCHITECT_ALIASES[rawSlug]) || rawSlug;
      const link = (slug && !isIgnoredArchitect(slug))
        ? `<a class="architect-link" href="${SITE_URL}${prefix}/arquitecto/${encodeURIComponent(slug)}">${escapeHtml(inv.arquitecto)}</a>`
        : escapeHtml(inv.arquitecto);
      return `Intervención en ${escapeHtml(inv.año)} por ${link}`;
    }).join('<br>');

    interventionsSubtitleHtml = intervenciones.map((inv) => {
      const rawSlug = slugify(inv.arquitecto);
      const slug = (ARCHITECT_ALIASES && ARCHITECT_ALIASES[rawSlug]) || rawSlug;
      const link = (slug && !isIgnoredArchitect(slug))
        ? `<a class="architect-link" href="${SITE_URL}${prefix}/arquitecto/${encodeURIComponent(slug)}">${escapeHtml(inv.arquitecto)}</a>`
        : escapeHtml(inv.arquitecto);
      return `Intervención en ${escapeHtml(inv.año)} por ${link}`;
    }).join(' · ');
  }

  const detailsList = [
    cleanArchitects.length > 0 && { label: getSSRText('label_architecture', lang), value: architectHtml, isHtml: true },
    intervenciones.length > 0 && {
      label: intervenciones.length === 1 ? getSSRText('label_intervention', lang) : getSSRText('label_interventions', lang),
      value: interventionsHtml,
      isHtml: true,
    },
    building.año_construccion && { label: getSSRText('label_year', lang), value: escapeHtml(building.año_construccion) },
    building.categoria && {
      label: getSSRText('label_category', lang),
      value: `<a href="${SITE_URL}${prefix}/categoria/${encodeURIComponent(categoriaSlug)}" class="badge-category category-${categoryClass(building.categoria)}"><span class="dot"></span>${escapeHtml(categoriaText)}</a>`,
      isHtml: true,
    },
    building.place && { label: getSSRText('label_place', lang), value: escapeHtml(building.place) },
    building.enlace_url && {
      label: 'Info',
      value: `<a href="${escapeHtml(building.enlace_url)}" target="_blank" rel="noopener noreferrer">Wikipedia / Web ↗</a>`,
      isHtml: true,
    },
  ].filter(Boolean);

  const detailsRowsHtml = detailsList.map((item) => `
    <li class="tech-row">
      <span class="tech-label">${escapeHtml(item.label)}</span>
      <span class="tech-value">${item.isHtml ? item.value : escapeHtml(item.value)}</span>
    </li>
  `).join('');

  const placeSchema = {
    '@context': 'https://schema.org',
    '@type': ['Place', 'LandmarksOrHistoricalBuildings'],
    name: building.nombre_obra,
    description,
    url: canonicalUrl,
    image: {
      '@type': 'ImageObject',
      url: image,
      ...(building.foto_credito ? { creditText: building.foto_credito } : {}),
      ...(building.foto_licencia ? { license: building.foto_licencia } : {}),
    },
    ...(building.latitud && building.longitud ? {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: building.latitud,
        longitude: building.longitud,
      },
    } : {}),
    ...(building.arquitecto || building.año_construccion ? {
      subjectOf: {
        '@type': 'CreativeWork',
        ...(validArchitects.length > 0 ? {
          creator: validArchitects.length === 1
            ? { '@type': 'Person', name: validArchitects[0] }
            : validArchitects.map((name) => ({ '@type': 'Person', name })),
        } : (building.arquitecto && !isIgnoredArchitect(building.arquitecto) ? {
          creator: {
            '@type': 'Person',
            name: building.arquitecto,
          },
        } : {})),
        ...(building.año_construccion ? {
          dateCreated: String(building.año_construccion),
        } : {}),
      },
    } : {}),
  };

  const breadcrumbSchema = {
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
        name: categoriaText,
        item: `${SITE_URL}${prefix}/categoria/${encodeURIComponent(categoriaSlug)}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: building.nombre_obra,
        item: canonicalUrl,
      },
    ],
  };

  const schemaJson = JSON.stringify(placeSchema).replace(/</g, '\\u003c');
  const breadcrumbJson = JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c');

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
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="nolli.">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(image)}">
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
      --bg-row-alt: rgba(20, 20, 17, 0.02);
      --ink: #141411;
      --ink-dim: #6B6B6B;
      --border: #D8D6CE;
      --border-subtle: rgba(20, 20, 17, 0.08);
      --border-strong: #141411;
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
      --radius-md: 10px;
      --radius-lg: 16px;
      --radius-pill: 9999px;
      --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02);
      --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.03);
      --shadow-accent: 0 3px 12px rgba(234, 86, 13, 0.28);
      
      --cat-residential: #EA560D;
      --cat-institutional: #F6A600;
      --cat-industrial: #163D62;
      --cat-religious: #F6B9C5;
      --cat-commercial: #007BC3;
      --cat-public-space: #007446;
      --cat-infrastructure: #E02523;
      --cat-other: #492900;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #141411;
        --bg-card: #1B1B18;
        --bg-elevated: #242420;
        --bg-row-alt: rgba(255, 255, 255, 0.03);
        --ink: #F4F1EA;
        --ink-dim: #9E9E94;
        --border: rgba(255, 255, 255, 0.12);
        --border-subtle: rgba(255, 255, 255, 0.08);
        --border-strong: rgba(255, 255, 255, 0.25);
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
      width: min(100% - 32px, 1040px);
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
    .work-card {
      background: var(--bg-card);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border);
      box-shadow: var(--shadow-md);
      padding: var(--space-4);
      margin-bottom: var(--space-6);
    }
    .work-header {
      margin-bottom: var(--space-4);
    }
    .badge-category {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      font-family: var(--font-display);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ink);
      text-decoration: none;
      margin-bottom: 12px;
      transition: transform 0.12s ease;
    }
    .badge-category:hover {
      transform: translateY(-1px);
    }
    .badge-category .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--cat-other);
      display: inline-block;
    }
    .category-residential .dot { background: var(--cat-residential); }
    .category-institutional .dot { background: var(--cat-institutional); }
    .category-industrial .dot { background: var(--cat-industrial); }
    .category-religious .dot { background: var(--cat-religious); }
    .category-commercial .dot { background: var(--cat-commercial); }
    .category-public-space .dot { background: var(--cat-public-space); }
    .category-infrastructure .dot { background: var(--cat-infrastructure); }
    .work-title {
      margin: 0 0 8px 0;
      font-family: var(--font-display);
      font-size: clamp(30px, 5vw, 50px);
      font-weight: 900;
      letter-spacing: -0.025em;
      line-height: 1.08;
      color: var(--ink);
    }
    .work-subtitle {
      margin: 0;
      font-size: 16px;
      font-weight: 500;
      color: var(--ink-dim);
    }
    .work-subtitle a {
      color: var(--brand);
      text-decoration: none;
      font-weight: 600;
    }
    .work-subtitle a:hover {
      text-decoration: underline;
    }
    .work-intervention-subtitle {
      margin: 4px 0 0 0;
      font-size: 13.5px;
      font-weight: 500;
      color: var(--ink-dim);
    }
    .work-intervention-subtitle a {
      color: var(--brand);
      text-decoration: none;
      font-weight: 600;
    }
    .work-intervention-subtitle a:hover {
      text-decoration: underline;
    }
    .work-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(280px, 1fr);
      gap: var(--space-4);
      align-items: start;
    }
    .image-wrapper {
      position: relative;
      border-radius: var(--radius-md);
      overflow: hidden;
      border: 1px solid var(--border);
      background: var(--bg-elevated);
      box-shadow: var(--shadow-sm);
    }
    .work-image {
      display: block;
      width: 100%;
      min-height: 280px;
      max-height: 480px;
      object-fit: cover;
    }
    .image-caption {
      padding: 8px 12px;
      font-size: 11px;
      color: var(--ink-dim);
      background: var(--bg-elevated);
      border-top: 1px solid var(--border-subtle);
    }
    .work-actions {
      margin-top: var(--space-3);
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .btn-primary-map {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 22px;
      border-radius: var(--radius-sm);
      background: var(--accent);
      color: #FFFFFF;
      font-family: var(--font-display);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      text-decoration: none;
      box-shadow: var(--shadow-accent);
      transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
    }
    .btn-primary-map:hover {
      background: var(--accent-hover);
      transform: translateY(-2px);
      box-shadow: 0 5px 16px rgba(234, 86, 13, 0.4);
    }
    .tech-card {
      background: var(--bg-elevated);
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .tech-card-header {
      padding: 12px 16px;
      background: var(--bg-row-alt);
      border-bottom: 1px solid var(--border);
      font-family: var(--font-display);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ink-dim);
    }
    .tech-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tech-row {
      display: grid;
      grid-template-columns: 110px 1fr;
      padding: 11px 16px;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 13px;
      align-items: baseline;
    }
    .tech-row:last-child {
      border-bottom: none;
    }
    .tech-label {
      font-family: var(--font-display);
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--ink-dim);
    }
    .tech-value {
      font-weight: 500;
      color: var(--ink);
      overflow-wrap: anywhere;
    }
    .tech-value a {
      color: var(--brand);
      text-decoration: none;
      font-weight: 600;
    }
    .tech-value a:hover {
      text-decoration: underline;
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
      .work-card { padding: 20px 16px; border-radius: var(--radius-md); }
      .work-layout { grid-template-columns: 1fr; gap: var(--space-3); }
      .work-title { font-size: 32px; }
      .work-image { min-height: 220px; }
      .tech-row { grid-template-columns: 95px 1fr; padding: 10px 14px; font-size: 12.5px; }
      .site-tagline { display: none; }
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
        <li class="breadcrumb-item"><a href="${SITE_URL}${prefix}/categoria/${encodeURIComponent(categoriaSlug)}">${escapeHtml(categoriaText)}</a></li>
        <li class="breadcrumb-sep" aria-hidden="true">/</li>
        <li class="breadcrumb-item active" aria-current="page">${escapeHtml(building.nombre_obra)}</li>
      </ol>
    </nav>

    <article class="work-card">
      <div class="work-header">
        <a href="${SITE_URL}${prefix}/categoria/${encodeURIComponent(categoriaSlug)}" class="badge-category category-${categoryClass(building.categoria)}">
          <span class="dot"></span>
          ${escapeHtml(categoriaText)}
        </a>
        <h1 class="work-title">${escapeHtml(building.nombre_obra)}</h1>
        ${architectHtml ? `<p class="work-subtitle">${architectHtml}</p>` : ''}
        ${interventionsSubtitleHtml ? `<p class="work-intervention-subtitle">${interventionsSubtitleHtml}</p>` : ''}
      </div>

      <div class="work-layout">
        <div>
          ${building.foto_url ? `
            <div class="image-wrapper">
              <img class="work-image" src="${escapeHtml(getOptimizedUrl(building.foto_url, 1200))}" alt="${escapeHtml(building.nombre_obra)}" loading="eager" decoding="async" fetchpriority="high">
              ${(building.foto_credito || building.foto_licencia) ? `
                <div class="image-caption">
                  ${building.foto_credito ? `<span>Foto: ${escapeHtml(building.foto_credito)}</span>` : ''}
                  ${building.foto_licencia ? `<span>(${escapeHtml(building.foto_licencia)})</span>` : ''}
                </div>
              ` : ''}
            </div>
          ` : ''}

          <div class="work-actions">
            <a class="btn-primary-map" href="${SITE_URL}${prefix}/?obra=${encodeURIComponent(building.id)}">
              ${escapeHtml(getSSRText('view_on_map', lang))}
              <span aria-hidden="true">&#8599;</span>
            </a>
          </div>
        </div>

        ${detailsRowsHtml ? `
          <div class="tech-card">
            <div class="tech-card-header">Ficha Técnica</div>
            <ul class="tech-list">
              ${detailsRowsHtml}
            </ul>
          </div>
        ` : ''}
      </div>
    </article>

    ${renderSiteFooter(lang, SITE_URL)}
  </main>
</body>
</html>`;
}

function renderNotFoundPage(lang = 'es') {
  const prefix = getLangPrefix(lang);
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <base href="/">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(getSSRText('not_found_page_title', lang))}</title>
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
      font-size: 15px;
      line-height: 1.55;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .page {
      width: min(100% - 32px, 720px);
      margin: 0 auto;
      padding: 32px 0 64px;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .site-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    .brand-logo {
      color: var(--ink);
      font-family: var(--font-display);
      font-size: 26px;
      font-weight: 900;
      letter-spacing: -0.03em;
      text-decoration: none;
    }
    .brand-logo .dot { color: var(--brand); }
    .not-found-card {
      margin-top: 48px;
      border: 1px solid var(--border);
      background: var(--bg-card);
      padding: 36px 32px;
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
    }
    .not-found-tag {
      display: inline-block;
      font-family: var(--font-display);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--brand);
      margin-bottom: 12px;
    }
    .not-found-title {
      margin: 0 0 16px;
      font-family: var(--font-display);
      font-size: clamp(32px, 5.5vw, 48px);
      font-weight: 900;
      letter-spacing: -0.02em;
      line-height: 1.1;
      color: var(--ink);
    }
    .not-found-text {
      margin: 0 0 28px;
      color: var(--ink-dim);
      font-size: 15px;
      max-width: 52ch;
      line-height: 1.6;
    }
    .map-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 22px;
      border-radius: var(--radius-sm);
      background: var(--brand);
      color: #FFFFFF;
      font-family: var(--font-display);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-decoration: none;
      text-transform: uppercase;
      box-shadow: 0 3px 12px rgba(234, 86, 13, 0.28);
      transition: transform 0.12s ease, box-shadow 0.12s ease;
    }
    .map-link:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 16px rgba(234, 86, 13, 0.4);
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="site-header">
      <a href="${SITE_URL}${prefix}/" class="brand-logo">nolli<span class="dot">.</span></a>
      <span style="font-size:12px;color:var(--ink-dim);">${escapeHtml(getSSRText('tagline', lang))}</span>
    </header>
    <div class="not-found-card">
      <span class="not-found-tag">${escapeHtml(getSSRText('not_found_tag', lang))}</span>
      <h1 class="not-found-title">${escapeHtml(getSSRText('not_found_title', lang))}</h1>
      <p class="not-found-text">${escapeHtml(getSSRText('not_found_text', lang))}</p>
      <a class="map-link" href="${SITE_URL}${prefix}/">${escapeHtml(getSSRText('go_to_map', lang))} <span aria-hidden="true">&#8599;</span></a>
    </div>
  </main>
</body>
</html>`;
}

module.exports = async (request, response) => {
  const lang = detectServerLanguage(request);
  const isIndexable = lang === 'es';
  response.setHeader('X-Robots-Tag', isIndexable ? 'index, follow' : 'noindex, follow');

  // 1. Rate limiting defensivo por IP en caso de cache MISS
  const rate = checkRateLimit(request, response);
  if (rate.limited) {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    return response.status(429).send(`<!DOCTYPE html><html><head><title>Too Many Requests</title></head><body style="font-family:'Inter',sans-serif;padding:40px;text-align:center;"><h1>429 - Límite de solicitudes excedido</h1><p>Has realizado demasiadas consultas. Por favor, espera un momento.</p></body></html>`);
  }

  try {
    const id = String(request.query?.id || '').trim();
    if (!id) {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
      response.setHeader('Vercel-Cache-Tag', 'obra-404,catalog');
      response.setHeader('Cache-Tag', 'obra-404,catalog');
      return response.status(404).send(renderNotFoundPage(lang));
    }

    const building = await fetchPublicBuilding(id);
    if (!building) {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
      response.setHeader('Vercel-Cache-Tag', 'obra-404,catalog');
      response.setHeader('Cache-Tag', 'obra-404,catalog');
      return response.status(404).send(renderNotFoundPage(lang));
    }

    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Cache Edge CDN: 24 horas fresca (86400s), hasta 7 días sirviendo stale mientras revalida en background
    response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    // Tags granulares para invalidación selectiva por ID de obra sin purgar todo el catálogo
    const cacheTag = `building-${id},obra-${id},catalog`;
    response.setHeader('Vercel-Cache-Tag', cacheTag);
    response.setHeader('Cache-Tag', cacheTag);
    return response.status(200).send(renderBuildingPage(building, lang));
  } catch (error) {
    console.error('Error al generar la ficha de obra:', error);
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
    return response.status(404).send(renderNotFoundPage(lang));
  }
};