/**
 * IMAGEPROXY.TS
 * Optimización y reescalado de imágenes vía CDN con formato WebP.
 */

export interface OptimizedPhotoOptions {
  width?: number;
  quality?: number;
}

export function getOptimizedPhotoUrl(
  fotoUrl: string | null | undefined,
  { width = 800, quality = 75 }: OptimizedPhotoOptions = {}
): string | null | undefined {
  if (!fotoUrl) return fotoUrl;

  try {
    const url = new URL(fotoUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return fotoUrl;
    return `https://wsrv.nl/?url=${encodeURIComponent(url.href)}&w=${width}&q=${quality}&output=webp`;
  } catch {
    return fotoUrl;
  }
}

