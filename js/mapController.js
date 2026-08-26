/* =========================================================================
  MAPCONTROLLER.JS — Inicialización de mapa, capas e interacciones
  ========================================================================= */

import { state } from './state.js';
import { MAPBOX_TOKEN, MAP_STYLES, DEFAULT_CENTER, DEFAULT_ZOOM } from './config.js';
import { buildIcon, drawTargetIcon } from './icons.js';
import { actualizarFuenteMapa } from './mapData.js';
import { abrirFicha, cerrarFicha } from './sheetUI.js';

mapboxgl.accessToken = MAPBOX_TOKEN;

/** Crea el mapa, añade la capa de obras y arranca el HUD de coordenadas. */
export function cargarMapaMapbox() {
  state.map = new mapboxgl.Map({
    container: 'map',
    style: MAP_STYLES.dark,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: true,
  });
  state.map.dragRotate.disable();
  state.map.touchZoomRotate.disableRotation();

  const configurarCapas = () => {
    if (state.map.getSource('obras')) return;
    aplicarTratamientoSatelite();
    [0, 1, 2, 3].forEach((importance) => {
      const iconColor = importance === 0 ? '#FFD166' : '#FF4500';
      state.map.addImage(`icon-l${importance}`, buildIcon(drawTargetIcon, iconColor, importance), { pixelRatio: 2 });
      state.map.addImage(`icon-l${importance}-visited`, buildIcon(drawTargetIcon, '#39FF14', importance), { pixelRatio: 2 });
      state.map.addImage(`icon-l${importance}-pending`, buildIcon(drawTargetIcon, '#FFD166', importance), { pixelRatio: 2 });
      state.map.addImage(`icon-l${importance}-private`, buildIcon(drawTargetIcon, '#5EEAD4', importance), { pixelRatio: 2 });
      state.map.addImage(`icon-l${importance}-selected`, buildIcon(drawTargetIcon, '#FFFFFF', importance), { pixelRatio: 2 });
    });
    state.map.addSource('obras', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: true,
      clusterMaxZoom: 7,
      clusterRadius: 45,
    });
    state.map.addSource('obras-maestras', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    actualizarFuenteMapa();

    state.map.addLayer({
      id: 'obras-favorites-halo',
      type: 'circle',
      source: 'obras',
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'favorite'], 1]],
      paint: {
        'circle-radius': 13,
        'circle-color': '#FFFFFF',
        'circle-opacity': 0.32,
        'circle-blur': 0.55,
      },
    });
    state.map.addLayer({
      id: 'obras-clusters',
      type: 'circle',
      source: 'obras',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#FF4500',
        'circle-radius': 12,
        'circle-opacity': 0.94,
      },
    });
    state.map.addLayer({
      id: 'obras-clusters-core',
      type: 'circle',
      source: 'obras',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#000000',
        'circle-radius': 4,
        'circle-opacity': 0.92,
      },
    });
    [0, 1, 2, 3].forEach((importance) => {
      const minzoom = importance === 0 ? 0 : importance === 1 ? 0 : importance === 2 ? 6.5 : 13.5;
      const baseFilter = ['==', ['get', 'importancia'], importance];
      const sourceId = importance === 0 ? 'obras-maestras' : 'obras';

      state.map.addLayer({
        id: `obras-l${importance}`,
        type: 'symbol',
        source: sourceId,
        minzoom,
        filter: ['all', baseFilter, ['==', ['get', 'estado_revision'], 'publicada'], ['!=', ['get', 'selected'], 1], ['!=', ['get', 'visited'], 1]],
        layout: {
          'icon-image': `icon-l${importance}`,
          'icon-size': importance === 0 ? 0.92 : importance === 1 ? 0.70 : importance === 2 ? 0.56 : 0.52,
          'icon-allow-overlap': true,
        },
      });

      state.map.addLayer({
        id: `obras-l${importance}-visited`,
        type: 'symbol',
        source: sourceId,
        minzoom,
        filter: ['all', baseFilter, ['==', ['get', 'estado_revision'], 'publicada'], ['!=', ['get', 'selected'], 1], ['==', ['get', 'visited'], 1]],
        layout: {
          'icon-image': `icon-l${importance}-visited`,
          'icon-size': importance === 0 ? 0.92 : importance === 1 ? 0.70 : importance === 2 ? 0.56 : 0.52,
          'icon-allow-overlap': true,
        },
      });

      state.map.addLayer({
        id: `obras-l${importance}-selected`,
        type: 'symbol',
        source: sourceId,
        minzoom,
        filter: ['all', baseFilter, ['==', ['get', 'estado_revision'], 'publicada'], ['==', ['get', 'selected'], 1]],
        layout: {
          'icon-image': `icon-l${importance}-selected`,
          'icon-size': importance === 0 ? 0.92 : importance === 1 ? 0.70 : importance === 2 ? 0.56 : 0.52,
          'icon-allow-overlap': true,
        },
      });

      state.map.addLayer({
        id: `obras-l${importance}-pending`,
        type: 'symbol',
        source: sourceId,
        minzoom,
        filter: ['all', baseFilter, ['==', ['get', 'estado_revision'], 'pendiente']],
        layout: {
          'icon-image': `icon-l${importance}-pending`,
          'icon-size': importance === 0 ? 0.92 : importance === 1 ? 0.70 : importance === 2 ? 0.56 : 0.52,
          'icon-allow-overlap': true,
        },
      });

      state.map.addLayer({
        id: `obras-l${importance}-private`,
        type: 'symbol',
        source: sourceId,
        minzoom,
        filter: ['all', baseFilter, ['==', ['get', 'estado_revision'], 'privada']],
        layout: {
          'icon-image': `icon-l${importance}-private`,
          'icon-size': importance === 0 ? 0.92 : importance === 1 ? 0.70 : importance === 2 ? 0.56 : 0.52,
          'icon-allow-overlap': true,
        },
      });

      [`obras-l${importance}`, `obras-l${importance}-visited`, `obras-l${importance}-selected`, `obras-l${importance}-pending`, `obras-l${importance}-private`].forEach((layerId) => {
        state.map.on('mouseenter', layerId, () => { state.map.getCanvas().style.cursor = 'pointer'; });
        state.map.on('mouseleave', layerId, () => { state.map.getCanvas().style.cursor = ''; });
      });
    });

    [0, 1, 2, 3].forEach((importance) => {
      const labelLayerId = `obras-labels-l${importance}`;
      const sourceId = importance === 0 ? 'obras-maestras' : 'obras';
      state.map.addLayer({
        id: labelLayerId,
        type: 'symbol',
        source: sourceId,
        minzoom: importance === 0 ? 13 : importance === 1 ? 13 : importance === 2 ? 14 : 16,
        filter: ['all', ['==', ['get', 'importancia'], importance], ['==', ['get', 'estado_revision'], 'publicada']],
        layout: {
          'text-field': ['get', 'nombre_obra'],
          'text-font': ['Open Sans Regular'],
          'text-size': 12,
          'text-offset': [1.15, 0],
          'text-anchor': 'left',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#FFFFFF',
          'text-halo-color': '#000000',
          'text-halo-width': 1.5,
          'text-halo-blur': 0.3,
        },
      });
      state.map.on('mouseenter', labelLayerId, () => { state.map.getCanvas().style.cursor = 'pointer'; });
      state.map.on('mouseleave', labelLayerId, () => { state.map.getCanvas().style.cursor = ''; });
    });

    ['obras-l0', 'obras-l0-visited', 'obras-l0-selected', 'obras-l0-pending', 'obras-l0-private', 'obras-labels-l0'].forEach((layerId) => {
      state.map.moveLayer(layerId);
    });

    iniciarInteraccionesMapa();
  };
  state.map.on('load', configurarCapas);
  state.map.on('style.load', configurarCapas);

  initHudReadout();
  document.getElementById('btn-recenter').addEventListener('click', () => {
    state.map.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
  });
  document.getElementById('btn-location').addEventListener('click', localizarDispositivo);
  document.getElementById('btn-add-project').addEventListener('click', activarModoAñadir);
  initMapStyleSelector();
  document.addEventListener('radar:admin-login', actualizarFuenteMapa);
  document.addEventListener('radar:user-login', actualizarFuenteMapa);
  document.addEventListener('radar:logout', actualizarFuenteMapa);
  document.addEventListener('radar:admin-mode-change', actualizarFuenteMapa);
}

function activarModoAñadir() {
  if (!state.sessionToken) {
    alert('Inicia sesión para proponer una nueva obra.');
    return;
  }
  state.addingBuilding = !state.addingBuilding;
  const button = document.getElementById('btn-add-project');
  button.classList.toggle('active-state', state.addingBuilding);
  button.title = state.addingBuilding ? 'Selecciona una ubicación en el mapa' : 'Añadir obra';
  state.map.getCanvas().style.cursor = state.addingBuilding ? 'crosshair' : '';
}

function aplicarTratamientoSatelite() {
  if (state.mapStyle !== 'satellite') return;
  const style = state.map.getStyle();
  style.layers.forEach((layer) => {
    const layerName = `${layer.id} ${layer['source-layer'] || ''}`.toLowerCase();
    if (layer.type === 'symbol' && (layerName.includes('poi') || layerName.includes('housenum'))) {
      state.map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
    if (layer.type === 'raster') {
      state.map.setPaintProperty(layer.id, 'raster-saturation', -0.18);
      state.map.setPaintProperty(layer.id, 'raster-contrast', 0.08);
      state.map.setPaintProperty(layer.id, 'raster-brightness-min', 0.04);
      state.map.setPaintProperty(layer.id, 'raster-brightness-max', 0.92);
    }
  });
}

function initMapStyleSelector() {
  const panel = document.getElementById('map-style-panel');
  const button = document.getElementById('btn-map-style');
  document.addEventListener('click', (event) => {
    if (event.target.closest('#btn-map-style-close')) {
      panel.classList.remove('open');
      button.classList.remove('active-state');
    }
    const option = event.target.closest('[data-map-style]');
    if (!option) return;
    const style = option.dataset.mapStyle;
    if (style === state.mapStyle) return;
    state.mapStyle = style;
    panel.querySelectorAll('[data-map-style]').forEach((item) => item.classList.toggle('active', item === option));
    state.map.setStyle(MAP_STYLES[style]);
    panel.classList.remove('open');
    button.classList.remove('active-state');
  });
  button.addEventListener('click', () => {
    panel.classList.toggle('open');
    button.classList.toggle('active-state');
  });
}

function localizarDispositivo() {
  if (!navigator.geolocation) {
    alert('Este dispositivo no admite geolocalización.');
    return;
  }

  const button = document.getElementById('btn-location');
  button.classList.add('location-active');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const coordinates = [position.coords.longitude, position.coords.latitude];
      state.userLocation = { lng: coordinates[0], lat: coordinates[1] };
      if (state.locationMarker) state.locationMarker.remove();

      const markerElement = document.createElement('div');
      markerElement.className = 'location-marker';
      markerElement.setAttribute('aria-label', 'Tu ubicación actual');
      state.locationMarker = new mapboxgl.Marker({ element: markerElement })
        .setLngLat(coordinates)
        .addTo(state.map);

      state.map.flyTo({ center: coordinates, zoom: Math.max(state.map.getZoom(), 14) });
      document.getElementById('hud-lng').textContent = coordinates[0].toFixed(5);
      document.getElementById('hud-lat').textContent = coordinates[1].toFixed(5);
    },
    (error) => {
      const messages = {
        1: 'Permiso de ubicación denegado.',
        2: 'No se pudo determinar tu ubicación.',
        3: 'La búsqueda de ubicación ha tardado demasiado.',
      };
      alert(messages[error.code] || 'No se pudo obtener tu ubicación.');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
  );
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
  ['obras-l0', 'obras-l0-visited', 'obras-l0-selected', 'obras-l0-pending', 'obras-l0-private', 'obras-l1', 'obras-l1-visited', 'obras-l1-selected', 'obras-l1-pending', 'obras-l1-private', 'obras-l2', 'obras-l2-visited', 'obras-l2-selected', 'obras-l2-pending', 'obras-l2-private', 'obras-l3', 'obras-l3-visited', 'obras-l3-selected', 'obras-l3-pending', 'obras-l3-private', 'obras-labels-l0', 'obras-labels-l1', 'obras-labels-l2', 'obras-labels-l3'].forEach((layerId) => {
    state.map.on('click', layerId, (e) => {
      if (state.addingBuilding) return;
      const feature = e.features[0];
      const obra = state.OBRAS.find((item) => String(item.featureId) === String(feature.id));
      abrirFicha(obra || feature.properties, obra?.coordenadas || feature.geometry.coordinates, feature.id);
    });
  });

  state.map.on('click', 'obras-clusters', (e) => {
    const cluster = e.features[0];
    state.map.getSource('obras').getClusterExpansionZoom(cluster.properties.cluster_id, (error, zoom) => {
      if (error) return;
      state.map.easeTo({ center: cluster.geometry.coordinates, zoom });
    });
  });
  state.map.on('click', 'obras-clusters-core', (e) => {
    const cluster = e.features[0];
    state.map.getSource('obras').getClusterExpansionZoom(cluster.properties.cluster_id, (error, zoom) => {
      if (error) return;
      state.map.easeTo({ center: cluster.geometry.coordinates, zoom });
    });
  });
  state.map.on('mouseenter', 'obras-clusters', () => { state.map.getCanvas().style.cursor = 'pointer'; });
  state.map.on('mouseleave', 'obras-clusters', () => { state.map.getCanvas().style.cursor = ''; });
  state.map.on('mouseenter', 'obras-clusters-core', () => { state.map.getCanvas().style.cursor = 'pointer'; });
  state.map.on('mouseleave', 'obras-clusters-core', () => { state.map.getCanvas().style.cursor = ''; });

  // Clic en el fondo vacío (Descartar selección)
  state.map.on('click', (e) => {
    if (state.addingBuilding) {
      state.addingBuilding = false;
      document.getElementById('btn-add-project').classList.remove('active-state');
      document.getElementById('btn-add-project').title = 'Añadir obra';
      state.map.getCanvas().style.cursor = '';
      dispatchLongPress(e.lngLat);
      return;
    }
    const isObra = state.map.queryRenderedFeatures(e.point, { layers: ['obras-clusters', 'obras-clusters-core', 'obras-l0', 'obras-l0-visited', 'obras-l0-selected', 'obras-l0-pending', 'obras-l0-private', 'obras-l1', 'obras-l1-visited', 'obras-l1-selected', 'obras-l1-pending', 'obras-l1-private', 'obras-l2', 'obras-l2-visited', 'obras-l2-selected', 'obras-l2-pending', 'obras-l2-private', 'obras-l3', 'obras-l3-visited', 'obras-l3-selected', 'obras-l3-pending', 'obras-l3-private', 'obras-labels-l0', 'obras-labels-l1', 'obras-labels-l2', 'obras-labels-l3'] });
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
