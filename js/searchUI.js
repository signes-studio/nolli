/* =========================================================================
   SEARCHUI.JS — Búsqueda y edificios cercanos
   ========================================================================= */

import { state } from './state.js';
import { abrirFicha } from './sheetUI.js';
import { searchPlaces } from './api.js';

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

export function initSearchUI() {
  btnSearch.addEventListener('click', () => {
    searchPanel.classList.toggle('open');
    btnSearch.classList.toggle('active-state');
    if (searchPanel.classList.contains('open')) {
      actualizarOpciones();
      solicitarUbicacion();
      renderizarResultados();
    }
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('#btn-search-close')) {
      searchPanel.classList.remove('open');
      btnSearch.classList.remove('active-state');
    }
  });

  [searchInput, architectInput].forEach((control) => {
    control.addEventListener('input', renderizarResultados);
    control.addEventListener('change', renderizarResultados);
  });
  architectInput.addEventListener('input', mostrarSugerenciasArquitectos);
  locationInput.addEventListener('input', () => {
    clearTimeout(locationSearchTimer);
    const query = locationInput.value.trim();
    if (query.length < 2) {
      locationResults.innerHTML = '';
      return;
    }
    locationSearchTimer = setTimeout(() => buscarUbicaciones(query), 280);
  });

  document.addEventListener('radar:data-ready', actualizarOpciones);
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

function mostrarSugerenciasArquitectos() {
  const query = architectInput.value.trim().toLowerCase();
  if (!query) {
    architectSuggestions.innerHTML = '';
    architectSuggestions.hidden = true;
    return;
  }
  const matches = state.ARQUITECTOS
    .filter((architect) => architect.toLowerCase().includes(query))
    .sort((first, second) => first.localeCompare(second, 'es'))
    .slice(0, 8);
  architectSuggestions.innerHTML = matches.map((architect) => `
    <button type="button" class="architect-suggestion" data-architect-suggestion="${escapeHtml(architect)}">${escapeHtml(architect)}</button>
  `).join('');
  architectSuggestions.hidden = !matches.length;
}

function solicitarUbicacion() {
  if (state.userLocation || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.userLocation = { lng: position.coords.longitude, lat: position.coords.latitude };
      renderizarResultados();
    },
    () => renderizarResultados('Activa el permiso de ubicación para ordenar los edificios por cercanía.'),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
  );
}

function renderizarResultados(message = '') {
  if (!state.OBRAS.length) {
    searchResults.innerHTML = '<div class="nearby-empty">No hay edificios disponibles.</div>';
    return;
  }
  if (!state.userLocation) {
    searchResults.innerHTML = `<div class="nearby-empty">${message || 'Calculando tu ubicación...'}</div>`;
    return;
  }

  const text = searchInput.value.trim().toLowerCase();
  const selectedArchitect = architectInput.value.trim().toLowerCase();
  const results = state.OBRAS
    .filter((obra) => !text || String(obra.nombre_obra || '').toLowerCase().includes(text))
    .filter((obra) => !selectedArchitect || (obra.arquitectos || []).some((architect) => architect.toLowerCase() === selectedArchitect))
    .map((obra) => ({ obra, distance: distanciaEnKm(state.userLocation, obra.coordenadas) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10);

  if (!results.length) {
    searchResults.innerHTML = '<div class="nearby-empty">No hay resultados con esos filtros.</div>';
    return;
  }
  searchResults.innerHTML = results.map(({ obra, distance }) => `
    <button type="button" class="nearby-item" data-feature-id="${obra.featureId}">
      <span class="nearby-name">${obra.nombre_obra}</span>
      <span class="nearby-meta">${formatearDistancia(distance)}</span>
    </button>
  `).join('');
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
  const suggestion = event.target.closest('[data-architect-suggestion]');
  if (suggestion) {
    architectInput.value = suggestion.dataset.architectSuggestion;
    architectSuggestions.innerHTML = '';
    architectSuggestions.hidden = true;
    renderizarResultados();
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
  const obra = state.OBRAS.find((candidate) => String(candidate.featureId) === item.dataset.featureId);
  if (!obra || !state.map) return;
  state.map.flyTo({ center: obra.coordenadas, zoom: Math.max(state.map.getZoom(), 15) });
  abrirFicha(obra, obra.coordenadas, obra.featureId);
  searchPanel.classList.remove('open');
  btnSearch.classList.remove('active-state');
});
