/* =========================================================================
   MYPLACESUI.JS — Zona personal del usuario
   ========================================================================= */

import {
  state,
  cargarZonaPersonalLocal,
  guardarZonaPersonalLocal,
  aplicarPreferenciasMapaColecciones,
  separarArquitectos,
  normalizarCategoria,
  normalizarImportancia,
} from './state.js';
import { abrirFicha } from './sheetUI.js';
import { registrarIconosColecciones } from './mapController.js';
import { actualizarFuenteMapa } from './mapData.js';
import {
  fetchUserCollections,
  fetchUserCollectionItems,
  fetchBuildingStatuses,
  fetchBuildingsByIds,
  createUserCollection,
  updateUserCollection,
  deleteUserCollection,
  deleteUserCollectionItem,
} from './api.js';

const panel = document.getElementById('my-places-panel');
const button = document.getElementById('btn-my-places');
const list = document.getElementById('my-places-list');
let activeTab = 'visited';
let precargaEnProgreso = false;
const idsYaIntentados = new Set();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

export function initMyPlacesUI() {
  button.addEventListener('click', () => {
    if (!state.sessionToken) {
      alert('Inicia sesión para consultar tu zona personal.');
      return;
    }
    const isOpen = panel.classList.toggle('open');
    button.classList.toggle('active-state');
    if (isOpen) {
      cargarZonaPersonalLocal(state.userId);
      renderList();
      asegurarObrasEnMemoria();
      syncZonaPersonal();
    }
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

    const toggleMapBtn = event.target.closest('[data-toggle-map-collection]');
    if (toggleMapBtn) {
      const colId = toggleMapBtn.dataset.toggleMapCollection;
      const col = state.userCollections.find((item) => String(item.id) === String(colId));
      if (col) {
        col.show_on_map = col.show_on_map === false ? true : false;
        guardarZonaPersonalLocal(state.userId);
        registrarIconosColecciones();
        actualizarFuenteMapa();
        renderList();
      }
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

  document.addEventListener('radar:user-status-ready', () => {
    renderList();
    asegurarObrasEnMemoria();
  });
  document.addEventListener('radar:user-status-changed', () => {
    renderList();
    asegurarObrasEnMemoria();
  });
  document.addEventListener('radar:user-session-ready', () => {
    syncZonaPersonal();
  });
  document.addEventListener('radar:user-collections-changed', renderList);
  document.addEventListener('radar:logout', () => {
    panel.classList.remove('open');
    button.classList.remove('active-state');
    state.userCollections = [];
    state.userCollectionItems = [];
    idsYaIntentados.clear();
    renderList();
  });
  renderList();
}

async function asegurarObrasEnMemoria() {
  if (precargaEnProgreso) return;

  const idsRelevantes = new Set();
  state.buildingStatuses.forEach((status, id) => {
    if (status.visited || status.favorite || (status.notas && status.notas.trim())) {
      idsRelevantes.add(String(id));
    }
  });

  (state.userCollectionItems || []).forEach((item) => {
    if (item.building_id) idsRelevantes.add(String(item.building_id));
  });

  const idsFaltantes = [...idsRelevantes].filter(
    (id) => !idsYaIntentados.has(String(id)) && !state.OBRAS.some((obra) => String(obra.id) === String(id))
  );

  if (idsFaltantes.length === 0) return;

  idsFaltantes.forEach((id) => idsYaIntentados.add(String(id)));
  precargaEnProgreso = true;

  try {
    const filas = await fetchBuildingsByIds(idsFaltantes);
    if (Array.isArray(filas) && filas.length > 0) {
      let agregados = 0;
      filas.forEach((fila, index) => {
        if (!state.OBRAS.some((obra) => String(obra.id) === String(fila.id))) {
          state.OBRAS.push({
            id: fila.id,
            featureId: String(fila.id ?? `obra-sync-${index}`),
            nombre_obra: fila.nombre_obra,
            foto_url: fila.foto_url || null,
            enlace_url: fila.enlace_url || null,
            arquitecto: fila.arquitecto,
            arquitectos: separarArquitectos(fila.arquitecto),
            año_construccion: fila.año_construccion,
            importancia: normalizarImportancia(fila.importancia),
            categoria: normalizarCategoria(fila.categoria),
            ciudad: fila.ciudad || null,
            estado_acceso: fila.estado_acceso || (fila.visitable ? 'publico' : 'privado'),
            añadido_por: fila.añadido_por || null,
            estado_revision: fila.estado_revision || 'publicada',
            coordenadas: [fila.longitud, fila.latitud],
            selected: false,
          });
          agregados++;
        }
      });
      if (agregados > 0) {
        actualizarFuenteMapa();
        renderList();
      }
    }
  } catch (e) {
    console.warn('No se pudieron precargar obras de la zona personal:', e);
  } finally {
    precargaEnProgreso = false;
  }
}

async function syncZonaPersonal() {
  if (!state.userId || !state.sessionToken) return;
  try {
    const [collections, collectionItems, statuses] = await Promise.all([
      fetchUserCollections(state.userId, state.sessionToken),
      fetchUserCollectionItems(state.userId, state.sessionToken),
      fetchBuildingStatuses(state.userId, state.sessionToken).catch(() => []),
    ]);

    if (Array.isArray(statuses) && statuses.length > 0) {
      statuses.forEach((item) => {
        state.buildingStatuses.set(String(item.building_id), {
          favorite: item.favorite === true,
          visited: item.visited === true,
          notas: item.notas || '',
          valoracion: item.valoracion || null,
        });
      });
      localStorage.setItem(`nolli:building-status:${state.userId}`, JSON.stringify([...state.buildingStatuses.entries()]));
    }

    state.userCollections = aplicarPreferenciasMapaColecciones(collections || [], state.userId);
    state.userCollectionItems = collectionItems || [];
    guardarZonaPersonalLocal(state.userId);

    await asegurarObrasEnMemoria();
  } catch (error) {
    console.warn('Error sincronizando zona personal con el servidor, cargando copia local...', error);
    cargarZonaPersonalLocal(state.userId);
  }
  registrarIconosColecciones();
  actualizarFuenteMapa();
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
        <label class="keep-session" style="font-size:10px; cursor:pointer;">
          <input id="modal-map-toggle" type="checkbox" checked>
          <span>Mostrar obras en el mapa con este icono</span>
        </label>
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
  const mapToggle = document.getElementById('modal-map-toggle');

  const name = String(nameInput?.value || '').trim();
  const icon = String(emojiInput?.value || '').trim();
  const description = String(descInput?.value || '').trim();
  const show_on_map = Boolean(mapToggle?.checked);

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
    show_on_map,
    created_at: new Date().toISOString()
  };

  try {
    const created = await createUserCollection({
      id: newCollectionPayload.id,
      user_id: newCollectionPayload.user_id,
      name: newCollectionPayload.name,
      icon: newCollectionPayload.icon,
      description: newCollectionPayload.description
    }, state.sessionToken);

    const savedCollection = (Array.isArray(created) && created[0]) ? { ...created[0], show_on_map } : newCollectionPayload;
    state.userCollections.push(savedCollection);
    guardarZonaPersonalLocal(state.userId);
    registrarIconosColecciones();
    actualizarFuenteMapa();
    cerrarModalFlotante();
    renderList();
  } catch (error) {
    console.error('Error creando lista en Supabase:', error);
    state.userCollections.push(newCollectionPayload);
    guardarZonaPersonalLocal(state.userId);
    registrarIconosColecciones();
    actualizarFuenteMapa();
    cerrarModalFlotante();
    renderList();
    alert(`Nota: La lista se creó localmente. Error del servidor: ${error.message}`);
  }
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
        <label class="keep-session" style="font-size:10px; cursor:pointer;">
          <input id="modal-edit-map-toggle" type="checkbox" ${collection.show_on_map !== false ? 'checked' : ''}>
          <span>Mostrar obras en el mapa con este icono</span>
        </label>
        <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:4px;">
          <button type="button" class="filter-action" data-close-modal>CANCELAR</button>
          <button type="button" class="btn" data-confirm-edit-collection="${collection.id}" style="padding:6px 12px;">GUARDAR</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

async function guardarEdicionListaModal(collectionId) {
  const collection = state.userCollections.find((item) => String(item.id) === String(collectionId));
  if (!collection) return;

  const emojiInput = document.getElementById('modal-edit-emoji');
  const nameInput = document.getElementById('modal-edit-name');
  const descInput = document.getElementById('modal-edit-desc');
  const mapToggle = document.getElementById('modal-edit-map-toggle');

  const newName = String(nameInput?.value || '').trim();
  const newIcon = String(emojiInput?.value || '').trim();
  const newDesc = String(descInput?.value || '').trim();
  const show_on_map = Boolean(mapToggle?.checked);

  if (!newName) {
    alert('El nombre no puede estar vacío.');
    return;
  }

  collection.name = newName;
  collection.icon = newIcon;
  collection.description = newDesc;
  collection.show_on_map = show_on_map;

  guardarZonaPersonalLocal(state.userId);
  registrarIconosColecciones();
  actualizarFuenteMapa();
  cerrarModalFlotante();
  renderList();

  if (state.sessionToken) {
    try {
      await updateUserCollection(collectionId, { name: newName, icon: newIcon, description: newDesc }, state.sessionToken);
    } catch (err) {
      console.warn('Error sincronizando edición de lista con el servidor:', err);
    }
  }
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
    registrarIconosColecciones();
    actualizarFuenteMapa();
    renderList();
  } catch (error) {
    state.userCollections = state.userCollections.filter((item) => String(item.id) !== String(collectionId));
    state.userCollectionItems = state.userCollectionItems.filter((item) => String(item.collection_id) !== String(collectionId));
    guardarZonaPersonalLocal(state.userId);
    registrarIconosColecciones();
    actualizarFuenteMapa();
    renderList();
  }
}

async function quitarGuardado(collectionId, buildingId) {
  if (!state.userId || !state.sessionToken || !collectionId || !buildingId) return;
  try {
    await deleteUserCollectionItem(collectionId, state.userId, buildingId, state.sessionToken);
    state.userCollectionItems = state.userCollectionItems.filter((item) => !(String(item.collection_id) === String(collectionId) && String(item.building_id) === String(buildingId)));
    guardarZonaPersonalLocal(state.userId);
    actualizarFuenteMapa();
    renderList();
  } catch (error) {
    state.userCollectionItems = state.userCollectionItems.filter((item) => !(String(item.collection_id) === String(collectionId) && String(item.building_id) === String(buildingId)));
    guardarZonaPersonalLocal(state.userId);
    actualizarFuenteMapa();
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
    let countEnStatuses = 0;
    state.buildingStatuses.forEach((status) => {
      if (activeTab === 'notes' && status.notas?.trim()) countEnStatuses++;
      else if (status[activeTab]) countEnStatuses++;
    });

    if (countEnStatuses > 0 && precargaEnProgreso) {
      list.innerHTML = '<div class="nearby-empty">Cargando tus edificios...</div>';
      return;
    }

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
      <div class="my-place-item-main">
        <strong class="my-place-item-title">${escapeHtml(obra.nombre_obra)}</strong>
        <span class="my-place-meta">${escapeHtml(obra.arquitecto || 'Arquitecto no especificado')}</span>
        ${activeTab === 'notes' && state.buildingStatuses.get(String(obra.id))?.notas ? `<span class="my-place-note" style="color:var(--accent); margin-top:2px;">"${escapeHtml(state.buildingStatuses.get(String(obra.id)).notas)}"</span>` : ''}
      </div>
      <span class="my-place-arrow">→</span>
    </button>
  `).join('');
  if (window.lucide) window.lucide.createIcons();
}

function renderCollections() {
  const cards = (state.userCollections || []).map((collection) => {
    const collectionItems = (state.userCollectionItems || []).filter((item) => String(item.collection_id) === String(collection.id));
    const isMapActive = collection.show_on_map !== false;
    const eyeIconSvg = isMapActive
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;

    const rows = collectionItems.map((item) => {
      const obra = state.OBRAS.find((candidate) => String(candidate.id) === String(item.building_id));
      if (!obra) return '';
      return `
        <div class="my-collection-item-row">
          <button type="button" class="my-place-item in-collection" data-feature-id="${obra.featureId}">
            <div class="my-place-item-main">
              <strong class="my-place-item-title">${escapeHtml(obra.nombre_obra)}</strong>
              <span class="my-place-meta">${escapeHtml(obra.arquitecto || '')}</span>
            </div>
            <span class="my-place-arrow">→</span>
          </button>
          <button type="button" class="btn-remove-collection" data-collection-id="${collection.id}" data-remove-from-collection="${obra.id}" title="Quitar de la lista" aria-label="Quitar de la lista">✕</button>
        </div>
      `;
    }).join('') || '<div class="nearby-empty">Lista sin obras añadidas.</div>';

    const collectionEmoji = collection.icon ? `<span style="margin-right: 6px;">${escapeHtml(collection.icon)}</span>` : '';
    const collectionDescription = collection.description ? `<div class="my-place-meta" style="margin-top: 2px; font-style: italic;">${escapeHtml(collection.description)}</div>` : '';

    return `
      <article class="my-collection-card">
        <div class="my-collection-head">
          <div style="min-width:0; flex:1;">
            <div style="font-weight:700; color:var(--fg); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${collectionEmoji}${escapeHtml(collection.name)}</div>
            ${collectionDescription}
          </div>
          <div class="my-collection-tools">
            <button type="button" class="collection-map-toggle ${isMapActive ? 'active' : ''}" data-toggle-map-collection="${collection.id}" title="${isMapActive ? 'Ocultar iconos de la lista en el mapa' : 'Mostrar iconos de la lista en el mapa'}" aria-label="${isMapActive ? 'Ocultar en mapa' : 'Mostrar en mapa'}">
              ${eyeIconSvg}
            </button>
            <span class="collection-counter" title="Total de obras">${collectionItems.length}</span>
            <button type="button" class="collection-tool-btn" data-edit-collection="${collection.id}" title="Editar lista" aria-label="Editar lista">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            </button>
            <button type="button" class="collection-tool-btn btn-delete" data-delete-collection="${collection.id}" title="Borrar lista" aria-label="Borrar lista">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            </button>
          </div>
        </div>
        <div class="my-collection-items-list">
          ${rows}
        </div>
      </article>
    `;
  }).join('');

  list.innerHTML = `
    <div class="my-collections-header">
      <span style="font-size: 10px; color: var(--fg-dim); font-weight: 700; font-family:'JetBrains Mono', monospace;">MIS LISTAS (${(state.userCollections || []).length})</span>
      <button type="button" class="btn-new-list" data-open-create-collection-modal style="padding: 5px 12px; font-size: 10px;">[ + NUEVA LISTA ]</button>
    </div>
    ${cards || '<div class="nearby-empty">Crea tu primera lista para organizar obras.</div>'}
  `;
  if (window.lucide) window.lucide.createIcons();
}