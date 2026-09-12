/**
 * API/_LIB/CDNPURGE.JS — Utilidad centralizada de purga granular CDN
 *
 * Invalida selectivamente tags y URLs específicas en Vercel Edge Cache y Cloudflare CDN
 * cuando se crea, edita o elimina una obra, evitando purgas indiscriminadas.
 */

async function purgeCdnCache({ tags = ['catalog'], urls = [] } = {}) {
  const purgeTasks = [];

  const vercelToken = process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN;
  const vercelProjectId = process.env.VERCEL_PROJECT_ID || process.env.VERCEL_GIT_REPO_SLUG || 'nolli';
  const vercelTeamId = process.env.VERCEL_TEAM_ID;

  const cfZoneId = process.env.CLOUDFLARE_ZONE_ID;
  const cfToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!vercelToken && !cfToken) {
    console.warn('[PURGE NOTICE] VERCEL_TOKEN o CLOUDFLARE_API_TOKEN no configurados en este entorno. Purga CDN omitida localmente.');
    return [{ status: 'skipped', reason: 'NO_PURGE_TOKEN_CONFIGURED' }];
  }

  // 1. Invalidation por Tags en Vercel Edge CDN (API oficial Vercel)
  if (vercelToken && Array.isArray(tags) && tags.length > 0) {
    const vercelParams = new URLSearchParams({ projectIdOrName: vercelProjectId });
    if (vercelTeamId) vercelParams.append('teamId', vercelTeamId);

    const vercelPromise = fetch(`https://api.vercel.com/v1/edge-cache/invalidate-by-tags?${vercelParams.toString()}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tags }),
    }).then(async (res) => {
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[PURGE ERROR] Vercel CDN (HTTP ${res.status}):`, errText);
        return { provider: 'vercel', success: false, status: res.status, error: errText };
      }
      console.log(`[PURGE SUCCESS] Vercel CDN invalidado para tags: ${tags.join(', ')} (HTTP 200).`);
      return { provider: 'vercel', success: true, status: 200 };
    }).catch((err) => {
      console.error('[PURGE ERROR] Excepción al solicitar purga a Vercel CDN:', err.message);
      return { provider: 'vercel', success: false, error: err.message };
    });

    purgeTasks.push(vercelPromise);
  }

  // 2. Invalidation en Cloudflare CDN (Tags + URLs)
  if (cfZoneId && cfToken) {
    const cfPayload = {};
    if (Array.isArray(tags) && tags.length > 0) cfPayload.tags = tags;
    if (Array.isArray(urls) && urls.length > 0) cfPayload.files = urls;

    if (Object.keys(cfPayload).length > 0) {
      const cfPromise = fetch(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cfPayload),
      }).then(async (res) => {
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.error(`[PURGE ERROR] Cloudflare CDN (HTTP ${res.status}):`, errText);
          return { provider: 'cloudflare', success: false, status: res.status, error: errText };
        }
        console.log('[PURGE SUCCESS] Cloudflare CDN purgado con éxito (HTTP 200).');
        return { provider: 'cloudflare', success: true, status: 200 };
      }).catch((err) => {
        console.error('[PURGE ERROR] Excepción al solicitar purga a Cloudflare CDN:', err.message);
        return { provider: 'cloudflare', success: false, error: err.message };
      });

      purgeTasks.push(cfPromise);
    }
  }

  const results = await Promise.allSettled(purgeTasks);
  return results;
}

/**
 * Purga el catálogo general y opcionalmente una obra individual específica por ID y agregaciones.
 */
async function purgeBuildingCdnCache(buildingId = null, { architectSlug = null, categorySlug = null, citySlug = null } = {}) {
  const tags = ['catalog'];
  const urls = [
    'https://nollimap.app/api/catalog',
    'https://nollimap.app/api/catalog?light=true',
    'https://nollimap.app/api/catalog?light=1',
  ];

  if (buildingId) {
    const idStr = String(buildingId);
    tags.push(`building-${idStr}`);
    tags.push(`obra-${idStr}`);
    urls.push(`https://nollimap.app/api/obra?id=${encodeURIComponent(idStr)}`);
    urls.push(`https://nollimap.app/obra/${encodeURIComponent(idStr)}`);
    urls.push(`https://nollimap.app/en/obra/${encodeURIComponent(idStr)}`);
    urls.push(`https://nollimap.app/ca/obra/${encodeURIComponent(idStr)}`);
  }

  if (architectSlug) {
    tags.push(`architect-${architectSlug}`);
    urls.push(`https://nollimap.app/api/arquitecto?slug=${encodeURIComponent(architectSlug)}`);
    urls.push(`https://nollimap.app/arquitecto/${encodeURIComponent(architectSlug)}`);
  }

  if (categorySlug) {
    tags.push(`category-${categorySlug}`);
    urls.push(`https://nollimap.app/api/categoria?slug=${encodeURIComponent(categorySlug)}`);
    urls.push(`https://nollimap.app/categoria/${encodeURIComponent(categorySlug)}`);
  }

  if (citySlug) {
    tags.push(`city-${citySlug}`);
    urls.push(`https://nollimap.app/api/ciudad?slug=${encodeURIComponent(citySlug)}`);
    urls.push(`https://nollimap.app/ciudad/${encodeURIComponent(citySlug)}`);
  }

  return purgeCdnCache({ tags, urls });
}

module.exports = {
  purgeCdnCache,
  purgeBuildingCdnCache,
};
