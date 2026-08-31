// js/exploreUI.js
import { state, escapeHtml } from './state.js';
import { fetchAllPublicCollections } from './api.js';
import { actualizarFuenteMapa } from './mapData.js';
import { CURATED_ROUTES, activarRutaEnMapa } from './radarUI.js';
import { activarFiltroBusquedaEnMapa } from './searchUI.js';

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

export async function renderPublicCollections(query = '') {
  const curatedContainer = document.getElementById('explore-curated-container');
  const publicContainer = document.getElementById('explore-public-container');
  const countBadge = document.getElementById('explore-count-badge');

  if (!publicCollectionsCache.length && publicContainer) {
    publicContainer.innerHTML = `<div class="explore-loading">[ CONSULTANDO LISTAS PÚBLICAS DE LA COMUNIDAD... ]</div>`;
    try {
      publicCollectionsCache = await fetchAllPublicCollections();
    } catch (err) {
      console.warn('Error al cargar listas públicas:', err);
      publicCollectionsCache = [];
    }
  }

  const q = query.trim().toLowerCase();

  // 1. Filtrar y renderizar Selecciones Curatoriales
  let curatedRoutes = CURATED_ROUTES;
  if (q) {
    curatedRoutes = curatedRoutes.filter((r) => {
      return (r.title || '').toLowerCase().includes(q) ||
             (r.subtitle || '').toLowerCase().includes(q) ||
             (r.tag || '').toLowerCase().includes(q);
    });
  }

  if (curatedContainer) {
    if (curatedRoutes.length > 0) {
      curatedContainer.innerHTML = curatedRoutes.map((route) => {
        let stopsLabel = `${route.stops} PARADAS`;
        if (route.addedByFilter) {
          const count = (state.OBRAS || []).filter((o) => {
            const addedBy = String(o.añadido_por || o.anadido_por || '').toUpperCase();
            return addedBy.includes(route.addedByFilter.toUpperCase());
          }).length;
          stopsLabel = count > 0 ? `${count} OBRAS` : (typeof route.stops === 'number' ? `${route.stops} OBRAS` : route.stops);
        }

        return `
          <div class="radar-route-card" data-curated-id="${escapeHtml(route.id)}" role="button" tabindex="0" aria-label="Ruta ${escapeHtml(route.title)}">
            <div class="radar-route-topline">
              <span class="radar-route-tag" style="color:${route.color}; border-color:${route.color};">[ ${escapeHtml(route.tag)} ]</span>
              <span class="radar-route-stops">[ ${stopsLabel} ]</span>
            </div>
            <h4 class="radar-route-title">${escapeHtml(route.title)}</h4>
            <p class="radar-route-desc">${escapeHtml(route.subtitle)}</p>
            <button type="button" class="radar-route-btn" data-curated-id="${escapeHtml(route.id)}">
              [ INICIAR ITINERARIO ]
            </button>
          </div>
        `;
      }).join('');
    } else {
      curatedContainer.innerHTML = `<div style="font-size:11px; color:var(--fg-dim); padding:4px 0;">[ NINGUNA SELECCIÓN CURATORIAL COINCIDENTE ]</div>`;
    }
  }

  // 2. Filtrar y renderizar Colecciones de la Comunidad
  let collections = publicCollectionsCache;
  if (q) {
    collections = collections.filter((col) => {
      const name = (col.name || '').toLowerCase();
      const desc = (col.description || '').toLowerCase();
      const author = (col.profiles?.nick || col.profiles?.first_name || '').toLowerCase();
      return name.includes(q) || desc.includes(q) || author.includes(q);
    });
  }

  const totalResults = curatedRoutes.length + collections.length;
  if (countBadge) {
    countBadge.textContent = `[ ${totalResults} ${totalResults === 1 ? 'COLECCIÓN' : 'COLECCIONES'} ]`;
  }

  if (publicContainer) {
    if (!collections.length) {
      publicContainer.innerHTML = `
        <div class="explore-empty-state">
          <i data-lucide="folder-search" width="28" height="28" style="color:var(--accent, #E84E1B); margin-bottom:8px;"></i>
          <div class="font-display text-sm font-bold">[ ${q ? 'NO HAY LISTAS DE USUARIO COINCIDENTES' : 'NO HAY COLECCIONES PÚBLICAS AÚN'} ]</div>
          <p class="text-xs text-dim">${q ? 'Prueba con otro término de búsqueda.' : 'Sé el primero en compartir una lista pública desde tu perfil.'}</p>
        </div>
      `;
    } else {
      publicContainer.innerHTML = `
        <div class="public-collections-grid">
          ${collections.map((col) => {
            const authorNick = col.profiles?.nick ? `@${col.profiles.nick}` : (col.profiles?.first_name ? `@${col.profiles.first_name}` : 'Comunidad Nolli');
            const emoji = col.emoji || col.icon || '🏛️';
            const title = col.name || 'Colección sin título';
            const desc = col.description || 'Selección curatorial de arquitectura';
            const itemsCount = Array.isArray(col.building_ids) ? col.building_ids.length : 0;

            return `
              <article class="public-collection-card" data-collection-id="${escapeHtml(col.id)}" role="button" tabindex="0" aria-label="${escapeHtml(title)}">
                <div class="public-collection-header">
                  <span class="public-collection-emoji">${emoji}</span>
                  <span class="public-collection-count">[ ${itemsCount} ${itemsCount === 1 ? 'OBRA' : 'OBRAS'} ]</span>
                </div>
                <h3 class="public-collection-title">${escapeHtml(title)}</h3>
                <p class="public-collection-desc">${escapeHtml(desc)}</p>
                <div class="public-collection-footer">
                  <span class="public-collection-author">${escapeHtml(authorNick)}</span>
                  <button type="button" class="public-collection-btn">[ VER EN MAPA ]</button>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      `;
    }
  }

  if (window.lucide) window.lucide.createIcons();
}

// Alias de compatibilidad
export function renderExploreList(query = '') {
  renderPublicCollections(query);
}

export function initExploreUI() {
  const panel = document.getElementById('explore-panel');
  const btnClose = document.getElementById('btn-explore-close');
  const searchInput = document.getElementById('explore-search-input');
  const container = document.getElementById('explore-list-container');

  if (btnClose && panel) {
    btnClose.addEventListener('click', () => {
      panel.classList.remove('open');
      const backdrop = document.getElementById('panel-backdrop');
      if (backdrop) backdrop.classList.remove('active');
      document.dispatchEvent(new CustomEvent('explore:panel-closed'));
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderPublicCollections(e.target.value);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = searchInput.value.trim();
        if (val) activarFiltroBusquedaEnMapa(val);
      }
    });
  }

  // Tap en Selecciones Curatoriales o Colecciones Públicas
  if (container) {
    container.addEventListener('click', (e) => {
      // 1. Tap en Ruta / Selección Curatorial
      const curatedBtn = e.target.closest('.radar-route-btn') || e.target.closest('.radar-route-card');
      if (curatedBtn) {
        const routeId = curatedBtn.dataset.curatedId;
        if (routeId) {
          if (panel) panel.classList.remove('open');
          const backdrop = document.getElementById('panel-backdrop');
          if (backdrop) backdrop.classList.remove('active');
          activarRutaEnMapa(routeId);
          return;
        }
      }

      // 2. Tap en Colección Pública de la Comunidad
      const colCard = e.target.closest('.public-collection-card');
      if (!colCard) return;

      const colId = colCard.dataset.collectionId;
      const col = publicCollectionsCache.find((c) => String(c.id) === String(colId));
      if (!col) return;

      const buildingIds = Array.isArray(col.building_ids) ? col.building_ids.map(String) : [];

      if (panel) panel.classList.remove('open');
      const backdrop = document.getElementById('panel-backdrop');
      if (backdrop) backdrop.classList.remove('active');

      // Establecer estado de aislamiento de la lista en el mapa
      state.activeItinerary = {
        id: col.id,
        title: col.name,
        workIds: new Set(buildingIds),
      };

      // Actualizar la fuente del mapa
      actualizarFuenteMapa();

      // Mostrar etiqueta flotante de lista activa
      const itineraryBadge = document.getElementById('itinerary-filter-badge');
      const titleEl = document.getElementById('itinerary-badge-title');
      const countEl = document.getElementById('itinerary-badge-count');

      if (itineraryBadge && titleEl) {
        titleEl.textContent = `LISTA: ${(col.name || 'COLECCIÓN').toUpperCase()}`;
        if (countEl) countEl.textContent = `${buildingIds.length} OBRAS`;
        itineraryBadge.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
      }

      // Cambiar a la pestaña Mapa en la Bottom Bar
      const mapNavBtn = document.getElementById('mobile-nav-map');
      if (mapNavBtn) {
        document.querySelectorAll('.mobile-nav-btn').forEach((b) => b.classList.remove('active'));
        mapNavBtn.classList.add('active');
      }

      // Encuadre geográfico en Mapbox
      const colWorks = (state.OBRAS || []).filter((w) => buildingIds.includes(String(w.id)));
      if (colWorks.length > 0 && state.map) {
        const coords = colWorks.filter((w) => w.coordenadas && w.coordenadas.length === 2).map((w) => w.coordenadas);
        if (coords.length === 1) {
          state.map.flyTo({ center: coords[0], zoom: 16, duration: 800 });
        } else if (coords.length > 1) {
          const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
          state.map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 1000 });
        }
      }
    });
  }

  document.addEventListener('radar:data-ready', () => {
    if (panel && panel.classList.contains('open')) {
      renderPublicCollections(searchInput?.value || '');
    }
  });
}
