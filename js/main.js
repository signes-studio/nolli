/* =========================================================================
   MAIN.JS — Punto de entrada de la aplicación
   Descarga los edificios, prepara filtros y arranca el mapa. Se carga como
   <script type="module"> por lo que se ejecuta en modo defer de forma nativa.
   ========================================================================= */

import { state, separarArquitectos, normalizarCategoria, normalizarImportancia, esRolAdmin } from './state.js';
import { fetchBuildings, fetchBuildingFacets, fetchUserPendingBuildings, fetchPendingBuildings, fetchPrivateBuildings, fetchAllPrivateBuildings } from './api.js';
import { actualizarFuenteMapa } from './mapData.js';
import { generarFiltrosUI } from './filtersUI.js';
import { cargarMapaMapbox, actualizarMarcadorUbicacion } from './mapController.js';
import { initModalsUI } from './modalsUI.js';
import { initSearchUI } from './searchUI.js';
import { initMyPlacesUI } from './myPlacesUI.js';
import { initAdminUI } from './adminUI.js';
import { initMobileBottomNav } from './mobileBottomNav.js';
import { initExploreUI } from './exploreUI.js';
import { initRadarUI } from './radarUI.js';

import { abrirFicha } from './sheetUI.js';

let publicLoadRequest = 0;
let publicLoadTimer = null;
let publicLoadController = null;
let urlObraChecked = false;

function transformarEdificio(fila, index) {
  return {
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
    añadido_por: fila.añadido_por || null,
    estado_revision: fila.estado_revision || 'publicada',
    coordenadas: [fila.longitud, fila.latitud],
    selected: false,
  };
}

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
    const [datosDB, catalogo] = await Promise.all([
      fetchBuildings({
        bounds: architect ? null : state.map.getBounds(),
        zoom: state.map.getZoom(),
        architect,
        signal: publicLoadController.signal,
      }),
      state.BUILDING_CATALOG.length ? Promise.resolve(state.BUILDING_CATALOG) : fetchBuildingFacets(),
    ]);
    if (requestId !== publicLoadRequest) return;
    state.BUILDING_CATALOG = catalogo.map((fila) => ({ ...fila, categoria: normalizarCategoria(fila.categoria) }));
    state.ARQUITECTOS = [...new Set(state.BUILDING_CATALOG.flatMap((fila) => separarArquitectos(fila.arquitecto)))];
    const mapaObras = new Map(state.OBRAS.map((obra) => [String(obra.id), obra]));
    datosDB.forEach((fila, index) => {
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
    state.OBRAS = Array.from(mapaObras.values());

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

async function verificarParametroObraURL() {
  if (urlObraChecked) return;
  urlObraChecked = true;
  const params = new URLSearchParams(window.location.search);
  const obraId = params.get('obra');
  if (!obraId) return;

  let obra = state.OBRAS.find((item) => String(item.id) === String(obraId) || String(item.featureId) === String(obraId));
  if (!obra) {
    try {
      const dbRows = await fetchBuildings({ includeAllImportance: true });
      const found = dbRows.find((item) => String(item.id) === String(obraId));
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
    abrirFicha(obra, obra.coordenadas, obra.featureId);
  }
}

async function inicializarRadar() {
  try {
    cargarMapaMapbox();
    state.map.once('load', async () => {
      await cargarEdificiosVisibles();
      verificarParametroObraURL();
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            actualizarMarcadorUbicacion([pos.coords.longitude, pos.coords.latitude]);
          },
          () => {},
          { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
        );
      }
    });
    state.map.on('move', programarCargaEdificiosVisibles);
    state.map.on('moveend', () => {
      clearTimeout(publicLoadTimer);
      cargarEdificiosVisibles();
    });
    document.addEventListener('radar:filters-changed', programarCargaEdificiosVisibles);
  } catch (error) {
    console.warn('Aviso de inicialización del mapa:', error);
  }
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

// 1. Iniciar mapa inmediatamente
inicializarRadar();

// 2. Iniciar módulos de interfaz de forma desacoplada y protegida
try { initModalsUI(); } catch (err) { console.warn('Init ModalsUI:', err); }
try { initSearchUI(); } catch (err) { console.warn('Init SearchUI:', err); }
try { initMyPlacesUI(); } catch (err) { console.warn('Init MyPlacesUI:', err); }
try { initAdminUI(); } catch (err) { console.warn('Init AdminUI:', err); }
try { initMobileBottomNav(); } catch (err) { console.warn('Init MobileBottomNav:', err); }
try { initExploreUI(); } catch (err) { console.warn('Init ExploreUI:', err); }
try { initRadarUI(); } catch (err) { console.warn('Init RadarUI:', err); }

try {
  if (window.lucide) window.lucide.createIcons();
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
