/* =========================================================================
   MYPLACESUI.JS — Vista personal de favoritos y edificios visitados
   ========================================================================= */

import { state } from './state.js';
import { abrirFicha } from './sheetUI.js';

const panel = document.getElementById('my-places-panel');
const button = document.getElementById('btn-my-places');
const list = document.getElementById('my-places-list');
let activeTab = 'favorite';

export function initMyPlacesUI() {
  button.addEventListener('click', () => {
    if (!state.sessionToken) {
      alert('Inicia sesión para consultar tus favoritos y visitas.');
      return;
    }
    panel.classList.toggle('open');
    button.classList.toggle('active-state');
    renderList();
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('#btn-my-places-close')) {
      panel.classList.remove('open');
      button.classList.remove('active-state');
    }
    const tab = event.target.closest('[data-place-tab]');
    if (tab) {
      activeTab = tab.dataset.placeTab;
      document.querySelectorAll('[data-place-tab]').forEach((item) => item.classList.toggle('active', item === tab));
      renderList();
    }
    const item = event.target.closest('.my-place-item');
    if (item) {
      const obra = state.OBRAS.find((candidate) => String(candidate.featureId) === item.dataset.featureId);
      if (!obra || !state.map) return;
      state.map.flyTo({ center: obra.coordenadas, zoom: Math.max(state.map.getZoom(), 15) });
      abrirFicha(obra, obra.coordenadas, obra.featureId);
      panel.classList.remove('open');
      button.classList.remove('active-state');
    }
  });

  document.addEventListener('radar:user-status-ready', renderList);
  document.addEventListener('radar:user-status-changed', renderList);
  document.addEventListener('radar:logout', () => {
    panel.classList.remove('open');
    button.classList.remove('active-state');
    renderList();
  });
  renderList();
}

function renderList() {
  if (!state.sessionToken) {
    list.innerHTML = '<div class="nearby-empty">Inicia sesión para guardar y consultar tus edificios.</div>';
    return;
  }
  const results = state.OBRAS.filter((obra) => state.buildingStatuses.get(String(obra.id))?.[activeTab]);
  if (!results.length) {
    list.innerHTML = `<div class="nearby-empty">Todavía no tienes edificios ${activeTab === 'favorite' ? 'favoritos' : 'visitados'}.</div>`;
    return;
  }
  list.innerHTML = results.map((obra) => `
    <button type="button" class="my-place-item" data-feature-id="${obra.featureId}">
      <span>${obra.nombre_obra}</span>
      <span class="nearby-meta">${obra.arquitecto || ''}</span>
    </button>
  `).join('');
}
