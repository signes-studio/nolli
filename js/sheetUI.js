/* =========================================================================
   SHEETUI.JS — Ficha técnica (bottom sheet)
   ========================================================================= */

import { state } from './state.js';
import { actualizarFuenteMapa } from './mapData.js';
import { cerrarFiltros, generarFiltrosUI, aplicarFiltrosMapa } from './filtersUI.js';
import { saveBuildingStatus } from './api.js';

const sheet = document.getElementById('sheet');

export function cerrarFicha() {
  sheet.classList.remove('open');
  document.getElementById('btn-edit-building').classList.add('hidden');
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
    : String(p.arquitecto || '').split(',').map((nombre) => nombre.trim()).filter(Boolean);
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

  document.getElementById('sheet-title').innerHTML = p.nombre_obra;
  document.getElementById('sheet-body').innerHTML = `
    ${p.foto_url ? `<img class="sheet-photo" src="${p.foto_url}" alt="Fotografía de ${p.nombre_obra}" loading="lazy">` : ''}
    ${p.enlace_url ? `<div class="sheet-link"><a href="${p.enlace_url}" target="_blank" rel="noopener noreferrer">ABRIR ENLACE DEL PROYECTO</a></div>` : ''}
    <div class="data-row"><div class="label">[ARQUITECTO]</div><div class="value accent">${architectButtons}</div></div>
    <div class="data-row"><div class="label">[AÑO]</div><div class="value">${p.año_construccion}</div></div>
    <div class="data-row"><div class="label">[CATEGORÍA]</div><div class="value">${p.categoria || 'otro'}</div></div>
    <div class="data-row"><div class="label">[ACCESO]</div><div class="value">${formatearAcceso(p.estado_acceso || (p.visitable ? 'publico' : 'privado'))}</div></div>
    <div class="data-row"><div class="label">[COORD]</div><div class="value">${c[0].toFixed(5)}, ${c[1].toFixed(5)}</div></div>
    <div class="sheet-actions share-actions">
      <button type="button" class="status-button" data-share-action="open">COMPARTIR</button>
    </div>
    ${state.sessionToken ? `<div class="sheet-actions"><button type="button" class="status-button ${estadoObra('favorite') ? 'active' : ''}" data-status="favorite">FAVORITO</button><button type="button" class="status-button ${estadoObra('visited') ? 'active visited' : ''}" data-status="visited">VISITADO</button></div><div class="personal-notes"><label for="building-notes">NOTAS PRIVADAS</label><textarea id="building-notes" class="tech-input" rows="3" placeholder="Escribe una nota privada..."></textarea><label for="building-rating">VALORACIÓN PERSONAL</label><select id="building-rating" class="tech-input"><option value="">SIN VALORAR</option><option value="1">1 / 5</option><option value="2">2 / 5</option><option value="3">3 / 5</option><option value="4">4 / 5</option><option value="5">5 / 5</option></select><button type="button" class="btn save-personal-status" data-save-personal>GUARDAR NOTAS</button></div>` : ''}
  `;
  const editButton = document.getElementById('btn-edit-building');
  editButton.classList.toggle('hidden', state.userRole !== 'admin');
  sheet.classList.add('open');
  cerrarFiltros();
  const personal = state.buildingStatuses.get(String(obraNueva?.id || p.id)) || {};
  const notes = document.getElementById('building-notes');
  const rating = document.getElementById('building-rating');
  if (notes) notes.value = personal.notas || '';
  if (rating) rating.value = personal.valoracion || '';
}

function formatearAcceso(value) {
  return { publico: 'PÚBLICO', exterior_visible: 'EXTERIOR VISIBLE', con_reserva: 'CON RESERVA', privado: 'PRIVADO', cerrado_temporalmente: 'CERRADO TEMPORALMENTE', desaparecido: 'DESAPARECIDO' }[value] || value;
}

function estadoObra(status) {
  const obra = state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId));
  return obra ? state.buildingStatuses.get(String(obra.id))?.[status] === true : false;
}

document.addEventListener('click', (e) => {
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
  const statusButton = e.target.closest('.status-button');
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
    const obra = state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId));
    if (!obra || !state.userId || !state.sessionToken) return;
    const key = String(obra.id);
    const current = state.buildingStatuses.get(key) || { favorite: false, visited: false };
    const status = { ...current, notas: document.getElementById('building-notes').value, valoracion: Number(document.getElementById('building-rating').value) || null };
    state.buildingStatuses.set(key, status);
    saveBuildingStatus(state.userId, obra.id, status, state.sessionToken).catch(() => alert('No se pudieron guardar tus notas.'));
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
  if (!e.target.closest('#btn-edit-building') || !state.selectedFeatureId) return;
    const obra = state.OBRAS.find((o) => String(o.featureId) === String(state.selectedFeatureId));
  if (obra) document.dispatchEvent(new CustomEvent('radar:edit-building', { detail: { obra } }));
});

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
  if (state.selectedFeatureId !== null) document.getElementById('btn-edit-building').classList.remove('hidden');
});

document.addEventListener('radar:logout', () => {
  document.getElementById('btn-edit-building').classList.add('hidden');
});

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
