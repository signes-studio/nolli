/* =========================================================================
   API.JS — Capa de acceso a datos (Supabase)
   Toda petición de red vive aquí; el resto de la app no conoce fetch/URLs.
   ========================================================================= */

import { SUPABASE_URL, SUPABASE_KEY, MAPBOX_TOKEN } from './config.js';

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

/** Descarga obras específicas por su ID (para zona personal y colecciones). */
export async function fetchBuildingsByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const cleanIds = ids.map((id) => encodeURIComponent(String(id).trim())).filter(Boolean);
  if (cleanIds.length === 0) return [];

  const publicFields = 'id,nombre_obra,foto_url,enlace_url,arquitecto,año_construccion,importancia,categoria,estado_acceso,visitable,añadido_por,estado_revision,longitud,latitud,place';
  const response = await fetch(`${SUPABASE_URL}/rest/v1/Buildings?id=in.(${cleanIds.join(',')})&select=${publicFields}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!response.ok) return [];
  return response.json();
}

/** Descarga las obras públicas del encuadre y nivel de zoom actuales. */
export async function fetchBuildings({ bounds, zoom, architect, includeAllImportance = false, signal } = {}) {
  const pageSize = 1000;
  const buildings = [];
  let start = 0;
  const publicFields = 'id,nombre_obra,foto_url,enlace_url,arquitecto,año_construccion,importancia,categoria,estado_acceso,visitable,añadido_por,estado_revision,longitud,latitud,place';
  const params = new URLSearchParams({ select: publicFields, order: 'id.asc' });
  if (bounds) {
    const [[minLongitude, minLatitude], [maxLongitude, maxLatitude]] = bounds.toArray();
    params.append('longitud', `gte.${minLongitude}`);
    params.append('latitud', `gte.${minLatitude}`);
    params.append('longitud', `lte.${maxLongitude}`);
    params.append('latitud', `lte.${maxLatitude}`);
  }
  if (architect) params.set('arquitecto', `ilike.*${architect}*`);
  const maxImportance = includeAllImportance ? 3 : Number(zoom) >= 13.5 ? 3 : Number(zoom) >= 8 ? 2 : 1;
  params.set('importancia', `lte.${maxImportance}`);

  while (true) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/Buildings?${params.toString()}`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          Range: `${start}-${start + pageSize - 1}`,
        },
        signal,
      });
      if (!response.ok) {
        if (response.status === 416) return buildings; // Rango excedido -> final de datos
        throw new Error(`Error ${response.status}`);
      }
      const page = await response.json();
      if (!Array.isArray(page)) return buildings;
      buildings.push(...page);
      if (page.length < pageSize) return buildings;
      start += pageSize;
    } catch (err) {
      if (err.name === 'AbortError' || signal?.aborted) throw err;
      console.warn('Aviso en consulta de obras:', err);
      return buildings; // Devolver lo obtenido hasta el momento para evitar caídas
    }
  }
}

/** Descarga solo los metadatos necesarios para construir filtros globales. */
export async function fetchBuildingFacets() {
  const pageSize = 1000;
  const facets = [];
  let start = 0;
  const params = new URLSearchParams({
    select: 'arquitecto,año_construccion,categoria,estado_acceso,visitable',
    order: 'id.asc',
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
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?user_id=eq.${encodeURIComponent(userId)}&select=id,name,icon,description,show_on_map,created_at&order=created_at.asc`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (!response.ok) {
    // Si la columna show_on_map no existiera aún en el servidor, fallback a consulta estándar
    const fallbackResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?user_id=eq.${encodeURIComponent(userId)}&select=id,name,icon,description,created_at&order=created_at.asc`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
    });
    if (!fallbackResponse.ok) throw new Error('No se pudieron cargar las listas personales.');
    return fallbackResponse.json();
  }
  return response.json();
}

export async function createUserCollection(collection, sessionToken) {
  const payload = {
    user_id: collection.user_id,
    name: collection.name,
  };
  if (collection.id) payload.id = collection.id;
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
    // Si falla por columna desconocida (por ejemplo si aún no se ha ejecutado el SQL), reintentar sin show_on_map
    if (payload.show_on_map !== undefined) {
      delete payload.show_on_map;
      const retryResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_collections`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(payload),
      });
      if (retryResponse.ok) return retryResponse.json();
    }
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
    if (payload.show_on_map !== undefined) {
      delete payload.show_on_map;
      const retryResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?id=eq.${encodeURIComponent(collectionId)}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(payload),
      });
      if (retryResponse.ok) return retryResponse.json().catch(() => []);
    }
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

/** Registra un usuario público con metadatos básicos de perfil. */
export async function registerUser(email, password, profile = {}) {
  const metadata = {
    first_name: String(profile.firstName || '').trim(),
    last_name: String(profile.lastName || '').trim(),
    city: String(profile.city || '').trim(),
    country: String(profile.country || '').trim(),
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

export async function upsertCurrentProfile(user, profile, sessionToken) {
  const payload = {
    id: user.id,
    email: user.email || null,
    first_name: String(profile.firstName || '').trim(),
    last_name: String(profile.lastName || '').trim(),
    city: String(profile.city || '').trim(),
    country: String(profile.country || '').trim(),
  };
  if (profile.bio != null) payload.bio = String(profile.bio).trim();
  if (profile.website != null) payload.website = String(profile.website).trim();

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
  if (!response.ok) throw new Error('No se pudo sincronizar el perfil público.');
  return response.json();
}

export async function fetchUserDirectory(sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,email,first_name,last_name,city,country,role,created_at&order=created_at.desc`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo cargar el directorio de usuarios. Ejecuta supabase_profiles.sql.');
  }
  return response.json();
}

/** Obtiene el rol del usuario autenticado desde el perfil gestionado en Supabase. */
export async function fetchUserRole(sessionToken) {
  const user = await fetchCurrentUser(sessionToken);
  const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (!profileRes.ok) return 'user';
  const profiles = await profileRes.json();
  const role = String(profiles[0]?.role || '').toLowerCase();
  return role === 'admin' || role === 'superadmin' ? role : 'user';
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
  const payload = {
    building_id: report.building_id,
    user_id: report.user_id || null,
    user_email: report.user_email || null,
    report_type: report.report_type || 'error_datos',
    description: report.description || report.descripcion || '',
    status: 'pending',
  };

  const response = await fetch(`${SUPABASE_URL}/rest/v1/reports`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken || SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo enviar el reporte.');
  }
  return response.json().catch(() => ({}));
}

export async function fetchBuildingReports(sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/reports?status=eq.pending&select=id,user_id,user_email,building_id,report_type,description,status,created_at,Buildings(nombre_obra,arquitecto)&order=created_at.desc`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (!response.ok) return [];
  return response.json().catch(() => []);
}

export async function updateBuildingReport(id, estado, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/reports?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ status: estado }),
  });
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

/** Inserta un nuevo edificio en la base de datos. Requiere token de sesión. */
export async function createBuilding(nuevoEdificio, sessionToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/Buildings`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
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
  const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?nick=eq.${encodeURIComponent(cleanNick)}&select=*`, {
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
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?is_public=eq.true&select=*,profiles:user_id(nick,first_name,last_name)&order=created_at.desc`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!response.ok) return [];
  return response.json().catch(() => []);
}