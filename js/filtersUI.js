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
const accessSelect = document.getElementById('filter-access');

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
      <button type="button" class="filter-action filter-isolate" data-isolate-arq="${arq}">AISLAR</button>
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
  accessSelect.value = state.activeVisitable;
}

/** Cierra el panel de filtros (usado, p. ej., al abrir la ficha técnica). */
export function cerrarFiltros() {
  filterPanel.classList.remove('open');
  btnFilters.classList.remove('active-state');
}

function initFiltersUI() {
  architectSearch.addEventListener('input', generarFiltrosUI);
  [decadeSelect, categorySelect, accessSelect].forEach((control) => {
    control.addEventListener('change', () => {
      state.activeDecada = decadeSelect.value;
      state.activeCategoria = categorySelect.value;
      state.activeVisitable = accessSelect.value;
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
      const groupHead = e.target.closest('.filter-group-head');
      if (groupHead) {
        const group = groupHead.closest('.filter-group');
        const isOpen = group.classList.toggle('collapsed') === false;
        groupHead.setAttribute('aria-expanded', String(isOpen));
        group.querySelector('.filter-chevron').textContent = isOpen ? '−' : '+';
        return;
      }
      const clearFilter = e.target.closest('[data-filter-all]');
      if (clearFilter) {
        const group = clearFilter.dataset.filterAll;
        if (group === 'architects') state.activeArquitectos = new Set(state.ARQUITECTOS);
        if (group === 'decade') state.activeDecada = '';
        if (group === 'category') state.activeCategoria = '';
        if (group === 'access') state.activeVisitable = '';
        generarFiltrosUI();
        aplicarFiltrosMapa();
        return;
      }
      const isolateFilter = e.target.closest('[data-filter-isolate]');
      if (isolateFilter) {
        const group = isolateFilter.dataset.filterIsolate;
        state.activeArquitectos = group === 'architects' ? new Set(state.activeArquitectos) : new Set(state.ARQUITECTOS);
        if (group !== 'decade') state.activeDecada = '';
        if (group !== 'category') state.activeCategoria = '';
        if (group !== 'access') state.activeVisitable = '';
        if (group === 'decade' && !state.activeDecada) return;
        if (group === 'category' && !state.activeCategoria) return;
        if (group === 'access' && !state.activeVisitable) return;
        generarFiltrosUI();
        aplicarFiltrosMapa();
        return;
      }
      const action = e.target.closest('[data-filter-mode]');
    const isolate = e.target.closest('[data-isolate-arq]');
    if (isolate) {
      state.activeArquitectos = new Set([isolate.dataset.isolateArq]);
      generarFiltrosUI();
      aplicarFiltrosMapa();
      return;
    }
    if (!action) return;
    if (action.dataset.filterMode === 'all') {
      state.activeArquitectos = new Set(state.ARQUITECTOS);
    }
    generarFiltrosUI();
    aplicarFiltrosMapa();
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
  if (state.activeVisitable) detalles.push(['==', ['get', 'estado_acceso'], state.activeVisitable]);
  [1, 2, 3].forEach((importance) => {
    [`obras-l${importance}`, `obras-l${importance}-visited`, `obras-l${importance}-selected`].forEach((layerId) => {
      if (!state.map.getLayer(layerId)) return;
      const selected = layerId.endsWith('-selected') ? 1 : 0;
      const visited = layerId.endsWith('-visited') ? 1 : layerId.endsWith('-selected') ? null : 0;
      state.map.setFilter(layerId, [
        'all',
        arquitectos,
        ...detalles,
        ['==', ['get', 'importancia'], importance],
        ['==', ['get', 'selected'], selected],
        ...(visited === null ? [] : [['==', ['get', 'visited'], visited]]),
      ]);
    });
  });
  if (state.map.getLayer('obras-favorites-halo')) {
    state.map.setFilter('obras-favorites-halo', ['all', arquitectos, ...detalles, ['==', ['get', 'favorite'], 1]]);
  }
  if (state.map.getLayer('obras-labels')) {
    state.map.setFilter('obras-labels', ['all', arquitectos, ...detalles]);
  }
}

initFiltersUI();
