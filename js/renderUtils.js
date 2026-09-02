/* =========================================================================
   RENDERUTILS.JS — Utilidades de renderizado optimizado para listas grandes
   Implementa renderizado en chunks con requestIdleCallback para no bloquear el hilo principal
   ========================================================================= */

/**
 * Renderiza elementos HTML en chunks para evitar jank en listas grandes.
 * Cada chunk se renderiza cuando el navegador está idle (sin trabajo crítico).
 * 
 * @param {HTMLElement} container - Elemento contenedor donde insertar el HTML
 * @param {string[]} htmlChunks - Array de strings HTML a insertar
 * @param {number} chunkSize - Cantidad de elementos a renderizar por idle callback (default: 20)
 * @param {Function} onComplete - Callback cuando finaliza el renderizado
 * @returns {AbortController} para cancelar el renderizado si es necesario
 */
export function renderInChunks(container, htmlChunks = [], chunkSize = 20, onComplete = null) {
  if (!container) return null;
  
  const controller = new AbortController();
  let chunkIndex = 0;
  const totalChunks = Math.ceil(htmlChunks.length / chunkSize);
  
  function renderNextChunk() {
    if (controller.signal.aborted) return;
    
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, htmlChunks.length);
    
    try {
      const fragment = document.createDocumentFragment();
      const tempDiv = document.createElement('div');
      
      for (let i = start; i < end; i++) {
        tempDiv.innerHTML = htmlChunks[i];
        while (tempDiv.firstChild) {
          fragment.appendChild(tempDiv.firstChild);
        }
      }
      
      container.appendChild(fragment);
    } catch (err) {
      console.warn('Error en renderizado en chunks:', err);
    }
    
    chunkIndex++;
    
    if (chunkIndex < totalChunks && !controller.signal.aborted) {
      if (window.requestIdleCallback) {
        requestIdleCallback(() => renderNextChunk(), { timeout: 100 });
      } else {
        // Fallback para navegadores sin requestIdleCallback
        requestAnimationFrame(() => renderNextChunk());
      }
    } else if (onComplete && !controller.signal.aborted) {
      onComplete();
    }
  }
  
  if (htmlChunks.length === 0) {
    if (onComplete) onComplete();
    return controller;
  }
  
  if (window.requestIdleCallback) {
    requestIdleCallback(() => renderNextChunk(), { timeout: 100 });
  } else {
    renderNextChunk();
  }
  
  return controller;
}

/**
 * Virtualización simple: solo renderiza elementos visibles en el viewport
 * Útil para listas muy largas (1000+ items).
 * 
 * @param {HTMLElement} container - Contenedor scrollable
 * @param {Array} items - Array de items a virtualizar
 * @param {Function} renderItem - Función que retorna HTML para cada item
 * @param {number} itemHeight - Altura estimada de cada item en px
 * @param {number} bufferSize - Cantidad de items fuera del viewport a pre-renderizar (default: 5)
 */
export function createVirtualList(container, items = [], renderItem = null, itemHeight = 80, bufferSize = 5) {
  if (!container || !renderItem || items.length === 0) return;
  
  const listWrapper = document.createElement('div');
  listWrapper.style.position = 'relative';
  listWrapper.style.height = (items.length * itemHeight) + 'px';
  
  const visibleContainer = document.createElement('div');
  visibleContainer.style.position = 'absolute';
  visibleContainer.style.top = '0';
  visibleContainer.style.left = '0';
  visibleContainer.style.right = '0';
  
  listWrapper.appendChild(visibleContainer);
  container.innerHTML = '';
  container.appendChild(listWrapper);
  
  function updateVisibleItems() {
    const scrollTop = container.parentElement?.scrollTop || 0;
    const viewportHeight = container.parentElement?.clientHeight || 0;
    
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
    const endIndex = Math.min(items.length, Math.ceil((scrollTop + viewportHeight) / itemHeight) + bufferSize);
    
    visibleContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    for (let i = startIndex; i < endIndex; i++) {
      const itemDiv = document.createElement('div');
      itemDiv.style.position = 'absolute';
      itemDiv.style.top = (i * itemHeight) + 'px';
      itemDiv.style.left = '0';
      itemDiv.style.right = '0';
      itemDiv.innerHTML = renderItem(items[i], i);
      fragment.appendChild(itemDiv);
    }
    
    visibleContainer.appendChild(fragment);
  }
  
  // Debounce scroll events
  let scrollTimeout = null;
  const parentScroll = container.parentElement;
  if (parentScroll) {
    parentScroll.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(updateVisibleItems, 16); // ~60fps
    });
  }
  
  updateVisibleItems();
}

/**
 * Deduplica solicitudes de API basadas en parámetros. Retorna promesa cacheada
 * si la misma solicitud está en vuelo.
 * 
 * @param {string} cacheKey - Clave única para esta solicitud
 * @param {Function} fetchFn - Función async que ejecuta la solicitud
 * @param {Map} cache - Mapa donde cachear resultados (default: new Map())
 * @returns {Promise} Resultado cacheado o nueva solicitud
 */
export function fetchWithCache(cacheKey, fetchFn, cache = new Map()) {
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    // Si es una promesa, retornar su resultado cuando esté listo
    if (cached && typeof cached.then === 'function') {
      return cached;
    }
    // Si ya está resuelta, retornar como promesa
    return Promise.resolve(cached);
  }
  
  const promise = fetchFn().then(result => {
    cache.set(cacheKey, result);
    return result;
  }).catch(err => {
    cache.delete(cacheKey); // Limpiar cache en error
    throw err;
  });
  
  // Cachear la promesa mientras se resuelve (para dedupe)
  cache.set(cacheKey, promise);
  return promise;
}

/**
 * Crea un debouncer para funciones que se llaman frecuentemente
 * @param {Function} fn - Función a debounce
 * @param {number} delay - Delay en ms (default: 300ms)
 * @returns {Function} Versión debounced
 */
export function debounce(fn, delay = 300) {
  let timeoutId = null;
  return function debounced(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Crea un throttler para limitar llamadas a una función
 * @param {Function} fn - Función a throttle
 * @param {number} interval - Intervalo mínimo en ms (default: 100ms)
 * @returns {Function} Versión throttled
 */
export function throttle(fn, interval = 100) {
  let lastCall = 0;
  let timeoutId = null;
  
  return function throttled(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    
    if (timeSinceLastCall >= interval) {
      lastCall = now;
      fn(...args);
    } else {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        fn(...args);
      }, interval - timeSinceLastCall);
    }
  };
}

/**
 * Calcula una clave de viewport para deduplication de cargas de mapa
 * @param {Object} bounds - Bounds del mapa ({north, south, east, west})
 * @param {number} zoom - Nivel de zoom
 * @param {Set} activeCategories - Categorías activas
 * @returns {string} Clave para comparar/cachear
 */
export function getViewportKey(bounds, zoom, activeCategories = new Set()) {
  if (!bounds) return '';
  const roundZoom = Math.round(zoom * 10) / 10;
  const roundBounds = [
    Math.round(bounds.getWest() * 100) / 100,
    Math.round(bounds.getSouth() * 100) / 100,
    Math.round(bounds.getEast() * 100) / 100,
    Math.round(bounds.getNorth() * 100) / 100,
  ].join(',');
  const catStr = Array.from(activeCategories || []).sort().join('|');
  return `${roundBounds}@${roundZoom}:${catStr}`;
}

export function calcularDistanciaMetros(lon1, lat1, lon2, lat2) {
  if (lon1 == null || lat1 == null || lon2 == null || lat2 == null) return Infinity;
  const R = 6371e3; // Radio de la Tierra en metros
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function formatearDistancia(metros) {
  if (!isFinite(metros) || metros == null) return '';
  if (metros < 1000) {
    return `${Math.round(metros)} M`;
  }
  return `${(metros / 1000).toFixed(1)} KM`;
}
