/* =========================================================================
   SHEETUI.JS — Ficha técnica (bottom sheet)
   ========================================================================= */

import { state, separarArquitectos, esRolAdmin, guardarZonaPersonalLocal } from './state.js';
import { actualizarFuenteMapa } from './mapData.js';
import { cerrarFiltros, generarFiltrosUI, aplicarFiltrosMapa } from './filtersUI.js';
import { saveBuildingStatus, deleteBuilding, deletePrivateBuilding, createUserCollection, addUserCollectionItem, createUserPrivateLabel, deleteUserPrivateLabel } from './api.js';

const sheet = document.getElementById('sheet');
let personalOrganizerMode = 'collections';

export function cerrarFicha() {
  sheet.classList.remove('open');
  document.getElementById('sheet-header-actions').innerHTML = '';
  if (state.selectedFeatureId !== null) {
    const previous = state.OBRAS.find((obra) => String(obra.featureId) === String(state.selectedFeatureId));
    if (previous) previous.selected = false;
    actualizarFuenteMapa();
    state.selectedFeatureId = null;
  }
}

export function abrirFicha(p, coordinates, featureId = p.id) {
  if (state.selectedFeatureId !== null) {
    const previous = state.OBRAS.find((obra) => String(obra.featureId) === String(state.selectedFeatureId));
    if (previous) previous.selected = false;
    actualizarFuenteMapa();
  }
  state.selectedFeatureId = featureId;
  const obra = state.OBRAS.find((item) => String(item.featureId) === String(featureId));
  if (obra) obra.selected = true;
  actualizarFuenteMapa();

  const architects = (Array.isArray(p.arquitectos) ? p.arquitectos : separarArquitectos(p.arquitecto))
    .map((architect) => `<button type="button" class="architect-filter" data-arq="${architect}">${architect}</button>`).join(', ');
  const adminActive = esRolAdmin(state.userRole) && state.adminMode;
  document.getElementById('sheet-title').textContent = p.nombre_obra;
  document.getElementById('sheet-body').innerHTML = `
    ${p.foto_url ? `<button type="button" class="photo-thumb" data-photo-url="${p.foto_url}" aria-label="Ampliar fotografía"><img class="sheet-photo" src="${p.foto_url}" alt="Fotografía de ${p.nombre_obra}" loading="lazy"></button>` : ''}
    ${p.enlace_url ? `<div class="sheet-link"><a href="${p.enlace_url}" target="_blank" rel="noopener noreferrer">ABRIR ENLACE DEL PROYECTO</a></div>` : ''}
    <div class="data-row"><div class="label">[ARQUITECTO]</div><div class="value accent">${architects}</div></div>
    <div class="data-row"><div class="label">[AÑO]</div><div class="value">${p.año_construccion || '-'}</div></div>
    <div class="data-row"><div class="label">[CATEGORÍA]</div><div class="value">${p.categoria || 'otro'}</div></div>
    <div class="data-row"><div class="label">[ACCESO]</div><div class="value">${formatAccess(p.estado_acceso || (p.visitable ? 'publico' : 'privado'))}</div></div>
    <div class="data-row"><div class="label">[COORD]</div><div class="value">${coordinates[0].toFixed(5)}, ${coordinates[1].toFixed(5)}</div></div>
    ${state.sessionToken ? `<div class="personal-notes"><div class="rating-stars">${[1, 2, 3, 4, 5].map((value) => `<button type="button" class="rating-star ${getStatus('valoracion') >= value ? 'active' : ''}" data-rating="${value}" aria-label="Valorar ${value} de 5">★</button>`).join('')}</div><button type="button" class="btn note-toggle" data-note-toggle>AÑADIR NOTA</button><div class="personal-note-editor" data-note-editor><label for="building-notes">NOTA PRIVADA</label><textarea id="building-notes" class="tech-input" rows="3" placeholder="Escribe una nota privada..."></textarea><button type="button" class="btn save-personal-status" data-save-personal>GUARDAR NOTA</button></div></div>` : ''}
    ${state.sessionToken && !adminActive ? '<button type="button" class="report-link" data-open-report>¿Ves un error en esta ficha?</button>' : ''}
  `;
  const canDeletePrivate = Boolean(obra?.private && state.userId && String(obra.user_id) === String(state.userId));
  document.getElementById('sheet-header-actions').innerHTML = `<button type="button" class="sheet-action-button" data-share-action="open">COMPARTIR</button>${state.sessionToken ? '<button type="button" class="sheet-action-button" data-save-collection>GUARDAR EN LISTA</button><button type="button" class="sheet-action-button" data-add-private-tag>ETIQUETA PRIVADA</button>' : ''}${adminActive ? '<button type="button" class="sheet-action-button admin-only-action" data-edit-building>EDITAR</button><button type="button" class="sheet-action-button admin-delete-action" data-delete-building>ELIMINAR</button>' : ''}${canDeletePrivate ? '<button type="button" class="sheet-action-button private-delete-action" data-delete-private>ELIMINAR</button>' : ''}${state.sessionToken ? `<button type="button" class="sheet-action-button ${getStatus('favorite') ? 'active favorite' : ''}" data-status="favorite">FAVORITO</button><button type="button" class="sheet-action-button ${getStatus('visited') ? 'active visited' : ''}" data-status="visited">VISITADO</button>` : ''}`;
  sheet.classList.add('open');
  cerrarFiltros();
  const notes = document.getElementById('building-notes');
  if (notes) {
    notes.value = state.buildingStatuses.get(String(obra?.id || p.id))?.notas || '';
    if (notes.value) notes.closest('[data-note-editor]').classList.add('open');
  }
}

function formatAccess(value) { return { publico: 'PÚBLICO', exterior_visible: 'EXTERIOR VISIBLE', con_reserva: 'CON RESERVA', privado: 'PRIVADO', cerrado_temporalmente: 'CERRADO TEMPORALMENTE', desaparecido: 'DESAPARECIDO' }[value] || value; }
function getSelectedBuilding() { return state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId)); }
function getStatus(status) { const obra = getSelectedBuilding(); return obra ? state.buildingStatuses.get(String(obra.id))?.[status] || false : false; }

function renderOrganizerOptions(obra, mode) {
  if (mode === 'collections') return state.userCollections.length ? state.userCollections.map((collection) => {
    const checked = state.userCollectionItems.some((item) => String(item.collection_id) === String(collection.id) && String(item.building_id) === String(obra.id));
    return `<label class="personal-organizer-option"><input type="checkbox" value="${collection.id}" ${checked ? 'checked' : ''}><span>${collection.name}</span></label>`;
  }).join('') : '<div class="nearby-empty">Todavía no tienes listas. Crea la primera abajo.</div>';
  const labels = [...new Set(state.userPrivateLabels.map((item) => item.label).filter(Boolean))];
  return labels.length ? labels.map((label) => {
    const checked = state.userPrivateLabels.some((item) => String(item.building_id) === String(obra.id) && String(item.label).toLowerCase() === String(label).toLowerCase());
    return `<label class="personal-organizer-option"><input type="checkbox" value="${label}" ${checked ? 'checked' : ''}><span>#${label}</span></label>`;
  }).join('') : '<div class="nearby-empty">Todavía no tienes etiquetas. Crea la primera abajo.</div>';
}

function abrirOrganizadorPersonal(mode) {
  const obra = getSelectedBuilding();
  if (!obra || !state.userId || !state.sessionToken) { alert('Inicia sesión para organizar tus obras.'); return; }
  personalOrganizerMode = mode;
  document.getElementById('personal-organizer-title').textContent = mode === 'collections' ? 'GUARDAR EN LISTAS' : 'AÑADIR ETIQUETAS';
  document.getElementById('personal-organizer-project').textContent = obra.nombre_obra;
  document.getElementById('personal-organizer-help').textContent = mode === 'collections' ? 'Selecciona una o varias listas. Una obra puede estar en varias listas.' : 'Selecciona una o varias etiquetas. Solo tú puedes verlas.';
  document.getElementById('personal-new-name').placeholder = mode === 'collections' ? 'NOMBRE DE NUEVA LISTA' : 'NUEVA ETIQUETA';
  document.getElementById('personal-organizer-options').innerHTML = renderOrganizerOptions(obra, mode);
  document.getElementById('personal-organizer-error').classList.add('hidden');
  document.getElementById('modal-personal-organizer').classList.add('open');
}

async function crearElementoPersonal() {
  const obra = getSelectedBuilding();
  const input = document.getElementById('personal-new-name');
  const name = String(input.value || '').trim();
  if (!obra || !name) return;
  try {
    if (personalOrganizerMode === 'collections') {
      const created = await createUserCollection({ id: `COL-${Date.now()}`, user_id: state.userId, name }, state.sessionToken);
      if (!created[0]?.id) throw new Error('No se pudo crear la lista.');
      state.userCollections.push(created[0]);
    } else if (!state.userPrivateLabels.some((item) => String(item.building_id) === String(obra.id) && String(item.label).toLowerCase() === name.toLowerCase())) {
      const created = await createUserPrivateLabel({ user_id: state.userId, building_id: obra.id, label: name }, state.sessionToken);
      if (created[0]) state.userPrivateLabels.push(created[0]);
    }
    input.value = '';
    guardarZonaPersonalLocal(state.userId);
    abrirOrganizadorPersonal(personalOrganizerMode);
  } catch (error) {
    const errorElement = document.getElementById('personal-organizer-error'); errorElement.textContent = error.message; errorElement.classList.remove('hidden');
  }
}

async function guardarSeleccionPersonal() {
  const obra = getSelectedBuilding();
  if (!obra) return;
  const selected = [...document.querySelectorAll('#personal-organizer-options input:checked')].map((input) => input.value);
  try {
    if (personalOrganizerMode === 'collections') {
      const current = state.userCollectionItems.filter((item) => String(item.building_id) === String(obra.id));
      for (const collection of state.userCollections) {
        const existing = current.find((item) => String(item.collection_id) === String(collection.id));
        if (selected.includes(String(collection.id)) && !existing) {
          const saved = await addUserCollectionItem({ id: `CLI-${Date.now()}-${collection.id}`, user_id: state.userId, collection_id: collection.id, building_id: obra.id }, state.sessionToken);
          if (saved[0]) state.userCollectionItems.push(saved[0]);
        } else if (!selected.includes(String(collection.id)) && existing) {
          state.userCollectionItems = state.userCollectionItems.filter((item) => item !== existing);
        }
      }
    } else {
      const current = state.userPrivateLabels.filter((item) => String(item.building_id) === String(obra.id));
      const allLabels = [...new Set(state.userPrivateLabels.map((item) => item.label).filter(Boolean))];
      for (const label of allLabels) {
        const existing = current.find((item) => String(item.label).toLowerCase() === String(label).toLowerCase());
        if (selected.includes(label) && !existing) {
          const created = await createUserPrivateLabel({ user_id: state.userId, building_id: obra.id, label }, state.sessionToken);
          if (created[0]) state.userPrivateLabels.push(created[0]);
        } else if (!selected.includes(label) && existing) {
          await deleteUserPrivateLabel(existing.id, state.userId, state.sessionToken);
          state.userPrivateLabels = state.userPrivateLabels.filter((item) => item !== existing);
        }
      }
    }
    guardarZonaPersonalLocal(state.userId); cerrarOrganizadorPersonal();
    document.dispatchEvent(new CustomEvent(personalOrganizerMode === 'collections' ? 'radar:user-collections-changed' : 'radar:user-private-labels-changed'));
  } catch (error) { const errorElement = document.getElementById('personal-organizer-error'); errorElement.textContent = error.message; errorElement.classList.remove('hidden'); }
}
function cerrarOrganizadorPersonal() { document.getElementById('modal-personal-organizer').classList.remove('open'); }

async function saveStatus(status, value) {
  const obra = getSelectedBuilding(); if (!obra || !state.userId || !state.sessionToken) return;
  const key = String(obra.id); const previous = state.buildingStatuses.get(key) || { favorite: false, visited: false };
  const next = { ...previous, [status]: value }; state.buildingStatuses.set(key, next); actualizarFuenteMapa();
  try { await saveBuildingStatus(state.userId, obra.id, next, state.sessionToken); document.dispatchEvent(new CustomEvent('radar:user-status-changed')); }
  catch (error) { state.buildingStatuses.set(key, previous); abrirFicha(obra, obra.coordenadas, obra.featureId); alert(error.message); }
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (target.closest('[data-save-collection]')) { abrirOrganizadorPersonal('collections'); return; }
  if (target.closest('[data-add-private-tag]')) { abrirOrganizadorPersonal('labels'); return; }
  if (target.closest('#btn-personal-organizer-close') || target === document.getElementById('modal-personal-organizer')) { cerrarOrganizadorPersonal(); return; }
  if (target.closest('#btn-personal-create')) { crearElementoPersonal(); return; }
  if (target.closest('#btn-personal-organizer-save')) { guardarSeleccionPersonal(); return; }
  if (target.closest('[data-delete-private]')) { eliminarPrivada(); return; }
  if (target.closest('[data-delete-building]')) { eliminarEdificio(); return; }
  const noteToggle = target.closest('[data-note-toggle]');
  if (noteToggle) { noteToggle.nextElementSibling.classList.toggle('open'); noteToggle.textContent = noteToggle.nextElementSibling.classList.contains('open') ? 'OCULTAR NOTA' : 'AÑADIR NOTA'; return; }
  const rating = target.closest('[data-rating]');
  if (rating) { saveStatus('valoracion', Number(rating.dataset.rating)); rating.parentElement.querySelectorAll('[data-rating]').forEach((star) => star.classList.toggle('active', Number(star.dataset.rating) <= Number(rating.dataset.rating))); return; }
  const status = target.closest('[data-status]');
  if (status) { const obra = getSelectedBuilding(); saveStatus(status.dataset.status, !state.buildingStatuses.get(String(obra?.id))?.[status.dataset.status]); return; }
  if (target.closest('[data-save-personal]')) { guardarNota(target.closest('[data-save-personal]')); return; }
  const architect = target.closest('.architect-filter');
  if (architect) { state.activeArquitectos = state.activeArquitectos.size === 1 && state.activeArquitectos.has(architect.dataset.arq) ? new Set(state.ARQUITECTOS) : new Set([architect.dataset.arq]); generarFiltrosUI(); aplicarFiltrosMapa(); return; }
  if (target.closest('[data-open-report]')) { const obra = getSelectedBuilding(); if (obra) { document.getElementById('report-project-name').textContent = obra.nombre_obra; document.getElementById('modal-report').classList.add('open'); } return; }
  if (target.closest('[data-share-action]')) { document.getElementById('modal-share').classList.add('open'); return; }
  if (target.closest('[data-photo-url]')) { const viewer = document.getElementById('modal-photo'); document.getElementById('photo-viewer-image').src = target.closest('[data-photo-url]').dataset.photoUrl; viewer.classList.add('open'); return; }
  if (target.closest('#btn-share-close') || target === document.getElementById('modal-share')) document.getElementById('modal-share').classList.remove('open');
  if (target.closest('#btn-photo-close') || target === document.getElementById('modal-photo')) document.getElementById('modal-photo').classList.remove('open');
  if (target.closest('#btn-edit-building')) { const obra = getSelectedBuilding(); if (obra) document.dispatchEvent(new CustomEvent('radar:edit-building', { detail: { obra } })); }
});

async function guardarNota(button) {
  const obra = getSelectedBuilding(); if (!obra || !state.userId || !state.sessionToken) return;
  const key = String(obra.id); const current = state.buildingStatuses.get(key) || { favorite: false, visited: false };
  const next = { ...current, notas: document.getElementById('building-notes').value, valoracion: current.valoracion || null };
  state.buildingStatuses.set(key, next); button.disabled = true; button.textContent = 'GUARDANDO...';
  try { await saveBuildingStatus(state.userId, obra.id, next, state.sessionToken); button.textContent = 'GUARDADO'; document.dispatchEvent(new CustomEvent('radar:user-status-changed')); } catch (error) { state.buildingStatuses.set(key, current); button.textContent = 'REINTENTAR'; alert(error.message); } finally { button.disabled = false; }
}

async function eliminarPrivada() {
  const obra = getSelectedBuilding(); if (!obra?.private || !state.userId || String(obra.user_id) !== String(state.userId) || !window.confirm(`¿Eliminar "${obra.nombre_obra}" de tus chinchetas privadas?`)) return;
  try { await deletePrivateBuilding(obra.id, state.userId, state.sessionToken); state.OBRAS = state.OBRAS.filter((item) => item !== obra); state.privateBuildings = state.privateBuildings.filter((item) => item !== obra); cerrarFicha(); actualizarFuenteMapa(); } catch (error) { alert(error.message); }
}
async function eliminarEdificio() {
  const obra = getSelectedBuilding(); if (!obra || !esRolAdmin(state.userRole) || !state.adminMode || !window.confirm(`¿Eliminar "${obra.nombre_obra}"?`)) return;
  try { await deleteBuilding(obra.id, state.sessionToken); state.OBRAS = state.OBRAS.filter((item) => item !== obra); cerrarFicha(); actualizarFuenteMapa(); generarFiltrosUI(); document.dispatchEvent(new CustomEvent('radar:buildings-changed')); } catch (error) { alert(error.message); }
}

document.addEventListener('radar:admin-login', actualizarFichaAbierta);
document.addEventListener('radar:admin-mode-change', actualizarFichaAbierta);
document.addEventListener('radar:logout', actualizarFichaAbierta);
document.addEventListener('radar:open-building', (event) => { if (event.detail?.obra) abrirFicha(event.detail.obra, event.detail.obra.coordenadas, event.detail.obra.featureId); });
document.addEventListener('radar:user-status-ready', actualizarFichaAbierta);
function actualizarFichaAbierta() { const obra = getSelectedBuilding(); if (obra) abrirFicha(obra, obra.coordenadas, obra.featureId); }
