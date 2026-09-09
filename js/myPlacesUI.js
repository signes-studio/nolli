/* =========================================================================
   MYPLACESUI.JS — Zona personal del usuario (Listas Propias y Seguidas)
   Estética Neo-Bauhaus con Soporte Colaborativo y URLs Compartibles
   ========================================================================= */

import {
  state,
  cargarZonaPersonalLocal,
  guardarZonaPersonalLocal,
  aplicarPreferenciasMapaColecciones,
  separarArquitectos,
  normalizarCategoria,
  normalizarImportancia,
  upsertBuilding,
} from './state.js';
import { abrirFicha } from './sheetUI.js';
import { registrarIconosColecciones, actualizarVisibilidadIconosLista } from './mapController.js';
import { actualizarFuenteMapa } from './mapData.js';
import { showNeoToast, initTabsScrollIndicator } from './renderUtils.js';
import { t } from './i18n.js';
import {
  fetchUserCollections,
  fetchUserCollectionItems,
  fetchBuildingStatuses,
  fetchBuildingsByIds,
  createUserCollection,
  updateUserCollection,
  deleteUserCollection,
  deleteUserCollectionItem,
  fetchFollowedCollections,
  followCollection,
  unfollowCollection,
  fetchCollectionById,
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

let myPlacesInitialized = false;

export function initMyPlacesUI() {
  if (myPlacesInitialized) return;
  myPlacesInitialized = true;

  const placesTabs = panel?.querySelector('.places-tabs');
  const placesTabsWrap = panel?.querySelector('.places-tabs-scroll-wrap');
  let updateTabsScroll = null;
  if (placesTabs && placesTabsWrap) {
    updateTabsScroll = initTabsScrollIndicator(placesTabs, placesTabsWrap);
  }

  if (button) {
    button.addEventListener('click', () => {
      if (!state.sessionToken) {
        showNeoToast('Inicia sesión para consultar tu zona personal.');
        return;
      }
      const isOpen = panel.classList.toggle('open');
      button.classList.toggle('active-state');
      if (isOpen) {
        cargarZonaPersonalLocal(state.userId);
        renderList();
        asegurarObrasEnMemoria();
        syncZonaPersonal();
        requestAnimationFrame(() => updateTabsScroll?.());
      }
    });
  }

  // Router por hash para listas (#list=ID)
  window.addEventListener('hashchange', handleListHashRoute);
  if (window.location.hash.startsWith('#list=')) {
    setTimeout(handleListHashRoute, 200);
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('#btn-my-places-close')) {
      panel?.classList.remove('open');
      button?.classList.remove('active-state');
    }

    const tab = event.target.closest('[data-place-tab]');
    if (tab) {
      activeTab = tab.dataset.placeTab;
      document.querySelectorAll('[data-place-tab]').forEach((item) => item.classList.toggle('active', item === tab));
      try {
        tab.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
      } catch (_) {}
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
    if (closeCreateModalBtn || event.target.id === 'collection-modal-overlay') {
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

    const copyLinkBtn = event.target.closest('[data-copy-collection-link]');
    if (copyLinkBtn) {
      const colId = copyLinkBtn.dataset.copyCollectionLink;
      copiarEnlaceLista(colId, copyLinkBtn);
      return;
    }

    const unfollowBtn = event.target.closest('[data-unfollow-collection]');
    if (unfollowBtn) {
      dejarDeSeguirLista(unfollowBtn.dataset.unfollowCollection);
      return;
    }

    const viewColMapBtn = event.target.closest('[data-view-collection-map]');
    if (viewColMapBtn) {
      aislarColeccionEnMapa(viewColMapBtn.dataset.viewCollectionMap);
      return;
    }

    const removeItemBtn = event.target.closest('[data-remove-from-collection]');
    if (removeItemBtn) {
      quitarGuardado(removeItemBtn.dataset.collectionId, removeItemBtn.dataset.removeFromCollection);
      return;
    }

    const placeItem = event.target.closest('.my-place-item');
    if (placeItem && !event.target.closest('.btn-remove-collection')) {
      const featureId = placeItem.dataset.featureId;
      const obra = state.OBRAS.find((item) => String(item.featureId) === String(featureId) || String(item.id) === String(featureId));
      if (obra) {
        if (panel) panel.classList.remove('open');
        if (button) button.classList.remove('active-state');
        if (state.map) {
          state.map.flyTo({
            center: obra.coordenadas,
            zoom: Math.max(state.map.getZoom(), 16),
            essential: true,
          });
        }
        abrirFicha(obra, obra.coordenadas, obra.featureId || obra.id);
      }
    }
  });

  document.addEventListener('radar:user-session-ready', () => {
    if (state.userId && state.sessionToken) {
      syncZonaPersonal();
    }
  });

  document.addEventListener('radar:user-status-ready', () => {
    renderList();
  });

  document.addEventListener('radar:user-status-changed', () => {
    renderList();
  });

  document.addEventListener('radar:logout', () => {
    state.userCollections = [];
    state.userCollectionItems = [];
    state.userFollowedCollections = [];
    state.buildingStatuses.clear();
    renderList();
  });
}

export async function handleListHashRoute() {
  const hash = window.location.hash;
  if (!hash.startsWith('#list=')) {
    if (state.activeItinerary && state.activeItinerary.isCollectionItinerary) {
      state.activeItinerary = null;
      const itineraryBadge = document.getElementById('itinerary-filter-badge');
      if (itineraryBadge) itineraryBadge.classList.add('hidden');
      actualizarFuenteMapa();
      actualizarVisibilidadIconosLista();
    }
    return;
  }
  const listId = hash.replace('#list=', '').trim();
  if (!listId) return;

  try {
    const col = await fetchCollectionById(listId, state.sessionToken);
    if (!col) return;

    // Cargar obras asociadas si no están en local
    let items = (state.userCollectionItems || []).filter((i) => String(i.collection_id) === String(listId));
    if (!items.length) {
      items = await fetchUserCollectionItems(col.user_id, state.sessionToken || '').catch(() => []);
      items = items.filter((i) => String(i.collection_id) === String(listId));
    }

    const buildingIds = [...new Set(items.map((i) => String(i.building_id)).filter(Boolean))];
    if (buildingIds.length === 0) {
      showNeoToast(`La lista "${col.name}" aún no tiene obras añadidas.`);
      return;
    }

    // Cargar los edificios que no esten ya en memoria para garantizar que la lista funcione
    // aunque la vista actual esté situada en otro punto del mapa o en otra zona geográfica.
    const missingIds = buildingIds.filter((id) => !(state.OBRAS || []).some((work) => String(work.id) === String(id)));
    if (missingIds.length > 0) {
      const fetchedWorks = await fetchBuildingsByIds(missingIds).catch(() => []);
      (fetchedWorks || []).forEach((work) => {
        const enriched = {
          ...work,
          id: work.id,
          featureId: String(work.id),
          categoria: normalizarCategoria(work.categoria),
          coordenadas: [Number(work.longitud), Number(work.latitud)],
          arquitectos: Array.isArray(work.arquitectos) ? work.arquitectos : separarArquitectos(work.arquitecto),
          ciudad: work.place || work.ciudad || null,
          place: work.place || work.ciudad || null,
        };
        state.OBRAS = upsertBuilding(state.OBRAS, enriched);
      });
    }

    // Aislar en mapa
    state.activeItinerary = {
      id: col.id,
      title: col.name,
      isCollectionItinerary: true,
      workIds: new Set(buildingIds),
    };

    actualizarFuenteMapa();
    actualizarVisibilidadIconosLista();

    const itineraryBadge = document.getElementById('itinerary-filter-badge');
    const titleEl = document.getElementById('itinerary-badge-title');
    const countEl = document.getElementById('itinerary-badge-count');

    if (itineraryBadge && titleEl) {
      titleEl.textContent = `Lista: ${col.name || 'Colección'}`;
      if (countEl) countEl.textContent = `(${buildingIds.length})`;
      const dotEl = document.getElementById('itinerary-badge-dot');
      if (dotEl) dotEl.style.backgroundColor = 'var(--accent, #E84E1B)';
      itineraryBadge.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();
    }

    // Encuadre geográfico para que todas las obras de la lista queden visibles, aunque estén en otro país.
    const colWorks = (state.OBRAS || []).filter((w) => buildingIds.includes(String(w.id)));
    if (colWorks.length > 0 && state.map) {
      const coords = colWorks
        .filter((w) => w.coordenadas && w.coordenadas.length === 2 && Number.isFinite(w.coordenadas[0]) && Number.isFinite(w.coordenadas[1]))
        .map((w) => w.coordenadas);
      if (coords.length === 1) {
        state.map.flyTo({ center: coords[0], zoom: 12, duration: 900 });
      } else if (coords.length > 1) {
        const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
        state.map.fitBounds(bounds, { padding: 80, maxZoom: 12, duration: 1000 });
      }
    }
  } catch (err) {
    console.warn('No se pudo abrir la lista compartida:', err);
  }
}

async function asegurarObrasEnMemoria() {
  const idsFaltantes = [];
  state.buildingStatuses.forEach((_status, buildingId) => {
    const yaEsta = state.OBRAS.some((item) => String(item.id) === String(buildingId));
    if (!yaEsta && !idsYaIntentados.has(String(buildingId))) idsFaltantes.push(buildingId);
  });

  (state.userCollectionItems || []).forEach((item) => {
    const buildingId = item.building_id;
    const yaEsta = state.OBRAS.some((candidate) => String(candidate.id) === String(buildingId));
    if (!yaEsta && !idsYaIntentados.has(String(buildingId))) idsFaltantes.push(buildingId);
  });

  const idsUnicos = [...new Set(idsFaltantes)];
  if (!idsUnicos.length) return;

  idsUnicos.forEach((id) => idsYaIntentados.add(String(id)));
  precargaEnProgreso = true;

  try {
    const obrasDescargadas = await fetchBuildingsByIds(idsUnicos, state.sessionToken);
    if (obrasDescargadas?.length) {
      let agregados = 0;
      obrasDescargadas.forEach((raw, idx) => {
        const obra = transformarEdificio(raw, state.OBRAS.length + idx);
        if (!obra) return;
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

let lastZonaPersonalSyncTime = 0;
const ZONA_PERSONAL_SYNC_TTL_MS = 60 * 1000; // 60 segundos de frescura en memoria

async function syncZonaPersonal(forzar = false) {
  if (!state.userId || !state.sessionToken) return;
  const now = Date.now();
  if (!forzar && (now - lastZonaPersonalSyncTime < ZONA_PERSONAL_SYNC_TTL_MS) && state.userCollections?.length > 0) {
    return; // Ya sincronizado recientemente en memoria: 0 egress hacia Supabase
  }
  lastZonaPersonalSyncTime = now;
  try {
    const [collections, collectionItems, statuses, followed] = await Promise.all([
      fetchUserCollections(state.userId, state.sessionToken),
      fetchUserCollectionItems(state.userId, state.sessionToken),
      fetchBuildingStatuses(state.userId, state.sessionToken).catch(() => []),
      fetchFollowedCollections(state.userId, state.sessionToken).catch(() => []),
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
    state.userFollowedCollections = followed || [];
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

export function abrirModalCrearLista() {
  initMyPlacesUI();
  removerModalExistente();
  const modalHTML = `
    <div id="collection-modal-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;">
      <div style="background:var(--bg-panel, #F8F1DF); border:2px solid var(--border-strong, #111111); box-shadow:4px 4px 0px #111111; padding:18px; width:100%; max-width:340px; display:grid; gap:12px; font-family: 'Inter', sans-serif; font-size:11px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid var(--border-strong); padding-bottom:6px;">
          <strong style="color:var(--accent); font-family:'League Spartan',sans-serif; font-size:14px;">${t('places_new_list', null, 'NUEVA LISTA')}</strong>
          <button type="button" class="filter-action" data-close-modal style="cursor:pointer;" aria-label="Cerrar modal">✕</button>
        </div>
        <div style="display:grid; grid-template-columns: 50px 1fr; gap:6px;">
          <input id="modal-emoji-input" class="tech-input" type="text" placeholder="Icono" maxlength="4" style="text-align:center;" title="Icono / Emoji">
          <input id="modal-name-input" class="tech-input" type="text" placeholder="${t('sheet_new_list_placeholder', null, 'NOMBRE DE LISTA')}">
        </div>
        <textarea id="modal-desc-input" class="tech-input" placeholder="${t('modal_desc_placeholder', null, 'Descripción breve (opcional)...')}" style="resize:vertical; min-height:50px; font-family:inherit; font-size:inherit;"></textarea>
        
        <!-- Selector de Privacidad Neo-Bauhaus -->
        <div style="display:flex; flex-direction:column; gap:4px;">
          <label style="font-size:9.5px; font-weight:800; color:var(--fg-dim);">VISIBILIDAD:</label>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
            <label style="display:flex; align-items:center; gap:6px; padding:6px 8px; border:1.5px solid var(--border-strong, #111111); background:rgba(17,17,17,0.04); cursor:pointer; font-size:10px; font-weight:700;">
              <input type="radio" name="modal-create-status" value="private" checked style="accent-color:var(--accent, #E84E1B);">
              <span>${t('collection_status_private', null, 'PRIVADA')}</span>
            </label>
            <label style="display:flex; align-items:center; gap:6px; padding:6px 8px; border:1.5px solid var(--border-strong, #111111); background:rgba(17,17,17,0.04); cursor:pointer; font-size:10px; font-weight:700;">
              <input type="radio" name="modal-create-status" value="public" style="accent-color:var(--accent, #E84E1B);">
              <span>${t('collection_status_public', null, 'PÚBLICA')}</span>
            </label>
          </div>
        </div>

        <label class="keep-session" style="font-size:10px; cursor:pointer;">
          <input id="modal-map-toggle" type="checkbox" checked>
          <span>Mostrar obras en el mapa con este icono</span>
        </label>
        <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:4px;">
          <button type="button" class="filter-action" data-close-modal>${t('btn_cancel', null, 'CANCELAR')}</button>
          <button type="button" class="btn" data-confirm-create-collection style="padding:6px 14px; font-weight:800; background:var(--accent); color:#FFF;">${t('places_create_list', null, 'CREAR LISTA')}</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const nameInput = document.getElementById('modal-name-input');
  if (nameInput) {
    setTimeout(() => nameInput.focus(), 60);
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        crearListaDesdeModal();
      }
    });
  }

  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      cerrarModalFlotante();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

export async function crearListaDesdeModal() {
  if (!state.userId || !state.sessionToken) {
    showNeoToast('Inicia sesión para crear listas.');
    return;
  }

  const nameInput = document.getElementById('modal-name-input');
  const emojiInput = document.getElementById('modal-emoji-input');
  const descInput = document.getElementById('modal-desc-input');
  const mapToggle = document.getElementById('modal-map-toggle');
  const statusRadio = document.querySelector('input[name="modal-create-status"]:checked');

  const name = String(nameInput?.value || '').trim();
  const icon = String(emojiInput?.value || '').trim();
  const description = String(descInput?.value || '').trim();
  const show_on_map = Boolean(mapToggle?.checked);
  const status = statusRadio?.value === 'public' ? 'public' : 'private';

  if (!name) {
    showNeoToast('Escribe un nombre para la lista.');
    return;
  }

  const submitBtn = document.querySelector('[data-confirm-create-collection]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'CREANDO...';
  }

  const fallbackId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
  const newCollectionPayload = {
    id: fallbackId,
    user_id: state.userId,
    name,
    icon,
    description,
    status,
    is_public: status === 'public',
    show_on_map,
    created_at: new Date().toISOString()
  };

  try {
    const created = await createUserCollection({
      id: fallbackId,
      user_id: newCollectionPayload.user_id,
      name: newCollectionPayload.name,
      icon: newCollectionPayload.icon,
      description: newCollectionPayload.description,
      status: newCollectionPayload.status,
      show_on_map: newCollectionPayload.show_on_map,
    }, state.sessionToken);

    const savedCollection = (Array.isArray(created) && created[0]) ? { ...created[0], show_on_map, status } : (created?.id ? { ...created, show_on_map, status } : newCollectionPayload);
    state.userCollections.push(savedCollection);
    guardarZonaPersonalLocal(state.userId);
    registrarIconosColecciones();
    actualizarFuenteMapa();
    cerrarModalFlotante();
    renderList();
    document.dispatchEvent(new CustomEvent('radar:user-collection-created', { detail: { collection: savedCollection } }));
    document.dispatchEvent(new CustomEvent('radar:user-collections-changed'));
  } catch (error) {
    console.error('Error creando lista en Supabase:', error);
    state.userCollections.push(newCollectionPayload);
    guardarZonaPersonalLocal(state.userId);
    registrarIconosColecciones();
    actualizarFuenteMapa();
    cerrarModalFlotante();
    renderList();
    document.dispatchEvent(new CustomEvent('radar:user-collection-created', { detail: { collection: newCollectionPayload } }));
    document.dispatchEvent(new CustomEvent('radar:user-collections-changed'));
    showNeoToast(`Nota: La lista se creó localmente. Error del servidor: ${error.message}`);
  }
}

function abrirModalEditarLista(collectionId) {
  const collection = state.userCollections.find((item) => String(item.id) === String(collectionId));
  if (!collection) return;

  const isPublic = collection.status === 'public' || collection.is_public === true;

  removerModalExistente();
  const modalHTML = `
    <div id="collection-modal-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;">
      <div style="background:var(--bg-panel, #F8F1DF); border:2px solid var(--border-strong, #111111); box-shadow:4px 4px 0px #111111; padding:18px; width:100%; max-width:340px; display:grid; gap:12px; font-family: 'Inter', sans-serif; font-size:11px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid var(--border-strong); padding-bottom:6px;">
          <strong style="color:var(--accent); font-family:'League Spartan',sans-serif; font-size:14px;">EDITAR LISTA</strong>
          <button type="button" class="filter-action" data-close-modal style="cursor:pointer;">✕</button>
        </div>
        <div style="display:grid; grid-template-columns: 50px 1fr; gap:6px;">
          <input id="modal-edit-emoji" class="tech-input" type="text" value="${escapeHtml(collection.icon || '')}" placeholder="Icono" maxlength="4" style="text-align:center;">
          <input id="modal-edit-name" class="tech-input" type="text" value="${escapeHtml(collection.name || '')}" placeholder="Nombre de lista">
        </div>
        <textarea id="modal-edit-desc" class="tech-input" placeholder="Descripción breve..." style="resize:vertical; min-height:50px; font-family:inherit; font-size:inherit;">${escapeHtml(collection.description || '')}</textarea>
        
        <!-- Selector de Privacidad Neo-Bauhaus -->
        <div style="display:flex; flex-direction:column; gap:4px;">
          <label style="font-size:9.5px; font-weight:800; color:var(--fg-dim);">VISIBILIDAD:</label>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
            <label style="display:flex; align-items:center; gap:6px; padding:6px 8px; border:1.5px solid var(--border-strong, #111111); background:rgba(17,17,17,0.04); cursor:pointer; font-size:10px; font-weight:700;">
              <input type="radio" name="modal-edit-status" value="private" ${!isPublic ? 'checked' : ''} style="accent-color:var(--accent, #E84E1B);">
              <span>PRIVADA</span>
            </label>
            <label style="display:flex; align-items:center; gap:6px; padding:6px 8px; border:1.5px solid var(--border-strong, #111111); background:rgba(17,17,17,0.04); cursor:pointer; font-size:10px; font-weight:700;">
              <input type="radio" name="modal-edit-status" value="public" ${isPublic ? 'checked' : ''} style="accent-color:var(--accent, #E84E1B);">
              <span>PÚBLICA</span>
            </label>
          </div>
        </div>

        ${isPublic ? `
          <button type="button" class="filter-action" data-copy-collection-link="${collection.id}" style="width:100%; padding:6px 10px; font-size:10px; font-weight:800; color:var(--accent); border:1.5px solid var(--accent); background:rgba(232,78,27,0.06); cursor:pointer;">
            COPIAR ENLACE COMPARTIBLE
          </button>
        ` : ''}

        <label class="keep-session" style="font-size:10px; cursor:pointer;">
          <input id="modal-edit-map-toggle" type="checkbox" ${collection.show_on_map !== false ? 'checked' : ''}>
          <span>Mostrar obras en el mapa con este icono</span>
        </label>
        <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:4px;">
          <button type="button" class="filter-action" data-close-modal>CANCELAR</button>
          <button type="button" class="btn" data-confirm-edit-collection="${collection.id}" style="padding:6px 14px; font-weight:800; background:var(--accent); color:#FFF;">GUARDAR</button>
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
  const statusRadio = document.querySelector('input[name="modal-edit-status"]:checked');

  const newName = String(nameInput?.value || '').trim();
  const newIcon = String(emojiInput?.value || '').trim();
  const newDesc = String(descInput?.value || '').trim();
  const show_on_map = Boolean(mapToggle?.checked);
  const status = statusRadio?.value === 'public' ? 'public' : 'private';

  if (!newName) {
    showNeoToast('El nombre no puede estar vacío.');
    return;
  }

  collection.name = newName;
  collection.icon = newIcon;
  collection.description = newDesc;
  collection.status = status;
  collection.is_public = status === 'public';
  collection.show_on_map = show_on_map;

  guardarZonaPersonalLocal(state.userId);
  registrarIconosColecciones();
  actualizarFuenteMapa();
  cerrarModalFlotante();
  renderList();

  if (state.sessionToken) {
    try {
      await updateUserCollection(collectionId, { name: newName, icon: newIcon, description: newDesc, status, show_on_map }, state.sessionToken);
    } catch (err) {
      console.warn('Error sincronizando edición de lista con el servidor:', err);
    }
  }
}

export function cerrarModalFlotante() {
  removerModalExistente();
}

function removerModalExistente() {
  const existing = document.getElementById('collection-modal-overlay');
  if (existing) existing.remove();
}

function copiarEnlaceLista(collectionId, btnElement = null) {
  const url = `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}/#list=${encodeURIComponent(collectionId)}`;
  navigator.clipboard.writeText(url).then(() => {
    if (btnElement) {
      const orig = btnElement.textContent;
      btnElement.textContent = t('collection_copied_short');
      setTimeout(() => { btnElement.textContent = orig; }, 2500);
    } else {
      showNeoToast(t('toast_list_link_copied'));
    }
  }).catch(() => {
    prompt('Copia este enlace directo a la lista:', url);
  });
}

async function borrarLista(collectionId) {
  if (!state.userId || !state.sessionToken || !collectionId) return;
  const collection = state.userCollections.find((item) => String(item.id) === String(collectionId));
  if (!window.confirm(t('collection_delete_confirm', { name: collection?.name || collectionId }))) return;
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

async function dejarDeSeguirLista(collectionId) {
  if (!state.userId || !state.sessionToken || !collectionId) return;
  if (!window.confirm(t('collection_unfollow_confirm'))) return;
  try {
    await unfollowCollection(collectionId, state.userId, state.sessionToken);
    state.userFollowedCollections = state.userFollowedCollections.filter((item) => String(item.collection_id) !== String(collectionId));
    renderList();
  } catch (err) {
    showNeoToast(err.message || 'Error al dejar de seguir la lista.');
  }
}

function aislarColeccionEnMapa(collectionId) {
  if (panel) panel.classList.remove('open');
  if (button) button.classList.remove('active-state');
  handleListHashRoute();
  window.location.hash = `#list=${collectionId}`;
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
  if (!list) return;
  if (!state.sessionToken) {
    list.innerHTML = `
      <div class="nolli-empty-state">
        <div class="nolli-empty-icon-wrap">
          <i data-lucide="lock" width="22" height="22"></i>
        </div>
        <h4 class="nolli-empty-title">ACCESO AL ARCHIVO</h4>
        <p class="nolli-empty-desc">${t('nearby_empty_login', null, 'Inicia sesión para consultar y organizar tus obras guardadas.')}</p>
        <button type="button" class="nolli-empty-action" id="btn-places-login">INICIAR SESIÓN</button>
      </div>
    `;
    list.querySelector('#btn-places-login')?.addEventListener('click', () => {
      document.getElementById('modal-login')?.classList.add('open');
    });
    if (window.lucide) window.lucide.createIcons();
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
      list.innerHTML = `<div class="nearby-empty">${t('nearby_empty_loading')}</div>`;
      return;
    }

    let icon = 'star';
    let title = 'SIN FAVORITOS AÚN';
    let desc = 'Guarda obras de referencia pulsando el icono de estrella en cualquier ficha.';
    if (activeTab === 'visited') {
      icon = 'check-circle';
      title = 'SIN VISITAS REGISTRADAS';
      desc = 'Registra las obras que visites desde el mapa para completar tu pasaporte arquitectónico.';
    } else if (activeTab === 'notes') {
      icon = 'file-text';
      title = 'SIN NOTAS PRIVADAS';
      desc = 'Añade observaciones constructivas o croquis de análisis en cualquier obra.';
    }

    list.innerHTML = `
      <div class="nolli-empty-state">
        <div class="nolli-empty-icon-wrap">
          <i data-lucide="${icon}" width="22" height="22"></i>
        </div>
        <h4 class="nolli-empty-title">${title}</h4>
        <p class="nolli-empty-desc">${desc}</p>
        <button type="button" class="nolli-empty-action" data-action="close-to-map">EXPLORAR EL MAPA</button>
      </div>
    `;
    list.querySelector('[data-action="close-to-map"]')?.addEventListener('click', () => {
      panel?.classList.remove('open');
      button?.classList.remove('active-state');
    });
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  list.innerHTML = results.map((obra) => `
    <button type="button" class="my-place-item" data-feature-id="${obra.id}">
      <div class="my-place-item-main">
        <strong class="my-place-item-title">${escapeHtml(obra.nombre_obra)}</strong>
        <span class="my-place-meta">${escapeHtml(obra.arquitecto || 'Arquitecto no especificado')}</span>
      </div>
      <span class="my-place-arrow">→</span>
    </button>
  `).join('');
  if (window.lucide) window.lucide.createIcons();
}

function renderCollections() {
  const ownCards = (state.userCollections || []).map((collection) => {
    const collectionItems = (state.userCollectionItems || []).filter((item) => String(item.collection_id) === String(collection.id));
    const isMapActive = collection.show_on_map !== false;
    const isPublic = collection.status === 'public' || collection.is_public === true;

    const eyeIconSvg = isMapActive
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;

    const rows = collectionItems.map((item) => {
      const obra = state.OBRAS.find((candidate) => String(candidate.id) === String(item.building_id));
      if (!obra) return '';
      return `
        <div class="my-collection-item-row">
          <button type="button" class="my-place-item in-collection" data-feature-id="${obra.id}">
            <div class="my-place-item-main">
              <strong class="my-place-item-title">${escapeHtml(obra.nombre_obra)}</strong>
              <span class="my-place-meta">${escapeHtml(obra.arquitecto || '')}</span>
            </div>
          </button>
          <button type="button" class="btn-remove-collection" data-collection-id="${collection.id}" data-remove-from-collection="${obra.id}" title="Quitar de la lista" aria-label="Quitar de la lista">✕</button>
        </div>
      `;
    }).join('') || `<div class="nearby-empty" style="font-size:10px;">${t('empty_list_no_works')}</div>`;

    const collectionEmoji = collection.icon ? `<span style="margin-right: 6px;">${escapeHtml(collection.icon)}</span>` : '';
    const collectionDescription = collection.description ? `<div class="my-place-meta" style="margin-top: 2px; font-style: italic;">${escapeHtml(collection.description)}</div>` : '';

    return `
      <article class="my-collection-card">
        <div class="my-collection-head">
          <div style="min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <span style="font-weight:700; color:var(--fg);">${collectionEmoji}${escapeHtml(collection.name)}</span>
              <span style="font-size:9px; font-weight:800; font-family: 'Inter', sans-serif; color:${isPublic ? 'var(--accent, #E84E1B)' : 'var(--fg-dim)'}; letter-spacing:0.04em;">// ${isPublic ? t('collection_status_public') : t('collection_status_private')}</span>
            </div>
            ${collectionDescription}
          </div>
          <div class="my-collection-tools">
            ${isPublic ? `
              <button type="button" class="collection-tool-btn" data-copy-collection-link="${collection.id}" title="${t('collection_copy_link')}" aria-label="${t('collection_copy_link')}">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              </button>
            ` : ''}
            <button type="button" class="collection-map-toggle ${isMapActive ? 'active' : ''}" data-toggle-map-collection="${collection.id}" title="${isMapActive ? t('collection_hide_map') : t('collection_show_map')}" aria-label="${isMapActive ? t('collection_hide_map') : t('collection_show_map')}">
              ${eyeIconSvg}
            </button>
            <span class="collection-counter" title="Total de obras">${collectionItems.length}</span>
            <button type="button" class="collection-tool-btn" data-edit-collection="${collection.id}" title="${t('collection_edit_title')}" aria-label="${t('collection_edit_title')}">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            </button>
            <button type="button" class="collection-tool-btn btn-delete" data-delete-collection="${collection.id}" title="${t('collection_delete_title')}" aria-label="${t('collection_delete_title')}">
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

  // Renderizar listas seguidas de otros creadores
  const followedCards = (state.userFollowedCollections || []).map((followItem) => {
    const col = followItem.user_collections || followItem;
    if (!col) return '';
    const creatorName = col.profiles?.nick ? `@${col.profiles.nick}` : (col.profiles?.first_name ? `@${col.profiles.first_name}` : 'Comunidad Nolli');
    const emoji = col.icon || '';
    const title = col.name || 'Lista pública';

    return `
      <article class="my-collection-card" style="border-left: 3px solid var(--accent, #E84E1B);">
        <div class="my-collection-head">
          <div style="min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="font-weight:700; color:var(--fg);">${escapeHtml(emoji)} ${escapeHtml(title)}</span>
              <span style="font-size:8.5px; font-weight:800; font-family: 'Inter', sans-serif; padding:1px 4px; background:rgba(232,78,27,0.08); color:var(--accent, #E84E1B);">${t('collection_followed_badge')}</span>
            </div>
            <div class="my-place-meta" style="font-size:9.5px; color:var(--fg-dim); margin-top:2px;">Por ${escapeHtml(creatorName)}</div>
          </div>
          <div class="my-collection-tools">
            <button type="button" class="collection-tool-btn" data-view-collection-map="${col.id}" title="${t('collection_view_map')}" style="color:var(--accent); border-color:var(--accent);">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/></svg>
            </button>
            <button type="button" class="collection-tool-btn btn-delete" data-unfollow-collection="${col.id}" title="${t('collection_unfollow_title')}" aria-label="${t('collection_unfollow_title')}">
              ✕
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  list.innerHTML = `
    <div class="my-collections-header">
      <span style="font-size: 10px; color: var(--fg-dim); font-weight: 700; font-family: 'Inter', sans-serif;">${t('my_lists_heading', { count: (state.userCollections || []).length })}</span>
      <button type="button" class="btn-new-list" data-open-create-collection-modal style="padding: 5px 12px; font-size: 10px;">${t('new_list_btn')}</button>
    </div>
    ${ownCards || `
      <div class="nolli-empty-state">
        <div class="nolli-empty-icon-wrap">
          <i data-lucide="bookmark" width="22" height="22"></i>
        </div>
        <h4 class="nolli-empty-title">SIN LISTAS DE VIAJE</h4>
        <p class="nolli-empty-desc">${t('first_list_hint', null, 'Crea tu primera lista para organizar tus próximas rutas y obras de arquitectura.')}</p>
        <button type="button" class="nolli-empty-action" data-open-create-collection-modal>+ CREAR NUEVA LISTA</button>
      </div>
    `}

    ${(state.userFollowedCollections || []).length > 0 ? `
      <div class="my-collections-header" style="margin-top:20px;">
        <span style="font-size: 10px; color: var(--accent, #E84E1B); font-weight: 700; font-family: 'Inter', sans-serif;">${t('followed_lists_heading', { count: state.userFollowedCollections.length })}</span>
      </div>
      ${followedCards}
    ` : ''}
  `;
  if (window.lucide) window.lucide.createIcons();
}

