/* =========================================================================
   PHOTO STORAGE CONFIGURATION — NOLLI SOCIAL ARCHITECTURE (FASE 2)
   Proveedor Seleccionado: Cloudflare R2 + CDN (Zero Egress Fees)
   
   JUSTIFICACIÓN DE SELECCIÓN:
   Supabase suspendió recientemente el servicio por superar en un 259% el límite
   de egress mensual. Para evitar facturaciones y suspensiones, las fotos de los
   usuarios (visitas, bocetos de análisis, diagramas y detalles) se almacenan
   externamente en Cloudflare R2:
     - 0$ coste de salida de datos (Zero Egress Fees para siempre).
     - 10 GB de almacenamiento gratuito al mes.
     - 10M operaciones de lectura (Clase B) al mes sin coste.
     - Generación de miniaturas al vuelo con CDN / wsrv.nl.
   
   REGLA DE SEGURIDAD ABSOLUTA:
   Bajo ninguna circunstancia se permite subir o alojar imágenes en Supabase Storage.
   La base de datos PostgreSQL valida esta regla con chk_no_supabase_storage.
   ========================================================================= */

export const PHOTO_STORAGE_CONFIG = {
  provider: 'cloudflare_r2',
  publicCdnDomain: 'https://photos.nollimap.app',
  thumbnailProxyBase: 'https://wsrv.nl/?url=',
  isUploadFlowActive: true, // Flujo de subida activo con URLs prefirmadas directas a Cloudflare R2
};

/**
 * Solicita una URL prefirmada PUT a Cloudflare R2 al endpoint serverless de Nolli.
 * @param {Object} params - { filename, contentType, buildingId, visitId, photoType }
 * @param {string} sessionToken - Token de sesión Supabase del usuario
 * @returns {Promise<Object>} { uploadUrl, publicUrl, key, expiresIn, userId }
 */
export async function requestPhotoUploadUrl({ filename, contentType, buildingId, visitId, photoType }, sessionToken) {
  if (!sessionToken) {
    throw new Error('Debes iniciar sesión para subir fotografías.');
  }

  const response = await fetch('/api/r2-upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ filename, contentType, buildingId, visitId, photoType }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'No se pudo obtener la URL de subida para Cloudflare R2.');
  }

  return response.json();
}

/**
 * Sube el archivo binario directamente al bucket Cloudflare R2 mediante la URL prefirmada PUT.
 * CERO tráfico hacia el servidor Nolli o Supabase (Egress = 0).
 * @param {File|Blob} file - Archivo a subir
 * @param {string} uploadUrl - URL prefirmada generada por /api/r2-upload-url
 * @param {Function|null} onProgress - Callback (percent, loaded, total)
 * @returns {Promise<boolean>}
 */
export function uploadPhotoFileToR2(file, uploadUrl, onProgress = null) {
  return new Promise((resolve, reject) => {
    if (!file || !uploadUrl) {
      return reject(new Error('Archivo y URL de subida requeridos.'));
    }

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent, e.loaded, e.total);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(true);
      } else {
        reject(new Error(`Error al transferir imagen a Cloudflare R2: HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Error de red al transferir archivo a Cloudflare R2.'));
    xhr.ontimeout = () => reject(new Error('Tiempo de espera agotado al transferir archivo a Cloudflare R2.'));

    xhr.send(file);
  });
}

/**
 * Orquesta el flujo completo de subida de foto de visita:
 * 1. Pide URL prefirmada a /api/r2-upload-url
 * 2. Transfiere el binario directamente a Cloudflare R2
 * 3. Genera la URL de miniatura CDN
 * 4. Registra los metadatos en Supabase PostgreSQL (visit_photos)
 *
 * @param {Object} uploadData - { file, buildingId, visitId, photoType, caption, visibility, isFeatured, metadata }
 * @param {string} sessionToken - Token de sesión Supabase
 * @param {Function|null} onProgress - Callback de progreso (percent)
 * @returns {Promise<Object>} Registro creado en visit_photos
 */
export async function uploadVisitPhotoWithR2(uploadData, sessionToken, onProgress = null) {
  const {
    file,
    buildingId,
    visitId = null,
    photoType = 'standard',
    caption = null,
    visibility = 'friends',
    isFeatured = false,
    metadata = {},
  } = uploadData || {};

  if (!file) throw new Error('Archivo de imagen requerido.');
  if (!sessionToken) throw new Error('Usuario no autenticado.');

  // 1. Obtener ticket con URL prefirmada
  const ticket = await requestPhotoUploadUrl({
    filename: file.name,
    contentType: file.type || 'image/jpeg',
    buildingId,
    visitId,
    photoType,
  }, sessionToken);

  if (!ticket.uploadUrl || !ticket.publicUrl) {
    throw new Error('La respuesta del servidor no incluyó una URL de subida válida.');
  }

  // 2. Subida directa navegador -> Cloudflare R2 (Cero Egress hacia Supabase)
  await uploadPhotoFileToR2(file, ticket.uploadUrl, onProgress);

  // 3. Generar miniatura optimizada vía CDN
  const thumbnailUrl = getPhotoThumbnailUrl(ticket.publicUrl, 400);

  // 4. Registro en PostgreSQL (tabla visit_photos)
  const { createVisitPhoto } = await import('./api.js');
  const record = await createVisitPhoto({
    visit_id: visitId,
    user_id: ticket.userId,
    building_id: buildingId,
    photo_url: ticket.publicUrl,
    thumbnail_url: thumbnailUrl,
    photo_type: photoType,
    caption,
    visibility,
    is_featured_in_catalog: isFeatured,
    metadata: {
      ...metadata,
      r2_key: ticket.key,
      file_size: file.size,
      mime_type: file.type,
    },
  }, sessionToken);

  return record;
}

/**
 * Valida si una URL de foto cumple con la política de seguridad anti-egress de Nolli.
 * @param {string} url - URL de la imagen a validar
 * @returns {boolean} true si es segura, false si viola la política anti-egress
 */
export function isSafePhotoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().toLowerCase();
  
  // Prohibir estrictamente cualquier URL de Supabase Storage
  if (trimmed.includes('supabase.co/storage') || trimmed.includes('.supabase.in/storage')) {
    console.error('[Anti-Egress Security] Rechazada URL perteneciente a Supabase Storage:', url);
    return false;
  }
  
  // Aceptar URLs seguras HTTPS
  return trimmed.startsWith('https://') || trimmed.startsWith('http://localhost');
}

/**
 * Genera la URL de miniatura optimizada vía CDN sin computación en servidor Nolli.
 * @param {string} originalUrl - URL original en R2 o proveedor externo
 * @param {number} width - Ancho deseado en píxeles (default: 400)
 * @returns {string} URL de la miniatura
 */
export function getPhotoThumbnailUrl(originalUrl, width = 400) {
  if (!originalUrl) return '';
  if (!isSafePhotoUrl(originalUrl)) return '';
  return `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}&w=${width}&output=webp&q=80`;
}
