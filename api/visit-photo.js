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

async function verifyUserPermissions(supabaseUrl, serviceRoleKey, sessionToken) {
  if (!sessionToken) return null;

  try {
    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    if (!authRes.ok) return null;
    const user = await authRes.json();
    if (!user || !user.id) return null;

    if (isAuthorizedEmail(user.email)) {
      return { ...user, is_admin: true, is_editor: true, role: 'superadmin' };
    }

    const metaRole = String(user.app_metadata?.role || user.user_metadata?.role || '').toLowerCase();
    if (metaRole === 'admin' || metaRole === 'superadmin') {
      return { ...user, is_admin: true, is_editor: true, role: metaRole };
    }
    if (metaRole === 'editor') {
      return { ...user, is_admin: false, is_editor: true, role: 'editor' };
    }

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
          return { ...user, is_admin: true, is_editor: true, role: dbRole || 'admin' };
        }
        if (dbRole === 'editor') {
          return { ...user, is_admin: false, is_editor: true, role: 'editor' };
        }
        if (dbRole) {
          return { ...user, is_admin: false, is_editor: false, role: dbRole };
        }
      }
    } catch (err) {
      console.error('Error al comprobar perfil de permisos:', err);
    }

    return { ...user, is_admin: false, is_editor: false, role: metaRole || 'user' };
  } catch (authErr) {
    console.error('Error en verifyUserPermissions:', authErr);
    return null;
  }
}

module.exports = async function handler(req, res) {
  // Encabezados CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');

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

      // D) Si nos llega una data URL en base64, subirla directamente a Cloudflare R2 desde el servidor
      // para que NUNCA se guarde un string base64 en la base de datos
      let finalPhotoUrl = cleanPhotoUrl;
      let finalThumbnailUrl = thumbnail_url ? String(thumbnail_url).trim() : null;

      if (cleanPhotoUrl.startsWith('data:image/')) {
        const accountId = (process.env.R2_ACCOUNT_ID || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
        const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
        const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
        const bucketName = (process.env.R2_BUCKET_NAME || 'nolli-photos').trim();
        const publicDomain = ((process.env.R2_PUBLIC_DOMAIN || 'https://photos.nollimap.app').trim()).replace(/\/$/, '');

        if (accountId && accessKeyId && secretAccessKey) {
          try {
            const matches = cleanPhotoUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            const mimeType = (matches ? matches[1] : 'image/webp').toLowerCase();
            const base64Data = matches ? matches[2] : cleanPhotoUrl.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const ext = mimeType.split('/')[1] || 'webp';

            const crypto = require('crypto');
            const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
            const s3 = new S3Client({
              region: 'auto',
              endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
              credentials: { accessKeyId, secretAccessKey },
              forcePathStyle: true,
              requestChecksumCalculation: 'WHEN_REQUIRED',
              responseChecksumValidation: 'WHEN_REQUIRED',
            });

            const randomSuffix = crypto.randomBytes(4).toString('hex');
            const objectKey = `visits/${building_id}/${user.id}/${Date.now()}_${randomSuffix}.${ext}`;

            await s3.send(new PutObjectCommand({
              Bucket: bucketName,
              Key: objectKey,
              Body: buffer,
              ContentType: mimeType,
            }));

            finalPhotoUrl = `${publicDomain}/${objectKey}`;
            finalThumbnailUrl = `https://wsrv.nl/?url=${encodeURIComponent(finalPhotoUrl)}&w=400&output=webp&q=80`;
            console.log(`[visit-photo] Base64 subido a R2 con éxito: ${finalPhotoUrl}`);
          } catch (r2Err) {
            console.error('[visit-photo] Error al transferir base64 a R2:', r2Err);
          }
        }
      }

      // E) Construir registro para visit_photos
      const safeThumbnail = finalThumbnailUrl
        ? finalThumbnailUrl
        : (finalPhotoUrl.startsWith('data:') ? finalPhotoUrl : `https://wsrv.nl/?url=${encodeURIComponent(finalPhotoUrl)}&w=400&output=webp&q=80`);

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
        photo_url: finalPhotoUrl,
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

      // F) Inserción en visit_photos usando serviceRoleKey (bypass completo de RLS)
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

      // G) Si se solicitó como foto principal de la ficha y se dispone de serviceRoleKey, actualizar ficha de la obra
      if (setAsMain && hasServiceRoleKey) {
        try {
          const buildingUpdatePayload = {
            foto_url: finalPhotoUrl,
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

  // =========================================================================
  // 3. PATCH: Edición de metadatos de fotografía (autor, pie de foto, visibilidad, fijar portada)
  // =========================================================================
  if (req.method === 'PATCH') {
    try {
      const authHeader = req.headers.authorization || req.headers.Authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim() || req.body?.sessionToken;
      if (!token) {
        return res.status(401).json({ error: 'No autorizado: sesión no proporcionada.' });
      }

      const user = await verifyUserPermissions(supabaseUrl, serviceRoleKey, token);
      if (!user) {
        return res.status(401).json({ error: 'No autorizado: token inválido o expirado.' });
      }

      const photoId = req.body?.id || req.query?.id;
      if (!photoId) {
        return res.status(400).json({ error: 'ID de fotografía requerido.' });
      }

      // Consultar la foto existente
      const getRes = await fetch(`${supabaseUrl}/rest/v1/visit_photos?id=eq.${encodeURIComponent(photoId)}&select=*`, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });

      if (!getRes.ok) {
        return res.status(getRes.status).json({ error: 'Error al consultar la fotografía.' });
      }

      const rows = await getRes.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ error: 'Fotografía no encontrada.' });
      }

      const photo = rows[0];

      // Comprobar si el usuario tiene permiso para editar (admin, editor o propietario)
      const canEdit = user.is_admin || user.is_editor || photo.user_id === user.id;
      if (!canEdit) {
        return res.status(403).json({ error: 'No tienes permiso para editar esta fotografía.' });
      }

      const {
        caption,
        author,
        visibility,
        is_featured_in_catalog,
        setAsMain,
      } = req.body || {};

      const currentMeta = (typeof photo.metadata === 'object' && photo.metadata !== null) ? { ...photo.metadata } : {};
      if (author !== undefined) {
        currentMeta.author = author ? String(author).trim() : null;
      }

      const patchPayload = {
        metadata: currentMeta,
      };

      if (caption !== undefined) {
        patchPayload.caption = caption ? String(caption).trim() : null;
      }
      if (visibility !== undefined) {
        const validVisibility = ['public', 'friends', 'private'];
        if (validVisibility.includes(visibility)) {
          patchPayload.visibility = visibility;
        }
      }
      if (is_featured_in_catalog !== undefined || setAsMain !== undefined) {
        patchPayload.is_featured_in_catalog = Boolean(is_featured_in_catalog || setAsMain);
      }

      const updateRes = await fetch(`${supabaseUrl}/rest/v1/visit_photos?id=eq.${encodeURIComponent(photoId)}`, {
        method: 'PATCH',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(patchPayload),
      });

      if (!updateRes.ok) {
        const errJson = await updateRes.json().catch(() => ({}));
        return res.status(updateRes.status).json({ error: errJson.message || 'Error al actualizar la foto.' });
      }

      const updatedRows = await updateRes.json();
      const updatedPhoto = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;

      // Si se solicitó fijar como portada principal de la obra en Buildings
      if (setAsMain && photo.building_id && hasServiceRoleKey) {
        try {
          const finalAuthor = author !== undefined ? author : (currentMeta.author || user.user_metadata?.full_name || 'Comunidad');
          const bldUpdate = await fetch(
            `${supabaseUrl}/rest/v1/Buildings?id=eq.${encodeURIComponent(String(photo.building_id).trim())}`,
            {
              method: 'PATCH',
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                foto_url: photo.photo_url,
                foto_credito: finalAuthor ? String(finalAuthor).trim() : null,
                updated_at: new Date().toISOString(),
              }),
            }
          );
          if (bldUpdate.ok) {
            purgeBuildingCdnCache(photo.building_id).catch(() => {});
          }
        } catch (bldErr) {
          console.warn('Aviso al fijar portada principal:', bldErr);
        }
      }

      return res.status(200).json({ success: true, photo: updatedPhoto });
    } catch (err) {
      console.error('Error en PATCH /api/visit-photo:', err);
      return res.status(500).json({ error: 'Error interno al actualizar la fotografía.' });
    }
  }

  // =========================================================================
  // 4. DELETE: Eliminación de fotografía por administrador, editor o propietario
  // =========================================================================
  if (req.method === 'DELETE') {
    try {
      const authHeader = req.headers.authorization || req.headers.Authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim() || req.body?.sessionToken;
      if (!token) {
        return res.status(401).json({ error: 'No autorizado: sesión no proporcionada.' });
      }

      const user = await verifyUserPermissions(supabaseUrl, serviceRoleKey, token);
      if (!user) {
        return res.status(401).json({ error: 'No autorizado: token inválido o expirado.' });
      }

      const photoId = req.query?.id || req.body?.id;
      if (!photoId) {
        return res.status(400).json({ error: 'ID de fotografía requerido.' });
      }

      // Consultar la foto existente
      const getRes = await fetch(`${supabaseUrl}/rest/v1/visit_photos?id=eq.${encodeURIComponent(photoId)}&select=*`, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });

      if (!getRes.ok) {
        return res.status(getRes.status).json({ error: 'Error al consultar la fotografía.' });
      }

      const rows = await getRes.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ error: 'Fotografía no encontrada.' });
      }

      const photo = rows[0];

      // Comprobar si el usuario tiene permiso para eliminar (admin, editor o propietario)
      const canDelete = user.is_admin || user.is_editor || photo.user_id === user.id;
      if (!canDelete) {
        return res.status(403).json({ error: 'No tienes permiso para eliminar esta fotografía.' });
      }

      // Eliminar registro en Supabase
      const delRes = await fetch(`${supabaseUrl}/rest/v1/visit_photos?id=eq.${encodeURIComponent(photoId)}`, {
        method: 'DELETE',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });

      if (!delRes.ok) {
        const errJson = await delRes.json().catch(() => ({}));
        return res.status(delRes.status).json({ error: errJson.message || 'Error al eliminar la fotografía de la base de datos.' });
      }

      // Si la foto eliminada era la foto principal de la obra, desvincularla en Buildings
      if (photo.building_id && hasServiceRoleKey) {
        try {
          const bldRes = await fetch(`${supabaseUrl}/rest/v1/Buildings?id=eq.${encodeURIComponent(String(photo.building_id).trim())}&select=id,foto_url`, {
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
            },
          });
          if (bldRes.ok) {
            const blds = await bldRes.json();
            const bld = blds[0];
            if (bld && bld.foto_url === photo.photo_url) {
              // Limpiar foto_url en Buildings
              await fetch(`${supabaseUrl}/rest/v1/Buildings?id=eq.${encodeURIComponent(String(photo.building_id).trim())}`, {
                method: 'PATCH',
                headers: {
                  apikey: serviceRoleKey,
                  Authorization: `Bearer ${serviceRoleKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  foto_url: null,
                  foto_credito: null,
                  updated_at: new Date().toISOString(),
                }),
              });
              purgeBuildingCdnCache(photo.building_id).catch(() => {});
            }
          }
        } catch (bldErr) {
          console.warn('Aviso al limpiar foto_url en Buildings:', bldErr);
        }
      }

      // Si tiene clave en R2, intentar borrar el objeto en Cloudflare R2
      const r2Key = photo.metadata?.r2_key;
      const accountId = (process.env.R2_ACCOUNT_ID || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
      const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
      const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
      const bucketName = (process.env.R2_BUCKET_NAME || 'nolli-photos').trim();

      if (r2Key && accountId && accessKeyId && secretAccessKey) {
        try {
          const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
          const s3 = new S3Client({
            region: 'auto',
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId, secretAccessKey },
            forcePathStyle: true,
          });
          await s3.send(new DeleteObjectCommand({
            Bucket: bucketName,
            Key: r2Key,
          }));
        } catch (r2DelErr) {
          console.warn('Aviso al eliminar objeto de R2:', r2DelErr.message);
        }
      }

      return res.status(200).json({ success: true, message: 'Fotografía eliminada correctamente.' });
    } catch (err) {
      console.error('Error en DELETE /api/visit-photo:', err);
      return res.status(500).json({ error: 'Error interno al eliminar la fotografía.' });
    }
  }

  return res.status(405).json({ error: `Método ${req.method} no permitido.` });
};

