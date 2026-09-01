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

async function fetchPublicBuilding(id) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel.');
  }

  const fields = 'id,nombre_obra,arquitecto,año_construccion,categoria,place,foto_url,enlace_url,latitud,longitud,estado_revision';
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
  const details = [
    building.arquitecto && ['Arquitectura', building.arquitecto],
    building.año_construccion && ['Año', building.año_construccion],
    building.categoria && ['Categoría', building.categoria],
    building.place && ['Lugar', building.place],
  ].filter(Boolean).map(([label, value]) => (
    `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`
  )).join('');
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: building.nombre_obra,
    url: canonicalUrl,
    description,
    image,
    ...(building.arquitecto ? { architect: { '@type': 'Person', name: building.arquitecto } } : {}),
    ...(building.latitud && building.longitud ? {
      geo: { '@type': 'GeoCoordinates', latitude: building.latitud, longitude: building.longitud },
    } : {}),
  };
  const schemaJson = JSON.stringify(schema).replace(/</g, '\\u003c');

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
  <script type="application/ld+json">${schemaJson}</script>
  <style>body{margin:0;background:#f8f1df;color:#141411;font:16px/1.5 Georgia,serif}.page{max-width:760px;margin:auto;padding:48px 24px}a{color:#b8400d}header{font:700 20px/1 Arial,sans-serif;text-transform:lowercase;letter-spacing:0}h1{font:800 clamp(34px,7vw,64px)/.95 Arial,sans-serif;margin:32px 0 20px;letter-spacing:0}img{display:block;width:100%;max-height:480px;object-fit:cover;margin:28px 0}dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 24px;border-top:1px solid #141411;padding-top:18px}dt{font:700 12px Arial,sans-serif;text-transform:uppercase}dd{margin:0}.map-link{display:inline-block;margin-top:30px;padding:13px 17px;background:#e95c0c;color:#fff;font:700 13px Arial,sans-serif;text-decoration:none;text-transform:uppercase}</style>
</head>
<body><main class="page">
  <header><a href="${SITE_URL}/">nolli.</a> / radar arquitectónico</header>
  <h1>${escapeHtml(building.nombre_obra)}</h1>
  <p>${escapeHtml(description)}</p>
  ${building.foto_url ? `<img src="${escapeHtml(building.foto_url)}" alt="${escapeHtml(building.nombre_obra)}">` : ''}
  ${details ? `<dl>${details}</dl>` : ''}
  <a class="map-link" href="${SITE_URL}/?obra=${encodeURIComponent(building.id)}">Ver en el mapa</a>
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