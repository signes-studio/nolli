/* =========================================================================
   API.JS — Capa de acceso a datos (Supabase)
   Toda petición de red vive aquí; el resto de la app no conoce fetch/URLs.
   ========================================================================= */

import { SUPABASE_URL, SUPABASE_KEY, MAPBOX_TOKEN } from './config.js';
import { calcularDistanciaMetros } from './renderUtils.js';

// Cache compartida para catálogo de obras (deduplication)
let catalogCache = null;
let catalogPromise = null;
const CATALOG_CACHE_KEY = 'nolli:buildings-catalog:v2';
const CATALOG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function searchPlaces(query) {
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    language: 'es',
    limit: '5',
    types: 'place,locality,neighborhood,address,poi',
  });
  const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`);
  if (!response.ok) throw new Error(`Error ${response.status}`);
  return response.json();
}

/** Descarga obras específicas por su ID buscando primero en catálogo local (0 egress). */
export async function fetchBuildingsByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const cleanIds = ids.map((id) => String(id).trim()).filter(Boolean);
  if (cleanIds.length === 0) return [];

  const found = [];
  const missing = [];

  try {
    const catalog = await getBuildingsCatalog();
    if (Array.isArray(catalog) && catalog.length > 0) {
      const catalogMap = new Map(catalog.map((b) => [String(b.id), b]));
      cleanIds.forEach((id) => {
        const item = catalogMap.get(id);
        if (item) found.push(item);
        else missing.push(id);
      });
    } else {
      missing.push(...cleanIds);
    }
  } catch {
    missing.push(...cleanIds);
  }

  if (missing.length === 0) return found;

  try {
    // 1. Intentar a través del endpoint serverless propio con CDN edge (/api/building?ids=...)
    const response = await fetch(`./api/building?ids=${missing.map(encodeURIComponent).join(',')}`);
    if (response.ok) {
      const remote = await response.json();
      if (Array.isArray(remote)) found.push(...remote);
    } else if (response.status === 404 || response.status >= 500) {
      // Fallback solo en entorno local sin serverless
      const publicFields = 'id,nombre_obra,foto_url,enlace_url,arquitecto,año_construccion,importancia,categoria,estado_acceso,visitable,añadido_por,estado_revision,longitud,latitud,place';
      const fbRes = await fetch(`${SUPABASE_URL}/rest/v1/Buildings?id=in.(${missing.map(encodeURIComponent).join(',')})&select=${publicFields}`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      });
      if (fbRes.ok) {
        const remote = await fbRes.json();
        if (Array.isArray(remote)) found.push(...remote);
      }
    }
  } catch (e) {
    console.warn('Error al buscar obras faltantes por ID:', e);
  }

  return found;
}

/** Descarga todas las obras dentro de un radio calculándolas en memoria desde el catálogo cacheado (0 egress). */
export async function fetchBuildingsInRadius({ lon, lat, radiusMeters = 10000, signal } = {}) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [];
  try {
    const catalog = await getBuildingsCatalog();
    if (Array.isArray(catalog) && catalog.length > 0) {
      return catalog.filter((b) => {
        const bLat = Number(b.latitud);
        const bLon = Number(b.longitud);
        if (!Number.isFinite(bLat) || !Number.isFinite(bLon)) return false;
        const dist = calcularDistanciaMetros(lon, lat, bLon, bLat);
        return dist <= radiusMeters;
      });
    }
  } catch (err) {
    if (signal?.aborted) return [];
    console.warn('Aviso calculando radio desde catálogo:', err);
  }
  return [];
}

/** Resuelve las obras del catálogo en memoria o caché Edge sin saturar Supabase con consultas continuas. */
export async function fetchBuildings({ bounds, zoom, architect, includeAllImportance = true, bufferRatio = 0.75, signal } = {}) {
  try {
    const catalog = await getBuildingsCatalog();
    if (Array.isArray(catalog) && catalog.length > 0) {
      let filtered = catalog;
      if (architect) {
        const arqLower = architect.toLowerCase();
        filtered = filtered.filter((b) => (b.arquitectos || b.arquitecto || '').toLowerCase().includes(arqLower));
      }
      if (bounds && typeof bounds.toArray === 'function') {
        const [[minLongitude, minLatitude], [maxLongitude, maxLatitude]] = bounds.toArray();
        const lonDelta = (maxLongitude - minLongitude) * bufferRatio;
        const latDelta = (maxLatitude - minLatitude) * bufferRatio;
        const fetchMinLon = minLongitude - lonDelta;
        const fetchMaxLon = maxLongitude + lonDelta;
        const fetchMinLat = minLatitude - latDelta;
        const fetchMaxLat = maxLatitude + latDelta;

        filtered = filtered.filter((b) => {
          const lat = Number(b.latitud);
          const lon = Number(b.longitud);
          return lat >= fetchMinLat && lat <= fetchMaxLat && lon >= fetchMinLon && lon <= fetchMaxLon;
        });
      }
      if (!includeAllImportance && Number(zoom) < 8) {
        filtered = filtered.filter((b) => Number(b.importancia || 1) <= 2);
      }
      return filtered;
    }
  } catch (err) {
    if (signal?.aborted) return [];
    console.warn('Aviso resolviendo obras desde catálogo:', err);
  }
  return [];
}

const CATALOG_FALLBACK_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos de cooldown tras fallo de /api/catalog
const CATALOG_FALLBACK_STORAGE_KEY = 'nolli:catalog-fallback-cooldown';
let lastFallbackAttemptTime = 0;

let bypassNextCatalogCache = false;

/** Descarga el catálogo completo optimizado con CDN Edge de Vercel (0 egress de Supabase). */
export async function fetchBuildingFacets(forceBypass = false) {
  const shouldBypass = forceBypass || bypassNextCatalogCache;
  bypassNextCatalogCache = false;

  // 1. Intentar descargar desde el endpoint propio en CDN Edge con reintentos y backoff exponencial (1s, 2s)
  const maxEdgeAttempts = 3;
  let lastEdgeError = null;

  for (let attempt = 1; attempt <= maxEdgeAttempts; attempt++) {
    try {
      const catalogUrl = shouldBypass ? `./api/catalog?ts=${Date.now()}` : './api/catalog';
      const edgeRes = await fetch(catalogUrl);
      if (edgeRes.ok) {
        const data = await edgeRes.json();
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
      lastEdgeError = new Error(`HTTP ${edgeRes.status}`);
    } catch (err) {
      lastEdgeError = err;
    }

    if (attempt < maxEdgeAttempts) {
      const delayMs = attempt * 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.warn('Aviso: /api/catalog no respondió tras 3 intentos con backoff:', lastEdgeError?.message);

  // 2. Comprobar cooldown antes de recurrir al fallback directo a Supabase
  const now = Date.now();
  let storedCooldown = 0;
  try {
    storedCooldown = Number(localStorage.getItem(CATALOG_FALLBACK_STORAGE_KEY) || 0);
  } catch {}
  const lastAttempt = Math.max(lastFallbackAttemptTime, storedCooldown);

  if (now - lastAttempt < CATALOG_FALLBACK_COOLDOWN_MS) {
    console.warn('Aviso: Fallback directo a Supabase en cooldown (5 min). Se usará la caché existente si está disponible.');
    if (catalogCache && catalogCache.length > 0) return catalogCache;
    return [];
  }

  // Registrar el intento en cooldown para frenar bucles en recargas/redeploys
  lastFallbackAttemptTime = now;
  try {
    localStorage.setItem(CATALOG_FALLBACK_STORAGE_KEY, String(now));
  } catch {}

  // 3. Fallback de emergencia a Supabase directo paginado (limitado con seguridad)
  const pageSize = 1000;
  const facets = [];
  let start = 0;
  const maxPages = 15;
  const params = new URLSearchParams({
    select: 'id,nombre_obra,foto_url,enlace_url,arquitecto,año_construccion,importancia,categoria,estado_acceso,visitable,añadido_por,longitud,latitud,place,created_at,updated_at',
    order: 'id.asc',
    or: '(estado_revision.eq.publicada,estado_revision.is.null)',
  });

  try {
    let pageCount = 0;
    while (pageCount < maxPages) {
      pageCount++;
      const response = await fetch(`${SUPABASE_URL}/rest/v1/Buildings?${params.toString()}`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          Range: `${start}-${start + pageSize - 1}`,
        },
      });
      if (!response.ok) break;
      const page = await response.json();
      if (!Array.isArray(page) || page.length === 0) break;
      facets.push(...page);
      if (page.length < pageSize) return facets;
      start += pageSize;
    }
  } catch (err) {
    console.warn('Aviso al consultar catálogo global directo (fallback interrumpido):', err);
  }

  return facets;
}

/**
 * getBuildingsCatalog() — Cache compartida de catálogo de obras
 * Evita múltiples llamadas simultáneas a fetchBuildingFacets().
 * Todas las partes de la app (searchUI, profile, mobileBottomNav, radarUI, etc.)
 * usan esta función en lugar de llamar fetchBuildingFacets() directamente.
 * 
 * @returns {Promise<Array>} Catálogo de obras normalizadas
 */
export async function getBuildingsCatalog() {
  if (catalogCache && catalogCache.length > 0) {
    return catalogCache;
  }

  // Limpiar clave legacy voluminosa en caso de que existiese en el cliente
  try {
    localStorage.removeItem(CATALOG_CACHE_KEY);
  } catch {}

  if (catalogPromise) {
    return catalogPromise;
  }

  catalogPromise = fetchBuildingFacets().then((result) => {
    if (Array.isArray(result) && result.length > 0) {
      catalogCache = result;
      try {
        localStorage.setItem('nolli:catalog-synced-at', String(Date.now()));
      } catch {}
    }
    catalogPromise = null;
    return catalogCache || result;
  }).catch((err) => {
    catalogPromise = null;
    throw err;
  });

  return catalogPromise;
}

/**
 * Invalida el cache del catálogo (usar después de crear/actualizar edificios)
 */
export function invalidateCatalogCache() {
  catalogCache = null;
  catalogPromise = null;
  bypassNextCatalogCache = true;
  try {
    localStorage.removeItem(CATALOG_CACHE_KEY);
    localStorage.removeItem('nolli:catalog-synced-at');
  } catch {}
  if (typeof caches !== 'undefined') {
    caches.open('nolli-shell-v70').then((cache) => {
      cache.delete('/api/catalog');
      cache.delete('/api/catalog-timestamp');
    }).catch(() => {});
  }
}

export async function fetchUserPendingBuildings(userId, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/Buildings?propuesto_por=eq.${encodeURIComponent(userId)}&estado_revision=eq.pendiente&select=*`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (!response.ok) return [];
  return response.json();
}

export async function fetchPendingBuildings(sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/Buildings?estado_revision=eq.pendiente&select=*`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (!response.ok) return [];
  return response.json();
}

export async function fetchAllBuildingsForAdmin(sessionToken) {
  const publicFields = 'id,nombre_obra,foto_url,enlace_url,arquitecto,año_construccion,importancia,categoria,estado_acceso,visitable,añadido_por,propuesto_por,estado_revision,longitud,latitud,place';
  const response = await fetch(`${SUPABASE_URL}/rest/v1/Buildings?select=${publicFields}&order=created_at.desc.nullslast,id.desc&limit=1000`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (!response.ok) return [];
  return response.json().catch(() => []);
}

export async function fetchPrivateBuildings(userId, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_private_buildings?user_id=eq.${encodeURIComponent(userId)}&select=*`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (!response.ok) return [];
  return response.json();
}

export async function fetchAllPrivateBuildings(sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_private_buildings?select=*`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (!response.ok) return [];
  return response.json();
}

export async function createPrivateBuilding(building, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_private_buildings`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(building),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo guardar la chincheta privada.');
  }
  return response.json();
}

export async function deletePrivateBuilding(id, userId, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_private_buildings?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Prefer': 'return=representation',
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo eliminar la chincheta privada.');
  }
  const deleted = await response.json().catch(() => []);
  if (!Array.isArray(deleted) || deleted.length === 0) throw new Error('No se eliminó ninguna chincheta privada.');
  return deleted;
}

export async function fetchUserCollections(userId, sessionToken) {
  // Cargar colecciones del usuario
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.asc`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (!response.ok) {
    const fallbackResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?user_id=eq.${encodeURIComponent(userId)}&select=id,name,icon,description,created_at&order=created_at.asc`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
    });
    if (!fallbackResponse.ok) throw new Error('No se pudieron cargar las listas personales.');
    const rows = await fallbackResponse.json();
    return rows.map((col) => ({
      ...col,
      status: col.status || (col.is_public ? 'public' : 'private'),
      is_public: col.status === 'public' || col.is_public === true,
    }));
  }
  const data = await response.json();
  return (Array.isArray(data) ? data : []).map((col) => ({
    ...col,
    status: col.status || (col.is_public ? 'public' : 'private'),
    is_public: col.status === 'public' || col.is_public === true,
  }));
}

export async function createUserCollection(collection, sessionToken) {
  const isPublic = collection.status === 'public' || collection.is_public === true;
  const payload = {
    user_id: collection.user_id,
    name: collection.name,
    status: isPublic ? 'public' : 'private',
    is_public: isPublic,
  };
  
  // Validar si el id pasado es un UUID válido; si no, dejar que Supabase lo genere
  if (collection.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(collection.id)) {
    payload.id = collection.id;
  }
  if (collection.icon !== undefined) payload.icon = collection.icon;
  if (collection.description !== undefined) payload.description = collection.description;
  if (collection.show_on_map !== undefined) payload.show_on_map = collection.show_on_map;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_collections`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    // Si falla (por ejemplo por columna desconocida en schemas antiguos), reintentar simplificado
    const simplified = {
      user_id: collection.user_id,
      name: collection.name,
      icon: collection.icon,
      description: collection.description,
      status: isPublic ? 'public' : 'private',
    };
    const retryResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_collections`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(simplified),
    });
    if (retryResponse.ok) return retryResponse.json();
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo crear la lista personal.');
  }
  return response.json();
}

export async function updateUserCollection(collectionId, updates, sessionToken) {
  const payload = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.icon !== undefined) payload.icon = updates.icon;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.show_on_map !== undefined) payload.show_on_map = updates.show_on_map;
  
  if (updates.status !== undefined) {
    payload.status = updates.status;
    payload.is_public = updates.status === 'public';
  } else if (updates.is_public !== undefined) {
    payload.is_public = updates.is_public;
    payload.status = updates.is_public ? 'public' : 'private';
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?id=eq.${encodeURIComponent(collectionId)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const simplified = {};
    if (updates.name !== undefined) simplified.name = updates.name;
    if (updates.icon !== undefined) simplified.icon = updates.icon;
    if (updates.description !== undefined) simplified.description = updates.description;
    if (updates.status !== undefined) simplified.status = updates.status;
    
    const retryResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?id=eq.${encodeURIComponent(collectionId)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(simplified),
    });
    if (retryResponse.ok) return retryResponse.json().catch(() => []);
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo actualizar la lista personal.');
  }
  return response.json().catch(() => []);
}

export async function deleteUserCollection(collectionId, userId, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?id=eq.${encodeURIComponent(collectionId)}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Prefer': 'return=representation',
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo borrar la lista personal.');
  }
  return response.json().catch(() => []);
}

export async function fetchUserCollectionItems(userId, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_collection_items?user_id=eq.${encodeURIComponent(userId)}&select=id,collection_id,building_id,created_at&order=created_at.asc`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (!response.ok) throw new Error('No se pudieron cargar los edificios guardados.');
  return response.json();
}

export async function addUserCollectionItem(item, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_collection_items`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(item),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo guardar la obra en la lista.');
  }
  return response.json();
}

export async function deleteUserCollectionItem(collectionId, userId, buildingId, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_collection_items?collection_id=eq.${encodeURIComponent(collectionId)}&user_id=eq.${encodeURIComponent(userId)}&building_id=eq.${encodeURIComponent(buildingId)}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Prefer': 'return=representation',
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo quitar la obra de la lista.');
  }
  return response.json().catch(() => []);
}

export async function fetchUserPrivateLabels(userId, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_private_labels?user_id=eq.${encodeURIComponent(userId)}&select=id,building_id,label,created_at&order=created_at.desc`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (!response.ok) throw new Error('No se pudieron cargar las etiquetas privadas.');
  return response.json();
}

export async function createUserPrivateLabel(label, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_private_labels`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(label),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo guardar la etiqueta privada.');
  }
  return response.json();
}

export async function deleteUserPrivateLabel(id, userId, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_private_labels?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Prefer': 'return=representation',
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo borrar la etiqueta privada.');
  }
  return response.json().catch(() => []);
}

/** Autentica al administrador y devuelve el access_token. */
export async function loginAdmin(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'ACCESO DENEGADO.');
  return data;
}

export async function refreshUserSession(refreshToken) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error('La sesión ha caducado.');
  return data;
}

export async function requestPasswordReset(email) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, redirect_to: `${window.location.origin}${window.location.pathname}` }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.msg || data.message || 'No se pudo enviar el correo de recuperación.');
  return data;
}

/** Registra un usuario público con metadatos de perfil y auditoría de consentimiento legal (GDPR). */
export async function registerUser(email, password, profile = {}) {
  const timestamp = new Date().toISOString();
  const metadata = {
    first_name: String(profile.firstName || '').trim(),
    last_name: String(profile.lastName || '').trim(),
    city: String(profile.city || '').trim(),
    country: String(profile.country || '').trim(),
    accepted_terms: true,
    accepted_terms_at: timestamp,
    newsletter_consent: Boolean(profile.newsletter),
    newsletter_consent_at: profile.newsletter ? timestamp : null,
  };
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, data: metadata }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || data.message || 'No se pudo crear la cuenta.');
  return data;
}

export async function updateCurrentUserProfile(sessionToken, profile = {}) {
  const metadata = {
    first_name: String(profile.firstName || '').trim(),
    last_name: String(profile.lastName || '').trim(),
    bio: String(profile.bio || '').trim(),
    website: String(profile.website || '').trim(),
    city: String(profile.city || '').trim(),
    country: String(profile.country || '').trim(),
    school: String(profile.school || '').trim(),
  };
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: metadata }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.msg || data.message || 'No se pudo actualizar el perfil.');
  return data;
}

export async function fetchCurrentProfile(userId, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
    },
  });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return rows[0] || null;
}

export async function upsertCurrentProfile(user, profile = {}, sessionToken) {
  const metadata = user.user_metadata || {};
  const userEmail = String(user.email || '').toLowerCase().trim();
  const metaRole = user.app_metadata?.role || user.user_metadata?.role;
  const payload = {
    id: user.id,
    email: user.email || null,
    first_name: String(profile.firstName !== undefined ? profile.firstName : (metadata.first_name || '')).trim(),
    last_name: String(profile.lastName !== undefined ? profile.lastName : (metadata.last_name || '')).trim(),
    city: String(profile.city !== undefined ? profile.city : (metadata.city || '')).trim(),
    country: String(profile.country !== undefined ? profile.country : (metadata.country || '')).trim(),
  };

  const bioVal = profile.bio !== undefined ? profile.bio : metadata.bio;
  if (bioVal !== undefined) {
    payload.bio = bioVal !== null ? String(bioVal).trim() : null;
  }

  const webVal = profile.website !== undefined ? profile.website : metadata.website;
  if (webVal !== undefined) {
    payload.website = webVal !== null ? String(webVal).trim() : null;
  }

  const schoolVal = profile.school !== undefined ? profile.school : metadata.school;
  if (schoolVal !== undefined) {
    payload.school = schoolVal !== null ? String(schoolVal).trim() : null;
  }

  if (userEmail === 'studio.signes@gmail.com') {
    payload.role = 'superadmin';
  } else if (metaRole && (metaRole === 'admin' || metaRole === 'superadmin' || metaRole === 'editor')) {
    payload.role = metaRole;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo sincronizar el perfil público.');
  }
  return response.json();
}

const PRESENCE_COOLDOWN_MS = 25 * 60 * 1000; // 25 minutos de intervalo mínimo entre actualizaciones de presencia
let lastPresenceUpdate = 0;
const PRESENCE_STORAGE_KEY = 'nolli:last-presence-at';

export async function updateUserPresence(sessionToken, userId = null, force = false) {
  if (!sessionToken) return;
  const now = Date.now();
  if (!force) {
    let storedLast = 0;
    try {
      storedLast = Number(localStorage.getItem(PRESENCE_STORAGE_KEY) || 0);
    } catch {}
    const lastAt = Math.max(lastPresenceUpdate, storedLast);
    if (now - lastAt < PRESENCE_COOLDOWN_MS) {
      return; // Ahorro de egress: ignorar si ya se actualizó en los últimos 25 minutos
    }
  }

  try {
    const targetUserId = userId || (await fetchCurrentUser(sessionToken))?.id;
    if (!targetUserId) return;

    lastPresenceUpdate = now;
    try {
      localStorage.setItem(PRESENCE_STORAGE_KEY, String(now));
    } catch {}

    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(targetUserId)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ last_seen_at: new Date(now).toISOString() }),
    });
  } catch {
    // Silencioso: si no se ha migrado aún la columna last_seen_at
  }
}

export async function fetchUserDirectory(sessionToken) {
  if (!sessionToken) throw new Error('No hay sesión activa.');
  const role = await fetchUserRole(sessionToken);
  if (role !== 'admin' && role !== 'superadmin') {
    throw new Error('Acceso denegado: Se requieren permisos de administrador para consultar el directorio de usuarios.');
  }

  let response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,email,first_name,last_name,city,country,bio,website,role,created_at,last_seen_at&order=last_seen_at.desc.nullslast,created_at.desc`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (response.status === 400) {
    response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,email,first_name,last_name,city,country,bio,website,role,created_at&order=created_at.desc`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
    });
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const rawMsg = String(error.message || error.details || '');
    if (rawMsg.includes('infinite recursion')) {
      throw new Error('RLS Recursion: Las políticas de Supabase en public.profiles son recursivas. Ejecuta el script SQL de solución en el SQL Editor de Supabase.');
    }
    throw new Error(rawMsg || 'No se pudo cargar el directorio de usuarios.');
  }
  return response.json();
}

/** Permite a un administrador o superadministrador actualizar el rol de cualquier usuario en public.profiles */
export async function updateUserRole(userId, newRole, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ role: newRole }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo actualizar el rol del usuario.');
  }
  return response.json();
}

/** Obtiene el rol del usuario autenticado desde el perfil gestionado en Supabase, metadatos y fallback de fundador. */
export async function fetchUserRole(sessionToken) {
  const user = await fetchCurrentUser(sessionToken);
  if (!user) return 'user';

  const userEmail = String(user.email || '').toLowerCase().trim();
  const metaRole = String(user.app_metadata?.role || user.user_metadata?.role || '').toLowerCase();
  
  let dbRole = '';
  try {
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
    });
    if (profileRes.ok) {
      const profiles = await profileRes.json();
      dbRole = String(profiles[0]?.role || '').toLowerCase();
    }
  } catch {}

  // Rol de superadministrador garantizado para los correos fundadores y administradores
  if (userEmail === 'studio.signes@gmail.com' || userEmail === 'office@signes.studio' || userEmail.includes('signes.studio') || userEmail.includes('studio.signes') || userEmail === 'alvaro11pm@gmail.com') {
    if (dbRole !== 'superadmin' && dbRole !== 'admin') {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${sessionToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ role: userEmail === 'alvaro11pm@gmail.com' ? 'admin' : 'superadmin' }),
        });
      } catch {}
    }
    return userEmail === 'alvaro11pm@gmail.com' ? (dbRole || 'admin') : 'superadmin';
  }

  const effectiveRole = dbRole || metaRole || 'user';
  return (effectiveRole === 'admin' || effectiveRole === 'superadmin' || effectiveRole === 'editor') ? effectiveRole : 'user';
}

// Caché en memoria para evitar peticiones repetidas a Supabase Auth y status durante la sesión
let currentUserPromise = null;
const cachedUserMap = new Map();

export async function fetchCurrentUser(sessionToken) {
  if (!sessionToken) throw new Error('No hay sesión activa.');
  const cached = cachedUserMap.get(sessionToken);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.user;
  }
  if (currentUserPromise) return currentUserPromise;

  currentUserPromise = (async () => {
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
      });
      if (!response.ok) throw new Error('La sesión ha caducado.');
      const user = await response.json();
      cachedUserMap.set(sessionToken, { user, expiresAt: Date.now() + 2 * 60 * 1000 });
      return user;
    } finally {
      currentUserPromise = null;
    }
  })();

  return currentUserPromise;
}

const buildingStatusesCache = new Map();
let buildingStatusesPromise = null;

export async function fetchBuildingStatuses(userId, sessionToken) {
  if (!userId || !sessionToken) return [];
  const cached = buildingStatusesCache.get(String(userId));
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }
  if (buildingStatusesPromise) return buildingStatusesPromise;

  buildingStatusesPromise = (async () => {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/user_building_status?user_id=eq.${encodeURIComponent(userId)}&select=building_id,favorite,visited,notas,valoracion`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
      });
      if (!response.ok) return [];
      const data = await response.json();
      buildingStatusesCache.set(String(userId), { data, expiresAt: Date.now() + 60 * 1000 });
      return data;
    } finally {
      buildingStatusesPromise = null;
    }
  })();

  return buildingStatusesPromise;
}

export async function saveBuildingStatus(arg1, arg2, arg3, arg4) {
  let userId, buildingId, status, sessionToken;

  if (typeof arg2 === 'object' && arg2 !== null) {
    // Si se invocó como (buildingId, status, userId, sessionToken)
    buildingId = arg1;
    status = arg2;
    userId = arg3;
    sessionToken = arg4;
  } else {
    // Firma estándar (userId, buildingId, status, sessionToken)
    userId = arg1;
    buildingId = arg2;
    status = arg3;
    sessionToken = arg4;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_building_status?on_conflict=user_id,building_id`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({ user_id: userId, building_id: buildingId, ...status }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo guardar tu estado personal.');
  }
  buildingStatusesCache.delete(String(userId));
  return response.json();
}

export async function createBuildingReport(report, sessionToken = null) {
  const desc = String(report.description || report.descripcion || '').trim();
  const tipo = report.report_type || 'error_datos';
  const fullDesc = tipo && tipo !== 'error_datos' ? `[${tipo.toUpperCase()}] ${desc}` : desc;

  const payload = {
    building_id: report.building_id,
    user_id: report.user_id || null,
    descripcion: fullDesc,
    estado: 'pendiente',
  };

  let response = await fetch(`${SUPABASE_URL}/rest/v1/building_reports`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken || SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 404) {
    const fallbackPayload = {
      building_id: report.building_id,
      user_id: report.user_id || null,
      user_email: report.user_email || null,
      report_type: tipo,
      description: desc,
      status: 'pending',
    };
    response = await fetch(`${SUPABASE_URL}/rest/v1/reports`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${sessionToken || SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(fallbackPayload),
    });
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (error.code === '42501') {
      throw new Error('Permisos RLS insuficientes en building_reports. Ejecuta la política RLS de inserción en Supabase SQL.');
    }
    throw new Error(error.message || error.details || 'No se pudo enviar el reporte.');
  }
  return response.json().catch(() => ({}));
}

export async function fetchBuildingReports(sessionToken) {
  let response = await fetch(`${SUPABASE_URL}/rest/v1/building_reports?select=id,user_id,building_id,descripcion,estado,created_at,Buildings(nombre_obra,arquitecto)&order=created_at.desc`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (response.status === 404) {
    response = await fetch(`${SUPABASE_URL}/rest/v1/reports?status=eq.pending&select=id,user_id,user_email,building_id,report_type,description,status,created_at,Buildings(nombre_obra,arquitecto)&order=created_at.desc`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
    });
  }
  if (!response.ok) return [];
  return response.json().catch(() => []);
}

export async function updateBuildingReport(id, estado, sessionToken) {
  let response = await fetch(`${SUPABASE_URL}/rest/v1/building_reports?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ estado }),
  });

  if (response.status === 404) {
    response = await fetch(`${SUPABASE_URL}/rest/v1/reports?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ status: estado }),
    });
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo actualizar el reporte.');
  }
  return response.json().catch(() => ({}));
}

export async function deleteBuildingReport(id, sessionToken) {
  let response = await fetch(`${SUPABASE_URL}/rest/v1/building_reports?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Prefer': 'return=minimal',
    },
  });

  if (response.status === 404) {
    response = await fetch(`${SUPABASE_URL}/rest/v1/reports?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${sessionToken}`,
        'Prefer': 'return=minimal',
      },
    });
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo eliminar el reporte.');
  }
  return true;
}

export async function fetchRatingAverages(sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_building_status?select=building_id,valoracion&valoracion=not.is.null&limit=10000`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (!response.ok) return new Map();
  const rows = await response.json();
  const ratings = new Map();
  rows.forEach((row) => {
    const rating = Number(row.valoracion);
    if (!Number.isFinite(rating)) return;
    const key = String(row.building_id);
    const current = ratings.get(key) || { total: 0, count: 0 };
    ratings.set(key, { total: current.total + rating, count: current.count + 1 });
  });
  return new Map([...ratings].map(([key, value]) => [key, {
    average: value.total / value.count,
    count: value.count,
  }]));
}

function getStoredToken() {
  try {
    const raw = localStorage.getItem('nolli_admin_session_token') || sessionStorage.getItem('nolli_admin_session_token');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.access_token || (typeof parsed === 'string' ? parsed : null);
  } catch {
    return null;
  }
}

function cleanBuildingPayload(data, isUpdate = false) {
  const clean = { ...data };
  if (clean.año_construccion !== undefined) {
    clean.año_construccion = clean.año_construccion != null ? String(clean.año_construccion).trim() : null;
  }
  if (clean.importancia !== undefined) {
    const imp = Number(clean.importancia);
    clean.importancia = Number.isFinite(imp) ? imp : 1;
  }
  if (clean.latitud !== undefined && clean.latitud !== null) {
    const lat = Number(clean.latitud);
    clean.latitud = Number.isFinite(lat) ? lat : null;
  }
  if (clean.longitud !== undefined && clean.longitud !== null) {
    const lon = Number(clean.longitud);
    clean.longitud = Number.isFinite(lon) ? lon : null;
  }
  if (!isUpdate && !clean.created_at) {
    clean.created_at = new Date().toISOString();
  }
  clean.updated_at = new Date().toISOString();
  delete clean.geom;
  delete clean.categoria_norm;
  return clean;
}

/** Inserta un nuevo edificio en la base de datos (con fallback serverless e invalidación de caché). */
export async function createBuilding(nuevoEdificio, sessionToken = null) {
  const token = sessionToken || getStoredToken();
  const payload = cleanBuildingPayload(nuevoEdificio, false);

  // 1. Intentar a través del endpoint serverless de Vercel (service role garantizado)
  if (token) {
    try {
      const serverlessRes = await fetch('./api/building', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (serverlessRes.ok) {
        invalidateCatalogCache();
        return serverlessRes.json();
      }

      if (serverlessRes.status === 401 || serverlessRes.status === 403 || serverlessRes.status === 400) {
        const errJson = await serverlessRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Acceso denegado al registrar la obra.');
      }
    } catch (err) {
      if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('404')) {
        throw err;
      }
    }
  }

  // 2. Fallback directo a Supabase REST
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${token || SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/Buildings`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    if (error.code === '42501') {
      throw new Error('Permisos RLS insuficientes en Supabase para insertar obras. Ejecuta la migración SQL 006 en Supabase.');
    }
    throw new Error(error.message || error.details || 'Fallo al guardar en la base de datos.');
  }
  invalidateCatalogCache();
  return res.json();
}

/** Actualiza un edificio existente. */
export async function updateBuilding(id, edificio, sessionToken = null) {
  const token = sessionToken || getStoredToken();
  const normalizedId = String(id).trim();
  const payload = cleanBuildingPayload(edificio, true);

  // 1. Intentar a través del endpoint serverless de Vercel
  if (token) {
    try {
      const serverlessRes = await fetch(`./api/building?id=${encodeURIComponent(normalizedId)}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (serverlessRes.ok) {
        invalidateCatalogCache();
        return serverlessRes.json();
      }

      if (serverlessRes.status === 401 || serverlessRes.status === 403 || serverlessRes.status === 400) {
        const errJson = await serverlessRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Acceso denegado al actualizar la obra.');
      }
    } catch (err) {
      if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('404')) {
        throw err;
      }
    }
  }

  // 2. Fallback directo a Supabase REST
  const res = await fetch(`${SUPABASE_URL}/rest/v1/Buildings?id=eq.${encodeURIComponent(normalizedId)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${token || SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    if (error.code === '42501') {
      throw new Error('Permisos RLS insuficientes en Supabase para actualizar obras (42501). Ejecuta la migración SQL 006 en Supabase.');
    }
    throw new Error(error.message || error.details || 'Fallo al actualizar la obra en la base de datos.');
  }
  const updated = await res.json().catch(() => []);
  if (!Array.isArray(updated) || updated.length === 0) {
    throw new Error('No se actualizó ninguna obra. Comprueba el id y los permisos de administrador.');
  }
  invalidateCatalogCache();
  return updated;
}

export async function deleteBuilding(id, sessionToken = null) {
  const token = sessionToken || getStoredToken();
  const normalizedId = String(id).trim();

  // 1. Intentar a través del endpoint serverless
  if (token) {
    try {
      const serverlessRes = await fetch(`./api/building?id=${encodeURIComponent(normalizedId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (serverlessRes.ok) {
        invalidateCatalogCache();
        return serverlessRes.json();
      }

      if (serverlessRes.status === 401 || serverlessRes.status === 403) {
        const errJson = await serverlessRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Acceso denegado al eliminar la obra.');
      }
    } catch (err) {
      if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('404')) {
        throw err;
      }
    }
  }

  // 2. Fallback directo a Supabase REST
  const response = await fetch(`${SUPABASE_URL}/rest/v1/Buildings?id=eq.${encodeURIComponent(normalizedId)}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${token}`,
      'Prefer': 'return=representation',
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (error.code === '42501') {
      throw new Error('Permisos RLS insuficientes en Supabase para eliminar obras (42501). Ejecuta la migración SQL 006.');
    }
    throw new Error(error.message || error.details || 'No se pudo eliminar el proyecto.');
  }
  const deleted = await response.json().catch(() => []);
  if (!Array.isArray(deleted) || deleted.length === 0) {
    throw new Error('No se eliminó ninguna obra. Comprueba el id y los permisos en Buildings.');
  }
  invalidateCatalogCache();
  return deleted;
}

export async function reviewBuilding(id, estadoRevision, sessionToken = null) {
  return updateBuilding(id, { estado_revision: estadoRevision }, sessionToken);
}

export async function searchUserByNick(nick) {
  const cleanNick = String(nick || '').trim().replace(/^@/, '');
  if (!cleanNick) return null;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/public_profiles?nick=eq.${encodeURIComponent(cleanNick)}&select=*`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return rows[0] || null;
}

export async function fetchPublicProfileById(userId) {
  if (!userId) return null;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/public_profiles?id=eq.${encodeURIComponent(userId)}&select=*`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return rows[0] || null;
}

export async function fetchPublicUserCollections(userId) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?user_id=eq.${encodeURIComponent(userId)}&or=(status.eq.public,is_public.eq.true)&select=*&order=created_at.asc`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  if (!response.ok) return [];
  return response.json().catch(() => []);
}

export async function fetchPublicUserBuildingStatuses(userId) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_building_status?user_id=eq.${encodeURIComponent(userId)}&select=building_id,favorite,visited`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  if (!response.ok) return [];
  return response.json().catch(() => []);
}

/** Descarga todas las colecciones marcadas como públicas por cualquier usuario. */
export async function fetchAllPublicCollections() {
  // 1. Intentar consulta con filtro status o is_public
  let response = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?or=(status.eq.public,is_public.eq.true)&select=*&order=created_at.desc`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });

  if (!response.ok) {
    response = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?status=eq.public&select=*&order=created_at.desc`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    });
  }

  if (!response.ok) {
    response = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?is_public=eq.true&select=*&order=created_at.desc`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    });
  }

  if (!response.ok) return [];
  const rawList = await response.json().catch(() => []);
  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  // Normalizar campos status e is_public
  const collections = rawList.map((col) => ({
    ...col,
    status: col.status || (col.is_public ? 'public' : 'private'),
    is_public: col.status === 'public' || col.is_public === true,
  }));

  // Enriquecer con perfiles de autores desde la vista segura public_profiles
  try {
    const userIds = [...new Set(collections.map((c) => c.user_id).filter(Boolean))];
    if (userIds.length > 0) {
      const profilesRes = await fetch(`${SUPABASE_URL}/rest/v1/public_profiles?id=in.(${userIds.map((id) => `"${encodeURIComponent(id)}"`).join(',')})&select=id,nick,first_name,avatar_url`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
      });
      if (profilesRes.ok) {
        const profiles = await profilesRes.json().catch(() => []);
        const map = new Map(profiles.map((p) => [String(p.id), p]));
        collections.forEach((col) => {
          if (!col.profiles && map.has(String(col.user_id))) {
            col.profiles = map.get(String(col.user_id));
          }
        });
      }
    }
  } catch {}

  return collections;
}

/** Carga una colección por su identificador único (pública o del usuario). */
export async function fetchCollectionById(collectionId, sessionToken = null) {
  const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken || SUPABASE_KEY}` };
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?id=eq.${encodeURIComponent(collectionId)}&select=id,name,icon,description,status,is_public,created_at,user_id&limit=1`, { headers });
  if (!response.ok) return null;
  const list = await response.json().catch(() => []);
  const collection = list[0] || null;
  if (collection && collection.user_id) {
    try {
      const pRes = await fetch(`${SUPABASE_URL}/rest/v1/public_profiles?id=eq.${encodeURIComponent(collection.user_id)}&select=id,nick,first_name,avatar_url`, { headers });
      if (pRes.ok) {
        const profs = await pRes.json().catch(() => []);
        collection.profiles = profs[0] || null;
      }
    } catch {}
  }
  return collection;
}

/** Obtiene las colecciones seguidas/guardadas por el usuario actual. */
export async function fetchFollowedCollections(userId, sessionToken) {
  if (!userId || !sessionToken) return [];
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_followed_collections?user_id=eq.${encodeURIComponent(userId)}&select=collection_id,created_at,user_collections:collection_id(id,name,icon,description,status,is_public,user_id)&order=created_at.desc`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    // Fallback directo
    const fallbackRes = await fetch(`${SUPABASE_URL}/rest/v1/user_followed_collections?user_id=eq.${encodeURIComponent(userId)}&select=collection_id,created_at`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
    });
    if (!fallbackRes.ok) return [];
    return fallbackRes.json().catch(() => []);
  }
  const rows = await response.json().catch(() => []);
  try {
    const userIds = [...new Set(rows.map((r) => r.user_collections?.user_id).filter(Boolean))];
    if (userIds.length > 0) {
      const pRes = await fetch(`${SUPABASE_URL}/rest/v1/public_profiles?id=in.(${userIds.map((id) => `"${encodeURIComponent(id)}"`).join(',')})&select=id,nick,first_name,avatar_url`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
      });
      if (pRes.ok) {
        const pList = await pRes.json().catch(() => []);
        const pMap = new Map(pList.map((p) => [String(p.id), p]));
        rows.forEach((r) => {
          if (r.user_collections && pMap.has(String(r.user_collections.user_id))) {
            r.user_collections.profiles = pMap.get(String(r.user_collections.user_id));
          }
        });
      }
    }
  } catch {}
  return rows;
}

/** Seguir una colección pública. */
export async function followCollection(collectionId, userId, sessionToken) {
  if (!collectionId || !userId || !sessionToken) return null;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_followed_collections`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ collection_id: collectionId, user_id: userId }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'No se pudo seguir la colección.');
  }
  return response.json().catch(() => []);
}

/** Dejar de seguir una colección pública. */
export async function unfollowCollection(collectionId, userId, sessionToken) {
  if (!collectionId || !userId || !sessionToken) return null;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_followed_collections?collection_id=eq.${encodeURIComponent(collectionId)}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Prefer': 'return=representation',
    },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'No se pudo dejar de seguir la colección.');
  }
  return response.json().catch(() => []);
}

/* =========================================================================
   ITINERARIOS & RUTAS CURATORIALES (ADMIN & PÚBLICO)
   ========================================================================= */

export const LOCAL_ITINERARIES_KEY = 'nolli_local_itineraries';

function getStoredItineraries() {
  try {
    const raw = localStorage.getItem(LOCAL_ITINERARIES_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return null;
}

function saveStoredItineraries(list) {
  try {
    localStorage.setItem(LOCAL_ITINERARIES_KEY, JSON.stringify(list));
  } catch (e) {}
}

export function updateLocalStorageItinerary(item) {
  let list = getStoredItineraries();
  if (list === null) {
    list = [item];
  } else {
    const existingIndex = list.findIndex((r) => r.id === item.id);
    if (existingIndex >= 0) {
      list[existingIndex] = { ...list[existingIndex], ...item };
    } else {
      list.push(item);
    }
  }
  saveStoredItineraries(list);
}

export function deleteLocalStorageItinerary(id) {
  let list = getStoredItineraries();
  if (list !== null) {
    list = list.filter((r) => r.id !== id);
    saveStoredItineraries(list);
  }
}

export async function fetchItineraries(sessionToken = null, includeInactive = false) {
  try {
    const query = includeInactive ? '' : '?active=eq.true';
    const sort = includeInactive ? '?order=order_num.asc,created_at.asc' : '&order=order_num.asc,created_at.asc';
    const response = await fetch(`${SUPABASE_URL}/rest/v1/itineraries${query}${sort}`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${sessionToken || SUPABASE_KEY}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const formatted = data.map((item) => ({
          ...item,
          work_ids: item.work_ids || item.workIds || [],
          workIds: item.work_ids || item.workIds || [],
          yearRange: item.year_range || item.yearRange || null,
          decadeFilter: item.decade_filter || item.decadeFilter || null,
          architectsFilter: item.architects_filter || item.architectsFilter || null,
          architectFilter: item.architect_filter || item.architectFilter || null,
          categoryFilter: item.category_filter || item.categoryFilter || null,
          addedByFilter: item.added_by_filter || item.addedByFilter || null,
          bboxFilter: item.bbox_filter || item.bboxFilter || null,
        }));
        saveStoredItineraries(formatted);
        return formatted;
      }
    }
  } catch (err) {
    console.warn('Supabase itineraries fetch warning:', err);
  }

  // Fallback a localStorage
  const stored = getStoredItineraries();
  if (stored !== null) {
    return includeInactive ? stored : stored.filter((r) => r.active !== false);
  }

  return null;
}

export async function createItinerary(itinerary, sessionToken) {
  const workIds = (itinerary.work_ids || itinerary.workIds || []).map(String);
  const payload = {
    id: itinerary.id || `route-${Date.now().toString(36)}`,
    title: itinerary.title,
    subtitle: itinerary.subtitle || '',
    tag: itinerary.tag || 'MOVIMIENTO MODERNO',
    color: itinerary.color || '#E84E1B',
    stops: itinerary.stops || `${workIds.length} OBRAS`,
    work_ids: workIds,
    active: itinerary.active !== false,
    order_num: Number(itinerary.order_num || 0),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/itineraries?on_conflict=id`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${sessionToken || SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation,resolution=merge-duplicates',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = await response.json();
      const saved = result[0] || payload;
      updateLocalStorageItinerary(saved);
      window.dispatchEvent(new CustomEvent('nolli:itineraries-updated', { detail: saved }));
      return saved;
    }
  } catch (err) {
    console.warn('Error al guardar itinerario en Supabase:', err);
  }

  updateLocalStorageItinerary(payload);
  window.dispatchEvent(new CustomEvent('nolli:itineraries-updated', { detail: payload }));
  return payload;
}

export async function updateItinerary(id, itinerary, sessionToken) {
  const workIds = (itinerary.work_ids || itinerary.workIds || []).map(String);
  const payload = {
    title: itinerary.title,
    subtitle: itinerary.subtitle || '',
    tag: itinerary.tag || 'MOVIMIENTO MODERNO',
    color: itinerary.color || '#E84E1B',
    stops: itinerary.stops || `${workIds.length} OBRAS`,
    work_ids: workIds,
    active: itinerary.active !== false,
    order_num: Number(itinerary.order_num || 0),
    updated_at: new Date().toISOString(),
  };

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/itineraries?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${sessionToken || SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = await response.json();
      const saved = result[0] || { id, ...payload };
      updateLocalStorageItinerary(saved);
      window.dispatchEvent(new CustomEvent('nolli:itineraries-updated', { detail: saved }));
      return saved;
    }
  } catch (err) {
    console.warn('Error al actualizar itinerario en Supabase:', err);
  }

  const updatedObj = { id, ...payload, ...itinerary };
  updateLocalStorageItinerary(updatedObj);
  window.dispatchEvent(new CustomEvent('nolli:itineraries-updated', { detail: updatedObj }));
  return updatedObj;
}

export async function deleteItinerary(id, sessionToken) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/itineraries?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${sessionToken || SUPABASE_KEY}`,
        'Prefer': 'return=representation',
      },
    });

    if (response.ok) {
      deleteLocalStorageItinerary(id);
      window.dispatchEvent(new CustomEvent('nolli:itineraries-updated', { detail: { id, deleted: true } }));
      return true;
    }
  } catch (err) {
    console.warn('Error al eliminar itinerario en Supabase:', err);
  }

  deleteLocalStorageItinerary(id);
  window.dispatchEvent(new CustomEvent('nolli:itineraries-updated', { detail: { id, deleted: true } }));
  return true;
}

/* =========================================================================
   CAPA SOCIAL (FASE 1: RELACIONES, SEGUIMIENTOS Y AMISTADES)
   ========================================================================= */

// 1. SEGUIMIENTO (FOLLOWS - ASIMÉTRICO)
export async function followUser(targetUserId, sessionToken) {
  if (!sessionToken || !targetUserId) throw new Error('Debes iniciar sesión para seguir a un usuario.');
  const user = await fetchCurrentUser(sessionToken);
  if (!user?.id) throw new Error('Sesión no válida.');
  
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_follows`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      follower_id: user.id,
      following_id: targetUserId,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'No se pudo seguir al usuario.');
  }
  return true;
}

export async function unfollowUser(targetUserId, sessionToken) {
  if (!sessionToken || !targetUserId) throw new Error('Debes iniciar sesión.');
  const user = await fetchCurrentUser(sessionToken);
  if (!user?.id) throw new Error('Sesión no válida.');

  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_follows?follower_id=eq.${encodeURIComponent(user.id)}&following_id=eq.${encodeURIComponent(targetUserId)}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
    },
  });
  return response.ok;
}

export async function checkIsFollowing(targetUserId, sessionToken) {
  if (!sessionToken || !targetUserId) return false;
  const user = await fetchCurrentUser(sessionToken);
  if (!user?.id) return false;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_follows?follower_id=eq.${encodeURIComponent(user.id)}&following_id=eq.${encodeURIComponent(targetUserId)}&select=follower_id`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
    },
  });
  if (!response.ok) return false;
  const rows = await response.json().catch(() => []);
  return rows.length > 0;
}

// 2. CONTADORES SOCIALES PÚBLICOS
export async function fetchUserSocialCounts(userId) {
  if (!userId) return { followers: 0, following: 0, friends: 0 };
  try {
    const [followersRes, followingRes, friendsRes] = await Promise.all([
      // Seguidores
      fetch(`${SUPABASE_URL}/rest/v1/user_follows?following_id=eq.${encodeURIComponent(userId)}&select=follower_id`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'count=exact', 'Range': '0-0' },
      }),
      // Siguiendo
      fetch(`${SUPABASE_URL}/rest/v1/user_follows?follower_id=eq.${encodeURIComponent(userId)}&select=following_id`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'count=exact', 'Range': '0-0' },
      }),
      // Amigos (user_friendships aceptados donde participa el usuario)
      fetch(`${SUPABASE_URL}/rest/v1/user_friendships?or=(user_id_1.eq.${encodeURIComponent(userId)},user_id_2.eq.${encodeURIComponent(userId)})&status=eq.accepted&select=id`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'count=exact', 'Range': '0-0' },
      }),
    ]);

    const getCount = (res) => {
      const cr = res.headers.get('content-range');
      if (cr) {
        const parts = cr.split('/');
        if (parts[1] && parts[1] !== '*') return parseInt(parts[1], 10) || 0;
      }
      return 0;
    };

    return {
      followers: getCount(followersRes),
      following: getCount(followingRes),
      friends: getCount(friendsRes),
    };
  } catch (err) {
    console.warn('Error al obtener contadores sociales:', err);
    return { followers: 0, following: 0, friends: 0 };
  }
}

// 3. AMISTAD (FRIENDSHIPS - MUTUO CON RPCs CANÓNICAS)
export async function getFriendshipState(targetUserId, sessionToken) {
  if (!sessionToken || !targetUserId) return null;
  const user = await fetchCurrentUser(sessionToken);
  if (!user?.id) return null;

  const u1 = user.id < targetUserId ? user.id : targetUserId;
  const u2 = user.id < targetUserId ? targetUserId : user.id;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_friendships?user_id_1=eq.${encodeURIComponent(u1)}&user_id_2=eq.${encodeURIComponent(u2)}&select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
    },
  });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  if (!rows.length) return null;

  const rel = rows[0];
  return {
    id: rel.id,
    status: rel.status, // 'pending' | 'accepted' | 'declined' | 'blocked'
    isActionByMe: rel.action_user_id === user.id,
    actionUserId: rel.action_user_id,
  };
}

export async function requestFriendshipRpc(targetUserId, sessionToken) {
  if (!sessionToken || !targetUserId) throw new Error('Debes iniciar sesión para solicitar amistad.');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/request_friendship`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ target_user_id: targetUserId }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Error al enviar solicitud de amistad.');
  }
  return response.json();
}

export async function respondFriendshipRpc(friendshipId, accept, sessionToken) {
  if (!sessionToken || !friendshipId) throw new Error('Debes iniciar sesión.');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/respond_friendship`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ friendship_id: friendshipId, accept: Boolean(accept) }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Error al responder a la solicitud de amistad.');
  }
  return response.json();
}

export async function fetchIncomingFriendRequests(sessionToken) {
  if (!sessionToken) return [];
  const user = await fetchCurrentUser(sessionToken);
  if (!user?.id) return [];

  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_friendships?status=eq.pending&action_user_id=neq.${encodeURIComponent(user.id)}&or=(user_id_1.eq.${encodeURIComponent(user.id)},user_id_2.eq.${encodeURIComponent(user.id)})&select=id,user_id_1,user_id_2,action_user_id,created_at`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
    },
  });
  if (!response.ok) return [];
  const rows = await response.json().catch(() => []);
  if (!rows.length) return [];

  const requesterIds = rows.map(r => r.action_user_id);
  const profilesRes = await fetch(`${SUPABASE_URL}/rest/v1/public_profiles?id=in.(${requesterIds.map(id => `"${id}"`).join(',')})&select=*`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  const profiles = await profilesRes.json().catch(() => []);
  const profileMap = new Map(profiles.map(p => [p.id, p]));

  return rows.map(r => ({
    friendshipId: r.id,
    sender: profileMap.get(r.action_user_id) || { id: r.action_user_id, nick: 'Usuario' },
    createdAt: r.created_at,
  }));
}

export async function fetchUserFriends(sessionToken) {
  if (!sessionToken) return [];
  const user = await fetchCurrentUser(sessionToken);
  if (!user?.id) return [];

  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_friendships?status=eq.accepted&or=(user_id_1.eq.${encodeURIComponent(user.id)},user_id_2.eq.${encodeURIComponent(user.id)})&select=id,user_id_1,user_id_2`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
    },
  });
  if (!response.ok) return [];
  const rows = await response.json().catch(() => []);
  const friendIds = rows.map(r => r.user_id_1 === user.id ? r.user_id_2 : r.user_id_1);
  if (!friendIds.length) return [];

  const profilesRes = await fetch(`${SUPABASE_URL}/rest/v1/public_profiles?id=in.(${friendIds.map(id => `"${id}"`).join(',')})&select=*`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  return profilesRes.json().catch(() => []);
}