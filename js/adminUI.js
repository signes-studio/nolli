/* =========================================================================
   ADMINUI.JS — Gestión de proyectos para administradores
   ========================================================================= */

import { state, separarArquitectos } from './state.js';
import { deleteBuilding } from './api.js';
import { actualizarFuenteMapa } from './mapData.js';
import { generarFiltrosUI } from './filtersUI.js';
import { MAPBOX_TOKEN, GEOCODING_LANGUAGE } from './config.js';

const panel = document.getElementById('admin-panel');
const button = document.getElementById('btn-admin-panel');
const search = document.getElementById('admin-search');
const count = document.getElementById('admin-count');
const list = document.getElementById('admin-project-list');
const cityCache = new Map();

export function initAdminUI() {
  button.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) renderList();
  });
  search.addEventListener('input', renderList);

  document.addEventListener('click', (event) => {
    if (event.target.closest('#btn-admin-close')) panel.classList.remove('open');
    const edit = event.target.closest('[data-admin-edit]');
    if (edit) {
      const obra = state.OBRAS.find((item) => String(item.id) === edit.dataset.adminEdit);
      if (obra) {
        document.dispatchEvent(new CustomEvent('radar:edit-building', { detail: { obra } }));
        panel.classList.remove('open');
      }
    }
    const remove = event.target.closest('[data-admin-delete]');
    if (remove) eliminarProyecto(remove.dataset.adminDelete);
  });

  document.addEventListener('radar:admin-login', () => button.classList.remove('hidden'));
  document.addEventListener('radar:logout', () => {
    button.classList.add('hidden');
    panel.classList.remove('open');
  });
  document.addEventListener('radar:data-ready', renderList);
  document.addEventListener('radar:user-login', () => button.classList.add('hidden'));
}

async function renderList() {
  if (state.userRole !== 'admin') return;
  const text = search.value.trim().toLowerCase();
  const projects = state.OBRAS.filter((obra) => `${obra.nombre_obra} ${obra.arquitecto}`.toLowerCase().includes(text));
  count.textContent = `${projects.length} / ${state.OBRAS.length}`;
  if (!projects.length) {
    list.innerHTML = '<div class="nearby-empty">No hay proyectos que coincidan.</div>';
    return;
  }
  list.innerHTML = projects.map((obra) => `
    <div class="admin-project">
      <div class="admin-project-info">
        <strong>${obra.nombre_obra}</strong>
        <span>${obra.arquitecto || 'Sin arquitecto'}</span>
        <span class="admin-project-city" data-city-for="${obra.featureId}">LOCALIZACIÓN...</span>
      </div>
      <div class="admin-project-actions">
        <button type="button" class="btn admin-action-edit" data-admin-edit="${obra.id}">EDITAR</button>
        <button type="button" class="btn admin-action-delete" data-admin-delete="${obra.id}">BORRAR</button>
      </div>
    </div>
  `).join('');

  await Promise.all(projects.map(async (obra) => {
    const cityElement = list.querySelector(`[data-city-for="${obra.featureId}"]`);
    if (!cityElement) return;
    cityElement.textContent = await obtenerCiudad(obra);
  }));
}

async function obtenerCiudad(obra) {
  if (obra.ciudad) return obra.ciudad;
  const coordinates = obra.coordenadas || [];
  if (coordinates.length !== 2 || !coordinates.every(Number.isFinite)) return 'Ubicación no disponible';
  const cacheKey = coordinates.join(',');
  if (cityCache.has(cacheKey)) return cityCache.get(cacheKey);
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${coordinates[0]},${coordinates[1]}.json?types=place,locality,municipality&language=${GEOCODING_LANGUAGE}&limit=1&access_token=${MAPBOX_TOKEN}`;
    const response = await fetch(url);
    const data = await response.json();
    const city = data.features?.[0]?.text || 'Ciudad no disponible';
    cityCache.set(cacheKey, city);
    return city;
  } catch {
    return 'Ciudad no disponible';
  }
}

async function eliminarProyecto(id) {
  const obra = state.OBRAS.find((item) => String(item.id) === String(id));
  if (!obra || !window.confirm(`¿Borrar "${obra.nombre_obra}"?`)) return;
  try {
    await deleteBuilding(id, state.sessionToken);
    state.OBRAS = state.OBRAS.filter((item) => String(item.id) !== String(id));
    state.ARQUITECTOS = [...new Set(state.OBRAS.flatMap((item) => separarArquitectos(item.arquitecto)))];
    state.activeArquitectos = new Set([...state.activeArquitectos].filter((architect) => state.ARQUITECTOS.includes(architect)));
    actualizarFuenteMapa();
    generarFiltrosUI();
    renderList();
  } catch (error) {
    alert(error.message);
  }
}
