/* =========================================================================
   API/SITEMAP-ARCHITECTS.JS — Sitemap XML para Páginas de Arquitectos
   ========================================================================= */

const { getMultilingualSitemapEntries } = require('./_lib/i18n.js');
const { slugify, isIgnoredArchitect } = require('./_lib/slugs.js');

const SITE_URL = 'https://nollimap.app';
const FALLBACK_SUPABASE_URL = 'https://ldtfvpjigzvcagtciipn.supabase.co';
const FALLBACK_SUPABASE_KEY = 'sb_publishable_kYQ7Fa8nBsrkp1f8C4AuAg_4-5uBFm0';
const FALLBACK_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdGZ2cGppZ3p2Y2FndGNpaXBuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU3OTg2NywiZXhwIjoyMTAzMTU1ODY3fQ.iRn-X5EzmW9eoKqL5qdW3s6I7NfcLfnJRmXTNwjCNnY';

async function fetchAllArchitectSlugs() {
  const supabaseUrl = process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || FALLBACK_SERVICE_ROLE_KEY;

  const pageSize = 1000;
  const archMap = new Map();
  let start = 0;

  const params = new URLSearchParams({
    select: 'arquitecto',
    or: '(estado_revision.eq.publicada,estado_revision.is.null)',
    order: 'id.asc',
  });

  while (true) {
    const res = await fetch(`${supabaseUrl}/rest/v1/Buildings?${params.toString()}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Range: `${start}-${start + pageSize - 1}`,
      },
    });

    if (!res.ok) {
      if (res.status === 416) break;
      break;
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    for (const b of data) {
      if (b.arquitecto) {
        const names = b.arquitecto.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
        for (const name of names) {
          if (!isIgnoredArchitect(name)) {
            const slug = slugify(name);
            if (slug && slug.length > 1 && !archMap.has(slug)) {
              archMap.set(slug, name);
            }
          }
        }
      }
    }

    if (data.length < pageSize) break;
    start += pageSize;
  }

  return [...archMap.keys()].sort();
}

module.exports = async (request, response) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const architectSlugs = await fetchAllArchitectSlugs();

    const architectEntries = architectSlugs.map((slug) => (
      getMultilingualSitemapEntries(`/arquitecto/${encodeURIComponent(slug)}`, today, 'weekly', '0.8', SITE_URL)
    ));

    const sitemap = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
      ...architectEntries,
      '</urlset>',
    ].join('\n');

    response.setHeader('Content-Type', 'application/xml; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return response.status(200).send(sitemap);
  } catch (error) {
    console.error('No se pudo generar el sitemap de arquitectos:', error);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return response.status(500).send('No se pudo generar el sitemap de arquitectos.');
  }
};
