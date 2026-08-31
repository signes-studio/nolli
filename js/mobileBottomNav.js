/* =========================================================================
   MOBILEBOTTOMNAV.JS — Controlador de Navegación, Identidad, Búsqueda y Gestos (<= 768px)
   - Barra de Navegación Inferior (Bottom Navigation)
   - Widget Flotante de Identidad y Sesión (Esquina Superior Izquierda)
   - Buscador Flotante y Expansivo con dropdown anti-teclado (Esquina Superior Derecha)
   - Gesto Swipe-Down para cierre suave de Bottom Sheet
   - Aceleración por hardware a 60 FPS estables
   ========================================================================= */

import { state, esRolAdmin, separarArquitectos, normalizarCategoria, normalizarImportancia, nombreCategoria, CATEGORY_COLORS, escapeHtml } from './state.js';
import { fetchBuildings } from './api.js';
import { actualizarFuenteMapa } from './mapData.js';
import { renderExploreList } from './exploreUI.js';
import { renderRadarUI } from './radarUI.js';
import { activarFiltroBusquedaEnMapa } from './searchUI.js';
import { localizarDispositivo } from './mapController.js';

export function initMobileBottomNav() {
  const bottomBar = document.getElementById('mobile-bottom-bar');
  const panelBackdrop = document.getElementById('panel-backdrop');

  // 5 Pestañas Inferiores
  const btnMap = document.getElementById('mobile-nav-map');
  const btnExplore = document.getElementById('mobile-nav-explore');
  const btnRadar = document.getElementById('mobile-nav-radar');
  const btnPlaces = document.getElementById('mobile-nav-places');
  const btnProfile = document.getElementById('mobile-nav-profile');

  // Controles Flotantes Derechos
  const btnFloatAdd = document.getElementById('btn-float-add');
  const btnFloatLayers = document.getElementById('btn-float-layers');
  const btnFloatFilters = document.getElementById('btn-float-filters');
  const btnFloatLocate = document.getElementById('btn-float-locate');

  const explorePanel = document.getElementById('explore-panel');
  const radarPanel = document.getElementById('radar-panel');
  const searchPanel = document.getElementById('search-panel');
  const filterPanel = document.getElementById('filter-panel');
  const myPlacesPanel = document.getElementById('my-places-panel');
  const mapStylePanel = document.getElementById('map-style-panel');
  const adminPanel = document.getElementById('admin-panel');
  const sheet = document.getElementById('sheet');

  const allPanels = [explorePanel, radarPanel, searchPanel, filterPanel, myPlacesPanel, mapStylePanel, adminPanel, sheet].filter(Boolean);

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function syncNavButtons() {
    if (!isMobile()) return;

    const isExploreOpen = Boolean(explorePanel?.classList.contains('open'));
    const isRadarOpen = Boolean(radarPanel?.classList.contains('open'));
    const isPlacesOpen = Boolean(myPlacesPanel?.classList.contains('open'));
    const isSearchOpen = Boolean(searchPanel?.classList.contains('open'));
    const isFilterOpen = Boolean(filterPanel?.classList.contains('open'));
    const isLayersOpen = Boolean(mapStylePanel?.classList.contains('open'));
    const isSheetOpen = Boolean(sheet?.classList.contains('open'));
    const isAnyPanelOpen = isExploreOpen || isRadarOpen || isPlacesOpen || isSearchOpen || isFilterOpen || isLayersOpen || isSheetOpen;

    btnMap?.classList.toggle('active', !isAnyPanelOpen);
    btnExplore?.classList.toggle('active', isExploreOpen);
    btnRadar?.classList.toggle('active', isRadarOpen);
    btnPlaces?.classList.toggle('active', isPlacesOpen);

    // Controles Flotantes
    btnFloatLayers?.classList.toggle('active-state', isLayersOpen);
    btnFloatFilters?.classList.toggle('active-state', isFilterOpen);
    document.getElementById('btn-explore-float')?.classList.toggle('active-state', isExploreOpen);
    document.getElementById('btn-radar-float')?.classList.toggle('active-state', isRadarOpen);

    if (panelBackdrop) {
      panelBackdrop.classList.toggle('active', isAnyPanelOpen);
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

  // 1. [ MAPA ] - Vista principal: Cierra paneles y vuelve al mapa
  if (btnMap) {
    btnMap.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAllPanels();
      if (panelBackdrop) panelBackdrop.classList.remove('active');
      syncNavButtons();
    });
  }

  // 2. [ EXPLORA ] - Feed vertical / proximidad de obras cercanas
  if (btnExplore) {
    btnExplore.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(explorePanel);
      if (explorePanel?.classList.contains('open')) {
        renderExploreList();
      }
    });
  }

  // 3. [ MI RADAR ] - Botón central destacado para radar en vivo y rutas
  if (btnRadar) {
    btnRadar.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(radarPanel);
      if (radarPanel?.classList.contains('open')) {
        renderRadarUI();
      }
    });
  }

  // 4. [ LISTAS ] - Colecciones personales, favoritos y notas
  if (btnPlaces) {
    btnPlaces.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(myPlacesPanel);
      const colTab = myPlacesPanel?.querySelector('[data-place-tab="collections"]');
      if (colTab) colTab.click();
    });
  }

  // 5. Controles Flotantes Derechos (Añadir, Capas, Filtros, Ubicación)
  if (btnFloatAdd) {
    btnFloatAdd.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const addProjectBtn = document.getElementById('btn-add-project');
      if (addProjectBtn) {
        addProjectBtn.click();
      } else {
        const modalAdd = document.getElementById('modal-add-building');
        if (modalAdd) modalAdd.classList.add('open');
      }
    });
  }

  if (btnFloatLayers) {
    btnFloatLayers.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(mapStylePanel);
    });
  }

  if (btnFloatFilters) {
    btnFloatFilters.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(filterPanel);
    });
  }

  if (btnFloatLocate) {
    btnFloatLocate.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      localizarDispositivo();
    });
  }

  const btnExploreFloat = document.getElementById('btn-explore-float');
  if (btnExploreFloat) {
    btnExploreFloat.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(explorePanel);
      if (explorePanel?.classList.contains('open')) {
        renderExploreList();
      }
    });
  }

  const btnRadarFloat = document.getElementById('btn-radar-float');
  if (btnRadarFloat) {
    btnRadarFloat.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(radarPanel);
      if (radarPanel?.classList.contains('open')) {
        renderRadarUI();
      }
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
  initMobileSplashScreen();

  if (window.lucide) window.lucide.createIcons();
}

/* =========================================================================
   PANTALLA DE CARGA MÓVIL / SPLASH SCREEN (NEO-BAUHAUS)
   ========================================================================= */
function initMobileSplashScreen() {
  const splash = document.getElementById('mobile-splash-screen');
  const status = document.getElementById('mobile-splash-status');
  if (!splash) return;

  try {
    if (sessionStorage.getItem('nolli_splash_shown')) {
      splash.style.display = 'none';
      splash.classList.add('splash-hidden');
      return;
    }
  } catch (e) {}

  let dismissed = false;

  const dismissSplash = () => {
    if (dismissed) return;
    dismissed = true;
    try {
      sessionStorage.setItem('nolli_splash_shown', 'true');
    } catch (e) {}

    if (status) status.textContent = '[ DATOS SINCRONIZADOS ]';

    setTimeout(() => {
      splash.classList.add('splash-hidden');
      setTimeout(() => {
        splash.style.display = 'none';
      }, 450);
    }, 280);
  };

  // Desvanecimiento suave tan pronto como los primeros datos del mapa estén listos
  document.addEventListener('radar:data-ready', dismissSplash, { once: true });

  // Timeout de seguridad máximo (2.5s)
  setTimeout(dismissSplash, 2500);

  // Permitir cierre al toque si el usuario pulsa
  splash.addEventListener('click', dismissSplash, { once: true });
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
    const p = state.userProfile || {};
    const f = (p.firstName || p.first_name || '').trim();
    const l = (p.lastName || p.last_name || '').trim();
    if (f || l) {
      const initF = f ? f.charAt(0).toUpperCase() : '';
      const initL = l ? l.charAt(0).toUpperCase() : '';
      return `${initF}${initL}` || 'N';
    }
    if (state.userEmail) {
      return state.userEmail.charAt(0).toUpperCase();
    }
    return 'N';
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
        document.getElementById('admin-project-list')?.classList.remove('admin-view-hidden');
        document.getElementById('admin-reports-view')?.classList.add('admin-view-hidden');
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
        document.getElementById('admin-project-list')?.classList.add('admin-view-hidden');
        document.getElementById('admin-reports-view')?.classList.remove('admin-view-hidden');
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
        ciudad: fila.place || fila.ciudad || null,
        place: fila.place || null,
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

  const btnSearch = document.getElementById('btn-search');

  function openSearch() {
    widget.classList.remove('collapsed');
    widget.classList.add('expanded');
    btnSearch?.classList.add('active-state');
    setTimeout(() => input.focus(), 100);
    cargarTodasObrasMobile();
  }

  function closeSearch() {
    widget.classList.remove('expanded');
    widget.classList.add('collapsed');
    input.value = '';
    btnSearch?.classList.remove('active-state');
    if (dropdown) dropdown.hidden = true;
    if (resultsContainer) resultsContainer.innerHTML = '';
  }

  btnToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    openSearch();
  });

  if (btnSearch) {
    btnSearch.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (widget.classList.contains('expanded')) {
        closeSearch();
      } else {
        openSearch();
      }
    });
  }

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
  let currentMobileMatches = [];

  input.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      const q = normalize(input.value.trim());
      if (!q || q.length < 2) {
        if (dropdown) dropdown.hidden = true;
        if (resultsContainer) resultsContainer.innerHTML = '';
        currentMobileMatches = [];
        return;
      }

      // Obtener todas las obras (base de datos completa + estado local)
      const todasLasObras = await cargarTodasObrasMobile();
      const catalogo = todasLasObras && todasLasObras.length ? todasLasObras : (state.OBRAS || []);

      const matches = catalogo
        .filter((obra) => {
          const name = normalize(obra.nombre_obra);
          const arq = normalize(Array.isArray(obra.arquitectos) ? obra.arquitectos.join(' ') : obra.arquitecto);
          const city = normalize(obra.ciudad || obra.place);
          const style = normalize(obra.estilo);
          const cat = normalize(obra.categoria);
          const tags = normalize(Array.isArray(obra.tags) ? obra.tags.join(' ') : obra.tags);
          return name.includes(q) || arq.includes(q) || city.includes(q) || style.includes(q) || cat.includes(q) || tags.includes(q);
        });

      currentMobileMatches = matches;

      if (!matches.length) {
        resultsContainer.innerHTML = `
          <div style="padding: 14px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--fg-dim); text-align: center;">
            [ SIN RESULTADOS EN LA BASE DE DATOS ]
          </div>
        `;
        dropdown.hidden = false;
        return;
      }

      const headerActionHtml = `
        <button type="button" class="mobile-search-filter-action" data-action="filter-all-matches">
          <i data-lucide="filter" width="13" height="13"></i>
          <span>[ VER TODAS LAS ${matches.length} OBRAS EN EL MAPA ]</span>
        </button>
      `;

      const listHtml = matches.slice(0, 25).map((obra) => {
        const catClave = normalizarCategoria(obra.categoria);
        const catTexto = nombreCategoria(obra.categoria);
        const catColor = CATEGORY_COLORS[catClave] || '#E84E1B';

        const titulo = escapeHtml(obra.nombre_obra || 'OBRA SIN TÍTULO').toUpperCase();
        const arq = escapeHtml(obra.arquitecto || 'Arquitecto no indicado');
        const anio = obra.año_construccion ? escapeHtml(String(obra.año_construccion)) : '';
        const ciudad = obra.ciudad || obra.place ? escapeHtml(String(obra.ciudad || obra.place).toUpperCase()) : '';

        const metaParts = [arq];
        if (anio) metaParts.push(anio);
        if (ciudad) metaParts.push(ciudad);

        return `
          <button type="button" class="mobile-search-item" data-obra-id="${escapeHtml(obra.id || obra.featureId)}" aria-label="Ver obra ${titulo}">
            <div class="mobile-search-item-main">
              <div class="mobile-search-item-top-row">
                <span class="mobile-search-cat-tag" style="color: ${catColor};">[ ${escapeHtml(catTexto)} ]</span>
              </div>
              <div class="mobile-search-item-title">${titulo}</div>
              <div class="mobile-search-item-sub">
                <span class="mobile-search-meta-text">${metaParts.join(' · ')}</span>
              </div>
            </div>
          </button>
        `;
      }).join('');

      resultsContainer.innerHTML = headerActionHtml + listHtml;
      if (window.lucide) window.lucide.createIcons();
      dropdown.hidden = false;
    }, 120);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = input.value.trim();
      if (q) {
        const matchesToApply = currentMobileMatches && currentMobileMatches.length ? currentMobileMatches : null;
        closeSearch();
        activarFiltroBusquedaEnMapa(q, matchesToApply);
      }
    }
  });

  resultsContainer?.addEventListener('click', async (e) => {
    const filterBtn = e.target.closest('[data-action="filter-all-matches"]');
    if (filterBtn) {
      e.stopPropagation();
      const q = input.value.trim();
      const matchesToApply = currentMobileMatches && currentMobileMatches.length ? currentMobileMatches : null;
      closeSearch();
      activarFiltroBusquedaEnMapa(q, matchesToApply);
      return;
    }

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
    if (widget.classList.contains('expanded') && !widget.contains(e.target) && !e.target.closest('#btn-search')) {
      closeSearch();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && widget.classList.contains('expanded')) {
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

  // Gesto táctil para ficha de arquitecto
  const architectModal = document.getElementById('modal-architect');
  const architectDragHandle = document.getElementById('architect-drag-handle');
  const architectHeader = architectModal?.querySelector('.modal-head');
  const architectBox = architectModal?.querySelector('.architect-profile-box');

  if (architectModal && architectBox) {
    let archStartY = 0;
    let archCurrentY = 0;
    let archDragging = false;

    function onArchTouchStart(e) {
      if (window.innerWidth > 768) return;
      const touch = e.touches ? e.touches[0] : e;
      archStartY = touch.clientY;
      archCurrentY = archStartY;
      archDragging = true;
      architectBox.style.transition = 'none';
    }

    function onArchTouchMove(e) {
      if (!archDragging || window.innerWidth > 768) return;
      const touch = e.touches ? e.touches[0] : e;
      archCurrentY = touch.clientY;
      const deltaY = archCurrentY - archStartY;
      if (deltaY > 0) {
        architectBox.style.transform = `translateY(${deltaY}px) translate3d(0, 0, 0)`;
      }
    }

    function onArchTouchEnd() {
      if (!archDragging || window.innerWidth > 768) return;
      archDragging = false;
      architectBox.style.transition = '';
      const deltaY = archCurrentY - archStartY;
      architectBox.style.transform = '';

      if (deltaY > 75) {
        architectModal.classList.remove('open');
      }
    }

    [architectDragHandle, architectHeader].filter(Boolean).forEach((el) => {
      el.addEventListener('touchstart', onArchTouchStart, { passive: true });
      el.addEventListener('touchmove', onArchTouchMove, { passive: true });
      el.addEventListener('touchend', onArchTouchEnd, { passive: true });
    });
  }
}
