/* =========================================================================
   SHEETUI.JS - Ficha tecnica y acciones personales de una obra
   ========================================================================= */

import { state, separarArquitectos, normalizarCategoria, normalizarImportancia, formatCategoria, esRolAdmin, esRolEditor, guardarZonaPersonalLocal, CATEGORY_META } from './state.js';
import { actualizarFuenteMapa } from './mapData.js';
import { cerrarFiltros, generarFiltrosUI } from './filtersUI.js';
import { fetchBuildings, saveBuildingStatus, reviewBuilding, deleteBuilding, updateBuilding, deletePrivateBuilding, createUserCollection, addUserCollectionItem, deleteUserCollectionItem, createUserPrivateLabel, deleteUserPrivateLabel } from './api.js';
import { abrirModalCrearLista } from './myPlacesUI.js';
import { getOptimizedPhotoUrl } from './imageProxy.js';
import { showNeoToast } from './renderUtils.js';
import { addFilterChip } from './filterEngine.js';
import { t, getUrlPrefix } from './i18n.js';
import { renderObraCard } from './workCard.js';

const sheet = document.getElementById('sheet');
let organizerMode = 'collections';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

export function isValidHttpsUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function abrirFichaArquitecto(nombreArquitecto) {
  const modal = document.getElementById('modal-architect');
  const works = document.getElementById('architect-profile-works');
  document.getElementById('architect-profile-name').textContent = nombreArquitecto;
  document.getElementById('architect-profile-count').textContent = t('architect_loading');
  works.innerHTML = `<p class="architect-profile-empty">${t('architect_querying_db')}</p>`;
  modal.classList.add('open');

  let obras;
  try {
    const filas = await fetchBuildings({ architect: nombreArquitecto, includeAllImportance: true });
    obras = (filas || []).map((fila, index) => ({
      id: fila.id,
      featureId: String(fila.id ?? `obra-${index}`),
      nombre_obra: fila.nombre_obra,
      foto_url: fila.foto_url || null,
      enlace_url: fila.enlace_url || null,
      arquitecto: fila.arquitecto,
      arquitectos: Array.isArray(fila.arquitectos) ? fila.arquitectos : separarArquitectos(fila.arquitecto),
      año_construccion: fila.año_construccion,
      importancia: normalizarImportancia(fila.importancia),
      categoria: normalizarCategoria(fila.categoria),
      ciudad: fila.place || fila.ciudad || null,
      estado_acceso: fila.estado_acceso || (fila.visitable ? 'publico' : 'privado'),
      estado_revision: fila.estado_revision || 'publicada',
      coordenadas: [fila.longitud, fila.latitud],
      selected: false,
    }));

    const obrasPorId = new Map(state.OBRAS.map((obra) => [String(obra.id), obra]));
    obras.forEach((obra) => obrasPorId.set(String(obra.id), { ...obrasPorId.get(String(obra.id)), ...obra }));
    state.OBRAS = [...obrasPorId.values()];
  } catch (error) {
    console.error('Error cargando obras del arquitecto:', error);
    document.getElementById('architect-profile-count').textContent = t('architect_load_error');
    works.innerHTML = `<p class="architect-profile-empty">${t('architect_could_not_load')}</p>`;
    return;
  }

  obras = obras
    .sort((first, second) => Number(second.año_construccion || 0) - Number(first.año_construccion || 0)
      || String(first.nombre_obra || '').localeCompare(String(second.nombre_obra || ''), 'es'));

  const countLabel = obras.length === 1 ? t('architect_single_work_label') : t('architect_multiple_works_label');
  document.getElementById('architect-profile-count').textContent = t('architect_works_count', { count: obras.length, label: countLabel });

  works.innerHTML = obras.length ? obras.map((obra) => renderObraCard(obra, {
    variant: 'architect',
    className: 'architect-work-card',
    featureId: obra.featureId || obra.id,
    showPhoto: Boolean(obra.foto_url && isValidHttpsUrl(obra.foto_url) && state.sessionToken),
    tag: 'button'
  })).join('') : `<p class="architect-profile-empty">${t('architect_no_works')}</p>`;

  window.lucide?.createIcons({ context: modal });
}

function cerrarFichaArquitecto() {
  document.getElementById('modal-architect').classList.remove('open');
}

document.getElementById('btn-sheet-close')?.addEventListener('click', (event) => {
  event.stopPropagation();
  cerrarFicha();
});

export function cerrarFicha() {
  sheet.classList.remove('open');
  document.getElementById('sheet-header-actions').innerHTML = '';
  const selected = getSelectedBuilding();
  if (selected) selected.selected = false;
  state.selectedFeatureId = null;
  actualizarFuenteMapa();

  const prefix = getUrlPrefix();
  const basePath = prefix ? `${prefix}/` : '/';
  if (window.location.pathname.includes('/obra/')) {
    window.history.pushState(null, '', basePath);
  }
}

export function abrirFicha(building, coordinates, featureId = building?.id || building?.featureId, openedFromUrl = false) {
  if (!building) return;
  const targetId = featureId || building.id || building.featureId;
  if (state.selectedFeatureId !== null) {
    const previous = getSelectedBuilding();
    if (previous) previous.selected = false;
  }
  state.selectedFeatureId = targetId;
  const selected = getSelectedBuilding() || building;
  if (selected) selected.selected = true;
  actualizarFuenteMapa();

  // Actualizar URL limpia [prefix]/obra/[ID] usando History API sin recargar
  const cleanId = String(building.id || targetId);
  const prefix = getUrlPrefix();
  const targetPath = `${prefix}/obra/${encodeURIComponent(cleanId)}`;
  if (!window.location.pathname.includes('/obra/') || decodeURIComponent(window.location.pathname.replace(/^.*\/obra\//, '')) !== cleanId) {
    window.history.pushState({ obraId: cleanId }, '', targetPath);
  }

  const coords = coordinates || selected.coordenadas || building.coordenadas || [0, 0];

  const architectsList = Array.isArray(building.arquitectos) ? building.arquitectos : separarArquitectos(building.arquitecto);
  const architects = architectsList
    .map((architect) => `<button type="button" class="architect-filter" data-arq="${escapeHtml(architect)}">${escapeHtml(architect)}</button>`).join(', ');
  const adminActive = esRolAdmin(state.userRole);
  const editorActive = esRolEditor(state.userRole);
  const isFav = getStatus('favorite');
  const isVis = getStatus('visited');
  const isSaved = state.userCollectionItems.some((item) => String(item.building_id) === String(building.id));
  const hasTags = state.userPrivateLabels.some((item) => String(item.building_id) === String(building.id));
  const catKey = building.categoria || 'otro';
  const catColor = CATEGORY_META[catKey]?.color || '#E95C0C';
  const canDeletePrivate = Boolean(selected?.private && state.userId && String(selected.user_id) === String(state.userId));
  const isPending = adminActive && building.estado_revision === 'pendiente';

  document.getElementById('sheet-title').textContent = building.nombre_obra;

  document.getElementById('sheet-header-actions').innerHTML = `
    ${state.sessionToken ? `
      <button type="button" class="sheet-fav-btn ${isFav ? 'active favorite' : ''}" data-status="favorite" title="${isFav ? t('sheet_fav_remove') : t('sheet_fav_add')}" aria-label="${isFav ? t('sheet_fav_remove') : t('sheet_fav_add')}">
        <i data-lucide="heart" width="16" height="16" ${isFav ? 'fill="currentColor"' : ''}></i>
      </button>
    ` : ''}
  `;

  document.getElementById('sheet-body').innerHTML = `
    <!-- Subtítulo de autor y año -->
    <div class="sheet-meta-subtitle">
      <span class="sheet-meta-architects">${architects}</span>
      ${building.año_construccion ? `<span class="sheet-meta-year">· ${escapeHtml(building.año_construccion)}</span>` : ''}
      ${building.ciudad ? `<span class="sheet-meta-city">· ${escapeHtml(building.ciudad)}</span>` : ''}
    </div>

    <!-- Botonera de Acción Rápida (Hero Actions) -->
    <div class="sheet-hero-actions">
      <a href="https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}" target="_blank" rel="noopener noreferrer" class="sheet-hero-btn btn-primary" title="${t('sheet_directions')}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><line x1="5" y1="19" x2="19" y2="5"></line><polyline points="8 5 19 5 19 16"></polyline></svg>
        <span>${t('sheet_directions')}</span>
      </a>
      ${state.sessionToken ? `
        <button type="button" class="sheet-hero-btn ${isVis ? 'active visited' : ''}" data-status="visited">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><polyline points="4 12 9 17 20 6"></polyline></svg>
          <span>${isVis ? t('sheet_visited') : t('sheet_visit')}</span>
        </button>
        <button type="button" class="sheet-hero-btn ${isSaved ? 'active saved' : ''}" data-save-collection>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M5 3h14v18l-7-5-7 5V3z"></path></svg>
          <span>${isSaved ? t('sheet_saved') : t('sheet_save')}</span>
        </button>
      ` : ''}
      <button type="button" class="sheet-hero-btn" data-share-action="open">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><rect x="15" y="3" width="6" height="6"></rect><rect x="3" y="9" width="6" height="6"></rect><rect x="15" y="15" width="6" height="6"></rect><line x1="9" y1="11" x2="15" y2="6"></line><line x1="9" y1="13" x2="15" y2="18"></line></svg>
        <span>${t('sheet_share')}</span>
      </button>
    </div>

    <!-- Fotografía Principal en Banner Panorámico (Solo usuarios registrados) -->
    ${building.foto_url && isValidHttpsUrl(building.foto_url) && state.sessionToken ? `
      <div class="sheet-gallery-wrap">
        <button type="button" class="photo-thumb sheet-photo-banner" data-photo-url="${escapeHtml(building.foto_url)}" aria-label="${t('sheet_photo_expand_aria')}">
          <img class="sheet-photo" src="${escapeHtml(getOptimizedPhotoUrl(building.foto_url, { width: 1000 }))}" alt="Fotografía de ${escapeHtml(building.nombre_obra)}" loading="lazy"${openedFromUrl ? ' fetchpriority="high"' : ''}>
          <span class="photo-zoom-badge"><i data-lucide="maximize-2" width="12" height="12"></i> ${t('sheet_photo_expand')}</span>
        </button>
      </div>
    ` : ''}

    <!-- Ficha Técnica Modular Limpia (Matriz Tipográfica) -->
    <div class="sheet-tech-section">
      <div class="tech-row">
        <span class="tech-label">${t('sheet_architecture')}</span>
        <span class="tech-value tech-value-accent">${architects}</span>
      </div>

      <div class="tech-grid-2col">
        <div class="tech-col">
          <span class="tech-label">${t('sheet_year')}</span>
          <span class="tech-value">${building.año_construccion || '-'}</span>
        </div>
        <div class="tech-col">
          <span class="tech-label">${t('sheet_category')}</span>
          <span class="tech-value">
            <span class="sheet-cat-badge"><span class="cat-pip" style="background: ${catColor};"></span>${formatCategoria(building.categoria)}</span>
          </span>
        </div>
      </div>

      <div class="tech-row">
        <span class="tech-label">${t('sheet_access')}</span>
        <span class="tech-value">
          <span class="sheet-access-badge">${formatAccess(building.estado_acceso || (building.visitable ? 'publico' : 'privado'))}</span>
        </span>
      </div>

      <div class="tech-row">
        <span class="tech-label">${t('sheet_coordinates')}</span>
        <span class="tech-value tech-value-mono">${coords[1].toFixed(5)}° N, ${coords[0].toFixed(5)}° E</span>
      </div>

      ${building.enlace_url && isValidHttpsUrl(building.enlace_url) && state.sessionToken ? `
        <div class="tech-row tech-row-link">
          <span class="tech-label">${t('sheet_link')}</span>
          <span class="tech-value">
            <a href="${escapeHtml(building.enlace_url)}" target="_blank" rel="noopener noreferrer" class="sheet-web-link">${t('sheet_official_site')}</a>
          </span>
        </div>
      ` : ''}
    </div>

    <!-- Cuaderno Privado (Valoración y Notas) -->
    ${state.sessionToken ? `
      <div class="personal-notes">
        <div class="personal-notes-head">${t('sheet_my_rating_notes')}</div>
        <div class="rating-stars">${[1, 2, 3, 4, 5].map((value) => `<button type="button" class="rating-star ${getStatus('valoracion') >= value ? 'active' : ''}" data-rating="${value}" aria-label="Valorar ${value} de 5">&#9733;</button>`).join('')}</div>
        <button type="button" class="btn note-toggle" data-note-toggle>${t('sheet_add_private_note')}</button>
        <div class="personal-note-editor" data-note-editor>
          <label for="building-notes">${t('sheet_private_note_label')}</label>
          <textarea id="building-notes" class="tech-input" rows="3" placeholder="${t('sheet_private_note_placeholder')}"></textarea>
          <button type="button" class="btn save-personal-status" data-save-personal>${t('sheet_save_note')}</button>
        </div>
      </div>
    ` : ''}

    <!-- Panel de Administración / Moderación -->
    ${editorActive || canDeletePrivate ? `
      <div class="sheet-admin-block">
        <div class="sheet-admin-head">${t('sheet_building_management')}</div>
        ${isPending ? `
          <div class="sheet-admin-pending-alert">
            <i data-lucide="clock" width="14" height="14" style="color:var(--accent-2);"></i>
            <span>OBRA PENDIENTE DE REVISIÓN</span>
          </div>
        ` : ''}
        <div class="sheet-admin-actions">
          ${isPending && adminActive ? `
            <button type="button" class="btn btn-admin-approve" data-review-building="publicada"><i data-lucide="check" width="13" height="13"></i> APROBAR</button>
            <button type="button" class="btn btn-admin-reject" data-review-building="rechazada"><i data-lucide="x" width="13" height="13"></i> RECHAZAR</button>
          ` : ''}
          ${editorActive ? `
            <button type="button" class="btn btn-admin-action" data-edit-building><i data-lucide="pencil" width="14" height="14"></i> ${t('sheet_edit_building')}</button>
            <button type="button" class="btn btn-admin-action" data-move-building><i data-lucide="map-pin" width="14" height="14"></i> MOVER OBRA</button>
          ` : ''}
          ${adminActive ? `
            <button type="button" class="btn btn-admin-delete" data-delete-building><i data-lucide="trash-2" width="14" height="14"></i> ${t('sheet_delete_db')}</button>
          ` : ''}
          ${canDeletePrivate ? `
            <button type="button" class="btn btn-admin-delete" data-delete-private><i data-lucide="trash-2" width="14" height="14"></i> ${t('sheet_delete_private')}</button>
          ` : ''}
        </div>
      </div>
    ` : ''}

    <!-- Botones de Reporte de Incidencias Neo-Bauhaus -->
    <div class="sheet-reports-actions">
      <button type="button" class="sheet-report-btn" data-open-report="error_datos">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><polygon points="12 2 22 20 2 20 12 2"></polygon><line x1="12" y1="9" x2="12" y2="13"></line><rect x="11" y="16" width="2" height="2" fill="currentColor"></rect></svg>
        <span>${t('sheet_report_error')}</span>
      </button>
      <button type="button" class="sheet-report-btn" data-open-report="duplicado">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><rect x="8" y="8" width="13" height="13"></rect><path d="M5 16H3V3h13v2"></path></svg>
        <span>${t('sheet_report_duplicate')}</span>
      </button>
    </div>
  `;

  window.lucide?.createIcons({ context: sheet });

  // Listeners para iniciar sesión desde elementos restringidos
  document.querySelectorAll('[data-trigger-login]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mLogin = document.getElementById('modal-login');
      if (mLogin) mLogin.classList.add('open');
    });
  });

  // Listeners para botones de reporte
  document.querySelectorAll('[data-open-report]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const reportType = btn.dataset.openReport || 'error_datos';
      document.dispatchEvent(new CustomEvent('radar:open-report', { detail: { obra: selected, reportType } }));
    });
  });

  const editButton = document.querySelector('[data-edit-building]');
  if (editButton) editButton.addEventListener('click', (event) => {
    event.stopPropagation();
    document.dispatchEvent(new CustomEvent('radar:edit-building', { detail: { obra: selected } }));
  });
  sheet.classList.add('open');
  cerrarFiltros();

  // En móvil, centrar el mapa en la mitad superior para no tapar el marcador
  if (window.innerWidth <= 768 && state.map && coords) {
    state.map.easeTo({
      center: coords,
      padding: { top: 60, bottom: Math.round(window.innerHeight * 0.45), left: 0, right: 0 },
      duration: 350,
    });
    // Cerrar paneles flotantes si estuvieran abiertos
    ['filter-panel', 'search-panel', 'my-places-panel', 'map-style-panel', 'admin-panel'].forEach((id) => {
      document.getElementById(id)?.classList.remove('open');
    });
    document.getElementById('panel-backdrop')?.classList.add('active');
  }

  const notes = document.getElementById('building-notes');
  if (notes) {
    notes.value = state.buildingStatuses.get(String(selected?.id || building.id))?.notas || '';
    if (notes.value) notes.closest('[data-note-editor]').classList.add('open');
  }
}

function formatAccess(value) {
  const map = {
    publico: 'access_public',
    exterior_visible: 'access_visible_ext',
    con_reserva: 'access_reservation',
    privado: 'access_private',
    cerrado_temporalmente: 'access_temp_closed',
    no_construido: 'access_unbuilt',
    desaparecido: 'access_demolished',
  };
  const key = map[value];
  return key ? t(key) : (value || '');
}

function getSelectedBuilding() {
  if (!state.selectedFeatureId) return null;
  const target = String(state.selectedFeatureId);
  return state.OBRAS.find((item) => String(item.id) === target || String(item.featureId) === target) || null;
}

function getStatus(status) {
  const building = getSelectedBuilding();
  if (!building || !building.id) return false;
  return state.buildingStatuses?.get(String(building.id))?.[status] || false;
}

function closeOrganizer() { document.getElementById('modal-personal-organizer').classList.remove('open'); }

function organizerOptions(building, mode, checkedIdsOverride = null) {
  if (mode === 'collections') {
    if (!state.userCollections || !state.userCollections.length) {
      return `<div class="nearby-empty" style="display:flex; flex-direction:column; align-items:center; gap:8px; padding:16px;">
        <span>${t('sheet_no_collections_yet')}</span>
        <button type="button" class="btn-new-list" id="btn-organizer-empty-new-list" data-open-create-collection-modal style="padding:6px 14px; font-size:10px;">${t('sheet_new_list_btn', null, '+ NUEVA LISTA')}</button>
      </div>`;
    }
    return state.userCollections.map((collection) => {
      const checked = checkedIdsOverride
        ? checkedIdsOverride.has(String(collection.id))
        : state.userCollectionItems.some((item) => String(item.collection_id) === String(collection.id) && String(item.building_id) === String(building.id));
      const iconDisplay = collection.icon ? `<span style="margin-right:6px; font-size:13px;">${escapeHtml(collection.icon)}</span>` : '';
      return `<label class="personal-organizer-option">
        <input type="checkbox" value="${collection.id}" ${checked ? 'checked' : ''}>
        <span style="display:inline-flex; align-items:center;">${iconDisplay}${escapeHtml(collection.name)}</span>
      </label>`;
    }).join('');
  }
  const labels = [...new Set(state.userPrivateLabels.map((item) => item.label).filter(Boolean))];
  return labels.length ? labels.map((label) => {
    const checked = state.userPrivateLabels.some((item) => String(item.building_id) === String(building.id) && String(item.label).toLowerCase() === String(label).toLowerCase());
    return `<label class="personal-organizer-option"><input type="checkbox" value="${label}" ${checked ? 'checked' : ''}><span>#${escapeHtml(label)}</span></label>`;
  }).join('') : `<div class="nearby-empty">${t('sheet_no_tags_yet')}</div>`;
}

function openOrganizer(mode) {
  const building = getSelectedBuilding();
  if (!building || !state.userId || !state.sessionToken) { showNeoToast(t('sheet_login_to_organize')); return; }
  organizerMode = mode;
  const isCollections = mode === 'collections';
  document.getElementById('personal-organizer-title').textContent = isCollections ? t('sheet_save_in_lists') : t('sheet_add_tags');
  document.getElementById('personal-organizer-project').textContent = building.nombre_obra;
  document.getElementById('personal-organizer-help').textContent = isCollections ? t('sheet_select_lists_help') : t('sheet_select_tags_help');

  const newListRow = document.getElementById('organizer-new-list-row');
  if (newListRow) {
    newListRow.classList.toggle('hidden', !isCollections);
    const countEl = document.getElementById('personal-organizer-count');
    if (countEl && isCollections) {
      countEl.textContent = t('sheet_your_lists_count', { count: (state.userCollections || []).length }, `TUS LISTAS (${(state.userCollections || []).length})`);
    }
  }

  const tagCreateRow = document.getElementById('personal-create-tag-row');
  if (tagCreateRow) {
    tagCreateRow.classList.toggle('hidden', isCollections);
  }

  const nameInput = document.getElementById('personal-new-name');
  if (nameInput) {
    nameInput.placeholder = isCollections ? t('sheet_new_list_placeholder') : t('sheet_new_tag_placeholder');
  }

  document.getElementById('personal-organizer-options').innerHTML = organizerOptions(building, mode);
  document.getElementById('personal-organizer-error').classList.add('hidden');
  document.getElementById('modal-personal-organizer').classList.add('open');
}

async function createOrganizerItem() {
  const building = getSelectedBuilding();
  const input = document.getElementById('personal-new-name');
  const name = String(input.value || '').trim();
  if (!building || !name) return;
  try {
    if (organizerMode === 'collections') {
      const fallbackId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
      const created = await createUserCollection({ id: fallbackId, user_id: state.userId, name, status: 'private' }, state.sessionToken);
      const newCol = (Array.isArray(created) && created[0]) ? created[0] : (created?.id ? created : { id: fallbackId, user_id: state.userId, name, status: 'private' });
      state.userCollections.push(newCol);
    } else if (!state.userPrivateLabels.some((item) => String(item.building_id) === String(building.id) && String(item.label).toLowerCase() === name.toLowerCase())) {
      const created = await createUserPrivateLabel({ user_id: state.userId, building_id: building.id, label: name }, state.sessionToken);
      if (created[0]) state.userPrivateLabels.push(created[0]);
    }
    input.value = '';
    guardarZonaPersonalLocal(state.userId);
    openOrganizer(organizerMode);
  } catch (error) {
    const errorElement = document.getElementById('personal-organizer-error'); errorElement.textContent = error.message; errorElement.classList.remove('hidden');
  }
}

async function saveOrganizerSelection() {
  const building = getSelectedBuilding();
  if (!building) return;
  const selected = [...document.querySelectorAll('#personal-organizer-options input:checked')].map((input) => input.value);
  try {
    if (organizerMode === 'collections') {
      const current = state.userCollectionItems.filter((item) => String(item.building_id) === String(building.id));
      for (const collection of state.userCollections) {
        const existing = current.find((item) => String(item.collection_id) === String(collection.id));
        if (selected.includes(String(collection.id)) && !existing) {
          try {
            const saved = await addUserCollectionItem({ id: `CLI-${Date.now()}-${collection.id}`, user_id: state.userId, collection_id: collection.id, building_id: building.id }, state.sessionToken);
            if (saved[0]) state.userCollectionItems.push(saved[0]);
          } catch (err) {
            console.warn('Reintentando sincronización de colección:', err);
            if (String(err.message).includes('foreign key constraint') || String(err.message).includes('user_collection_items_collection_id_fkey')) {
              try {
                await createUserCollection({
                  id: collection.id,
                  user_id: state.userId,
                  name: collection.name,
                  icon: collection.icon,
                  description: collection.description
                }, state.sessionToken);
                const retrySaved = await addUserCollectionItem({ id: `CLI-${Date.now()}-${collection.id}`, user_id: state.userId, collection_id: collection.id, building_id: building.id }, state.sessionToken);
                if (retrySaved[0]) state.userCollectionItems.push(retrySaved[0]);
              } catch (retryError) {
                state.userCollectionItems.push({ id: `CLI-${Date.now()}-${collection.id}`, user_id: state.userId, collection_id: collection.id, building_id: building.id });
              }
            } else {
              state.userCollectionItems.push({ id: `CLI-${Date.now()}-${collection.id}`, user_id: state.userId, collection_id: collection.id, building_id: building.id });
            }
          }
        } else if (!selected.includes(String(collection.id)) && existing) {
          state.userCollectionItems = state.userCollectionItems.filter((item) => item !== existing);
          deleteUserCollectionItem(collection.id, state.userId, building.id, state.sessionToken).catch((err) => {
            console.warn('Error borrando item de colección en servidor:', err);
          });
        }
      }
    } else {
      const current = state.userPrivateLabels.filter((item) => String(item.building_id) === String(building.id));
      const labels = [...new Set(state.userPrivateLabels.map((item) => item.label).filter(Boolean))];
      for (const label of labels) {
        const existing = current.find((item) => String(item.label).toLowerCase() === String(label).toLowerCase());
        if (selected.includes(label) && !existing) {
          const created = await createUserPrivateLabel({ user_id: state.userId, building_id: building.id, label }, state.sessionToken);
          if (created[0]) state.userPrivateLabels.push(created[0]);
        } else if (!selected.includes(label) && existing) {
          await deleteUserPrivateLabel(existing.id, state.userId, state.sessionToken);
          state.userPrivateLabels = state.userPrivateLabels.filter((item) => item !== existing);
        }
      }
    }
    guardarZonaPersonalLocal(state.userId);
    closeOrganizer();
    renderSheetStatusUI(building);
    document.dispatchEvent(new CustomEvent(organizerMode === 'collections' ? 'radar:user-collections-changed' : 'radar:user-private-labels-changed'));
  } catch (error) {
    const errorElement = document.getElementById('personal-organizer-error'); errorElement.textContent = error.message; errorElement.classList.remove('hidden');
  }
}

document.addEventListener('radar:user-collection-created', async (event) => {
  const modal = document.getElementById('modal-personal-organizer');
  if (!modal || !modal.classList.contains('open') || organizerMode !== 'collections') return;

  const building = getSelectedBuilding();
  if (!building) return;

  const newCol = event.detail?.collection;
  if (!newCol || !newCol.id) return;

  const checkedIds = new Set(
    [...document.querySelectorAll('#personal-organizer-options input:checked')].map((input) => String(input.value))
  );
  checkedIds.add(String(newCol.id));

  const countEl = document.getElementById('personal-organizer-count');
  if (countEl) {
    countEl.textContent = t('sheet_your_lists_count', { count: (state.userCollections || []).length }, `TUS LISTAS (${(state.userCollections || []).length})`);
  }

  const itemPayload = {
    id: `CLI-${Date.now()}-${newCol.id}`,
    user_id: state.userId,
    collection_id: newCol.id,
    building_id: building.id
  };

  try {
    const saved = await addUserCollectionItem(itemPayload, state.sessionToken);
    if (saved && saved[0]) {
      state.userCollectionItems.push(saved[0]);
    } else {
      state.userCollectionItems.push(itemPayload);
    }
  } catch (err) {
    console.warn('Guardando item localmente tras crear lista:', err);
    state.userCollectionItems.push(itemPayload);
  }

  guardarZonaPersonalLocal(state.userId);
  renderSheetStatusUI(building);

  document.getElementById('personal-organizer-options').innerHTML = organizerOptions(building, 'collections', checkedIds);
  document.getElementById('personal-organizer-error').classList.add('hidden');

  showNeoToast(t('sheet_work_saved_in_new_list', { name: newCol.name }, `Obra añadida a la nueva lista "${newCol.name}"`));
});

export function renderSheetStatusUI(building = getSelectedBuilding()) {
  if (!building) return;
  const bId = String(building.id);
  const status = state.buildingStatuses.get(bId) || {};
  const isFav = Boolean(status.favorite);
  const isVis = Boolean(status.visited);
  const isSaved = state.userCollectionItems.some((item) => String(item.building_id) === bId);
  const hasTags = state.userPrivateLabels.some((item) => String(item.building_id) === bId);

  // 1. Botón de Favorito en Cabecera
  const favBtn = document.querySelector('.sheet-fav-btn[data-status="favorite"]');
  if (favBtn) {
    favBtn.classList.toggle('active', isFav);
    favBtn.classList.toggle('favorite', isFav);
    favBtn.title = isFav ? t('sheet_fav_remove') : t('sheet_fav_add');
    favBtn.setAttribute('aria-label', isFav ? t('sheet_fav_remove') : t('sheet_fav_add'));
    const heartSvg = favBtn.querySelector('svg');
    if (heartSvg) {
      heartSvg.style.fill = isFav ? 'currentColor' : 'none';
    }
  }

  // 2. Botón de Visitar en Hero Actions
  const visBtn = document.querySelector('.sheet-hero-btn[data-status="visited"]');
  if (visBtn) {
    visBtn.classList.toggle('active', isVis);
    visBtn.classList.toggle('visited', isVis);
    const span = visBtn.querySelector('span');
    if (span) span.textContent = isVis ? t('sheet_visited') : t('sheet_visit');
  }

  // 3. Botón de Guardar en Colecciones
  const saveBtn = document.querySelector('.sheet-hero-btn[data-save-collection]');
  if (saveBtn) {
    saveBtn.classList.toggle('active', isSaved);
    saveBtn.classList.toggle('saved', isSaved);
    const span = saveBtn.querySelector('span');
    if (span) span.textContent = isSaved ? t('sheet_saved') : t('sheet_save');
    const bookmarkSvg = saveBtn.querySelector('svg');
    if (bookmarkSvg) {
      bookmarkSvg.style.fill = isSaved ? 'currentColor' : 'none';
    }
  }

  // 4. Botón de Etiquetas
  const tagBtn = document.querySelector('.sheet-hero-btn[data-add-private-tag]');
  if (tagBtn) {
    tagBtn.classList.toggle('active', hasTags);
    tagBtn.classList.toggle('tagged', hasTags);
  }

  // 5. Estrellas de Valoración
  const starsContainer = document.querySelector('.rating-stars');
  if (starsContainer) {
    const val = Number(status.valoracion || 0);
    starsContainer.querySelectorAll('[data-rating]').forEach((star) => {
      star.classList.toggle('active', Number(star.dataset.rating) <= val);
    });
  }
}

async function saveStatus(status, value) {
  const building = getSelectedBuilding();
  if (!building) return;

  if (!state.userId || !state.sessionToken) {
    showNeoToast(t('toast_login_required_fav'));
    return;
  }

  const key = String(building.id);
  const previous = state.buildingStatuses.get(key) || { favorite: false, visited: false };
  const next = { ...previous, [status]: value };

  state.buildingStatuses.set(key, next);
  renderSheetStatusUI(building);
  actualizarFuenteMapa();
  document.dispatchEvent(new CustomEvent('radar:user-status-changed', { detail: { buildingId: key, status, value } }));

  guardarEstadoPersonalLocal();
  guardarZonaPersonalLocal(state.userId);

  try {
    await saveBuildingStatus(state.userId, building.id, next, state.sessionToken);
  } catch (error) {
    console.error('Error al guardar estado:', error);
    state.buildingStatuses.set(key, previous);
    renderSheetStatusUI(building);
    actualizarFuenteMapa();
    guardarEstadoPersonalLocal();
    guardarZonaPersonalLocal(state.userId);
    document.dispatchEvent(new CustomEvent('radar:user-status-changed', { detail: { buildingId: key, status, value: previous[status] } }));
  }
}

async function saveNote(button) {
  const building = getSelectedBuilding();
  if (!building || !state.userId || !state.sessionToken) {
    showNeoToast(t('sheet_notes_login_required'));
    return;
  }

  const editor = button.closest('[data-note-editor]');
  const textarea = editor ? editor.querySelector('textarea') : null;
  const nota = textarea ? textarea.value.trim() : '';

  const key = String(building.id);
  const previous = state.buildingStatuses.get(key) || { favorite: false, visited: false };
  const next = { ...previous, notas: nota };
  state.buildingStatuses.set(key, next);
  guardarEstadoPersonalLocal();
  guardarZonaPersonalLocal(state.userId);

  button.disabled = true;
  button.textContent = t('sheet_saving_note');
  try {
    await saveBuildingStatus(state.userId, building.id, next, state.sessionToken);
    button.textContent = t('sheet_saved');
    document.dispatchEvent(new CustomEvent('radar:user-status-changed', { detail: { buildingId: key, status: 'notas', value: nota } }));
  } catch (error) {
    console.error('Error al guardar nota:', error);
    button.textContent = t('sheet_saved_note_local');
    document.dispatchEvent(new CustomEvent('radar:user-status-changed', { detail: { buildingId: key, status: 'notas', value: nota } }));
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = t('sheet_save_note');
    }, 2000);
  }
}

async function deletePrivate() {
  const building = getSelectedBuilding();
  if (!building?.private || !state.userId || String(building.user_id) !== String(state.userId) || !window.confirm(t('sheet_delete_private_confirm', { name: building.nombre_obra }))) return;
  try { await deletePrivateBuilding(building.id, state.userId, state.sessionToken); state.OBRAS = state.OBRAS.filter((item) => item !== building); state.privateBuildings = state.privateBuildings.filter((item) => item !== building); cerrarFicha(); actualizarFuenteMapa(); } catch (error) { showNeoToast(error.message || t('toast_error_generic')); }
}

async function deleteBuildingFromSheet() {
  const building = getSelectedBuilding();
  if (!building || !esRolAdmin(state.userRole) || !window.confirm(t('sheet_delete_db_confirm', { name: building.nombre_obra }))) return;
  try { await deleteBuilding(building.id, state.sessionToken); state.OBRAS = state.OBRAS.filter((item) => item !== building); cerrarFicha(); actualizarFuenteMapa(); generarFiltrosUI(); document.dispatchEvent(new CustomEvent('radar:buildings-changed')); } catch (error) { showNeoToast(error.message || t('toast_error_generic')); }
}

async function reviewBuildingFromSheet(status) {
  const building = getSelectedBuilding();
  if (!building || !esRolAdmin(state.userRole)) return;
  const isApprove = status === 'publicada';
  const actionLabel = isApprove ? 'aprobar y publicar en el mapa' : 'rechazar';
  if (!window.confirm(`¿Deseas ${actionLabel} la obra "${building.nombre_obra}"?`)) return;
  try {
    await reviewBuilding(building.id, status, state.sessionToken);
    building.estado_revision = status;
    const itemInState = state.OBRAS.find((item) => String(item.id) === String(building.id));
    if (itemInState) itemInState.estado_revision = status;
    actualizarFuenteMapa();
    showNeoToast(isApprove ? 'Obra aprobada y publicada en el catálogo.' : 'Obra rechazada.');
    const coords = building.coordenadas || [0, 0];
    abrirFicha(building, coords, building.featureId);
  } catch (error) {
    showNeoToast(error.message || t('toast_error_generic'));
  }
}

function iniciarModoMoverObra(obra) {
  if (!state.map || !obra) return;

  cerrarFicha();

  const canvas = state.map.getCanvas();
  canvas.style.cursor = 'crosshair';

  const banner = document.createElement('div');
  banner.id = 'nolli-move-banner';
  banner.style.cssText = `
    position: fixed;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: #181818;
    color: #fff;
    padding: 10px 20px;
    border-radius: 999px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    z-index: 99999;
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
  `;
  banner.innerHTML = `
    <span>Haz clic en el mapa para recolocar <strong>${escapeHtml(obra.nombre_obra)}</strong></span>
    <button type="button" id="btn-cancel-move-obra" style="background:none; border:1px solid #555; color:#eee; border-radius:999px; padding:4px 10px; cursor:pointer; font-size:12px;">Cancelar</button>
  `;
  document.body.appendChild(banner);

  function limpiarModo() {
    canvas.style.cursor = '';
    state.map.off('click', onMapClick);
    window.removeEventListener('keydown', onEscape);
    banner.remove();
  }

  function onEscape(e) {
    if (e.key === 'Escape') limpiarModo();
  }

  async function onMapClick(e) {
    const nuevaLng = Number(e.lngLat.lng.toFixed(6));
    const nuevaLat = Number(e.lngLat.lat.toFixed(6));

    const confirmar = window.confirm(
      `¿Mover "${obra.nombre_obra}" a las nuevas coordenadas?\n\nLatitud: ${nuevaLat}\nLongitud: ${nuevaLng}`
    );

    if (!confirmar) {
      limpiarModo();
      return;
    }

    try {
      if (typeof updateBuilding === 'function') {
        await updateBuilding(obra.id, { latitud: nuevaLat, longitud: nuevaLng }, state.sessionToken);
      }

      obra.coordenadas = [nuevaLng, nuevaLat];
      obra.latitud = nuevaLat;
      obra.longitud = nuevaLng;

      const obraEnState = state.OBRAS.find((o) => String(o.id) === String(obra.id));
      if (obraEnState) {
        obraEnState.coordenadas = [nuevaLng, nuevaLat];
        obraEnState.latitud = nuevaLat;
        obraEnState.longitud = nuevaLng;
      }

      actualizarFuenteMapa();
      showNeoToast('Ubicación actualizada correctamente.');
      state.map.flyTo({ center: [nuevaLng, nuevaLat], zoom: Math.max(state.map.getZoom(), 16) });
      abrirFicha(obra, [nuevaLng, nuevaLat], obra.featureId);
    } catch (err) {
      console.error('Error al actualizar coordenadas:', err);
      showNeoToast('Error al guardar la nueva ubicación.');
    } finally {
      limpiarModo();
    }
  }

  state.map.once('click', onMapClick);
  window.addEventListener('keydown', onEscape);
  banner.querySelector('#btn-cancel-move-obra')?.addEventListener('click', limpiarModo);
}

function openShareModal() {
  const building = getSelectedBuilding();
  const modal = document.getElementById('modal-share');
  if (!modal) return;

  const subtitle = document.getElementById('share-project-subtitle');
  if (subtitle) {
    if (building) {
      const arq = building.arquitectos ? (Array.isArray(building.arquitectos) ? building.arquitectos.join(', ') : building.arquitectos) : (building.arquitecto || '');
      subtitle.textContent = `${building.nombre_obra} ${arq ? `· ${arq}` : ''}`;
    } else {
      subtitle.textContent = t('share_subtitle_default');
    }
  }

  const copyBtn = document.getElementById('btn-share-copy');
  const copyText = document.getElementById('share-copy-text');
  if (copyBtn) copyBtn.classList.remove('copied');
  if (copyText) copyText.textContent = t('share_copy_link');

  modal.classList.add('open');
  window.lucide?.createIcons({ context: sheet });
}

async function copiarAlPortapapeles(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.warn('Fallo al copiar con Clipboard API, probando fallback execCommand:', e);
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (successful) return true;
  } catch (err) {
    console.warn('Fallo al copiar con execCommand:', err);
  }

  try {
    window.prompt(t('toast_link_copied'), text);
    return true;
  } catch (err) {
    console.error('No se pudo abrir prompt de copia manual:', err);
    return false;
  }
}

async function handleShareAction(choice) {
  const building = getSelectedBuilding();
  if (!building) return;

  const origin = window.location.origin;
  const shareId = building.id || building.featureId;
  const prefix = getUrlPrefix();
  const shareUrl = `${origin}${prefix}/obra/${encodeURIComponent(shareId)}`;
  const [lng, lat] = building.coordenadas || [0, 0];
  const arq = building.arquitectos ? (Array.isArray(building.arquitectos) ? building.arquitectos.join(', ') : building.arquitectos) : (building.arquitecto || '');

  const notificarCopiado = (exito) => {
    const copyBtn = document.getElementById('btn-share-copy');
    const copyText = document.getElementById('share-copy-text');
    if (!copyBtn || !copyText) return;
    if (exito) {
      copyBtn.classList.add('copied');
      copyText.textContent = t('share_copied');
    } else {
      copyText.textContent = t('share_copy_error');
    }
    setTimeout(() => {
      copyBtn.classList.remove('copied');
      copyText.textContent = t('share_copy_link');
    }, 2000);
  };

  if (choice === 'whatsapp') {
    const text = `${building.nombre_obra}${arq ? `\n${arq}` : ''}\nVer en Nolli: ${shareUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  } else if (choice === 'google') {
    const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    window.open(gmapsUrl, '_blank');
  } else if (choice === 'native') {
    if (navigator.share) {
      navigator.share({
        title: building.nombre_obra,
        text: `${building.nombre_obra} - Nolli`,
        url: shareUrl
      }).catch(() => {});
    } else {
      const copiado = await copiarAlPortapapeles(shareUrl);
      notificarCopiado(copiado);
    }
  } else if (choice === 'copy') {
    const copiado = await copiarAlPortapapeles(shareUrl);
    notificarCopiado(copiado);
  }
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (target.closest('[data-save-collection]')) { openOrganizer('collections'); return; }
  if (target.closest('[data-add-private-tag]')) { openOrganizer('labels'); return; }
  if (target.closest('#btn-organizer-new-list') || target.closest('#btn-organizer-empty-new-list')) { abrirModalCrearLista(); return; }
  if (target.closest('#btn-personal-organizer-close') || target === document.getElementById('modal-personal-organizer')) { closeOrganizer(); return; }
  if (target.closest('#btn-personal-create')) { createOrganizerItem(); return; }
  if (target.closest('#btn-personal-organizer-save')) { saveOrganizerSelection(); return; }
  if (target.closest('[data-delete-private]')) { deletePrivate(); return; }
  if (target.closest('[data-delete-building]')) { deleteBuildingFromSheet(); return; }
  if (target.closest('[data-move-building]')) { const building = getSelectedBuilding(); if (building) iniciarModoMoverObra(building); return; }
  if (target.closest('[data-review-building]')) { reviewBuildingFromSheet(target.closest('[data-review-building]').dataset.reviewBuilding); return; }
  const noteToggle = target.closest('[data-note-toggle]');
  if (noteToggle) { noteToggle.nextElementSibling.classList.toggle('open'); noteToggle.textContent = noteToggle.nextElementSibling.classList.contains('open') ? t('sheet_hide_note') : t('sheet_add_private_note'); return; }
  const rating = target.closest('[data-rating]');
  if (rating) { saveStatus('valoracion', Number(rating.dataset.rating)); rating.parentElement.querySelectorAll('[data-rating]').forEach((star) => star.classList.toggle('active', Number(star.dataset.rating) <= Number(rating.dataset.rating))); return; }
  const status = target.closest('[data-status]');
  if (status) {
    const building = getSelectedBuilding();
    const statusKey = status.dataset.status;
    const isCurrentlyActive = status.classList.contains('active') ||
      status.classList.contains(statusKey) ||
      Boolean(state.buildingStatuses?.get(String(building?.id))?.[statusKey]);
    saveStatus(statusKey, !isCurrentlyActive);
    return;
  }
  if (target.closest('[data-save-personal]')) { saveNote(target.closest('[data-save-personal]')); return; }
  const architect = target.closest('.architect-filter');
  if (architect) { abrirFichaArquitecto(architect.dataset.arq); return; }
  const btnFilterArq = target.closest('#btn-filter-architect-on-map');
  if (btnFilterArq) {
    const arqName = document.getElementById('architect-profile-name')?.textContent?.trim();
    if (arqName) {
      cerrarFichaArquitecto();
      cerrarFicha();
      const slug = arqName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      addFilterChip({
        id: `arq-${slug}`,
        type: 'architect',
        label: arqName,
        value: arqName,
        color: 'var(--accent, #E84E1B)',
      });
      const mapNavBtn = document.getElementById('mobile-nav-map');
      if (mapNavBtn) {
        document.querySelectorAll('.mobile-nav-btn').forEach((b) => b.classList.remove('active'));
        mapNavBtn.classList.add('active');
      }
    }
    return;
  }
  if (target.closest('#btn-architect-close') || target === document.getElementById('modal-architect')) { cerrarFichaArquitecto(); return; }
  const architectWork = target.closest('[data-architect-work-id]');
  if (architectWork) {
    const obra = state.OBRAS.find((item) => String(item.featureId) === String(architectWork.dataset.architectWorkId));
    if (obra) {
      cerrarFichaArquitecto();
      if (state.map) state.map.flyTo({ center: obra.coordenadas, zoom: Math.max(state.map.getZoom(), 15) });
      abrirFicha(obra, obra.coordenadas, obra.featureId);
    }
    return;
  }
  if (target.closest('[data-open-report]')) { const building = getSelectedBuilding(); if (building) { document.getElementById('report-project-name').textContent = building.nombre_obra; document.getElementById('modal-report').classList.add('open'); } return; }
  if (target.closest('[data-share-action]')) { openShareModal(); return; }
  const shareChoiceBtn = target.closest('[data-share-choice]');
  if (shareChoiceBtn) {
    handleShareAction(shareChoiceBtn.dataset.shareChoice);
    return;
  }
  if (target.closest('[data-photo-url]')) { const viewer = document.getElementById('modal-photo'); document.getElementById('photo-viewer-image').src = target.closest('[data-photo-url]').dataset.photoUrl; viewer.classList.add('open'); return; }
  if (target.closest('#btn-share-close') || target === document.getElementById('modal-share')) document.getElementById('modal-share').classList.remove('open');
  if (target.closest('#btn-photo-close') || target === document.getElementById('modal-photo')) document.getElementById('modal-photo').classList.remove('open');
});

function guardarEstadoPersonalLocal() {
  if (!state.userId) return;
  try {
    localStorage.setItem(`nolli:building-status:${state.userId}`, JSON.stringify([...state.buildingStatuses.entries()]));
  } catch {}
}

document.addEventListener('radar:admin-login', actualizarFichaAbierta);
document.addEventListener('radar:user-login', actualizarFichaAbierta);
document.addEventListener('radar:user-session-ready', actualizarFichaAbierta);
document.addEventListener('radar:admin-mode-change', actualizarFichaAbierta);
document.addEventListener('radar:logout', actualizarFichaAbierta);
document.addEventListener('radar:user-status-ready', actualizarFichaAbierta);
document.addEventListener('radar:user-collections-changed', () => renderSheetStatusUI());
document.addEventListener('radar:user-private-labels-changed', () => renderSheetStatusUI());
document.addEventListener('radar:user-status-changed', () => renderSheetStatusUI());
document.addEventListener('radar:open-building', (event) => { if (event.detail?.obra) abrirFicha(event.detail.obra, event.detail.obra.coordenadas, event.detail.obra.featureId); });
function actualizarFichaAbierta() { const building = getSelectedBuilding(); if (building) abrirFicha(building, building.coordenadas, building.featureId); }