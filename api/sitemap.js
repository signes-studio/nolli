const SITE_URL = 'https://nollimap.app';
const PAGE_SIZE = 1000;

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry(location, lastModified, changeFrequency, priority) {
  return [
    '  <url>',
    `    <loc>${escapeXml(location)}</loc>`,
    `    <lastmod>${lastModified}</lastmod>`,
    `    <changefreq>${changeFrequency}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].join('\n');
}

async function fetchPublicBuildingIds() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel.');
  }

  const ids = [];
  let start = 0;

  while (true) {
    const params = new URLSearchParams({
      select: 'id',
      order: 'id.asc',
      or: '(estado_revision.eq.publicada,estado_revision.is.null)',
    });
    const response = await fetch(`${supabaseUrl}/rest/v1/Buildings?${params}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Range: `${start}-${start + PAGE_SIZE - 1}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase devolvió ${response.status}.`);
    }

    const buildings = await response.json();
    ids.push(...buildings.map((building) => building.id).filter(Boolean));
    if (buildings.length < PAGE_SIZE) return ids;
    start += PAGE_SIZE;
  }
}

module.exports = async (request, response) => {
  try {
    const lastModified = new Date().toISOString().slice(0, 10);
    const staticEntries = [
      urlEntry(`${SITE_URL}/`, lastModified, 'daily', '1.0'),
      urlEntry(`${SITE_URL}/landing`, lastModified, 'weekly', '0.9'),
      urlEntry(`${SITE_URL}/perfil`, lastModified, 'weekly', '0.8'),
      urlEntry(`${SITE_URL}/public-profile`, lastModified, 'weekly', '0.7'),
      urlEntry(`${SITE_URL}/legal`, lastModified, 'monthly', '0.3'),
    ];
    const buildingEntries = (await fetchPublicBuildingIds()).map((id) => (
      urlEntry(`${SITE_URL}/obra/${encodeURIComponent(id)}`, lastModified, 'weekly', '0.8')
    ));
    const sitemap = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...staticEntries,
      ...buildingEntries,
      '</urlset>',
    ].join('\n');

    response.setHeader('Content-Type', 'application/xml; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    response.status(200).send(sitemap);
  } catch (error) {
    console.error('No se pudo generar el sitemap:', error);
    response.status(500).type('text/plain').send('No se pudo generar el sitemap.');
  }
};