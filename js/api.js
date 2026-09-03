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

  const publicFields = 'id,nombre_obra,foto_url,enlace_url,arquitecto,año_construccion,importancia,categoria,estado_acceso,visitable,añadido_por,estado_revision,longitud,latitud,place';
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/Buildings?id=in.(${missing.map(encodeURIComponent).join(',')})&select=${publicFields}`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (response.ok) {
      const remote = await response.json();
      if (Array.isArray(remote)) found.push(...remote);
    }
  } catch (e) {
    console.warn('Error al buscar obras faltantes por ID en Supabase:', e);
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

/** Descarga el catálogo completo optimizado con CDN Edge de Vercel (0 egress de Supabase). */
export async function fetchBuildingFacets() {
  try {
    // 1. Intentar descargar el catálogo comprimido (Brotli) y cacheado en CDN Edge de Vercel (0 egress de Supabase)
    const edgeRes = await fetch('./api/catalog');
    if (edgeRes.ok) {
      const data = await edgeRes.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch {
    // Continuar con fallback directo si estamos en entorno local sin serverless
  }

  // 2. Fallback de emergencia a Supabase directo paginado
  const pageSize = 1000;
  const facets = [];
  let start = 0;
  const params = new URLSearchParams({
    select: 'id,nombre_obra,foto_url,enlace_url,arquitecto,año_construccion,importancia,categoria,estado_acceso,visitable,añadido_por,longitud,latitud,place',
    order: 'id.asc',
    or: '(estado_revision.eq.publicada,estado_revision.is.null)',
  });

  try {
    while (true) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/Buildings?${params.toString()}`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          Range: `${start}-${start + pageSize - 1}`,
        },
      });
      if (!response.ok) break;
      const page = await response.json();
      if (!Array.isArray(page)) break;
      facets.push(...page);
      if (page.length < pageSize) return facets;
      start += pageSize;
    }
  } catch (err) {
    console.warn('Aviso al consultar catálogo global (se continuará con catálogo local):', err);
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

  try {
    const raw = localStorage.getItem(CATALOG_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached?.expiresAt > Date.now() && Array.isArray(cached.rows) && cached.rows.length > 0) {
        catalogCache = cached.rows;
        return catalogCache;
      }
    }
  } catch {
    localStorage.removeItem(CATALOG_CACHE_KEY);
  }
  
  if (catalogPromise) {
    return catalogPromise;
  }
  
  catalogPromise = fetchBuildingFacets().then((result) => {
    if (Array.isArray(result) && result.length > 0) {
      catalogCache = result;
      try {
        localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({
          expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
          rows: result,
        }));
      } catch {
        // El catálogo sigue disponible en memoria si el almacenamiento está lleno o bloqueado.
      }
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
  localStorage.removeItem(CATALOG_CACHE_KEY);
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

  if (userEmail === 'studio.signes@gmail.com') {
    payload.role = 'superadmin';
  } else if (metaRole && (metaRole === 'admin' || metaRole === 'superadmin' || metaRole === 'tester')) {
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

export async function updateUserPresence(sessionToken) {
  if (!sessionToken) return;
  try {
    const user = await fetchCurrentUser(sessionToken);
    if (!user || !user.id) return;
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
    });
  } catch {
    // Silencioso: si no se ha migrado aún la columna last_seen_at
  }
}

export async function fetchUserDirectory(sessionToken) {
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

  // Rol de superadministrador garantizado para el correo fundador de la plataforma
  if (userEmail === 'studio.signes@gmail.com' || userEmail.includes('signes.studio') || userEmail.includes('studio.signes')) {
    if (dbRole !== 'superadmin') {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${sessionToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ role: 'superadmin' }),
        });
      } catch {}
    }
    return 'superadmin';
  }

  const effectiveRole = dbRole || metaRole || 'user';
  return (effectiveRole === 'admin' || effectiveRole === 'superadmin' || effectiveRole === 'tester') ? effectiveRole : 'user';
}

export async function fetchCurrentUser(sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (!response.ok) throw new Error('La sesión ha caducado.');
  return response.json();
}

export async function fetchBuildingStatuses(userId, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_building_status?user_id=eq.${encodeURIComponent(userId)}&select=building_id,favorite,visited,notas,valoracion`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (!response.ok) return [];
  return response.json();
}

export async function saveBuildingStatus(userId, buildingId, status, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_building_status`, {
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

/** Inserta un nuevo edificio en la base de datos. */
export async function createBuilding(nuevoEdificio, sessionToken = null) {
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${sessionToken || SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/Buildings`, {
    method: 'POST',
    headers,
    body: JSON.stringify(nuevoEdificio),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'Fallo al guardar en la base de datos.');
  }
  return res.json();
}

/** Actualiza un edificio existente. Requiere token de sesión. */
export async function updateBuilding(id, edificio, sessionToken) {
  const normalizedId = String(id).trim();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/Buildings?id=eq.${encodeURIComponent(normalizedId)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(edificio),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'Fallo al actualizar la obra en la base de datos.');
  }
  const updated = await res.json().catch(() => []);
  if (!Array.isArray(updated) || updated.length === 0) {
    throw new Error('No se actualizó ninguna obra. Comprueba el id y las políticas RLS de UPDATE en Buildings.');
  }
  return updated;
}

export async function deleteBuilding(id, sessionToken) {
  const normalizedId = String(id).trim();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/Buildings?id=eq.${encodeURIComponent(normalizedId)}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Prefer': 'return=representation',
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo eliminar el proyecto.');
  }
  const deleted = await response.json().catch(() => []);
  if (!Array.isArray(deleted) || deleted.length === 0) {
    throw new Error('No se eliminó ninguna obra. Comprueba el id y la política RLS de DELETE en Buildings.');
  }
  return deleted;
}

export async function reviewBuilding(id, estadoRevision, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/Buildings?id=eq.${encodeURIComponent(String(id).trim())}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ estado_revision: estadoRevision }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo revisar la propuesta.');
  }
  return response.json();
}

export async function searchUserByNick(nick) {
  const cleanNick = String(nick || '').trim().replace(/^@/, '');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles_public?nick=eq.${encodeURIComponent(cleanNick)}&select=id,nick,avatar_url`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return rows[0] || null;
}

export async function fetchPublicUserCollections(userId) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.asc`, {
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

  // Enriquecer con perfiles de autores
  try {
    const userIds = [...new Set(collections.map((c) => c.user_id).filter(Boolean))];
    if (userIds.length > 0) {
      const profilesRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles_public?id=in.(${userIds.map((id) => `"${encodeURIComponent(id)}"`).join(',')})&select=id,nick,avatar_url`, {
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
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?id=eq.${encodeURIComponent(collectionId)}&select=id,name,icon,description,status,is_public,created_at,user_id,profiles:user_id(id,nick,first_name,last_name)&limit=1`, { headers });
  if (!response.ok) return null;
  const list = await response.json().catch(() => []);
  return list[0] || null;
}

/** Obtiene las colecciones seguidas/guardadas por el usuario actual. */
export async function fetchFollowedCollections(userId, sessionToken) {
  if (!userId || !sessionToken) return [];
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_followed_collections?user_id=eq.${encodeURIComponent(userId)}&select=collection_id,created_at,user_collections:collection_id(id,name,icon,description,status,is_public,user_id,profiles:user_id(id,nick,first_name,last_name))&order=created_at.desc`, {
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
  return response.json().catch(() => []);
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