/* =========================================================================
   MAIN.JS — Punto de entrada de la aplicación
   Descarga los edificios, prepara filtros y arranca el mapa. Se carga como
   <script type="module"> por lo que se ejecuta en modo defer de forma nativa.
   ========================================================================= */

import { state, separarArquitectos, normalizarCategoria, normalizarImportancia, esRolAdmin, transformarEdificio, dedupeBuildings } from './state.js';
import { fetchBuildings, fetchBuildingFacets, fetchUserPendingBuildings, fetchPendingBuildings, fetchPrivateBuildings, fetchAllPrivateBuildings, getBuildingsCatalog, invalidateCatalogCache } from './api.js';
import { actualizarFuenteMapa } from './mapData.js';
import { generarFiltrosUI } from './filtersUI.js';
import { cargarMapaMapbox } from './mapController.js';
import { initModalsUI } from './modalsUI.js';
import { initSearchUI, abrirBusquedaConQuery } from './searchUI.js';
import { initMobileBottomNav } from './mobileBottomNav.js';
import { getViewportKey } from './renderUtils.js';

import { abrirFicha } from './sheetUI.js';

let publicLoadRequest = 0;
let publicLoadTimer = null;
let publicLoadController = null;
let urlObraChecked = false;
let lastViewportKey = null;
const panelModules = new Map();
const panelInitializations = new Map();

async function cargarPanelBajoDemanda(nombreModulo, nombreExportInit, ...args) {
  if (!panelInitializations.has(nombreModulo)) {
    panelInitializations.set(nombreModulo, (async () => {
      const modulo = await import(`./${nombreModulo}.js`);
      panelModules.set(nombreModulo, modulo);
      return modulo[nombreExportInit](...args);
    })());
  }
  return panelInitializations.get(nombreModulo);
}

window.nolliCargarPanelBajoDemanda = cargarPanelBajoDemanda;
window.nolliPanelModules = panelModules;

async function cargarEdificiosVisibles() {
  const requestId = ++publicLoadRequest;
  publicLoadController?.abort();
  publicLoadController = new AbortController();
  try {
    const arquitectosAnteriores = new Set(state.ARQUITECTOS);
    const arquitectosActivosAnteriores = new Set(state.activeArquitectos);
    const habiaFiltroDeArquitectos = arquitectosAnteriores.size > 0
      && arquitectosActivosAnteriores.size < arquitectosAnteriores.size;
    const architect = habiaFiltroDeArquitectos && arquitectosActivosAnteriores.size === 1
      ? [...arquitectosActivosAnteriores][0]
      : null;
    
    // CRÍTICO FIX #2: Dedupe viewport para evitar múltiples fetchBuildings por move event
    const currentViewportKey = getViewportKey(
      state.map?.getBounds(),
      state.map?.getZoom(),
      state.activeCategorias
    );
    
    if (lastViewportKey === currentViewportKey && state.OBRAS.length > 0) {
      return; // Mismo viewport → no recargar
    }
    lastViewportKey = currentViewportKey;
    
    const [datosDB, catalogo] = await Promise.all([
      fetchBuildings({
        bounds: architect ? null : state.map?.getBounds(),
        zoom: state.map?.getZoom(),
        architect,
        signal: publicLoadController.signal,
      }),
      state.BUILDING_CATALOG.length ? Promise.resolve(state.BUILDING_CATALOG) : getBuildingsCatalog(), // CRÍTICO FIX #1: Use cache
    ]);
    const rawDatosDB = Array.isArray(datosDB) ? datosDB : [];
    const rawCatalogo = Array.isArray(catalogo) ? catalogo : [];
    state.BUILDING_CATALOG = rawCatalogo.map((fila) => ({ ...fila, categoria: normalizarCategoria(fila.categoria) }));
    state.ARQUITECTOS = [...new Set(state.BUILDING_CATALOG.flatMap((fila) => separarArquitectos(fila.arquitecto)))];
    const mapaObras = new Map(state.OBRAS.map((obra) => [String(obra.id), obra]));
    rawDatosDB.forEach((fila, index) => {
      const idStr = String(fila.id);
      const anterior = mapaObras.get(idStr);
      const edificio = transformarEdificio(fila, index);
      mapaObras.set(idStr, {
        ...edificio,
        selected: anterior ? anterior.selected : false,
      });
    });
    const datosPrivados = state.OBRAS.filter((obra) => obra.private || obra.estado_revision === 'pendiente');
    datosPrivados.forEach((obra) => mapaObras.set(String(obra.id), obra));
    state.OBRAS = dedupeBuildings(Array.from(mapaObras.values()));

    state.activeArquitectos = habiaFiltroDeArquitectos
      ? new Set([...arquitectosActivosAnteriores].filter((arquitecto) => state.ARQUITECTOS.includes(arquitecto)))
      : new Set(state.ARQUITECTOS);
    document.dispatchEvent(new CustomEvent('radar:data-ready'));
    generarFiltrosUI();
    actualizarFuenteMapa();
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'CanceledError' || String(error.message || '').toLowerCase().includes('abort') || publicLoadController?.signal?.aborted) {
      return;
    }
    if (requestId !== publicLoadRequest) return;
    console.warn('Aviso de sincronización de edificios en segundo plano:', error);
  }
}

function programarCargaEdificiosVisibles() {
  clearTimeout(publicLoadTimer);
  publicLoadTimer = setTimeout(cargarEdificiosVisibles, 180);
}

function extraerObraIdDeURL() {
  const match = window.location.pathname.match(/\/obra\/([^\/\?#]+)/i);
  if (match && match[1]) {
    return decodeURIComponent(match[1]);
  }
  const params = new URLSearchParams(window.location.search);
  const paramId = params.get('obra');
  if (paramId) {
    return decodeURIComponent(paramId);
  }
  return null;
}

async function cargarYMostrarObra(obraId) {
  if (!obraId) return;

  let obra = state.OBRAS.find((item) => String(item.id) === String(obraId) || String(item.featureId) === String(obraId));
  if (!obra) {
    try {
      const catalog = await getBuildingsCatalog();
      const found = catalog.find((item) => String(item.id) === String(obraId));
      if (found) {
        obra = transformarEdificio(found, state.OBRAS.length);
        state.OBRAS.push(obra);
        actualizarFuenteMapa();
      }
    } catch (e) {
      console.warn('No se pudo cargar la obra desde la URL:', e);
    }
  }

  if (obra && state.map) {
    state.map.flyTo({ center: obra.coordenadas, zoom: Math.max(state.map.getZoom(), 15) });
    abrirFicha(obra, obra.coordenadas, obra.featureId || obra.id, true);
  }
}

function extraerQueryBusquedaURL() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q');
  return q ? decodeURIComponent(q).trim() : null;
}

async function verificarParametrosURL() {
  if (urlObraChecked) return;
  urlObraChecked = true;
  const obraId = extraerObraIdDeURL();
  if (obraId) {
    await cargarYMostrarObra(obraId);
    return;
  }
  const searchQuery = extraerQueryBusquedaURL();
  if (searchQuery) {
    abrirBusquedaConQuery(searchQuery);
  }
}

window.addEventListener('popstate', (e) => {
  const obraId = extraerObraIdDeURL();
  if (obraId) {
    cargarYMostrarObra(obraId);
  } else {
    import('./sheetUI.js').then(({ cerrarFicha }) => cerrarFicha());
  }
});

async function esperarMapbox() {
  if (window.mapboxgl) return window.mapboxgl;

  // 1. Inyectar hoja de estilos de Mapbox sin bloquear renderizado
  if (!document.getElementById('mapbox-gl-css')) {
    const link = document.createElement('link');
    link.id = 'mapbox-gl-css';
    link.rel = 'stylesheet';
    link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css';
    document.head.appendChild(link);
  }

  // 2. Inyectar script de Mapbox GL JS de forma asíncrona
  return new Promise((resolve, reject) => {
    let script = document.getElementById('mapbox-gl-js');
    if (!script) {
      script = document.createElement('script');
      script.id = 'mapbox-gl-js';
      script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js';
      script.async = true;
      document.head.appendChild(script);
    }
    if (window.mapboxgl) return resolve(window.mapboxgl);
    script.addEventListener('load', () => resolve(window.mapboxgl), { once: true });
    script.addEventListener('error', () => reject(new Error('No se pudo cargar Mapbox.')), { once: true });
  });
}

async function inicializarRadar() {
  try {
    await esperarMapbox();
    cargarMapaMapbox();

    let mapReadyTriggered = false;
    const onMapReady = async () => {
      if (mapReadyTriggered) return;
      mapReadyTriggered = true;
      await cargarEdificiosVisibles();
      verificarParametrosURL();
    };

    document.addEventListener('radar:map-ready', onMapReady, { once: true });
    if (state.map?.loaded?.() || state.map?.isStyleLoaded?.()) {
      onMapReady();
    } else {
      state.map?.once('load', onMapReady);
      state.map?.once('style.load', onMapReady);
    }
    
    // El mapa se renderiza por WebGL a 60 FPS con los datos en memoria;
    // no se recalcula en moveend para evitar pausas y congelamientos.
    document.addEventListener('radar:filters-changed', () => {
      actualizarFuenteMapa();
    });

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#btn-close-itinerary, .itinerary-badge-close');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        restaurarMapaGeneral();
      }
    });
  } catch (error) {
    console.warn('Aviso de inicialización del mapa:', error);
  }
}

export function restaurarMapaGeneral() {
  state.activeItinerary = null;
  const itineraryBadge = document.getElementById('itinerary-filter-badge');
  if (itineraryBadge) {
    itineraryBadge.classList.add('hidden');
  }

  // Limpiar campo de búsqueda y cerrar dropdown
  const searchInput = document.getElementById('mobile-search-input');
  if (searchInput) searchInput.value = '';
  const searchDropdown = document.getElementById('mobile-search-dropdown');
  if (searchDropdown) {
    searchDropdown.hidden = true;
    searchDropdown.style.display = 'none';
  }
  const searchResults = document.getElementById('mobile-search-results');
  if (searchResults) searchResults.innerHTML = '';
  const searchWidget = document.getElementById('mobile-search-widget');
  if (searchWidget) {
    searchWidget.classList.remove('expanded');
    searchWidget.classList.add('collapsed');
  }

  // Limpiar parámetros de URL ?q= o #list=
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('q')) {
      url.searchParams.delete('q');
      window.history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') + url.hash);
    }
    if (window.location.hash.startsWith('#list=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  } catch (e) {}

  actualizarFuenteMapa();
  lastViewportKey = null; // Invalida cache para recargar edificios normales
  programarCargaEdificiosVisibles();
}

async function cargarContenidoPrivado() {
  if (!state.userId || !state.sessionToken) return;
  const isSuperadmin = state.userRole === 'superadmin';
  const [pending, privateBuildings] = await Promise.all([
    esRolAdmin(state.userRole) ? fetchPendingBuildings(state.sessionToken) : fetchUserPendingBuildings(state.userId, state.sessionToken),
    isSuperadmin ? fetchAllPrivateBuildings(state.sessionToken) : fetchPrivateBuildings(state.userId, state.sessionToken),
  ]);
  const existingIds = new Set(state.OBRAS.map((obra) => String(obra.id)));
  const pendingObjects = pending.filter((fila) => !existingIds.has(String(fila.id))).map((fila, index) => ({
    id: fila.id,
    featureId: String(fila.id),
    nombre_obra: fila.nombre_obra,
    foto_url: fila.foto_url || null,
    enlace_url: fila.enlace_url || null,
    arquitecto: fila.arquitecto,
    arquitectos: separarArquitectos(fila.arquitecto),
    año_construccion: fila.año_construccion,
    importancia: normalizarImportancia(fila.importancia),
    categoria: normalizarCategoria(fila.categoria),
    ciudad: fila.ciudad || null,
    estado_acceso: fila.estado_acceso || 'privado',
    añadido_por: fila.añadido_por || state.userEmail,
    estado_revision: 'pendiente',
    coordenadas: [fila.longitud, fila.latitud],
    selected: false,
  }));
  const privateObjects = privateBuildings.map((fila, index) => ({
    ...fila,
    id: fila.id || `private-${index}`,
    featureId: `private-${fila.id || index}`,
    arquitectos: separarArquitectos(fila.arquitecto),
    importancia: normalizarImportancia(fila.importancia),
    categoria: normalizarCategoria(fila.categoria),
    estado_acceso: fila.estado_acceso || 'privado',
    estado_revision: 'privada',
    private: true,
    coordenadas: [fila.longitud, fila.latitud],
    selected: false,
  }));
  state.OBRAS.push(...pendingObjects, ...privateObjects);
  state.privateBuildings = privateObjects;
  state.ARQUITECTOS = [...new Set(state.OBRAS.flatMap((obra) => obra.arquitectos))];
  state.activeArquitectos = new Set(state.ARQUITECTOS);
  generarFiltrosUI();
  actualizarFuenteMapa();
  if (state.userId && state.sessionToken) {
    import('./api.js').then(async ({ fetchCurrentUser, fetchBuildingStatuses }) => {
      try {
        const [u, st] = await Promise.all([
          fetchCurrentUser(state.sessionToken).catch(() => null),
          fetchBuildingStatuses(state.userId, state.sessionToken).catch(() => null),
        ]);
        if (u) localStorage.setItem('nolli_cached_user', JSON.stringify(u));
        if (st) localStorage.setItem('nolli_cached_statuses', JSON.stringify(st));
      } catch {}
    });
  }
}

document.addEventListener('radar:user-session-ready', cargarContenidoPrivado);
document.addEventListener('radar:user-session-ready', () => {
  if (esRolAdmin(state.userRole)) {
    cargarPanelBajoDemanda('adminUI', 'initAdminUI').catch((err) => console.warn('Init AdminUI:', err));
  }
});

// 0. Pre-calentar catálogo de obras en paralelo para zero-waterfall
getBuildingsCatalog().catch(() => {});

// 1. Iniciar mapa inmediatamente
inicializarRadar();

// 2. Iniciar módulos de interfaz de forma desacoplada y protegida
try { initModalsUI(); } catch (err) { console.warn('Init ModalsUI:', err); }
try { initSearchUI(); } catch (err) { console.warn('Init SearchUI:', err); }
try { initMobileBottomNav(); } catch (err) { console.warn('Init MobileBottomNav:', err); }

const adminPanelButton = document.getElementById('btn-admin-panel');
adminPanelButton?.addEventListener('click', async (event) => {
  event.preventDefault();
  try {
    await cargarPanelBajoDemanda('adminUI', 'initAdminUI');
    const { toggleAdminPanel } = await import('./adminUI.js');
    toggleAdminPanel(true);
  } catch (err) {
    console.warn('Init AdminUI:', err);
  }
});

try {
  window.lucide?.createIcons({ context: document.querySelector('main') });
} catch (err) {
  console.warn('Lucide icons:', err);
}

const mapTools = document.getElementById('map-tools');
const mapToolsToggle = document.getElementById('btn-map-tools');
if (mapToolsToggle && mapTools) {
  mapToolsToggle.addEventListener('click', () => {
    const open = mapTools.classList.toggle('tools-open');
    mapToolsToggle.setAttribute('aria-expanded', String(open));
    mapToolsToggle.classList.toggle('active-state', open);
  });
}
