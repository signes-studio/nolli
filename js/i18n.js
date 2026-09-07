/* =========================================================================
   I18N.JS — Motor de Internacionalización Ligero para Nolli
   Soporte para Español (raíz), Inglés (/en/) y Catalán (/ca/)
   ========================================================================= */

export const SUPPORTED_LANGS = ['es', 'en', 'ca'];
export const DEFAULT_LANG = 'es';
export const STORAGE_LANG_KEY = 'nolli:lang';

let currentLang = DEFAULT_LANG;
let translations = {};
let fallbackTranslations = {};
let isInitialized = false;

/**
 * Detecta el idioma inicial según la jerarquía establecida:
 * 1. Prefijo en URL (/en/ o /ca/)
 * 2. Preferencia manual guardada en localStorage
 * 3. Idioma del dispositivo/navegador (navigator.languages)
 * 4. Fallback: español ('es')
 */
export function detectLanguage() {
  if (typeof window === 'undefined') return DEFAULT_LANG;

  // 1. Prefijo de URL (manda siempre)
  const pathname = window.location.pathname;
  if (pathname.startsWith('/en/') || pathname === '/en') return 'en';
  if (pathname.startsWith('/ca/') || pathname === '/ca') return 'ca';

  // 2. Preferencia en localStorage
  try {
    const saved = localStorage.getItem(STORAGE_LANG_KEY);
    if (saved && SUPPORTED_LANGS.includes(saved)) {
      return saved;
    }
  } catch {}

  // 3. navigator.languages
  try {
    const browserLangs = navigator.languages || [navigator.language || ''];
    for (const lang of browserLangs) {
      const code = String(lang).toLowerCase();
      if (code.startsWith('ca') || code.startsWith('val')) return 'ca';
      if (code.startsWith('en')) return 'en';
      if (code.startsWith('es')) return 'es';
    }
  } catch {}

  return DEFAULT_LANG;
}

/**
 * Comprueba si debe realizarse redirección automática 302 al entrar en raíz (/)
 */
export function handleRootRedirection() {
  if (typeof window === 'undefined') return;

  const pathname = window.location.pathname;
  // Solo aplica en la raíz sin prefijo
  if (pathname !== '/' && pathname !== '') return;

  let savedPref = null;
  try {
    savedPref = localStorage.getItem(STORAGE_LANG_KEY);
  } catch {}

  // Si el usuario ya eligió idioma manualmente, respetarlo
  if (savedPref) {
    if (savedPref === 'en' && !pathname.startsWith('/en')) {
      const target = `/en/${window.location.search}${window.location.hash}`;
      window.location.replace(target);
      return;
    }
    if (savedPref === 'ca' && !pathname.startsWith('/ca')) {
      const target = `/ca/${window.location.search}${window.location.hash}`;
      window.location.replace(target);
      return;
    }
    return;
  }

  // Si no hay preferencia previa, detectar según dispositivo
  const detected = detectLanguage();
  if (detected === 'en' || detected === 'ca') {
    const target = `/${detected}/${window.location.search}${window.location.hash}`;
    window.location.replace(target);
  }
}

/**
 * Obtiene el idioma actualmente activo.
 */
export function getLanguage() {
  return currentLang;
}

/**
 * Obtiene el prefijo de URL correspondiente al idioma activo ('', '/en', '/ca').
 */
export function getUrlPrefix(lang = currentLang) {
  if (lang === 'en') return '/en';
  if (lang === 'ca') return '/ca';
  return '';
}

/**
 * Carga el archivo de idioma JSON.
 */
async function fetchLocale(lang) {
  try {
    const res = await fetch(`/locales/${lang}.json`);
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn(`[i18n] No se pudo cargar /locales/${lang}.json:`, err);
  }
  return {};
}

/**
 * Inicializa el sistema i18n cargando las traducciones del idioma resuelto.
 */
export async function initI18n() {
  if (isInitialized) return currentLang;

  // 1. Manejar redirección automática en raíz si aplica
  handleRootRedirection();

  // 2. Resolver idioma activo
  currentLang = detectLanguage();
  document.documentElement.lang = currentLang;

  // 3. Cargar traducciones en paralelo (idioma activo + fallback 'es' si es distinto)
  const loadTasks = [fetchLocale(currentLang).then((dict) => { translations = dict; })];
  if (currentLang !== DEFAULT_LANG) {
    loadTasks.push(fetchLocale(DEFAULT_LANG).then((dict) => { fallbackTranslations = dict; }));
  }

  await Promise.all(loadTasks);
  isInitialized = true;

  // 4. Aplicar al DOM inicial
  applyI18nToDOM();

  return currentLang;
}

/**
 * Traduce una clave con soporte para interpolación {variable}.
 * @param {string} key - Clave en el diccionario (ej: 'nav_explore')
 * @param {object} vars - Variables para interpolar (ej: { count: 5 })
 * @returns {string} Texto traducido o clave original si no existe
 */
export function t(key, vars = {}) {
  if (!key) return '';

  let text = translations[key];
  if (text == null && currentLang !== DEFAULT_LANG) {
    text = fallbackTranslations[key];
  }
  if (text == null) {
    text = key;
  }

  if (vars && typeof vars === 'object') {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v != null ? v : ''));
    });
  }

  return text;
}

/**
 * Aplica las traducciones a todos los elementos marcados con atributos data-i18n en el DOM.
 * @param {HTMLElement|Document} root - Contenedor raíz a traducir (por defecto document)
 */
export function applyI18nToDOM(root = document) {
  if (!root || !root.querySelectorAll) return;

  // 1. Texto directo (textContent)
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      const varsAttr = el.getAttribute('data-i18n-vars');
      let vars = {};
      if (varsAttr) {
        try { vars = JSON.parse(varsAttr); } catch {}
      }
      el.textContent = t(key, vars);
    }
  });

  // 2. HTML directo
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (key) el.innerHTML = t(key);
  });

  // 3. Placeholders
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.placeholder = t(key);
  });

  // 4. Aria Labels
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    if (key) el.setAttribute('aria-label', t(key));
  });

  // 5. Títulos / Tooltips
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.title = t(key);
  });
}

/**
 * Cambia manualmente el idioma, guarda la preferencia y navega a la URL con el nuevo prefijo.
 * @param {'es'|'en'|'ca'} newLang - Nuevo código de idioma
 */
export function switchLanguage(newLang) {
  if (!SUPPORTED_LANGS.includes(newLang)) return;

  try {
    localStorage.setItem(STORAGE_LANG_KEY, newLang);
  } catch {}

  const currentPath = window.location.pathname;
  let cleanPath = currentPath;

  // Quitar prefijo previo si existía
  if (cleanPath.startsWith('/en/')) cleanPath = cleanPath.slice(3);
  else if (cleanPath === '/en') cleanPath = '/';
  else if (cleanPath.startsWith('/ca/')) cleanPath = cleanPath.slice(3);
  else if (cleanPath === '/ca') cleanPath = '/';

  // Añadir nuevo prefijo si no es español
  let newPath = cleanPath;
  if (newLang === 'en') {
    newPath = '/en' + (cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`);
  } else if (newLang === 'ca') {
    newPath = '/ca' + (cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`);
  }

  // Normalizar barras repetidas
  newPath = newPath.replace(/\/+/g, '/');
  if (newPath === '') newPath = '/';

  const newUrl = `${newPath}${window.location.search}${window.location.hash}`;
  window.location.href = newUrl;
}

if (typeof window !== 'undefined') {
  window.__nolli_t = t;
  window.__nolli_i18n = {
    t,
    getLanguage,
    getUrlPrefix,
    switchLanguage,
    initI18n,
    applyI18nToDOM,
    detectLanguage,
  };
}
