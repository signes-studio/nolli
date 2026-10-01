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
      throw new Error(err.message || err.error || 'No se pudo preparar la subida de la imagen. Inténtalo de nuevo.');
    }

    return (await response.json()) as PhotoUploadTicket;
  } finally {
    clearTimeout(timer);
  }
}

export type ProgressCallback = (percent: number, loaded: number, total: number) => void;

/**
 * Sube el archivo binario directamente mediante la URL prefirmada PUT.
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
    const finalType = (file.type || 'image/jpeg').toLowerCase().trim();
    xhr.setRequestHeader('Content-Type', finalType);

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
        reject(new Error(`Error al transferir la imagen: HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Error de conexión al transferir la imagen. Comprueba tu conexión a internet.'));
    xhr.ontimeout = () => reject(new Error('Tiempo de espera agotado al transferir la imagen.'));

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
 * Optimiza un archivo de imagen en el cliente antes de transferirlo al almacenamiento.
 * Escala proporcionalmente a un máximo de 2048px (estándar de Instagram/Facebook/LinkedIn)
 * y comprime a WebP de alta fidelidad (~0.86), reduciendo archivos de 10-30MB a ~350-700KB
 * preservando máxima nitidez para pantallas Retina, 2K y 4K.
 */
export async function optimizeImageFileForUpload(
  file: File,
  maxDim: number = 2048,
  quality: number = 0.86
): Promise<{ file: Blob | File; contentType: string; filename: string }> {
  return new Promise((resolve) => {
    let objectUrl = '';
    try {
      if (typeof URL !== 'undefined' && URL.createObjectURL) {
        objectUrl = URL.createObjectURL(file);
      }
    } catch {}

    const fallbackReturn = () => {
      resolve({
        file,
        contentType: file.type || 'image/jpeg',
        filename: file.name,
      });
    };

    if (!objectUrl && typeof FileReader === 'undefined') {
      return fallbackReturn();
    }

    const img = new Image();
    img.onerror = () => {
      if (objectUrl) {
        try { URL.revokeObjectURL(objectUrl); } catch {}
      }
      fallbackReturn();
    };

    img.onload = () => {
      try {
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

        w = Math.max(1, w);
        h = Math.max(1, h);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (objectUrl) {
            try { URL.revokeObjectURL(objectUrl); } catch {}
          }
          return fallbackReturn();
        }

        ctx.drawImage(img, 0, 0, w, h);
        if (objectUrl) {
          try { URL.revokeObjectURL(objectUrl); } catch {}
        }

        if (typeof canvas.toBlob === 'function') {
          canvas.toBlob(
            (blob) => {
              if (blob && blob.size > 0) {
                const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
                const newName = `${baseName}.webp`;
                resolve({
                  file: blob,
                  contentType: 'image/webp',
                  filename: newName,
                });
              } else {
                fallbackReturn();
              }
            },
            'image/webp',
            quality
          );
        } else {
          fallbackReturn();
        }
      } catch (err) {
        if (objectUrl) {
          try { URL.revokeObjectURL(objectUrl); } catch {}
        }
        fallbackReturn();
      }
    };

    if (objectUrl) {
      img.src = objectUrl;
    } else {
      const reader = new FileReader();
      reader.onerror = () => fallbackReturn();
      reader.onload = () => {
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  });
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

  // 1. Optimización previa de imagen en el cliente (estándar 2048px)
  const optimized = await optimizeImageFileForUpload(file, 2048, 0.86);
  const uploadPayload = optimized.file;
  const uploadContentType = optimized.contentType;
  const uploadFilename = optimized.filename;

  // 2. Obtener ticket con URL prefirmada
  const ticket = await requestPhotoUploadUrl({
    filename: uploadFilename,
    contentType: uploadContentType,
    buildingId,
    visitId,
    photoType,
  }, sessionToken);

  if (!ticket.uploadUrl || !ticket.publicUrl) {
    throw new Error('No se pudo obtener la autorización de subida para Cloudflare R2.');
  }

  // 3. Subida directa navegador -> Cloudflare R2 (Cero Egress hacia Supabase / Vercel)
  await uploadPhotoFileToR2(uploadPayload, ticket.uploadUrl, onProgress);
  photoUrl = ticket.publicUrl;
  thumbnailUrl = getPhotoThumbnailUrl(ticket.publicUrl, 640);
  r2Key = ticket.key;

  // 4. Registro en PostgreSQL (tabla visit_photos)
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
      storage_type: 'cloudflare_r2',
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
  
  // Prohibir strings en base64 para evitar fugas de memoria y consumo de red
  if (trimmed.startsWith('data:')) {
    return false;
  }

  // Aceptar URLs seguras HTTPS
  return trimmed.startsWith('https://') || trimmed.startsWith('http://localhost');
}

/**
 * Genera la URL de miniatura optimizada vía CDN sin computación en servidor Nolli.
 */
export function getPhotoThumbnailUrl(originalUrl: string | null | undefined, width: number = 640): string {
  if (!originalUrl) return '';
  if (!isSafePhotoUrl(originalUrl)) return '';
  return `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}&w=${width}&output=webp&q=82`;
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

  // 1. Optimización previa de imagen en el cliente (estándar 2048px, similar a Instagram/LinkedIn)
  const optimized = await optimizeImageFileForUpload(file, 2048, 0.86);
  const uploadPayload = optimized.file;
  const uploadContentType = optimized.contentType;
  const uploadFilename = optimized.filename;

  // 2. Obtener ticket con URL prefirmada directa a Cloudflare R2
  const ticket = await requestPhotoUploadUrl({
    filename: uploadFilename,
    contentType: uploadContentType,
    buildingId: buildingId || 'new',
    uploadType: 'building',
  }, sessionToken);

  if (!ticket.uploadUrl || !ticket.publicUrl) {
    throw new Error('No se pudo obtener la autorización de subida para Cloudflare R2.');
  }

  // 3. Subida directa navegador -> Cloudflare R2 (Cero Egress hacia Supabase o Vercel)
  await uploadPhotoFileToR2(uploadPayload, ticket.uploadUrl, onProgress);
  return { publicUrl: ticket.publicUrl, url: ticket.publicUrl, key: ticket.key };
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

  // 1. Obtener ticket de subida a R2
  const ticket = await requestPhotoUploadUrl({
    filename: file.name,
    contentType: file.type || 'image/jpeg',
    uploadType: 'avatar',
  }, sessionToken);

  if (!ticket.uploadUrl || !ticket.publicUrl) {
    throw new Error('No se pudo obtener la autorización de subida para el avatar en Cloudflare R2.');
  }

  // 2. Subida directa navegador -> Cloudflare R2
  await uploadPhotoFileToR2(file, ticket.uploadUrl, onProgress);
  return ticket.publicUrl;
}

