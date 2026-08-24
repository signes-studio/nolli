/* =========================================================================
   SHEETUI.JS — Ficha técnica (bottom sheet)
   ========================================================================= */

import { state } from './state.js';
import { actualizarFuenteMapa } from './mapData.js';
import { cerrarFiltros } from './filtersUI.js';

const sheet = document.getElementById('sheet');

export function cerrarFicha() {
  sheet.classList.remove('open');
  document.getElementById('btn-edit-building').classList.add('hidden');
  if (state.selectedFeatureId !== null) {
    const obraAnterior = state.OBRAS.find((o) => String(o.id) === String(state.selectedFeatureId));
    if (obraAnterior) obraAnterior.selected = false;
    actualizarFuenteMapa();
    state.selectedFeatureId = null;
  }
}

export function abrirFicha(p, c, featureId = p.id) {
  const clickedId = featureId;

  if (state.selectedFeatureId !== null) {
    const obraAnterior = state.OBRAS.find((o) => String(o.id) === String(state.selectedFeatureId));
    if (obraAnterior) obraAnterior.selected = false;
    actualizarFuenteMapa();
  }

  state.selectedFeatureId = clickedId;
  const obraNueva = state.OBRAS.find((o) => String(o.id) === String(state.selectedFeatureId));
  if (obraNueva) obraNueva.selected = true;
  actualizarFuenteMapa();

  document.getElementById('sheet-title').innerHTML = p.nombre_obra;
  document.getElementById('sheet-body').innerHTML = `
    <div class="data-row"><div class="label">[ARQUITECTO]</div><div class="value accent">${p.arquitecto}</div></div>
    <div class="data-row"><div class="label">[AÑO]</div><div class="value">${p.año_construccion}</div></div>
    <div class="data-row"><div class="label">[COORD]</div><div class="value">${c[0].toFixed(5)}, ${c[1].toFixed(5)}</div></div>
  `;
  const editButton = document.getElementById('btn-edit-building');
  editButton.classList.toggle('hidden', !state.sessionToken);
  sheet.classList.add('open');
  cerrarFiltros();
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#btn-edit-building') || !state.selectedFeatureId) return;
  const obra = state.OBRAS.find((o) => String(o.id) === String(state.selectedFeatureId));
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
