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
    [1, 2, 3].forEach((importance) => {
      state.map.addImage(`icon-l${importance}`, buildIcon(drawTargetIcon, '#FF4500', importance), { pixelRatio: 2 });
      state.map.addImage(`icon-l${importance}-selected`, buildIcon(drawTargetIcon, '#FFFFFF', importance), { pixelRatio: 2 });
    });
    state.map.addSource('obras', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    actualizarFuenteMapa();

    [1, 2, 3].forEach((importance) => {
      const minzoom = importance === 1 ? 0 : importance === 2 ? 11 : 13.5;
      const baseFilter = ['==', ['get', 'importancia'], importance];

      state.map.addLayer({
        id: `obras-l${importance}`,
        type: 'symbol',
        source: 'obras',
        minzoom,
        filter: ['all', baseFilter, ['!=', ['get', 'selected'], 1]],
        layout: {
          'icon-image': `icon-l${importance}`,
          'icon-size': importance === 1 ? 0.78 : importance === 2 ? 0.64 : 0.52,
          'icon-allow-overlap': true,
        },
      });

      state.map.addLayer({
        id: `obras-l${importance}-selected`,
        type: 'symbol',
        source: 'obras',
        minzoom,
        filter: ['all', baseFilter, ['==', ['get', 'selected'], 1]],
        layout: {
          'icon-image': `icon-l${importance}-selected`,
          'icon-size': importance === 1 ? 0.78 : importance === 2 ? 0.64 : 0.52,
          'icon-allow-overlap': true,
        },
      });

      [`obras-l${importance}`, `obras-l${importance}-selected`].forEach((layerId) => {
        state.map.on('mouseenter', layerId, () => { state.map.getCanvas().style.cursor = 'pointer'; });
        state.map.on('mouseleave', layerId, () => { state.map.getCanvas().style.cursor = ''; });
      });
    });

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
  ['obras-l1', 'obras-l1-selected', 'obras-l2', 'obras-l2-selected', 'obras-l3', 'obras-l3-selected'].forEach((layerId) => {
    state.map.on('click', layerId, (e) => {
      const feature = e.features[0];
      const p = feature.properties;
      const c = feature.geometry.coordinates;
      abrirFicha(p, c, feature.id);
    });
  });

  // Clic en el fondo vacío (Descartar selección)
  state.map.on('click', (e) => {
    const isObra = state.map.queryRenderedFeatures(e.point, { layers: ['obras-l1', 'obras-l1-selected', 'obras-l2', 'obras-l2-selected', 'obras-l3', 'obras-l3-selected'] });
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
