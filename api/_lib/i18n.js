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
    prev_page: '← Anterior',
    next_page: 'Siguiente →',
    empty_category: 'No se han encontrado obras en esta categoría.',
    empty_architect: 'No se han encontrado obras para este arquitecto.',
    empty_city: 'No se han encontrado obras registradas en esta ciudad.',
    not_found_page_title: 'Obra no encontrada | nolli.',
    not_found_tag: 'ERROR 404 // REGISTRO NO DISPONIBLE',
    not_found_title: 'OBRA NO ENCONTRADA',
    not_found_text: 'La obra arquitectónica solicitada no existe, ha sido eliminada o el enlace no es válido. Puedes explorar miles de obras en el mapa interactivo.',
    go_to_map: 'IR AL MAPA PRINCIPAL',
    category_title: 'Arquitectura {categoria} | Obras y Catálogo | nolli.',
    category_desc: 'Explora {count} obras de arquitectura en la categoría {categoria}. Radar arquitectónico y mapa interactivo en nolli.',
    category_page_name: 'Obras de arquitectura en la categoría {categoria} | nolli.',
    architect_title: 'Obras de {nombre} en Nolli | Catálogo de Arquitectura',
    architect_desc: 'Descubre las obras y proyectos de {nombre} ({count} edificios catalogados) en Nolli. Explora su arquitectura y mapa interactivo.',
    architect_page_name: 'Obras y proyectos de {nombre} | nolli.',
    city_title: 'Arquitectura en {city} | Obras y Guía | nolli.',
    city_desc: 'Guía de arquitectura en {city}: explora {count} obras y proyectos singulares catalogados en nolli. Mapa interactivo y radar arquitectónico.',
    city_page_name: 'Obras y proyectos de arquitectura en {city} | nolli.',
    breadcrumb_architects: 'Arquitectos',
    breadcrumb_cities: 'Ciudades',
    breadcrumb_categories: 'Categorías',
    cross_cities_by_architect: 'Ciudades con obras de {nombre}',
    cross_categories_by_architect: 'Tipologías y categorías de {nombre}',
    cross_architects_in_city: 'Arquitectos con obra en {city}',
    cross_categories_in_city: 'Tipologías arquitectónicas en {city}',
    cross_architects_in_category: 'Arquitectos destacados en {categoria}',
    cross_cities_in_category: 'Ciudades con más arquitectura {categoria}',
    other_categories: 'Otras categorías arquitectónicas',
    explore_on_map: 'EXPLORAR EN EL MAPA INTERACTIVO',
    view_city_map: 'VER {city} EN EL MAPA',
    all_works: 'Ver todas las obras',
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
    prev_page: '← Previous',
    next_page: 'Next →',
    empty_category: 'No works found in this category.',
    empty_architect: 'No works found for this architect.',
    empty_city: 'No cataloged works found in this city.',
    not_found_page_title: 'Building not found | nolli.',
    not_found_tag: 'ERROR 404 // RECORD NOT AVAILABLE',
    not_found_title: 'BUILDING NOT FOUND',
    not_found_text: 'The requested architectural work does not exist, has been removed, or the link is invalid. You can explore thousands of works on the interactive map.',
    go_to_map: 'GO TO MAIN MAP',
    category_title: '{categoria} Architecture | Works & Catalog | nolli.',
    category_desc: 'Explore {count} architectural works in the {categoria} category. Architectural radar and interactive map on nolli.',
    category_page_name: 'Architectural works in the {categoria} category | nolli.',
    architect_title: 'Works by {nombre} on Nolli | Architecture Catalog',
    architect_desc: 'Discover works and projects by {nombre} ({count} cataloged buildings) on Nolli. Explore architecture and interactive map.',
    architect_page_name: 'Works and projects by {nombre} | nolli.',
    city_title: 'Architecture in {city} | Works & Guide | nolli.',
    city_desc: 'Architecture guide to {city}: explore {count} unique cataloged works and projects on nolli. Interactive map and architectural radar.',
    city_page_name: 'Architectural works and projects in {city} | nolli.',
    breadcrumb_architects: 'Architects',
    breadcrumb_cities: 'Cities',
    breadcrumb_categories: 'Categories',
    cross_cities_by_architect: 'Cities with works by {nombre}',
    cross_categories_by_architect: 'Typologies and categories by {nombre}',
    cross_architects_in_city: 'Architects with works in {city}',
    cross_categories_in_city: 'Architectural typologies in {city}',
    cross_architects_in_category: 'Featured architects in {categoria}',
    cross_cities_in_category: 'Cities with notable {categoria} architecture',
    other_categories: 'Other architectural categories',
    explore_on_map: 'EXPLORE ON INTERACTIVE MAP',
    view_city_map: 'VIEW {city} ON MAP',
    all_works: 'View all works',
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
    prev_page: '← Anterior',
    next_page: 'Següent →',
    empty_category: "No s'han trobat obres en aquesta categoria.",
    empty_architect: "No s'han trobat obres per a aquest arquitecte.",
    empty_city: "No s'han trobat obres registrades en aquesta ciutat.",
    not_found_page_title: 'Obra no trobada | nolli.',
    not_found_tag: 'ERROR 404 // REGISTRE NO DISPONIBLE',
    not_found_title: 'OBRA NO TROBADA',
    not_found_text: "L'obra arquitectònica sol·licitada no existeix, ha estat eliminada o l'enllaç no és vàlid. Pots explorar milers d'obres al mapa interactiu.",
    go_to_map: 'ANAR AL MAPA PRINCIPAL',
    category_title: 'Arquitectura {categoria} | Obres i Catàleg | nolli.',
    category_desc: "Explora {count} obres d'arquitectura en la categoria {categoria}. Radar arquitectònic i mapa interactiu a nolli.",
    category_page_name: "Obres d'arquitectura en la categoria {categoria} | nolli.",
    architect_title: 'Obres de {nombre} a Nolli | Catàleg d\'Arquitectura',
    architect_desc: 'Descobreix les obres i projectes de {nombre} ({count} edificis catalogats) a Nolli. Explora arquitectura i mapa interactiu.',
    architect_page_name: 'Obres i projectes de {nombre} | nolli.',
    city_title: 'Arquitectura a {city} | Obres i Guia | nolli.',
    city_desc: "Guia d'arquitectura a {city}: explora {count} obres i projectes singulars catalogats a nolli. Mapa interactiu i radar arquitectònic.",
    city_page_name: "Obres i projectes d'arquitectura a {city} | nolli.",
    breadcrumb_architects: 'Arquitectes',
    breadcrumb_cities: 'Ciutats',
    breadcrumb_categories: 'Categories',
    cross_cities_by_architect: 'Ciutats amb obres de {nombre}',
    cross_categories_by_architect: 'Tipologies i categories de {nombre}',
    cross_architects_in_city: 'Arquitectes amb obra a {city}',
    cross_categories_in_city: 'Tipologies arquitectòniques a {city}',
    cross_architects_in_category: 'Arquitectes destacats en {categoria}',
    cross_cities_in_category: 'Ciutats amb més arquitectura {categoria}',
    other_categories: 'Altres categories arquitectòniques',
    explore_on_map: 'EXPLORAR AL MAPA INTERACTIU',
    view_city_map: 'VEURE {city} AL MAPA',
    all_works: 'Veure totes les obres',
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
 * Al indexar exclusivamente la versión en español, no se emiten hreflang hacia páginas con noindex (en/ca).
 */
function getHreflangTags() {
  return '';
}

/**
 * Genera las etiquetas Open Graph og:locale y og:locale:alternate
 */
function getOgLocaleTags(lang = 'es') {
  const LOCALES = {
    es: { primary: 'es_ES', alternates: [] },
    en: { primary: 'en_US', alternates: ['es_ES'] },
    ca: { primary: 'ca_ES', alternates: ['es_ES'] },
  };
  const config = LOCALES[lang] || LOCALES.es;
  const tags = [
    `<meta property="og:locale" content="${config.primary}">`,
    ...config.alternates.map((alt) => `<meta property="og:locale:alternate" content="${alt}">`),
  ];
  return tags.join('\n  ');
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Genera bloques <url> para sitemaps exclusivamente en español según el estándar oficial.
 */
function getMultilingualSitemapEntries(cleanPath, lastmod, changefreq, priority, siteUrl = 'https://nollimap.app') {
  const rawPath = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath;
  const path = rawPath === '/' ? '' : rawPath;
  const esUrl = `${siteUrl}${path || '/'}`;

  return [
    '  <url>',
    `    <loc>${escapeXml(esUrl)}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].join('\n');
}

module.exports = {
  SUPPORTED_LANGS,
  DEFAULT_LANG,
  detectServerLanguage,
  getLangPrefix,
  getSSRText,
  getHreflangTags,
  getOgLocaleTags,
  escapeXml,
  getMultilingualSitemapEntries,
};
