/* =========================================================================
   MOBILEBOTTOMNAV.JS — Controlador de Navegación, Identidad, Búsqueda y Gestos (<= 768px)
   - Barra de Navegación Inferior (Bottom Navigation)
   - Widget Flotante de Identidad y Sesión (Esquina Superior Izquierda)
   - Buscador Flotante y Expansivo con dropdown anti-teclado (Esquina Superior Derecha)
   - Gesto Swipe-Down para cierre suave de Bottom Sheet
   - Aceleración por hardware a 60 FPS estables
   ========================================================================= */

import { state, esRolAdmin, separarArquitectos, normalizarCategoria, normalizarImportancia, formatCategoria, CATEGORY_COLORS, CATEGORY_META, escapeHtml } from './state.js';
import { getBuildingsCatalog } from './api.js';
import { actualizarFuenteMapa } from './mapData.js';
import { activarFiltroBusquedaEnMapa } from './searchUI.js';
import { localizarDispositivo } from './mapController.js';
import { t } from './i18n.js';
import { renderObraCard } from './workCard.js';

export function initMobileBottomNav() {
  const bottomBar = document.getElementById('mobile-bottom-bar');
  const panelBackdrop = document.getElementById('panel-backdrop');

  // 5 Pestañas Inferiores
  const btnMap = document.getElementById('mobile-nav-map');
  const btnExplore = document.getElementById('mobile-nav-explore');
  const btnRadar = document.getElementById('mobile-nav-radar');
  const btnPlaces = document.getElementById('mobile-nav-places');
  const btnProfile = document.getElementById('mobile-nav-profile');

  // Controles Flotantes Derechos — Speed-Dial FAB Consolidado
  const mobileMapControls = document.getElementById('mobile-map-controls');
  const fabToggle = document.getElementById('btn-mobile-fab-toggle');
  const fabMenu = document.getElementById('mobile-fab-menu');
  const fabBackdrop = document.getElementById('mobile-fab-backdrop');
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

  let syncRafPending = false;
  function syncNavButtons() {
    if (!isMobile()) return;
    if (syncRafPending) return;
    syncRafPending = true;

    requestAnimationFrame(() => {
      syncRafPending = false;

      const isExploreOpen = Boolean(explorePanel?.classList.contains('open'));
      const isRadarOpen = Boolean(radarPanel?.classList.contains('open'));
      const isPlacesOpen = Boolean(myPlacesPanel?.classList.contains('open'));
      const isSearchOpen = Boolean(searchPanel?.classList.contains('open'));
      const isFilterOpen = Boolean(filterPanel?.classList.contains('open'));
      const isLayersOpen = Boolean(mapStylePanel?.classList.contains('open'));
      const isAdminOpen = Boolean(adminPanel?.classList.contains('open'));
      const isSheetOpen = Boolean(sheet?.classList.contains('open'));
      const isAnyPanelOpen = isExploreOpen || isRadarOpen || isPlacesOpen || isSearchOpen || isFilterOpen || isLayersOpen || isAdminOpen || isSheetOpen;

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
    });
  }

  function closeSpeedDial() {
    if (mobileMapControls?.classList.contains('speed-dial-open')) {
      mobileMapControls.classList.remove('speed-dial-open');
      fabToggle?.setAttribute('aria-expanded', 'false');
      fabMenu?.setAttribute('aria-hidden', 'true');
    }
  }

  function toggleSpeedDial() {
    const willOpen = !mobileMapControls?.classList.contains('speed-dial-open');
    if (willOpen) {
      closeAllPanels();
      mobileMapControls?.classList.add('speed-dial-open');
      fabToggle?.setAttribute('aria-expanded', 'true');
      fabMenu?.setAttribute('aria-hidden', 'false');
    } else {
      closeSpeedDial();
    }
  }

  function closeAllPanels(except = null) {
    closeSpeedDial();
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

  async function cargarPanel(nombreModulo, nombreExportInit, targetPanel) {
    if (window.nolliPanelModules?.has(nombreModulo)) {
      return window.nolliPanelModules.get(nombreModulo);
    }
    const loading = document.createElement('div');
    loading.className = 'panel-loading-status';
    loading.textContent = 'CARGANDO PANEL...';
    targetPanel?.prepend(loading);
    targetPanel?.setAttribute('aria-busy', 'true');
    try {
      await window.nolliCargarPanelBajoDemanda(nombreModulo, nombreExportInit);
      return window.nolliPanelModules.get(nombreModulo);
    } finally {
      loading.remove();
      targetPanel?.removeAttribute('aria-busy');
    }
  }

  // 1. [ MAPA ] - Vista principal: Cierra paneles y vuelve al mapa
  if (btnMap) {
    btnMap.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.nolliPanelModules.get('radarUI')?.restaurarMapaGeneral?.();
      closeAllPanels();
      if (panelBackdrop) panelBackdrop.classList.remove('active');
      syncNavButtons();
    });
  }

  // 2. EXPLORA - Feed de itinerarios y colecciones públicas (Exclusivo usuarios registrados)
  if (btnExplore) {
    btnExplore.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!state.sessionToken) {
        const loginModal = document.getElementById('modal-login');
        if (loginModal) {
          loginModal.classList.add('open');
          const title = document.getElementById('modal-login-title');
          if (title) title.textContent = 'ACCESO A EXPLORA // REGISTRO REQUERIDO';
        }
        return;
      }

      toggleMobilePanel(explorePanel);
      if (explorePanel?.classList.contains('open')) {
        const modulo = await cargarPanel('exploreUI', 'initExploreUI', explorePanel);
        if (explorePanel?.classList.contains('open')) modulo?.renderExploreList();
      }
    });
  }

  // 3. [ MI RADAR ] - Botón central destacado para radar en vivo y rutas
  if (btnRadar) {
    btnRadar.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(radarPanel);
      if (radarPanel?.classList.contains('open')) {
        const modulo = await cargarPanel('radarUI', 'initRadarUI', radarPanel);
        if (radarPanel?.classList.contains('open')) modulo?.renderRadarUI();
      }
    });
  }

  // 4. [ LISTAS ] - Colecciones personales, favoritos y notas
  if (btnPlaces) {
    btnPlaces.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(myPlacesPanel);
      await cargarPanel('myPlacesUI', 'initMyPlacesUI', myPlacesPanel);
      if (!myPlacesPanel?.classList.contains('open')) return;
      const colTab = myPlacesPanel?.querySelector('[data-place-tab="collections"]');
      if (colTab) colTab.click();
    });
  }

  // 5. Controles Flotantes Derechos — Speed-Dial FAB Consolidado
  if (fabToggle) {
    fabToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSpeedDial();
    });
  }

  if (fabBackdrop) {
    fabBackdrop.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeSpeedDial();
    });
  }

  // Cerrar al pulsar fuera en el mapa o pantalla
  document.addEventListener('click', (e) => {
    if (mobileMapControls?.classList.contains('speed-dial-open')) {
      if (!mobileMapControls.contains(e.target)) {
        closeSpeedDial();
      }
    }
  });

  // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSpeedDial();
    }
  });

  if (btnFloatAdd) {
    btnFloatAdd.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeSpeedDial();
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
      closeSpeedDial();
      toggleMobilePanel(mapStylePanel);
    });
  }

  if (btnFloatFilters) {
    btnFloatFilters.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeSpeedDial();
      toggleMobilePanel(filterPanel);
    });
  }

  if (btnFloatLocate) {
    btnFloatLocate.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeSpeedDial();
      localizarDispositivo();
    });
  }

  const btnExploreFloat = document.getElementById('btn-explore-float');
  if (btnExploreFloat) {
    btnExploreFloat.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!state.sessionToken) {
        const loginModal = document.getElementById('modal-login');
        if (loginModal) {
          loginModal.classList.add('open');
          const title = document.getElementById('modal-login-title');
          if (title) title.textContent = t('auth_explore_required');
        }
        return;
      }

      toggleMobilePanel(explorePanel);
      if (explorePanel?.classList.contains('open')) {
        const modulo = await cargarPanel('exploreUI', 'initExploreUI', explorePanel);
        if (explorePanel?.classList.contains('open')) modulo?.renderExploreList();
      }
    });
  }

  const btnRadarFloat = document.getElementById('btn-radar-float');
  if (btnRadarFloat) {
    btnRadarFloat.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(radarPanel);
      if (radarPanel?.classList.contains('open')) {
        const modulo = await cargarPanel('radarUI', 'initRadarUI', radarPanel);
        if (radarPanel?.classList.contains('open')) modulo?.renderRadarUI();
      }
    });
  }

  // Cierre táctil al tocar fuera (Backdrop)
  if (panelBackdrop) {
    panelBackdrop.addEventListener('click', () => {
      closeAllPanels();
      if (panelBackdrop) panelBackdrop.classList.remove('active');
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
  initMobileIdentityWidget(toggleMobilePanel);
  initMobileSearchWidget();
  initSheetTouchGestures();
  initMobileSplashScreen();

  // Manejo de navegación hash inicial (#explore, #radar, #places) desde perfil u otros enlaces
  const handleHashRoute = () => {
    if (!isMobile()) return;
    const hash = window.location.hash;
    if (hash === '#explore') {
      setTimeout(() => btnExplore?.click(), 150);
    } else if (hash === '#radar') {
      setTimeout(() => btnRadar?.click(), 150);
    } else if (hash === '#places') {
      setTimeout(() => btnPlaces?.click(), 150);
    }
  };

  handleHashRoute();
  window.addEventListener('hashchange', handleHashRoute);

  window.lucide?.createIcons({ context: document.querySelector('main') });
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

    if (status) status.textContent = 'DATOS SINCRONIZADOS';

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
function initMobileIdentityWidget(toggleMobilePanel) {
  const badge = document.getElementById('mobile-identity-badge');
  const actionBtn = document.getElementById('btn-mobile-identity-action');
  const quickMenu = document.getElementById('mobile-admin-quickmenu');
  const btnQuickAdminPanel = document.getElementById('btn-mobile-quick-admin-panel');

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
    const isEditor = state.userRole === 'editor';

    actionBtn.classList.remove('guest', 'user-logged', 'admin-logged');

    if (!isLogged) {
      actionBtn.classList.add('guest');
      badge.textContent = t('nav_access');
      actionBtn.title = t('nav_login');
      if (quickMenu) quickMenu.hidden = true;
    } else if (isAdmin) {
      actionBtn.classList.add('admin-logged');
      badge.textContent = t('nav_admin');
      actionBtn.title = t('nav_admin');
    } else if (isEditor) {
      actionBtn.classList.add('user-logged');
      badge.textContent = 'EDITOR';
      actionBtn.title = 'Editor';
      if (quickMenu) quickMenu.hidden = true;
    } else {
      actionBtn.classList.add('user-logged');
      const inits = computeInitials();
      badge.textContent = `${inits}`;
      actionBtn.title = t('topbar_profile');
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
      if (!quickMenu.hidden && window.lucide) {
        window.lucide.createIcons({ context: quickMenu });
      }
    } else {
      window.location.href = './perfil';
    }
  });

  if (btnQuickAdminPanel) {
    btnQuickAdminPanel.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (quickMenu) quickMenu.hidden = true;
      const adminPanel = document.getElementById('admin-panel');
      if (adminPanel) {
        if (toggleMobilePanel) {
          toggleMobilePanel(adminPanel);
        } else {
          adminPanel.classList.toggle('open');
        }
        window.nolliCargarPanelBajoDemanda?.('adminUI', 'initAdminUI');
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (quickMenu && !quickMenu.hidden && !e.target.closest('#mobile-identity-widget')) {
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

document.addEventListener('radar:catalog-invalidated', () => {
  cacheObrasMobileSearch = null;
});

async function cargarTodasObrasMobile() {
  if (state.OBRAS && state.OBRAS.length > 0) {
    return state.OBRAS;
  }
  if (cacheObrasMobileSearch && cacheObrasMobileSearch.length > 0) {
    return cacheObrasMobileSearch;
  }
  if (mobileSearchPromise) return mobileSearchPromise;

  mobileSearchPromise = (async () => {
    try {
      const filas = await getBuildingsCatalog();
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
      console.warn('Error al precargar obras completas para buscador:', err);
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
      .toLowerCase()
      .trim();
  }

  let searchDebounce = null;
  let currentMobileMatches = [];

  input.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      const rawVal = input.value.trim();
      const q = normalize(rawVal);
      if (!q || q.length < 1) {
        if (dropdown) dropdown.hidden = true;
        if (resultsContainer) resultsContainer.innerHTML = '';
        currentMobileMatches = [];
        return;
      }

      // Obtener todas las obras (base de datos completa + estado local + obras privadas/recién añadidas)
      const todasLasObras = await cargarTodasObrasMobile();
      const mapaObras = new Map();
      (todasLasObras || []).forEach((o) => { if (o && o.id != null) mapaObras.set(String(o.id), o); });
      (state.OBRAS || []).forEach((o) => { if (o && o.id != null) mapaObras.set(String(o.id), o); });
      (state.privateBuildings || []).forEach((o) => { if (o && o.id != null) mapaObras.set(String(o.id), o); });
      const catalogo = Array.from(mapaObras.values());

      const tokens = q.split(/\s+/).filter(Boolean);

      const matches = catalogo.filter((obra) => {
        if (!obra._searchHaystack) {
          const name = normalize(obra.nombre_obra);
          const arq = normalize(Array.isArray(obra.arquitectos) ? obra.arquitectos.join(' ') : obra.arquitecto);
          const city = normalize(obra.ciudad || obra.place);
          const style = normalize(obra.estilo);
          const cat = normalize(obra.categoria);
          const tags = normalize(Array.isArray(obra.tags) ? obra.tags.join(' ') : obra.tags);
          const year = String(obra.año_construccion || '');
          obra._searchHaystack = `${name} ${arq} ${city} ${style} ${cat} ${tags} ${year}`;
        }
        return obra._searchHaystack.includes(q) || tokens.every((token) => obra._searchHaystack.includes(token));
      });

      currentMobileMatches = matches;

      if (!matches.length) {
        resultsContainer.innerHTML = `
          <div style="padding: 14px; font-family: 'Inter', sans-serif; font-size: 10px; color: var(--fg-dim); text-align: center;">${t('search_no_results_db')}</div>
        `;
        dropdown.hidden = false;
        return;
      }

      const headerActionHtml = `
        <button type="button" class="mobile-search-filter-action" data-action="filter-all-matches">
          <i data-lucide="filter" width="13" height="13"></i>
          <span>${t('search_filter_all_matches', { count: matches.length })}</span>
        </button>
      `;

      const listHtml = matches.slice(0, 40).map((obra) => renderObraCard(obra, {
        variant: 'mobile-search',
        className: 'mobile-search-item',
        featureId: obra.id || obra.featureId,
        tag: 'article'
      })).join('');

      resultsContainer.innerHTML = headerActionHtml + listHtml;
      if (window.lucide) window.lucide.createIcons({ context: resultsContainer });
      dropdown.hidden = false;
    }, 90);
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
    if (widget.classList.contains('expanded') && !widget.contains(e.target)) {
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
   CONTROLADOR UNIVERSAL DE GESTOS TÁCTILES A 60 FPS (BOTTOM SHEETS MÓVILES)
   - Coalescencia con requestAnimationFrame para sincronizar a 60/120Hz
   - Variable CSS --sheet-drag-y para evitar layout thrashing
   - Física de inercia: cálculo de velocidad (px/ms) para gestos rápidos de 'flick'
   - Transición de salida suave continua sin saltos visuales a 0px
   ========================================================================= */
function initSheetTouchGestures() {
  const panelBackdrop = document.getElementById('panel-backdrop');

  const panelsConfig = [
    {
      panel: document.getElementById('sheet'),
      handles: ['#sheet-drag-handle', '.sheet-header'],
      onDismiss: () => {
        document.dispatchEvent(new CustomEvent('radar:cerrar-ficha'));
        import('./sheetUI.js').then(({ cerrarFicha }) => cerrarFicha?.());
      }
    },
    {
      panel: document.getElementById('explore-panel'),
      handles: ['#explore-drag-handle', '.sheet-header'],
      onDismiss: null
    },
    {
      panel: document.getElementById('radar-panel'),
      handles: ['#radar-drag-handle', '.sheet-header'],
      onDismiss: null
    },
    {
      panel: document.getElementById('my-places-panel'),
      handles: ['.sheet-drag-handle', '.filter-head'],
      onDismiss: null
    },
    {
      panel: document.getElementById('filter-panel'),
      handles: ['.sheet-drag-handle', '.filter-head'],
      onDismiss: null
    },
    {
      panel: document.getElementById('map-style-panel'),
      handles: ['.sheet-drag-handle', '.filter-head'],
      onDismiss: null
    },
    {
      panel: document.getElementById('admin-panel'),
      handles: ['.sheet-drag-handle', '.filter-head'],
      onDismiss: null
    },
    {
      panel: document.querySelector('#modal-architect .architect-profile-box'),
      parentModal: document.getElementById('modal-architect'),
      handles: ['#architect-drag-handle', '.modal-head'],
      onDismiss: () => {
        document.getElementById('modal-architect')?.classList.remove('open');
      }
    }
  ];

  panelsConfig.forEach(({ panel, parentModal, handles, onDismiss }) => {
    if (!panel) return;

    let startY = 0;
    let currentY = 0;
    let lastY = 0;
    let startTime = 0;
    let lastTime = 0;
    let velocityY = 0;
    let isDragging = false;
    let rafPending = false;

    function onTouchStart(e) {
      if (window.innerWidth > 768) return;
      const targetPanel = parentModal || panel;
      if (!targetPanel.classList.contains('open')) return;

      const touch = e.touches ? e.touches[0] : e;
      startY = touch.clientY;
      currentY = startY;
      lastY = startY;
      startTime = performance.now();
      lastTime = startTime;
      velocityY = 0;
      isDragging = true;

      panel.style.transition = 'none';
      panel.style.willChange = 'transform';
    }

    function onTouchMove(e) {
      if (!isDragging || window.innerWidth > 768) return;
      const touch = e.touches ? e.touches[0] : e;
      currentY = touch.clientY;
      const now = performance.now();
      const dt = now - lastTime;
      if (dt > 16) {
        velocityY = (currentY - lastY) / dt;
        lastY = currentY;
        lastTime = now;
      }

      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          if (isDragging) {
            const deltaY = currentY - startY;
            const visualDelta = deltaY > 0 ? deltaY : deltaY * 0.2;
            panel.style.setProperty('--sheet-drag-y', `${visualDelta}px`);
          }
          rafPending = false;
        });
      }
    }

    function onTouchEnd() {
      if (!isDragging || window.innerWidth > 768) return;
      isDragging = false;
      const deltaY = currentY - startY;
      const targetPanel = parentModal || panel;

      // Criterio de despido: arrastre > 65px O flick rápido hacia abajo (velocidad > 0.45 px/ms y desplazamiento > 20px)
      const shouldDismiss = deltaY > 65 || (velocityY > 0.45 && deltaY > 20);

      if (shouldDismiss) {
        // Animación de salida fluida hacia abajo a 60 FPS
        panel.style.transition = 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)';
        panel.style.setProperty('--sheet-drag-y', '100%');
        if (panelBackdrop && !parentModal) panelBackdrop.classList.remove('active');

        setTimeout(() => {
          targetPanel.classList.remove('open');
          panel.style.transition = '';
          panel.style.willChange = '';
          panel.style.removeProperty('--sheet-drag-y');
          if (typeof onDismiss === 'function') {
            onDismiss();
          }
          const syncFn = () => {
            const btnMap = document.getElementById('mobile-nav-map');
            const btnExplore = document.getElementById('mobile-nav-explore');
            const btnRadar = document.getElementById('mobile-nav-radar');
            const btnPlaces = document.getElementById('mobile-nav-places');
            const hasOpen = Boolean(document.querySelector('.sheet.open, .filter-panel.open, .search-panel.open, .my-places-panel.open, .map-style-panel.open, .admin-panel.open, .explore-panel.open, .radar-panel.open'));
            btnMap?.classList.toggle('active', !hasOpen);
            btnExplore?.classList.toggle('active', Boolean(document.getElementById('explore-panel')?.classList.contains('open')));
            btnRadar?.classList.toggle('active', Boolean(document.getElementById('radar-panel')?.classList.contains('open')));
            btnPlaces?.classList.toggle('active', Boolean(document.getElementById('my-places-panel')?.classList.contains('open')));
            if (panelBackdrop) panelBackdrop.classList.toggle('active', hasOpen);
          };
          syncFn();
        }, 220);
      } else {
        // Regreso amortiguado a la posición inicial si no se alcanzó el umbral
        panel.style.transition = 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
        panel.style.setProperty('--sheet-drag-y', '0px');

        setTimeout(() => {
          panel.style.transition = '';
          panel.style.willChange = '';
          panel.style.removeProperty('--sheet-drag-y');
        }, 200);
      }
    }

    // Registrar listeners táctiles en los tiradores y cabeceras
    handles.forEach((selector) => {
      const el = panel.querySelector(selector) || document.querySelector(selector);
      if (el) {
        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: true });
        el.addEventListener('touchend', onTouchEnd, { passive: true });
        el.addEventListener('touchcancel', onTouchEnd, { passive: true });
      }
    });
  });
}
