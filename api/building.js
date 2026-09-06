const FALLBACK_SUPABASE_URL = 'https://ldtfvpjigzvcagtciipn.supabase.co';
const FALLBACK_SUPABASE_KEY = 'sb_publishable_kYQ7Fa8nBsrkp1f8C4AuAg_4-5uBFm0';

const ADMIN_EMAILS = [
  'office@signes.studio',
  'studio.signes@gmail.com',
  'alvaro11pm@gmail.com',
];

function isAuthorizedEmail(email) {
  if (!email) return false;
  const cleanEmail = String(email).toLowerCase().trim();
  if (ADMIN_EMAILS.includes(cleanEmail)) return true;
  if (cleanEmail.includes('signes.studio') || cleanEmail.includes('studio.signes')) return true;
  return false;
}

async function verifyAdminUser(supabaseUrl, serviceRoleKey, sessionToken) {
  if (!sessionToken) return null;

  // 1. Obtener datos de usuario autenticado en Supabase Auth
  const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!authRes.ok) return null;
  const user = await authRes.json();
  if (!user || !user.id) return null;

  // 2. Comprobar email prioritario
  if (isAuthorizedEmail(user.email)) {
    return { ...user, is_admin: true };
  }

  // 3. Comprobar app_metadata o user_metadata
  const metaRole = String(user.app_metadata?.role || user.user_metadata?.role || '').toLowerCase();
  if (metaRole === 'admin' || metaRole === 'superadmin') {
    return { ...user, is_admin: true };
  }

  // 4. Comprobar rol en la tabla public.profiles usando clave de servicio
  try {
    const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,email`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (profileRes.ok) {
      const profiles = await profileRes.json();
      const dbRole = String(profiles[0]?.role || '').toLowerCase();
      const dbEmail = String(profiles[0]?.email || '').toLowerCase();
      if (dbRole === 'admin' || dbRole === 'superadmin' || isAuthorizedEmail(dbEmail)) {
        return { ...user, is_admin: true };
      }
    }
  } catch (err) {
    console.error('Error al comprobar perfil de admin:', err);
  }

  return null;
}

function sanitizeBuildingPayload(data, isUpdate = false) {
  const payload = {};

  if (!isUpdate && data.id) {
    payload.id = String(data.id).trim();
  }

  if (data.nombre_obra !== undefined) payload.nombre_obra = String(data.nombre_obra || '').trim();
  if (data.arquitecto !== undefined) payload.arquitecto = String(data.arquitecto || '').trim();
  
  if (data.año_construccion !== undefined) {
    payload.año_construccion = data.año_construccion != null ? String(data.año_construccion).trim() : null;
  }

  if (data.categoria !== undefined) payload.categoria = String(data.categoria || 'otro').trim();
  if (data.estado_acceso !== undefined) payload.estado_acceso = String(data.estado_acceso || 'publico').trim();
  if (data.estado_revision !== undefined) payload.estado_revision = String(data.estado_revision || 'publicada').trim();
  if (data.foto_url !== undefined) payload.foto_url = data.foto_url ? String(data.foto_url).trim() : null;
  if (data.enlace_url !== undefined) payload.enlace_url = data.enlace_url ? String(data.enlace_url).trim() : null;
  if (data.place !== undefined) payload.place = data.place ? String(data.place).trim() : null;
  if (data.foto_credito !== undefined) payload.foto_credito = data.foto_credito ? String(data.foto_credito).trim() : null;
  if (data.foto_licencia !== undefined) payload.foto_licencia = data.foto_licencia ? String(data.foto_licencia).trim() : null;
  if (data.foto_fuente_url !== undefined) payload.foto_fuente_url = data.foto_fuente_url ? String(data.foto_fuente_url).trim() : null;

  if (data.importancia !== undefined) {
    const imp = Number(data.importancia);
    payload.importancia = Number.isFinite(imp) ? imp : 1;
  }

  if (data.latitud !== undefined) {
    const lat = Number(data.latitud);
    payload.latitud = Number.isFinite(lat) ? lat : null;
  }

  if (data.longitud !== undefined) {
    const lon = Number(data.longitud);
    payload.longitud = Number.isFinite(lon) ? lon : null;
  }

  if (data.visitable !== undefined) {
    payload.visitable = Boolean(data.visitable);
  }

  if (data.añadido_por !== undefined) {
    payload.añadido_por = String(data.añadido_por || 'administrador').trim();
  }

  if (data.propuesto_por !== undefined) {
    payload.propuesto_por = data.propuesto_por || null;
  }

  // Marcar siempre updated_at con la fecha actual del servidor
  payload.updated_at = new Date().toISOString();

  // Excluir explícitamente columnas generadas (geom, categoria_norm) para evitar errores PostGIS
  delete payload.geom;
  delete payload.categoria_norm;

  return payload;
}

module.exports = async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_KEY;

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  // Permitir preflight CORS si aplica
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey');
    return res.status(204).end();
  }

  // Extraer token de cabecera Authorization
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(401).json({ error: 'Se requiere autorización de sesión para realizar esta operación.' });
  }

  // Validar permisos de administrador
  const adminUser = await verifyAdminUser(supabaseUrl, supabaseKey, token);
  if (!adminUser) {
    return res.status(403).json({ error: 'Acceso denegado: Se requieren permisos de administrador o superadministrador.' });
  }

  try {
    if (req.method === 'POST') {
      // CREAR OBRA
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const cleanPayload = sanitizeBuildingPayload(body, false);

      if (!cleanPayload.nombre_obra) {
        return res.status(400).json({ error: 'El nombre de la obra es obligatorio.' });
      }

      if (!cleanPayload.id) {
        cleanPayload.id = Math.random().toString(36).substring(2, 10).toUpperCase();
      }

      const response = await fetch(`${supabaseUrl}/rest/v1/Buildings`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(cleanPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Error de Supabase al insertar obra:', response.status, errorData);
        return res.status(response.status).json({
          error: errorData.message || errorData.details || 'Error al guardar la obra en la base de datos.',
        });
      }

      const inserted = await response.json();
      return res.status(201).json(inserted);
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      // ACTUALIZAR OBRA
      const id = String(req.query?.id || req.body?.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Falta el identificador (id) de la obra a actualizar.' });
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const cleanPayload = sanitizeBuildingPayload(body, true);

      const response = await fetch(`${supabaseUrl}/rest/v1/Buildings?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(cleanPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Error de Supabase al actualizar obra:', response.status, errorData);
        return res.status(response.status).json({
          error: errorData.message || errorData.details || 'Error al actualizar la obra en la base de datos.',
        });
      }

      const updated = await response.json();
      if (!Array.isArray(updated) || updated.length === 0) {
        return res.status(404).json({ error: `No se encontró ninguna obra con el ID ${id}.` });
      }

      return res.status(200).json(updated);
    }

    if (req.method === 'DELETE') {
      // ELIMINAR OBRA
      const id = String(req.query?.id || req.body?.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Falta el identificador (id) de la obra a eliminar.' });
      }

      const response = await fetch(`${supabaseUrl}/rest/v1/Buildings?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=representation',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Error de Supabase al eliminar obra:', response.status, errorData);
        return res.status(response.status).json({
          error: errorData.message || errorData.details || 'Error al eliminar la obra de la base de datos.',
        });
      }

      const deleted = await response.json().catch(() => []);
      return res.status(200).json(deleted);
    }

    return res.status(405).json({ error: `Método HTTP ${req.method} no permitido.` });
  } catch (err) {
    console.error('Excepción en /api/building:', err);
    return res.status(500).json({ error: err.message || 'Error interno del servidor al procesar la obra.' });
  }
};

