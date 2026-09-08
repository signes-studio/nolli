const { getMultilingualSitemapEntries } = require('./_lib/i18n.js');

const SITE_URL = 'https://nollimap.app';
const CHUNK_SIZE = 1000;
const FALLBACK_SUPABASE_URL = 'https://ldtfvpjigzvcagtciipn.supabase.co';
const FALLBACK_SUPABASE_KEY = 'sb_publishable_kYQ7Fa8nBsrkp1f8C4AuAg_4-5uBFm0';
const FALLBACK_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdGZ2cGppZ3p2Y2FndGNpaXBuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU3OTg2NywiZXhwIjoyMTAzMTU1ODY3fQ.iRn-X5EzmW9eoKqL5qdW3s6I7NfcLfnJRmXTNwjCNnY';

async function fetchBuildingPage(page) {
  const supabaseUrl = process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || FALLBACK_SERVICE_ROLE_KEY;

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
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  response.status(404).send('Sitemap obsoleto: Las fichas individuales de obra (/obra/:id) están configuradas como noindex y han sido retiradas de los sitemaps.');
};
