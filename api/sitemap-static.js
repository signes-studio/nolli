const { getCategorySlugs } = require('./_lib/categories.js');

const SITE_URL = 'https://nollimap.app';

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

module.exports = async (request, response) => {
  try {
    const lastModified = new Date().toISOString().slice(0, 10);
    const staticEntries = [
      urlEntry(`${SITE_URL}/`, lastModified, 'daily', '1.0'),
      urlEntry(`${SITE_URL}/landing`, lastModified, 'weekly', '0.9'),
      urlEntry(`${SITE_URL}/perfil`, lastModified, 'weekly', '0.8'),
      urlEntry(`${SITE_URL}/public-profile`, lastModified, 'weekly', '0.7'),
      urlEntry(`${SITE_URL}/legal`, lastModified, 'monthly', '0.3'),
      ...getCategorySlugs().map((slug) => (
        urlEntry(`${SITE_URL}/categoria/${encodeURIComponent(slug)}`, lastModified, 'weekly', '0.6')
      )),
    ];

    const sitemap = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...staticEntries,
      '</urlset>',
    ].join('\n');

    response.setHeader('Content-Type', 'application/xml; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    response.status(200).send(sitemap);
  } catch (error) {
    console.error('No se pudo generar el sitemap estático:', error);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.status(500).send('No se pudo generar el sitemap estático.');
  }
};
