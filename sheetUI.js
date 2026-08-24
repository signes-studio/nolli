/* =========================================================================
   SHEETUI.JS — Ficha técnica (bottom sheet) de la obra seleccionada
   ========================================================================= */

import { state } from './state.js';
import { actualizarFuenteMapa } from './mapData.js';
import { cerrarFiltros } from './filtersUI.js';

const sheet = document.getElementById('sheet');

/** Cierra la ficha y limpia el resaltado del punto seleccionado en el mapa. */
export function cerrarFicha() {
  sheet.classList.remove('open');
  if (state.selectedFeatureId !== null) {
    const obraAnterior = state.OBRAS.find((o) => o.id === state.selectedFeatureId);
    if (obraAnterior) obraAnterior.selected = false;
    actualizarFuenteMapa();
    state.selectedFeatureId = null;
  }
}

/** Abre la ficha técnica para la obra `p` con coordenadas `c`. */
export function abrirFicha(p, c) {
  const clickedId = p.id;

  if (state.selectedFeatureId !== null) {
    const obraAnterior = state.OBRAS.find((o) => o.id === state.selectedFeatureId);
    if (obraAnterior) obraAnterior.selected = false;
  }

  state.selectedFeatureId = clickedId;
  const obraNueva = state.OBRAS.find((o) => o.id === state.selectedFeatureId);
  if (obraNueva) obraNueva.selected = true;

  actualizarFuenteMapa();

  document.getElementById('sheet-title').innerHTML = p.nombre_obra;
  document.getElementById('sheet-body').innerHTML = `
    <div class="data-row"><div class="label">[ARQUITECTO]</div><div class="value accent">${p.arquitecto}</div></div>
    <div class="data-row"><div class="label">[AÑO]</div><div class="value">${p.año_construccion}</div></div>
    <div class="data-row"><div class="label">[COORD]</div><div class="value">${c[0].toFixed(5)}, ${c[1].toFixed(5)}</div></div>
  `;
  sheet.classList.add('open');

  cerrarFiltros();
}

function initSheetUI() {
  document.getElementById('btn-sheet-close').addEventListener('click', cerrarFicha);
  // Permite que otros módulos (p. ej. filtersUI) pidan cerrar la ficha sin
  // crear una dependencia circular directa.
  document.addEventListener('radar:cerrar-ficha', cerrarFicha);
}

initSheetUI();
