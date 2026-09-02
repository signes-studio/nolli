const SITE_URL = 'https://nollimap.app';
const CHUNK_SIZE = 1000;
const FALLBACK_SUPABASE_URL = 'https://ldtfvpjigzvcagtciipn.supabase.co';
const FALLBACK_SUPABASE_KEY = 'sb_publishable_kYQ7Fa8nBsrkp1f8C4AuAg_4-5uBFm0';

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

async function fetchBuildingPage(page) {
  const supabaseUrl = process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_KEY;

  const start = page * CHUNK_SIZE;
  const end = start + CHUNK_SIZE - 1;

  const params = new URLSearchParams({
    select: 'id,updated_at',
    order: 'id.asc',
    or: '(estado_revision.eq.publicada,estado_revision.is.null)',
  });

  const response = await fetch(`${supabaseUrl}/rest/v1/Buildings?${params}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Range: `${start}-${end}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase devolvió ${response.status}.`);
  }

  return response.json();
}

module.exports = async (request, response) => {
  try {
    const rawPage = request.query?.page;
    const page = Math.max(0, parseInt(rawPage || '0', 10) || 0);
    const buildings = await fetchBuildingPage(page);
    const today = new Date().toISOString().slice(0, 10);

    const buildingEntries = (buildings || []).map((building) => {
      const rawDate = building.updated_at || today;
      const lastmod = String(rawDate).slice(0, 10);
      return urlEntry(`${SITE_URL}/obra/${encodeURIComponent(building.id)}`, lastmod, 'weekly', '0.8');
    });

    const sitemap = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...buildingEntries,
      '</urlset>',
    ].join('\n');

    response.setHeader('Content-Type', 'application/xml; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    response.status(200).send(sitemap);
  } catch (error) {
    console.error('No se pudo generar el sitemap de obras:', error);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.status(500).send('No se pudo generar el sitemap de obras.');
  }
};
