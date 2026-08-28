/* =========================================================================
   MAPCONTROLLER.JS — Inicialización de mapa, capas e interacciones (Nolli)
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
    style: MAP_STYLES.abstract,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: true,
  });
  state.map.dragRotate.disable();
  state.map.touchZoomRotate.disableRotation();

  const configurarCapas = () => {
    if (state.map.getSource('obras')) return;
    aplicarTratamientoSatelite();

    // Paleta NEOBAUHAUS por categoría: planos de color, sin degradado ni tono
    // neón. Solo dos primarios (azul/amarillo) participan de la taxonomía;
    // rojo queda reservado para 'infraestructura' por ser la única categoría
    // con connotación de riesgo/alerta explícita del propio dominio.
    const CATEGORY_COLORS = {
      'residencial': '#E95C0C',
      'dotacional_equipamiento': '#4388C6',
      'religioso_funerario': '#F2ACCD',
      'comercial_terciario': '#EFBC02',
      'espacio_publico_paisaje': '#0d682f',
      'infraestructura_urbanismo': '#D6201D',
      'industrial_logistico': '#691B14',
      'otro': '#064773'
    };

    // Registrar iconos cruzando importancia y categoría con prefijo 'icon-l{imp}-{cat}'
    [0, 1, 2, 3].forEach((importance) => {
      Object.entries(CATEGORY_COLORS).forEach(([cat, color]) => {
        const prefix = `icon-l${importance}-${cat}`;

        state.map.addImage(prefix, buildIcon(drawTargetIcon, color, importance), { pixelRatio: 2 });
        state.map.addImage(`${prefix}-visited`, buildIcon(drawTargetIcon, '#6B6B6B', importance), { pixelRatio: 2 });
        state.map.addImage(`${prefix}-pending`, buildIcon(drawTargetIcon, '#FFCC00', importance), { pixelRatio: 2 });
        state.map.addImage(`${prefix}-private`, buildIcon(drawTargetIcon, '#005AC1', importance), { pixelRatio: 2 });
        state.map.addImage(`${prefix}-selected`, buildIcon(drawTargetIcon, '#FFCC00', importance), { pixelRatio: 2 });
      });
    });

    state.map.addSource('obras', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: true,
      clusterMaxZoom: 4,
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
        'circle-color': '#005AC1',
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

    // Capas de iconos añadidas en orden inverso (3, 2, 1, 0) para que 1 y 0 queden siempre arriba
    [3, 2, 1, 0].forEach((importance) => {
      const minzoom = importance === 0 ? 0 : importance === 1 ? 0 : importance === 2 ? 6.5 : 13.5;
      const baseFilter = ['==', ['get', 'importancia'], importance];
      const sourceId = importance === 0 ? 'obras-maestras' : 'obras';
      const iconSize = importance === 0 ? 0.92 : importance === 1 ? 0.70 : importance === 2 ? 0.56 : 0.52;

      // Expresión para obtener la categoría de la feature de forma segura (fallback a 'otro')
      const catExpr = ['coalesce', ['get', 'categoria'], 'otro'];

      // Capa normal
      state.map.addLayer({
        id: `obras-l${importance}`,
        type: 'symbol',
        source: sourceId,
        minzoom,
        filter: ['all', baseFilter, ['==', ['get', 'estado_revision'], 'publicada'], ['!=', ['get', 'selected'], 1], ['!=', ['get', 'visited'], 1]],
        layout: {
          'icon-image': ['concat', `icon-l${importance}-`, catExpr],
          'icon-size': iconSize,
          'icon-allow-overlap': true,
        },
      });

      // Capa visitada
      state.map.addLayer({
        id: `obras-l${importance}-visited`,
        type: 'symbol',
        source: sourceId,
        minzoom,
        filter: ['all', baseFilter, ['==', ['get', 'estado_revision'], 'publicada'], ['!=', ['get', 'selected'], 1], ['==', ['get', 'visited'], 1]],
        layout: {
          'icon-image': ['concat', `icon-l${importance}-`, catExpr, '-visited'],
          'icon-size': iconSize,
          'icon-allow-overlap': true,
        },
      });

      // Capa seleccionada (pasa a blanco `#FFFFFF` al pulsar la obra o etiqueta)
      state.map.addLayer({
        id: `obras-l${importance}-selected`,
        type: 'symbol',
        source: sourceId,
        minzoom,
        filter: ['all', baseFilter, ['==', ['get', 'estado_revision'], 'publicada'], ['==', ['get', 'selected'], 1]],
        layout: {
          'icon-image': ['concat', `icon-l${importance}-`, catExpr, '-selected'],
          'icon-size': iconSize,
          'icon-allow-overlap': true,
        },
      });

      // Capa pendiente
      state.map.addLayer({
        id: `obras-l${importance}-pending`,
        type: 'symbol',
        source: sourceId,
        minzoom,
        filter: ['all', baseFilter, ['==', ['get', 'estado_revision'], 'pendiente']],
        layout: {
          'icon-image': ['concat', `icon-l${importance}-`, catExpr, '-pending'],
          'icon-size': iconSize,
          'icon-allow-overlap': true,
        },
      });

      // Capa privada
      state.map.addLayer({
        id: `obras-l${importance}-private`,
        type: 'symbol',
        source: sourceId,
        minzoom,
        filter: ['all', baseFilter, ['==', ['get', 'estado_revision'], 'privada']],
        layout: {
          'icon-image': ['concat', `icon-l${importance}-`, catExpr, '-private'],
          'icon-size': iconSize,
          'icon-allow-overlap': true,
        },
      });

      [`obras-l${importance}`, `obras-l${importance}-visited`, `obras-l${importance}-selected`, `obras-l${importance}-pending`, `obras-l${importance}-private`].forEach((layerId) => {
        state.map.on('mouseenter', layerId, () => { state.map.getCanvas().style.cursor = 'pointer'; });
        state.map.on('mouseleave', layerId, () => { state.map.getCanvas().style.cursor = ''; });
      });
    });

    // Capas de etiquetas de texto también en orden inverso (3, 2, 1, 0)
    [3, 2, 1, 0].forEach((importance) => {
      const labelLayerId = `obras-labels-l${importance}`;
      const sourceId = importance === 0 ? 'obras-maestras' : 'obras';
      state.map.addLayer({
        id: labelLayerId,
        type: 'symbol',
        source: sourceId,
        minzoom: importance === 0 ? 11 : importance === 1 ? 12 : importance === 2 ? 15 : 20,
        filter: ['all', ['==', ['get', 'importancia'], importance], ['==', ['get', 'estado_revision'], 'publicada']],
        layout: {
          'text-field': ['get', 'nombre_obra'],
          'text-font': ['Inter Regular', 'Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 12,
          'text-offset': [1.15, 0],
          'text-anchor': 'left',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#04070B',
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

  // Desplegable de la leyenda técnica
  const legend = document.getElementById('map-legend');
  const toggleBtn = document.getElementById('btn-legend-toggle');
  const chevron = document.getElementById('legend-chevron');

  if (toggleBtn && legend) {
    toggleBtn.addEventListener('click', () => {
      const isCollapsed = legend.classList.toggle('collapsed');
      toggleBtn.setAttribute('aria-expanded', !isCollapsed);
      if (chevron) chevron.textContent = isCollapsed ? '+' : '−';
    });
  }

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

  if (!panel || !button) return;

  // Abrir / Cerrar el panel flotante
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = panel.classList.toggle('open');
    button.classList.toggle('active-state', isOpen);
  });

  // Escuchar clics en las opciones de estilo
  document.addEventListener('click', (event) => {
    const option = event.target.closest('[data-map-style]');
    if (!option) {
      // Si haces clic fuera del panel, lo cerramos
      if (!panel.contains(event.target) && !button.contains(event.target)) {
        panel.classList.remove('open');
        button.classList.remove('active-state');
      }
      return;
    }

    const styleKey = option.dataset.mapStyle; // 'abstract', 'dark', o 'satellite'
    if (!styleKey || !MAP_STYLES[styleKey]) return;

    state.mapStyle = styleKey;

    // Actualizar clases 'active' visuales en el menú
    panel.querySelectorAll('[data-map-style]').forEach((item) => {
      item.classList.toggle('active', item === option);
    });

    // 1. Cambiar el estilo real en Mapbox
    state.map.setStyle(MAP_STYLES[styleKey]);

    // 2. Gestionar el diseño de la interfaz (Modo Oscuro / Claro para los menús)
    if (styleKey === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }

    // Cerrar el panel
    panel.classList.remove('open');
    button.classList.remove('active-state');
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
  const allLayerIds = [];
  [0, 1, 2, 3].forEach((imp) => {
    ['', '-visited', '-selected', '-pending', '-private'].forEach((suf) => {
      allLayerIds.push(`obras-l${imp}${suf}`);
    });
    allLayerIds.push(`obras-labels-l${imp}`);
  });

  allLayerIds.forEach((layerId) => {
    if (state.map.getLayer(layerId)) {
      state.map.on('click', layerId, (e) => {
        if (state.addingBuilding) return;
        const feature = e.features[0];
        const obra = state.OBRAS.find((item) => String(item.featureId) === String(feature.id));
        abrirFicha(obra || feature.properties, obra?.coordenadas || feature.geometry.coordinates, feature.id);
      });
    }
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

  state.map.on('click', (e) => {
    if (state.addingBuilding) {
      state.addingBuilding = false;
      document.getElementById('btn-add-project').classList.remove('active-state');
      document.getElementById('btn-add-project').title = 'Añadir obra';
      state.map.getCanvas().style.cursor = '';
      dispatchLongPress(e.lngLat);
      return;
    }
    const isObra = state.map.queryRenderedFeatures(e.point, { layers: ['obras-clusters', 'obras-clusters-core', ...allLayerIds] });
    if (!isObra.length) cerrarFicha();
  });

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