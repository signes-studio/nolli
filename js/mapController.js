/* =========================================================================
   MAPCONTROLLER.JS — Inicialización de mapa, capas e interacciones (Nolli)
   ========================================================================= */

import { state } from './state.js';
import { MAPBOX_TOKEN, MAP_STYLES, DEFAULT_CENTER, DEFAULT_ZOOM } from './config.js';
import { buildIcon, drawTargetIcon, buildEmojiIcon } from './icons.js';
import { actualizarFuenteMapa } from './mapData.js';
import { abrirFicha, cerrarFicha } from './sheetUI.js';

mapboxgl.accessToken = MAPBOX_TOKEN;

/** Registra o actualiza los emojis de las listas del usuario en Mapbox */
export function registrarIconosColecciones() {
  if (!state.map) return;
  const isDark = state.mapStyle === 'dark' || document.body.classList.contains('dark-mode');
  if (state.userCollections && state.userCollections.length > 0) {
    state.userCollections.forEach((col) => {
      if (col.icon) {
        const emojiImageName = `collection-emoji-${col.id}`;
        const imgData = buildEmojiIcon(col.icon, isDark, 64);
        if (state.map.hasImage(emojiImageName)) {
          state.map.removeImage(emojiImageName);
        }
        state.map.addImage(emojiImageName, imgData, { pixelRatio: 2 });
      }
    });
  }
}

/** Crea el mapa, añade la capa de obras y arranca el HUD de coordenadas. */
export function cargarMapaMapbox() {
  const savedStyle = localStorage.getItem('nolli_map_style');
  if (savedStyle && MAP_STYLES[savedStyle]) {
    state.mapStyle = savedStyle;
  }
  if (state.mapStyle === 'dark') {
    document.body?.classList.add('dark-mode');
  } else {
    document.body?.classList.remove('dark-mode');
  }

  const isMobile = window.innerWidth <= 768;
  state.map = new mapboxgl.Map({
    container: 'map',
    style: MAP_STYLES[state.mapStyle] || MAP_STYLES.abstract,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: true,
  });

  if (isMobile) {
    state.map.setPadding({ top: 10, bottom: 64, left: 0, right: 0 });
  }

  state.map.dragRotate.disable();
  state.map.touchZoomRotate.disableRotation();

  // Redimensionamiento y ajuste dinámico de padding en dispositivos táctiles
  window.addEventListener('resize', () => {
    state.map?.resize();
    if (window.innerWidth <= 768) {
      state.map?.setPadding({ top: 10, bottom: 64, left: 0, right: 0 });
    } else {
      state.map?.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    }
  }, { passive: true });

  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      state.map?.resize();
    }, 150);
  }, { passive: true });

  const configurarCapas = () => {
    if (state.map.getSource('obras')) return;
    aplicarTratamientoSatelite();

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

    const isDark = state.mapStyle === 'dark' || document.body.classList.contains('dark-mode');
    const selectedColor = isDark ? '#FFFFFF' : '#141411';

    [0, 1, 2, 3].forEach((importance) => {
      Object.entries(CATEGORY_COLORS).forEach(([cat, color]) => {
        const prefix = `icon-l${importance}-${cat}`;

        if (!state.map.hasImage(prefix)) state.map.addImage(prefix, buildIcon(drawTargetIcon, color, importance), { pixelRatio: 2 });
        if (!state.map.hasImage(`${prefix}-visited`)) state.map.addImage(`${prefix}-visited`, buildIcon(drawTargetIcon, '#82c812', importance), { pixelRatio: 2 });
        if (!state.map.hasImage(`${prefix}-pending`)) state.map.addImage(`${prefix}-pending`, buildIcon(drawTargetIcon, '#FFCC00', importance), { pixelRatio: 2 });
        if (!state.map.hasImage(`${prefix}-private`)) state.map.addImage(`${prefix}-private`, buildIcon(drawTargetIcon, '#0478f2', importance), { pixelRatio: 2 });
        if (!state.map.hasImage(`${prefix}-selected`)) state.map.addImage(`${prefix}-selected`, buildIcon(drawTargetIcon, selectedColor, importance), { pixelRatio: 2 });
      });
    });

    // Registrar emojis actuales
    registrarIconosColecciones();

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
        'circle-color': '#E95C0C',
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

    state.map.addLayer({
      id: 'obras-selected-halo',
      type: 'circle',
      source: 'obras',
      filter: ['==', ['get', 'selected'], 1],
      paint: {
        'circle-radius': 14,
        'circle-color': 'rgba(232, 78, 27, 0.22)',
        'circle-stroke-color': '#E84E1B',
        'circle-stroke-width': 2.5,
      },
    });

    [3, 2, 1, 0].forEach((importance) => {
      const minzoom = importance === 0 ? 0 : importance === 1 ? 0 : importance === 2 ? 6.5 : 13.5;
      const baseFilter = ['==', ['get', 'importancia'], importance];
      const sourceId = importance === 0 ? 'obras-maestras' : 'obras';
      const iconSize = importance === 0 ? 0.92 : importance === 1 ? 0.70 : importance === 2 ? 0.56 : 0.52;
      const catExpr = ['coalesce', ['get', 'categoria'], 'otro'];

      // Capa normal
      state.map.addLayer({
        id: `obras-l${importance}`,
        type: 'symbol',
        source: sourceId,
        minzoom,
        filter: ['all', baseFilter, ['==', ['get', 'estado_revision'], 'publicada'], ['!=', ['get', 'selected'], 1], ['!=', ['get', 'visited'], 1]],
        layout: {
          'icon-image': [
            'case',
            ['has', 'collection_emoji'], ['concat', 'collection-emoji-', ['get', 'collection_id']],
            ['concat', `icon-l${importance}-`, catExpr]
          ],
          'icon-size': [
            'case',
            ['has', 'collection_emoji'], 0.75,
            iconSize
          ],
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
          'icon-image': [
            'case',
            ['has', 'collection_emoji'], ['concat', 'collection-emoji-', ['get', 'collection_id']],
            ['concat', `icon-l${importance}-`, catExpr, '-visited']
          ],
          'icon-size': [
            'case',
            ['has', 'collection_emoji'], 0.75,
            iconSize
          ],
          'icon-allow-overlap': true,
        },
      });

      // Capa seleccionada (Escalada 1.25x y con prioridad z-index 100)
      state.map.addLayer({
        id: `obras-l${importance}-selected`,
        type: 'symbol',
        source: sourceId,
        minzoom,
        filter: ['all', baseFilter, ['==', ['get', 'estado_revision'], 'publicada'], ['==', ['get', 'selected'], 1]],
        layout: {
          'icon-image': [
            'case',
            ['has', 'collection_emoji'], ['concat', 'collection-emoji-', ['get', 'collection_id']],
            ['concat', `icon-l${importance}-`, catExpr, '-selected']
          ],
          'icon-size': [
            'case',
            ['has', 'collection_emoji'], 0.95,
            iconSize * 1.25
          ],
          'symbol-sort-key': 100,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
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
          'icon-image': [
            'case',
            ['has', 'collection_emoji'], ['concat', 'collection-emoji-', ['get', 'collection_id']],
            ['concat', `icon-l${importance}-`, catExpr, '-pending']
          ],
          'icon-size': [
            'case',
            ['has', 'collection_emoji'], 0.75,
            iconSize
          ],
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
          'icon-image': [
            'case',
            ['has', 'collection_emoji'], ['concat', 'collection-emoji-', ['get', 'collection_id']],
            ['concat', `icon-l${importance}-`, catExpr, '-private']
          ],
          'icon-size': [
            'case',
            ['has', 'collection_emoji'], 0.75,
            iconSize
          ],
          'icon-allow-overlap': true,
        },
      });

      [`obras-l${importance}`, `obras-l${importance}-visited`, `obras-l${importance}-selected`, `obras-l${importance}-pending`, `obras-l${importance}-private`].forEach((layerId) => {
        state.map.on('mouseenter', layerId, () => { state.map.getCanvas().style.cursor = 'pointer'; });
        state.map.on('mouseleave', layerId, () => { state.map.getCanvas().style.cursor = ''; });
      });
    });

    const IMPORTANCE_LABEL_CONFIG = {
      0: {
        font: ['Inter Bold', 'Open Sans Bold', 'Arial Unicode MS Bold'],
        size: 12.5,
        minzoom: 11.5,
        sortKey: 0,
      },
      1: {
        font: ['Inter Medium', 'Open Sans Semibold', 'Arial Unicode MS Bold'],
        size: 11.5,
        minzoom: 13.0,
        sortKey: 1,
      },
      2: {
        font: ['Inter Regular', 'Open Sans Regular', 'Arial Unicode MS Regular'],
        size: 11,
        minzoom: 14.5,
        sortKey: 2,
      },
      3: {
        font: ['Inter Light', 'Open Sans Light', 'Arial Unicode MS Regular'],
        size: 10,
        minzoom: 16.0,
        sortKey: 3,
      },
    };

    [3, 2, 1, 0].forEach((importance) => {
      const cfg = IMPORTANCE_LABEL_CONFIG[importance];
      const labelLayerId = `obras-labels-l${importance}`;
      const sourceId = importance === 0 ? 'obras-maestras' : 'obras';
      state.map.addLayer({
        id: labelLayerId,
        type: 'symbol',
        source: sourceId,
        minzoom: cfg.minzoom,
        filter: ['all', ['==', ['get', 'importancia'], importance], ['!=', ['get', 'estado_revision'], 'rechazada']],
        layout: {
          'text-field': ['get', 'nombre_obra'],
          'text-font': cfg.font,
          'text-size': cfg.size,
          'text-offset': [1.05, 0],
          'text-anchor': 'left',
          'text-justify': 'left',
          'text-max-width': 11,
          'text-padding': 4,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'text-optional': true,
          'symbol-sort-key': cfg.sortKey,
        },
        paint: {
          'text-color': isDark ? '#FFFFFF' : '#04070B',
          'text-halo-color': isDark ? 'rgba(18, 18, 18, 0.95)' : 'rgba(248, 241, 223, 0.95)',
          'text-halo-width': 1.5,
          'text-halo-blur': 0.5,
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

  // Escuchar cambios en las colecciones del usuario para registrar dinámicamente los emojis nuevos
  document.addEventListener('radar:user-collections-changed', () => {
    registrarIconosColecciones();
    actualizarFuenteMapa();
  });
  document.addEventListener('radar:user-session-ready', () => {
    registrarIconosColecciones();
    actualizarFuenteMapa();
  });
  document.addEventListener('radar:user-status-ready', () => {
    registrarIconosColecciones();
    actualizarFuenteMapa();
  });

  initHudReadout();

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

  document.getElementById('btn-recenter')?.addEventListener('click', () => {
    state.map.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
  });
  document.getElementById('btn-location')?.addEventListener('click', localizarDispositivo);
  document.getElementById('btn-add-project')?.addEventListener('click', activarModoAñadir);
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
  if (!style || !style.layers) return;
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

  panel.querySelectorAll('[data-map-style]').forEach((item) => {
    item.classList.toggle('active', item.dataset.mapStyle === state.mapStyle);
  });

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = panel.classList.toggle('open');
    button.classList.toggle('active-state', isOpen);
  });

  const closeBtn = document.getElementById('btn-map-style-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.remove('open');
      button.classList.remove('active-state');
      document.getElementById('panel-backdrop')?.classList.remove('active');
    });
  }

  document.addEventListener('click', (event) => {
    const option = event.target.closest('[data-map-style]');
    if (!option) {
      if (
        !panel.contains(event.target) &&
        !button.contains(event.target) &&
        !event.target.closest('#mobile-nav-layers') &&
        !event.target.closest('.mobile-nav-btn')
      ) {
        panel.classList.remove('open');
        button.classList.remove('active-state');
      }
      return;
    }

    const styleKey = option.dataset.mapStyle;
    if (!styleKey || !MAP_STYLES[styleKey]) return;

    state.mapStyle = styleKey;
    localStorage.setItem('nolli_map_style', styleKey);

    panel.querySelectorAll('[data-map-style]').forEach((item) => {
      item.classList.toggle('active', item === option);
    });

    state.map.setStyle(MAP_STYLES[styleKey]);

    if (styleKey === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }

    panel.classList.remove('open');
    button.classList.remove('active-state');
    document.getElementById('panel-backdrop')?.classList.remove('active');
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
      markerElement.innerHTML = '<span class="location-pulse"></span><span class="location-core"></span>';
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