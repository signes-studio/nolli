/* =========================================================================
   MYPLACESUI.JS — Zona personal del usuario
   ========================================================================= */

import { state } from './state.js';
import { abrirFicha } from './sheetUI.js';
import {
  fetchUserCollections,
  fetchUserCollectionItems,
  fetchUserPrivateLabels,
  createUserCollection,
  deleteUserCollection,
  deleteUserCollectionItem,
  deleteUserPrivateLabel,
} from './api.js';

const panel = document.getElementById('my-places-panel');
const button = document.getElementById('btn-my-places');
const list = document.getElementById('my-places-list');
let activeTab = 'favorite';

export function initMyPlacesUI() {
  button.addEventListener('click', () => {
    if (!state.sessionToken) {
      alert('Inicia sesión para consultar tu zona personal.');
      return;
    }
    panel.classList.toggle('open');
    button.classList.toggle('active-state');
    syncZonaPersonal();
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
      return;
    }

    const createCollectionButton = event.target.closest('[data-create-collection]');
    if (createCollectionButton) {
      crearListaDesdePanel();
      return;
    }

    const deleteCollectionButton = event.target.closest('[data-delete-collection]');
    if (deleteCollectionButton) {
      borrarLista(deleteCollectionButton.dataset.deleteCollection);
      return;
    }

    const removeItemButton = event.target.closest('[data-remove-from-collection]');
    if (removeItemButton) {
      quitarGuardado(removeItemButton.dataset.collectionId, removeItemButton.dataset.removeFromCollection);
      return;
    }

    const deleteLabelButton = event.target.closest('[data-delete-private-label]');
    if (deleteLabelButton) {
      borrarEtiqueta(deleteLabelButton.dataset.deletePrivateLabel);
      return;
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
  document.addEventListener('radar:user-session-ready', syncZonaPersonal);
  document.addEventListener('radar:user-collections-changed', renderList);
  document.addEventListener('radar:user-private-labels-changed', renderList);
  document.addEventListener('radar:logout', () => {
    panel.classList.remove('open');
    button.classList.remove('active-state');
    state.userCollections = [];
    state.userCollectionItems = [];
    state.userPrivateLabels = [];
    renderList();
  });
  renderList();
}

async function syncZonaPersonal() {
  if (!state.userId || !state.sessionToken) return;
  const [collections, collectionItems, labels] = await Promise.all([
    fetchUserCollections(state.userId, state.sessionToken),
    fetchUserCollectionItems(state.userId, state.sessionToken),
    fetchUserPrivateLabels(state.userId, state.sessionToken),
  ]);
  state.userCollections = collections;
  state.userCollectionItems = collectionItems;
  state.userPrivateLabels = labels;
  renderList();
}

async function crearListaDesdePanel() {
  if (!state.userId || !state.sessionToken) return;
  const input = document.getElementById('collection-name-input');
  const name = String(input?.value || '').trim();
  if (!name) {
    alert('Escribe un nombre para la lista.');
    return;
  }
  try {
    const created = await createUserCollection({ id: `COL-${Date.now()}`, user_id: state.userId, name }, state.sessionToken);
    const inserted = created[0];
    if (inserted) state.userCollections.push(inserted);
    if (input) input.value = '';
    renderList();
  } catch (error) {
    alert(error.message);
  }
}

async function borrarLista(collectionId) {
  if (!state.userId || !state.sessionToken || !collectionId) return;
  const collection = state.userCollections.find((item) => String(item.id) === String(collectionId));
  if (!window.confirm(`¿Eliminar la lista "${collection?.name || collectionId}"?`)) return;
  try {
    await deleteUserCollection(collectionId, state.userId, state.sessionToken);
    state.userCollections = state.userCollections.filter((item) => String(item.id) !== String(collectionId));
    state.userCollectionItems = state.userCollectionItems.filter((item) => String(item.collection_id) !== String(collectionId));
    renderList();
  } catch (error) {
    alert(error.message);
  }
}

async function quitarGuardado(collectionId, buildingId) {
  if (!state.userId || !state.sessionToken || !collectionId || !buildingId) return;
  try {
    await deleteUserCollectionItem(collectionId, state.userId, buildingId, state.sessionToken);
    state.userCollectionItems = state.userCollectionItems.filter((item) => !(String(item.collection_id) === String(collectionId) && String(item.building_id) === String(buildingId)));
    renderList();
  } catch (error) {
    alert(error.message);
  }
}

async function borrarEtiqueta(labelId) {
  if (!state.userId || !state.sessionToken || !labelId) return;
  try {
    await deleteUserPrivateLabel(labelId, state.userId, state.sessionToken);
    state.userPrivateLabels = state.userPrivateLabels.filter((label) => String(label.id) !== String(labelId));
    renderList();
  } catch (error) {
    alert(error.message);
  }
}

function renderList() {
  if (!state.sessionToken) {
    list.innerHTML = '<div class="nearby-empty">Inicia sesión para guardar y consultar tus edificios.</div>';
    return;
  }

  if (activeTab === 'collections') {
    renderCollections();
    return;
  }

  if (activeTab === 'labels') {
    renderLabels();
    return;
  }

  const savedIds = [...new Set(state.userCollectionItems.map((item) => String(item.building_id)))];
  const results = state.OBRAS.filter((obra) => {
    if (activeTab === 'notes') return Boolean(state.buildingStatuses.get(String(obra.id))?.notas?.trim());
    if (activeTab === 'saved') return savedIds.includes(String(obra.id));
    return state.buildingStatuses.get(String(obra.id))?.[activeTab];
  });

  if (!results.length) {
    const emptyMessage = activeTab === 'favorite'
      ? 'edificios favoritos'
      : activeTab === 'visited'
        ? 'edificios visitados'
        : activeTab === 'saved'
          ? 'edificios guardados en listas'
          : 'notas guardadas';
    list.innerHTML = `<div class="nearby-empty">Todavía no tienes ${emptyMessage}.</div>`;
    return;
  }

  list.innerHTML = results.map((obra) => `
    <button type="button" class="my-place-item" data-feature-id="${obra.featureId}">
      <span><strong>${obra.nombre_obra}</strong>${activeTab === 'notes' ? `<span class="my-place-note">${state.buildingStatuses.get(String(obra.id))?.notas || ''}</span>` : ''}</span>
      <span class="nearby-meta">${obra.arquitecto || ''}</span>
    </button>
  `).join('');
}

function renderCollections() {
  const cards = state.userCollections.map((collection) => {
    const collectionItems = state.userCollectionItems.filter((item) => String(item.collection_id) === String(collection.id));
    const rows = collectionItems.map((item) => {
      const obra = state.OBRAS.find((candidate) => String(candidate.id) === String(item.building_id));
      if (!obra) return '';
      return `
        <div class="my-collection-item-row">
          <button type="button" class="my-place-item" data-feature-id="${obra.featureId}">
            <span><strong>${obra.nombre_obra}</strong></span>
            <span class="nearby-meta">${obra.arquitecto || ''}</span>
          </button>
          <button type="button" class="filter-action" data-collection-id="${collection.id}" data-remove-from-collection="${obra.id}">QUITAR</button>
        </div>
      `;
    }).join('') || '<div class="nearby-empty">Lista vacía.</div>';
    return `
      <article class="my-collection-card">
        <div class="my-collection-head">
          <strong>${collection.name}</strong>
          <div class="my-collection-tools">
            <span class="nearby-meta">${collectionItems.length}</span>
            <button type="button" class="filter-action" data-delete-collection="${collection.id}">BORRAR</button>
          </div>
        </div>
        ${rows}
      </article>
    `;
  }).join('');

  list.innerHTML = `
    <div class="my-collections-create">
      <input id="collection-name-input" class="tech-input" type="text" placeholder="NOMBRE DE LISTA (EJ: VIAJE A JAPÓN)">
      <button type="button" class="btn" data-create-collection>CREAR LISTA</button>
    </div>
    ${cards || '<div class="nearby-empty">Crea tu primera lista personalizada.</div>'}
  `;
}

function renderLabels() {
  if (!state.userPrivateLabels.length) {
    list.innerHTML = '<div class="nearby-empty">Todavía no tienes etiquetas privadas.</div>';
    return;
  }
  list.innerHTML = state.userPrivateLabels.map((label) => {
    const obra = state.OBRAS.find((candidate) => String(candidate.id) === String(label.building_id));
    if (!obra) return '';
    return `
      <div class="my-collection-item-row">
        <button type="button" class="my-place-item" data-feature-id="${obra.featureId}">
          <span><strong>${obra.nombre_obra}</strong><span class="my-place-note">#${label.label}</span></span>
          <span class="nearby-meta">${obra.arquitecto || ''}</span>
        </button>
        <button type="button" class="filter-action" data-delete-private-label="${label.id}">QUITAR</button>
      </div>
    `;
  }).join('');
}
