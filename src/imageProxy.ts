/**
 * IMAGEPROXY.TS
 * Optimización y reescalado de imágenes vía CDN con formato WebP.
 * Optimización y reescalado de imágenes vía CDN con formato WebP y presets contextuales.
 */

export type ImagePreset = 'thumb' | 'card' | 'sheet' | 'fullscreen';

export interface OptimizedPhotoOptions {
  width?: number;
  quality?: number;
}

export const IMAGE_PRESETS: Record<ImagePreset, Required<OptimizedPhotoOptions>> = {
  thumb: { width: 240, quality: 75 },
  card: { width: 640, quality: 82 },
  sheet: { width: 1400, quality: 86 },
  fullscreen: { width: 2048, quality: 88 },
};

/**
 * Retorna la URL optimizada vía proxy wsrv.nl en formato WebP con dimensiones contextuales.
 * 
 * @param fotoUrl - URL original de la fotografía
 * @param optionsOrPreset - Preset semántico ('thumb' | 'card' | 'sheet' | 'fullscreen') u opciones personalizadas
 */
export function getOptimizedPhotoUrl(
  fotoUrl: string | null | undefined,
  optionsOrPreset?: ImagePreset | OptimizedPhotoOptions
): string | null | undefined {
  if (!fotoUrl) return fotoUrl;

  let width = 800;
  let quality = 75;

  if (typeof optionsOrPreset === 'string' && optionsOrPreset in IMAGE_PRESETS) {
    const preset = IMAGE_PRESETS[optionsOrPreset];
    width = preset.width;
    quality = preset.quality;
  } else if (typeof optionsOrPreset === 'object' && optionsOrPreset !== null) {
    width = optionsOrPreset.width ?? 800;
    quality = optionsOrPreset.quality ?? 75;
  }

  try {
    const url = new URL(fotoUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return fotoUrl;
    return `https://wsrv.nl/?url=${encodeURIComponent(url.href)}&w=${width}&q=${quality}&output=webp`;
  } catch {
    return fotoUrl;
  }
}

