/* =========================================================================
   FILTERSUI.JS — Panel de filtros por Categorías y Accesos (Versión Corregida)
   ========================================================================= */

import { state, nombreCategoria, esRolAdmin } from './state.js';

const filterPanel = document.getElementById('filter-panel');
const btnFilters = document.getElementById('btn-filters');

const COLORES_CATEGORIA = {
  'residencial': '#E95C0C',
  'dotacional_equipamiento': '#4388C6',
  'religioso_funerario': '#F2ACCD',
  'comercial_terciario': '#EFBC02',
  'espacio_publico_paisaje': '#0d682f',
  'infraestructura_urbanismo': '#D6201D',
  'industrial_logistico': '#691B14',
  'otro': '#064773'
};

const CATEGORIAS_CONFIG = [
  { key: 'residencial', label: 'Residencial' },
  { key: 'dotacional_equipamiento', label: 'Dotacional / Equipamiento' },
  { key: 'industrial_logistico', label: 'Industrial / Logístico' },
  { key: 'religioso_funerario', label: 'Religioso / Funerario' },
  { key: 'comercial_terciario', label: 'Comercial / Terciario' },
  { key: 'espacio_publico_paisaje', label: 'Espacio Público / Paisaje' },
  { key: 'infraestructura_urbanismo', label: 'Infraestructura / Urbanismo' },
  { key: 'otro', label: 'Otros' },
];

const ACCESOS_CONFIG = [
  { key: 'publico', label: 'Público' },
  { key: 'exterior_visible', label: 'Exterior visible' },
  { key: 'con_reserva', label: 'Con reserva' },
  { key: 'privado', label: 'Privado' },
  { key: 'cerrado_temporalmente', label: 'Cerrado temporalmente' },
  { key: 'no_construido', label: 'No construido' },
  { key: 'desaparecido', label: 'Desaparecido' },
];

function asegurarEstadoFiltros() {
  if (!state.activeCategorias || !(state.activeCategorias instanceof Set)) {
    state.activeCategorias = new Set(CATEGORIAS_CONFIG.map(c => c.key));
  }
  if (!state.activeAccesos || !(state.activeAccesos instanceof Set)) {
    state.activeAccesos = new Set(ACCESOS_CONFIG.map(a => a.key));
  }
}

export function generarFiltrosUI() {
  asegurarEstadoFiltros();
  
  filterPanel.innerHTML = `
    <div class="filter-head">
      <div>
        <span style="color:var(--fg-dim)">[ FILTROS ]</span>
        <small id="filter-summary" class="filter-summary">TODAS LAS OBRAS</small>
      </div>
      <div class="filter-head-actions">
        <button type="button" class="filter-clear" data-filter-reset>LIMPIAR</button>
        <i data-lucide="x" id="btn-filters-close" width="14" height="14" style="cursor:pointer; color:var(--fg-dim)" role="button" aria-label="Cerrar filtros"></i>
      </div>
    </div>

    <div class="filter-group" data-filter-group="categories">
      <button type="button" class="filter-group-head" aria-expanded="true">
        <span>[ CATEGORÍAS ]</span>
        <span class="filter-chevron">−</span>
      </button>
      <div class="filter-group-body">
        <div class="filter-group-actions">
          <button type="button" class="filter-action" data-filter-all="categories">TODOS</button>
          <button type="button" class="filter-action" data-filter-isolate="categories">AISLAR</button>
        </div>
        <div class="filter-switches-list" id="switches-categories">
          ${CATEGORIAS_CONFIG.map(cat => {
            const checked = state.activeCategorias.has(cat.key) ? 'checked' : '';
            const colorCat = COLORES_CATEGORIA[cat.key] || COLORES_CATEGORIA['otro'];
            return `
              <div class="switch-row">
                <span>
                  <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${colorCat}; margin-right:8px; vertical-align:middle;"></span>
                  ${cat.label}
                </span>
                <div class="tech-switch">
                  <input type="checkbox" ${checked} data-category-key="${cat.key}">
                  <div class="track"></div>
                  <div class="thumb"></div>
                </div>
                <button type="button" class="filter-action filter-isolate" data-isolate-category="${cat.key}">AISLAR</button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    <div class="filter-group" data-filter-group="access">
      <button type="button" class="filter-group-head" aria-expanded="true">
        <span>[ ESTADO DE ACCESO ]</span>
        <span class="filter-chevron">−</span>
      </button>
      <div class="filter-group-body">
        <div class="filter-group-actions">
          <button type="button" class="filter-action" data-filter-all="access">TODOS</button>
          <button type="button" class="filter-action" data-filter-isolate="access">AISLAR</button>
        </div>
        <div class="filter-switches-list" id="switches-access">
          ${ACCESOS_CONFIG.map(acc => {
            const checked = state.activeAccesos.has(acc.key) ? 'checked' : '';
            return `
              <div class="switch-row">
                <span>${acc.label}</span>
                <div class="tech-switch">
                  <input type="checkbox" ${checked} data-access-key="${acc.key}">
                  <div class="track"></div>
                  <div class="thumb"></div>
                </div>
                <button type="button" class="filter-action filter-isolate" data-isolate-access="${acc.key}">AISLAR</button>
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
  if (state.activeAccesos.size < ACCESOS_CONFIG.length) {
    activeParts.push(`${state.activeAccesos.size} ESTADOS`);
  }

  summary.textContent = activeParts.length ? activeParts.join(' · ') : 'TODAS LAS OBRAS';
}

export function cerrarFiltros() {
  filterPanel.classList.remove('open');
  btnFilters.classList.remove('active-state');
}

function initFiltersUI() {
  asegurarEstadoFiltros();
  generarFiltrosUI();

  filterPanel.addEventListener('change', (e) => {
    const target = e.target;
    if (target.type !== 'checkbox') return;

    if (target.dataset.categoryKey) {
      const key = target.dataset.categoryKey;
      if (target.checked) state.activeCategorias.add(key);
      else state.activeCategorias.delete(key);
    } else if (target.dataset.accessKey) {
      const key = target.dataset.accessKey;
      if (target.checked) state.activeAccesos.add(key);
      else state.activeAccesos.delete(key);
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
      if (type === 'access') state.activeAccesos = new Set(ACCESOS_CONFIG.map(a => a.key));
      generarFiltrosUI();
      aplicarFiltrosMapa();
      return;
    }

    const resetAll = e.target.closest('[data-filter-reset]');
    if (resetAll) {
      state.activeCategorias = new Set(CATEGORIAS_CONFIG.map(c => c.key));
      state.activeAccesos = new Set(ACCESOS_CONFIG.map(a => a.key));
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

    const isolateAcc = e.target.closest('[data-isolate-access]');
    if (isolateAcc) {
      state.activeAccesos = new Set([isolateAcc.dataset.isolateAccess]);
      generarFiltrosUI();
      aplicarFiltrosMapa();
      return;
    }
  });

  btnFilters.addEventListener('click', () => {
    filterPanel.classList.toggle('open');
    btnFilters.classList.toggle('active-state');
    document.dispatchEvent(new CustomEvent('radar:cerrar-ficha'));
  });
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

  const accArray = [...state.activeAccesos];
  const accesosFilter = accArray.length === ACCESOS_CONFIG.length
    ? null
    : accArray.length > 0
      ? ['in', ['coalesce', ['get', 'estado_acceso'], 'publico'], ['literal', accArray]]
      : ['==', 1, 0];

  const detalles = [];
  if (categoriasFilter) detalles.push(categoriasFilter);
  if (accesosFilter) detalles.push(accesosFilter);

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