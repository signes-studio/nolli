/* =========================================================================
   FILTERSUI.JS — Panel de filtros por arquitecto
   ========================================================================= */

import { state } from './state.js';

const filterPanel = document.getElementById('filter-panel');
const btnFilters = document.getElementById('btn-filters');
const filterSwitches = document.getElementById('filter-switches');
const architectSearch = document.getElementById('architect-search');
const decadeSelect = document.getElementById('filter-decade');
const categorySelect = document.getElementById('filter-category');
const visitableSelect = document.getElementById('filter-visitable');

/** Regenera los interruptores de filtro a partir de state.ARQUITECTOS. */
export function generarFiltrosUI() {
  actualizarOpcionesFiltros();
  filterSwitches.innerHTML = '';
  const search = architectSearch.value.trim().toLowerCase();
  state.ARQUITECTOS.filter((arq) => !search || arq.toLowerCase().includes(search)).forEach((arq) => {
    if (!arq) return;
    const row = document.createElement('div');
    row.className = 'switch-row';
    const checked = state.activeArquitectos.has(arq) ? 'checked' : '';
    row.innerHTML = `
      <span style="text-transform: uppercase;">${arq}</span>
      <div class="tech-switch">
        <input type="checkbox" ${checked} data-arq="${arq}">
        <div class="track"></div>
        <div class="thumb"></div>
      </div>
    `;
    filterSwitches.appendChild(row);
  });
}

function actualizarOpcionesFiltros() {
  const decade = decadeSelect.value || state.activeDecada;
  const category = categorySelect.value || state.activeCategoria;
  const decades = [...new Set(state.OBRAS.map((obra) => Number(obra.año_construccion))
    .filter(Number.isFinite).map((year) => Math.floor(year / 10) * 10))].sort((a, b) => b - a);
  decadeSelect.innerHTML = '<option value="">TODAS LAS DÉCADAS</option>';
  decades.forEach((value) => decadeSelect.insertAdjacentHTML('beforeend', `<option value="${value}">${value}s</option>`));
  decadeSelect.value = decade;

  const categories = [...new Set(state.OBRAS.map((obra) => obra.categoria).filter(Boolean))].sort();
  categorySelect.innerHTML = '<option value="">TODAS LAS CATEGORÍAS</option>';
  categories.forEach((value) => categorySelect.insertAdjacentHTML('beforeend', `<option value="${value}">${value.toUpperCase()}</option>`));
  categorySelect.value = category;
  visitableSelect.value = state.activeVisitable;
}

/** Cierra el panel de filtros (usado, p. ej., al abrir la ficha técnica). */
export function cerrarFiltros() {
  filterPanel.classList.remove('open');
  btnFilters.classList.remove('active-state');
}

function initFiltersUI() {
  architectSearch.addEventListener('input', generarFiltrosUI);
  [decadeSelect, categorySelect, visitableSelect].forEach((control) => {
    control.addEventListener('change', () => {
      state.activeDecada = decadeSelect.value;
      state.activeCategoria = categorySelect.value;
      state.activeVisitable = visitableSelect.value;
      aplicarFiltrosMapa();
    });
  });
  filterSwitches.addEventListener('change', (e) => {
    if (e.target.type !== 'checkbox') return;
    const arq = e.target.dataset.arq;
    if (e.target.checked) state.activeArquitectos.add(arq);
    else state.activeArquitectos.delete(arq);

    aplicarFiltrosMapa();
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

export function aplicarFiltrosMapa() {
  if (!state.map) return;
  const arquitectos = state.activeArquitectos.size
    ? ['any', ...[...state.activeArquitectos].map((arq) => ['in', arq, ['get', 'arquitectos']])]
    : ['==', 1, 0];
  const detalles = [];
  if (state.activeDecada) detalles.push(['>=', ['get', 'año_construccion'], Number(state.activeDecada)]);
  if (state.activeDecada) detalles.push(['<', ['get', 'año_construccion'], Number(state.activeDecada) + 10]);
  if (state.activeCategoria) detalles.push(['==', ['get', 'categoria'], state.activeCategoria]);
  if (state.activeVisitable) detalles.push(['==', ['get', 'visitable'], Number(state.activeVisitable)]);
  [1, 2, 3].forEach((importance) => {
    [`obras-l${importance}`, `obras-l${importance}-selected`].forEach((layerId) => {
      if (!state.map.getLayer(layerId)) return;
      const selected = layerId.endsWith('-selected') ? 1 : 0;
      state.map.setFilter(layerId, [
        'all',
        arquitectos,
        ...detalles,
        ['==', ['get', 'importancia'], importance],
        ['==', ['get', 'selected'], selected],
      ]);
    });
  });
}

initFiltersUI();
