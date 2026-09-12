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
  isUploadFlowActive: false, // Desactivado intencionadamente hasta aprovisionar credenciales R2
};

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
