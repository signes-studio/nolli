/* =========================================================================
   RENDERUTILS.TS — Utilidades de renderizado optimizado para listas grandes
   Implementa renderizado en chunks con requestIdleCallback para no bloquear el hilo principal
   ========================================================================= */
/**
 * Renderiza elementos HTML en chunks para evitar jank en listas grandes.
 * Cada chunk se renderiza cuando el navegador está idle (sin trabajo crítico).
 *
 * @param container - Elemento contenedor donde insertar el HTML
 * @param htmlChunks - Array de strings HTML a insertar
 * @param chunkSize - Cantidad de elementos a renderizar por idle callback (default: 20)
 * @param onComplete - Callback cuando finaliza el renderizado
 * @returns AbortController para cancelar el renderizado si es necesario
 */
export function renderInChunks(container, htmlChunks = [], chunkSize = 20, onComplete = null) {
    if (!container)
        return null;
    const controller = new AbortController();
    let chunkIndex = 0;
    const totalChunks = Math.ceil(htmlChunks.length / chunkSize);
    function renderNextChunk() {
        if (controller.signal.aborted)
            return;
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, htmlChunks.length);
        try {
            const fragment = document.createDocumentFragment();
            const tempDiv = document.createElement('div');
            for (let i = start; i < end; i++) {
                const chunk = htmlChunks[i];
                if (chunk != null) {
                    tempDiv.innerHTML = chunk;
                    while (tempDiv.firstChild) {
                        fragment.appendChild(tempDiv.firstChild);
                    }
                }
            }
            container?.appendChild(fragment);
        }
        catch (err) {
            console.warn('Error en renderizado en chunks:', err);
        }
        chunkIndex++;
        if (chunkIndex < totalChunks && !controller.signal.aborted) {
            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(() => renderNextChunk(), { timeout: 100 });
            }
            else {
                requestAnimationFrame(() => renderNextChunk());
            }
        }
        else if (onComplete && !controller.signal.aborted) {
            onComplete();
        }
    }
    if (htmlChunks.length === 0) {
        if (onComplete)
            onComplete();
        return controller;
    }
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => renderNextChunk(), { timeout: 100 });
    }
    else {
        renderNextChunk();
    }
    return controller;
}
/**
 * Virtualización simple: solo renderiza elementos visibles en el viewport
 * Útil para listas muy largas (1000+ items).
 *
 * @param container - Contenedor scrollable
 * @param items - Array de items a virtualizar
 * @param renderItem - Función que retorna HTML para cada item
 * @param itemHeight - Altura estimada de cada item en px
 * @param bufferSize - Cantidad de items fuera del viewport a pre-renderizar (default: 5)
 */
export function createVirtualList(container, items = [], renderItem = null, itemHeight = 80, bufferSize = 5) {
    if (!container || !renderItem || items.length === 0)
        return;
    const listWrapper = document.createElement('div');
    listWrapper.style.position = 'relative';
    listWrapper.style.height = `${items.length * itemHeight}px`;
    const visibleContainer = document.createElement('div');
    visibleContainer.style.position = 'absolute';
    visibleContainer.style.top = '0';
    visibleContainer.style.left = '0';
    visibleContainer.style.right = '0';
    listWrapper.appendChild(visibleContainer);
    container.innerHTML = '';
    container.appendChild(listWrapper);
    function updateVisibleItems() {
        const parent = container?.parentElement;
        const scrollTop = parent?.scrollTop || 0;
        const viewportHeight = parent?.clientHeight || 0;
        const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
        const endIndex = Math.min(items.length, Math.ceil((scrollTop + viewportHeight) / itemHeight) + bufferSize);
        visibleContainer.innerHTML = '';
        const fragment = document.createDocumentFragment();
        for (let i = startIndex; i < endIndex; i++) {
            const item = items[i];
            if (item !== undefined && renderItem) {
                const itemDiv = document.createElement('div');
                itemDiv.style.position = 'absolute';
                itemDiv.style.top = `${i * itemHeight}px`;
                itemDiv.style.left = '0';
                itemDiv.style.right = '0';
                itemDiv.innerHTML = renderItem(item, i);
                fragment.appendChild(itemDiv);
            }
        }
        visibleContainer.appendChild(fragment);
    }
    let scrollRafId = null;
    const parentScroll = container.parentElement;
    if (parentScroll) {
        parentScroll.addEventListener('scroll', () => {
            if (!scrollRafId) {
                scrollRafId = requestAnimationFrame(() => {
                    updateVisibleItems();
                    scrollRafId = null;
                });
            }
        }, { passive: true });
    }
    updateVisibleItems();
}
/**
 * Deduplica solicitudes de API basadas en parámetros. Retorna promesa cacheada
 * si la misma solicitud está en vuelo.
 *
 * @param cacheKey - Clave única para esta solicitud
 * @param fetchFn - Función async que ejecuta la solicitud
 * @param cache - Mapa donde cachear resultados
 * @returns Resultado cacheado o nueva solicitud
 */
export function fetchWithCache(cacheKey, fetchFn, cache = new Map()) {
    if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (cached && typeof cached.then === 'function') {
            return cached;
        }
        return Promise.resolve(cached);
    }
    const promise = fetchFn().then((result) => {
        cache.set(cacheKey, result);
        return result;
    }).catch((err) => {
        cache.delete(cacheKey);
        throw err;
    });
    cache.set(cacheKey, promise);
    return promise;
}
/**
 * Crea un debouncer para funciones que se llaman frecuentemente
 * @param fn - Función a debounce
 * @param delay - Delay en ms (default: 300ms)
 * @returns Versión debounced
 */
export function debounce(fn, delay = 300) {
    let timeoutId = null;
    return function debounced(...args) {
        if (timeoutId)
            clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}
/**
 * Crea un throttler para limitar llamadas a una función
 * @param fn - Función a throttle
 * @param interval - Intervalo mínimo en ms (default: 100ms)
 * @returns Versión throttled
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
        }
        else {
            if (timeoutId)
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
 * @param bounds - Bounds del mapa ({north, south, east, west})
 * @param zoom - Nivel de zoom
 * @param activeCategories - Categorías activas
 * @returns Clave para comparar/cachear
 */
export function getViewportKey(bounds, zoom, activeCategories = new Set()) {
    if (!bounds)
        return '';
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
    if (lon1 == null || lat1 == null || lon2 == null || lat2 == null)
        return Infinity;
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
    if (metros == null || !Number.isFinite(metros))
        return '';
    if (metros < 1000) {
        return `${Math.round(metros)} M`;
    }
    return `${(metros / 1000).toFixed(1)} KM`;
}
/**
 * Muestra una notificación toast no bloqueante con estética Neo-Bauhaus.
 * @param message - Mensaje a mostrar
 * @param options - { type, actionText, onAction, duration }
 */
export function showNeoToast(message, options = {}) {
    const { actionText = null, onAction = null, duration = actionText ? 5000 : 3200, } = options;
    let toast = document.getElementById('nolli-neo-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'nolli-neo-toast';
        toast.style.cssText = `
      position: fixed;
      left: 50%;
      bottom: 84px;
      transform: translateX(-50%);
      z-index: 99999;
      background: #141411;
      color: #F8F1DF;
      border: 2px solid #E95C0C;
      padding: 10px 16px;
      max-width: min(92vw, 420px);
      width: max-content;
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      line-height: 1.4;
      display: flex;
      align-items: center;
      gap: 12px;
      opacity: 0;
      transition: opacity 0.2s ease;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25), 0 2px 6px rgba(0, 0, 0, 0.1);
      border-radius: 8px !important;
    `;
        document.body.appendChild(toast);
    }
    const isAuthNotice = String(message).toLowerCase().includes('inicia sesión') || String(message).toLowerCase().includes('iniciar sesión');
    const finalActionText = actionText || (isAuthNotice ? 'iniciar sesión' : null);
    toast.innerHTML = `
    <span style="flex:1;">${String(message)}</span>
    ${finalActionText ? `<button type="button" id="nolli-toast-action-btn" style="background:var(--accent, rgb(233, 92, 12)); color:white; border:none; padding:6px 12px; font-family:'Inter',sans-serif; font-size:11px; font-weight:600; cursor:pointer; text-transform:lowercase; border-radius:6px !important; flex-shrink:0;">${finalActionText}</button>` : ''}
  `;
    if (finalActionText) {
        const btn = toast.querySelector('#nolli-toast-action-btn');
        if (btn) {
            btn.style.setProperty('border-radius', '6px', 'important');
            btn.onclick = () => {
                if (toast)
                    toast.style.opacity = '0';
                if (onAction) {
                    onAction();
                }
                else if (isAuthNotice) {
                    const loginModal = document.getElementById('modal-login');
                    if (loginModal)
                        loginModal.classList.add('open');
                }
            };
        }
    }
    toast.style.opacity = '1';
    if (toast._timer)
        clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        if (toast)
            toast.style.opacity = '0';
    }, duration);
}
/**
 * Inicializa un indicador de scroll horizontal sutil para contenedores de pestañas desbordables.
 * Añade/remueve las clases .can-scroll-left y .can-scroll-right al wrapper según la posición del scroll.
 *
 * @param scrollEl - El elemento con overflow-x: auto (las pestañas)
 * @param wrapEl - El elemento contenedor (.nolli-tabs-scroll-wrap)
 * @returns Función para forzar actualización de estado de scroll
 */
export function initTabsScrollIndicator(scrollEl, wrapEl) {
    if (!scrollEl || !wrapEl)
        return () => { };
    const update = () => {
        const maxScroll = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth);
        if (maxScroll <= 1) {
            wrapEl.classList.remove('can-scroll-left', 'can-scroll-right');
            return;
        }
        const current = scrollEl.scrollLeft;
        wrapEl.classList.toggle('can-scroll-left', current > 2);
        wrapEl.classList.toggle('can-scroll-right', (maxScroll - current) > 2);
    };
    scrollEl.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    if ('ResizeObserver' in window) {
        const ro = new ResizeObserver(() => update());
        ro.observe(scrollEl);
        Array.from(scrollEl.children).forEach((child) => ro.observe(child));
    }
    update();
    requestAnimationFrame(update);
    setTimeout(update, 100);
    setTimeout(update, 400);
    return update;
}
//# sourceMappingURL=renderUtils.js.map