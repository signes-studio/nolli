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

async function fetchTotalPublicBuildingsCount() {
  const supabaseUrl = process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_KEY;

  const params = new URLSearchParams({
    select: 'id',
    or: '(estado_revision.eq.publicada,estado_revision.is.null)',
    limit: '1',
  });

  const response = await fetch(`${supabaseUrl}/rest/v1/Buildings?${params}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: 'count=exact',
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase devolvió ${response.status}.`);
  }

  const contentRange = response.headers.get('content-range');
  if (contentRange && contentRange.includes('/')) {
    const totalPart = contentRange.split('/')[1];
    if (totalPart && totalPart !== '*') {
      return parseInt(totalPart, 10) || 0;
    }
  }

  // Fallback si no está presente Content-Range
  const allParams = new URLSearchParams({
    select: 'id',
    or: '(estado_revision.eq.publicada,estado_revision.is.null)',
  });
  const allRes = await fetch(`${supabaseUrl}/rest/v1/Buildings?${allParams}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });
  if (allRes.ok) {
    const data = await allRes.json();
    return data.length;
  }

  return 0;
}

module.exports = async (request, response) => {
  try {
    const totalCount = await fetchTotalPublicBuildingsCount();
    const totalPages = Math.max(1, Math.ceil(totalCount / CHUNK_SIZE));
    const today = new Date().toISOString().slice(0, 10);

    const sitemaps = [
      '  <sitemap>',
      `    <loc>${escapeXml(`${SITE_URL}/sitemap-static.xml`)}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      '  </sitemap>',
    ];

    for (let page = 0; page < totalPages; page++) {
      sitemaps.push([
        '  <sitemap>',
        `    <loc>${escapeXml(`${SITE_URL}/sitemap-buildings-${page}.xml`)}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        '  </sitemap>',
      ].join('\n'));
    }

    const sitemapIndex = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...sitemaps,
      '</sitemapindex>',
    ].join('\n');

    response.setHeader('Content-Type', 'application/xml; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    response.status(200).send(sitemapIndex);
  } catch (error) {
    console.error('No se pudo generar el índice de sitemaps:', error);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.status(500).send('No se pudo generar el índice de sitemaps.');
  }
};