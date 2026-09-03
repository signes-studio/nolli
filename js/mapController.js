/* =========================================================================
   MAPCONTROLLER.JS — Inicialización de mapa, capas e interacciones (Nolli)
   ========================================================================= */

import { state, CATEGORY_META } from './state.js';
import { MAPBOX_TOKEN, MAP_STYLES, DEFAULT_CENTER, DEFAULT_ZOOM } from './config.js';
import { buildIcon, drawTargetIcon, drawPrivateSquareIcon, drawSearchLupaIcon, drawExploreCompassIcon, buildEmojiIcon } from './icons.js';
import { actualizarFuenteMapa } from './mapData.js';
import { abrirFicha, cerrarFicha } from './sheetUI.js';

/** Registra o actualiza los emojis de las listas del usuario en Mapbox */
export function registrarIconosColecciones() {
  if (typeof mapboxgl === 'undefined' || !state.map || !state.map.isStyleLoaded || !state.map.isStyleLoaded()) return;
  try {
    const isDark = state.mapStyle === 'dark' || document.body.classList.contains('dark-mode');
    if (state.userCollections && state.userCollections.length > 0) {
      state.userCollections.forEach((col) => {
        if (col && col.id && col.icon) {
          const emojiImageName = `collection-emoji-${col.id}`;
          try {
            const imgData = buildEmojiIcon(col.icon, isDark, 64);
            if (state.map.hasImage(emojiImageName)) {
              state.map.removeImage(emojiImageName);
            }
            state.map.addImage(emojiImageName, imgData, { pixelRatio: 2 });
          } catch (e) {}
        }
      });
    }
  } catch (err) {
    console.warn('Error en registrarIconosColecciones:', err);
  }
}

const ICON_LAYER_MINZOOMS = {
  0: 0,    // importancia máxima: siempre visible
  1: 0,    // importante: siempre visible
  2: 9.0,  // notable: a partir de zoom 9
  3: 12.0, // estándar: a partir de zoom 12
};

function ajustarZoomCapa(layerId, minzoom, maxzoom = 24) {
  if (!state.map || !state.map.getLayer(layerId) || typeof state.map.setLayerZoomRange !== 'function') return;
  try {
    state.map.setLayerZoomRange(layerId, minzoom, maxzoom);
  } catch (error) {
    console.warn(`No se pudo ajustar el zoom de la capa ${layerId}:`, error);
  }
}

export function actualizarVisibilidadIconosLista() {
  if (!state.map) return;
  const listaActiva = Boolean(state.activeItinerary && state.activeItinerary.isCollectionItinerary);

  [0, 1, 2, 3].forEach((importance) => {
    const baseMinZoom = listaActiva ? 0 : ICON_LAYER_MINZOOMS[importance];
    [`obras-l${importance}`, `obras-l${importance}-visited`, `obras-l${importance}-selected`, `obras-l${importance}-explore`, `obras-l${importance}-explore-selected`, `obras-l${importance}-pending`, `obras-l${importance}-private`].forEach((layerId) => {
      ajustarZoomCapa(layerId, baseMinZoom);
    });
  });
}

/** Crea el mapa, añade la capa de obras y arranca el HUD de coordenadas. */
export function cargarMapaMapbox() {
  if (typeof mapboxgl === 'undefined') {
    console.error('Mapbox GL JS no está disponible.');
    return;
  }
  mapboxgl.accessToken = MAPBOX_TOKEN;
  if (typeof mapboxgl.setTelemetryEnabled === 'function') {
    mapboxgl.setTelemetryEnabled(Boolean(window.nolliHasConsent?.('mapa_terceros')));
  }
  const savedStyle = localStorage.getItem('nolli_map_style');
  const savedTheme = localStorage.getItem('nolli_theme');
  if (savedStyle && MAP_STYLES[savedStyle]) {
    state.mapStyle = savedStyle;
  } else if (savedTheme === 'dark') {
    state.mapStyle = 'dark';
  } else {
    state.mapStyle = 'abstract';
  }
  const isDark = state.mapStyle === 'dark' || savedTheme === 'dark';
  document.documentElement?.classList.toggle('dark-mode', isDark);
  document.body?.classList.toggle('dark-mode', isDark);

  const isMobile = window.innerWidth <= 768;
  const initialStyle = MAP_STYLES[state.mapStyle] || MAP_STYLES.abstract;
  state.map = new mapboxgl.Map({
    container: 'map',
    style: initialStyle,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: true,
    fadeDuration: 0, // Cero delay de transición/fade para carga instantánea
    maxTileCacheSize: 200, // Caché extendida en memoria
    crossSourceCollisions: false,
  });

  state.map.on('error', (e) => {
    console.warn('Mapbox GL error:', e);
    const msg = String(e?.error?.message || e?.message || '');
    const status = e?.error?.status || e?.status;
    if (status === 401 || status === 403 || msg.includes('Forbidden') || msg.includes('Unauthorized')) {
      console.error('🚨 [NOLLI] Error de autorización de Mapbox (401/403). Si el token de Mapbox tiene restricciones de dominio en account.mapbox.com, añade "https://nollimap.app/*" a la lista de URLs autorizadas.');
    }
  });

  if (isMobile) {
    state.map.setPadding({ top: 10, bottom: 64, left: 0, right: 0 });
  }

  state.map.dragRotate?.disable?.();
  state.map.touchZoomRotate?.disableRotation?.();

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

  // OPCIONAL FIX #1: Usar CATEGORY_META centralizado
  const categoryColors = {};
  Object.entries(CATEGORY_META).forEach(([key, meta]) => {
    categoryColors[key] = meta.color;
  });

    const isDark = state.mapStyle === 'dark' || document.body.classList.contains('dark-mode');
    const selectedColor = isDark ? '#FFFFFF' : '#141411';

    [0, 1, 2, 3].forEach((importance) => {
      Object.entries(categoryColors).forEach(([cat, color]) => {
        const prefix = `icon-l${importance}-${cat}`;
        const searchPrefix = `icon-search-l${importance}-${cat}`;
        const explorePrefix = `icon-explore-l${importance}-${cat}`;

        try {
          if (!state.map.hasImage(prefix)) state.map.addImage(prefix, buildIcon(drawTargetIcon, color, importance), { pixelRatio: 2 });
          if (!state.map.hasImage(`${prefix}-visited`)) state.map.addImage(`${prefix}-visited`, buildIcon(drawTargetIcon, '#82c812', importance), { pixelRatio: 2 });
          if (!state.map.hasImage(`${prefix}-pending`)) state.map.addImage(`${prefix}-pending`, buildIcon(drawTargetIcon, '#FFCC00', importance), { pixelRatio: 2 });
          if (!state.map.hasImage(`${prefix}-private`)) state.map.addImage(`${prefix}-private`, buildIcon(drawPrivateSquareIcon, color, importance), { pixelRatio: 2 });
          if (!state.map.hasImage(`${prefix}-selected`)) state.map.addImage(`${prefix}-selected`, buildIcon(drawTargetIcon, selectedColor, importance), { pixelRatio: 2 });

          // Iconos de búsqueda (Lupa con color de categoría y tamaño por importancia)
          if (!state.map.hasImage(searchPrefix)) state.map.addImage(searchPrefix, buildIcon(drawSearchLupaIcon, color, importance), { pixelRatio: 2 });
          if (!state.map.hasImage(`${searchPrefix}-selected`)) state.map.addImage(`${searchPrefix}-selected`, buildIcon(drawSearchLupaIcon, selectedColor, importance), { pixelRatio: 2 });

          // Iconos de itinerario Explora (Brújula con color de categoría y tamaño por importancia)
          if (!state.map.hasImage(explorePrefix)) state.map.addImage(explorePrefix, buildIcon(drawExploreCompassIcon, color, importance), { pixelRatio: 2 });
          if (!state.map.hasImage(`${explorePrefix}-selected`)) state.map.addImage(`${explorePrefix}-selected`, buildIcon(drawExploreCompassIcon, selectedColor, importance), { pixelRatio: 2 });
        } catch (e) {}
      });
    });

    // Registrar emojis actuales
    registrarIconosColecciones();

    state.map.addSource('obras', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      promoteId: 'featureId',
      buffer: 512, // Pre-renderiza un buffer del 400% alrededor de la pantalla para desplazamiento sin lag
      tolerance: 0.25,
    });
    state.map.addSource('obras-maestras', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      promoteId: 'featureId',
      buffer: 512, // Pre-renderiza etiquetas maestras fuera del viewport
      tolerance: 0.25,
    });
    actualizarFuenteMapa();

    // 1. Indicador Sutil de Obras Favoritas (Fino contorno técnico perimetral que acompaña al icono)
    state.map.addLayer({
      id: 'obras-favorites-contour',
      type: 'circle',
      source: 'obras',
      filter: ['==', ['get', 'favorite'], 1],
      paint: {
        'circle-radius': 13.5,
        'circle-color': 'transparent',
        'circle-stroke-color': '#E84E1B',
        'circle-stroke-width': 1.2,
        'circle-stroke-opacity': 0.85,
        'circle-blur': 0,
        'circle-opacity': 1,
      },
    });

    state.map.addLayer({
      id: 'obras-maestras-favorites-contour',
      type: 'circle',
      source: 'obras-maestras',
      filter: ['==', ['get', 'favorite'], 1],
      paint: {
        'circle-radius': 16,
        'circle-color': 'transparent',
        'circle-stroke-color': '#E84E1B',
        'circle-stroke-width': 1.4,
        'circle-stroke-opacity': 0.9,
        'circle-blur': 0,
        'circle-opacity': 1,
      },
    });

    // 2. Indicador de Elemento Seleccionado (Diana CAD de Precisión + Sombra Dura Desplazada en Seco)
    // Sombra dura offset en negro sólido
    state.map.addLayer({
      id: 'obras-selected-offset-shadow',
      type: 'circle',
      source: 'obras',
      filter: ['==', ['get', 'selected'], 1],
      paint: {
        'circle-radius': 18,
        'circle-color': isDark ? '#000000' : '#141411',
        'circle-translate': [3.5, 3.5],
        'circle-blur': 0,
        'circle-opacity': 1,
      },
    });

    state.map.addLayer({
      id: 'obras-maestras-selected-offset-shadow',
      type: 'circle',
      source: 'obras-maestras',
      filter: ['==', ['get', 'selected'], 1],
      paint: {
        'circle-radius': 21,
        'circle-color': isDark ? '#000000' : '#141411',
        'circle-translate': [4, 4],
        'circle-blur': 0,
        'circle-opacity': 1,
      },
    });

    // Caja/Marco de precisión exterior
    state.map.addLayer({
      id: 'obras-selected-cad-box',
      type: 'circle',
      source: 'obras',
      filter: ['==', ['get', 'selected'], 1],
      paint: {
        'circle-radius': 18,
        'circle-color': isDark ? '#1C1C19' : '#F4F1EA',
        'circle-stroke-color': isDark ? '#FFFFFF' : '#141411',
        'circle-stroke-width': 2,
        'circle-blur': 0,
        'circle-opacity': 1,
      },
    });

    state.map.addLayer({
      id: 'obras-maestras-selected-cad-box',
      type: 'circle',
      source: 'obras-maestras',
      filter: ['==', ['get', 'selected'], 1],
      paint: {
        'circle-radius': 21,
        'circle-color': isDark ? '#1C1C19' : '#F4F1EA',
        'circle-stroke-color': isDark ? '#FFFFFF' : '#141411',
        'circle-stroke-width': 2.4,
        'circle-blur': 0,
        'circle-opacity': 1,
      },
    });

    // Retícula/Anillo técnico en Vermillón
    state.map.addLayer({
      id: 'obras-selected-cad-ring',
      type: 'circle',
      source: 'obras',
      filter: ['==', ['get', 'selected'], 1],
      paint: {
        'circle-radius': 14.5,
        'circle-color': 'transparent',
        'circle-stroke-color': '#E84E1B',
        'circle-stroke-width': 1.6,
        'circle-blur': 0,
        'circle-opacity': 1,
      },
    });

    state.map.addLayer({
      id: 'obras-maestras-selected-cad-ring',
      type: 'circle',
      source: 'obras-maestras',
      filter: ['==', ['get', 'selected'], 1],
      paint: {
        'circle-radius': 17,
        'circle-color': 'transparent',
        'circle-stroke-color': '#E84E1B',
        'circle-stroke-width': 1.8,
        'circle-blur': 0,
        'circle-opacity': 1,
      },
    });

    const IMPORTANCE_LABEL_CONFIG = {
      0: {
        font: ['Inter Bold', 'Open Sans Bold', 'Inter Bold'],
        size: 12.5,
        minzoom: 8.0, // Textos visibles a partir de zoom 8
      },
      1: {
        font: ['Inter Medium', 'Open Sans Semibold', 'Inter Bold'],
        size: 11.5,
        minzoom: 8.0, // Textos visibles a partir de zoom 8
      },
      2: {
        font: ['Inter Regular', 'Open Sans Regular', 'Inter Regular'],
        size: 11,
        minzoom: 14.5,
      },
      3: {
        font: ['Inter Light', 'Open Sans Light', 'Inter Regular'],
        size: 10,
        minzoom: 17.0,
      },
    };

    [3, 2, 1, 0].forEach((importance) => {
      // Importancia 0 y 1 visibles siempre (minzoom: 0); Importancia 2 a partir de zoom 12; Importancia 3 a partir de zoom 14
      const minzoom = (importance === 0 || importance === 1) ? 0 : importance === 2 ? 12.0 : 14.0;
      const baseFilter = ['==', ['get', 'importancia'], importance];
      const sourceId = (importance === 0 || importance === 1) ? 'obras-maestras' : 'obras';
      const iconSize = importance === 0 ? 0.92 : importance === 1 ? 0.70 : importance === 2 ? 0.56 : 0.52;
      const catExpr = ['coalesce', ['get', 'categoria'], 'otro'];
      const permitirSolapamiento = false; // Colisiones activas entre iconos; Mapbox requiere un valor booleano estricto
      const sortKeyExpr = (importance === 0 || importance === 1)
        ? ['coalesce', ['get', 'alpha_rank'], importance]
        : importance;

      const labelCfg = IMPORTANCE_LABEL_CONFIG[importance];
      const textFieldExpr = ['step', ['zoom'], '', labelCfg.minzoom, ['get', 'nombre_obra']];
      const textPaint = {
        'text-color': isDark ? '#FFFFFF' : '#04070B',
        'text-halo-color': isDark ? 'rgba(18, 18, 18, 0.95)' : 'rgba(248, 241, 223, 0.95)',
        'text-halo-width': 1.5,
        'text-halo-blur': 0.5,
      };
      const textLayout = {
        'text-field': textFieldExpr,
        'text-font': labelCfg.font,
        'text-size': labelCfg.size,
        'text-offset': [1.25, 0],
        'text-anchor': 'left',
        'text-justify': 'left',
        'text-max-width': 11,
        'text-padding': 4,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-optional': true,
        'symbol-avoid-edges': false,
        'text-pitch-alignment': 'viewport',
      };

      // Capa normal
      state.map.addLayer({
        id: `obras-l${importance}`,
        type: 'symbol',
        source: sourceId,
        minzoom,
        filter: ['all', baseFilter, ['==', ['get', 'estado_revision'], 'publicada'], ['!=', ['get', 'selected'], 1], ['!=', ['get', 'visited'], 1], ['!=', ['get', 'is_search'], 1], ['!=', ['get', 'is_explore'], 1]],
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
          'symbol-sort-key': sortKeyExpr,
          'icon-allow-overlap': permitirSolapamiento,
          'icon-ignore-placement': permitirSolapamiento,
          'icon-optional': false,
          ...textLayout,
        },
        paint: textPaint,
      });

      // Capa visitada
      state.map.addLayer({
        id: `obras-l${importance}-visited`,
        type: 'symbol',
        source: sourceId,
        minzoom,
        filter: ['all', baseFilter, ['==', ['get', 'estado_revision'], 'publicada'], ['!=', ['get', 'selected'], 1], ['==', ['get', 'visited'], 1], ['!=', ['get', 'is_search'], 1], ['!=', ['get', 'is_explore'], 1]],
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
          'symbol-sort-key': sortKeyExpr,
          'icon-allow-overlap': permitirSolapamiento,
          'icon-ignore-placement': permitirSolapamiento,
          'icon-optional': false,
          ...textLayout,
        },
        paint: textPaint,
      });

      // Capa seleccionada (Escalada 1.25x y con prioridad z-index 100, visible a cualquier zoom)
      state.map.addLayer({
        id: `obras-l${importance}-selected`,
        type: 'symbol',
        source: sourceId,
        minzoom: 0,
        filter: ['all', baseFilter, ['==', ['get', 'estado_revision'], 'publicada'], ['==', ['get', 'selected'], 1], ['!=', ['get', 'is_search'], 1], ['!=', ['get', 'is_explore'], 1]],
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
          'icon-optional': false,
        },
      });

      // Capa de resultados de búsqueda (Icono de LUPA, SIN REGLA DE ZOOM, color de categoría y tamaño por importancia)
      state.map.addLayer({
        id: `obras-l${importance}-search`,
        type: 'symbol',
        source: sourceId,
        minzoom: 0, // ¡Sin regla de zoom! Visible siempre a cualquier nivel de zoom
        filter: ['all', baseFilter, ['==', ['get', 'is_search'], 1], ['!=', ['get', 'selected'], 1]],
        layout: {
          'icon-image': ['concat', `icon-search-l${importance}-`, catExpr],
          'icon-size': iconSize * 1.15,
          'symbol-sort-key': 80 - importance,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-optional': false,
          ...textLayout,
        },
        paint: textPaint,
      });

      // Capa de búsqueda seleccionada
      state.map.addLayer({
        id: `obras-l${importance}-search-selected`,
        type: 'symbol',
        source: sourceId,
        minzoom: 0,
        filter: ['all', baseFilter, ['==', ['get', 'is_search'], 1], ['==', ['get', 'selected'], 1]],
        layout: {
          'icon-image': ['concat', `icon-search-l${importance}-`, catExpr, '-selected'],
          'icon-size': iconSize * 1.4,
          'symbol-sort-key': 100,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-optional': false,
        },
      });

      // Capa de itinerarios de Explora (Icono de BRÚJULA, SIN REGLA DE ZOOM, color de categoría y tamaño por importancia)
      state.map.addLayer({
        id: `obras-l${importance}-explore`,
        type: 'symbol',
        source: sourceId,
        minzoom: 0, // ¡Sin regla de zoom! Visible siempre a cualquier nivel de zoom mientras esté el itinerario activo
        filter: ['all', baseFilter, ['==', ['get', 'is_explore'], 1], ['!=', ['get', 'selected'], 1]],
        layout: {
          'icon-image': ['concat', `icon-explore-l${importance}-`, catExpr],
          'icon-size': iconSize * 1.15,
          'symbol-sort-key': 80 - importance,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-optional': false,
          ...textLayout,
        },
        paint: textPaint,
      });

      // Capa de itinerario de Explora seleccionado
      state.map.addLayer({
        id: `obras-l${importance}-explore-selected`,
        type: 'symbol',
        source: sourceId,
        minzoom: 0,
        filter: ['all', baseFilter, ['==', ['get', 'is_explore'], 1], ['==', ['get', 'selected'], 1]],
        layout: {
          'icon-image': ['concat', `icon-explore-l${importance}-`, catExpr, '-selected'],
          'icon-size': iconSize * 1.4,
          'symbol-sort-key': 100,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-optional': false,
        },
      });

      // Capa pendiente
      state.map.addLayer({
        id: `obras-l${importance}-pending`,
        type: 'symbol',
        source: sourceId,
        minzoom,
        filter: ['all', baseFilter, ['==', ['get', 'estado_revision'], 'pendiente'], ['!=', ['get', 'is_search'], 1], ['!=', ['get', 'is_explore'], 1]],
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
          'symbol-sort-key': sortKeyExpr,
          'icon-allow-overlap': permitirSolapamiento,
          'icon-ignore-placement': permitirSolapamiento,
          'icon-optional': false,
          ...textLayout,
        },
        paint: textPaint,
      });

      // Capa privada
      state.map.addLayer({
        id: `obras-l${importance}-private`,
        type: 'symbol',
        source: sourceId,
        minzoom,
        filter: ['all', baseFilter, ['==', ['get', 'estado_revision'], 'privada'], ['!=', ['get', 'is_search'], 1], ['!=', ['get', 'is_explore'], 1]],
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
          'symbol-sort-key': sortKeyExpr,
          'icon-allow-overlap': permitirSolapamiento,
          'icon-ignore-placement': permitirSolapamiento,
          'icon-optional': false,
          ...textLayout,
        },
        paint: textPaint,
      });

      [`obras-l${importance}`, `obras-l${importance}-visited`, `obras-l${importance}-selected`, `obras-l${importance}-search`, `obras-l${importance}-search-selected`, `obras-l${importance}-explore`, `obras-l${importance}-explore-selected`, `obras-l${importance}-pending`, `obras-l${importance}-private`].forEach((layerId) => {
        state.map.on('mouseenter', layerId, () => { state.map.getCanvas().style.cursor = 'pointer'; });
        state.map.on('mouseleave', layerId, () => { state.map.getCanvas().style.cursor = ''; });
      });
    });

    // Capa de etiqueta de la obra seleccionada (siempre visible y destacada)
    state.map.addLayer({
      id: 'obras-labels-selected',
      type: 'symbol',
      source: 'obras',
      filter: ['==', ['get', 'selected'], 1],
      layout: {
        'text-field': ['get', 'nombre_obra'],
        'text-font': ['Inter Bold', 'Open Sans Bold', 'Inter Bold'],
        'text-size': 13,
        'text-offset': [1.2, 0],
        'text-anchor': 'left',
        'text-justify': 'left',
        'text-max-width': 14,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'text-optional': false,
        'text-pitch-alignment': 'viewport',
        'symbol-sort-key': 100,
      },
      paint: {
        'text-color': isDark ? '#FFFFFF' : '#04070B',
        'text-halo-color': isDark ? 'rgba(18, 18, 18, 0.95)' : 'rgba(248, 241, 223, 0.95)',
        'text-halo-width': 2,
        'text-halo-blur': 0.5,
      },
    });

    state.map.addLayer({
      id: 'obras-maestras-labels-selected',
      type: 'symbol',
      source: 'obras-maestras',
      filter: ['==', ['get', 'selected'], 1],
      layout: {
        'text-field': ['get', 'nombre_obra'],
        'text-font': ['Inter Bold', 'Open Sans Bold', 'Inter Bold'],
        'text-size': 13.5,
        'text-offset': [1.2, 0],
        'text-anchor': 'left',
        'text-justify': 'left',
        'text-max-width': 14,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'text-optional': false,
        'text-pitch-alignment': 'viewport',
        'symbol-sort-key': 100,
      },
      paint: {
        'text-color': isDark ? '#FFFFFF' : '#04070B',
        'text-halo-color': isDark ? 'rgba(18, 18, 18, 0.95)' : 'rgba(248, 241, 223, 0.95)',
        'text-halo-width': 2,
        'text-halo-blur': 0.5,
      },
    });

    [
      'obras-favorites-contour',
      'obras-maestras-favorites-contour',
      'obras-selected-offset-shadow',
      'obras-maestras-selected-offset-shadow',
      'obras-selected-cad-box',
      'obras-maestras-selected-cad-box',
      'obras-selected-cad-ring',
      'obras-maestras-selected-cad-ring',
      'obras-l3', 'obras-l2', 'obras-l1', 'obras-l0',
      'obras-l3-visited', 'obras-l2-visited', 'obras-l1-visited', 'obras-l0-visited',
      'obras-l3-pending', 'obras-l2-pending', 'obras-l1-pending', 'obras-l0-pending',
      'obras-l3-private', 'obras-l2-private', 'obras-l1-private', 'obras-l0-private',
      'obras-l3-selected', 'obras-l2-selected', 'obras-l1-selected', 'obras-l0-selected',
      'obras-labels-l3', 'obras-labels-l2', 'obras-labels-l1', 'obras-labels-l0',
      'obras-labels-selected', 'obras-maestras-labels-selected',
    ].forEach((layerId) => {
      if (state.map.getLayer(layerId)) {
        state.map.moveLayer(layerId);
      }
    });

    iniciarInteraccionesMapa();
    actualizarVisibilidadIconosLista();

    if (state.userLocation) {
      actualizarMarcadorUbicacion(state.userLocation);
    }
    document.dispatchEvent(new CustomEvent('radar:map-ready'));
  };

  if (state.map.isStyleLoaded && state.map.isStyleLoaded()) {
    configurarCapas();
  }
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
  const floatBtn = document.getElementById('btn-float-add');
  if (button) {
    button.classList.toggle('active-state', state.addingBuilding);
    button.title = state.addingBuilding ? 'Selecciona una ubicación en el mapa' : 'Añadir obra';
  }
  if (floatBtn) {
    floatBtn.classList.toggle('active-state', state.addingBuilding);
    floatBtn.title = state.addingBuilding ? 'Selecciona una ubicación en el mapa' : 'Añadir Proyecto';
  }
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

  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-map-style-close')) {
      e.stopPropagation();
      panel.classList.remove('open');
      button.classList.remove('active-state');
      document.getElementById('panel-backdrop')?.classList.remove('active');
    }
  });

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

    const isDarkMode = styleKey === 'dark';
    document.documentElement.classList.toggle('dark-mode', isDarkMode);
    document.body.classList.toggle('dark-mode', isDarkMode);
    localStorage.setItem('nolli_theme', isDarkMode ? 'dark' : 'light');

    panel.classList.remove('open');
    button.classList.remove('active-state');
    document.getElementById('panel-backdrop')?.classList.remove('active');
  });
}

export function actualizarMarcadorUbicacion(coordinates) {
  if (!coordinates || !state.map) return;
  const lngLat = Array.isArray(coordinates)
    ? coordinates
    : [coordinates.lng, coordinates.lat];

  if (!Number.isFinite(lngLat[0]) || !Number.isFinite(lngLat[1])) return;

  state.userLocation = { lng: lngLat[0], lat: lngLat[1] };
  document.dispatchEvent(new CustomEvent('radar:user-location-updated', { detail: { lng: lngLat[0], lat: lngLat[1] } }));

  if (!state.locationMarker) {
    const markerElement = document.createElement('div');
    markerElement.className = 'location-marker';
    markerElement.innerHTML = '<span class="location-pulse"></span><span class="location-reticle"></span><span class="location-core"></span>';
    markerElement.setAttribute('aria-label', 'Tu ubicación actual');
    state.locationMarker = new mapboxgl.Marker({
      element: markerElement,
      pitchAlignment: 'map',
      rotationAlignment: 'map'
    })
      .setLngLat(lngLat)
      .addTo(state.map);
  } else {
    const markerEl = state.locationMarker.getElement();
    if (!markerEl || !markerEl.parentNode) {
      state.locationMarker.addTo(state.map);
    }
    state.locationMarker.setLngLat(lngLat);
  }

  const hudLng = document.getElementById('hud-lng');
  const hudLat = document.getElementById('hud-lat');
  if (hudLng) hudLng.textContent = lngLat[0].toFixed(5);
  if (hudLat) hudLat.textContent = lngLat[1].toFixed(5);
}

function mostrarToastUbicacion(mensaje) {
  let toast = document.getElementById('nolli-location-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'nolli-location-toast';
    toast.style.cssText = `
      position: fixed;
      left: 50%;
      bottom: 88px;
      transform: translateX(-50%);
      z-index: 2200;
      background: rgba(17, 17, 17, 0.96);
      color: #F4F1EA;
      border: 2px solid #E84E1B;
      box-shadow: 4px 4px 0px rgba(17, 17, 17, 0.9);
      padding: 10px 14px;
      max-width: min(88vw, 360px);
      font-family: 'Inter', sans-serif;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      line-height: 1.4;
      opacity: 0;
      transition: opacity 0.18s ease;
      pointer-events: none;
    `;
    document.body.appendChild(toast);
  }

  toast.textContent = mensaje;
  toast.style.opacity = '1';
  clearTimeout(toast._nolliToastTimer);
  toast._nolliToastTimer = setTimeout(() => {
    toast.style.opacity = '0';
  }, 2800);
}

function gestionarErrorUbicacion(error) {
  if (!error) {
    mostrarToastUbicacion('NO SE PUDO OBTENER TU UBICACIÓN');
    return;
  }
  switch (error.code) {
    case 1: // PERMISSION_DENIED
      mostrarToastUbicacion('PERMISO DENEGADO. ACTÍVALO EN TU NAVEGADOR');
      break;
    case 2: // POSITION_UNAVAILABLE
      mostrarToastUbicacion('UBICACIÓN NO DISPONIBLE EN ESTE MOMENTO');
      break;
    case 3: // TIMEOUT
      mostrarToastUbicacion('TIEMPO DE ESPERA AGOTADO AL BUSCAR UBICACIÓN');
      break;
    default:
      mostrarToastUbicacion(error.message || 'NO SE PUDO OBTENER TU UBICACIÓN');
  }
}

export function solicitarUbicacionUsuario() {
  if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    mostrarToastUbicacion('LA GEOLOCALIZACIÓN REQUIERE CONEXIÓN SEGURA (HTTPS)');
    return;
  }

  if (!navigator.geolocation) {
    mostrarToastUbicacion('GEOLOCALIZACIÓN NO DISPONIBLE EN ESTE NAVEGADOR');
    return;
  }

  const buttonDesktop = document.getElementById('btn-location');
  const buttonMobile = document.getElementById('btn-float-locate');
  buttonDesktop?.classList.add('location-active');
  buttonMobile?.classList.add('active-state');

  const finalizar = () => {
    buttonDesktop?.classList.remove('location-active');
    buttonMobile?.classList.remove('active-state');
  };

  const highAccuracyOptions = { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 };
  const fallbackOptions = { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 };

  const onSuccess = (position) => {
    finalizar();
    const coordinates = [position.coords.longitude, position.coords.latitude];
    actualizarMarcadorUbicacion(coordinates);
    if (state.map) {
      const zoomActual = (typeof state.map.getZoom === 'function') ? state.map.getZoom() : 14;
      state.map.flyTo({
        center: coordinates,
        zoom: Math.max(zoomActual, 15),
        duration: 800
      });
    }
  };

  const onError = (error) => {
    // Si falla por timeout o posición inaccesible con GPS de alta precisión, intentar con precisión estándar (IP / red WiFi)
    if (error && (error.code === 3 || error.code === 2)) {
      try {
        navigator.geolocation.getCurrentPosition(
          onSuccess,
          (fallbackError) => {
            finalizar();
            gestionarErrorUbicacion(fallbackError);
          },
          fallbackOptions
        );
        return;
      } catch (e) {
        // En caso de fallo en fallback, proceder con gestión estándar
      }
    }
    finalizar();
    gestionarErrorUbicacion(error);
  };

  // IMPORTANTE: Llamada síncrona directa dentro del gesto de usuario (click) para que Safari/iOS y navegadores estrictos muestren el diálogo nativo de permisos.
  try {
    navigator.geolocation.getCurrentPosition(onSuccess, onError, highAccuracyOptions);
  } catch (err) {
    finalizar();
    mostrarToastUbicacion('ERROR AL SOLICITAR UBICACIÓN');
  }
}

export function localizarDispositivo() {
  solicitarUbicacionUsuario();
}

function initHudReadout() {
  const hL = document.getElementById('hud-lng');
  const hLa = document.getElementById('hud-lat');
  const hZ = document.getElementById('hud-zoom');
  if (!hL && !hLa && !hZ) return;

  function actualizarHud(lngLat) {
    if (lngLat) {
      if (hL) hL.textContent = lngLat.lng.toFixed(5);
      if (hLa) hLa.textContent = lngLat.lat.toFixed(5);
    }
    if (hZ && state.map) {
      hZ.textContent = state.map.getZoom().toFixed(1);
    }
  }

  state.map.on('mousemove', (e) => actualizarHud(e.lngLat));
  state.map.on('move', () => actualizarHud());
  state.map.on('load', () => actualizarHud(state.map.getCenter()));
}

function resolveMapFeatureTarget(feature) {
  if (!feature || !feature.properties) return null;

  const props = feature.properties;
  const rawTargetId = props.id ?? props.featureId ?? props.building_id ?? props.obra_id ?? feature.id ?? null;
  const targetId = rawTargetId == null ? null : String(rawTargetId);

  const obra = state.OBRAS.find((item) => {
    const itemId = String(item.id ?? '');
    const featureId = String(item.featureId ?? '');
    return itemId === targetId || featureId === targetId || itemId === String(props.id ?? '') || featureId === String(props.featureId ?? '');
  });

  const coords = (obra && Array.isArray(obra.coordenadas)) ? obra.coordenadas : (Array.isArray(feature.geometry?.coordinates) ? feature.geometry.coordinates : [0, 0]);
  return { obra, targetId, coords };
}

function iniciarInteraccionesMapa() {
  const allLayerIds = [];
  [0, 1, 2, 3].forEach((imp) => {
    ['', '-visited', '-selected', '-search', '-search-selected', '-explore', '-explore-selected', '-pending', '-private'].forEach((suf) => {
      allLayerIds.push(`obras-l${imp}${suf}`);
    });
  });
  ['obras-labels-selected', 'obras-maestras-labels-selected'].forEach((id) => {
    allLayerIds.push(id);
  });

  const getActiveLayers = () => allLayerIds.filter((id) => Boolean(state.map?.getLayer(id)));

  const handleFeatureClick = (e) => {
    if (state.addingBuilding) return;
    const feature = e.features && e.features[0];
    const activeLayers = getActiveLayers();
    const fallbackFeature = !feature && state.map
      ? state.map.queryRenderedFeatures(e.point, { layers: activeLayers })[0]
      : null;
    const targetFeature = feature || fallbackFeature;
    if (!targetFeature) return;

    const resolved = resolveMapFeatureTarget(targetFeature);
    if (!resolved) return;

    const { obra, targetId, coords } = resolved;
    abrirFicha(obra || targetFeature.properties, coords, targetId || obra?.featureId || obra?.id || targetFeature.id);
  };

  allLayerIds.forEach((layerId) => {
    if (state.map.getLayer(layerId)) {
      state.map.on('click', layerId, handleFeatureClick);
    }
  });

  state.map.on('click', (e) => {
    if (state.addingBuilding) {
      state.addingBuilding = false;
      document.getElementById('btn-add-project')?.classList.remove('active-state');
      state.map.getCanvas().style.cursor = '';
      dispatchLongPress(e.lngLat);
      return;
    }
    const activeLayers = getActiveLayers();
    const isObra = state.map.queryRenderedFeatures(e.point, { layers: activeLayers });
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
