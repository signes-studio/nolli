import { state, separarArquitectos, transformarEdificio, normalizarCategoria, nombreCategoria, CATEGORY_COLORS, escapeHtml } from './state.js';
import { abrirFicha } from './sheetUI.js';
import { searchPlaces, fetchBuildings } from './api.js';
import { actualizarFuenteMapa } from './mapData.js';

const searchPanel = document.getElementById('search-panel');
const btnSearch = document.getElementById('btn-search');
const searchResults = document.getElementById('nearby-buildings');
const locationResults = document.getElementById('location-results');
const locationInput = document.getElementById('location-search');
const searchInput = document.getElementById('building-search');
const architectInput = document.getElementById('building-architect');
const architectSuggestions = document.getElementById('architect-suggestions');
let locationSearchTimer = null;
let locationSearchRequest = 0;
let searchDebounceTimer = null;
let currentSearchResults = [];

let cacheObrasGlobales = null;

function renderizarTarjetaObra(obra, distance = null) {
  const catClave = normalizarCategoria(obra.categoria);
  const catTexto = nombreCategoria(obra.categoria);
  const catColor = CATEGORY_COLORS[catClave] || '#E84E1B';

  const titulo = escapeHtml(obra.nombre_obra || 'OBRA SIN TÍTULO').toUpperCase();
  const arq = escapeHtml(obra.arquitecto || 'Desconocido');
  const anio = obra.año_construccion ? escapeHtml(String(obra.año_construccion)) : '';
  const ciudad = obra.ciudad || obra.place ? escapeHtml(String(obra.ciudad || obra.place).toUpperCase()) : '';
  
  const metaParts = [arq];
  if (anio) metaParts.push(anio);
  if (ciudad) metaParts.push(ciudad);
  if (distance != null && state.userLocation && Number.isFinite(distance)) {
    metaParts.push(formatearDistancia(distance));
  }

  return `
    <button type="button" class="nearby-item search-work-card" data-feature-id="${escapeHtml(obra.featureId)}" data-lng="${obra.coordenadas[0]}" data-lat="${obra.coordenadas[1]}" aria-label="Ver obra ${titulo}">
      <div class="search-card-main">
        <div class="search-card-top-row">
          <span class="search-cat-tag" style="color:${catColor};">[ ${escapeHtml(catTexto)} ]</span>
        </div>
        <div class="search-card-title">${titulo}</div>
        <div class="search-card-meta">
          <span class="search-meta-text">${metaParts.join(' · ')}</span>
        </div>
      </div>
    </button>
  `;
}

export function initSearchUI() {
  if (btnSearch) {
    btnSearch.addEventListener('click', (e) => {
      e.stopPropagation();
      const widget = document.getElementById('mobile-search-widget');
      const mobileInput = document.getElementById('mobile-search-input');
      if (widget) {
        const isCollapsed = widget.classList.contains('collapsed');
        if (isCollapsed) {
          widget.classList.remove('collapsed');
          widget.classList.add('expanded');
          btnSearch.classList.add('active-state');
          setTimeout(() => mobileInput?.focus(), 100);
        } else {
          widget.classList.remove('expanded');
          widget.classList.add('collapsed');
          btnSearch.classList.remove('active-state');
        }
      }
    });
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('#btn-search-close')) {
      searchPanel?.classList.remove('open');
      btnSearch?.classList.remove('active-state');
      if (locationResults) locationResults.innerHTML = '';
      const backdrop = document.getElementById('panel-backdrop');
      if (backdrop) backdrop.classList.remove('active');
    }
  });

  searchInput?.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(ejecutarBusquedaGlobal, 120);
  });

  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const val = searchInput.value.trim();
      if (val) {
        searchPanel?.classList.remove('open');
        btnSearch?.classList.remove('active-state');
        activarFiltroBusquedaEnMapa(val, currentSearchResults.length ? currentSearchResults : null);
      }
    }
  });

  architectInput?.addEventListener('input', () => {
    if (architectSuggestions) {
      architectSuggestions.innerHTML = '';
      architectSuggestions.hidden = true;
    }
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(ejecutarBusquedaGlobal, 120);
  });

  architectInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const val = architectInput.value.trim();
      if (val) {
        searchPanel?.classList.remove('open');
        btnSearch?.classList.remove('active-state');
        activarFiltroBusquedaEnMapa(val, currentSearchResults.length ? currentSearchResults : null);
      }
    }
  });

  locationInput?.addEventListener('input', () => {
    clearTimeout(locationSearchTimer);
    const query = locationInput.value.trim();
    if (query.length >= 2) {
      locationSearchTimer = setTimeout(() => buscarUbicaciones(query), 250);
    } else {
      if (locationResults) locationResults.innerHTML = '';
    }
  });

  locationInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      clearTimeout(locationSearchTimer);
      const query = locationInput.value.trim();
      if (query.length >= 2) {
        buscarUbicaciones(query);
      } else {
        if (locationResults) locationResults.innerHTML = '';
      }
    }
  });

  document.addEventListener('radar:data-ready', () => {
    cacheObrasGlobales = null;
    actualizarOpciones();
  });
}

async function buscarUbicaciones(query) {
  if (!locationResults) return;
  const requestId = ++locationSearchRequest;
  locationResults.innerHTML = '<div class="nearby-empty">BUSCANDO UBICACIONES...</div>';
  try {
    const data = await searchPlaces(query);
    if (requestId !== locationSearchRequest) return;
    const places = data.features || [];
    locationResults.innerHTML = places.length ? places.map((place) => `
      <button type="button" class="nearby-item location-result" data-location-center="${place.center.join(',')}" data-location-zoom="${place.bbox ? 12 : 14}">
        <span class="nearby-name">${escapeHtml(place.text || place.place_name)}</span>
        <span class="nearby-meta">${escapeHtml(place.place_name || '')}</span>
      </button>
    `).join('') : '<div class="nearby-empty">No se encontraron ubicaciones.</div>';
  } catch (error) {
    if (requestId !== locationSearchRequest) return;
    console.error('Error buscando ubicación:', error);
    if (locationResults) locationResults.innerHTML = '<div class="nearby-empty">No se pudo buscar la ubicación.</div>';
  }
}

function actualizarOpciones() {
  if (architectInput) {
    const previousArchitect = architectInput.value;
    architectInput.value = previousArchitect;
  }
}

function solicitarUbicacion() {
  if (state.userLocation || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.userLocation = { lng: position.coords.longitude, lat: position.coords.latitude };
      if (!searchInput.value.trim() && !architectInput.value.trim() && !locationInput.value.trim()) {
        ejecutarBusquedaGlobal();
      }
    },
    () => {
      if (!searchInput.value.trim() && !architectInput.value.trim() && !locationInput.value.trim()) {
        ejecutarBusquedaGlobal();
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
  );
}

async function obtenerObrasGlobales() {
  if (cacheObrasGlobales) return cacheObrasGlobales;

  try {
    const filas = await fetchBuildings({ includeAllImportance: true });
    cacheObrasGlobales = filas.map((fila, index) => ({
      id: fila.id,
      featureId: String(fila.id ?? `obra-${index}`),
      nombre_obra: fila.nombre_obra,
      foto_url: fila.foto_url || null,
      enlace_url: fila.enlace_url || null,
      arquitecto: fila.arquitecto,
      arquitectos: separarArquitectos(fila.arquitecto),
      año_construccion: fila.año_construccion,
      importancia: fila.importancia,
      categoria: fila.categoria,
      ciudad: fila.place || fila.ciudad || null,
      place: fila.place || null,
      coordenadas: [fila.longitud, fila.latitud],
    }));
    return cacheObrasGlobales;
  } catch (error) {
    console.error('Error al obtener obras de Supabase:', error);
    return [];
  }
}

async function ejecutarBusquedaGlobal() {
  const textQuery = normalizarTexto(searchInput.value.trim());
  const architectQuery = normalizarTexto(architectInput.value.trim());

  const obrasEncontradas = await obtenerObrasGlobales();

  if (!obrasEncontradas.length) {
    searchResults.innerHTML = '<div class="nearby-empty">No hay resultados en la base de datos.</div>';
    return;
  }

  // CASO 1: NINGÚN FILTRO ACTIVO -> Mostrar los 10 edificios más cercanos
  if (!textQuery && !architectQuery) {
    const resultadosConDistancia = obrasEncontradas.map((obra) => {
      const distance = state.userLocation ? distanciaEnKm(state.userLocation, obra.coordenadas) : 0;
      return { obra, distance };
    });

    if (state.userLocation) {
      resultadosConDistancia.sort((a, b) => a.distance - b.distance);
    }

    const topCercanos = resultadosConDistancia.slice(0, 10);

    searchResults.innerHTML = topCercanos.map(({ obra, distance }) => 
      renderizarTarjetaObra(obra, distance)
    ).join('');
    return;
  }

  // CASO 2: HAY TEXTO EN EL BUSCADOR DE EDIFICIOS -> Filtrar edificios por nombre
  if (textQuery) {
    const obrasFiltradas = obrasEncontradas.filter((obra) => 
      normalizarTexto(obra.nombre_obra).includes(textQuery)
    );

    currentSearchResults = obrasFiltradas;

    if (!obrasFiltradas.length) {
      searchResults.innerHTML = '<div class="nearby-empty">No se encontraron edificios con ese nombre.</div>';
      return;
    }

    const filterHeader = `
      <button type="button" class="nearby-item btn-apply-search-filter" data-action="filter-text-map">
        <i data-lucide="filter" class="filter-action-icon" width="14" height="14"></i>
        <span>[ VER TODAS LAS ${obrasFiltradas.length} OBRAS EN EL MAPA ]</span>
      </button>
    `;

    const listHtml = obrasFiltradas.slice(0, 20).map((obra) => {
      const distance = state.userLocation ? distanciaEnKm(state.userLocation, obra.coordenadas) : null;
      return renderizarTarjetaObra(obra, distance);
    }).join('');

    searchResults.innerHTML = filterHeader + listHtml;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // CASO 3: HAY TEXTO EN EL BUSCADOR DE ARQUITECTOS -> Mostrar lista de arquitectos coincidentes
  const mapaArquitectos = new Map();
  obrasEncontradas.forEach((obra) => {
    const arqs = obra.arquitectos?.length ? obra.arquitectos : separarArquitectos(obra.arquitecto);
    arqs.forEach((arq) => {
      if (!arq) return;
      if (!mapaArquitectos.has(arq)) {
        mapaArquitectos.set(arq, []);
      }
      mapaArquitectos.set(arq, [...mapaArquitectos.get(arq), obra]);
    });
  });

  const arquitectosList = [...mapaArquitectos.entries()]
    .map(([nombre, obras]) => ({ nombre, count: obras.length }))
    .filter(({ nombre }) => normalizarTexto(nombre).includes(architectQuery))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .slice(0, 20);

  if (!arquitectosList.length) {
    searchResults.innerHTML = '<div class="nearby-empty">No se encontraron arquitectos.</div>';
    return;
  }

  searchResults.innerHTML = arquitectosList.map(({ nombre, count }) => `
    <button type="button" class="nearby-item architect-result-item" data-architect-select="${escapeHtml(nombre)}">
      <span class="nearby-name">${escapeHtml(nombre)}</span>
      <span class="nearby-meta">${count} ${count === 1 ? 'obra' : 'obras'}</span>
    </button>
  `).join('');
}

function normalizarTexto(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function distanciaEnKm(origen, destino) {
  const radioTierra = 6371;
  const lat1 = origen.lat * Math.PI / 180;
  const lat2 = destino[1] * Math.PI / 180;
  const deltaLat = (destino[1] - origen.lat) * Math.PI / 180;
  const deltaLng = (destino[0] - origen.lng) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return radioTierra * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatearDistancia(distanceKm) {
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`;
}

document.addEventListener('click', (event) => {
  const filterTextBtn = event.target.closest('[data-action="filter-text-map"]');
  if (filterTextBtn) {
    const q = searchInput.value.trim();
    searchPanel.classList.remove('open');
    btnSearch.classList.remove('active-state');
    const backdrop = document.getElementById('panel-backdrop');
    if (backdrop) backdrop.classList.remove('active');
    activarFiltroBusquedaEnMapa(q, currentSearchResults);
    return;
  }

  const filterArqBtn = event.target.closest('[data-action="filter-architect-map"]');
  if (filterArqBtn) {
    const q = architectInput.value.trim();
    searchPanel.classList.remove('open');
    btnSearch.classList.remove('active-state');
    const backdrop = document.getElementById('panel-backdrop');
    if (backdrop) backdrop.classList.remove('active');
    activarFiltroBusquedaEnMapa(q, currentSearchResults);
    return;
  }

  const architectItem = event.target.closest('[data-architect-select]');
  if (architectItem) {
    const arqName = architectItem.dataset.architectSelect;
    architectInput.value = arqName;
    if (architectSuggestions) {
      architectSuggestions.innerHTML = '';
      architectSuggestions.hidden = true;
    }
    mostrarEdificiosDeArquitecto(arqName);
    return;
  }
  
  const location = event.target.closest('.location-result');
  if (location && state.map) {
    const center = location.dataset.locationCenter.split(',').map(Number);
    state.map.flyTo({ center, zoom: Number(location.dataset.locationZoom) || 13 });
    locationInput.value = location.querySelector('.nearby-name')?.textContent || locationInput.value;
    locationResults.innerHTML = '';
    searchPanel.classList.remove('open');
    btnSearch.classList.remove('active-state');
    return;
  }
  
  const item = event.target.closest('.nearby-item');
  if (!item) return;
  
  const featureId = item.dataset.featureId;
  if (!featureId) return;

  let obra = state.OBRAS.find((candidate) => String(candidate.featureId) === String(featureId));
  
  if (!obra && cacheObrasGlobales) {
    obra = cacheObrasGlobales.find((candidate) => String(candidate.featureId) === String(featureId));
    if (obra) {
      state.OBRAS.push(obra);
    }
  }

  if (!obra && item.dataset.lng && item.dataset.lat) {
    obra = {
      id: featureId,
      featureId: featureId,
      nombre_obra: item.querySelector('.nearby-name')?.textContent,
      coordenadas: [parseFloat(item.dataset.lng), parseFloat(item.dataset.lat)]
    };
    state.OBRAS.push(obra);
  }

  if (!obra || !state.map) return;
  
  state.map.flyTo({ center: obra.coordenadas, zoom: Math.max(state.map.getZoom(), 15) });
  abrirFicha(obra, obra.coordenadas, obra.featureId);
  searchPanel.classList.remove('open');
  btnSearch.classList.remove('active-state');
  
  // Limpiamos también al seleccionar un edificio y cerrar el panel
  searchInput.value = '';
  architectInput.value = '';
  locationInput.value = '';
});

async function mostrarEdificiosDeArquitecto(nombreArquitecto) {
  const obrasEncontradas = await obtenerObrasGlobales();
  const arqQuery = normalizarTexto(nombreArquitecto);

  const obrasDelArquitecto = obrasEncontradas.filter((obra) => {
    const arqs = obra.arquitectos?.length ? obra.arquitectos : separarArquitectos(obra.arquitecto);
    return arqs.some((arq) => normalizarTexto(arq) === arqQuery);
  });

  currentSearchResults = obrasDelArquitecto;

  if (!obrasDelArquitecto.length) {
    searchResults.innerHTML = '<div class="nearby-empty">No hay obras para este arquitecto.</div>';
    return;
  }

  const filterHeader = `
    <button type="button" class="nearby-item btn-apply-search-filter" data-action="filter-architect-map">
      <i data-lucide="filter" class="filter-action-icon" width="14" height="14"></i>
      <span>[ VER TODAS LAS ${obrasDelArquitecto.length} OBRAS EN EL MAPA ]</span>
    </button>
  `;

  const resultadosConDistancia = obrasDelArquitecto.map((obra) => {
    const distance = state.userLocation ? distanciaEnKm(state.userLocation, obra.coordenadas) : null;
    return { obra, distance };
  });

  if (state.userLocation) {
    resultadosConDistancia.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  }

  const listHtml = resultadosConDistancia.map(({ obra, distance }) => 
    renderizarTarjetaObra(obra, distance)
  ).join('');

  searchResults.innerHTML = filterHeader + listHtml;
  if (window.lucide) window.lucide.createIcons();
}

export async function activarFiltroBusquedaEnMapa(queryText, providedMatches = null) {
  const q = String(queryText || '').trim();
  if (!q) return;

  function normalize(str) {
    return (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  const qNorm = normalize(q);
  let matches = Array.isArray(providedMatches) && providedMatches.length ? [...providedMatches] : null;

  if (!matches || !matches.length) {
    let catalogo = [];
    try {
      const dbRows = await fetchBuildings({ includeAllImportance: true });
      catalogo = (dbRows || []).map((row, idx) => transformarEdificio(row, idx));
    } catch (e) {
      catalogo = state.OBRAS || [];
    }

    matches = catalogo.filter((obra) => {
      const name = normalize(obra.nombre_obra);
      const arq = normalize(Array.isArray(obra.arquitectos) ? obra.arquitectos.join(' ') : obra.arquitecto);
      const city = normalize(obra.ciudad || obra.place);
      const style = normalize(obra.estilo);
      const cat = normalize(obra.categoria);
      const tags = normalize(Array.isArray(obra.tags) ? obra.tags.join(' ') : obra.tags);
      const year = String(obra.año_construccion || '');
      return name.includes(qNorm) || arq.includes(qNorm) || city.includes(qNorm) || style.includes(qNorm) || cat.includes(qNorm) || tags.includes(qNorm) || year.includes(qNorm);
    });
  }

  // 1. Garantizar que TODAS las obras coincidentes están presentes en state.OBRAS
  const existingIds = new Set(state.OBRAS.map((o) => String(o.id)));
  matches.forEach((m, idx) => {
    if (!existingIds.has(String(m.id))) {
      const transformed = (m.coordenadas && m.coordenadas.length === 2)
        ? m
        : transformarEdificio(m, state.OBRAS.length + idx);
      state.OBRAS.push(transformed);
      existingIds.add(String(m.id));
    }
  });

  // Cerrar paneles abiertos y backdrops
  ['search-panel', 'explore-panel', 'filter-panel', 'radar-panel', 'my-places-panel', 'map-style-panel'].forEach((id) => {
    document.getElementById(id)?.classList.remove('open');
  });
  const backdrop = document.getElementById('panel-backdrop');
  if (backdrop) backdrop.classList.remove('active');

  const matchIds = new Set(matches.map((w) => String(w.id || w.featureId)));

  // 2. Establecer filtro activo en el estado con TODAS las obras coincidentes
  state.activeItinerary = {
    id: `search-${qNorm}`,
    title: `FILTRO: ${q.toUpperCase()}`,
    workIds: matchIds,
  };

  // 3. Renderizar exclusivamente las obras del filtro en el mapa
  actualizarFuenteMapa();

  // 4. Mostrar etiqueta flotante de filtro
  const itineraryBadge = document.getElementById('itinerary-filter-badge');
  const titleEl = document.getElementById('itinerary-badge-title');
  const countEl = document.getElementById('itinerary-badge-count');

  if (itineraryBadge && titleEl) {
    titleEl.textContent = `CRITERIO: ${q.toUpperCase()}`;
    if (countEl) countEl.textContent = `${matches.length} ${matches.length === 1 ? 'OBRA' : 'OBRAS'}`;
    itineraryBadge.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  // 5. Transicionar a la pestaña Mapa en la barra inferior móvil
  const mapNavBtn = document.getElementById('mobile-nav-map');
  if (mapNavBtn) {
    document.querySelectorAll('.mobile-nav-btn').forEach((b) => b.classList.remove('active'));
    mapNavBtn.classList.add('active');
  }

  // 6. Encuadre geográfico en el mapa que abarque todas las obras
  const validCoords = matches
    .map((w) => w.coordenadas || (w.longitud != null && w.latitud != null ? [w.longitud, w.latitud] : null))
    .filter((coords) => coords && coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1]));

  if (validCoords.length > 0 && state.map) {
    if (validCoords.length === 1) {
      state.map.flyTo({ center: validCoords[0], zoom: 16, duration: 800 });
    } else {
      const bounds = validCoords.reduce(
        (b, coord) => b.extend(coord),
        new mapboxgl.LngLatBounds(validCoords[0], validCoords[0])
      );
      state.map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 1000 });
    }
  }
}