/* =========================================================================
   MOBILEBOTTOMNAV.JS — Controlador de Navegación, Identidad, Búsqueda y Gestos (<= 768px)
   - Barra de Navegación Inferior (Bottom Navigation)
   - Widget Flotante de Identidad y Sesión (Esquina Superior Izquierda)
   - Buscador Flotante y Expansivo con dropdown anti-teclado (Esquina Superior Derecha)
   - Gesto Swipe-Down para cierre suave de Bottom Sheet
   - Aceleración por hardware a 60 FPS estables
   ========================================================================= */

import { state, esRolAdmin, separarArquitectos, normalizarCategoria, normalizarImportancia } from './state.js';
import { fetchBuildings } from './api.js';
import { actualizarFuenteMapa } from './mapData.js';

export function initMobileBottomNav() {
  const bottomBar = document.getElementById('mobile-bottom-bar');
  const panelBackdrop = document.getElementById('panel-backdrop');

  const btnSearch = document.getElementById('mobile-nav-search');
  const btnFilters = document.getElementById('mobile-nav-filters');
  const btnPlaces = document.getElementById('mobile-nav-places');
  const btnLayers = document.getElementById('mobile-nav-layers');

  const searchPanel = document.getElementById('search-panel');
  const filterPanel = document.getElementById('filter-panel');
  const myPlacesPanel = document.getElementById('my-places-panel');
  const mapStylePanel = document.getElementById('map-style-panel');
  const adminPanel = document.getElementById('admin-panel');
  const sheet = document.getElementById('sheet');

  const allPanels = [searchPanel, filterPanel, myPlacesPanel, mapStylePanel, adminPanel, sheet].filter(Boolean);
  const allNavButtons = [btnSearch, btnFilters, btnPlaces, btnLayers].filter(Boolean);

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function syncNavButtons() {
    if (!isMobile()) return;

    btnSearch?.classList.toggle('active', Boolean(searchPanel?.classList.contains('open')));
    btnFilters?.classList.toggle('active', Boolean(filterPanel?.classList.contains('open')));
    btnPlaces?.classList.toggle('active', Boolean(myPlacesPanel?.classList.contains('open')));
    btnLayers?.classList.toggle('active', Boolean(mapStylePanel?.classList.contains('open')));

    const hasAnyOpen = allPanels.some((panel) => panel.classList.contains('open'));
    if (panelBackdrop) {
      panelBackdrop.classList.toggle('active', hasAnyOpen);
    }
  }

  function closeAllPanels(except = null) {
    allPanels.forEach((panel) => {
      if (panel !== except && panel.classList.contains('open')) {
        panel.classList.remove('open');
      }
    });
    syncNavButtons();
  }

  function toggleMobilePanel(targetPanel, focusInput = null) {
    if (!targetPanel) return;

    const isCurrentlyOpen = targetPanel.classList.contains('open');

    // Cerrar los demás al instante
    closeAllPanels(isCurrentlyOpen ? null : targetPanel);

    if (isCurrentlyOpen) {
      targetPanel.classList.remove('open');
      if (panelBackdrop) panelBackdrop.classList.remove('active');
    } else {
      targetPanel.classList.add('open');
      if (panelBackdrop) panelBackdrop.classList.add('active');
      if (focusInput) {
        setTimeout(() => focusInput.focus(), 120);
      }
      document.dispatchEvent(new CustomEvent('radar:cerrar-ficha'));
    }

    syncNavButtons();
  }

  // Eventos de botones táctiles inferiores
  if (btnSearch) {
    btnSearch.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(searchPanel, document.getElementById('building-search'));
    });
  }

  if (btnFilters) {
    btnFilters.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(filterPanel);
    });
  }

  if (btnPlaces) {
    btnPlaces.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(myPlacesPanel);
    });
  }

  if (btnLayers) {
    btnLayers.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(mapStylePanel);
    });
  }

  // Cierre táctil al tocar fuera (Backdrop)
  if (panelBackdrop) {
    panelBackdrop.addEventListener('click', () => {
      closeAllPanels();
      if (panelBackdrop) panelBackdrop.classList.remove('active');
      const quickMenu = document.getElementById('mobile-admin-quickmenu');
      if (quickMenu) quickMenu.hidden = true;
    });
  }

  // Tecla Escape en dispositivos con teclado conectado
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMobile()) {
      closeAllPanels();
      if (panelBackdrop) panelBackdrop.classList.remove('active');
      const quickMenu = document.getElementById('mobile-admin-quickmenu');
      if (quickMenu) quickMenu.hidden = true;
    }
  });

  // Observador de cambios de clase para sincronizar botones al abrir/cerrar desde mapa u otros triggers
  const observer = new MutationObserver(() => {
    syncNavButtons();
  });

  allPanels.forEach((panel) => {
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
  });

  // Inicializar sub-componentes táctiles
  initMobileIdentityWidget();
  initMobileSearchWidget();
  initSheetTouchGestures();

  if (window.lucide) window.lucide.createIcons();
}

/* =========================================================================
   WIDGET FLOTANTE DE IDENTIDAD Y SESIÓN (SUPERIOR IZQUIERDA)
   ========================================================================= */
function initMobileIdentityWidget() {
  const badge = document.getElementById('mobile-identity-badge');
  const actionBtn = document.getElementById('btn-mobile-identity-action');
  const quickMenu = document.getElementById('mobile-admin-quickmenu');
  const btnCloseQuickMenu = document.getElementById('btn-close-quick-admin');
  const btnQuickAdminPanel = document.getElementById('btn-mobile-quick-admin-panel');
  const btnQuickReports = document.getElementById('btn-mobile-quick-reports');

  if (!badge || !actionBtn) return;

  function computeInitials() {
    if (state.userProfile?.firstName || state.userProfile?.lastName) {
      const f = (state.userProfile.firstName || '').charAt(0).toUpperCase();
      const l = (state.userProfile.lastName || '').charAt(0).toUpperCase();
      return f || l ? `${f}${l}` : 'ID';
    }
    if (state.userEmail) {
      const namePart = state.userEmail.split('@')[0];
      return namePart.slice(0, 3).toUpperCase();
    }
    return 'USER';
  }

  function updateIdentityUI() {
    const isLogged = Boolean(state.sessionToken);
    const isAdmin = esRolAdmin(state.userRole);

    actionBtn.classList.remove('guest', 'user-logged', 'admin-logged');

    if (!isLogged) {
      actionBtn.classList.add('guest');
      badge.textContent = '[ ACCEDER ]';
      actionBtn.title = 'Iniciar sesión';
      if (quickMenu) quickMenu.hidden = true;
    } else if (isAdmin) {
      actionBtn.classList.add('admin-logged');
      badge.textContent = '[ ADMIN ]';
      actionBtn.title = 'Menú rápido de administrador';
    } else {
      actionBtn.classList.add('user-logged');
      const inits = computeInitials();
      badge.textContent = `[ ${inits} ]`;
      actionBtn.title = 'Ver perfil personal';
      if (quickMenu) quickMenu.hidden = true;
    }
  }

  actionBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isLogged = Boolean(state.sessionToken);
    const isAdmin = esRolAdmin(state.userRole);

    if (!isLogged) {
      const loginModal = document.getElementById('modal-login');
      if (loginModal) loginModal.classList.add('open');
    } else if (isAdmin && quickMenu) {
      quickMenu.hidden = !quickMenu.hidden;
    } else {
      window.location.href = './perfil.html';
    }
  });

  if (btnCloseQuickMenu && quickMenu) {
    btnCloseQuickMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      quickMenu.hidden = true;
    });
  }

  if (btnQuickAdminPanel && quickMenu) {
    btnQuickAdminPanel.addEventListener('click', (e) => {
      e.stopPropagation();
      quickMenu.hidden = true;
      const adminPanel = document.getElementById('admin-panel');
      if (adminPanel) {
        adminPanel.classList.add('open');
        document.getElementById('admin-view-projects')?.classList.remove('admin-view-hidden');
        document.getElementById('admin-view-reports')?.classList.add('admin-view-hidden');
        document.getElementById('admin-users-view')?.classList.add('admin-view-hidden');
        document.getElementById('panel-backdrop')?.classList.add('active');
      }
    });
  }

  if (btnQuickReports && quickMenu) {
    btnQuickReports.addEventListener('click', (e) => {
      e.stopPropagation();
      quickMenu.hidden = true;
      const adminPanel = document.getElementById('admin-panel');
      if (adminPanel) {
        adminPanel.classList.add('open');
        document.getElementById('admin-view-projects')?.classList.add('admin-view-hidden');
        document.getElementById('admin-view-reports')?.classList.remove('admin-view-hidden');
        document.getElementById('admin-users-view')?.classList.add('admin-view-hidden');
        document.getElementById('panel-backdrop')?.classList.add('active');
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (quickMenu && !quickMenu.hidden && !quickMenu.contains(e.target) && !actionBtn.contains(e.target)) {
      quickMenu.hidden = true;
    }
  });

  ['radar:admin-login', 'radar:user-login', 'radar:logout', 'radar:user-session-ready', 'radar:admin-mode-change'].forEach((eventName) => {
    document.addEventListener(eventName, updateIdentityUI);
  });

  updateIdentityUI();
}

let cacheObrasMobileSearch = null;
let mobileSearchPromise = null;

async function cargarTodasObrasMobile() {
  if (cacheObrasMobileSearch && cacheObrasMobileSearch.length > 0) {
    return cacheObrasMobileSearch;
  }
  if (mobileSearchPromise) return mobileSearchPromise;

  mobileSearchPromise = (async () => {
    try {
      const filas = await fetchBuildings({ includeAllImportance: true });
      cacheObrasMobileSearch = (filas || []).map((fila, index) => ({
        id: fila.id,
        featureId: String(fila.id ?? `obra-${index}`),
        nombre_obra: fila.nombre_obra,
        foto_url: fila.foto_url || null,
        enlace_url: fila.enlace_url || null,
        arquitecto: fila.arquitecto,
        arquitectos: separarArquitectos(fila.arquitecto),
        año_construccion: fila.año_construccion,
        importancia: normalizarImportancia(fila.importancia),
        categoria: normalizarCategoria(fila.categoria),
        ciudad: fila.ciudad || null,
        estado_acceso: fila.estado_acceso || (fila.visitable ? 'publico' : 'privado'),
        coordenadas: [fila.longitud, fila.latitud],
      }));
      return cacheObrasMobileSearch;
    } catch (err) {
      console.warn('Error al precargar obras completas para buscador móvil:', err);
      return state.OBRAS || [];
    } finally {
      mobileSearchPromise = null;
    }
  })();

  return mobileSearchPromise;
}

/* =========================================================================
   BUSCADOR FLOTANTE Y EXPANSIVO (SUPERIOR DERECHO - BASE DE DATOS COMPLETA)
   ========================================================================= */
function initMobileSearchWidget() {
  const widget = document.getElementById('mobile-search-widget');
  const btnToggle = document.getElementById('btn-mobile-search-toggle');
  const btnClose = document.getElementById('btn-mobile-search-close');
  const input = document.getElementById('mobile-search-input');
  const dropdown = document.getElementById('mobile-search-dropdown');
  const resultsContainer = document.getElementById('mobile-search-results');

  if (!widget || !btnToggle || !input) return;

  function openSearch() {
    widget.classList.remove('collapsed');
    widget.classList.add('expanded');
    setTimeout(() => input.focus(), 100);
    cargarTodasObrasMobile();
  }

  function closeSearch() {
    widget.classList.remove('expanded');
    widget.classList.add('collapsed');
    input.value = '';
    if (dropdown) dropdown.hidden = true;
    if (resultsContainer) resultsContainer.innerHTML = '';
  }

  btnToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    openSearch();
  });

  if (btnClose) {
    btnClose.addEventListener('click', (e) => {
      e.stopPropagation();
      closeSearch();
    });
  }

  function normalize(str) {
    return (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  let searchDebounce = null;

  input.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      const q = normalize(input.value.trim());
      if (!q || q.length < 2) {
        if (dropdown) dropdown.hidden = true;
        if (resultsContainer) resultsContainer.innerHTML = '';
        return;
      }

      // Obtener todas las obras (base de datos completa + estado local)
      const todasLasObras = await cargarTodasObrasMobile();
      const catalogo = todasLasObras && todasLasObras.length ? todasLasObras : (state.OBRAS || []);

      const matches = catalogo
        .filter((obra) => {
          const name = normalize(obra.nombre_obra);
          const arq = normalize(Array.isArray(obra.arquitectos) ? obra.arquitectos.join(' ') : obra.arquitecto);
          const city = normalize(obra.ciudad);
          return name.includes(q) || arq.includes(q) || city.includes(q);
        })
        .slice(0, 15);

      if (!matches.length) {
        resultsContainer.innerHTML = `
          <div style="padding: 14px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--fg-dim); text-align: center;">
            [ SIN RESULTADOS EN LA BASE DE DATOS ]
          </div>
        `;
        dropdown.hidden = false;
        return;
      }

      resultsContainer.innerHTML = matches.map((obra) => `
        <button type="button" class="mobile-search-item" data-obra-id="${obra.id || obra.featureId}">
          <div style="min-width: 0; flex: 1;">
            <div class="mobile-search-item-title">${obra.nombre_obra}</div>
            <div class="mobile-search-item-sub">${obra.arquitecto || 'Arquitecto no indicado'}${obra.año_construccion ? ` · ${obra.año_construccion}` : ''}</div>
          </div>
          <div class="mobile-search-item-meta">${obra.ciudad ? `[ ${obra.ciudad.toUpperCase()} ]` : '[ S/C ]'}</div>
        </button>
      `).join('');

      dropdown.hidden = false;
    }, 120);
  });

  resultsContainer?.addEventListener('click', async (e) => {
    const item = e.target.closest('.mobile-search-item');
    if (!item) return;
    const obraId = item.dataset.obraId;

    const todas = await cargarTodasObrasMobile();
    const catalogo = todas && todas.length ? todas : (state.OBRAS || []);
    const obra = catalogo.find((o) => String(o.id) === String(obraId) || String(o.featureId) === String(obraId));

    if (obra) {
      closeSearch();

      // Si la obra no estaba cargada en el mapa actual, la incorporamos
      if (!state.OBRAS.some((o) => String(o.id) === String(obra.id))) {
        state.OBRAS.push(obra);
        actualizarFuenteMapa();
      }

      if (state.map && obra.coordenadas) {
        state.map.flyTo({
          center: obra.coordenadas,
          zoom: 16,
          padding: { top: 20, bottom: 64, left: 0, right: 0 },
        });
      }

      import('./sheetUI.js').then(({ abrirFicha }) => {
        abrirFicha(obra, obra.coordenadas, obra.featureId);
      });
    }
  });

  document.addEventListener('click', (e) => {
    if (widget.classList.contains('expanded') && !widget.contains(e.target)) {
      closeSearch();
    }
  });
}

/* =========================================================================
   GESTO TÁCTIL SWIPE-DOWN PARA CERRAR EL BOTTOM SHEET DE OBRA
   ========================================================================= */
function initSheetTouchGestures() {
  const sheetEl = document.getElementById('sheet');
  const dragHandle = document.getElementById('sheet-drag-handle');
  const sheetHeader = sheetEl?.querySelector('.sheet-header');

  if (!sheetEl) return;

  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  function onTouchStart(e) {
    if (window.innerWidth > 768) return;
    const touch = e.touches ? e.touches[0] : e;
    startY = touch.clientY;
    currentY = startY;
    isDragging = true;
    sheetEl.style.transition = 'none';
  }

  function onTouchMove(e) {
    if (!isDragging || window.innerWidth > 768) return;
    const touch = e.touches ? e.touches[0] : e;
    currentY = touch.clientY;
    const deltaY = currentY - startY;
    if (deltaY > 0) {
      sheetEl.style.transform = `translateY(${deltaY}px) translate3d(0, 0, 0)`;
    }
  }

  function onTouchEnd() {
    if (!isDragging || window.innerWidth > 768) return;
    isDragging = false;
    sheetEl.style.transition = '';
    const deltaY = currentY - startY;
    sheetEl.style.transform = '';

    if (deltaY > 75) {
      sheetEl.classList.remove('open');
      document.getElementById('panel-backdrop')?.classList.remove('active');
      document.dispatchEvent(new CustomEvent('radar:cerrar-ficha'));
    }
  }

  [dragHandle, sheetHeader].filter(Boolean).forEach((el) => {
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
  });
}
