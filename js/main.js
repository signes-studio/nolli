/* =========================================================================
   MAIN.JS — Punto de entrada de la aplicación
   Descarga los edificios, prepara filtros y arranca el mapa. Se carga como
   <script type="module"> por lo que se ejecuta en modo defer de forma nativa.
   ========================================================================= */

import { state, separarArquitectos } from './state.js';
import { fetchBuildings, fetchUserPendingBuildings, fetchPendingBuildings, fetchPrivateBuildings } from './api.js';
import { actualizarFuenteMapa } from './mapData.js';
import { generarFiltrosUI } from './filtersUI.js';
import { cargarMapaMapbox } from './mapController.js';
import { initModalsUI } from './modalsUI.js';
import { initSearchUI } from './searchUI.js';
import { initMyPlacesUI } from './myPlacesUI.js';
import { initAdminUI } from './adminUI.js';

async function inicializarRadar() {
  try {
    const datosDB = await fetchBuildings();

      state.OBRAS = datosDB.map((fila, index) => ({
      id: fila.id,
        featureId: String(fila.id ?? `obra-${index}`),
      nombre_obra: fila.nombre_obra,
      foto_url: fila.foto_url || null,
      enlace_url: fila.enlace_url || null,
      arquitecto: fila.arquitecto,
      arquitectos: separarArquitectos(fila.arquitecto),
      año_construccion: fila.año_construccion,
      importancia: Number(fila.importancia) || 1,
      categoria: fila.categoria || 'otro',
      ciudad: fila.ciudad || null,
      estado_acceso: fila.estado_acceso || (fila.visitable ? 'publico' : 'privado'),
      añadido_por: fila.añadido_por || null,
      estado_revision: fila.estado_revision || 'publicada',
      coordenadas: [fila.longitud, fila.latitud],
      selected: false,
    }));

    state.ARQUITECTOS = [...new Set(state.OBRAS.flatMap((o) => o.arquitectos))];
    state.activeArquitectos = new Set(state.ARQUITECTOS);
    document.dispatchEvent(new CustomEvent('radar:data-ready'));

    generarFiltrosUI();
    cargarMapaMapbox();
  } catch (error) {
    console.error('Error:', error);
    alert('Error de conexión con la base de datos.');
  }
}

async function cargarContenidoPrivado() {
  if (!state.userId || !state.sessionToken) return;
  const [pending, privateBuildings] = await Promise.all([
    state.userRole === 'admin' ? fetchPendingBuildings(state.sessionToken) : fetchUserPendingBuildings(state.userId, state.sessionToken),
    fetchPrivateBuildings(state.userId, state.sessionToken),
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
    importancia: Number(fila.importancia) || 1,
    categoria: fila.categoria || 'otro',
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
    importancia: Number(fila.importancia) || 1,
    categoria: fila.categoria || 'otro',
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
}

document.addEventListener('radar:user-session-ready', cargarContenidoPrivado);

initModalsUI();
initSearchUI();
initMyPlacesUI();
initAdminUI();
lucide.createIcons();
inicializarRadar();

const mapTools = document.getElementById('map-tools');
const mapToolsToggle = document.getElementById('btn-map-tools');
mapToolsToggle.addEventListener('click', () => {
  const open = mapTools.classList.toggle('tools-open');
  mapToolsToggle.setAttribute('aria-expanded', String(open));
  mapToolsToggle.classList.toggle('active-state', open);
});
