/* =========================================================================
   API/_LIB/SLUGS.JS — Utilidades de Slugs, Expresiones Regulares e i18n
   ========================================================================= */

/**
 * Convierte un texto en un slug URL limpio y normalizado.
 * Elimina diacríticos (tildes, diéresis), caracteres especiales y puntuación.
 * Ej: "Álvaro Siza" -> "alvaro-siza", "Berlín, Alemania" -> "berlin"
 */
function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Convierte un slug o texto en un patrón regex para PostgREST 'imatch'
 * que reconoce indistintamente vocales con o sin acento / tilde.
 * Ej: "alvaro-siza" -> ".*[aáàäâã]lv[aáàäâã]r[oóòöôõ].*s[iíìïî]z[aáàäâã].*"
 */
function slugToRegex(slug) {
  const map = {
    a: '[aáàäâã]',
    e: '[eéèëê]',
    i: '[iíìïî]',
    o: '[oóòöôõ]',
    u: '[uúùüû]',
    c: '[cç]',
    n: '[nñ]',
  };
  const clean = slugify(slug);
  const parts = clean.split('-').filter(Boolean);
  if (parts.length === 0) return '.*';
  return '.*' + parts.map((p) => (
    p.split('').map((ch) => map[ch] || ch).join('')
  )).join('.*') + '.*';
}

/**
 * Extrae el nombre principal de la ciudad a partir del campo place de Buildings.
 * Ej: "Nueva York, Estados Unidos de América" -> "Nueva York"
 * Ej: "Berlín, Alemania" -> "Berlín"
 * Ej: "Valencia" -> "Valencia"
 */
function extractCityName(place) {
  if (!place) return '';
  const first = String(place).split(',')[0].trim();
  return first || String(place).trim();
}

/**
 * Extrae el país a partir del campo place.
 * Ej: "Nueva York, Estados Unidos de América" -> "Estados Unidos de América"
 */
function extractCountry(place) {
  if (!place) return '';
  const parts = String(place).split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(', ') : '';
}

/**
 * Determina si una cadena de arquitecto debe ignorarse para índices o sitemaps.
 */
function isIgnoredArchitect(name) {
  if (!name) return true;
  const lower = String(name).toLowerCase().trim();
  const ignored = [
    'desconocido',
    'autor desconocido',
    'autores varios',
    'anónimo',
    'anonimo',
    'varios',
    'desconegut',
    'unknown',
    's/d',
    'sin datos',
    'sin arquitecto',
    'no consta',
    'no disponible',
    'n/a',
    'nd',
  ];
  return ignored.includes(lower) || lower.length < 2;
}

/**
 * Mapeo de alias y variaciones de nombres de arquitectos hacia su slug canónico en Nolli.
 * Permite redirigir (301) búsquedas con segundos apellidos o nombres coloquiales
 * hacia la ficha oficial que contiene las obras catalogadas.
 */
const ARCHITECT_ALIASES = {
  // Javier Goerlich Lleó -> Francisco Javier Goerlich
  'javier-goerlich-lleo': 'francisco-javier-goerlich',
  'javier-goerlich': 'francisco-javier-goerlich',
  'goerlich': 'francisco-javier-goerlich',
  'francisco-javier-goerlich-lleo': 'francisco-javier-goerlich',

  // Ludwig Mies van der Rohe
  'mies-van-der-rohe': 'ludwig-mies-van-der-rohe',
  'mies': 'ludwig-mies-van-der-rohe',

  // Álvaro Siza
  'alvaro-siza-vieira': 'alvaro-siza',
  'siza': 'alvaro-siza',
  'siza-vieira': 'alvaro-siza',

  // Le Corbusier
  'charles-edouard-jeanneret': 'le-corbusier',
  'jeanneret': 'le-corbusier',

  // Frank Gehry
  'gehry': 'frank-gehry',

  // Norman Foster / Foster + Partners
  'norman-foster': 'foster-partners',
  'foster': 'foster-partners',

  // Zaha Hadid
  'zaha-hadid': 'zha-zaha-hadid-architects',
  'zaha': 'zha-zaha-hadid-architects',

  // Rem Koolhaas / OMA
  'rem-koolhaas': 'oma-office-for-metropolitan-architecture',
  'koolhaas': 'oma-office-for-metropolitan-architecture',

  // Bjarke Ingels / BIG
  'bjarke-ingels': 'big-bjarke-ingels-group',

  // David Chipperfield
  'david-chipperfield': 'david-chipperfield-architects',
  'chipperfield': 'david-chipperfield-architects',

  // Renzo Piano
  'renzo-piano': 'renzo-piano-building-workshop',

  // Miguel Fisac Serna
  'miguel-fisac': 'miguel-fisac-serna',
  'fisac': 'miguel-fisac-serna',

  // Alejandro de la Sota Martínez
  'alejandro-de-la-sota': 'alejandro-de-la-sota-martinez',

  // Antonio Bonet Castellana
  'antonio-bonet': 'antonio-bonet-castellana',

  // José Antonio Corrales Gutiérrez
  'jose-antonio-corrales': 'jose-antonio-corrales-gutierrez',

  // Vicente Traver Tomás
  'vicente-traver': 'vicente-traver-tomas',

  // Francisco Maristany Casajuana
  'francisco-maristany': 'francisco-maristany-casajuana',
};

/**
 * Escapa caracteres HTML para inyección segura en SSR.
 */
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Genera URL optimizada WebP mediante wsrv.nl para imágenes en CDN.
 */
function getOptimizedUrl(fotoUrl, width = 600) {
  if (!fotoUrl) return '';
  try {
    const url = new URL(fotoUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return fotoUrl;
    return `https://wsrv.nl/?url=${encodeURIComponent(url.href)}&w=${width}&q=75&output=webp`;
  } catch {
    return fotoUrl;
  }
}

module.exports = {
  slugify,
  slugToRegex,
  extractCityName,
  extractCountry,
  isIgnoredArchitect,
  ARCHITECT_ALIASES,
  escapeHtml,
  getOptimizedUrl,
};

