/* =========================================================================
   MAPCONTROLLER.JS — Inicialización de mapa, capas e interacciones (Nolli)
   ========================================================================= */

import { state, CATEGORY_META } from './state.js';
import {
  MAPBOX_TOKEN,
  MAP_STYLES,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  KNOWN_CITIES,
  resolverCoordenadasCiudad,
  obtenerCiudadCercana,
  calcularDistanciaKm
} from './config.js';
import { buildIcon, drawTargetIcon, drawPrivateSquareIcon, drawSearchLupaIcon, drawExploreCompassIcon, buildEmojiIcon } from './icons.js';
import { actualizarFuenteMapa } from './mapData.js';
import { abrirFicha, cerrarFicha } from './sheetUI.js';
import { showNeoToast } from './renderUtils.js';

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
  2: 6.5,  // notable: visible desde escala regional / metropolitana
  3: 13.5, // estándar / documentada: visible solo con zoom elevado (escala de barrio / calle)
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

/** Guarda la última ubicación o vista del usuario/dispositivo de forma persistente */
export function guardarUltimaUbicacion(lng, lat, zoom = 14, source = 'gps', cityName = null) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
  try {
    const detectedCity = cityName || state.manualLocationName || obtenerCiudadCercana(lng, lat) || null;
    const data = {
      lng,
      lat,
      zoom: Number.isFinite(zoom) ? zoom : 14,
      source,
      cityName: detectedCity,
      timestamp: Date.now()
    };
    localStorage.setItem('nolli_last_location', JSON.stringify(data));
  } catch (e) {}
}

/**
 * Resuelve el centro y zoom inicial del mapa según jerarquía inteligente:
 * 1. Parámetros de URL (?lat=...&lng=... o /obra/:id)
 * 2. Última ubicación guardada del dispositivo/usuario (GPS o exploración previa)
 * 3. Ciudad del perfil del usuario (resolución 0ms vía diccionario de ciudades)
 * 4. Fallback por defecto a Valencia
 */
export function obtenerCentroInicialMapa() {
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlLat = parseFloat(params.get('lat'));
      const urlLng = parseFloat(params.get('lng'));
      const urlZoom = parseFloat(params.get('zoom'));
      if (Number.isFinite(urlLat) && Number.isFinite(urlLng)) {
        return {
          center: [urlLng, urlLat],
          zoom: Number.isFinite(urlZoom) ? urlZoom : 16,
          isCustom: true,
          source: 'url'
        };
      }
    } catch (e) {}
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const savedLoc = localStorage.getItem('nolli_last_location');
      if (savedLoc) {
        const parsed = JSON.parse(savedLoc);
        const lng = Number(parsed.lng ?? parsed.center?.[0]);
        const lat = Number(parsed.lat ?? parsed.center?.[1]);
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          if (parsed.cityName && !state.manualLocationName) {
            state.manualLocationName = parsed.cityName;
          }
          if (parsed.source === 'gps') {
            state.userLocation = { lng, lat };
          }
          return {
            center: [lng, lat],
            zoom: Number.isFinite(parsed.zoom) ? parsed.zoom : (parsed.source === 'gps' ? 14 : DEFAULT_ZOOM),
            isCustom: true,
            source: parsed.source || 'storage'
          };
        }
      }
    } catch (e) {}

    try {
      const cachedProfile = localStorage.getItem('nolli_cached_db_profile') || localStorage.getItem('nolli_cached_user');
      if (cachedProfile) {
        const parsed = JSON.parse(cachedProfile);
        const userCity = parsed.city || parsed.user_metadata?.city;
        if (userCity) {
          const cityCoords = resolverCoordenadasCiudad(userCity);
          if (cityCoords) {
            state.manualLocationName = userCity;
            return {
              center: cityCoords,
              zoom: 13.5,
              isCustom: true,
              source: 'profile_city'
            };
          }
        }
      }
    } catch (e) {}
  }

  return {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    isCustom: false,
    source: 'default'
  };
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
  // Aceleración de procesamiento multi-hilo en Web Workers
  try {
    mapboxgl.workerCount = Math.min(navigator.hardwareConcurrency || 4, 6);
    mapboxgl.maxParallelImageRequests = 32;
  } catch (e) {}

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
  const initialPos = obtenerCentroInicialMapa();
  state.map = new mapboxgl.Map({
    container: 'map',
    style: initialStyle,
    center: initialPos.center,
    zoom: initialPos.zoom,
    attributionControl: false,
    fadeDuration: 0, // Cero delay de transición/fade para carga instantánea
    maxTileCacheSize: 300, // Caché extendida de teselas en memoria RAM
    crossSourceCollisions: false,
    renderWorldCopies: false, // Optimización GPU: no duplicar el mundo fuera de los límites
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2), // Límite 2x: ahorra >50% de fill rate en pantallas 3x/4x sin merma visual
    touchZoomRotate: true,
    dragPan: true,
    dragRotate: true,
    touchPitch: false,
    pitchWithRotate: false,
    cooperativeGestures: false,
    clickTolerance: isMobile ? 7 : 3,
    canvasContextAttributes: {
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      antialias: false // Desactivar hardware 4x MSAA en móvil elimina el cuello de botella de fill-rate y baja la latencia táctil a 0ms (60-120fps puros)
    }
  });
  window.nolliMap = state.map;

  // Persistencia de la última vista explorada con debounce (para reabrir donde el usuario estuvo)
  let debounceSaveView = null;
  state.map.on('moveend', () => {
    clearTimeout(debounceSaveView);
    debounceSaveView = setTimeout(() => {
      if (!state.map) return;
      if (window.location.pathname.includes('/obra/')) return;
      const center = state.map.getCenter();
      const zoom = state.map.getZoom();
      if (center && Number.isFinite(center.lng) && Number.isFinite(center.lat)) {
        guardarUltimaUbicacion(center.lng, center.lat, zoom, 'explored');
      }
    }, 1500);
  });

  // La atribución obligatoria de Mapbox y OpenStreetMap se gestiona en el modal unificado de información legal (botón ⓘ)

  state.map.on('error', (e) => {
    console.warn('Mapbox GL error:', e);
    const msg = String(e?.error?.message || e?.message || '');
    const status = e?.error?.status || e?.status;
    if (status === 401 || status === 403 || msg.includes('Forbidden') || msg.includes('Unauthorized')) {
      console.error('NOLLI: Error de autorización de Mapbox (401/403). Si el token de Mapbox tiene restricciones de dominio en account.mapbox.com, añade "https://nollimap.app/*" a la lista de URLs autorizadas.');
    }
  });

  if (isMobile) {
    state.map.setPadding({ top: 10, bottom: 64, left: 0, right: 0 });
  }

  // Estabilización y calibración táctil de alto rendimiento (paridad con Google Maps)
  state.map.dragRotate?.enable?.();
  state.map.touchPitch?.disable?.();

  // Desactivar tapDragZoom (zoom de un dedo por doble toque vertical)
  // que secuestra el desplazamiento y bloquea el arrastre si se mueve en horizontal
  if (state.map.touchZoomRotate?._tapDragZoom) {
    state.map.touchZoomRotate._tapDragZoom.disable();
  }
  if (state.map.handlers?._handlersById?.tapDragZoom) {
    state.map.handlers._handlersById.tapDragZoom.disable();
  }
  if (typeof state.map.touchZoomRotate?.disableTapDragZoom === 'function') {
    state.map.touchZoomRotate.disableTapDragZoom();
  }

  // Calibración táctil de zoom y rotación:
  // En móviles táctiles, desactivar la rotación de dos dedos durante el pellizco.
  // El arco natural de los dedos al hacer zoom genera 10°-18° de giro involuntario que
  // provoca giros indeseados del mapa, caída severa de FPS y recálculo masivo de colisiones tipográficas.
  // Al deshabilitar la rotación táctil en móvil, el pinch-to-zoom responde 1:1 de forma instantánea y estable,
  // con la misma fluidez y firmeza que Google Maps.
  const calibrarGestosTactiles = () => {
    const esDispositivoTactil = window.innerWidth <= 768 || ('ontouchstart' in window && window.innerWidth <= 1024);
    if (state.map?.touchZoomRotate) {
      state.map.touchZoomRotate.enable();
      if (esDispositivoTactil) {
        state.map.touchZoomRotate.disableRotation();
      } else {
        state.map.touchZoomRotate.enableRotation();
      }
    }
  };
  calibrarGestosTactiles();
  window.addEventListener('resize', calibrarGestosTactiles, { passive: true });

  // Cinética e inercia de desplazamiento táctil idéntica a Google Maps:
  // - maxSpeed: 2400 px/s (permite movimientos rápidos sin recortar artificialmente el impulso a 1400)
  // - deceleration: 1850 px/s² (desaceleración suave, flotante y continua en lugar del frenazo seco a 2500)
  // - linearity: 0.25 (armoniza la velocidad de despegue del dedo con la inercia cinética)
  // - easing: desaceleración cuadrática suave (t * (2 - t))
  if (state.map.dragPan) {
    state.map.dragPan.enable({
      linearity: 0.25,
      easing: (t) => t * (2 - t),
      deceleration: 1850,
      maxSpeed: 2400
    });
  }

  // Redimensionamiento y ajuste dinámico de padding en dispositivos táctiles
  let resizeTimeout = null;
  let lastWindowWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth !== lastWindowWidth) {
      lastWindowWidth = window.innerWidth;
      state.map?.resize();
      if (window.innerWidth <= 768) {
        state.map?.setPadding({ top: 10, bottom: 64, left: 0, right: 0 });
      } else {
        state.map?.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
      }
      return;
    }
    // Si solo cambia la altura (aparición/ocultación de la barra de dirección en móvil),
    // no interrumpir la inercia del desplazamiento táctil; posponer el resize hasta que el gesto termine
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      state.map?.resize();
    }, 400);
  }, { passive: true });

  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      state.map?.resize();
    }, 150);
  }, { passive: true });

  const configurarCapas = () => {
    if (state.map.getSource('obras')) return;
    aplicarTratamientoSatelite();

    const categoryColors = {};
    Object.entries(CATEGORY_META).forEach(([key, meta]) => {
      categoryColors[key] = meta.color;
    });

    const isSatellite = state.mapStyle === 'satellite';
    const isDark = !isSatellite && (state.mapStyle === 'dark' || document.body.classList.contains('dark-mode'));
    const selectedColor = (isDark || isSatellite) ? '#FFFFFF' : '#141411';

    // Función auxiliar para forzar la actualización de imagen sin que Mapbox mantenga la vieja en caché
    const addOrUpdateImage = (name, imgData) => {
      if (state.map.hasImage(name)) {
        state.map.removeImage(name);
      }
      state.map.addImage(name, imgData, { pixelRatio: 2 });
    };

    [0, 1, 2, 3].forEach((importance) => {
      Object.entries(categoryColors).forEach(([cat, color]) => {
        const prefix = `icon-l${importance}-${cat}`;
        const searchPrefix = `icon-search-l${importance}-${cat}`;
        const explorePrefix = `icon-explore-l${importance}-${cat}`;

        try {
          addOrUpdateImage(prefix, buildIcon(drawTargetIcon, color, importance, 64, { isDark }));
          addOrUpdateImage(`${prefix}-visited`, buildIcon(drawTargetIcon, color, importance, 64, { isVisited: true, isDark }));
          addOrUpdateImage(`${prefix}-favorite`, buildIcon(drawTargetIcon, color, importance, 64, { isFavorite: true, isDark }));
          addOrUpdateImage(`${prefix}-visited-favorite`, buildIcon(drawTargetIcon, color, importance, 64, { isVisited: true, isFavorite: true, isDark }));
          addOrUpdateImage(`${prefix}-pending`, buildIcon(drawTargetIcon, color, importance, 64, { isPending: true, isDark }));
          addOrUpdateImage(`${prefix}-private`, buildIcon(drawPrivateSquareIcon, color, importance, 64, { isDark }));
          addOrUpdateImage(`${prefix}-selected`, buildIcon(drawTargetIcon, selectedColor, importance, 64, { isSelected: true, isDark }));

          // Iconos de búsqueda
          addOrUpdateImage(searchPrefix, buildIcon(drawSearchLupaIcon, color, importance, 64, { isDark }));
          addOrUpdateImage(`${searchPrefix}-selected`, buildIcon(drawSearchLupaIcon, selectedColor, importance, 64, { isSelected: true, isDark }));

          // Iconos de itinerario Explora
          addOrUpdateImage(explorePrefix, buildIcon(drawExploreCompassIcon, color, importance, 64, { isDark }));
          addOrUpdateImage(`${explorePrefix}-selected`, buildIcon(drawExploreCompassIcon, selectedColor, importance, 64, { isSelected: true, isDark }));
        } catch (e) {}
      });
    });

    // Registrar emojis actuales
    registrarIconosColecciones();

    state.map.addSource('obras', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      promoteId: 'featureId',
      buffer: 256,
      tolerance: 0.375,
      maxzoom: 16,
    });
    state.map.addSource('obras-maestras', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      promoteId: 'featureId',
      buffer: 256,
      tolerance: 0.375,
      maxzoom: 16,
    });
    actualizarFuenteMapa();

    // 1. Indicador Sutil de Obras Favoritas
    state.map.addLayer({
      id: 'obras-favorites-contour',
      type: 'circle',
      source: 'obras',
      filter: ['==', ['get', 'favorite'], 1],
      paint: {
        'circle-radius': 15,
        'circle-color': 'rgba(234, 86, 13, 0.08)',
        'circle-stroke-color': 'rgb(234, 86, 13)',
        'circle-stroke-width': 1.4,
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
        'circle-radius': 18,
        'circle-color': 'rgba(234, 86, 13, 0.08)',
        'circle-stroke-color': 'rgb(234, 86, 13)',
        'circle-stroke-width': 1.6,
        'circle-stroke-opacity': 0.85,
        'circle-blur': 0,
        'circle-opacity': 1,
      },
    });

    // 2. Indicador de Elemento Seleccionado: Anillo único limpio (Vermillón Nolli)
    state.map.addLayer({
      id: 'obras-selected-ring',
      type: 'circle',
      source: 'obras',
      filter: ['==', ['get', 'selected'], 1],
      paint: {
        'circle-radius': 15.5,
        'circle-color': 'transparent',
        'circle-stroke-color': '#EA560D',
        'circle-stroke-width': 2.5,
        'circle-stroke-opacity': 1,
        'circle-blur': 0,
        'circle-opacity': 1,
      },
    });

    state.map.addLayer({
      id: 'obras-maestras-selected-ring',
      type: 'circle',
      source: 'obras-maestras',
      filter: ['==', ['get', 'selected'], 1],
      paint: {
        'circle-radius': 18.5,
        'circle-color': 'transparent',
        'circle-stroke-color': '#EA560D',
        'circle-stroke-width': 2.5,
        'circle-stroke-opacity': 1,
        'circle-blur': 0,
        'circle-opacity': 1,
      },
    });

    function crearExpresionEtiquetaFormateada(titleFont, isDark, isSatellite, options = {}) {
      let titleColor = '#04070B';
      let architectColor = '#525866';
      const isUppercase = Boolean(options.isUppercase);

      if (isSatellite) {
        titleColor = '#FFFFFF';
        architectColor = '#FFFFFF';
      } else if (isDark) {
        titleColor = '#FFFFFF';
        architectColor = '#A3ADC2';
      }
      const architectFont = ['Inter Regular', 'Open Sans Regular', 'Inter Regular'];
      const rawTitle = ['get', 'nombre_obra'];
      const titleTextExpr = isUppercase ? ['upcase', rawTitle] : rawTitle;

      return [
        'case',
        ['all', ['has', 'arquitecto'], ['!=', ['get', 'arquitecto'], '']],
        [
          'format',
          titleTextExpr,
          {
            'font-scale': isUppercase ? 1.05 : 1.0,
            'text-font': ['literal', titleFont],
            'text-color': titleColor,
          },
          '\n',
          {
            'font-scale': 0.25,
          },
          ['upcase', ['get', 'arquitecto']],
          {
            'font-scale': 0.76,
            'text-font': ['literal', architectFont],
            'text-color': architectColor,
          }
        ],
        [
          'format',
          titleTextExpr,
          {
            'font-scale': isUppercase ? 1.05 : 1.0,
            'text-font': ['literal', titleFont],
            'text-color': titleColor,
          }
        ]
      ];
    }

    const IMPORTANCE_LABEL_CONFIG = {
      0: {
        font: ['Inter Bold', 'Open Sans Bold', 'Inter Bold'],
        size: 14.0,
        minzoom: 5.5,
        isUppercase: true,
      },
      1: {
        font: ['Inter SemiBold', 'Open Sans Semibold', 'Inter Bold'],
        size: 10.8,
        minzoom: 13.8,
        isUppercase: false,
      },
      2: {
        font: ['Inter Medium', 'Open Sans Regular', 'Inter Regular'],
        size: 9.6,
        minzoom: 15.0,
        isUppercase: false,
      },
      3: {
        font: ['Inter Regular', 'Open Sans Regular', 'Inter Regular'],
        size: 8.8,
        minzoom: 16.0,
        isUppercase: false,
      },
    };

    [3, 2, 1, 0].forEach((importance) => {
      const minzoom = (importance === 0 || importance === 1) ? 0 : importance === 2 ? 6.5 : 13.5;
      const baseFilter = ['==', ['get', 'importancia'], importance];
      const sourceId = (importance === 0 || importance === 1) ? 'obras-maestras' : 'obras';
      const iconSize = importance === 0 ? 0.96 : importance === 1 ? 0.90 : importance === 2 ? 0.68 : 0.44;
      const catExpr = ['coalesce', ['get', 'categoria'], 'otro'];
      const permitirSolapamiento = false;
      const sortKeyExpr = (importance === 0 || importance === 1)
        ? ['coalesce', ['get', 'alpha_rank'], importance]
        : importance;

      const labelCfg = IMPORTANCE_LABEL_CONFIG[importance];
      const formattedLabelExpr = crearExpresionEtiquetaFormateada(labelCfg.font, isDark, isSatellite, { isUppercase: labelCfg.isUppercase });
      const textFieldExpr = ['step', ['zoom'], ['format', ''], labelCfg.minzoom, formattedLabelExpr];
      const haloColor = isSatellite ? '#000000' : (isDark ? '#121212' : '#F8F1DF');
      const textPaint = {
        'text-color': isSatellite ? '#FFFFFF' : (isDark ? '#FFFFFF' : '#04070B'),
        'text-halo-color': haloColor,
        'text-halo-width': isSatellite ? 2.0 : 1.8,
        'text-halo-blur': 0.2,
      };
      const textLayout = {
        'text-field': textFieldExpr,
        'text-font': labelCfg.font,
        'text-size': labelCfg.size,
        'text-offset': [1.15, 0],
        'text-anchor': 'left',
        'text-justify': 'left',
        'text-max-width': 14.0,
        'text-line-height': 1.15,
        'text-padding': 8,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-optional': true,
        'symbol-avoid-edges': true,
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
            ['==', ['get', 'favorite'], 1], ['concat', `icon-l${importance}-`, catExpr, '-favorite'],
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
            ['==', ['get', 'favorite'], 1], ['concat', `icon-l${importance}-`, catExpr, '-visited-favorite'],
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

      // Capa seleccionada
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

      // Capa de resultados de búsqueda
      state.map.addLayer({
        id: `obras-l${importance}-search`,
        type: 'symbol',
        source: sourceId,
        minzoom: 0,
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

      // Capa de itinerarios de Explora
      state.map.addLayer({
        id: `obras-l${importance}-explore`,
        type: 'symbol',
        source: sourceId,
        minzoom: 0,
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

    // Capa de etiqueta de la obra seleccionada
    const selectedTitleFont = ['Inter Bold', 'Open Sans Bold', 'Inter Bold'];
    const selectedLabelExpr = crearExpresionEtiquetaFormateada(selectedTitleFont, isDark, isSatellite);
    const selectedHaloColor = isSatellite ? '#000000' : (isDark ? '#121212' : '#F8F1DF');

    state.map.addLayer({
      id: 'obras-labels-selected',
      type: 'symbol',
      source: 'obras',
      filter: ['==', ['get', 'selected'], 1],
      layout: {
        'text-field': selectedLabelExpr,
        'text-font': selectedTitleFont,
        'text-size': 13,
        'text-offset': [1.15, 0],
        'text-anchor': 'left',
        'text-justify': 'left',
        'text-max-width': 15,
        'text-line-height': 1.15,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-padding': 10,
        'symbol-avoid-edges': true,
        'text-optional': false,
        'text-pitch-alignment': 'viewport',
        'symbol-sort-key': 0,
      },
      paint: {
        'text-color': isSatellite ? '#FFFFFF' : (isDark ? '#FFFFFF' : '#04070B'),
        'text-halo-color': selectedHaloColor,
        'text-halo-width': isSatellite ? 2.4 : 2.2,
        'text-halo-blur': 0.2,
      },
    });

    state.map.addLayer({
      id: 'obras-maestras-labels-selected',
      type: 'symbol',
      source: 'obras-maestras',
      filter: ['==', ['get', 'selected'], 1],
      layout: {
        'text-field': selectedLabelExpr,
        'text-font': selectedTitleFont,
        'text-size': 13.5,
        'text-offset': [1.15, 0],
        'text-anchor': 'left',
        'text-justify': 'left',
        'text-max-width': 15,
        'text-line-height': 1.15,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-padding': 10,
        'symbol-avoid-edges': true,
        'text-optional': false,
        'text-pitch-alignment': 'viewport',
        'symbol-sort-key': 0,
      },
      paint: {
        'text-color': isSatellite ? '#FFFFFF' : (isDark ? '#FFFFFF' : '#04070B'),
        'text-halo-color': selectedHaloColor,
        'text-halo-width': isSatellite ? 2.4 : 2.2,
        'text-halo-blur': 0.2,
      },
    });

    [
      'obras-favorites-contour',
      'obras-maestras-favorites-contour',
      'obras-selected-ring',
      'obras-maestras-selected-ring',
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


  document.getElementById('btn-recenter')?.addEventListener('click', () => {
    const target = state.userLocation
      ? (Array.isArray(state.userLocation) ? state.userLocation : [state.userLocation.lng, state.userLocation.lat])
      : (obtenerCentroInicialMapa().center || DEFAULT_CENTER);
    state.map.flyTo({ center: target, zoom: 14.5, bearing: 0, pitch: 0 });
  });
  document.getElementById('btn-location')?.addEventListener('click', localizarDispositivo);
  document.getElementById('btn-add-project')?.addEventListener('click', activarModoAñadir);
  initMapStyleSelector();
  initMapCompass();
  document.addEventListener('radar:admin-login', actualizarFuenteMapa);
  document.addEventListener('radar:user-login', actualizarFuenteMapa);
  document.addEventListener('radar:logout', actualizarFuenteMapa);
  document.addEventListener('radar:admin-mode-change', actualizarFuenteMapa);
}

function activarModoAñadir() {
  if (!state.sessionToken) {
    showNeoToast('Inicia sesión para proponer una nueva obra.');
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

function getCardinalDirection(bearing) {
  const deg = ((bearing % 360) + 360) % 360;
  if (deg >= 315 || deg < 45) return 'N';
  if (deg >= 45 && deg < 135) return 'E';
  if (deg >= 135 && deg < 225) return 'S';
  return 'O'; // 225 <= deg < 315 (Oeste en español)
}

function initMapCompass() {
  const compassBtn = document.getElementById('btn-map-compass');
  const needle = document.getElementById('compass-needle');
  const dirLabel = document.getElementById('compass-direction-label');
  if (!compassBtn) return;

  const updateCompass = () => {
    if (!state.map) return;
    const bearing = state.map.getBearing() || 0;
    // La línea perpendicular en el contorno rota hacia el Norte geográfico
    if (needle) {
      needle.style.transform = `rotate(${-bearing}deg)`;
      needle.setAttribute('transform', `rotate(${-bearing} 16 16)`);
    }
    const isRotated = Math.abs(bearing) > 0.5;
    const cardinal = getCardinalDirection(bearing);
    if (dirLabel && dirLabel.textContent !== cardinal) {
      dirLabel.textContent = cardinal;
    }
    compassBtn.classList.toggle('is-rotated', isRotated);
    compassBtn.setAttribute('data-rotated', isRotated ? 'true' : 'false');
    compassBtn.setAttribute('aria-label', `Orientación ${cardinal}. Restablecer orientación al Norte`);
    compassBtn.title = `Orientación: ${cardinal} (clic para volver al Norte)`;
  };

  state.map.on('rotate', updateCompass);
  state.map.on('rotatestart', updateCompass);
  state.map.on('rotateend', updateCompass);
  // NOTA: Se elimina state.map.on('move', updateCompass) para evitar mutaciones de DOM y recálculos
  // de layout a 60-120Hz durante el desplazamiento del mapa (el bearing no cambia durante el pan).
  updateCompass();

  compassBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!state.map) return;
    if (typeof state.map.resetNorthPitch === 'function') {
      state.map.resetNorthPitch({ duration: 450 });
    } else {
      state.map.easeTo({ bearing: 0, pitch: 0, duration: 450 });
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
    try {
      localStorage.setItem('nolli_map_style', styleKey);
    } catch {}

    panel.querySelectorAll('[data-map-style]').forEach((item) => {
      item.classList.toggle('active', item === option);
    });

    state.map.setStyle(MAP_STYLES[styleKey]);

    const isDarkMode = styleKey === 'dark';
    document.documentElement.classList.toggle('dark-mode', isDarkMode);
    document.body.classList.toggle('dark-mode', isDarkMode);
    try {
      localStorage.setItem('nolli_theme', isDarkMode ? 'dark' : 'light');
    } catch {}

    panel.classList.remove('open');
    button.classList.remove('active-state');
    document.getElementById('panel-backdrop')?.classList.remove('active');
  });
}

export function actualizarMarcadorUbicacion(coordinates, guardar = true) {
  if (!coordinates) return;
  const lngLat = Array.isArray(coordinates)
    ? coordinates
    : [coordinates.lng, coordinates.lat];

  if (!Number.isFinite(lngLat[0]) || !Number.isFinite(lngLat[1])) return;

  state.userLocation = { lng: lngLat[0], lat: lngLat[1] };

  if (guardar) {
    const nearbyCity = obtenerCiudadCercana(lngLat[0], lngLat[1]);
    if (nearbyCity && !state.manualLocationName) {
      state.manualLocationName = nearbyCity;
    }
    guardarUltimaUbicacion(lngLat[0], lngLat[1], 14.5, 'gps', nearbyCity);
  }

  document.dispatchEvent(new CustomEvent('radar:user-location-updated', { detail: { lng: lngLat[0], lat: lngLat[1] } }));

  if (!state.map) return;

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
      border: 2px solid #EA560D;
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
    case 1:
      mostrarToastUbicacion('PERMISO DENEGADO. ACTÍVALO EN TU NAVEGADOR');
      break;
    case 2:
      mostrarToastUbicacion('UBICACIÓN NO DISPONIBLE EN ESTE MOMENTO');
      break;
    case 3:
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
    actualizarMarcadorUbicacion(coordinates, true);
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
      } catch (e) {}
    }
    finalizar();
    gestionarErrorUbicacion(error);
  };

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

let localizacionAutomaticaIniciada = false;

/**
 * Localización automática proactiva al abrir la app:
 * Comprueba permisos de geolocalización o solicita posición en móviles/PWA
 * para centrar la aplicación directamente en la ciudad donde se encuentra el dispositivo.
 */
export async function iniciarLocalizacionAutomatica() {
  if (typeof window === 'undefined' || localizacionAutomaticaIniciada) return;
  localizacionAutomaticaIniciada = true;

  const urlParams = new URLSearchParams(window.location.search);
  const tieneUrlCoordenadas = Number.isFinite(parseFloat(urlParams.get('lat'))) && Number.isFinite(parseFloat(urlParams.get('lng')));
  const tieneUrlObra = window.location.pathname.includes('/obra/');
  const omitirDesplazamientoMapa = tieneUrlCoordenadas || tieneUrlObra;

  // Si el navegador soporta navigator.permissions
  if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' });
      
      const responderAPermiso = (estado) => {
        if (estado === 'granted') {
          solicitarGeolocalizacionSilenciosa(omitirDesplazamientoMapa);
        } else if (estado === 'prompt') {
          // Si el usuario está en móvil o PWA, solicitar suavemente
          const esMovilOPWA = window.innerWidth <= 768 || window.matchMedia('(display-mode: standalone)').matches || Boolean(navigator.standalone);
          if (esMovilOPWA) {
            solicitarGeolocalizacionSilenciosa(omitirDesplazamientoMapa);
          }
        }
      };

      responderAPermiso(perm.state);
      perm.onchange = () => {
        responderAPermiso(perm.state);
      };
      return;
    } catch (e) {
      // Ignorar fallos de permissions.query en navegadores antiguos
    }
  }

  // Fallback si no hay Permissions API pero sí Geolocation
  if (navigator.geolocation) {
    const esMovilOPWA = typeof window !== 'undefined' && (window.innerWidth <= 768 || window.matchMedia('(display-mode: standalone)').matches || Boolean(navigator.standalone));
    if (esMovilOPWA) {
      solicitarGeolocalizacionSilenciosa(omitirDesplazamientoMapa);
    }
  }
}

/**
 * Solicita geolocalización en 2 etapas:
 * 1. Etapa rápida (low accuracy, <200ms) para detectar de inmediato la ciudad (Alicante, etc.) y centrar el mapa.
 * 2. Etapa de alta precisión en segundo plano para posicionar el marcador exacto en la calle/edificio.
 */
export function solicitarGeolocalizacionSilenciosa(skipMapFly = false) {
  if (!navigator.geolocation) return;

  // Fase 1: Coordenadas rápidas de baja precisión
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const coords = [pos.coords.longitude, pos.coords.latitude];
      const accuracy = pos.coords.accuracy || 1000;
      
      actualizarMarcadorUbicacion(coords, true);

      if (!skipMapFly && state.map) {
        const currentCenter = state.map.getCenter();
        const distKm = calcularDistanciaKm(currentCenter.lat, currentCenter.lng, coords[1], coords[0]);
        // Si estamos a más de 400m de donde abrió el mapa (ej. abrió en Valencia y está en Alicante), volar a su ubicación real
        if (distKm > 0.4) {
          state.map.flyTo({
            center: coords,
            zoom: 14.5,
            duration: 1100,
            essential: true
          });
        }
      }

      // Fase 2: Si la precisión fue aproximada (>100m), afinar silenciosamente con GPS satélite
      if (accuracy > 100) {
        try {
          navigator.geolocation.getCurrentPosition(
            (highPos) => {
              const highCoords = [highPos.coords.longitude, highPos.coords.latitude];
              actualizarMarcadorUbicacion(highCoords, true);
            },
            () => {},
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
          );
        } catch (e) {}
      }
    },
    (err) => {
      // Modo silencioso: jamás mostrar toasts de error intrusivos en el arranque inicial
      console.log('[Nolli Geo] Localización proactiva no disponible:', err?.message || err);
    },
    { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 }
  );
}

function initHudReadout() {
  const hL = document.getElementById('hud-lng');
  const hLa = document.getElementById('hud-lat');
  const hZ = document.getElementById('hud-zoom');
  if (!hL && !hLa && !hZ) return;

  function actualizarHud(lngLat) {
    if (window.innerWidth <= 768) return; // En pantallas táctiles móviles el HUD no se muestra; cero mutaciones DOM
    if (lngLat) {
      if (hL) hL.textContent = lngLat.lng.toFixed(5);
      if (hLa) hLa.textContent = lngLat.lat.toFixed(5);
    }
    if (hZ && state.map) {
      hZ.textContent = state.map.getZoom().toFixed(1);
    }
  }

  state.map.on('mousemove', (e) => actualizarHud(e.lngLat));
  state.map.on('moveend', () => actualizarHud());
  state.map.on('load', () => actualizarHud(state.map.getCenter()));
}

let lastObrasIndexRef = null;
const obraFastLookupMap = new Map();

function getObraByIdFast(targetId, propId, featureId) {
  if (!state.OBRAS) return null;
  if (state.OBRAS !== lastObrasIndexRef) {
    lastObrasIndexRef = state.OBRAS;
    obraFastLookupMap.clear();
    state.OBRAS.forEach((o) => {
      if (o.id != null) obraFastLookupMap.set(String(o.id), o);
      if (o.featureId != null) obraFastLookupMap.set(String(o.featureId), o);
    });
  }
  if (targetId && obraFastLookupMap.has(String(targetId))) return obraFastLookupMap.get(String(targetId));
  if (propId && obraFastLookupMap.has(String(propId))) return obraFastLookupMap.get(String(propId));
  if (featureId && obraFastLookupMap.has(String(featureId))) return obraFastLookupMap.get(String(featureId));
  return null;
}

function resolveMapFeatureTarget(feature) {
  if (!feature || !feature.properties) return null;

  const props = feature.properties;
  const rawTargetId = props.id ?? props.featureId ?? props.building_id ?? props.obra_id ?? feature.id ?? null;
  const targetId = rawTargetId == null ? null : String(rawTargetId);

  const obra = getObraByIdFast(targetId, props.id, props.featureId) || state.OBRAS.find((item) => {
    const itemId = String(item.id ?? '');
    const featureId = String(item.featureId ?? '');
    return itemId === targetId || featureId === targetId || itemId === String(props.id ?? '') || featureId === String(props.featureId ?? '');
  });

  const coords = (obra && Array.isArray(obra.coordenadas)) ? obra.coordenadas : (Array.isArray(feature.geometry?.coordinates) ? feature.geometry.coordinates : [0, 0]);
  return { obra, targetId, coords };
}

function iniciarInteraccionesMapa() {
  if (state._interaccionesIniciadas) return;
  state._interaccionesIniciadas = true;

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

  state.map.on('click', (e) => {
    if (state.addingBuilding) {
      state.addingBuilding = false;
      document.getElementById('btn-add-project')?.classList.remove('active-state');
      state.map.getCanvas().style.cursor = '';
      dispatchLongPress(e.lngLat);
      return;
    }
    const currentActiveLayers = getActiveLayers();
    const features = state.map.queryRenderedFeatures(e.point, { layers: currentActiveLayers });
    if (features && features.length > 0) {
      const resolved = resolveMapFeatureTarget(features[0]);
      if (resolved) {
        const { obra, targetId, coords } = resolved;
        abrirFicha(obra || features[0].properties, coords, targetId || obra?.featureId || obra?.id || features[0].id);
      }
    } else {
      cerrarFicha();
    }
  });

  state.map.on('contextmenu', (e) => dispatchLongPress(e.lngLat));

  let pressTimer = null;
  let pressStart = null;
  const cancelLongPress = () => {
    if (pressTimer !== null) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };

  state.map.on('touchstart', (e) => {
    if ((e.points && e.points.length > 1) || (e.originalEvent?.touches && e.originalEvent.touches.length > 1)) {
      cancelLongPress();
      return;
    }
    pressStart = e.lngLat;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      dispatchLongPress(pressStart);
    }, 800);
  });

  state.map.on('touchmove', cancelLongPress);
  state.map.on('touchend', cancelLongPress);
  state.map.on('touchcancel', cancelLongPress);
  state.map.on('movestart', cancelLongPress);
  state.map.on('zoomstart', cancelLongPress);
  state.map.on('dragstart', cancelLongPress);
}

function dispatchLongPress(lngLat) {
  document.dispatchEvent(new CustomEvent('radar:map-longpress', { detail: { lngLat } }));
}