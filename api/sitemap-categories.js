/* =========================================================================
   API/SITEMAP-CATEGORIES.JS — Sitemap XML para Categorías Arquitectónicas
   ========================================================================= */

const { getCategorySlugs } = require('./_lib/categories.js');
const { getMultilingualSitemapEntries } = require('./_lib/i18n.js');

const SITE_URL = 'https://nollimap.app';

module.exports = async (request, response) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const categorySlugs = getCategorySlugs();

    const categoryEntries = categorySlugs.map((slug) => (
      getMultilingualSitemapEntries(`/categoria/${encodeURIComponent(slug)}`, today, 'weekly', '0.8', SITE_URL)
    ));

    const sitemap = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
      ...categoryEntries,
      '</urlset>',
    ].join('\n');

    response.setHeader('Content-Type', 'application/xml; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return response.status(200).send(sitemap);
  } catch (error) {
    console.error('No se pudo generar el sitemap de categorías:', error);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return response.status(500).send('No se pudo generar el sitemap de categorías.');
  }
};

