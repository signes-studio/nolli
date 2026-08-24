/* =========================================================================
   SHEETUI.JS — Ficha técnica (bottom sheet)
   ========================================================================= */

import { state } from './state.js';
import { actualizarFuenteMapa } from './mapData.js';
import { cerrarFiltros, generarFiltrosUI, aplicarFiltrosMapa } from './filtersUI.js';

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
    <div class="data-row"><div class="label">[ARQUITECTO]</div><div class="value accent">${architectButtons}</div></div>
    <div class="data-row"><div class="label">[AÑO]</div><div class="value">${p.año_construccion}</div></div>
    ${p.añadido_por ? `<div class="data-row"><div class="label">[AÑADIDO POR]</div><div class="value">${p.añadido_por}</div></div>` : ''}
    <div class="data-row"><div class="label">[CATEGORÍA]</div><div class="value">${p.categoria || 'otro'}</div></div>
    <div class="data-row"><div class="label">[VISITABLE]</div><div class="value">${p.visitable === true || p.visitable === 1 || p.visitable === 'true' ? 'SÍ' : 'NO'}</div></div>
    <div class="data-row"><div class="label">[COORD]</div><div class="value">${c[0].toFixed(5)}, ${c[1].toFixed(5)}</div></div>
  `;
  const editButton = document.getElementById('btn-edit-building');
  editButton.classList.toggle('hidden', !state.sessionToken);
  sheet.classList.add('open');
  cerrarFiltros();
}

document.addEventListener('click', (e) => {
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

document.addEventListener('radar:admin-login', () => {
  if (state.selectedFeatureId !== null) document.getElementById('btn-edit-building').classList.remove('hidden');
});

document.addEventListener('click', (e) => {
  if (e.target.closest('#btn-sheet-close')) {
    e.stopPropagation();
    cerrarFicha();
  }
});

document.addEventListener('radar:cerrar-ficha', cerrarFicha);
