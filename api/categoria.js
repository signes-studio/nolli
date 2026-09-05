const { categoryLabel, categoryClass, isValidCategory } = require('./_lib/categories.js');

const SITE_URL = 'https://nollimap.app';
const PAGE_SIZE = 60;
const FALLBACK_SUPABASE_URL = 'https://ldtfvpjigzvcagtciipn.supabase.co';
const FALLBACK_SUPABASE_KEY = 'sb_publishable_kYQ7Fa8nBsrkp1f8C4AuAg_4-5uBFm0';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getOptimizedUrl(fotoUrl, width = 480) {
  if (!fotoUrl) return '';
  try {
    const url = new URL(fotoUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return fotoUrl;
    return `https://wsrv.nl/?url=${encodeURIComponent(url.href)}&w=${width}&q=75&output=webp`;
  } catch {
    return fotoUrl;
  }
}

async function fetchCategoryBuildings(slug, page) {
  const supabaseUrl = process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_KEY;

  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE - 1;

  const params = new URLSearchParams({
    select: 'id,nombre_obra,arquitecto,año_construccion,place,foto_url,categoria',
    categoria: `eq.${slug}`,
    or: '(estado_revision.eq.publicada,estado_revision.is.null)',
    order: 'id.asc',
  });

  const response = await fetch(`${supabaseUrl}/rest/v1/Buildings?${params}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: 'count=exact',
      Range: `${start}-${end}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase devolvió ${response.status}.`);
  }

  let totalCount = 0;
  const contentRange = response.headers.get('content-range');
  if (contentRange && contentRange.includes('/')) {
    const totalPart = contentRange.split('/')[1];
    if (totalPart && totalPart !== '*') {
      totalCount = parseInt(totalPart, 10) || 0;
    }
  }

  const buildings = await response.json();
  if (!totalCount) totalCount = buildings.length;

  return { buildings, totalCount };
}

function renderCategoryPage(slug, page, buildings, totalCount) {
  const categoriaText = categoryLabel(slug);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const canonicalUrl = `${SITE_URL}/categoria/${encodeURIComponent(slug)}${page > 1 ? `?page=${page}` : ''}`;
  const title = `Arquitectura ${categoriaText} | Obras y Catálogo | nolli.`;
  const description = `Explora ${totalCount} obras de arquitectura en la categoría ${categoriaText}. Radar arquitectónico y mapa interactivo en nolli.`;
  const image = `${SITE_URL}/icons/logo.png`;

  const cardsHtml = buildings.map((b) => {
    const metaParts = [b.arquitecto, b.place, b.año_construccion].filter(Boolean);
    return `
      <article class="work-card">
        <a href="${SITE_URL}/obra/${encodeURIComponent(b.id)}" class="card-link">
          ${b.foto_url
            ? `<img class="card-img" src="${escapeHtml(getOptimizedUrl(b.foto_url, 480))}" alt="${escapeHtml(b.nombre_obra)}" loading="lazy" decoding="async">`
            : `<div class="card-img-placeholder"><span class="card-tag">${escapeHtml(categoriaText)}</span></div>`
          }
          <div class="card-body">
            <h2 class="card-title">${escapeHtml(b.nombre_obra)}</h2>
            ${b.arquitecto ? `<p class="card-architect">${escapeHtml(b.arquitecto)}</p>` : ''}
            ${(b.place || b.año_construccion) ? `<p class="card-meta">${escapeHtml([b.place, b.año_construccion].filter(Boolean).join(' · '))}</p>` : ''}
          </div>
        </a>
      </article>
    `;
  }).join('');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Obras de arquitectura en la categoría ${categoriaText} | nolli.`,
    description,
    url: canonicalUrl,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: buildings.length,
      itemListElement: buildings.map((b, idx) => ({
        '@type': 'ListItem',
        position: (page - 1) * PAGE_SIZE + idx + 1,
        item: {
          '@type': 'Place',
          name: b.nombre_obra,
          url: `${SITE_URL}/obra/${encodeURIComponent(b.id)}`,
          ...(b.place ? { address: b.place } : {}),
        },
      })),
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
        item: `${SITE_URL}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: categoriaText,
        item: `${SITE_URL}/categoria/${encodeURIComponent(slug)}`,
      },
    ],
  };

  const schemaJson = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
  const breadcrumbJson = JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="nolli.">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta name="twitter:card" content="summary_large_image">
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
      --font-display: 'League Spartan', sans-serif;
      --font-body: 'Inter', sans-serif;
      --space-1: 8px;
      --space-2: 16px;
      --space-3: 24px;
      --space-4: 32px;
      --space-6: 48px;
      --space-8: 64px;
      --border-width-hairline: 1px;
      --border-width-strong: 2px;
      --shadow-hard: 4px 4px 0 var(--ink);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font-body); font-size: 16px; line-height: 1.5; }
    .page { width: min(100% - var(--space-4), 1080px); margin: 0 auto; padding: var(--space-4) 0 var(--space-8); }
    .site-header { display: flex; align-items: baseline; gap: var(--space-1); padding-bottom: var(--space-2); border-bottom: var(--border-width-strong) solid var(--border-strong); color: var(--ink-dim); font-size: 12px; text-transform: uppercase; }
    .site-header a { color: var(--brand); font-family: var(--font-display); font-size: 24px; font-weight: 900; letter-spacing: -0.02em; text-decoration: none; text-transform: lowercase; }
    .breadcrumb-nav { margin-top: var(--space-2); }
    .breadcrumb-list { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); list-style: none; margin: 0; padding: 0; font-family: var(--font-display); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-dim); }
    .breadcrumb-item a { color: var(--ink-dim); text-decoration: none; border-bottom: 1px solid transparent; }
    .breadcrumb-item a:hover { color: var(--brand); border-bottom-color: var(--brand); }
    .breadcrumb-separator { color: var(--border-strong); user-select: none; }
    .breadcrumb-item.active { color: var(--ink); }
    .hub-header { margin: var(--space-4) 0 var(--space-4); }
    .hub-title { margin: 0; font-family: var(--font-display); font-size: clamp(36px, 6vw, 64px); font-weight: 900; letter-spacing: -0.03em; line-height: .95; text-transform: uppercase; }
    .hub-subtitle { margin: var(--space-2) 0 0; color: var(--ink-dim); font-size: 15px; font-weight: 500; }
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-3); margin-top: var(--space-4); }
    .work-card { background: var(--bg-elevated); border: var(--border-width-strong) solid var(--border-strong); transition: transform 0.15s ease, box-shadow 0.15s ease; display: flex; flex-direction: column; }
    .work-card:hover { transform: translate(-2px, -2px); box-shadow: var(--shadow-hard); }
    .card-link { color: inherit; text-decoration: none; display: flex; flex-direction: column; height: 100%; }
    .card-img { width: 100%; height: 160px; object-fit: cover; border-bottom: var(--border-width-strong) solid var(--border-strong); background: var(--border); }
    .card-img-placeholder { width: 100%; height: 160px; background: var(--bg); border-bottom: var(--border-width-strong) solid var(--border-strong); display: flex; align-items: center; justify-content: center; }
    .card-tag { font-family: var(--font-display); font-size: 11px; font-weight: 800; letter-spacing: .06em; color: var(--ink-dim); text-transform: uppercase; }
    .card-body { padding: var(--space-2); flex: 1; display: flex; flex-direction: column; }
    .card-title { margin: 0 0 var(--space-1); font-family: var(--font-display); font-size: 16px; font-weight: 800; line-height: 1.2; text-transform: uppercase; color: var(--ink); }
    .card-architect { margin: 0 0 var(--space-1); font-size: 13px; font-weight: 600; color: var(--brand); }
    .card-meta { margin: auto 0 0; font-size: 11px; color: var(--ink-dim); font-weight: 500; }
    .pagination-wrap { display: flex; align-items: center; justify-content: space-between; margin-top: var(--space-6); padding-top: var(--space-3); border-top: var(--border-width-strong) solid var(--border-strong); font-family: var(--font-display); font-size: 13px; font-weight: 800; }
    .btn-page { display: inline-flex; align-items: center; padding: var(--space-1) var(--space-2); background: var(--ink); color: var(--bg); text-decoration: none; text-transform: uppercase; border: var(--border-width-hairline) solid var(--border-strong); }
    .btn-page:hover { box-shadow: var(--shadow-hard); }
    .page-indicator { color: var(--ink-dim); text-transform: uppercase; }
    .empty-msg { padding: var(--space-6) 0; font-size: 15px; color: var(--ink-dim); }
  </style>
</head>
<body><main class="page">
  <header class="site-header"><a href="${SITE_URL}/">nolli.</a><span>/ radar arquitectónico</span></header>
  <nav aria-label="breadcrumb" class="breadcrumb-nav">
    <ol class="breadcrumb-list">
      <li class="breadcrumb-item"><a href="${SITE_URL}/">nolli.</a></li>
      <li class="breadcrumb-separator" aria-hidden="true">/</li>
      <li class="breadcrumb-item active" aria-current="page">${escapeHtml(categoriaText)}</li>
    </ol>
  </nav>

  <section class="hub-header">
    <h1 class="hub-title">${escapeHtml(categoriaText)}</h1>
    <p class="hub-subtitle">${totalCount} obras catalogadas · Página ${page} de ${totalPages}</p>
  </section>

  ${buildings.length > 0 ? `<div class="cards-grid">${cardsHtml}</div>` : `<p class="empty-msg">No se han encontrado obras en esta categoría.</p>`}

  ${totalPages > 1 ? `
    <div class="pagination-wrap">
      ${page > 1 ? `<a class="btn-page" href="${SITE_URL}/categoria/${encodeURIComponent(slug)}?page=${page - 1}">← Página anterior</a>` : '<span></span>'}
      <span class="page-indicator">Página ${page} de ${totalPages}</span>
      ${page < totalPages ? `<a class="btn-page" href="${SITE_URL}/categoria/${encodeURIComponent(slug)}?page=${page + 1}">Cargar más obras →</a>` : '<span></span>'}
    </div>
  ` : ''}
</main></body></html>`;
}

module.exports = async (request, response) => {
  try {
    const rawSlug = String(request.query?.slug || '').trim();
    if (!rawSlug) {
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return response.status(400).send('Falta el parámetro de categoría.');
    }

    const slug = rawSlug.toLowerCase();
    const page = Math.max(1, parseInt(String(request.query?.page || '1'), 10) || 1);

    const { buildings, totalCount } = await fetchCategoryBuildings(slug, page);

    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return response.status(200).send(renderCategoryPage(slug, page, buildings, totalCount));
  } catch (error) {
    console.error('No se pudo generar la página de categoría:', error);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return response.status(500).send('No se pudo cargar la página de categoría.');
  }
};
