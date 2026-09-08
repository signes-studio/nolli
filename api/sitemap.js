const SITE_URL = 'https://nollimap.app';

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = async (request, response) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const sitemaps = [
      '  <sitemap>',
      `    <loc>${escapeXml(`${SITE_URL}/sitemap-static.xml`)}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      '  </sitemap>',
      '  <sitemap>',
      `    <loc>${escapeXml(`${SITE_URL}/sitemap-categories.xml`)}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      '  </sitemap>',
      '  <sitemap>',
      `    <loc>${escapeXml(`${SITE_URL}/sitemap-architects.xml`)}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      '  </sitemap>',
      '  <sitemap>',
      `    <loc>${escapeXml(`${SITE_URL}/sitemap-cities.xml`)}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      '  </sitemap>',
    ];

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