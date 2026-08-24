/* =========================================================================
   FILTERSUI.JS — Panel de filtros por arquitecto
   ========================================================================= */

import { state } from './state.js';

const filterPanel = document.getElementById('filter-panel');
const btnFilters = document.getElementById('btn-filters');
const filterSwitches = document.getElementById('filter-switches');

/** Regenera los interruptores de filtro a partir de state.ARQUITECTOS. */
export function generarFiltrosUI() {
  filterSwitches.innerHTML = '';
  state.ARQUITECTOS.forEach((arq) => {
    if (!arq) return;
    const row = document.createElement('div');
    row.className = 'switch-row';
    row.innerHTML = `
      <span style="text-transform: uppercase;">${arq}</span>
      <div class="tech-switch">
        <input type="checkbox" checked data-arq="${arq}">
        <div class="track"></div>
        <div class="thumb"></div>
      </div>
    `;
    filterSwitches.appendChild(row);
  });
}

/** Cierra el panel de filtros (usado, p. ej., al abrir la ficha técnica). */
export function cerrarFiltros() {
  filterPanel.classList.remove('open');
  btnFilters.classList.remove('active-state');
}

function initFiltersUI() {
  filterSwitches.addEventListener('change', (e) => {
    if (e.target.type !== 'checkbox') return;
    const arq = e.target.dataset.arq;
    if (e.target.checked) state.activeArquitectos.add(arq);
    else state.activeArquitectos.delete(arq);

    if (state.map && state.map.getLayer('obras-layer')) {
      state.map.setFilter('obras-layer', [
        'in', ['get', 'arquitecto'], ['literal', [...state.activeArquitectos]],
      ]);
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-filters-close')) cerrarFiltros();
  });

  btnFilters.addEventListener('click', () => {
    filterPanel.classList.toggle('open');
    btnFilters.classList.toggle('active-state');
    document.dispatchEvent(new CustomEvent('radar:cerrar-ficha'));
  });
}

initFiltersUI();
