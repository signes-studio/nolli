/**
 * API Endpoint: /api/visit-photo
 * NOLLI ARCHITECTURE ATLAS
 * 
 * Inserción y consulta segura de fotografías de obras y visitas.
 * Utiliza Supabase service_role para garantizar inserciones atómicas sin bloqueos por RLS,
 * validando siempre la autenticación del usuario y blindando contra egress no autorizado.
 */

const { getSupabaseConfig } = require('./_lib/supabaseEnv.js');
const { purgeBuildingCdnCache } = require('./_lib/cdnPurge.js');

module.exports = async function handler(req, res) {
  // Encabezados CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { supabaseUrl, serviceRoleKey, hasServiceRoleKey } = getSupabaseConfig();

  // =========================================================================
  // 1. GET: Consulta de fotografías de una obra
  // =========================================================================
  if (req.method === 'GET') {
    const buildingId = req.query?.building_id || req.query?.buildingId;
    if (!buildingId) {
      return res.status(400).json({ error: 'Parámetro building_id requerido.' });
    }

    try {
      const authKey = hasServiceRoleKey ? serviceRoleKey : (process.env.SUPABASE_KEY || '');
      const params = new URLSearchParams({
        building_id: `eq.${buildingId}`,
        select: 'id,visit_id,user_id,building_id,photo_url,thumbnail_url,photo_type,caption,visibility,is_featured_in_catalog,metadata,created_at',
        order: 'created_at.desc',
      });

      const response = await fetch(`${supabaseUrl}/rest/v1/visit_photos?${params.toString()}`, {
        headers: {
          apikey: authKey,
          Authorization: `Bearer ${authKey}`,
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Error al consultar fotografías.' });
      }

      const data = await response.json();
      return res.status(200).json(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error al obtener fotografías:', err);
      return res.status(500).json({ error: 'Error interno al consultar fotografías.' });
    }
  }

  // =========================================================================
  // 2. POST: Inserción de fotografía con validación de sesión y bypass de RLS
  // =========================================================================
  if (req.method === 'POST') {
    try {
      // A) Autenticación obligatoria mediante token Bearer de Supabase
      const authHeader = req.headers.authorization || req.headers.Authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim() || req.body?.sessionToken;

      if (!token) {
        return res.status(401).json({ error: 'No autorizado: sesión no proporcionada.' });
      }

      const checkKey = hasServiceRoleKey ? serviceRoleKey : (process.env.SUPABASE_KEY || '');
      const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: checkKey,
          Authorization: `Bearer ${token}`,
        },
      });

      if (!authRes.ok) {
        return res.status(401).json({ error: 'No autorizado: token de sesión inválido o expirado.' });
      }

      const user = await authRes.json();
      if (!user || !user.id) {
        return res.status(401).json({ error: 'No autorizado: usuario no encontrado.' });
      }

      // B) Validación y saneamiento del payload
      const {
        building_id,
        photo_url,
        thumbnail_url,
        photo_type,
        caption,
        visibility,
        is_featured_in_catalog,
        metadata,
        visit_id,
        setAsMain,
        author,
      } = req.body || {};

      if (!building_id) {
        return res.status(400).json({ error: 'Parámetro building_id requerido.' });
      }

      if (!photo_url || typeof photo_url !== 'string') {
        return res.status(400).json({ error: 'Parámetro photo_url requerido.' });
      }

      const cleanPhotoUrl = photo_url.trim();

      // Blindaje de seguridad anti-egress: CERO almacenamiento en Supabase Storage
      const lowerUrl = cleanPhotoUrl.toLowerCase();
      if (lowerUrl.includes('supabase.co/storage') || lowerUrl.includes('.supabase.in/storage')) {
        return res.status(400).json({
          error: 'Infracción de seguridad anti-egress: No se permite almacenar fotos en Supabase Storage.',
        });
      }

      // C) Asegurar que el perfil existe en public.profiles para cumplir la Foreign Key
      if (hasServiceRoleKey) {
        try {
          await fetch(`${supabaseUrl}/rest/v1/profiles?on_conflict=id`, {
            method: 'POST',
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify({
              id: user.id,
              email: user.email || null,
            }),
          });
        } catch (profErr) {
          console.warn('Advertencia asegurando profile en visit-photo:', profErr);
        }
      }

      // D) Construir registro para visit_photos
      const safeThumbnail = thumbnail_url
        ? String(thumbnail_url).trim()
        : (cleanPhotoUrl.startsWith('data:') ? cleanPhotoUrl : `https://wsrv.nl/?url=${encodeURIComponent(cleanPhotoUrl)}&w=400&output=webp&q=80`);

      const validPhotoTypes = ['standard', 'analysis_sketch', 'analysis_diagram', 'analysis_detail'];
      const validVisibility = ['public', 'friends', 'private'];

      const isFeatured = Boolean(is_featured_in_catalog || setAsMain);
      const safeMetadata = (typeof metadata === 'object' && metadata !== null) ? { ...metadata } : {};
      if (author && !safeMetadata.author) {
        safeMetadata.author = String(author).trim();
      }

      const photoRecord = {
        user_id: user.id,
        building_id: String(building_id).trim(),
        photo_url: cleanPhotoUrl,
        thumbnail_url: safeThumbnail,
        photo_type: validPhotoTypes.includes(photo_type) ? photo_type : 'standard',
        caption: caption ? String(caption).trim() : null,
        visibility: validVisibility.includes(visibility) ? visibility : 'public',
        is_featured_in_catalog: isFeatured,
        metadata: safeMetadata,
      };

      if (visit_id) {
        photoRecord.visit_id = visit_id;
      }

      // E) Inserción en visit_photos usando serviceRoleKey (bypass completo de RLS)
      const insertKey = hasServiceRoleKey ? serviceRoleKey : token;
      const insertHeaders = {
        apikey: hasServiceRoleKey ? serviceRoleKey : (process.env.SUPABASE_KEY || ''),
        Authorization: `Bearer ${insertKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      };

      const insertRes = await fetch(`${supabaseUrl}/rest/v1/visit_photos`, {
        method: 'POST',
        headers: insertHeaders,
        body: JSON.stringify(photoRecord),
      });

      if (!insertRes.ok) {
        const errJson = await insertRes.json().catch(() => ({}));
        console.error('Error al insertar visit_photo en Supabase:', errJson);
        return res.status(insertRes.status).json({
          error: errJson.message || errJson.details || 'Error al guardar la fotografía en la base de datos.',
          details: errJson,
        });
      }

      const insertedData = await insertRes.json();
      const photo = Array.isArray(insertedData) ? insertedData[0] : insertedData;

      // F) Si se solicitó como foto principal de la ficha y se dispone de serviceRoleKey, actualizar ficha de la obra
      if (setAsMain && hasServiceRoleKey) {
        try {
          const buildingUpdatePayload = {
            foto_url: cleanPhotoUrl,
            foto_credito: author ? String(author).trim() : (user.user_metadata?.full_name || 'Comunidad'),
            updated_at: new Date().toISOString(),
          };

          const updateBuildingRes = await fetch(
            `${supabaseUrl}/rest/v1/Buildings?id=eq.${encodeURIComponent(String(building_id).trim())}`,
            {
              method: 'PATCH',
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(buildingUpdatePayload),
            }
          );

          if (updateBuildingRes.ok) {
            purgeBuildingCdnCache(building_id).catch(() => {});
          }
        } catch (bldErr) {
          console.warn('Advertencia al actualizar foto principal en Buildings:', bldErr);
        }
      }

      return res.status(201).json({
        success: true,
        photo,
      });
    } catch (err) {
      console.error('Error interno en /api/visit-photo:', err);
      return res.status(500).json({
        error: 'Error interno del servidor al procesar la fotografía.',
        details: err.message,
      });
    }
  }

  return res.status(405).json({ error: `Método ${req.method} no permitido.` });
};
