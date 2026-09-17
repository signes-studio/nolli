/* =========================================================================
   PHOTO STORAGE CONFIGURATION — NOLLI SOCIAL ARCHITECTURE (FASE 2)
   Proveedor Seleccionado: Cloudflare R2 + CDN (Zero Egress Fees)
   ========================================================================= */

import type { VisitPhotoRow } from './types/index.js';

export interface PhotoStorageConfig {
  provider: string;
  publicCdnDomain: string;
  thumbnailProxyBase: string;
  isUploadFlowActive: boolean;
}

export const PHOTO_STORAGE_CONFIG: PhotoStorageConfig = {
  provider: 'cloudflare_r2',
  publicCdnDomain: 'https://photos.nollimap.app',
  thumbnailProxyBase: 'https://wsrv.nl/?url=',
  isUploadFlowActive: true,
};

export interface PhotoUploadParams {
  filename: string;
  contentType: string;
  buildingId?: string | number | null;
  visitId?: string | number | null;
  photoType?: string;
  uploadType?: 'avatar' | 'building' | 'visit';
}

export interface PhotoUploadTicket {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn?: number;
  userId?: string;
}

/**
 * Solicita una URL prefirmada PUT a Cloudflare R2 al endpoint serverless de Nolli.
 */
export async function requestPhotoUploadUrl(
  params: PhotoUploadParams,
  sessionToken: string | null | undefined
): Promise<PhotoUploadTicket> {
  if (!sessionToken) {
    throw new Error('Debes iniciar sesión para subir fotografías.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch('/api/r2-upload-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      throw new Error(err.message || err.error || 'No se pudo obtener la URL de subida para Cloudflare R2.');
    }

    return (await response.json()) as PhotoUploadTicket;
  } finally {
    clearTimeout(timer);
  }
}

export type ProgressCallback = (percent: number, loaded: number, total: number) => void;

/**
 * Sube el archivo binario directamente al bucket Cloudflare R2 mediante la URL prefirmada PUT.
 * CERO tráfico hacia el servidor Nolli o Supabase (Egress = 0).
 */
export function uploadPhotoFileToR2(
  file: File | Blob,
  uploadUrl: string,
  onProgress: ProgressCallback | null = null
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!file || !uploadUrl) {
      return reject(new Error('Archivo y URL de subida requeridos.'));
    }

    const xhr = new XMLHttpRequest();
    xhr.timeout = 12000; // 12s máx para evitar congelamiento de UI
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e: ProgressEvent) => {
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

    xhr.onerror = () => reject(new Error('Error de red al transferir archivo a Cloudflare R2 (posible política CORS no configurada o bloqueo de origen en Cloudflare R2).'));
    xhr.ontimeout = () => reject(new Error('Tiempo de espera agotado al transferir archivo a Cloudflare R2.'));

    xhr.send(file);
  });
}

export interface VisitPhotoUploadData {
  file: File;
  buildingId: string | number;
  visitId?: string | number | null;
  photoType?: string;
  caption?: string | null;
  visibility?: 'friends' | 'public' | 'private' | string;
  isFeatured?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Orquesta el flujo completo de subida de foto de visita
 */
export async function uploadVisitPhotoWithR2(
  uploadData: VisitPhotoUploadData,
  sessionToken: string | null | undefined,
  onProgress: ProgressCallback | null = null
): Promise<VisitPhotoRow> {
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

  let photoUrl = '';
  let thumbnailUrl = '';
  let r2Key = `visit-${Date.now()}`;
  let usedFallback = false;

  try {
    // 1. Obtener ticket con URL prefirmada
    const ticket = await requestPhotoUploadUrl({
      filename: file.name,
      contentType: file.type || 'image/jpeg',
      buildingId,
      visitId,
      photoType,
    }, sessionToken);

    if (ticket.uploadUrl && ticket.publicUrl) {
      // 2. Subida directa navegador -> Cloudflare R2 (Cero Egress hacia Supabase)
      await uploadPhotoFileToR2(file, ticket.uploadUrl, onProgress);
      photoUrl = ticket.publicUrl;
      thumbnailUrl = getPhotoThumbnailUrl(ticket.publicUrl, 400);
      r2Key = ticket.key;
    }
  } catch (err: unknown) {
    console.warn('Subida a Cloudflare R2 no completada para foto de visita, activando respaldo WebP:', err);
    usedFallback = true;
    onProgress?.(50, 1, 2);
    photoUrl = await compressImageToDataUrl(file, 1200, 0.82);
    thumbnailUrl = photoUrl;
    onProgress?.(100, 2, 2);
  }

  if (!photoUrl) {
    photoUrl = await compressImageToDataUrl(file, 1200, 0.82);
    thumbnailUrl = photoUrl;
    usedFallback = true;
  }

  // 3. Registro en PostgreSQL (tabla visit_photos)
  // Dynamic import para desacoplar de la capa api.js
  const { createVisitPhoto, fetchCurrentUser } = await import('./api.js');
  const user = await fetchCurrentUser(sessionToken);
  
  const record = await createVisitPhoto({
    visit_id: visitId,
    user_id: user?.id,
    building_id: buildingId,
    photo_url: photoUrl,
    thumbnail_url: thumbnailUrl,
    photo_type: photoType,
    caption,
    visibility,
    is_featured_in_catalog: isFeatured,
    metadata: {
      ...metadata,
      r2_key: r2Key,
      file_size: file.size,
      mime_type: file.type,
      storage_type: usedFallback ? 'client_webp' : 'cloudflare_r2',
    },
  }, sessionToken);

  return record;
}

/**
 * Valida si una URL de foto cumple con la política de seguridad anti-egress de Nolli.
 */
export function isSafePhotoUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().toLowerCase();
  
  // Prohibir estrictamente cualquier URL de Supabase Storage
  if (trimmed.includes('supabase.co/storage') || trimmed.includes('.supabase.in/storage')) {
    console.error('[Anti-Egress Security] Rechazada URL perteneciente a Supabase Storage:', url);
    return false;
  }
  
  // Aceptar URLs seguras HTTPS o base64 data URLs de respaldo
  return trimmed.startsWith('https://') || trimmed.startsWith('http://localhost') || trimmed.startsWith('data:image/');
}

/**
 * Genera la URL de miniatura optimizada vía CDN sin computación en servidor Nolli.
 */
export function getPhotoThumbnailUrl(originalUrl: string | null | undefined, width: number = 400): string {
  if (!originalUrl) return '';
  if (!isSafePhotoUrl(originalUrl)) return '';
  if (originalUrl.startsWith('data:image/')) return originalUrl;
  return `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}&w=${width}&output=webp&q=80`;
}

/**
 * Sube una fotografía genérica de obra a Cloudflare R2 y retorna la URL pública del CDN
 */
export async function uploadGenericPhotoWithR2(
  file: File,
  buildingId: string | number | null = null,
  sessionToken: string | null | undefined,
  onProgress: ProgressCallback | null = null
): Promise<{ publicUrl: string; url: string; key: string }> {
  if (!file) throw new Error('Archivo de imagen requerido.');
  if (!sessionToken) throw new Error('Debes iniciar sesión para subir fotografías.');

  try {
    const ticket = await requestPhotoUploadUrl({
      filename: file.name,
      contentType: file.type || 'image/jpeg',
      buildingId: buildingId || 'new',
      uploadType: 'building',
    }, sessionToken);

    if (ticket.uploadUrl && ticket.publicUrl) {
      await uploadPhotoFileToR2(file, ticket.uploadUrl, onProgress);
      return { publicUrl: ticket.publicUrl, url: ticket.publicUrl, key: ticket.key };
    }
  } catch (err: unknown) {
    const msg = (err as Error)?.message || '';
    console.warn('Subida a Cloudflare R2 no completada para obra (' + msg + '). Activando compresión cliente WebP de respaldo:', err);
    onProgress?.(50, 1, 2);
    const dataUrl = await compressImageToDataUrl(file, 1200, 0.82);
    onProgress?.(100, 2, 2);
    return { publicUrl: dataUrl, url: dataUrl, key: `fallback-${Date.now()}` };
  }

  const dataUrl = await compressImageToDataUrl(file, 1200, 0.82);
  return { publicUrl: dataUrl, url: dataUrl, key: `fallback-${Date.now()}` };
}

/**
 * Comprime una imagen en el cliente a WebP ligero para avatares y miniaturas
 */
export async function compressImageToDataUrl(file: File, maxDim: number = 160, quality: number = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    let objectUrl = '';
    try {
      if (typeof URL !== 'undefined' && URL.createObjectURL) {
        objectUrl = URL.createObjectURL(file);
      }
    } catch {}

    const cleanup = () => {
      if (objectUrl) {
        try { URL.revokeObjectURL(objectUrl); } catch {}
      }
    };

    const img = new Image();
    img.onerror = () => {
      cleanup();
      reject(new Error('Error al decodificar la imagen seleccionada.'));
    };
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxDim) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          }
        } else {
          if (h > maxDim) {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          return reject(new Error('Contexto 2D no disponible.'));
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/webp', quality);
        cleanup();
        resolve(dataUrl);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    if (objectUrl) {
      img.src = objectUrl;
    } else {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Error al leer el archivo de imagen.'));
      reader.onload = () => {
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  });
}

/**
 * Sube un avatar de usuario a Cloudflare R2 y retorna la URL pública (con fallback WebP)
 */
export async function uploadAvatarFileWithR2(
  file: File,
  sessionToken: string | null | undefined,
  onProgress: ProgressCallback | null = null
): Promise<string> {
  if (!file) throw new Error('Archivo de imagen requerido.');
  if (!sessionToken) throw new Error('Debes iniciar sesión para actualizar tu foto de perfil.');

  try {
    const ticket = await requestPhotoUploadUrl({
      filename: file.name,
      contentType: file.type || 'image/jpeg',
      uploadType: 'avatar',
    }, sessionToken);

    if (ticket.uploadUrl && ticket.publicUrl) {
      await uploadPhotoFileToR2(file, ticket.uploadUrl, onProgress);
      return ticket.publicUrl;
    }
  } catch (err: unknown) {
    const msg = (err as Error)?.message || '';
    console.warn('Subida a Cloudflare R2 no completada para avatar (' + msg + '). Activando compresión cliente WebP de respaldo:', err);
    if (onProgress) onProgress(50, 1, 2);
    const dataUrl = await compressImageToDataUrl(file, 160, 0.82);
    if (onProgress) onProgress(100, 2, 2);
    return dataUrl;
  }

  return compressImageToDataUrl(file, 160, 0.82);
}

