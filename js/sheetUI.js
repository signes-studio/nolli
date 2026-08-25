/* =========================================================================
   SHEETUI.JS — Ficha técnica (bottom sheet)
   ========================================================================= */

import { state, separarArquitectos, esRolAdmin, guardarZonaPersonalLocal } from './state.js';
import { actualizarFuenteMapa } from './mapData.js';
import { cerrarFiltros, generarFiltrosUI, aplicarFiltrosMapa } from './filtersUI.js';
import { saveBuildingStatus, deleteBuilding, deletePrivateBuilding, createUserCollection, addUserCollectionItem, createUserPrivateLabel } from './api.js';

const sheet = document.getElementById('sheet');

export function cerrarFicha() {
  sheet.classList.remove('open');
  document.getElementById('sheet-header-actions').innerHTML = '';
  if (state.selectedFeatureId !== null) {
      const obraAnterior = state.OBRAS.find((o) => String(o.featureId) === String(state.selectedFeatureId));
    if (obraAnterior) obraAnterior.selected = false;
    actualizarFuenteMapa();
    state.selectedFeatureId = null;
  }
}

export function abrirFicha(p, c, featureId = p.id) {
  const clickedId = featureId;
  const arquitectos = Array.isArray(p.arquitectos)
    ? p.arquitectos
    : separarArquitectos(p.arquitecto);
  const architectButtons = arquitectos.map((arq) => (
    `<button type="button" class="architect-filter" data-arq="${arq}">${arq}</button>`
  )).join(', ');

  if (state.selectedFeatureId !== null) {
      const obraAnterior = state.OBRAS.find((o) => String(o.featureId) === String(state.selectedFeatureId));
    if (obraAnterior) obraAnterior.selected = false;
    actualizarFuenteMapa();
  }

  state.selectedFeatureId = clickedId;
  const obraNueva = state.OBRAS.find((o) => String(o.featureId) === String(state.selectedFeatureId));
  if (obraNueva) obraNueva.selected = true;
  actualizarFuenteMapa();
  const adminActivo = esRolAdmin(state.userRole) && state.adminMode;

  document.getElementById('sheet-title').innerHTML = p.nombre_obra;
  document.getElementById('sheet-body').innerHTML = `
    ${p.foto_url ? `<button type="button" class="photo-thumb" data-photo-url="${p.foto_url}" aria-label="Ampliar fotografía"><img class="sheet-photo" src="${p.foto_url}" alt="Fotografía de ${p.nombre_obra}" loading="lazy"></button>` : ''}
    ${p.enlace_url ? `<div class="sheet-link"><a href="${p.enlace_url}" target="_blank" rel="noopener noreferrer">ABRIR ENLACE DEL PROYECTO</a></div>` : ''}
    <div class="data-row"><div class="label">[ARQUITECTO]</div><div class="value accent">${architectButtons}</div></div>
    <div class="data-row"><div class="label">[AÑO]</div><div class="value">${p.año_construccion}</div></div>
    <div class="data-row"><div class="label">[CATEGORÍA]</div><div class="value">${p.categoria || 'otro'}</div></div>
    <div class="data-row"><div class="label">[ACCESO]</div><div class="value">${formatearAcceso(p.estado_acceso || (p.visitable ? 'publico' : 'privado'))}</div></div>
    <div class="data-row"><div class="label">[COORD]</div><div class="value">${c[0].toFixed(5)}, ${c[1].toFixed(5)}</div></div>
    <div class="personal-notes">${state.sessionToken ? `<div class="rating-row"><div class="rating-stars">${[1, 2, 3, 4, 5].map((value) => `<button type="button" class="rating-star ${estadoObra('valoracion') >= value ? 'active' : ''}" data-rating="${value}" aria-label="Valorar ${value} de 5">★</button>`).join('')}</div></div><button type="button" class="btn note-toggle" data-note-toggle>AÑADIR NOTA</button><div class="personal-note-editor" data-note-editor><label for="building-notes">NOTA PRIVADA</label><textarea id="building-notes" class="tech-input" rows="3" placeholder="Escribe una nota privada..."></textarea><button type="button" class="btn save-personal-status" data-save-personal>GUARDAR NOTA</button></div>` : ''}</div>
    ${state.sessionToken && !adminActivo ? '<button type="button" class="report-link" data-open-report>¿Ves un error en esta ficha?</button>' : ''}
  `;
  const canDeletePrivate = Boolean(obraNueva?.private && state.userId && String(obraNueva.user_id) === String(state.userId));
  document.getElementById('sheet-header-actions').innerHTML = `<button type="button" class="sheet-action-button" data-share-action="open">COMPARTIR</button>${state.sessionToken ? '<button type="button" class="sheet-action-button" data-save-collection>GUARDAR EN LISTA</button><button type="button" class="sheet-action-button" data-add-private-tag>ETIQUETA PRIVADA</button>' : ''}${adminActivo ? '<button type="button" id="btn-edit-building" class="sheet-action-button admin-only-action" data-edit-building>EDITAR</button><button type="button" class="sheet-action-button admin-delete-action" data-delete-building>ELIMINAR</button>' : ''}${canDeletePrivate ? '<button type="button" class="sheet-action-button private-delete-action" data-delete-private>ELIMINAR</button>' : ''}${state.sessionToken ? `<button type="button" class="sheet-action-button ${estadoObra('favorite') ? 'active favorite' : ''}" data-status="favorite">FAVORITO</button><button type="button" class="sheet-action-button ${estadoObra('visited') ? 'active visited' : ''}" data-status="visited">VISITADO</button>` : ''}`;
  sheet.classList.add('open');
  cerrarFiltros();
  const personal = state.buildingStatuses.get(String(obraNueva?.id || p.id)) || {};
  const notes = document.getElementById('building-notes');
  const rating = document.getElementById('building-rating');
  if (notes) notes.value = personal.notas || '';
  if (notes && personal.notas) notes.closest('[data-note-editor]').classList.add('open');
}

function formatearAcceso(value) {
  return { publico: 'PÚBLICO', exterior_visible: 'EXTERIOR VISIBLE', con_reserva: 'CON RESERVA', privado: 'PRIVADO', cerrado_temporalmente: 'CERRADO TEMPORALMENTE', desaparecido: 'DESAPARECIDO' }[value] || value;
}

function estadoObra(status) {
  const obra = state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId));
  return obra ? state.buildingStatuses.get(String(obra.id))?.[status] || false : false;
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-open-report]')) {
    const obra = state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId));
    if (!obra) return;
    document.getElementById('report-project-name').textContent = obra.nombre_obra;
    document.getElementById('report-description').value = '';
    document.getElementById('report-error').classList.add('hidden');
    document.getElementById('modal-report').classList.add('open');
    return;
  }
  if (e.target.closest('[data-delete-private]')) {
    eliminarChinchetaPrivada();
    return;
  }
  if (e.target.closest('[data-delete-building]')) {
    eliminarEdificioSeleccionado();
    return;
  }
  if (e.target.closest('[data-save-collection]')) {
    guardarObraEnColeccion();
    return;
  }
  if (e.target.closest('[data-add-private-tag]')) {
    agregarEtiquetaPrivada();
    return;
  }
  const noteToggle = e.target.closest('[data-note-toggle]');
  if (noteToggle) {
    noteToggle.nextElementSibling.classList.toggle('open');
    noteToggle.textContent = noteToggle.nextElementSibling.classList.contains('open') ? 'OCULTAR NOTA' : 'AÑADIR NOTA';
    return;
  }
  const ratingStar = e.target.closest('[data-rating]');
  if (ratingStar) {
    const obra = state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId));
    if (!obra || !state.userId || !state.sessionToken) return;
    const key = String(obra.id);
    const current = state.buildingStatuses.get(key) || { favorite: false, visited: false };
    const status = { ...current, valoracion: Number(ratingStar.dataset.rating) };
    state.buildingStatuses.set(key, status);
    ratingStar.parentElement.querySelectorAll('[data-rating]').forEach((star) => star.classList.toggle('active', Number(star.dataset.rating) <= status.valoracion));
    saveBuildingStatus(state.userId, obra.id, status, state.sessionToken).catch(() => alert('No se pudo guardar la valoración.'));
    return;
  }
  const photoThumb = e.target.closest('[data-photo-url]');
  if (photoThumb) {
    const viewer = document.getElementById('modal-photo');
    const image = document.getElementById('photo-viewer-image');
    image.src = photoThumb.dataset.photoUrl;
    image.alt = document.getElementById('sheet-title').textContent;
    viewer.classList.add('open');
    return;
  }
  if (e.target.closest('#btn-photo-close') || e.target === document.getElementById('modal-photo')) {
    document.getElementById('modal-photo').classList.remove('open');
    return;
  }
  const shareButton = e.target.closest('[data-share-action]');
  if (shareButton) {
    document.getElementById('modal-share').classList.add('open');
    return;
  }
  const shareChoice = e.target.closest('[data-share-choice]');
  if (shareChoice) compartirEn(shareChoice.dataset.shareChoice);
  if (e.target.closest('#btn-share-close') || e.target === document.getElementById('modal-share')) {
    document.getElementById('modal-share').classList.remove('open');
  }
  const statusButton = e.target.closest('[data-status]');
  if (statusButton) {
    const obra = state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId));
    if (!obra || !state.userId || !state.sessionToken) return;
    const key = String(obra.id);
    const current = state.buildingStatuses.get(key) || { favorite: false, visited: false };
    const status = { ...current, [statusButton.dataset.status]: !current[statusButton.dataset.status] };
    state.buildingStatuses.set(key, status);
    statusButton.classList.toggle('active', status[statusButton.dataset.status]);
    if (statusButton.dataset.status === 'visited') statusButton.classList.toggle('visited', status.visited);
    actualizarFuenteMapa();
    document.dispatchEvent(new CustomEvent('radar:user-status-changed'));
    saveBuildingStatus(state.userId, obra.id, status, state.sessionToken).catch(() => {
      state.buildingStatuses.set(key, current);
      abrirFicha(obra, obra.coordenadas, obra.featureId);
      alert('No se pudo guardar el cambio.');
    });
    return;
  }
  if (e.target.closest('[data-save-personal]')) {
    const saveButton = e.target.closest('[data-save-personal]');
    const obra = state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId));
    if (!obra || !state.userId || !state.sessionToken) {
      alert('Inicia sesión para guardar notas.');
      return;
    }
    const key = String(obra.id);
    const current = state.buildingStatuses.get(key) || { favorite: false, visited: false };
    const status = { ...current, notas: document.getElementById('building-notes').value, valoracion: current.valoracion || null };
    state.buildingStatuses.set(key, status);
    saveButton.textContent = 'GUARDANDO...';
    saveButton.disabled = true;
    saveBuildingStatus(state.userId, obra.id, status, state.sessionToken).then(() => {
      saveButton.textContent = 'GUARDADO';
      document.dispatchEvent(new CustomEvent('radar:user-status-changed'));
    }).catch((error) => {
      state.buildingStatuses.set(key, current);
      saveButton.textContent = 'REINTENTAR';
      alert(error.message);
    }).finally(() => { saveButton.disabled = false; });
    return;
  }
  const architectButton = e.target.closest('.architect-filter');
  if (architectButton) {
    const architect = architectButton.dataset.arq;
    const isAlreadyIsolated = state.activeArquitectos.size === 1
      && state.activeArquitectos.has(architect);
    state.activeArquitectos = isAlreadyIsolated
      ? new Set(state.ARQUITECTOS)
      : new Set([architect]);
    generarFiltrosUI();
    aplicarFiltrosMapa();
    return;
  }
  if (!e.target.closest('#btn-edit-building') || state.selectedFeatureId === null) return;
    const obra = state.OBRAS.find((o) => String(o.featureId) === String(state.selectedFeatureId));
  if (obra) document.dispatchEvent(new CustomEvent('radar:edit-building', { detail: { obra } }));
});

async function eliminarChinchetaPrivada() {
  const obra = state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId));
  if (!obra || !obra.private || !state.userId || String(obra.user_id) !== String(state.userId)) return;
  if (!window.confirm(`¿Eliminar "${obra.nombre_obra}" de tus chinchetas privadas?`)) return;
  try {
    await deletePrivateBuilding(obra.id, state.userId, state.sessionToken);
    state.OBRAS = state.OBRAS.filter((item) => item !== obra);
    state.privateBuildings = state.privateBuildings.filter((item) => item !== obra);
    cerrarFicha();
    actualizarFuenteMapa();
  } catch (error) {
    alert(error.message);
  }
}

async function guardarObraEnColeccion() {
  const obra = state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId));
  if (!obra || !state.userId || !state.sessionToken) {
    alert('Inicia sesión para guardar en tus listas.');
    return;
  }
  const proposed = window.prompt('Nombre de la lista (ej: Viaje a Japón, Verano 2026):');
  const collectionName = String(proposed || '').trim();
  if (!collectionName) return;

  const existingCollection = state.userCollections.find((collection) => String(collection.name).toLowerCase() === collectionName.toLowerCase());
  let collectionId = existingCollection?.id;

  try {
    if (!collectionId) {
      const created = await createUserCollection({ id: `COL-${Date.now()}`, user_id: state.userId, name: collectionName }, state.sessionToken);
      const inserted = created[0];
      if (!inserted?.id) throw new Error('No se pudo crear la lista personal.');
      state.userCollections.push(inserted);
      collectionId = inserted.id;
    }
    const alreadySaved = state.userCollectionItems.some((item) => String(item.collection_id) === String(collectionId) && String(item.building_id) === String(obra.id));
    if (alreadySaved) {
      alert(`La obra ya está en "${collectionName}".`);
      return;
    }
    const saved = await addUserCollectionItem({ id: `CLI-${Date.now()}`, user_id: state.userId, collection_id: collectionId, building_id: obra.id }, state.sessionToken);
    if (saved[0]) state.userCollectionItems.push(saved[0]);
    document.dispatchEvent(new CustomEvent('radar:user-collections-changed'));
    alert(`Guardado en "${collectionName}".`);
  } catch (error) {
    if (!collectionId) {
      collectionId = `COL-${Date.now()}`;
      state.userCollections.push({ id: collectionId, user_id: state.userId, name: collectionName, created_at: new Date().toISOString() });
    }
    const alreadySaved = state.userCollectionItems.some((item) => String(item.collection_id) === String(collectionId) && String(item.building_id) === String(obra.id));
    if (alreadySaved) {
      alert(`La obra ya está en "${collectionName}".`);
      return;
    }
    state.userCollectionItems.push({
      id: `CLI-${Date.now()}`,
      user_id: state.userId,
      collection_id: collectionId,
      building_id: obra.id,
      created_at: new Date().toISOString(),
    });
    guardarZonaPersonalLocal(state.userId);
    document.dispatchEvent(new CustomEvent('radar:user-collections-changed'));
    alert(`Guardado en "${collectionName}" (modo local temporal).`);
  }
}

async function agregarEtiquetaPrivada() {
  const obra = state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId));
  if (!obra || !state.userId || !state.sessionToken) {
    alert('Inicia sesión para etiquetar.');
    return;
  }
  const proposed = window.prompt('Escribe una etiqueta privada (ej: viaje-japon, verano-2026):');
  const label = String(proposed || '').trim();
  if (!label) return;
  try {
    const inserted = await createUserPrivateLabel({ id: `LBL-${Date.now()}`, user_id: state.userId, building_id: obra.id, label }, state.sessionToken);
    if (inserted[0]) state.userPrivateLabels.unshift(inserted[0]);
    document.dispatchEvent(new CustomEvent('radar:user-private-labels-changed'));
    alert(`Etiqueta privada "${label}" guardada.`);
  } catch (error) {
    state.userPrivateLabels.unshift({
      id: `LBL-${Date.now()}`,
      user_id: state.userId,
      building_id: obra.id,
      label,
      created_at: new Date().toISOString(),
    });
    guardarZonaPersonalLocal(state.userId);
    document.dispatchEvent(new CustomEvent('radar:user-private-labels-changed'));
    alert(`Etiqueta privada "${label}" guardada (modo local temporal).`);
  }
}

async function eliminarEdificioSeleccionado() {
  const obra = state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId));
  if (!obra || !esRolAdmin(state.userRole) || !state.adminMode || !window.confirm(`¿Eliminar "${obra.nombre_obra}"?`)) return;
  try {
    await deleteBuilding(obra.id, state.sessionToken);
    state.OBRAS = state.OBRAS.filter((item) => String(item.id) !== String(obra.id));
    state.ARQUITECTOS = [...new Set(state.OBRAS.flatMap((item) => item.arquitectos || separarArquitectos(item.arquitecto)))];
    state.activeArquitectos = new Set([...state.activeArquitectos].filter((architect) => state.ARQUITECTOS.includes(architect)));
    state.buildingStatuses.delete(String(obra.id));
    cerrarFicha();
    actualizarFuenteMapa();
    generarFiltrosUI();
    document.dispatchEvent(new CustomEvent('radar:buildings-changed'));
  } catch (error) {
    alert(error.message);
  }
}

function crearEnlaceGoogleMaps() {
  const obra = state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId));
  if (!obra) return null;
  const [longitude, latitude] = obra.coordenadas;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

function compartirEn(choice) {
  const shareUrl = crearEnlaceGoogleMaps();
  if (!shareUrl) return;
  const title = document.getElementById('sheet-title').textContent;
  const text = `${title} — ubicación en Nolli`;
  if (choice === 'native' && navigator.share) {
    navigator.share({ title, text, url: shareUrl }).catch(() => {});
  } else if (choice === 'whatsapp') {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}: ${shareUrl}`)}`, '_blank', 'noopener,noreferrer');
  } else if (choice === 'google') {
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  } else if (choice === 'copy') {
    navigator.clipboard?.writeText(shareUrl).then(() => alert('Enlace copiado.'));
  } else {
    alert('El menú de compartir no está disponible en este dispositivo.');
  }
  document.getElementById('modal-share').classList.remove('open');
}

document.addEventListener('radar:admin-login', () => {
  actualizarFichaAbierta();
});

document.addEventListener('radar:logout', () => {
  actualizarFichaAbierta();
});

document.addEventListener('radar:admin-mode-change', actualizarFichaAbierta);

document.addEventListener('radar:open-building', (event) => {
  const obra = event.detail?.obra;
  if (obra) abrirFicha(obra, obra.coordenadas, obra.featureId);
});

function actualizarFichaAbierta() {
  if (state.selectedFeatureId === null) return;
  const obra = state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId));
  if (obra) abrirFicha(obra, obra.coordenadas, obra.featureId);
}

document.addEventListener('radar:user-status-ready', () => {
  if (state.selectedFeatureId !== null) {
    const obra = state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId));
    if (obra) abrirFicha(obra, obra.coordenadas, obra.featureId);
  }
});

document.addEventListener('click', (e) => {
  if (e.target.closest('#btn-sheet-close')) {
    e.stopPropagation();
    cerrarFicha();
  }
});

document.addEventListener('radar:cerrar-ficha', cerrarFicha);
