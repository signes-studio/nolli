/* =========================================================================
   MAPCONTROLLER.JS — Inicialización de Mapbox, capas e interacciones
   ========================================================================= */

import { state } from './state.js';
import { MAPBOX_TOKEN, MAP_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM } from './config.js';
import { buildIcon, drawTargetIcon } from './icons.js';
import { actualizarFuenteMapa } from './mapData.js';
import { abrirFicha, cerrarFicha } from './sheetUI.js';

mapboxgl.accessToken = MAPBOX_TOKEN;

/** Crea el mapa, añade la capa de obras y arranca el HUD de coordenadas. */
export function cargarMapaMapbox() {
  state.map = new mapboxgl.Map({
    container: 'map',
    style: MAP_STYLE,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: true,
  });
  state.map.dragRotate.disable();
  state.map.touchZoomRotate.disableRotation();

  state.map.on('load', () => {
    // 2 tipos de icono: normal (naranja) y seleccionado (blanco)
    state.map.addImage('icon-target', buildIcon(drawTargetIcon, '#FF4500'), { pixelRatio: 2 });
    state.map.addImage('icon-target-selected', buildIcon(drawTargetIcon, '#FFFFFF'), { pixelRatio: 2 });
    actualizarFuenteMapa();

    state.map.addLayer({
      id: 'obras-layer',
      type: 'symbol',
      source: 'obras',
      layout: {
        'icon-image': ['case', ['==', ['get', 'selected'], true], 'icon-target-selected', 'icon-target'],
        'icon-size': 0.62,
        'icon-allow-overlap': true,
      },
    });

    state.map.on('mouseenter', 'obras-layer', () => { state.map.getCanvas().style.cursor = 'pointer'; });
    state.map.on('mouseleave', 'obras-layer', () => { state.map.getCanvas().style.cursor = ''; });

    iniciarInteraccionesMapa();
  });

  initHudReadout();
  document.getElementById('btn-recenter').addEventListener('click', () => {
    state.map.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
  });
}

function initHudReadout() {
  const hL = document.getElementById('hud-lng');
  const hLa = document.getElementById('hud-lat');
  const hZ = document.getElementById('hud-zoom');

  function actualizarHud(lngLat) {
    if (lngLat) {
      hL.textContent = lngLat.lng.toFixed(5);
      hLa.textContent = lngLat.lat.toFixed(5);
    }
    hZ.textContent = state.map.getZoom().toFixed(1);
  }

  state.map.on('mousemove', (e) => actualizarHud(e.lngLat));
  state.map.on('move', () => actualizarHud());
  state.map.on('load', () => actualizarHud(state.map.getCenter()));
}

function iniciarInteraccionesMapa() {
  // Clic en obra
  state.map.on('click', 'obras-layer', (e) => {
    // IMPORTANTE: Leemos el ID directamente de las propiedades para evitar el bug de Mapbox
    const p = e.features[0].properties;
    const c = e.features[0].geometry.coordinates;
    abrirFicha(p, c);
  });

  // Clic en el fondo vacío (Descartar selección)
  state.map.on('click', (e) => {
    const isObra = state.map.queryRenderedFeatures(e.point, { layers: ['obras-layer'] });
    if (!isObra.length) cerrarFicha();
  });

  // Pulsación larga para añadir (SOLO SI ESTÁ LOGEADO): se delega en un
  // evento del DOM para que este módulo no dependa de la UI de modales.
  state.map.on('contextmenu', (e) => dispatchLongPress(e.lngLat));

  let pressTimer = null;
  let pressStart = null;
  state.map.on('touchstart', (e) => {
    if (e.points.length > 1) return;
    pressStart = e.lngLat;
    pressTimer = setTimeout(() => dispatchLongPress(pressStart), 600);
  });
  state.map.on('touchmove', () => clearTimeout(pressTimer));
  state.map.on('touchend', () => clearTimeout(pressTimer));
}

function dispatchLongPress(lngLat) {
  document.dispatchEvent(new CustomEvent('radar:map-longpress', { detail: { lngLat } }));
}
