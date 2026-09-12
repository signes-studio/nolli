/**
 * API Endpoint: /api/revalidate-catalog
 * Permite purgar la caché CDN Edge de /api/catalog, fichas individuales y agregaciones
 * mediante llamada manual, webhook de Supabase o llamada interna.
 */

const { purgeCdnCache, purgeBuildingCdnCache } = require('./_lib/cdnPurge.js');

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
    const buildingId = req.query?.id || req.body?.id || null;
    const customTags = req.query?.tags ? req.query.tags.split(',').map((t) => t.trim()) : null;

    let results;
    if (customTags && customTags.length > 0) {
      results = await purgeCdnCache({ tags: customTags });
    } else {
      results = await purgeBuildingCdnCache(buildingId);
    }

    return res.status(200).json({
      revalidated: true,
      buildingId: buildingId || null,
      timestamp: new Date().toISOString(),
      details: results,
    });
  } catch (error) {
    console.error('Error al revalidar catálogo:', error);
    return res.status(500).json({ error: 'Error al invalidar la caché del catálogo.' });
  }
};
