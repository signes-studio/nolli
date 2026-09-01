/* =========================================================================
   FILTERSUI.JS — Panel de filtros por Categorías
   ========================================================================= */

import { state, nombreCategoria, esRolAdmin, CATEGORY_META } from './state.js';

const filterPanel = document.getElementById('filter-panel');
const btnFilters = document.getElementById('btn-filters');

// OPCIONAL FIX #1: Usar CATEGORY_META centralizado en lugar de duplicados
const CATEGORIAS_CONFIG = Object.values(CATEGORY_META).map(meta => ({
  key: meta.key,
  label: meta.label
}));

function asegurarEstadoFiltros() {
  if (!state.activeCategorias || !(state.activeCategorias instanceof Set)) {
    state.activeCategorias = new Set(CATEGORIAS_CONFIG.map(c => c.key));
  }
}

export function generarFiltrosUI() {
  asegurarEstadoFiltros();
  
  if (!filterPanel) return;

  filterPanel.innerHTML = `
    <div class="filter-head">
      <div>
        <span style="color:var(--fg-dim)">[ FILTROS ]</span>
        <small id="filter-summary" class="filter-summary">TODAS LAS OBRAS</small>
      </div>
      <div class="filter-head-actions">
        <button type="button" class="filter-clear" data-filter-reset>LIMPIAR</button>
        <button type="button" id="btn-filters-close" class="sheet-close-button" aria-label="Cerrar filtros" style="width:28px; height:28px; min-width:28px; min-height:28px;">
          <i data-lucide="x" width="14" height="14"></i>
        </button>
      </div>
    </div>

    <div class="filter-group" data-filter-group="categories">
      <button type="button" class="filter-group-head" aria-expanded="true">
        <span>[ CATEGORÍAS ]</span>
        <span class="filter-chevron">−</span>
      </button>
      <div class="filter-group-body">
        <div class="filter-switches-list" id="switches-categories">
          ${CATEGORIAS_CONFIG.map(cat => {
            const checked = state.activeCategorias.has(cat.key) ? 'checked' : '';
            const metaColor = CATEGORY_META[cat.key];
            const colorCat = metaColor?.color || '#555550';
            return `
              <div class="switch-row">
                <div class="switch-label-wrap">
                  <span class="category-dot" style="background-color:${colorCat};"></span>
                  <span class="category-name">${cat.label}</span>
                </div>
                <div class="switch-actions-wrap">
                  <button type="button" class="filter-action filter-isolate" data-isolate-category="${cat.key}" title="Ver solo ${cat.label}">AISLAR</button>
                  <label class="tech-switch" aria-label="Activar ${cat.label}">
                    <input type="checkbox" ${checked} data-category-key="${cat.key}">
                    <span class="track"></span>
                    <span class="thumb"></span>
                  </label>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
  actualizarResumenFiltros();
}

function actualizarResumenFiltros() {
  const summary = document.getElementById('filter-summary');
  if (!summary) return;
  
  asegurarEstadoFiltros();
  const activeParts = [];

  if (state.activeCategorias.size < CATEGORIAS_CONFIG.length) {
    activeParts.push(`${state.activeCategorias.size} CAT.`);
  }

  summary.textContent = activeParts.length ? activeParts.join(' · ') : 'TODAS LAS OBRAS';
}

export function cerrarFiltros() {
  if (filterPanel) filterPanel.classList.remove('open');
  if (btnFilters) btnFilters.classList.remove('active-state');
}

function initFiltersUI() {
  asegurarEstadoFiltros();
  generarFiltrosUI();

  if (!filterPanel) return;

  filterPanel.addEventListener('change', (e) => {
    const target = e.target;
    if (target.type !== 'checkbox') return;

    if (target.dataset.categoryKey) {
      const key = target.dataset.categoryKey;
      if (target.checked) state.activeCategorias.add(key);
      else state.activeCategorias.delete(key);
    }
    aplicarFiltrosMapa();
  });

  filterPanel.addEventListener('click', (e) => {
    if (e.target.closest('#btn-filters-close')) {
      cerrarFiltros();
      return;
    }

    const groupHead = e.target.closest('.filter-group-head');
    if (groupHead) {
      const group = groupHead.closest('.filter-group');
      const isOpen = group.classList.toggle('collapsed') === false;
      groupHead.setAttribute('aria-expanded', String(isOpen));
      group.querySelector('.filter-chevron').textContent = isOpen ? '−' : '+';
      return;
    }

    const resetGroup = e.target.closest('[data-filter-all]');
    if (resetGroup) {
      const type = resetGroup.dataset.filterAll;
      if (type === 'categories') state.activeCategorias = new Set(CATEGORIAS_CONFIG.map(c => c.key));
      generarFiltrosUI();
      aplicarFiltrosMapa();
      return;
    }

    const resetAll = e.target.closest('[data-filter-reset]');
    if (resetAll) {
      state.activeCategorias = new Set(CATEGORIAS_CONFIG.map(c => c.key));
      generarFiltrosUI();
      aplicarFiltrosMapa();
      return;
    }

    const isolateCat = e.target.closest('[data-isolate-category]');
    if (isolateCat) {
      state.activeCategorias = new Set([isolateCat.dataset.isolateCategory]);
      generarFiltrosUI();
      aplicarFiltrosMapa();
      return;
    }
  });

  if (btnFilters) {
    btnFilters.addEventListener('click', () => {
      const isOpen = filterPanel.classList.toggle('open');
      btnFilters.classList.toggle('active-state', isOpen);
      if (isOpen) {
        generarFiltrosUI();
      }
      document.dispatchEvent(new CustomEvent('radar:cerrar-ficha'));
    });
  }
}

export function aplicarFiltrosMapa() {
  actualizarResumenFiltros();
  if (!state.map) return;

  asegurarEstadoFiltros();

  const catsArray = [...state.activeCategorias];
  const categoriasFilter = catsArray.length === CATEGORIAS_CONFIG.length
    ? null
    : catsArray.length > 0
      ? ['in', ['coalesce', ['get', 'categoria'], 'otro'], ['literal', catsArray]]
      : ['==', 1, 0];

  const detalles = [];
  if (categoriasFilter) detalles.push(categoriasFilter);

  const adminReviewFilter = document.getElementById('admin-review-filter');
  if (esRolAdmin(state.userRole) && adminReviewFilter?.value) {
    detalles.push(['==', ['get', 'estado_revision'], adminReviewFilter.value]);
  }

  [0, 1, 2, 3].forEach((importance) => {
    [`obras-l${importance}`, `obras-l${importance}-visited`, `obras-l${importance}-selected`, `obras-l${importance}-pending`, `obras-l${importance}-private`].forEach((layerId) => {
      if (!state.map.getLayer(layerId)) return;
      const selected = layerId.endsWith('-selected') ? 1 : 0;
      const visited = layerId.endsWith('-visited') ? 1 : layerId.endsWith('-selected') ? null : 0;
      const pending = layerId.endsWith('-pending') ? 'pendiente' : null;
      const privateStatus = layerId.endsWith('-private') ? 'privada' : null;
      
      const layerFilters = [
        'all',
        ...detalles,
        ['==', ['get', 'importancia'], importance],
        ['==', ['get', 'selected'], selected],
        ['==', ['get', 'estado_revision'], pending || privateStatus || 'publicada'],
      ];

      if (!pending && !privateStatus && visited !== null) {
        layerFilters.push(['==', ['get', 'visited'], visited]);
      }

      state.map.setFilter(layerId, layerFilters);
    });
  });

  if (state.map.getLayer('obras-favorites-halo')) {
    state.map.setFilter('obras-favorites-halo', ['all', ['!', ['has', 'point_count']], ...detalles, ['==', ['get', 'favorite'], 1]]);
  }

  [0, 1, 2, 3].forEach((importance) => {
    const labelLayerId = `obras-labels-l${importance}`;
    if (state.map.getLayer(labelLayerId)) {
      state.map.setFilter(labelLayerId, ['all', ...detalles, ['==', ['get', 'importancia'], importance], ['==', ['get', 'estado_revision'], 'publicada']]);
    }
  });

  document.dispatchEvent(new CustomEvent('radar:filters-changed'));
}

initFiltersUI();