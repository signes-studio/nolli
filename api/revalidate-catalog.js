/**
 * API Endpoint: /api/revalidate-catalog
 * Permite purgar la caché CDN Edge de /api/catalog mediante llamada manual,
 * webhook de Supabase o llamada interna.
 */

async function purgeCatalogCdnCache() {
  const purgeTasks = [];

  const vercelToken = process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN;
  const vercelProjectId = process.env.VERCEL_PROJECT_ID || process.env.VERCEL_GIT_REPO_SLUG || 'nolli';
  const vercelTeamId = process.env.VERCEL_TEAM_ID;

  const cfZoneId = process.env.CLOUDFLARE_ZONE_ID;
  const cfToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!vercelToken && !cfToken) {
    console.error('[PURGE ERROR] No se encontró VERCEL_TOKEN ni CLOUDFLARE_API_TOKEN en variables de entorno de producción. La purga de caché CDN no se pudo disparar.');
    return [{ status: 'rejected', reason: 'NO_PURGE_TOKEN_CONFIGURED' }];
  }

  if (vercelToken) {
    const vercelParams = new URLSearchParams({ projectIdOrName: vercelProjectId });
    if (vercelTeamId) vercelParams.append('teamId', vercelTeamId);

    const vercelPurgePromise = fetch(`https://api.vercel.com/v1/edge-cache/invalidate-by-tags?${vercelParams.toString()}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tags: ['catalog'] }),
    }).then(async (res) => {
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[PURGE ERROR] Fallo al invalidar caché Vercel CDN (HTTP ${res.status}):`, errText);
        return { success: false, status: res.status, error: errText };
      }
      console.log('[PURGE SUCCESS] Caché Vercel CDN invalidado con éxito para tag "catalog" (HTTP 200).');
      return { success: true, status: 200 };
    }).catch((err) => {
      console.error('[PURGE ERROR] Fallo de red al solicitar purga a Vercel CDN:', err.message);
      return { success: false, error: err.message };
    });

    purgeTasks.push(vercelPurgePromise);
  }

  if (cfZoneId && cfToken) {
    const cfPurgePromise = fetch(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}/purge_cache`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tags: ['catalog'],
        files: [
          'https://nollimap.app/api/catalog',
          'https://nollimap.app/api/catalog?light=true',
          'https://nollimap.app/api/catalog?light=1',
        ],
      }),
    }).then(async (res) => {
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn('Aviso de purga Cloudflare:', res.status, errText);
        return { success: false, status: res.status, error: errText };
      }
      return { success: true, status: 200 };
    }).catch((err) => {
      console.warn('Fallo de red al solicitar purga a Cloudflare:', err.message);
      return { success: false, error: err.message };
    });

    purgeTasks.push(cfPurgePromise);
  }

  const results = await Promise.allSettled(purgeTasks);
  return results;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Método HTTP no permitido. Utiliza POST o GET.' });
  }

  // Validación de seguridad opcional si existe REVALIDATE_SECRET
  const expectedSecret = process.env.REVALIDATE_SECRET;
  const providedSecret = req.headers['x-revalidate-secret'] || req.query?.secret;

  if (expectedSecret && providedSecret !== expectedSecret) {
    return res.status(401).json({ error: 'No autorizado. Secreto de revalidación inválido o ausente.' });
  }

  try {
    const results = await purgeCatalogCdnCache();
    return res.status(200).json({
      revalidated: true,
      timestamp: new Date().toISOString(),
      details: results,
    });
  } catch (error) {
    console.error('Error al revalidar catálogo:', error);
    return res.status(500).json({ error: 'Error al invalidar la caché del catálogo.' });
  }
};

