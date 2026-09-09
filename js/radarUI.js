import { state, CATEGORY_META, escapeHtml, separarArquitectos, normalizarCategoria, normalizarImportancia, upsertBuilding, dedupeBuildings, nombreCategoria } from './state.js';
import { abrirFicha } from './sheetUI.js';
import { calcularDistanciaMetros, formatearDistancia, showNeoToast } from './renderUtils.js';
import { actualizarFuenteMapa } from './mapData.js';
import { actualizarMarcadorUbicacion, actualizarVisibilidadIconosLista } from './mapController.js';
import { fetchBuildingsInRadius, fetchBuildings, getBuildingsCatalog, fetchItineraries, fetchBuildingsByIds } from './api.js';
import { getOptimizedPhotoUrl } from './imageProxy.js';
import { CURATED_ROUTES, matchWorksForRoute } from './itinerariesConfig.js';
import { t } from './i18n.js';

export { CURATED_ROUTES, matchWorksForRoute };

let radarRadius = 1000; // 1000m por defecto (1km)
let radarAbortController = null;
let radarCacheKey = '';
let radarCachedData = [];
let locationWatchId = null;
const CURATED_PROXIMITY_METERS = 15000; // radio para considerar una colección "cercana" al usuario

export async function getCuratedRoutes() {
  if (state.curatedRoutes && state.curatedRoutes.length > 0) return state.curatedRoutes;
  try {
    const remote = await fetchItineraries(state.sessionToken, false);
    if (remote && Array.isArray(remote) && remote.length > 0) {
      state.curatedRoutes = remote;
      return remote;
    }
  } catch (e) {}
  state.curatedRoutes = CURATED_ROUTES;
  return CURATED_ROUTES;
}

window.addEventListener('nolli:itineraries-updated', () => {
  state.curatedRoutes = null;
});
window.addEventListener('storage', (e) => {
  if (e.key === 'nolli_local_itineraries') {
    state.curatedRoutes = null;
  }
});

// Para cada ruta, calcula cuántas obras coincidentes hay y la distancia a la más cercana
// respecto al centro de referencia actual (usuario o centro de mapa).
export function getNearbyRoutes(maxDistanceMeters = CURATED_PROXIMITY_METERS) {
  const [refLon, refLat] = getRadarCenter();
  const results = [];
  const routes = (state.curatedRoutes && state.curatedRoutes.length > 0) ? state.curatedRoutes : CURATED_ROUTES;

  for (const route of routes) {
    if (route.active === false) continue;
    const works = matchWorksForRoute(route, state.buildings);
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
      <div class="nolli-empty-state">
        <div class="nolli-empty-icon-wrap">
          <i data-lucide="compass" width="22" height="22"></i>
        </div>
        <h4 class="nolli-empty-title">${t('radar_no_collections_nearby', null, 'SIN RUTAS CERCANAS')}</h4>
        <p class="nolli-empty-desc">${t('radar_no_collections_nearby_desc', null, 'No hay selecciones curatoriales a menos de 15 km de tu posición.')}</p>
        <button type="button" class="nolli-empty-action" id="btn-radar-go-explore">
          <span>EXPLORAR TODAS LAS RUTAS</span>
        </button>
      </div>
    `;
    container.querySelector('#btn-radar-go-explore')?.addEventListener('click', () => {
      document.getElementById('mobile-nav-explore')?.click() || document.getElementById('btn-explore-float')?.click();
    });
    window.lucide?.createIcons({ context: container });
    return;
  }

  container.innerHTML = nearby.map(({ route, count, nearestDist }) => {
    const distText = formatearDistanciaRadar(nearestDist);
    return `
      <article class="radar-curated-card" data-route-id="${escapeHtml(route.id)}" role="button" tabindex="0" aria-label="${escapeHtml(route.title)}">
        <div class="radar-curated-header" style="border-color:${route.color};">
          <span class="radar-curated-tag" style="color:${route.color};">${escapeHtml(route.tag || 'RUTA')}</span>
          <span class="radar-vermillon-badge">${t('radar_closest_work', { dist: distText })}</span>
        </div>
        <h4 class="radar-curated-title">${escapeHtml(route.title)}</h4>
        <p class="radar-curated-subtitle">${escapeHtml(route.subtitle || '')}</p>
        <div class="radar-curated-footer">
          <span class="radar-curated-stops">${escapeHtml(route.stops || t('itinerary_works_count', { count }))}</span>
        </div>
      </article>
    `;
  }).join('');

  window.lucide?.createIcons({ context: document.getElementById('radar-panel') });
}


export function hasActiveGpsFix() {
  return Boolean(
    (Array.isArray(state.userLocation) && state.userLocation.length === 2) ||
    (state.userLocation && Number.isFinite(state.userLocation.lng) && Number.isFinite(state.userLocation.lat))
  );
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
  // Fallback a Valencia cuando no hay geolocalización disponible
  return [-0.3763, 39.4699];
}

export function solicitarUbicacionGPS() {
  if (!navigator.geolocation) {
    showNeoToast(t('radar_gps_unavailable'));
    return;
  }
  showNeoToast(t('radar_detecting'));
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const coords = [pos.coords.longitude, pos.coords.latitude];
      actualizarMarcadorUbicacion(coords);
      state.userLocation = coords;
      actualizarEstadoGPSUI();
      renderRadarUI();
      renderCuratedCarousel();
      showNeoToast(t('radar_gps_active'));
    },
    (err) => {
      console.warn('Error al solicitar GPS:', err.message);
      actualizarEstadoGPSUI();
      showNeoToast(t('radar_gps_denied'));
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

export function actualizarEstadoGPSUI() {
  const badge = document.getElementById('radar-status-badge');
  const isGpsActive = hasActiveGpsFix();

  if (badge) {
    if (isGpsActive) {
      badge.textContent = 'GPS ACTIVO';
      badge.style.color = '#FFFFFF';
      badge.style.background = 'var(--accent, #E95C0C)';
      badge.style.borderColor = 'var(--accent, #E95C0C)';
    } else {
      badge.textContent = 'UBICACIÓN: VALENCIA';
      badge.style.color = 'var(--fg-dim, #6B6B6B)';
      badge.style.background = 'var(--bg-raised, #F0E9D2)';
      badge.style.borderColor = 'var(--border-strong, #141411)';
    }
  }

  const container = document.getElementById('radar-content-container');
  if (container) {
    let notice = document.getElementById('radar-gps-notice');
    if (!isGpsActive) {
      if (!notice) {
        notice = document.createElement('div');
        notice.id = 'radar-gps-notice';
        notice.style.cssText = 'padding: 10px 14px; background: var(--bg-raised, #F0E9D2); border-bottom: 2px solid var(--border-strong, #141411); font-size: 11px; display: flex; flex-direction: column; gap: 8px; border-radius: 0 !important;';
        notice.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <span style="font-weight: 800; font-family: 'League Spartan', sans-serif; font-size: 13px; color: var(--fg);">SIN ACCESO A GPS</span>
            <span style="font-size: 9px; font-weight: 700; color: var(--accent, #E95C0C); letter-spacing: 0.05em;">PREDETERMINADO: VALENCIA</span>
          </div>
          <p style="margin: 0; font-size: 10px; color: var(--fg-dim); line-height: 1.4;">Para calcular obras a tu alrededor, activa el GPS o busca otra ciudad en el mapa.</p>
          <div style="display: flex; gap: 8px;">
            <button type="button" id="btn-radar-request-gps" style="background: var(--fg, #141411); color: var(--bg, #F8F1DF); border: none; padding: 6px 10px; font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 800; cursor: pointer; letter-spacing: 0.04em;">ACTIVAR GPS</button>
            <button type="button" id="btn-radar-go-search" style="background: transparent; color: var(--fg, #141411); border: 1px solid var(--border-strong, #141411); padding: 6px 10px; font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 800; cursor: pointer; letter-spacing: 0.04em;">BUSCAR CIUDAD</button>
          </div>
        `;
        container.prepend(notice);

        document.getElementById('btn-radar-request-gps')?.addEventListener('click', () => {
          solicitarUbicacionGPS();
        });

        document.getElementById('btn-radar-go-search')?.addEventListener('click', () => {
          document.getElementById('radar-panel')?.classList.remove('open');
          document.getElementById('btn-search')?.click();
        });
      }
    } else if (notice) {
      notice.remove();
    }
  }
}

function iniciarGeolocalizacionEnSegundoPlano() {
  if (!navigator.geolocation || locationWatchId != null) return;
  locationWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const coords = [pos.coords.longitude, pos.coords.latitude];
      actualizarMarcadorUbicacion(coords);
      actualizarEstadoGPSUI();
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
        actualizarEstadoGPSUI();
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
    return t('radar_distance_meters', { dist: Math.round(metros) });
  }
  return t('radar_distance_km', { dist: (metros / 1000).toFixed(1) });
}

export function renderRadarList(works, container, countSpan) {
  if (countSpan) {
    countSpan.textContent = t('radar_detected_count', { count: works.length });
  }

  if (!works.length) {
    const radLabel = radarRadius < 1000 ? `${radarRadius}M` : `${radarRadius / 1000}KM`;
    const nextRadius = radarRadius < 3000 ? 3000 : 5000;
    const nextLabel = nextRadius < 1000 ? `${nextRadius}M` : `${nextRadius / 1000}KM`;
    container.innerHTML = `
      <div class="nolli-empty-state">
        <div class="nolli-empty-icon-wrap">
          <i data-lucide="crosshair" width="22" height="22"></i>
        </div>
        <h4 class="nolli-empty-title">SIN OBRAS EN TU RADIO (${radLabel})</h4>
        <p class="nolli-empty-desc">${t('radar_expand_radius_hint', null, 'Amplía el radio de búsqueda o desplázate por el mapa.')}</p>
        <button type="button" class="nolli-empty-action" id="btn-radar-expand-radius" data-next-radius="${nextRadius}">
          <span>AMPLIAR RADIO A ${nextLabel}</span>
        </button>
      </div>
    `;
    const btnExpand = container.querySelector('#btn-radar-expand-radius');
    if (btnExpand) {
      btnExpand.addEventListener('click', () => {
        const targetBtn = document.querySelector(`.radar-radius-btn[data-radius="${nextRadius}"]`);
        if (targetBtn) {
          targetBtn.click();
        } else {
          radarRadius = nextRadius;
          renderRadarUI();
        }
      });
    }
    window.lucide?.createIcons({ context: container });
    return;
  }

  container.innerHTML = works.slice(0, 50).map((obra) => {
    const catKey = obra.categoria || 'otro';
    const metaCat = CATEGORY_META[catKey] || CATEGORY_META['otro'];
    const catColor = metaCat?.color || '#E84E1B';
    const distText = formatearDistanciaRadar(obra._dist);
    const photo = state.sessionToken ? getOptimizedPhotoUrl(obra.foto_url || obra.foto_miniatura || '', { width: 160 }) : '';
    const city = obra.place || obra.ciudad || '';
    const architects = obra.arquitectos || t('sheet_architect_unknown');
    const year = obra.año_construccion ? ` · ${escapeHtml(obra.año_construccion)}` : '';

    return `
      <article class="radar-proximity-card" data-radar-feature-id="${escapeHtml(obra.featureId || obra.id)}" role="button" tabindex="0" aria-label="${escapeHtml(obra.nombre_obra)}">
        <div class="radar-proximity-header">
          <span class="radar-vermillon-badge">${distText}</span>
          <span class="radar-cat-badge" style="color:${catColor};">${escapeHtml(nombreCategoria(obra.categoria))}</span>
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
            ${city ? `<div class="radar-proximity-city">${escapeHtml(city)}</div>` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');

  window.lucide?.createIcons({ context: document.getElementById('itinerary-filter-badge') });
}

export async function renderRadarUI() {
  actualizarEstadoGPSUI();
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
  const routes = await getCuratedRoutes();
  const route = (routes || []).find((r) => r.id === routeId) || CURATED_ROUTES.find((r) => r.id === routeId);
  if (!route || !state.map) return;

  const panel = document.getElementById('radar-panel') || document.getElementById('explore-panel');
  if (panel) panel.classList.remove('open');
  const backdrop = document.getElementById('panel-backdrop');
  if (backdrop) backdrop.classList.remove('active');

  // Mostrar badge de carga mientras se obtienen todas las obras
  const itineraryBadge = document.getElementById('itinerary-filter-badge');
  const titleEl = document.getElementById('itinerary-badge-title');
  const countEl = document.getElementById('itinerary-badge-count');
  if (itineraryBadge && titleEl) {
    titleEl.textContent = `Cargando: ${route.title || 'Itinerario'}…`;
    if (countEl) countEl.textContent = '';
    const dotEl = document.getElementById('itinerary-badge-dot');
    if (dotEl) dotEl.style.backgroundColor = 'var(--accent, #E84E1B)';
    itineraryBadge.classList.remove('hidden');
    window.lucide?.createIcons?.();
  }

  // 1. Obtener catálogo completo para garantizar que se incluyan TODAS las obras del itinerario
  const catalog = (state.BUILDING_CATALOG && state.BUILDING_CATALOG.length > 0)
    ? state.BUILDING_CATALOG
    : await getBuildingsCatalog().catch(() => []);
  if (catalog && catalog.length > 0) {
    state.BUILDING_CATALOG = catalog;
  }

  // 2. Si el itinerario tiene IDs manuales y algunos faltan en memoria, descargarlos directamente
  const manualIds = route.work_ids || route.workIds;
  if (Array.isArray(manualIds) && manualIds.length > 0) {
    const missingIds = manualIds.filter((id) => !(state.OBRAS || []).some((w) => String(w.id) === String(id)));
    if (missingIds.length > 0) {
      const fetched = await fetchBuildingsByIds(missingIds).catch(() => []);
      (fetched || []).forEach((fila, idx) => {
        const enriched = {
          ...fila,
          id: fila.id,
          featureId: String(fila.id ?? `obra-${idx}`),
          categoria: normalizarCategoria(fila.categoria),
          coordenadas: (Array.isArray(fila.coordenadas) && fila.coordenadas.length === 2 && Number.isFinite(fila.coordenadas[0])) ? fila.coordenadas : [Number(fila.longitud), Number(fila.latitud)],
          arquitectos: Array.isArray(fila.arquitectos) ? fila.arquitectos.join(', ') : (fila.arquitecto || ''),
          ciudad: fila.place || fila.ciudad || null,
          place: fila.place || fila.ciudad || null,
          importancia: normalizarImportancia(fila.importancia),
          selected: false,
        };
        state.OBRAS = upsertBuilding(state.OBRAS, enriched);
      });
    }
  }

  // 3. Si el itinerario filtra por arquitecto, intentar enriquecer aún más con obras específicas
  if (route.architectsFilter && route.architectsFilter.length > 0) {
    try {
      for (const architect of route.architectsFilter) {
        const dbRows = await fetchBuildings({ architect, includeAllImportance: true }).catch(() => []);
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
            importancia: normalizarImportancia(fila.importancia),
            selected: false,
          };
          state.OBRAS = upsertBuilding(state.OBRAS, enriched);
        });
      }
    } catch (err) {
      console.warn('Error cargando obras adicionales del itinerario:', err);
    }
  }

  // 4. Obtener todas las obras coincidentes en toda la base de datos
  const allPool = dedupeBuildings([...state.OBRAS, ...(state.BUILDING_CATALOG || []), ...(state.privateBuildings || [])]);
  const matchingWorks = matchWorksForRoute(route, allPool);

  if (matchingWorks.length === 0) {
    if (itineraryBadge) itineraryBadge.classList.add('hidden');
    return;
  }

  // 4. Asegurar que todas las obras del itinerario estén en state.OBRAS listas para pintar
  matchingWorks.forEach((fila, idx) => {
    const coords = (Array.isArray(fila.coordenadas) && fila.coordenadas.length === 2 && Number.isFinite(fila.coordenadas[0]))
      ? fila.coordenadas
      : [Number(fila.longitud), Number(fila.latitud)];
    const enriched = {
      ...fila,
      id: fila.id,
      featureId: String(fila.id ?? `obra-${idx}`),
      categoria: normalizarCategoria(fila.categoria),
      coordenadas: coords,
      arquitectos: Array.isArray(fila.arquitectos) ? fila.arquitectos.join(', ') : (fila.arquitecto || ''),
      ciudad: fila.place || fila.ciudad || null,
      place: fila.place || fila.ciudad || null,
      importancia: normalizarImportancia(fila.importancia),
      selected: false,
    };
    state.OBRAS = upsertBuilding(state.OBRAS, enriched);
  });

  // 5. Establecer itinerario activo con modo Explora (icono de brújula y visible sin restricciones de zoom)
  state.activeItinerary = {
    id: route.id,
    title: route.title,
    isCollectionItinerary: true,
    isExplore: true,
    workIds: new Set(matchingWorks.map((w) => String(w.id))),
  };

  // 6. Actualizar fuentes de mapa
  actualizarFuenteMapa();
  actualizarVisibilidadIconosLista();

  // 7. Actualizar badge con conteo definitivo
  if (itineraryBadge && titleEl) {
    titleEl.textContent = `Ruta: ${route.title || 'Itinerario'}`;
    if (countEl) countEl.textContent = `(${matchingWorks.length})`;
    const dotEl = document.getElementById('itinerary-badge-dot');
    if (dotEl) dotEl.style.backgroundColor = 'var(--accent, #E84E1B)';
    window.lucide?.createIcons?.();
  }

  // 8. Transicionar a pestaña Mapa
  const mapNavBtn = document.getElementById('mobile-nav-map');
  if (mapNavBtn) {
    document.querySelectorAll('.mobile-nav-btn').forEach((b) => b.classList.remove('active'));
    mapNavBtn.classList.add('active');
  }

  // 9. Encuadre geográfico abarcando TODAS las obras del itinerario
  const validCoords = matchingWorks
    .map((w) => (Array.isArray(w.coordenadas) && w.coordenadas.length === 2 && Number.isFinite(w.coordenadas[0])) ? w.coordenadas : [Number(w.longitud), Number(w.latitud)])
    .filter((coords) => coords && coords.length === 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1]));

  if (validCoords.length === 1) {
    state.map.flyTo({ center: validCoords[0], zoom: 12, duration: 900 });
  } else if (validCoords.length > 1) {
    const bounds = validCoords.reduce((b, coord) => b.extend(coord), new mapboxgl.LngLatBounds(validCoords[0], validCoords[0]));
    state.map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 1000 });
  }
}

export function restaurarMapaGeneral() {
  state.activeItinerary = null;
  state.activeFilterChips = [];
  const itineraryBadge = document.getElementById('itinerary-filter-badge');
  if (itineraryBadge) {
    itineraryBadge.classList.add('hidden');
  }
  const emptyBanner = document.getElementById('filter-empty-banner');
  if (emptyBanner) {
    emptyBanner.classList.add('hidden');
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

