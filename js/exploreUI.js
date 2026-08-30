// js/exploreUI.js
import { state, CATEGORY_COLORS, CATEGORY_NAMES, escapeHtml } from './state.js';
import { abrirFicha } from './sheetUI.js';
import { fetchAllPublicCollections, fetchBuildingsByIds } from './api.js';

let activeExploreTab = 'works'; // 'works' | 'public_collections'
let activeChipType = 'all'; // 'all', 'decade', 'category'
let activeChipValue = '';
let activeSort = 'proximity'; // 'proximity' | 'chronological'
let visibleCount = 20;
let publicCollectionsCache = [];

export function calcularDistanciaMetros(lon1, lat1, lon2, lat2) {
  if (lon1 == null || lat1 == null || lon2 == null || lat2 == null) return Infinity;
  const R = 6371e3; // Radio de la Tierra en metros
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function formatearDistancia(metros) {
  if (!isFinite(metros) || metros == null) return '';
  if (metros < 1000) {
    return `${Math.round(metros)} M`;
  }
  return `${(metros / 1000).toFixed(1)} KM`;
}

function getReferenciaCoordenadas() {
  if (state.userLocation && state.userLocation.length === 2) {
    return state.userLocation; // [lon, lat]
  }
  if (state.map) {
    const center = state.map.getCenter();
    return [center.lng, center.lat];
  }
  return [-0.3763, 39.4699]; // Valencia centro por defecto
}

export async function renderPublicCollectionsGrid() {
  const container = document.getElementById('explore-list-container');
  const countBadge = document.getElementById('explore-count-badge');
  if (!container) return;

  container.innerHTML = `<div class="explore-loading">[ CONSULTANDO COLECCIONES PÚBLICAS DE LA COMUNIDAD... ]</div>`;

  try {
    if (!publicCollectionsCache.length) {
      publicCollectionsCache = await fetchAllPublicCollections();
    }
    const collections = publicCollectionsCache;

    if (countBadge) {
      countBadge.textContent = `[ ${collections.length} COLECCIONES ]`;
    }

    if (!collections.length) {
      container.innerHTML = `
        <div class="explore-empty-state">
          <i data-lucide="folder-heart" width="28" height="28" style="color:var(--fg-dim); margin-bottom:8px;"></i>
          <div class="font-display text-sm font-bold">[ NO HAY COLECCIONES PÚBLICAS AÚN ]</div>
          <p class="text-xs text-dim">Sé el primero en crear y compartir una lista pública desde tu perfil.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    const html = `
      <div class="public-collections-grid">
        ${collections.map((col) => {
          const authorNick = col.profiles?.nick ? `@${col.profiles.nick}` : (col.profiles?.first_name || 'Comunidad Nolli');
          const emoji = col.emoji || '📑';
          const title = col.name || 'Colección sin título';
          const desc = col.description || 'Selección curatorial de arquitectura';
          const itemsCount = Array.isArray(col.building_ids) ? col.building_ids.length : 0;

          return `
            <article class="public-collection-card" data-collection-id="${escapeHtml(col.id)}" role="button" tabindex="0">
              <div class="public-collection-header">
                <span class="public-collection-emoji">${emoji}</span>
                <span class="public-collection-count">[ ${itemsCount} OBRAS ]</span>
              </div>
              <h3 class="public-collection-title">${escapeHtml(title)}</h3>
              <p class="public-collection-desc">${escapeHtml(desc)}</p>
              <div class="public-collection-footer">
                <span class="public-collection-author">${escapeHtml(authorNick)}</span>
                <span class="public-collection-btn">[ VER LISTA ]</span>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;

    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    container.innerHTML = `
      <div class="explore-empty-state">
        <p class="text-xs text-dim">No se pudieron cargar las listas públicas.</p>
      </div>
    `;
  }
}

export function renderExploreList(filterText = '') {
  if (activeExploreTab === 'public_collections') {
    renderPublicCollectionsGrid();
    return;
  }

  const container = document.getElementById('explore-list-container');
  const countBadge = document.getElementById('explore-count-badge');
  if (!container) return;

  const [refLon, refLat] = getReferenciaCoordenadas();
  const query = (filterText || document.getElementById('explore-search-input')?.value || '').trim().toLowerCase();

  // Calcular distancias
  const works = (state.OBRAS || []).map((obra) => {
    let dist = Infinity;
    if (obra.coordenadas && obra.coordenadas.length === 2) {
      dist = calcularDistanciaMetros(refLon, refLat, obra.coordenadas[0], obra.coordenadas[1]);
    }
    return { ...obra, _dist: dist };
  });

  // Filtrar por búsqueda y chips
  const filtered = works.filter((obra) => {
    if (query) {
      const nameMatch = obra.nombre_obra && obra.nombre_obra.toLowerCase().includes(query);
      const arqMatch = obra.arquitectos && obra.arquitectos.toLowerCase().includes(query);
      const cityMatch = (obra.ciudad || obra.place || '').toLowerCase().includes(query);
      const yearMatch = obra.año_construccion && String(obra.año_construccion).includes(query);
      if (!nameMatch && !arqMatch && !cityMatch && !yearMatch) return false;
    }

    if (activeChipType === 'decade' && activeChipValue) {
      const year = Number(obra.año_construccion);
      const targetDecade = Number(activeChipValue);
      if (!year || isNaN(year) || year < targetDecade || year >= targetDecade + 10) {
        return false;
      }
    } else if (activeChipType === 'category' && activeChipValue) {
      if (String(obra.categoria || '').toLowerCase() !== activeChipValue.toLowerCase()) {
        return false;
      }
    }

    return true;
  });

  // Ordenar
  if (activeSort === 'chronological') {
    filtered.sort((a, b) => {
      const yA = Number(a.año_construccion) || 0;
      const yB = Number(b.año_construccion) || 0;
      return yB - yA;
    });
  } else {
    filtered.sort((a, b) => a._dist - b._dist);
  }

  if (countBadge) {
    countBadge.textContent = `[ ${filtered.length} OBRAS ]`;
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div class="explore-empty-state">
        <i data-lucide="compass" width="28" height="28" style="color:var(--fg-dim); margin-bottom:8px;"></i>
        <div class="font-display text-sm font-bold">[ NO SE ENCONTRARON OBRAS ]</div>
        <p class="text-xs text-dim">Prueba a seleccionar otro filtro o elimina la búsqueda.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const paginated = filtered.slice(0, visibleCount);

  const itemsHtml = paginated.map((obra) => {
    const catKey = obra.categoria || 'otro';
    const catColor = CATEGORY_COLORS[catKey] || '#E84E1B';
    const catName = CATEGORY_NAMES[catKey] || 'ARQUITECTURA';
    const distStr = formatearDistancia(obra._dist);
    const photo = obra.foto_url || obra.foto_miniatura || obra.imagen_url || '';
    const city = obra.place || obra.ciudad || '';
    const architects = obra.arquitectos || 'AUTOR NO IDENTIFICADO';
    const year = obra.año_construccion ? ` · ${escapeHtml(obra.año_construccion)}` : '';

    return `
      <article class="explore-editorial-card" data-explore-feature-id="${escapeHtml(obra.featureId || obra.id)}" role="button" tabindex="0" aria-label="${escapeHtml(obra.nombre_obra)}">
        ${photo ? `
          <div class="explore-editorial-media">
            <img src="${escapeHtml(photo)}" alt="${escapeHtml(obra.nombre_obra)}" loading="lazy" class="explore-editorial-img" onerror="this.parentElement.style.display='none'">
            ${distStr ? `<span class="explore-editorial-dist-badge">[ ${distStr} ]</span>` : ''}
            <span class="architect-pill-badge overlay">[ ${escapeHtml(architects)} ]</span>
          </div>
        ` : ''}
        <div class="explore-editorial-body">
          <h3 class="explore-editorial-title">${escapeHtml(obra.nombre_obra)}</h3>
          <div class="explore-editorial-architect-row">
            <span class="architect-pill-badge">${escapeHtml(architects)}</span>
            <span class="explore-editorial-year">${year}</span>
          </div>
          <div class="explore-editorial-footer">
            <span class="explore-editorial-cat" style="color:${catColor}; border-color:${catColor};">[ ${escapeHtml(catName)} ]</span>
            ${city ? `<span class="explore-editorial-place">${escapeHtml(city).toUpperCase()}</span>` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');

  const loadMoreBtn = filtered.length > visibleCount ? `
    <div class="explore-load-more-wrap">
      <button type="button" id="btn-explore-load-more" class="explore-load-more-btn">
        [ CARGAR MÁS OBRAS (${filtered.length - visibleCount} RESTANTES) ]
      </button>
    </div>
  ` : '';

  container.innerHTML = itemsHtml + loadMoreBtn;
  if (window.lucide) window.lucide.createIcons();

  const loadMoreEl = document.getElementById('btn-explore-load-more');
  if (loadMoreEl) {
    loadMoreEl.addEventListener('click', () => {
      visibleCount += 20;
      renderExploreList();
    });
  }
}

export function initExploreUI() {
  const panel = document.getElementById('explore-panel');
  const btnClose = document.getElementById('btn-explore-close');
  const searchInput = document.getElementById('explore-search-input');
  const container = document.getElementById('explore-list-container');
  const sortProximity = document.getElementById('explore-sort-proximity');
  const sortChrono = document.getElementById('explore-sort-chrono');
  const chipsContainer = document.getElementById('explore-chips-bar');
  const tabWorks = document.getElementById('explore-tab-works');
  const tabCollections = document.getElementById('explore-tab-collections');

  if (btnClose && panel) {
    btnClose.addEventListener('click', () => {
      panel.classList.remove('open');
      const backdrop = document.getElementById('panel-backdrop');
      if (backdrop) backdrop.classList.remove('active');
      document.dispatchEvent(new CustomEvent('radar:panel-closed'));
    });
  }

  // Conmutador de Pestañas Sub-vistas (Obras vs Listas Públicas)
  if (tabWorks && tabCollections) {
    tabWorks.addEventListener('click', () => {
      activeExploreTab = 'works';
      tabWorks.classList.add('active');
      tabCollections.classList.remove('active');
      const sortBar = document.querySelector('.explore-sort-bar');
      const chipsBar = document.getElementById('explore-chips-bar');
      if (sortBar) sortBar.style.display = 'flex';
      if (chipsBar) chipsBar.style.display = 'flex';
      renderExploreList();
    });

    tabCollections.addEventListener('click', () => {
      activeExploreTab = 'public_collections';
      tabCollections.classList.add('active');
      tabWorks.classList.remove('active');
      const sortBar = document.querySelector('.explore-sort-bar');
      const chipsBar = document.getElementById('explore-chips-bar');
      if (sortBar) sortBar.style.display = 'none';
      if (chipsBar) chipsBar.style.display = 'none';
      renderPublicCollectionsGrid();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      visibleCount = 20;
      renderExploreList(e.target.value);
    });
  }

  if (sortProximity && sortChrono) {
    sortProximity.addEventListener('click', () => {
      activeSort = 'proximity';
      sortProximity.classList.add('active');
      sortChrono.classList.remove('active');
      visibleCount = 20;
      renderExploreList();
    });

    sortChrono.addEventListener('click', () => {
      activeSort = 'chronological';
      sortChrono.classList.add('active');
      sortProximity.classList.remove('active');
      visibleCount = 20;
      renderExploreList();
    });
  }

  if (chipsContainer) {
    chipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.explore-chip');
      if (!chip) return;

      chipsContainer.querySelectorAll('.explore-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');

      activeChipType = chip.dataset.chipType || 'all';
      activeChipValue = chip.dataset.chipValue || '';
      visibleCount = 20;
      renderExploreList();
    });
  }

  if (container) {
    container.addEventListener('click', async (e) => {
      // Tap en obra
      const card = e.target.closest('.explore-editorial-card');
      if (card) {
        const featureId = card.dataset.exploreFeatureId;
        const obra = state.OBRAS.find((item) => String(item.featureId) === String(featureId) || String(item.id) === String(featureId));

        if (obra) {
          if (panel) panel.classList.remove('open');
          const backdrop = document.getElementById('panel-backdrop');
          if (backdrop) backdrop.classList.remove('active');

          if (state.map && obra.coordenadas) {
            state.map.flyTo({
              center: obra.coordenadas,
              zoom: Math.max(state.map.getZoom(), 15),
              duration: 800
            });
          }

          abrirFicha(obra, obra.coordenadas, obra.featureId);
        }
        return;
      }

      // Tap en Colección Pública
      const colCard = e.target.closest('.public-collection-card');
      if (colCard) {
        const colId = colCard.dataset.collectionId;
        const col = publicCollectionsCache.find((c) => String(c.id) === String(colId));
        if (col && Array.isArray(col.building_ids) && col.building_ids.length > 0) {
          if (panel) panel.classList.remove('open');
          const backdrop = document.getElementById('panel-backdrop');
          if (backdrop) backdrop.classList.remove('active');

          // Filtrar o ajustar vista a las obras de la colección
          const colWorks = state.OBRAS.filter((w) => col.building_ids.map(String).includes(String(w.id)));
          if (colWorks.length > 0 && state.map) {
            const coords = colWorks.filter((w) => w.coordenadas).map((w) => w.coordenadas);
            if (coords.length === 1) {
              state.map.flyTo({ center: coords[0], zoom: 15 });
            } else if (coords.length > 1) {
              const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
              state.map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 1000 });
            }
          }
        }
      }
    });
  }

  document.addEventListener('radar:data-ready', () => {
    if (panel && panel.classList.contains('open')) {
      renderExploreList();
    }
  });
}
