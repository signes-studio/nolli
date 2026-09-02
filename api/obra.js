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

function categoryClass(category) {
  return {
    residencial: 'residential',
    dotacional_equipamiento: 'institutional',
    industrial_logistico: 'industrial',
    religioso_funerario: 'religious',
    comercial_terciario: 'commercial',
    espacio_publico_paisaje: 'public-space',
    infraestructura_urbanismo: 'infrastructure',
  }[category] || 'other';
}

function categoryLabel(category) {
  return {
    residencial: 'Residencial',
    dotacional_equipamiento: 'Dotacional / Equipamiento',
    industrial_logistico: 'Industrial / Logístico',
    religioso_funerario: 'Religioso / Funerario',
    comercial_terciario: 'Comercial / Terciario',
    espacio_publico_paisaje: 'Espacio Público / Paisaje',
    infraestructura_urbanismo: 'Infraestructura / Urbanismo',
  }[category] || 'Otros';
}

async function fetchPublicBuilding(id) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel.');
  }

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
  if (!result.ok) throw new Error(`Supabase devolvió ${result.status}.`);
  const buildings = await result.json();
  return buildings[0] || null;
}

function renderBuildingPage(building) {
  const canonicalUrl = `${SITE_URL}/obra/${encodeURIComponent(building.id)}`;
  const title = `${building.nombre_obra} | nolli.`;
  const description = buildingDescription(building) || 'Ficha de obra en nolli, radar arquitectónico.';
  const image = building.foto_url || `${SITE_URL}/icon.svg`;
  const categoriaSlug = building.categoria || 'otro';
  const categoriaText = categoryLabel(building.categoria);

  const architectHtml = building.arquitecto
    ? `<a class="architect-link" href="${SITE_URL}/arquitecto/${encodeURIComponent(building.arquitecto)}">${escapeHtml(building.arquitecto)}</a>`
    : '';

  const details = [
    building.arquitecto && ['Arquitectura', architectHtml, ''],
    building.año_construccion && ['Año', escapeHtml(building.año_construccion), ''],
    building.categoria && ['Categoría', escapeHtml(categoriaText), `detail-category category-${categoryClass(building.categoria)}`],
    building.place && ['Lugar', escapeHtml(building.place), ''],
  ].filter(Boolean).map(([label, value, className = '']) => (
    `<div class="detail-row"><dt>${escapeHtml(label)}</dt><dd class="${className}">${value}</dd></div>`
  )).join('');

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
        ...(building.arquitecto ? {
          creator: {
            '@type': 'Person',
            name: building.arquitecto,
          },
        } : {}),
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
        item: `${SITE_URL}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: categoriaText,
        item: `${SITE_URL}/categoria/${encodeURIComponent(categoriaSlug)}`,
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
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="nolli.">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=League+Spartan:wght@700;800;900&display=swap" rel="stylesheet">
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
      --semantic-info: #064773;
      --cat-residential: #E95C0C;
      --cat-institutional: #EFBC02;
      --cat-industrial: #064773;
      --cat-religious: #F2ACCD;
      --cat-commercial: #4388C6;
      --cat-public-space: #0D682F;
      --cat-infrastructure: #E41F23;
      --cat-other: #691B14;
      --font-display: 'League Spartan', sans-serif;
      --font-body: 'Inter', sans-serif;
      --space-1: 8px;
      --space-2: 16px;
      --space-3: 24px;
      --space-4: 32px;
      --space-6: 48px;
      --space-8: 64px;
      --radius: 0px;
      --border-width-hairline: 1px;
      --border-width-strong: 2px;
      --shadow-hard: 4px 4px 0 var(--ink);
    }
    * { box-sizing: border-box; border-radius: var(--radius); }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font-body); font-size: 16px; line-height: 1.5; }
    .page { width: min(100% - var(--space-4), 960px); margin: 0 auto; padding: var(--space-4) 0 var(--space-8); }
    .site-header { display: flex; align-items: baseline; gap: var(--space-1); padding-bottom: var(--space-2); border-bottom: var(--border-width-strong) solid var(--border-strong); color: var(--ink-dim); font-size: 12px; text-transform: uppercase; }
    .site-header a { color: var(--brand); font-family: var(--font-display); font-size: 24px; font-weight: 900; letter-spacing: -0.02em; text-decoration: none; text-transform: lowercase; }
    .breadcrumb-nav { margin-top: var(--space-2); }
    .breadcrumb-list { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); list-style: none; margin: 0; padding: 0; font-family: var(--font-display); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-dim); }
    .breadcrumb-item a { color: var(--ink-dim); text-decoration: none; border-bottom: 1px solid transparent; }
    .breadcrumb-item a:hover { color: var(--brand); border-bottom-color: var(--brand); }
    .breadcrumb-separator { color: var(--border-strong); user-select: none; }
    .breadcrumb-item.active { color: var(--ink); }
    .architect-link { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
    .architect-link:hover { color: var(--brand); }
    .work-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(220px, 1fr); gap: var(--space-4); padding-top: var(--space-6); }
    .work-title { margin: 0; font-family: var(--font-display); font-size: clamp(42px, 7vw, 76px); font-weight: 900; letter-spacing: -0.03em; line-height: .9; text-transform: uppercase; }
    .work-intro { max-width: 68ch; margin: var(--space-3) 0 0; color: var(--ink-dim); }
    .work-image { display: block; width: 100%; min-height: 280px; max-height: 540px; margin-top: var(--space-4); border: var(--border-width-strong) solid var(--border-strong); object-fit: cover; }
    .details { align-self: end; margin: 0; border-top: var(--border-width-strong) solid var(--border-strong); border-bottom: var(--border-width-strong) solid var(--border-strong); }
    .detail-row { display: grid; grid-template-columns: minmax(88px, .8fr) minmax(0, 1.2fr); border-bottom: var(--border-width-hairline) solid var(--border-strong); }
    .detail-row:last-child { border-bottom: 0; }
    dt, dd { margin: 0; padding: var(--space-1); }
    dt { background: var(--bg-elevated); border-right: var(--border-width-hairline) solid var(--border-strong); color: var(--ink-dim); font-family: var(--font-display); font-size: 10px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    dd { color: var(--ink); font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
    .detail-category { display: flex; align-items: center; font-family: var(--font-display); font-size: 11px; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; }
    .detail-category::before { content: ''; width: var(--space-1); height: var(--space-1); margin-right: var(--space-1); background: var(--cat-other); }
    .category-residential::before { background: var(--cat-residential); }
    .category-institutional::before { background: var(--cat-institutional); }
    .category-industrial::before { background: var(--cat-industrial); }
    .category-religious::before { background: var(--cat-religious); }
    .category-commercial::before { background: var(--cat-commercial); }
    .category-public-space::before { background: var(--cat-public-space); }
    .category-infrastructure::before { background: var(--cat-infrastructure); }
    .map-link { display: inline-flex; align-items: center; gap: var(--space-1); margin-top: var(--space-4); padding: var(--space-2); border: var(--border-width-hairline) solid var(--border-strong); background: var(--ink); color: var(--bg); font-family: var(--font-display); font-size: 13px; font-weight: 800; letter-spacing: .04em; text-decoration: none; text-transform: uppercase; }
    .map-link:hover, .map-link:focus-visible { box-shadow: var(--shadow-hard); outline: var(--border-width-hairline) solid var(--border-strong); outline-offset: 2px; }
    @media (max-width: 720px) { .page { width: min(100% - var(--space-3), 960px); padding-top: var(--space-3); } .work-grid { grid-template-columns: 1fr; gap: var(--space-3); padding-top: var(--space-4); } .work-title { font-size: 46px; } .work-image { min-height: 220px; margin-top: var(--space-3); } .details { order: 2; } }
  </style>
</head>
<body><main class="page">
  <header class="site-header"><a href="${SITE_URL}/">nolli.</a><span>/ radar arquitectónico</span></header>
  <nav aria-label="breadcrumb" class="breadcrumb-nav">
    <ol class="breadcrumb-list">
      <li class="breadcrumb-item"><a href="${SITE_URL}/">nolli.</a></li>
      <li class="breadcrumb-separator" aria-hidden="true">/</li>
      <li class="breadcrumb-item"><a href="${SITE_URL}/categoria/${encodeURIComponent(categoriaSlug)}">${escapeHtml(categoriaText)}</a></li>
      <li class="breadcrumb-separator" aria-hidden="true">/</li>
      <li class="breadcrumb-item active" aria-current="page">${escapeHtml(building.nombre_obra)}</li>
    </ol>
  </nav>
  <div class="work-grid">
    <section>
      <h1 class="work-title">${escapeHtml(building.nombre_obra)}</h1>
      <p class="work-intro">${escapeHtml(description)}</p>
      ${building.foto_url ? `<img class="work-image" src="${escapeHtml(building.foto_url)}" alt="${escapeHtml(building.nombre_obra)}">` : ''}
      <a class="map-link" href="${SITE_URL}/?obra=${encodeURIComponent(building.id)}">Ver en el mapa <span aria-hidden="true">&#8599;</span></a>
    </section>
    ${details ? `<dl class="details">${details}</dl>` : ''}
  </div>
</main></body></html>`;
}

module.exports = async (request, response) => {
  try {
    const id = String(request.query?.id || '').trim();
    if (!id) {
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return response.status(400).send('Falta el identificador de obra.');
    }
    const building = await fetchPublicBuilding(id);
    if (!building) {
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return response.status(404).send('Obra no encontrada.');
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return response.status(200).send(renderBuildingPage(building));
  } catch (error) {
    console.error('No se pudo generar la ficha de obra:', error);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return response.status(500).send('No se pudo cargar la ficha de obra.');
  }
};