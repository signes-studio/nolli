/* =========================================================================
   MYPLACESUI.JS — Zona personal del usuario
   ========================================================================= */

import { state, cargarZonaPersonalLocal, guardarZonaPersonalLocal } from './state.js';
import { abrirFicha } from './sheetUI.js';
import {
  fetchUserCollections,
  fetchUserCollectionItems,
  createUserCollection,
  deleteUserCollection,
  deleteUserCollectionItem,
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

    const openCreateModalBtn = event.target.closest('[data-open-create-collection-modal]');
    if (openCreateModalBtn) {
      abrirModalCrearLista();
      return;
    }

    const closeCreateModalBtn = event.target.closest('[data-close-modal]');
    if (closeCreateModalBtn) {
      cerrarModalFlotante();
      return;
    }

    const confirmCreateButton = event.target.closest('[data-confirm-create-collection]');
    if (confirmCreateButton) {
      crearListaDesdeModal();
      return;
    }

    const deleteCollectionButton = event.target.closest('[data-delete-collection]');
    if (deleteCollectionButton) {
      borrarLista(deleteCollectionButton.dataset.deleteCollection);
      return;
    }

    const editCollectionButton = event.target.closest('[data-edit-collection]');
    if (editCollectionButton) {
      abrirModalEditarLista(editCollectionButton.dataset.editCollection);
      return;
    }

    const confirmEditButton = event.target.closest('[data-confirm-edit-collection]');
    if (confirmEditButton) {
      guardarEdicionListaModal(confirmEditButton.dataset.confirmEditCollection);
      return;
    }

    const removeItemButton = event.target.closest('[data-remove-from-collection]');
    if (removeItemButton) {
      quitarGuardado(removeItemButton.dataset.collectionId, removeItemButton.dataset.removeFromCollection);
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
  document.addEventListener('radar:logout', () => {
    panel.classList.remove('open');
    button.classList.remove('active-state');
    state.userCollections = [];
    state.userCollectionItems = [];
    renderList();
  });
  renderList();
}

async function syncZonaPersonal() {
  if (!state.userId || !state.sessionToken) return;
  try {
    const [collections, collectionItems] = await Promise.all([
      fetchUserCollections(state.userId, state.sessionToken),
      fetchUserCollectionItems(state.userId, state.sessionToken),
    ]);
    state.userCollections = collections || [];
    state.userCollectionItems = collectionItems || [];
    guardarZonaPersonalLocal(state.userId);
  } catch (error) {
    console.warn('Error sincronizando zona personal con el servidor, cargando copia local...', error);
    cargarZonaPersonalLocal(state.userId);
  }
  renderList();
}

function abrirModalCrearLista() {
  removerModalExistente();
  const modalHTML = `
    <div id="collection-modal-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;">
      <div style="background:var(--bg-panel, #F8F1DF); border:1px solid var(--border-strong, #141411); padding:16px; width:100%; max-width:320px; display:grid; gap:10px; font-family:'JetBrains Mono', monospace; font-size:11px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-strong); padding-bottom:6px;">
          <strong style="color:var(--accent);">NUEVA LISTA</strong>
          <button type="button" class="filter-action" data-close-modal>✕</button>
        </div>
        <div style="display:grid; grid-template-columns: 50px 1fr; gap:6px;">
          <input id="modal-emoji-input" class="tech-input" type="text" placeholder="🏛️" maxlength="4" style="text-align:center;" title="Pulsa para escribir o abrir el teclado de emojis">
          <input id="modal-name-input" class="tech-input" type="text" placeholder="NOMBRE DE LISTA">
        </div>
        <textarea id="modal-desc-input" class="tech-input" placeholder="Descripción breve (opcional)..." style="resize:vertical; min-height:50px; font-family:inherit; font-size:inherit;"></textarea>
        <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:4px;">
          <button type="button" class="filter-action" data-close-modal>CANCELAR</button>
          <button type="button" class="btn" data-confirm-create-collection style="padding:6px 12px;">CREAR LISTA</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

async function crearListaDesdeModal() {
  if (!state.userId || !state.sessionToken) {
    alert('Inicia sesión para crear listas.');
    return;
  }

  const nameInput = document.getElementById('modal-name-input');
  const emojiInput = document.getElementById('modal-emoji-input');
  const descInput = document.getElementById('modal-desc-input');

  const name = String(nameInput?.value || '').trim();
  const icon = String(emojiInput?.value || '').trim();
  const description = String(descInput?.value || '').trim();

  if (!name) {
    alert('Escribe un nombre para la lista.');
    return;
  }

  const newCollectionPayload = {
    id: `COL-${Date.now()}`,
    user_id: state.userId,
    name,
    icon,
    description,
    created_at: new Date().toISOString()
  };

  state.userCollections.push(newCollectionPayload);
  guardarZonaPersonalLocal(state.userId);

  try {
    createUserCollection(newCollectionPayload, state.sessionToken).catch(() => {});
  } catch (e) {}

  cerrarModalFlotante();
  renderList();
}

function abrirModalEditarLista(collectionId) {
  const collection = state.userCollections.find((item) => String(item.id) === String(collectionId));
  if (!collection) return;

  removerModalExistente();
  const modalHTML = `
    <div id="collection-modal-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;">
      <div style="background:var(--bg-panel, #F8F1DF); border:1px solid var(--border-strong, #141411); padding:16px; width:100%; max-width:320px; display:grid; gap:10px; font-family:'JetBrains Mono', monospace; font-size:11px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-strong); padding-bottom:6px;">
          <strong style="color:var(--accent);">EDITAR LISTA</strong>
          <button type="button" class="filter-action" data-close-modal>✕</button>
        </div>
        <div style="display:grid; grid-template-columns: 50px 1fr; gap:6px;">
          <input id="modal-edit-emoji" class="tech-input" type="text" value="${collection.icon || ''}" placeholder="🏛️" maxlength="4" style="text-align:center;">
          <input id="modal-edit-name" class="tech-input" type="text" value="${collection.name || ''}" placeholder="Nombre de lista">
        </div>
        <textarea id="modal-edit-desc" class="tech-input" placeholder="Descripción breve..." style="resize:vertical; min-height:50px; font-family:inherit; font-size:inherit;">${collection.description || ''}</textarea>
        <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:4px;">
          <button type="button" class="filter-action" data-close-modal>CANCELAR</button>
          <button type="button" class="btn" data-confirm-edit-collection="${collection.id}" style="padding:6px 12px;">GUARDAR</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function guardarEdicionListaModal(collectionId) {
  const collection = state.userCollections.find((item) => String(item.id) === String(collectionId));
  if (!collection) return;

  const emojiInput = document.getElementById('modal-edit-emoji');
  const nameInput = document.getElementById('modal-edit-name');
  const descInput = document.getElementById('modal-edit-desc');

  const newName = String(nameInput?.value || '').trim();
  const newIcon = String(emojiInput?.value || '').trim();
  const newDesc = String(descInput?.value || '').trim();

  if (!newName) {
    alert('El nombre no puede estar vacío.');
    return;
  }

  collection.name = newName;
  collection.icon = newIcon;
  collection.description = newDesc;

  guardarZonaPersonalLocal(state.userId);
  cerrarModalFlotante();
  renderList();
}

function cerrarModalFlotante() {
  removerModalExistente();
}

function removerModalExistente() {
  const existing = document.getElementById('collection-modal-overlay');
  if (existing) existing.remove();
}

async function borrarLista(collectionId) {
  if (!state.userId || !state.sessionToken || !collectionId) return;
  const collection = state.userCollections.find((item) => String(item.id) === String(collectionId));
  if (!window.confirm(`¿Eliminar la lista "${collection?.name || collectionId}"?`)) return;
  try {
    await deleteUserCollection(collectionId, state.userId, state.sessionToken);
    state.userCollections = state.userCollections.filter((item) => String(item.id) !== String(collectionId));
    state.userCollectionItems = state.userCollectionItems.filter((item) => String(item.collection_id) !== String(collectionId));
    guardarZonaPersonalLocal(state.userId);
    renderList();
  } catch (error) {
    state.userCollections = state.userCollections.filter((item) => String(item.id) !== String(collectionId));
    state.userCollectionItems = state.userCollectionItems.filter((item) => String(item.collection_id) !== String(collectionId));
    guardarZonaPersonalLocal(state.userId);
    renderList();
  }
}

async function quitarGuardado(collectionId, buildingId) {
  if (!state.userId || !state.sessionToken || !collectionId || !buildingId) return;
  try {
    await deleteUserCollectionItem(collectionId, state.userId, buildingId, state.sessionToken);
    state.userCollectionItems = state.userCollectionItems.filter((item) => !(String(item.collection_id) === String(collectionId) && String(item.building_id) === String(buildingId)));
    guardarZonaPersonalLocal(state.userId);
    renderList();
  } catch (error) {
    state.userCollectionItems = state.userCollectionItems.filter((item) => !(String(item.collection_id) === String(collectionId) && String(item.building_id) === String(buildingId)));
    guardarZonaPersonalLocal(state.userId);
    renderList();
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

  const results = state.OBRAS.filter((obra) => {
    if (activeTab === 'notes') return Boolean(state.buildingStatuses.get(String(obra.id))?.notas?.trim());
    return state.buildingStatuses.get(String(obra.id))?.[activeTab];
  });

  if (!results.length) {
    const emptyMessage = activeTab === 'favorite'
      ? 'edificios favoritos'
      : activeTab === 'visited'
        ? 'edificios visitados'
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
  const cards = (state.userCollections || []).map((collection) => {
    const collectionItems = (state.userCollectionItems || []).filter((item) => String(item.collection_id) === String(collection.id));
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

    const collectionEmoji = collection.icon ? `<span style="margin-right: 6px;">${collection.icon}</span>` : '';
    const collectionDescription = collection.description ? `<div class="nearby-meta" style="margin-top: 2px; font-style: italic;">${collection.description}</div>` : '';

    return `
      <article class="my-collection-card">
        <div class="my-collection-head">
          <div>
            <div>${collectionEmoji}<strong>${collection.name}</strong></div>
            ${collectionDescription}
          </div>
          <div class="my-collection-tools">
            <span class="nearby-meta">${collectionItems.length}</span>
            <button type="button" class="filter-action" data-edit-collection="${collection.id}">EDITAR</button>
            <button type="button" class="filter-action" data-delete-collection="${collection.id}">BORRAR</button>
          </div>
        </div>
        ${rows}
      </article>
    `;
  }).join('');

  list.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding: 0 4px;">
      <span style="font-size: 10px; color: var(--fg-dim);">MIS LISTAS PERSONALIZADAS</span>
      <button type="button" class="btn" data-open-create-collection-modal style="padding: 4px 10px; font-size: 11px;">+ NUEVA LISTA</button>
    </div>
    ${cards || '<div class="nearby-empty">Crea tu primera lista personalizada.</div>'}
  `;
}