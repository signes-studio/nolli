/* =========================================================================
   SEARCHUI.JS — Búsqueda de arquitectos con filtrado en cascada hacia edificios
   ========================================================================= */

import { state, separarArquitectos } from './state.js';
import { abrirFicha } from './sheetUI.js';
import { searchPlaces, fetchBuildings } from './api.js';

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

let cacheObrasGlobales = null;

const COLORES_CATEGORIA = {
  'residencial': '#E95C0C',
  'dotacional_equipamiento': '#4388C6',
  'religioso_funerario': '#F2ACCD',
  'comercial_terciario': '#EFBC02',
  'espacio_publico_paisaje': '#0d682f',
  'infraestructura_urbanismo': '#D6201D',
  'industrial_logistico': '#691B14',
  'otro': '#064773'
};

function obtenerColorCategoria(categoria) {
  const catKey = normalizarTexto(categoria || 'otro').replace(/\s+/g, '_');
  return COLORES_CATEGORIA[catKey] || COLORES_CATEGORIA['otro'];
}

export function initSearchUI() {
  btnSearch.addEventListener('click', () => {
    const isOpen = searchPanel.classList.toggle('open');
    btnSearch.classList.toggle('active-state');
    if (isOpen) {
      // Reseteamos los inputs y resultados cada vez que se ABRE el panel
      searchInput.value = '';
      architectInput.value = '';
      locationInput.value = '';
      locationResults.innerHTML = '';
      if (architectSuggestions) {
        architectSuggestions.innerHTML = '';
        architectSuggestions.hidden = true;
      }
      solicitarUbicacion();
      ejecutarBusquedaGlobal();
    }
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('#btn-search-close')) {
      searchPanel.classList.remove('open');
      btnSearch.classList.remove('active-state');
      // Reseteamos también al cerrar explícitamente con la "X"
      searchInput.value = '';
      architectInput.value = '';
      locationInput.value = '';
      locationResults.innerHTML = '';
    }
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(ejecutarBusquedaGlobal, 120);
  });

  architectInput.addEventListener('input', () => {
    if (architectSuggestions) {
      architectSuggestions.innerHTML = '';
      architectSuggestions.hidden = true;
    }
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(ejecutarBusquedaGlobal, 120);
  });

  locationInput.addEventListener('input', () => {
    clearTimeout(locationSearchTimer);
    const query = locationInput.value.trim();
    if (query.length >= 2) {
      locationSearchTimer = setTimeout(() => buscarUbicaciones(query), 250);
    } else {
      locationResults.innerHTML = '';
    }
  });

  locationInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      clearTimeout(locationSearchTimer);
      const query = locationInput.value.trim();
      if (query.length >= 2) {
        buscarUbicaciones(query);
      } else {
        locationResults.innerHTML = '';
      }
    }
  });

  document.addEventListener('radar:data-ready', () => {
    cacheObrasGlobales = null;
    actualizarOpciones();
  });
}

async function buscarUbicaciones(query) {
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
    locationResults.innerHTML = '<div class="nearby-empty">No se pudo buscar la ubicación.</div>';
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function actualizarOpciones() {
  const previousArchitect = architectInput.value;
  architectInput.value = previousArchitect;
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

    searchResults.innerHTML = topCercanos.map(({ obra, distance }) => {
      const colorCat = obtenerColorCategoria(obra.categoria);
      return `
        <button type="button" class="nearby-item" data-feature-id="${obra.featureId}" data-lng="${obra.coordenadas[0]}" data-lat="${obra.coordenadas[1]}">
          <span class="nearby-name">
            <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${colorCat}; margin-right:8px; vertical-align:middle;"></span>
            ${escapeHtml(obra.nombre_obra)}
          </span>
          <span class="nearby-meta">${state.userLocation ? formatearDistancia(distance) : escapeHtml(obra.arquitecto || '')}</span>
        </button>
      `;
    }).join('');
    return;
  }

  // CASO 2: HAY TEXTO EN EL BUSCADOR DE EDIFICIOS -> Filtrar edificios por nombre
  if (textQuery) {
    const obrasFiltradas = obrasEncontradas.filter((obra) => 
      normalizarTexto(obra.nombre_obra).includes(textQuery)
    );

    if (!obrasFiltradas.length) {
      searchResults.innerHTML = '<div class="nearby-empty">No se encontraron edificios con ese nombre.</div>';
      return;
    }

    searchResults.innerHTML = obrasFiltradas.slice(0, 15).map((obra) => {
      const distance = state.userLocation ? distanciaEnKm(state.userLocation, obra.coordenadas) : 0;
      const colorCat = obtenerColorCategoria(obra.categoria);
      return `
        <button type="button" class="nearby-item" data-feature-id="${obra.featureId}" data-lng="${obra.coordenadas[0]}" data-lat="${obra.coordenadas[1]}">
          <span class="nearby-name">
            <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${colorCat}; margin-right:8px; vertical-align:middle;"></span>
            ${escapeHtml(obra.nombre_obra)}
          </span>
          <span class="nearby-meta">${state.userLocation ? formatearDistancia(distance) : escapeHtml(obra.arquitecto || '')}</span>
        </button>
      `;
    }).join('');
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

  if (!obrasDelArquitecto.length) {
    searchResults.innerHTML = '<div class="nearby-empty">No hay obras para este arquitecto.</div>';
    return;
  }

  const resultadosConDistancia = obrasDelArquitecto.map((obra) => {
    const distance = state.userLocation ? distanciaEnKm(state.userLocation, obra.coordenadas) : 0;
    return { obra, distance };
  });

  if (state.userLocation) {
    resultadosConDistancia.sort((a, b) => a.distance - b.distance);
  }

  searchResults.innerHTML = resultadosConDistancia.map(({ obra, distance }) => {
    const colorCat = obtenerColorCategoria(obra.categoria);
    return `
      <button type="button" class="nearby-item" data-feature-id="${obra.featureId}" data-lng="${obra.coordenadas[0]}" data-lat="${obra.coordenadas[1]}">
        <span class="nearby-name">
          <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${colorCat}; margin-right:8px; vertical-align:middle;"></span>
          ${escapeHtml(obra.nombre_obra)}
        </span>
        <span class="nearby-meta">${state.userLocation ? formatearDistancia(distance) : escapeHtml(obra.arquitecto || '')}</span>
      </button>
    `;
  }).join('');
}