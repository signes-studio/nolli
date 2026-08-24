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
  if (!res.ok) throw new Error('Fallo al guardar en la base de datos.');
  return res.json();
}
