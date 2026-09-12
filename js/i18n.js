/* =========================================================================
   I18N.JS — Motor de Internacionalización Ligero para Nolli
   Soporte para Español (raíz), Inglés (/en/) y Catalán (/ca/)
   ========================================================================= */

export const SUPPORTED_LANGS = ['es', 'en', 'ca'];
export const DEFAULT_LANG = 'es';
export const STORAGE_LANG_KEY = 'nolli:lang';
export const COOKIE_LANG_KEY = 'nolli_lang';

let currentLang = DEFAULT_LANG;
let translations = {};
let fallbackTranslations = {};
let isInitialized = false;

/**
 * Obtiene el valor de una cookie por su nombre.
 */
function getCookie(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Guarda una cookie con expiración en días y Path=/.
 */
function setCookie(name, value, days = 365) {
  if (typeof document === 'undefined') return;
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

/**
 * Detecta el idioma inicial según la jerarquía estricta:
 * 1. Prefijo en URL (/en/ o /ca/) — Manda absolutamente sobre todo lo demás
 * 2. Cookie o localStorage de preferencia manual guardada
 * 3. Configuración Accept-Language del dispositivo (navigator.languages)
 * 4. Fallback: español ('es')
 */
export function detectLanguage() {
  if (typeof window === 'undefined') return DEFAULT_LANG;

  // 1. Prefijo de URL (manda siempre)
  const pathname = window.location.pathname;
  if (pathname.startsWith('/en/') || pathname === '/en') return 'en';
  if (pathname.startsWith('/ca/') || pathname === '/ca') return 'ca';

  // 2. Cookie o localStorage de preferencia guardada
  try {
    const cookieLang = getCookie(COOKIE_LANG_KEY);
    if (cookieLang && SUPPORTED_LANGS.includes(cookieLang)) return cookieLang;

    const saved = localStorage.getItem(STORAGE_LANG_KEY);
    if (saved && SUPPORTED_LANGS.includes(saved)) {
      return saved;
    }
  } catch {}

  // 3. Cabecera Accept-Language / navigator.languages
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
 * Comprueba si debe realizarse redirección automática en primera visita a la raíz (/):
 * - Si el usuario llega a / sin cookie/preferencia previa y su navegador pide en (o derivado), redirigir a /en/.
 * - Si pide ca (o valenciano), redirigir a /ca/.
 * - Si pide es (o cualquier otro idioma no soportado), quedarse en / (español por defecto).
 * - Si YA tiene preferencia guardada (localStorage o cookie), NO redirigir si eligió español, o respetar su elección.
 */
export function handleRootRedirection() {
  if (typeof window === 'undefined') return;

  const pathname = window.location.pathname;
  // Solo aplica en la raíz sin prefijo
  if (pathname !== '/' && pathname !== '') return;

  let savedPref = null;
  try {
    savedPref = getCookie(COOKIE_LANG_KEY) || localStorage.getItem(STORAGE_LANG_KEY);
  } catch {}

  // Si el usuario ya tiene preferencia guardada, respetarla
  if (savedPref && SUPPORTED_LANGS.includes(savedPref)) {
    if (savedPref === 'en') {
      window.location.replace(`/en${window.location.search}${window.location.hash}`);
      return;
    }
    if (savedPref === 'ca') {
      window.location.replace(`/ca${window.location.search}${window.location.hash}`);
      return;
    }
    // Si savedPref === 'es', se queda en /
    return;
  }

  // Primera visita sin preferencia previa: detectar idioma del navegador
  try {
    const browserLangs = navigator.languages || [navigator.language || ''];
    for (const lang of browserLangs) {
      const code = String(lang).toLowerCase();
      if (code.startsWith('ca') || code.startsWith('val')) {
        window.location.replace(`/ca${window.location.search}${window.location.hash}`);
        return;
      }
      if (code.startsWith('en')) {
        window.location.replace(`/en${window.location.search}${window.location.hash}`);
        return;
      }
      if (code.startsWith('es')) {
        return; // Quedarse en /
      }
    }
  } catch {}
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
  updateMetaTags(currentLang);

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
export function t(key, vars = {}, defaultValue = null) {
  if (!key) return '';

  let text = translations[key];
  if (text == null && currentLang !== DEFAULT_LANG) {
    text = fallbackTranslations[key];
  }
  if (text == null) {
    if (defaultValue != null) {
      text = defaultValue;
    } else if (typeof vars === 'string') {
      text = vars;
    } else {
      text = key;
    }
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
      const existing = el.textContent ? el.textContent.trim() : null;
      el.textContent = t(key, vars, existing);
    }
  });

  // 2. HTML directo
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (key) {
      const existing = el.innerHTML ? el.innerHTML.trim() : null;
      el.innerHTML = t(key, {}, existing);
    }
  });

  // 3. Placeholders
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.placeholder = t(key, {}, el.placeholder || null);
  });

  // 4. Aria Labels
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    if (key) el.setAttribute('aria-label', t(key, {}, el.getAttribute('aria-label') || null));
  });

  // 5. Títulos / Tooltips
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.title = t(key, {}, el.title || null);
  });

  // 6. Configurar y sincronizar selectores de idioma en el DOM
  setupLanguageSwitchers(root);
}

/**
 * Conecta los botones de selectores de idioma (neo, sutil, píldoras)
 * y actualiza su estado activo según el idioma actual.
 * @param {HTMLElement|Document} root - Contenedor donde buscar selectores
 */
export function setupLanguageSwitchers(root = document) {
  const current = getLanguage();
  root.querySelectorAll('.lang-switcher-neo, .lang-switcher-subtle, .lang-switcher-pills, [data-lang-switcher]').forEach((container) => {
    container.querySelectorAll('[data-lang-btn]').forEach((btn) => {
      const lang = btn.dataset.langBtn;
      const isActive = lang === current;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));

      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (lang !== current) {
          switchLanguage(lang);
        }
      };
    });
  });

  // Botones sueltos o enlaces con [data-lang-btn] fuera de contenedores conocidos
  root.querySelectorAll('button[data-lang-btn]:not(.lang-switcher-neo *):not(.lang-switcher-subtle *):not(.lang-switcher-pills *)').forEach((btn) => {
    const lang = btn.dataset.langBtn;
    const isActive = lang === current;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (lang !== current) {
        switchLanguage(lang);
      }
    };
  });
}

/**
 * Cambia manualmente el idioma, guarda la preferencia en localStorage y cookie,
 * y redirige a la URL equivalente en el nuevo idioma.
 * @param {'es'|'en'|'ca'} newLang - Nuevo código de idioma ('es', 'en', 'ca')
 */
export function switchLanguage(newLang) {
  if (!SUPPORTED_LANGS.includes(newLang)) return;

  // 1. Guardar preferencia en localStorage y cookie (1 año, Path=/)
  try {
    localStorage.setItem(STORAGE_LANG_KEY, newLang);
  } catch {}
  setCookie(COOKIE_LANG_KEY, newLang, 365);

  // 2. Resolver ruta limpia despojando prefijos conocidos (/en/ o /ca/ o /en o /ca)
  const currentPath = window.location.pathname;
  let cleanPath = currentPath;

  if (cleanPath.startsWith('/en/')) cleanPath = cleanPath.slice(3);
  else if (cleanPath === '/en') cleanPath = '/';
  else if (cleanPath.startsWith('/ca/')) cleanPath = cleanPath.slice(3);
  else if (cleanPath === '/ca') cleanPath = '/';

  if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;

  // 3. Añadir nuevo prefijo según el idioma destino (sin trailing slash innecesaria)
  let targetPath = cleanPath;
  if (newLang === 'en') {
    targetPath = cleanPath === '/' ? '/en' : '/en' + cleanPath;
  } else if (newLang === 'ca') {
    targetPath = cleanPath === '/' ? '/ca' : '/ca' + cleanPath;
  } else {
    // 'es' vive en la raíz
    targetPath = cleanPath;
  }

  // Normalizar barras repetidas y evitar trailing slash en rutas no raíz
  targetPath = targetPath.replace(/\/+/g, '/');
  if (targetPath === '') targetPath = '/';
  if (targetPath.length > 1 && targetPath.endsWith('/')) {
    targetPath = targetPath.slice(0, -1);
  }

  const newUrl = `${targetPath}${window.location.search}${window.location.hash}`;
  window.location.href = newUrl;
}

/**
 * Sincroniza las etiquetas canonical y og:locale del head en el cliente.
 */
function updateMetaTags(lang) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    canonical.href = `${window.location.origin}${window.location.pathname}`;
  }
  const ogLocale = document.querySelector('meta[property="og:locale"]');
  if (ogLocale) {
    const map = { es: 'es_ES', en: 'en_US', ca: 'ca_ES' };
    ogLocale.content = map[lang] || 'es_ES';
  }
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
    setupLanguageSwitchers,
    detectLanguage,
  };
}
