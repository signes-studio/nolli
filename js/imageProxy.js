export function getOptimizedPhotoUrl(fotoUrl, { width = 800, quality = 75 } = {}) {
  if (!fotoUrl) return fotoUrl;

  try {
    const url = new URL(fotoUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return fotoUrl;
    return `https://wsrv.nl/?url=${encodeURIComponent(url.href)}&w=${width}&q=${quality}&output=webp`;
  } catch {
    return fotoUrl;
  }
}