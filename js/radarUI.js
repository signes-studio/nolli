// js/radarUI.js
import { state, CATEGORY_META, escapeHtml, separarArquitectos, normalizarCategoria, normalizarImportancia, upsertBuilding } from './state.js';
import { abrirFicha } from './sheetUI.js';
import { calcularDistanciaMetros } from './exploreUI.js';
import { actualizarFuenteMapa } from './mapData.js';
import { actualizarMarcadorUbicacion, actualizarVisibilidadIconosLista } from './mapController.js';
import { fetchBuildingsInRadius, fetchBuildings } from './api.js';
import { getOptimizedPhotoUrl } from './imageProxy.js';

let radarRadius = 1000; // 1000m por defecto (1km)
let radarAbortController = null;
let radarCacheKey = '';
let radarCachedData = [];
let locationWatchId = null;
const CURATED_PROXIMITY_METERS = 15000; // radio para considerar una colección "cercana" al usuario

export const CURATED_ROUTES = [
  {
    id: 'route-docomomo',
    title: 'DOCOMOMO IBÉRICO',
    subtitle: 'Registro y documentación de la arquitectura del Movimiento Moderno',
    tag: 'REGISTRO OFICIAL',
    color: '#E84E1B',
    stops: 'CATÁLOGO',
    addedByFilter: 'DOCOMOMO'
  },
  {
    id: 'route-gatepac',
    title: 'GATEPAC · RACIONALISMO ESPAÑOL',
    subtitle: 'El núcleo del Movimiento Moderno en España, 1927-1937',
    tag: 'MOVIMIENTO MODERNO',
    color: '#C0392B',
    stops: '~23 OBRAS',
    yearRange: [1927, 1937],
    architectsFilter: ['Sert', 'Torres Clavé', 'Subirana', 'Illescas', 'García Mercadal', 'Sánchez Arcas', 'Lacasa', 'Fernández-Shaw', 'Bergamín']
  },
  {
    id: 'route-racionalismo-valenciano',
    title: 'RACIONALISMO VALENCIANO',
    subtitle: 'Arquitectura moderna en la Comunitat Valenciana, 1925-1936',
    tag: 'MOVIMIENTO MODERNO',
    color: '#D35400',
    stops: '~76 OBRAS',
    yearRange: [1925, 1936],
    bboxFilter: { latMin: 37.85, latMax: 40.75, lonMin: -1.55, lonMax: 0.75 }
  },
  {
    id: 'route-modernisme-catala',
    title: 'MODERNISME CATALÀ',
    subtitle: 'Gaudí, Domènech i Montaner, Puig i Cadafalch y el modernismo en Cataluña, 1888-1911',
    tag: 'MODERNISMO',
    color: '#8E44AD',
    stops: '~118 OBRAS',
    yearRange: [1888, 1911],
    bboxFilter: { latMin: 40.5, latMax: 42.9, lonMin: 0.15, lonMax: 3.35 }
  },
  {
    id: 'route-escuela-madrid',
    title: 'ESCUELA DE MADRID',
    subtitle: 'Organicismo y modernidad de posguerra: Sáenz de Oiza, Corrales y Molezún, Fisac, Sota, Higueras',
    tag: 'POSGUERRA',
    color: '#2C3E50',
    stops: '~150 OBRAS',
    yearRange: [1949, 1975],
    architectsFilter: ['Sáenz de Oiza', 'Corrales', 'Molezún', 'Fisac', 'Sota', 'Aburto', 'Higueras', 'Cano Lasso']
  },
  {
    id: 'route-grup-r',
    title: 'GRUP R · ESCOLA DE BARCELONA',
    subtitle: 'Coderch, Bohigas, Martorell y la renovación moderna catalana de posguerra, 1949-1970',
    tag: 'POSGUERRA',
    color: '#16A085',
    stops: '~74 OBRAS',
    yearRange: [1949, 1970],
    architectsFilter: ['Coderch', 'Moragas', 'Sostres', 'Bohigas', 'Martorell', 'Mitjans', 'Ribas Piera', 'Pratmarsó']
  },
  {
    id: 'route-regionalismo-vasco',
    title: 'REGIONALISMO VASCO',
    subtitle: 'Historicismo y arquitectura regional en el País Vasco, 1890-1936',
    tag: 'HISTORICISMO',
    color: '#7F8C8D',
    stops: '~68 OBRAS',
    yearRange: [1890, 1936],
    bboxFilter: { latMin: 42.85, latMax: 43.45, lonMin: -3.5, lonMax: -1.7 }
  },
  {
    id: 'route-arquitectura-canaria',
    title: 'ARQUITECTURA CANARIA',
    subtitle: 'Néstor y Miguel Martín-Fernández de la Torre y el regionalismo atlántico, 1900-1950',
    tag: 'REGIONALISMO',
    color: '#F39C12',
    stops: '~44 OBRAS',
    yearRange: [1900, 1950],
    bboxFilter: { latMin: 27.6, latMax: 29.5, lonMin: -18.2, lonMax: -13.4 }
  },
  {
    id: 'route-contemporanea-espana',
    title: 'ARQUITECTURA CONTEMPORÁNEA ESPAÑOLA',
    subtitle: 'Moneo, RCR, Nieto Sobejano, Mansilla+Tuñón, Campo Baeza y la escena actual, 1985-2025',
    tag: 'CONTEMPORÁNEA',
    color: '#E84E1B',
    stops: '~150 OBRAS',
    yearRange: [1985, 2025],
    architectsFilter: ['Moneo', 'Nieto', 'Sobejano', 'Mansilla', 'Tuñón', 'RCR', 'Souto de Moura', 'Siza', 'Campo Baeza', 'Ábalos', 'Herreros']
  },
  {
    id: 'route-escola-porto',
    title: 'ESCOLA DO PORTO',
    subtitle: 'Siza, Souto de Moura, Távora y la modernidad silenciosa portuguesa',
    tag: 'ESCUELA PORTUGUESA',
    color: '#2980B9',
    stops: '~66 OBRAS',
    yearRange: [1955, 2015],
    architectsFilter: ['Siza', 'Souto de Moura', 'Távora', 'Soutinho']
  },
  {
    id: 'route-estado-novo-portugal',
    title: 'ARQUITECTURA DO ESTADO NOVO',
    subtitle: 'Monumentalidad y regionalismo crítico bajo el régimen portugués, 1930-1955',
    tag: 'HISTORICISMO',
    color: '#7F8C8D',
    stops: '~25 OBRAS',
    yearRange: [1930, 1955],
    architectsFilter: ['Cottinelli Telmo', 'Cristino da Silva', 'Pardal Monteiro', 'Keil do Amaral']
  },
  {
    id: 'route-mouvement-moderne-francais',
    title: 'MOUVEMENT MODERNE FRANÇAIS',
    subtitle: 'Le Corbusier, Perret, Mallet-Stevens y los orígenes del racionalismo francés',
    tag: 'MOVIMIENTO MODERNO',
    color: '#C0392B',
    stops: '~30 OBRAS',
    architectsFilter: ['Le Corbusier', 'Perret', 'Mallet-Stevens', 'Lurçat', 'Chareau']
  },
  {
    id: 'route-french-touch',
    title: 'FRENCH TOUCH CONTEMPORÁNEA',
    subtitle: 'Lacaton & Vassal, Perrault, Nouvel y la arquitectura francesa reciente, 1995-2025',
    tag: 'CONTEMPORÁNEA',
    color: '#16A085',
    stops: '~62 OBRAS',
    yearRange: [1995, 2025],
    architectsFilter: ['Lacaton & Vassal', 'Perrault', 'Nouvel', 'Ricciotti', 'Bruther', 'LAN']
  }
];

export function matchWorksForRoute(route) {
  if (route.addedByFilter) {
    return state.OBRAS.filter((o) => {
      const addedBy = String(o.añadido_por || o.anadido_por || '').toUpperCase();
      return addedBy.includes(route.addedByFilter.toUpperCase());
    });
  }
  if (route.architectFilter) {
    return state.OBRAS.filter((o) => (o.arquitectos || '').toLowerCase().includes(route.architectFilter.toLowerCase()));
  }
  if (route.decadeFilter) {
    return state.OBRAS.filter((o) => {
      const y = Number(o.año_construccion);
      const dec = Number(route.decadeFilter);
      return y >= dec && y < dec + 10;
    });
  }
  if (route.categoryFilter) {
    return state.OBRAS.filter((o) => String(o.categoria || '').toLowerCase() === route.categoryFilter.toLowerCase());
  }
  if (route.keywords) {
    return state.OBRAS.filter((o) => {
      const text = `${o.nombre_obra} ${o.arquitectos} ${o.categoria}`.toLowerCase();
      return route.keywords.some((kw) => text.includes(kw));
    });
  }
  if (route.yearRange || route.architectsFilter || route.bboxFilter) {
    // Filtros "compuestos" para colecciones curatoriales (movimientos): se combinan con AND.
    // Pensados para criterios de historiador de arquitectura: periodo + geografía y/o lista de autores.
    return state.OBRAS.filter((o) => {
      if (route.yearRange) {
        const y = Number(o.año_construccion);
        if (!Number.isFinite(y) || y < route.yearRange[0] || y > route.yearRange[1]) return false;
      }
      if (route.bboxFilter && o.coordenadas && o.coordenadas.length === 2) {
        const [lon, lat] = o.coordenadas;
        const { latMin, latMax, lonMin, lonMax } = route.bboxFilter;
        if (lat < latMin || lat > latMax || lon < lonMin || lon > lonMax) return false;
      } else if (route.bboxFilter) {
        return false; // sin coordenadas no se puede verificar el bbox
      }
      if (route.architectsFilter) {
        const arqText = String(o.arquitectos || '').toLowerCase();
        const match = route.architectsFilter.some((name) => arqText.includes(name.toLowerCase()));
        if (!match) return false;
      }
      return true;
    });
  }
  return [];
}

// Para cada ruta, calcula cuántas obras coincidentes hay y la distancia a la más cercana
// respecto al centro de referencia actual (usuario o centro de mapa).
export function getNearbyRoutes(maxDistanceMeters = CURATED_PROXIMITY_METERS) {
  const [refLon, refLat] = getRadarCenter();
  const results = [];

  for (const route of CURATED_ROUTES) {
    const works = matchWorksForRoute(route);
    let nearestDist = Infinity;
    for (const obra of works) {
      if (!obra.coordenadas || obra.coordenadas.length !== 2) continue;
      const dist = calcularDistanciaMetros(refLon, refLat, obra.coordenadas[0], obra.coordenadas[1]);
      if (dist < nearestDist) nearestDist = dist;
    }
    if (nearestDist <= maxDistanceMeters) {
      results.push({ route, count: works.length, nearestDist });
    }
  }

  results.sort((a, b) => a.nearestDist - b.nearestDist);
  return results;
}

export function renderCuratedCarousel() {
  const container = document.getElementById('radar-curated-carousel');
  if (!container) return;

  const nearby = getNearbyRoutes();

  if (!nearby.length) {
    container.innerHTML = `
      <div class="radar-empty-state">
        <i data-lucide="compass" width="24" height="24" style="color:var(--accent, #E84E1B); margin-bottom:8px;"></i>
        <div class="font-display text-sm font-bold">[ NINGUNA COLECCIÓN CERCA DE TU POSICIÓN ]</div>
        <p class="text-xs text-dim">Desplázate por el mapa para descubrir selecciones curatoriales de otras zonas.</p>
      </div>
    `;
    window.lucide?.createIcons({ context: container });
    return;
  }

  container.innerHTML = nearby.map(({ route, count, nearestDist }) => {
    const distText = formatearDistanciaRadar(nearestDist);
    return `
      <article class="radar-curated-card" data-route-id="${escapeHtml(route.id)}" role="button" tabindex="0" aria-label="${escapeHtml(route.title)}">
        <div class="radar-curated-header" style="border-color:${route.color};">
          <span class="radar-curated-tag" style="color:${route.color};">[ ${escapeHtml(route.tag || 'RUTA')} ]</span>
          <span class="radar-vermillon-badge">[ OBRA MÁS CERCANA: ${distText} ]</span>
        </div>
        <h4 class="radar-curated-title">${escapeHtml(route.title)}</h4>
        <p class="radar-curated-subtitle">${escapeHtml(route.subtitle || '')}</p>
        <div class="radar-curated-footer">
          <span class="radar-curated-stops">${escapeHtml(route.stops || `${count} OBRAS`)}</span>
        </div>
      </article>
    `;
  }).join('');

  window.lucide?.createIcons({ context: document.getElementById('radar-panel') });
}


function getRadarCenter() {
  if (Array.isArray(state.userLocation) && state.userLocation.length === 2) {
    return state.userLocation;
  }
  if (
    state.userLocation
    && Number.isFinite(state.userLocation.lng)
    && Number.isFinite(state.userLocation.lat)
  ) {
    return [state.userLocation.lng, state.userLocation.lat];
  }
  // El radar debe responder a la ubicación del usuario, no al centro visible del mapa.
  return [-0.3763, 39.4699];
}

function iniciarGeolocalizacionEnSegundoPlano() {
  if (!navigator.geolocation || locationWatchId != null) return;
  locationWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const coords = [pos.coords.longitude, pos.coords.latitude];
      actualizarMarcadorUbicacion(coords);
      const panel = document.getElementById('radar-panel');
      if (panel && panel.classList.contains('open')) {
        renderRadarUI();
        renderCuratedCarousel();
      }
    },
    (err) => {
      if (err.code === 1 && locationWatchId != null) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
        return;
      }
      console.warn('Geolocalización en background:', err.message);
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 6000 }
  );
}

export function formatearDistanciaRadar(metros) {
  if (!isFinite(metros) || metros == null) return '';
  if (metros < 1000) {
    return `A ${Math.round(metros)} METROS`;
  }
  return `A ${(metros / 1000).toFixed(1)} KM`;
}

export function renderRadarList(works, container, countSpan) {
  if (countSpan) {
    countSpan.textContent = `[ ${works.length} DETECTADAS ]`;
  }

  if (!works.length) {
    container.innerHTML = `
      <div class="radar-empty-state">
        <i data-lucide="crosshair" width="28" height="28" style="color:var(--accent, #E84E1B); margin-bottom:8px;"></i>
        <div class="font-display text-sm font-bold">[ NINGUNA OBRA A MENOS DE ${radarRadius < 1000 ? radarRadius + 'M' : (radarRadius / 1000) + 'KM'} ]</div>
        <p class="text-xs text-dim">Amplía el radio de búsqueda o desplázate por el mapa.</p>
      </div>
    `;
    window.lucide?.createIcons({ context: container });
    return;
  }

  container.innerHTML = works.slice(0, 50).map((obra) => {
    const catKey = obra.categoria || 'otro';
    const metaCat = CATEGORY_META[catKey] || CATEGORY_META['otro'];
    const catColor = metaCat?.color || '#E84E1B';
    const distText = formatearDistanciaRadar(obra._dist);
    const photo = getOptimizedPhotoUrl(obra.foto_url || obra.foto_miniatura || '', { width: 160 });
    const city = obra.place || obra.ciudad || '';
    const architects = obra.arquitectos || 'AUTOR NO IDENTIFICADO';
    const year = obra.año_construccion ? ` · ${escapeHtml(obra.año_construccion)}` : '';

    return `
      <article class="radar-proximity-card" data-radar-feature-id="${escapeHtml(obra.featureId || obra.id)}" role="button" tabindex="0" aria-label="${escapeHtml(obra.nombre_obra)}">
        <div class="radar-proximity-header">
          <span class="radar-vermillon-badge">[ ${distText} ]</span>
          <span class="radar-cat-badge" style="color:${catColor}; border-color:${catColor};">[ ${escapeHtml(obra.categoria || 'ARQUITECTURA').toUpperCase()} ]</span>
        </div>
        <div class="radar-proximity-body">
          ${photo ? `
            <div class="radar-proximity-thumb">
              <img src="${escapeHtml(photo)}" alt="${escapeHtml(obra.nombre_obra)}" loading="lazy" onerror="this.parentElement.style.display='none'">
            </div>
          ` : ''}
          <div class="radar-proximity-info">
            <h4 class="radar-proximity-title">${escapeHtml(obra.nombre_obra)}</h4>
            <div class="radar-proximity-meta">
              <span class="architect-pill-badge">${escapeHtml(architects)}</span>
              ${year}
            </div>
            ${city ? `<div class="radar-proximity-city">${escapeHtml(city).toUpperCase()}</div>` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');

  window.lucide?.createIcons({ context: document.getElementById('itinerary-filter-badge') });
}

export async function renderRadarUI() {
  const container = document.getElementById('radar-detected-list');
  const countSpan = document.getElementById('radar-detected-count');
  if (!container) return;

  const [refLon, refLat] = getRadarCenter();
  const currentKey = `${refLon.toFixed(4)}_${refLat.toFixed(4)}_${radarRadius}`;

  // 1. Mostrar de inmediato lo que tengamos disponible para respuesta táctil instantánea
  const localWorks = (state.OBRAS || []).map((obra) => {
    let dist = Infinity;
    if (obra.coordenadas && obra.coordenadas.length === 2) {
      dist = calcularDistanciaMetros(refLon, refLat, obra.coordenadas[0], obra.coordenadas[1]);
    }
    return { ...obra, _dist: dist };
  }).filter((o) => o._dist <= radarRadius);

  let initialWorks = radarCachedData.length && radarCacheKey === currentKey ? radarCachedData : localWorks;
  initialWorks.sort((a, b) => a._dist - b._dist);
  renderRadarList(initialWorks, container, countSpan);

  // 2. Consulta en vivo a toda la base de datos (incluso fuera del viewport)
  radarAbortController?.abort();
  radarAbortController = new AbortController();

  try {
    const dbBuildings = await fetchBuildingsInRadius({
      lon: refLon,
      lat: refLat,
      radiusMeters: radarRadius,
      signal: radarAbortController.signal,
    });

    const transformed = dbBuildings.map((fila, index) => ({
      id: fila.id,
      featureId: String(fila.id ?? `obra-${index}`),
      nombre_obra: fila.nombre_obra,
      foto_url: fila.foto_url || null,
      enlace_url: fila.enlace_url || null,
      arquitecto: fila.arquitecto,
      arquitectos: Array.isArray(fila.arquitectos) ? fila.arquitectos.join(', ') : (fila.arquitecto || ''),
      año_construccion: fila.año_construccion,
      importancia: normalizarImportancia(fila.importancia),
      categoria: normalizarCategoria(fila.categoria),
      ciudad: fila.place || fila.ciudad || null,
      place: fila.place || null,
      estado_acceso: fila.estado_acceso || (fila.visitable ? 'publico' : 'privado'),
      añadido_por: fila.añadido_por || null,
      estado_revision: fila.estado_revision || 'publicada',
      coordenadas: [fila.longitud, fila.latitud],
      _dist: calcularDistanciaMetros(refLon, refLat, fila.longitud, fila.latitud),
    })).filter((o) => o._dist <= radarRadius);

    // Unir con obras privadas y pendientes
    const privateWorks = (state.OBRAS || [])
      .filter((o) => o.private || o.estado_revision === 'pendiente')
      .map((o) => ({
        ...o,
        _dist: o.coordenadas ? calcularDistanciaMetros(refLon, refLat, o.coordenadas[0], o.coordenadas[1]) : Infinity,
      }))
      .filter((o) => o._dist <= radarRadius);

    const existingIds = new Set(transformed.map((t) => String(t.id)));
    const allWorks = [...transformed, ...privateWorks.filter((p) => !existingIds.has(String(p.id)))];
    allWorks.sort((a, b) => a._dist - b._dist);

    radarCachedData = allWorks;
    radarCacheKey = currentKey;

    renderRadarList(allWorks, container, countSpan);
  } catch (err) {
    if (err.name === 'AbortError' || radarAbortController?.signal?.aborted) return;
    console.warn('Aviso al consultar obras en el radar:', err);
  }
}

export async function activarRutaEnMapa(routeId) {
  const route = CURATED_ROUTES.find((r) => r.id === routeId);
  if (!route || !state.map) return;

  const panel = document.getElementById('radar-panel');
  if (panel) panel.classList.remove('open');
  const backdrop = document.getElementById('panel-backdrop');
  if (backdrop) backdrop.classList.remove('active');

  // Mostrar badge de carga mientras se obtienen todas las obras
  const itineraryBadge = document.getElementById('itinerary-filter-badge');
  const titleEl = document.getElementById('itinerary-badge-title');
  const countEl = document.getElementById('itinerary-badge-count');
  if (itineraryBadge && titleEl) {
    titleEl.textContent = `CARGANDO: ${route.title.toUpperCase()}…`;
    if (countEl) countEl.textContent = '';
    itineraryBadge.classList.remove('hidden');
    window.lucide?.createIcons({ context: document.getElementById('radar-followed-list') });
  }

  // 1. Determinar qué obras ya tenemos en local
  let matchingWorks = matchWorksForRoute(route);

  // 2. Si el itinerario filtra por arquitecto, intentar cargar obras que falten en la BD completa.
  //    Los filtros por bbox/año se aplican en la query para no saturar memoria.
  try {
    if (route.architectsFilter && route.architectsFilter.length > 0) {
      for (const architect of route.architectsFilter) {
        const dbRows = await fetchBuildings({ architect, includeAllImportance: true });
        (dbRows || []).forEach((fila, idx) => {
          const enriched = {
            ...fila,
            id: fila.id,
            featureId: String(fila.id ?? `obra-${idx}`),
            categoria: normalizarCategoria(fila.categoria),
            coordenadas: [Number(fila.longitud), Number(fila.latitud)],
            arquitectos: Array.isArray(fila.arquitectos) ? fila.arquitectos.join(', ') : (fila.arquitecto || ''),
            ciudad: fila.place || fila.ciudad || null,
            place: fila.place || fila.ciudad || null,
          };
          state.OBRAS = upsertBuilding(state.OBRAS, enriched);
        });
      }
      // Recalcular con el estado enriquecido
      matchingWorks = matchWorksForRoute(route);
    }
  } catch (err) {
    console.warn('Error cargando obras adicionales del itinerario:', err);
  }

  if (matchingWorks.length === 0) {
    if (itineraryBadge) itineraryBadge.classList.add('hidden');
    return;
  }

  // 3. Establecer itinerario — marcarlo como colección para que se suprima el minzoom en todas las capas
  state.activeItinerary = {
    id: route.id,
    title: route.title,
    isCollectionItinerary: true,
    workIds: new Set(matchingWorks.map((w) => String(w.id))),
  };

  // 4. Actualizar fuente del mapa y suprimir restricciones de zoom para este itinerario
  actualizarFuenteMapa();
  actualizarVisibilidadIconosLista();

  // 5. Actualizar badge con conteo definitivo
  if (itineraryBadge && titleEl) {
    titleEl.textContent = `RUTA: ${route.title.toUpperCase()}`;
    if (countEl) countEl.textContent = `${matchingWorks.length} OBRAS`;
    window.lucide?.createIcons({ context: document.getElementById('radar-search-results') });
  }

  // 6. Transicionar a pestaña Mapa
  const mapNavBtn = document.getElementById('mobile-nav-map');
  if (mapNavBtn) {
    document.querySelectorAll('.mobile-nav-btn').forEach((b) => b.classList.remove('active'));
    mapNavBtn.classList.add('active');
  }

  // 7. Encuadre geográfico abarcando todas las obras del itinerario
  const validCoords = matchingWorks
    .filter((w) => w.coordenadas && w.coordenadas.length === 2 && Number.isFinite(w.coordenadas[0]) && Number.isFinite(w.coordenadas[1]))
    .map((w) => w.coordenadas);
  if (validCoords.length === 1) {
    state.map.flyTo({ center: validCoords[0], zoom: 12, duration: 900 });
  } else if (validCoords.length > 1) {
    const bounds = validCoords.reduce((b, coord) => b.extend(coord), new mapboxgl.LngLatBounds(validCoords[0], validCoords[0]));
    state.map.fitBounds(bounds, { padding: 80, maxZoom: 12, duration: 1000 });
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
  actualizarVisibilidadIconosLista();
  document.dispatchEvent(new CustomEvent('radar:filters-changed'));
}
export const desactivarRutaEnMapa = restaurarMapaGeneral;

export function initRadarUI() {
  const panel = document.getElementById('radar-panel');
  const btnClose = document.getElementById('btn-radar-close');
  const radiusPills = document.querySelectorAll('.radar-radius-pill');
  const detectedList = document.getElementById('radar-detected-list');
  const curatedCarousel = document.getElementById('radar-curated-carousel');
  const btnCloseItinerary = document.getElementById('btn-close-itinerary');

  if (btnClose && panel) {
    btnClose.addEventListener('click', () => {
      panel.classList.remove('open');
      const backdrop = document.getElementById('panel-backdrop');
      if (backdrop) backdrop.classList.remove('active');
      document.dispatchEvent(new CustomEvent('radar:panel-closed'));
    });
  }

  if (btnCloseItinerary) {
    btnCloseItinerary.addEventListener('click', (e) => {
      e.stopPropagation();
      restaurarMapaGeneral();
    });
  }

  // Selector de radio GPS: 1km, 3km, 5km, 10km
  radiusPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      radiusPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      radarRadius = Number(pill.dataset.radius);
      renderRadarUI();
    });
  });

  // Tap en tarjeta de proximidad -> Despliega Bottom Sheet de la obra
  if (detectedList) {
    detectedList.addEventListener('click', (e) => {
      const card = e.target.closest('.radar-proximity-card');
      if (!card) return;

      const featureId = card.dataset.radarFeatureId;
      let obra = state.OBRAS.find((o) => String(o.featureId) === String(featureId) || String(o.id) === String(featureId));

      if (!obra && radarCachedData.length) {
        obra = radarCachedData.find((o) => String(o.featureId) === String(featureId) || String(o.id) === String(featureId));
        if (obra) {
          state.OBRAS = upsertBuilding(state.OBRAS, obra);
          actualizarFuenteMapa();
        }
      }

      if (obra) {
        if (panel) panel.classList.remove('open');
        const backdrop = document.getElementById('panel-backdrop');
        if (backdrop) backdrop.classList.remove('active');

        if (state.map && obra.coordenadas) {
          state.map.flyTo({
            center: obra.coordenadas,
            zoom: Math.max(state.map.getZoom(), 15),
            duration: 800
          });
        }

        abrirFicha(obra, obra.coordenadas, obra.featureId);
      }
    });
  }

  // Tap en tarjeta curatorial -> activa esa ruta/colección en el mapa
  if (curatedCarousel) {
    curatedCarousel.addEventListener('click', (e) => {
      const card = e.target.closest('.radar-curated-card');
      if (!card) return;
      activarRutaEnMapa(card.dataset.routeId);
    });
  }

  if (state.userLocation) iniciarGeolocalizacionEnSegundoPlano();
  document.addEventListener('radar:user-location-updated', () => {
    iniciarGeolocalizacionEnSegundoPlano();
    if (panel && panel.classList.contains('open')) {
      renderRadarUI();
      renderCuratedCarousel();
    }
  });

  document.addEventListener('radar:data-ready', () => {
    if (panel && panel.classList.contains('open')) {
      renderRadarUI();
      renderCuratedCarousel();
    }
  });

  // Si el panel se abre vía otra parte de la app (toggle de clase 'open'),
  // detectamos el cambio para refrescar el carrusel con la posición actual del mapa/usuario.
  if (panel) {
    const panelObserver = new MutationObserver(() => {
      if (panel.classList.contains('open')) {
        renderRadarUI();
        renderCuratedCarousel();
      }
    });
    panelObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });
  }
}

