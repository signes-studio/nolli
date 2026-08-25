/* =========================================================================
   API.JS — Capa de acceso a datos (Supabase)
   Toda petición de red vive aquí; el resto de la app no conoce fetch/URLs.
   ========================================================================= */

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

/** Descarga el listado completo de edificios. */
export async function fetchBuildings() {
  const respuesta = await fetch(`${SUPABASE_URL}/rest/v1/Buildings?select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!respuesta.ok) throw new Error(`Error ${respuesta.status}`);
  return respuesta.json();
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

/** Autentica al administrador y devuelve el access_token. */
export async function loginAdmin(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'ACCESO DENEGADO.');
  return data.access_token;
}

/** Registra un usuario público. El rol se asigna en Supabase, nunca desde el cliente. */
export async function registerUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || data.message || 'No se pudo crear la cuenta.');
  return data;
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

export async function createBuildingReport(report, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/building_reports`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ ...report, estado: 'pendiente' }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo enviar el reporte.');
  }
  return response.json();
}

export async function fetchBuildingReports(sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/building_reports?estado=eq.pendiente&select=id,user_id,building_id,descripcion,estado,created_at&order=created_at.desc`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (!response.ok) return [];
  return response.json();
}

export async function updateBuildingReport(id, estado, sessionToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/building_reports?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ estado }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.details || 'No se pudo actualizar el reporte.');
  }
  return response.json();
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
