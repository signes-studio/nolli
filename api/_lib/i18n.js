/* =========================================================================
   API/_LIB/I18N.JS — Utilidades i18n para Renderizado SSR en Funciones Serverless
   ========================================================================= */

const SUPPORTED_LANGS = ['es', 'en', 'ca'];
const DEFAULT_LANG = 'es';

/**
 * Detecta el idioma a partir de la petición Serverless.
 */
function detectServerLanguage(request) {
  const queryLang = String(request.query?.lang || '').toLowerCase().trim();
  if (SUPPORTED_LANGS.includes(queryLang)) return queryLang;

  const url = String(request.url || '');
  if (url.startsWith('/en/') || url.includes('/en/')) return 'en';
  if (url.startsWith('/ca/') || url.includes('/ca/')) return 'ca';

  const matched = String(request.headers?.['x-matched-path'] || request.headers?.['x-vercel-matched-path'] || '');
  if (matched.startsWith('/en/') || matched.includes('/en/')) return 'en';
  if (matched.startsWith('/ca/') || matched.includes('/ca/')) return 'ca';

  return DEFAULT_LANG;
}

/**
 * Retorna el prefijo de URL según el idioma ('', '/en', '/ca').
 */
function getLangPrefix(lang) {
  if (lang === 'en') return '/en';
  if (lang === 'ca') return '/ca';
  return '';
}

/**
 * Diccionario de textos SSR para interfaz y etiquetas Open Graph
 */
const SSR_TEXTS = {
  es: {
    tagline: '/ radar arquitectónico',
    default_work_desc: 'Ficha de obra en nolli, radar arquitectónico.',
    label_architecture: 'Arquitectura',
    label_year: 'Año',
    label_category: 'Categoría',
    label_place: 'Lugar',
    view_on_map: 'Ver en el mapa',
    cataloged_works: 'obras catalogadas',
    page_of: 'Página {page} de {totalPages}',
    prev_page: '← Página anterior',
    next_page: 'Cargar más obras →',
    empty_category: 'No se han encontrado obras en esta categoría.',
    empty_architect: 'No se han encontrado obras para este arquitecto.',
    not_found_page_title: 'Obra no encontrada | nolli.',
    not_found_tag: 'ERROR 404 // REGISTRO NO DISPONIBLE',
    not_found_title: 'OBRA NO ENCONTRADA',
    not_found_text: 'La obra arquitectónica solicitada no existe, ha sido eliminada o el enlace no es válido. Puedes explorar miles de obras en el mapa interactivo.',
    go_to_map: 'IR AL MAPA PRINCIPAL',
    category_title: 'Arquitectura {categoria} | Obras y Catálogo | nolli.',
    category_desc: 'Explora {count} obras de arquitectura en la categoría {categoria}. Radar arquitectónico y mapa interactivo en nolli.',
    category_page_name: 'Obras de arquitectura en la categoría {categoria} | nolli.',
    architect_title: 'Obras de {nombre} | Catálogo de Arquitectura | nolli.',
    architect_desc: 'Explora {count} obras y proyectos de {nombre}. Radar arquitectónico y mapa interactivo en nolli.',
    architect_page_name: 'Obras y proyectos de {nombre} | nolli.',
  },
  en: {
    tagline: '/ architectural radar',
    default_work_desc: 'Architectural work record on nolli, architectural radar.',
    label_architecture: 'Architecture',
    label_year: 'Year',
    label_category: 'Category',
    label_place: 'Place',
    view_on_map: 'View on map',
    cataloged_works: 'cataloged works',
    page_of: 'Page {page} of {totalPages}',
    prev_page: '← Previous page',
    next_page: 'Load more works →',
    empty_category: 'No works found in this category.',
    empty_architect: 'No works found for this architect.',
    not_found_page_title: 'Building not found | nolli.',
    not_found_tag: 'ERROR 404 // RECORD NOT AVAILABLE',
    not_found_title: 'BUILDING NOT FOUND',
    not_found_text: 'The requested architectural work does not exist, has been removed, or the link is invalid. You can explore thousands of works on the interactive map.',
    go_to_map: 'GO TO MAIN MAP',
    category_title: '{categoria} Architecture | Works & Catalog | nolli.',
    category_desc: 'Explore {count} architectural works in the {categoria} category. Architectural radar and interactive map on nolli.',
    category_page_name: 'Architectural works in the {categoria} category | nolli.',
    architect_title: 'Works by {nombre} | Architecture Catalog | nolli.',
    architect_desc: 'Explore {count} works and projects by {nombre}. Architectural radar and interactive map on nolli.',
    architect_page_name: 'Works and projects by {nombre} | nolli.',
  },
  ca: {
    tagline: '/ radar arquitectònic',
    default_work_desc: "Fitxa d'obra a nolli, radar arquitectònic.",
    label_architecture: 'Arquitectura',
    label_year: 'Any',
    label_category: 'Categoria',
    label_place: 'Lloc',
    view_on_map: 'Veure al mapa',
    cataloged_works: 'obres catalogades',
    page_of: 'Pàgina {page} de {totalPages}',
    prev_page: '← Pàgina anterior',
    next_page: 'Carregar més obres →',
    empty_category: "No s'han trobat obres en aquesta categoria.",
    empty_architect: "No s'han trobat obres per a aquest arquitecte.",
    not_found_page_title: 'Obra no trobada | nolli.',
    not_found_tag: 'ERROR 404 // REGISTRE NO DISPONIBLE',
    not_found_title: 'OBRA NO TROBADA',
    not_found_text: "L'obra arquitectònica sol·licitada no existeix, ha estat eliminada o l'enllaç no és vàlid. Pots explorar milers d'obres al mapa interactiu.",
    go_to_map: 'ANAR AL MAPA PRINCIPAL',
    category_title: 'Arquitectura {categoria} | Obres i Catàleg | nolli.',
    category_desc: "Explora {count} obres d'arquitectura en la categoria {categoria}. Radar arquitectònic i mapa interactiu a nolli.",
    category_page_name: "Obres d'arquitectura en la categoria {categoria} | nolli.",
    architect_title: 'Obres de {nombre} | Catàleg d\'Arquitectura | nolli.',
    architect_desc: 'Explora {count} obres i projectes de {nombre}. Radar arquitectònic i mapa interactiu a nolli.',
    architect_page_name: 'Obres i projectes de {nombre} | nolli.',
  },
};

function getSSRText(key, lang = 'es', vars = {}) {
  const dict = SSR_TEXTS[lang] || SSR_TEXTS.es;
  let text = dict[key] || SSR_TEXTS.es[key] || key;
  if (vars && typeof vars === 'object') {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(new RegExp('\\{' + k + '\\}', 'g'), String(v));
    });
  }
  return text;
}

/**
 * Genera las etiquetas <link rel="alternate" hreflang="...">
 */
function getHreflangTags(cleanPath, siteUrl = 'https://nollimap.app') {
  const path = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath;
  return [
    `<link rel="alternate" hreflang="es" href="${siteUrl}${path}">`,
    `<link rel="alternate" hreflang="en" href="${siteUrl}/en${path}">`,
    `<link rel="alternate" hreflang="ca" href="${siteUrl}/ca${path}">`,
    `<link rel="alternate" hreflang="x-default" href="${siteUrl}${path}">`,
  ].join('\n  ');
}

module.exports = {
  SUPPORTED_LANGS,
  DEFAULT_LANG,
  detectServerLanguage,
  getLangPrefix,
  getSSRText,
  getHreflangTags,
};
