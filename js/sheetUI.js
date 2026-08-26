/* =========================================================================
   SHEETUI.JS - Ficha tecnica y acciones personales de una obra
   ========================================================================= */

import { state, separarArquitectos, normalizarCategoria, nombreCategoria, esRolAdmin, guardarZonaPersonalLocal } from './state.js';
import { actualizarFuenteMapa } from './mapData.js';
import { cerrarFiltros, generarFiltrosUI } from './filtersUI.js';
import { fetchBuildings, saveBuildingStatus, deleteBuilding, deletePrivateBuilding, createUserCollection, addUserCollectionItem, createUserPrivateLabel, deleteUserPrivateLabel } from './api.js';

const sheet = document.getElementById('sheet');
let organizerMode = 'collections';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

async function abrirFichaArquitecto(nombreArquitecto) {
  const modal = document.getElementById('modal-architect');
  const works = document.getElementById('architect-profile-works');
  document.getElementById('architect-profile-name').textContent = nombreArquitecto;
  document.getElementById('architect-profile-count').textContent = 'CARGANDO OBRAS...';
  works.innerHTML = '<p class="architect-profile-empty">Consultando todas las obras...</p>';
  modal.classList.add('open');

  let obras;
  try {
    const filas = await fetchBuildings({ architect: nombreArquitecto, includeAllImportance: true });
    obras = filas.map((fila, index) => ({
      id: fila.id,
      featureId: String(fila.id ?? `obra-${index}`),
      nombre_obra: fila.nombre_obra,
      foto_url: fila.foto_url || null,
      enlace_url: fila.enlace_url || null,
      arquitecto: fila.arquitecto,
      arquitectos: separarArquitectos(fila.arquitecto),
      año_construccion: fila.año_construccion,
      importancia: Number(fila.importancia) || 1,
      categoria: normalizarCategoria(fila.categoria),
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
    document.getElementById('architect-profile-count').textContent = 'ERROR DE CARGA';
    works.innerHTML = '<p class="architect-profile-empty">No se pudieron cargar las obras.</p>';
    return;
  }

  obras = obras
    .sort((first, second) => Number(second.año_construccion || 0) - Number(first.año_construccion || 0)
      || String(first.nombre_obra || '').localeCompare(String(second.nombre_obra || ''), 'es'));
  document.getElementById('architect-profile-count').textContent = `${obras.length} ${obras.length === 1 ? 'OBRA REGISTRADA' : 'OBRAS REGISTRADAS'}`;
  works.innerHTML = obras.length ? obras.map((obra) => `
    <button type="button" class="architect-work-item" data-architect-work-id="${escapeHtml(obra.featureId)}">
      <span class="architect-work-year">${escapeHtml(obra.año_construccion || '----')}</span>
      <span class="architect-work-info"><strong>${escapeHtml(obra.nombre_obra)}</strong><small>${escapeHtml(obra.categoria || 'otro').toUpperCase()}</small></span>
    </button>
  `).join('') : '<p class="architect-profile-empty">No hay obras registradas para este arquitecto.</p>';
}

function cerrarFichaArquitecto() {
  document.getElementById('modal-architect').classList.remove('open');
}

document.getElementById('btn-sheet-close').addEventListener('click', (event) => {
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
}

export function abrirFicha(building, coordinates, featureId = building.id) {
  if (state.selectedFeatureId !== null) {
    const previous = getSelectedBuilding();
    if (previous) previous.selected = false;
  }
  state.selectedFeatureId = featureId;
  const selected = getSelectedBuilding();
  if (selected) selected.selected = true;
  actualizarFuenteMapa();

  const architects = (Array.isArray(building.arquitectos) ? building.arquitectos : separarArquitectos(building.arquitecto))
    .map((architect) => `<button type="button" class="architect-filter" data-arq="${architect}">${architect}</button>`).join(', ');
  const adminActive = esRolAdmin(state.userRole) && state.adminMode;
  document.getElementById('sheet-title').textContent = building.nombre_obra;
  document.getElementById('sheet-body').innerHTML = `
    ${building.foto_url ? `<button type="button" class="photo-thumb" data-photo-url="${building.foto_url}" aria-label="Ampliar fotografia"><img class="sheet-photo" src="${building.foto_url}" alt="Fotografia de ${building.nombre_obra}" loading="lazy"></button>` : ''}
    ${building.enlace_url ? `<div class="sheet-link"><a href="${building.enlace_url}" target="_blank" rel="noopener noreferrer">ABRIR ENLACE DEL PROYECTO</a></div>` : ''}
    <div class="data-row"><div class="label">[ARQUITECTO]</div><div class="value accent">${architects}</div></div>
    <div class="data-row"><div class="label">[ANO]</div><div class="value">${building.año_construccion || '-'}</div></div>
    <div class="data-row"><div class="label">[CATEGORIA]</div><div class="value">${nombreCategoria(building.categoria)}</div></div>
    <div class="data-row"><div class="label">[ACCESO]</div><div class="value">${formatAccess(building.estado_acceso || (building.visitable ? 'publico' : 'privado'))}</div></div>
    <div class="data-row"><div class="label">[COORD]</div><div class="value">${coordinates[0].toFixed(5)}, ${coordinates[1].toFixed(5)}</div></div>
    ${state.sessionToken ? `<div class="personal-notes"><div class="rating-stars">${[1, 2, 3, 4, 5].map((value) => `<button type="button" class="rating-star ${getStatus('valoracion') >= value ? 'active' : ''}" data-rating="${value}" aria-label="Valorar ${value} de 5">&#9733;</button>`).join('')}</div><button type="button" class="btn note-toggle" data-note-toggle>ANADIR NOTA</button><div class="personal-note-editor" data-note-editor><label for="building-notes">NOTA PRIVADA</label><textarea id="building-notes" class="tech-input" rows="3" placeholder="Escribe una nota privada..."></textarea><button type="button" class="btn save-personal-status" data-save-personal>GUARDAR NOTA</button></div></div>` : ''}
    ${state.sessionToken && !adminActive ? '<button type="button" class="report-link" data-open-report>¿Ves un error en esta ficha?</button>' : ''}
  `;
  const canDeletePrivate = Boolean(selected?.private && state.userId && String(selected.user_id) === String(state.userId));
  document.getElementById('sheet-header-actions').innerHTML = `<button type="button" class="sheet-action-button" data-share-action="open">COMPARTIR</button>${state.sessionToken ? '<button type="button" class="sheet-action-button" data-save-collection>GUARDAR EN LISTA</button><button type="button" class="sheet-action-button" data-add-private-tag>ETIQUETA PRIVADA</button>' : ''}${adminActive ? '<button type="button" class="sheet-action-button admin-only-action" data-edit-building>EDITAR</button><button type="button" class="sheet-action-button admin-delete-action" data-delete-building>ELIMINAR</button>' : ''}${canDeletePrivate ? '<button type="button" class="sheet-action-button private-delete-action" data-delete-private>ELIMINAR</button>' : ''}${state.sessionToken ? `<button type="button" class="sheet-action-button ${getStatus('favorite') ? 'active favorite' : ''}" data-status="favorite">FAVORITO</button><button type="button" class="sheet-action-button ${getStatus('visited') ? 'active visited' : ''}" data-status="visited">VISITADO</button>` : ''}`;
  const editButton = document.querySelector('#sheet-header-actions [data-edit-building]');
  if (editButton) editButton.addEventListener('click', (event) => {
    event.stopPropagation();
    document.dispatchEvent(new CustomEvent('radar:edit-building', { detail: { obra: selected } }));
  });
  sheet.classList.add('open');
  cerrarFiltros();
  const notes = document.getElementById('building-notes');
  if (notes) {
    notes.value = state.buildingStatuses.get(String(selected?.id || building.id))?.notas || '';
    if (notes.value) notes.closest('[data-note-editor]').classList.add('open');
  }
}

function formatAccess(value) { return { publico: 'PUBLICO', exterior_visible: 'EXTERIOR VISIBLE', con_reserva: 'CON RESERVA', privado: 'PRIVADO', cerrado_temporalmente: 'CERRADO TEMPORALMENTE', desaparecido: 'DESAPARECIDO' }[value] || value; }
function getSelectedBuilding() { return state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId)); }
function getStatus(status) { const building = getSelectedBuilding(); return building ? state.buildingStatuses.get(String(building.id))?.[status] || false : false; }
function closeOrganizer() { document.getElementById('modal-personal-organizer').classList.remove('open'); }

function organizerOptions(building, mode) {
  if (mode === 'collections') return state.userCollections.length ? state.userCollections.map((collection) => {
    const checked = state.userCollectionItems.some((item) => String(item.collection_id) === String(collection.id) && String(item.building_id) === String(building.id));
    return `<label class="personal-organizer-option"><input type="checkbox" value="${collection.id}" ${checked ? 'checked' : ''}><span>${collection.name}</span></label>`;
  }).join('') : '<div class="nearby-empty">Todavia no tienes listas. Crea la primera abajo.</div>';
  const labels = [...new Set(state.userPrivateLabels.map((item) => item.label).filter(Boolean))];
  return labels.length ? labels.map((label) => {
    const checked = state.userPrivateLabels.some((item) => String(item.building_id) === String(building.id) && String(item.label).toLowerCase() === String(label).toLowerCase());
    return `<label class="personal-organizer-option"><input type="checkbox" value="${label}" ${checked ? 'checked' : ''}><span>#${label}</span></label>`;
  }).join('') : '<div class="nearby-empty">Todavia no tienes etiquetas. Crea la primera abajo.</div>';
}

function openOrganizer(mode) {
  const building = getSelectedBuilding();
  if (!building || !state.userId || !state.sessionToken) { alert('Inicia sesion para organizar tus obras.'); return; }
  organizerMode = mode;
  document.getElementById('personal-organizer-title').textContent = mode === 'collections' ? 'GUARDAR EN LISTAS' : 'ANADIR ETIQUETAS';
  document.getElementById('personal-organizer-project').textContent = building.nombre_obra;
  document.getElementById('personal-organizer-help').textContent = mode === 'collections' ? 'Selecciona una o varias listas. Una obra puede estar en varias listas.' : 'Selecciona una o varias etiquetas. Solo tu puedes verlas.';
  document.getElementById('personal-new-name').placeholder = mode === 'collections' ? 'NOMBRE DE NUEVA LISTA' : 'NUEVA ETIQUETA';
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
      const created = await createUserCollection({ id: `COL-${Date.now()}`, user_id: state.userId, name }, state.sessionToken);
      if (!created[0]?.id) throw new Error('No se pudo crear la lista.');
      state.userCollections.push(created[0]);
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
          const saved = await addUserCollectionItem({ id: `CLI-${Date.now()}-${collection.id}`, user_id: state.userId, collection_id: collection.id, building_id: building.id }, state.sessionToken);
          if (saved[0]) state.userCollectionItems.push(saved[0]);
        } else if (!selected.includes(String(collection.id)) && existing) {
          state.userCollectionItems = state.userCollectionItems.filter((item) => item !== existing);
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
    document.dispatchEvent(new CustomEvent(organizerMode === 'collections' ? 'radar:user-collections-changed' : 'radar:user-private-labels-changed'));
  } catch (error) {
    const errorElement = document.getElementById('personal-organizer-error'); errorElement.textContent = error.message; errorElement.classList.remove('hidden');
  }
}

async function saveStatus(status, value) {
  const building = getSelectedBuilding();
  if (!building || !state.userId || !state.sessionToken) return;
  const key = String(building.id);
  const previous = state.buildingStatuses.get(key) || { favorite: false, visited: false };
  const next = { ...previous, [status]: value };
  state.buildingStatuses.set(key, next);
  actualizarFuenteMapa();
  try { await saveBuildingStatus(state.userId, building.id, next, state.sessionToken); document.dispatchEvent(new CustomEvent('radar:user-status-changed')); }
  catch (error) { guardarEstadoPersonalLocal(); document.dispatchEvent(new CustomEvent('radar:user-status-changed')); }
}

async function saveNote(button) {
  const building = getSelectedBuilding();
  if (!building || !state.userId || !state.sessionToken) return;
  const key = String(building.id);
  const previous = state.buildingStatuses.get(key) || { favorite: false, visited: false };
  const next = { ...previous, notas: document.getElementById('building-notes').value, valoracion: previous.valoracion || null };
  state.buildingStatuses.set(key, next);
  button.disabled = true;
  button.textContent = 'GUARDANDO...';
  try { await saveBuildingStatus(state.userId, building.id, next, state.sessionToken); button.textContent = 'GUARDADO'; document.dispatchEvent(new CustomEvent('radar:user-status-changed')); }
  catch (error) { guardarEstadoPersonalLocal(); button.textContent = 'GUARDADO LOCALMENTE'; document.dispatchEvent(new CustomEvent('radar:user-status-changed')); }
  finally { button.disabled = false; }
}

async function deletePrivate() {
  const building = getSelectedBuilding();
  if (!building?.private || !state.userId || String(building.user_id) !== String(state.userId) || !window.confirm(`¿Eliminar "${building.nombre_obra}" de tus chinchetas privadas?`)) return;
  try { await deletePrivateBuilding(building.id, state.userId, state.sessionToken); state.OBRAS = state.OBRAS.filter((item) => item !== building); state.privateBuildings = state.privateBuildings.filter((item) => item !== building); cerrarFicha(); actualizarFuenteMapa(); } catch (error) { alert(error.message); }
}

async function deleteBuildingFromSheet() {
  const building = getSelectedBuilding();
  if (!building || !esRolAdmin(state.userRole) || !state.adminMode || !window.confirm(`¿Eliminar "${building.nombre_obra}"?`)) return;
  try { await deleteBuilding(building.id, state.sessionToken); state.OBRAS = state.OBRAS.filter((item) => item !== building); cerrarFicha(); actualizarFuenteMapa(); generarFiltrosUI(); document.dispatchEvent(new CustomEvent('radar:buildings-changed')); } catch (error) { alert(error.message); }
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (target.closest('[data-save-collection]')) { openOrganizer('collections'); return; }
  if (target.closest('[data-add-private-tag]')) { openOrganizer('labels'); return; }
  if (target.closest('#btn-personal-organizer-close') || target === document.getElementById('modal-personal-organizer')) { closeOrganizer(); return; }
  if (target.closest('#btn-personal-create')) { createOrganizerItem(); return; }
  if (target.closest('#btn-personal-organizer-save')) { saveOrganizerSelection(); return; }
  if (target.closest('[data-delete-private]')) { deletePrivate(); return; }
  if (target.closest('[data-delete-building]')) { deleteBuildingFromSheet(); return; }
  const noteToggle = target.closest('[data-note-toggle]');
  if (noteToggle) { noteToggle.nextElementSibling.classList.toggle('open'); noteToggle.textContent = noteToggle.nextElementSibling.classList.contains('open') ? 'OCULTAR NOTA' : 'ANADIR NOTA'; return; }
  const rating = target.closest('[data-rating]');
  if (rating) { saveStatus('valoracion', Number(rating.dataset.rating)); rating.parentElement.querySelectorAll('[data-rating]').forEach((star) => star.classList.toggle('active', Number(star.dataset.rating) <= Number(rating.dataset.rating))); return; }
  const status = target.closest('[data-status]');
  if (status) { const building = getSelectedBuilding(); saveStatus(status.dataset.status, !state.buildingStatuses.get(String(building?.id))?.[status.dataset.status]); return; }
  if (target.closest('[data-save-personal]')) { saveNote(target.closest('[data-save-personal]')); return; }
  const architect = target.closest('.architect-filter');
  if (architect) { abrirFichaArquitecto(architect.dataset.arq); return; }
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
  if (target.closest('[data-share-action]')) { document.getElementById('modal-share').classList.add('open'); return; }
  if (target.closest('[data-photo-url]')) { const viewer = document.getElementById('modal-photo'); document.getElementById('photo-viewer-image').src = target.closest('[data-photo-url]').dataset.photoUrl; viewer.classList.add('open'); return; }
  if (target.closest('#btn-share-close') || target === document.getElementById('modal-share')) document.getElementById('modal-share').classList.remove('open');
  if (target.closest('#btn-photo-close') || target === document.getElementById('modal-photo')) document.getElementById('modal-photo').classList.remove('open');
});

function guardarEstadoPersonalLocal() {
  if (!state.userId) return;
  localStorage.setItem(`nolli:building-status:${state.userId}`, JSON.stringify([...state.buildingStatuses.entries()]));
}

document.addEventListener('radar:admin-login', actualizarFichaAbierta);
document.addEventListener('radar:admin-mode-change', actualizarFichaAbierta);
document.addEventListener('radar:logout', actualizarFichaAbierta);
document.addEventListener('radar:user-status-ready', actualizarFichaAbierta);
document.addEventListener('radar:open-building', (event) => { if (event.detail?.obra) abrirFicha(event.detail.obra, event.detail.obra.coordenadas, event.detail.obra.featureId); });
function actualizarFichaAbierta() { const building = getSelectedBuilding(); if (building) abrirFicha(building, building.coordenadas, building.featureId); }
