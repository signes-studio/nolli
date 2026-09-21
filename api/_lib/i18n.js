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
    tagline: '/ guía colectiva de arquitectura',
    default_work_desc: 'Ficha de obra en nolli., guía colectiva de arquitectura.',
    label_architecture: 'Arquitectura',
    label_intervention: 'Intervención',
    label_interventions: 'Intervenciones',
    label_year: 'Año',
    label_category: 'Categoría',
    label_importance: 'Importancia',
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
    not_found_title: 'NO ENCONTRADO',
    not_found_text: 'La obra arquitectónica solicitada no existe, ha sido eliminada o el enlace no es válido. Puedes explorar miles de obras en el mapa interactivo.',
    not_found_architect_title: 'Arquitecto no encontrado | nolli.',
    not_found_architect_text: 'No se han encontrado obras catalogadas para este arquitecto en nolli. Puedes explorar miles de obras en el mapa interactivo.',
    not_found_city_title: 'Ciudad no encontrada | nolli.',
    not_found_city_text: 'No se han encontrado obras registradas en esta ubicación en nolli. Puedes explorar el mapa interactivo.',
    not_found_category_title: 'Categoría no encontrada | nolli.',
    not_found_category_text: 'La categoría solicitada no existe o no tiene obras catalogadas en nolli.',
    go_to_map: 'IR AL MAPA PRINCIPAL',
    category_title: 'Arquitectura {categoria} | guía colectiva de arquitectura | nolli.',
    category_desc: 'Explora {count} obras de arquitectura en la categoría {categoria}. guía colectiva de arquitectura y mapa interactivo en nolli.',
    category_page_name: 'Obras de arquitectura en la categoría {categoria} | nolli.',
    architect_title: 'Obras de {nombre} | guía colectiva de arquitectura | nolli.',
    architect_desc: 'Descubre las obras y proyectos de {nombre} ({count} edificios catalogados) en nolli. Explora su arquitectura en el mapa interactivo.',
    architect_page_name: 'Obras y proyectos de {nombre} | nolli.',
    city_title: 'Arquitectura en {city} | Obras y Guía | nolli.',
    city_desc: 'Guía de arquitectura en {city}: descubre {count} obras y proyectos únicos catalogados en nolli. Mapa interactivo y guía colectiva de arquitectura.',
    city_page_name: 'Obras y proyectos de arquitectura en {city} | nolli.',
    project_by_signes_lead: 'es un proyecto de',
    breadcrumb_architects: 'Arquitectos',
    breadcrumb_cities: 'Ciudades',
    breadcrumb_categories: 'Categorías',
    cross_cities_by_architect: 'Ciudades con obras de {nombre}',
    cross_categories_by_architect: 'Tipologías y categorías de {nombre}',
    cross_architects_in_city: 'Arquitectos con obra en {city}',
    cross_categories_in_city: 'Tipologías arquitectónicas en {city}',
    cross_architects_in_category: 'Arquitectos destacados en {categoria}',
    cross_cities_in_category: 'Ciudades con arquitectura {categoria} destacada',
    other_categories: 'Otras categorías arquitectónicas',
    explore_on_map: 'EXPLORAR EN EL MAPA INTERACTIVO',
    view_city_map: 'VER {city} EN EL MAPA',
    all_works: 'Ver todas las obras',
    search_works_placeholder: 'Buscar por obra, ciudad o año...',
    search_works_placeholder_city: 'Buscar por obra, arquitecto o año...',
    search_works_placeholder_cat: 'Buscar por obra, arquitecto, ciudad o año...',
    view_grid: 'Cuadrícula',
    view_list: 'Listado',
    sort_by: 'Ordenar por',
    sort_year_desc: 'Año (reciente a antiguo)',
    sort_year_asc: 'Año (antiguo a reciente)',
    sort_name_asc: 'Nombre (A – Z)',
    sort_name_desc: 'Nombre (Z – A)',
    sort_category_asc: 'Categoría (A – Z)',
    sort_category_desc: 'Categoría (Z – A)',
    sort_architect_asc: 'Arquitecto (A – Z)',
    sort_architect_desc: 'Arquitecto (Z – A)',
    sort_city_asc: 'Ciudad (A – Z)',
    sort_city_desc: 'Ciudad (Z – A)',
    sort_importance_desc: 'Importancia (mayor a menor)',
    sort_importance_asc: 'Importancia (menor a mayor)',
    filter_all_categories: 'Todas las categorías',
    filter_all_cities: 'Todas las ciudades',
    filter_all_architects: 'Todos los arquitectos',
    filter_all_importance: 'Todas las importancias',
    importance_0: 'Obra Maestra',
    importance_1: 'Imprescindible',
    importance_2: 'Recomendada',
    importance_3: 'Documentada',
    showing_works_count: 'Mostrando {count} de {total} obras',
    clear_filters: 'Limpiar filtros',
    no_results_filtered: 'No se encontraron obras con los filtros aplicados.',
  },
  en: {
    tagline: '/ collective architecture guide',
    default_work_desc: 'Architectural work record on nolli., collective architecture guide.',
    label_architecture: 'Architecture',
    label_intervention: 'Intervention',
    label_interventions: 'Interventions',
    label_year: 'Year',
    label_category: 'Category',
    label_importance: 'Importance',
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
    not_found_title: 'NOT FOUND',
    not_found_text: 'The requested architectural work does not exist, has been removed, or the link is invalid. You can explore thousands of works on the interactive map.',
    not_found_architect_title: 'Architect not found | nolli.',
    not_found_architect_text: 'No cataloged works were found for this architect on nolli. You can explore thousands of works on the interactive map.',
    not_found_city_title: 'City not found | nolli.',
    not_found_city_text: 'No cataloged works were found in this location on nolli. You can explore the interactive map.',
    not_found_category_title: 'Category not found | nolli.',
    not_found_category_text: 'The requested category does not exist or contains no cataloged works on nolli.',
    go_to_map: 'GO TO MAIN MAP',
    category_title: '{categoria} Architecture | collective architecture guide | nolli.',
    category_desc: 'Explore {count} architectural works in the {categoria} category. collective architecture guide and interactive map on nolli.',
    category_page_name: 'Architectural works in the {categoria} category | nolli.',
    architect_title: 'Works by {nombre} | collective architecture guide | nolli.',
    architect_desc: 'Discover works and projects by {nombre} ({count} cataloged buildings) on nolli. Explore architecture and interactive map.',
    architect_page_name: 'Works and projects by {nombre} | nolli.',
    city_title: 'Architecture in {city} | Works & Guide | nolli.',
    city_desc: 'Architecture guide to {city}: explore {count} unique cataloged works and projects on nolli. Interactive map and collective architecture guide.',
    city_page_name: 'Architectural works and projects in {city} | nolli.',
    project_by_signes_lead: 'is a project by',
    breadcrumb_architects: 'Architects',
    breadcrumb_cities: 'Cities',
    breadcrumb_categories: 'Categories',
    cross_cities_by_architect: 'Cities with works by {nombre}',
    cross_categories_by_architect: 'Tipologies and categories by {nombre}',
    cross_architects_in_city: 'Architects with works in {city}',
    cross_categories_in_city: 'Architectural typologies in {city}',
    cross_architects_in_category: 'Featured architects in {categoria}',
    cross_cities_in_category: 'Cities with notable {categoria} architecture',
    other_categories: 'Other architectural categories',
    explore_on_map: 'EXPLORE ON INTERACTIVE MAP',
    view_city_map: 'VIEW {city} ON MAP',
    all_works: 'View all works',
    search_works_placeholder: 'Search by work, city or year...',
    search_works_placeholder_city: 'Search by work, architect or year...',
    search_works_placeholder_cat: 'Search by work, architect, city or year...',
    view_grid: 'Grid',
    view_list: 'List',
    sort_by: 'Sort by',
    sort_year_desc: 'Year (newest first)',
    sort_year_asc: 'Year (oldest first)',
    sort_name_asc: 'Name (A – Z)',
    sort_name_desc: 'Name (Z – A)',
    sort_category_asc: 'Category (A – Z)',
    sort_category_desc: 'Category (Z – A)',
    sort_architect_asc: 'Architect (A – Z)',
    sort_architect_desc: 'Architect (Z – A)',
    sort_city_asc: 'City (A – Z)',
    sort_city_desc: 'City (Z – A)',
    sort_importance_desc: 'Importance (highest first)',
    sort_importance_asc: 'Importance (lowest first)',
    filter_all_categories: 'All categories',
    filter_all_cities: 'All cities',
    filter_all_architects: 'All architects',
    filter_all_importance: 'All importance levels',
    importance_0: 'Masterpiece',
    importance_1: 'Essential',
    importance_2: 'Recommended',
    importance_3: 'Documented',
    showing_works_count: 'Showing {count} of {total} works',
    clear_filters: 'Clear filters',
    no_results_filtered: 'No works found matching the applied filters.',
  },
  ca: {
    tagline: "/ guia col·lectiva d'arquitectura",
    default_work_desc: "Fitxa d'obra a nolli., guia col·lectiva d'arquitectura.",
    label_architecture: 'Arquitectura',
    label_intervention: 'Intervenció',
    label_interventions: 'Intervencions',
    label_year: 'Any',
    label_category: 'Categoria',
    label_importance: 'Importància',
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
    not_found_tag: 'ERROR 404 // FITXA NO DISPONIBLE',
    not_found_title: 'Obra no disponible',
    not_found_text: "L'obra arquitectònica sol·licitada no existeix, ha estat eliminada o l'enllaç no és vàlid. Pots explorar milers d'obres al mapa interactiu.",
    not_found_architect_title: 'Arquitecte no trobat | nolli.',
    not_found_architect_text: "No s'han trobat obres catalogades per a aquest arquitecte a nolli. Pots explorar milers d'obres al mapa interactiu.",
    not_found_city_title: 'Ciutat no trobada | nolli.',
    not_found_city_text: "No s'han trobat obres registrades en aquesta ubicació a nolli. Pots explorar el mapa interactiu.",
    not_found_category_title: 'Categoria no trobada | nolli.',
    not_found_category_text: "La categoria sol·licitada no existeix o no té obres catalogades a nolli.",
    go_to_map: 'ANAR AL MAPA PRINCIPAL',
    category_title: "Arquitectura {categoria} | guia col·lectiva d'arquitectura | nolli.",
    category_desc: "Explora {count} obres d'arquitectura a la categoria {categoria}. guia col·lectiva d'arquitectura i mapa interactiu a nolli.",
    category_page_name: "Obres d'arquitectura a la categoria {categoria} | nolli.",
    architect_title: "Obres de {nombre} | guia col·lectiva d'arquitectura | nolli.",
    architect_desc: "Descobreix les obres i projectes de {nombre} ({count} edificis catalogats) a nolli. Explora la seva arquitectura al mapa interactiu.",
    architect_page_name: 'Obres i projectes de {nombre} | nolli.',
    city_title: 'Arquitectura a {city} | Obres i Guia | nolli.',
    city_desc: 'Guia d\'arquitectura a {city}: descobreix {count} obres i projectes únics catalogats a nolli. Mapa interactiu i guia col·lectiva d\'arquitectura.',
    city_page_name: 'Obres i projectes d\'arquitectura a {city} | nolli.',
    project_by_signes_lead: 'és un projecte de',
    breadcrumb_architects: 'Arquitectes',
    breadcrumb_cities: 'Ciutats',
    breadcrumb_categories: 'Categories',
    cross_cities_by_architect: 'Ciutats amb obres de {nombre}',
    cross_categories_by_architect: 'Tipologies i categories de {nombre}',
    cross_architects_in_city: 'Arquitectes amb obra a {city}',
    cross_categories_in_city: 'Tipologies arquitectòniques a {city}',
    cross_architects_in_category: 'Arquitectes destacats a {categoria}',
    cross_cities_in_category: 'Ciutats amb més arquitectura {categoria}',
    other_categories: 'Altres categories arquitectòniques',
    explore_on_map: 'EXPLORAR AL MAPA INTERACTIU',
    view_city_map: 'VEURE {city} AL MAPA',
    all_works: 'Veure totes les obres',
    search_works_placeholder: 'Cercar per obra, ciutat o any...',
    search_works_placeholder_city: 'Cercar per obra, arquitecte o any...',
    search_works_placeholder_cat: 'Cercar per obra, arquitecte, ciutat o any...',
    view_grid: 'Quadrícula',
    view_list: 'Llistat',
    sort_by: 'Ordenar per',
    sort_year_desc: 'Any (recent a antic)',
    sort_year_asc: 'Any (antic a recent)',
    sort_name_asc: 'Nom (A – Z)',
    sort_name_desc: 'Nom (Z – A)',
    sort_category_asc: 'Categoria (A – Z)',
    sort_category_desc: 'Categoria (Z – A)',
    sort_architect_asc: 'Arquitecte (A – Z)',
    sort_architect_desc: 'Arquitecte (Z – A)',
    sort_city_asc: 'Ciutat (A – Z)',
    sort_city_desc: 'Ciutat (Z – A)',
    sort_importance_desc: 'Importància (major a menor)',
    sort_importance_asc: 'Importància (menor a major)',
    filter_all_categories: 'Totes les categories',
    filter_all_cities: 'Totes les ciutats',
    filter_all_architects: 'Tots els arquitectes',
    filter_all_importance: 'Tots els nivells',
    importance_0: 'Obra Mestra',
    importance_1: 'Imprescindible',
    importance_2: 'Recomanada',
    importance_3: 'Documentada',
    showing_works_count: 'Mostrant {count} de {total} obres',
    clear_filters: 'Netejar filtres',
    no_results_filtered: "No s'han trobat obres amb els filtres aplicats.",
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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renderiza el pie de página unificado para todas las fichas del sitemap.
 * Incluye la mención "nolli. es un proyecto de SIGNES.STUDIO" con SIGNES en negrita
 * y .STUDIO en peso fino, bajo la tipografía Montserrat.
 */
function renderSiteFooter(lang = 'es', siteUrl = 'https://nollimap.app') {
  const prefix = getLangPrefix(lang);
  const lead = getSSRText('project_by_signes_lead', lang);
  const mapText = getSSRText('go_to_map', lang);

  return `<footer class="site-footer">
    <div class="footer-brand">
      <div class="footer-by"><span class="brand-nolli">nolli.</span> ${escapeHtml(lead)} <a href="https://signes.studio/?ref=nolli&utm_source=nolli&utm_medium=referral" target="_blank" rel="noopener" class="brand-signes"><strong class="brand-signes-bold">SIGNES</strong><span class="brand-signes-thin">.STUDIO</span></a></div>
    </div>
    <div class="footer-links">
      <a href="${siteUrl}${prefix}/">${escapeHtml(mapText)}</a>
      <a href="${siteUrl}/sitemap-categories.xml">Categorías</a>
      <a href="${siteUrl}/sitemap-architects.xml">Arquitectos</a>
      <a href="${siteUrl}/sitemap-cities.xml">Ciudades</a>
      <a href="${siteUrl}/sitemap.xml">Sitemap</a>
      <a href="${siteUrl}/legal">Legal</a>
    </div>
  </footer>`;
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
  renderSiteFooter,
};
