const { getCategorySlugs } = require('./_lib/categories.js');
const { getMultilingualSitemapEntries, escapeXml } = require('./_lib/i18n.js');

const SITE_URL = 'https://nollimap.app';

module.exports = async (request, response) => {
  try {
    const lastModified = new Date().toISOString().slice(0, 10);
    const staticEntries = [
      getMultilingualSitemapEntries('/', lastModified, 'daily', '1.0', SITE_URL),
      getMultilingualSitemapEntries('/landing', lastModified, 'weekly', '0.9', SITE_URL),
      getMultilingualSitemapEntries('/perfil', lastModified, 'weekly', '0.8', SITE_URL),
      getMultilingualSitemapEntries('/itinerarios', lastModified, 'weekly', '0.8', SITE_URL),
      getMultilingualSitemapEntries('/public-profile', lastModified, 'weekly', '0.7', SITE_URL),
      getMultilingualSitemapEntries('/legal', lastModified, 'monthly', '0.3', SITE_URL),
      ...getCategorySlugs().map((slug) => (
        getMultilingualSitemapEntries(`/categoria/${encodeURIComponent(slug)}`, lastModified, 'weekly', '0.6', SITE_URL)
      )),
    ];

    const sitemap = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
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
