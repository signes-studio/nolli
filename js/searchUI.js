/* =========================================================================
   SEARCHUI.JS — Búsqueda y edificios cercanos
   ========================================================================= */

import { state } from './state.js';
import { abrirFicha } from './sheetUI.js';

const searchPanel = document.getElementById('search-panel');
const btnSearch = document.getElementById('btn-search');
const searchResults = document.getElementById('nearby-buildings');
const searchInput = document.getElementById('building-search');
const architectSelect = document.getElementById('building-architect');
const decadeSelect = document.getElementById('building-decade');

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

  [searchInput, architectSelect, decadeSelect].forEach((control) => {
    control.addEventListener('input', renderizarResultados);
    control.addEventListener('change', renderizarResultados);
  });

  document.addEventListener('radar:data-ready', actualizarOpciones);
}

function actualizarOpciones() {
  const previousArchitect = architectSelect.value;
  const previousDecade = decadeSelect.value;
  architectSelect.innerHTML = '<option value="">TODOS LOS ARQUITECTOS</option>';
  [...state.ARQUITECTOS].sort((a, b) => a.localeCompare(b)).forEach((architect) => {
    architectSelect.insertAdjacentHTML('beforeend', `<option value="${architect}">${architect}</option>`);
  });
  architectSelect.value = previousArchitect;

  const decades = [...new Set(state.OBRAS
    .map((obra) => Number(obra.año_construccion))
    .filter((year) => Number.isFinite(year))
    .map((year) => Math.floor(year / 10) * 10))]
    .sort((a, b) => b - a);
  decadeSelect.innerHTML = '<option value="">TODAS LAS DÉCADAS</option>';
  decades.forEach((decade) => decadeSelect.insertAdjacentHTML(
    'beforeend', `<option value="${decade}">${decade}s</option>`,
  ));
  decadeSelect.value = previousDecade;
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
  const selectedArchitect = architectSelect.value;
  const selectedDecade = decadeSelect.value;
  const results = state.OBRAS
    .filter((obra) => !text || String(obra.nombre_obra || '').toLowerCase().includes(text))
    .filter((obra) => !selectedArchitect || (obra.arquitectos || []).includes(selectedArchitect))
    .filter((obra) => !selectedDecade || Math.floor(Number(obra.año_construccion) / 10) * 10 === Number(selectedDecade))
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
  const item = event.target.closest('.nearby-item');
  if (!item) return;
  const obra = state.OBRAS.find((candidate) => String(candidate.featureId) === item.dataset.featureId);
  if (!obra || !state.map) return;
  state.map.flyTo({ center: obra.coordenadas, zoom: Math.max(state.map.getZoom(), 15) });
  abrirFicha(obra, obra.coordenadas, obra.featureId);
  searchPanel.classList.remove('open');
  btnSearch.classList.remove('active-state');
});
