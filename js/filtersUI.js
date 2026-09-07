/* =========================================================================
   FILTERSUI.JS — Panel de filtros por Categorías
   ========================================================================= */

import { state, nombreCategoria, esRolAdmin, esRolEditor, CATEGORY_META } from './state.js';
import { t, getLanguage, setupLanguageSwitchers } from './i18n.js';

const filterPanel = document.getElementById('filter-panel');
const btnFilters = document.getElementById('btn-filters');

const CATEGORY_I18N_KEYS = {
  residencial: 'cat_residential',
  dotacional_equipamiento: 'cat_civic',
  industrial_logistico: 'cat_industrial',
  religioso_funerario: 'cat_religious',
  comercial_terciario: 'cat_commercial',
  espacio_publico_paisaje: 'cat_public_space',
  infraestructura_urbanismo: 'cat_infrastructure',
  otro: 'cat_other',
};

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

  const currentLang = getLanguage();

  filterPanel.innerHTML = `
    <div class="filter-head">
      <div>
        <span style="color:var(--fg-dim)">${t('filter_title')}</span>
        <small id="filter-summary" class="filter-summary">${t('filter_all_works')}</small>
      </div>
      <div class="filter-head-actions">
        <button type="button" class="filter-clear" data-filter-reset>${t('filter_clear')}</button>
        <button type="button" id="btn-filters-close" class="sheet-close-button" aria-label="${t('filter_close_aria')}" style="width:28px; height:28px; min-width:28px; min-height:28px;">
          <i data-lucide="x" width="14" height="14"></i>
        </button>
      </div>
    </div>

    <div class="filter-group" data-filter-group="categories">
      <button type="button" class="filter-group-head" aria-expanded="true">
        <span>${t('legend_categories')}</span>
        <span class="filter-chevron">−</span>
      </button>
      <div class="filter-group-body">
        <div class="filter-switches-list" id="switches-categories">
          ${CATEGORIAS_CONFIG.map(cat => {
            const checked = state.activeCategorias.has(cat.key) ? 'checked' : '';
            const metaColor = CATEGORY_META[cat.key];
            const colorCat = metaColor?.color || '#555550';
            const catLabel = t(CATEGORY_I18N_KEYS[cat.key]) || cat.label;
            return `
              <div class="switch-row">
                <div class="switch-label-wrap">
                  <span class="category-dot" style="background-color:${colorCat};"></span>
                  <span class="category-name">${catLabel}</span>
                </div>
                <div class="switch-actions-wrap">
                  <button type="button" class="filter-action filter-isolate" data-isolate-category="${cat.key}" title="${t('filter_isolate_title', { label: catLabel })}">${t('filter_isolate')}</button>
                  <label class="tech-switch" aria-label="${t('filter_activate_aria', { label: catLabel })}">
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

    <div class="filter-group filter-group-lang collapsed" data-filter-group="language">
      <button type="button" class="filter-group-head" aria-expanded="false">
        <span style="display:flex; align-items:center; gap:6px;">
          <i data-lucide="globe" width="13" height="13" style="color:var(--accent, #E84E1B)"></i>
          <span>${t('lang_settings_title')}</span>
        </span>
        <span class="filter-chevron filter-lang-badge">[ ${currentLang.toUpperCase()} ]</span>
      </button>
      <div class="filter-group-body" style="padding: 10px 14px 14px; background: var(--bg-panel, #F8F1DF);">
        <p class="filter-lang-note">${t('lang_device_hint')}</p>
        <div class="lang-switcher-pills" role="group" aria-label="${t('lang_switcher_aria')}">
          <button type="button" class="lang-pill ${currentLang === 'es' ? 'active' : ''}" data-lang-btn="es">${t('lang_castellano')}</button>
          <button type="button" class="lang-pill ${currentLang === 'en' ? 'active' : ''}" data-lang-btn="en">${t('lang_english')}</button>
          <button type="button" class="lang-pill ${currentLang === 'ca' ? 'active' : ''}" data-lang-btn="ca">${t('lang_catala')}</button>
        </div>
      </div>
    </div>
  `;

  window.lucide?.createIcons({ context: filterPanel });
  setupLanguageSwitchers(filterPanel);
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

  summary.textContent = activeParts.length ? activeParts.join(' · ') : t('filter_all_works');
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
      const chev = group.querySelector('.filter-chevron');
      if (chev && !chev.classList.contains('filter-lang-badge')) {
        chev.textContent = isOpen ? '−' : '+';
      }
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
  state.activeItinerary = null;
  document.getElementById('itinerary-filter-badge')?.classList.add('hidden');
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
  if (esRolEditor(state.userRole) && adminReviewFilter?.value) {
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
