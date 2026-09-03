import { state, escapeHtml } from './state.js';
import { fetchAllPublicCollections, followCollection, unfollowCollection, fetchFollowedCollections } from './api.js';
import { CURATED_ROUTES } from './itinerariesConfig.js';
import { getCuratedRoutes, activarRutaEnMapa } from './radarUI.js';
import { activarFiltroBusquedaEnMapa } from './searchUI.js';
import { calcularDistanciaMetros, formatearDistancia } from './renderUtils.js';

let publicCollectionsCache = [];
let activeExploreTab = 'all'; // 'all' | 'curated' | 'public'

export async function renderPublicCollections(query = '') {
  const curatedSection = document.getElementById('explore-curated-section');
  const publicSection = document.getElementById('explore-public-section');
  const curatedContainer = document.getElementById('explore-curated-container');
  const publicContainer = document.getElementById('explore-public-container');
  const countBadge = document.getElementById('explore-count-badge');
  const exploreContainer = document.getElementById('explore-list-container');

  if (!state.sessionToken) {
    if (curatedSection) curatedSection.style.display = 'none';
    if (publicSection) publicSection.style.display = 'none';
    if (countBadge) countBadge.textContent = 'ACCESO EXCLUSIVO';
    if (exploreContainer) {
      exploreContainer.innerHTML = `
        <div class="explore-restricted-gate" style="text-align: center; padding: 50px 20px; display: flex; flex-direction: column; align-items: center; gap: 16px;">
          <div style="width: 52px; height: 52px; border: 2px solid var(--border-strong, #111111); display: flex; align-items: center; justify-content: center; background: var(--bg-raised, #EAE6DD); box-shadow: 3px 3px 0px #111111;">
            <i data-lucide="lock" width="24" height="24" style="color: var(--accent, #E84E1B);"></i>
          </div>
          <div>
            <h3 style="font-family: 'League Spartan', sans-serif; font-size: 19px; font-weight: 900; margin: 0 0 6px; text-transform: uppercase; color: var(--fg); letter-spacing: 0.04em;">
              EXPLORA EXCLUSIVO PARA USUARIOS
            </h3>
            <p style="font-family: 'Inter', sans-serif; font-size: 12px; color: var(--fg-dim); max-width: 320px; margin: 0 auto; line-height: 1.5;">
              Inicia sesión o crea tu cuenta gratuita en Nolli para acceder a los itinerarios curatoriales y explorar las listas públicas de la comunidad.
            </p>
          </div>
          <button type="button" id="btn-explore-login-trigger" class="btn btn-accent" style="font-family: 'Inter', sans-serif; font-weight: 800; font-size: 11px; padding: 10px 24px; cursor: pointer; text-transform: uppercase; margin-top: 4px; border: 2px solid #111111; box-shadow: 3px 3px 0px #111111;">
            INICIAR SESIÓN / CREAR CUENTA ↗
          </button>
        </div>
      `;
      const loginTrigger = document.getElementById('btn-explore-login-trigger');
      if (loginTrigger) {
        loginTrigger.addEventListener('click', () => {
          const loginModal = document.getElementById('modal-login');
          if (loginModal) {
            loginModal.classList.add('open');
            const title = document.getElementById('modal-login-title');
            if (title) title.textContent = 'ACCESO A EXPLORA // REGISTRO REQUERIDO';
          }
        });
      }
      window.lucide?.createIcons({ context: exploreContainer });
    }
    return;
  }

  if (!publicCollectionsCache.length && publicContainer) {
    publicContainer.innerHTML = `<div class="explore-loading">CONSULTANDO LISTAS PÚBLICAS DE LA COMUNIDAD...</div>`;
    try {
      publicCollectionsCache = await fetchAllPublicCollections();
    } catch (err) {
      console.warn('Error al cargar listas públicas:', err);
      publicCollectionsCache = [];
    }
  }

  const q = query.trim().toLowerCase();

  // Visibilidad por subpestañas
  if (curatedSection) curatedSection.style.display = (activeExploreTab === 'all' || activeExploreTab === 'curated') ? 'block' : 'none';
  if (publicSection) publicSection.style.display = (activeExploreTab === 'all' || activeExploreTab === 'public') ? 'block' : 'none';

  // 1. Filtrar y renderizar Selecciones Curatoriales
  const allCurated = await getCuratedRoutes();
  let curatedRoutes = (allCurated || CURATED_ROUTES).filter((r) => r.active !== false);
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
              <span class="radar-route-tag" style="color:${route.color}; border-color:${route.color};">${escapeHtml(route.tag)}</span>
              <span class="radar-route-stops">${stopsLabel}</span>
            </div>
            <h4 class="radar-route-title">${escapeHtml(route.title)}</h4>
            <p class="radar-route-desc">${escapeHtml(route.subtitle)}</p>
            <button type="button" class="radar-route-btn" data-curated-id="${escapeHtml(route.id)}">INICIAR ITINERARIO</button>
          </div>
        `;
      }).join('');
    } else {
      curatedContainer.innerHTML = `<div style="font-size:11px; color:var(--fg-dim); padding:4px 0;">NINGUNA SELECCIÓN CURATORIAL COINCIDENTE</div>`;
    }
  }

  // 2. Filtrar y renderizar Colecciones Públicas de la Comunidad
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
        <div class="explore-empty-state" style="padding: 24px 16px; text-align: center; border: 1.5px dashed var(--border-strong, #111111); background: rgba(17,17,17,0.02);">
          <div class="font-display text-sm font-bold" style="color:var(--fg);">${q ? 'NO HAY LISTAS DE USUARIO COINCIDENTES' : 'NO HAY COLECCIONES PÚBLICAS AÚN'}</div>
          <p class="text-xs text-dim" style="margin-top: 4px;">${q ? 'Prueba con otro término de búsqueda.' : 'Sé el primero en compartir una lista pública desde tu perfil.'}</p>
        </div>
      `;
    } else {
      publicContainer.innerHTML = `
        <div class="public-collections-grid" style="display: grid; gap: 12px;">
          ${collections.map((col) => {
            const authorNick = col.profiles?.nick ? `@${col.profiles.nick}` : (col.profiles?.first_name ? `@${col.profiles.first_name}` : 'Comunidad Nolli');
            const emoji = col.icon || '';
            const title = col.name || 'Colección sin título';
            const desc = col.description || 'Selección curatorial comunitaria';
            
            // Conteo de obras asociadas si viene en items o aproximado
            const itemsCount = (state.userCollectionItems || []).filter(i => String(i.collection_id) === String(col.id)).length;
            const countLabel = itemsCount > 0 ? `${itemsCount} OBRAS` : 'PÚBLICA';

            const isOwn = String(col.user_id) === String(state.userId);
            const isFollowing = (state.userFollowedCollections || []).some(f => String(f.collection_id) === String(col.id));

            return `
              <article class="public-collection-card" data-collection-id="${escapeHtml(col.id)}" style="background:var(--bg-panel, #F8F1DF); border:1.5px solid var(--border-strong, #111111); box-shadow:3px 3px 0px #111111; padding:12px; display:grid; gap:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:16px;">${escapeHtml(emoji)}</span>
                    <strong style="font-family:'League Spartan',sans-serif; font-size:15px; color:var(--fg);">${escapeHtml(title)}</strong>
                  </div>
                  <span style="font-family: 'Inter', sans-serif; font-size:9px; font-weight:800; color:var(--accent, #E84E1B);">${countLabel}</span>
                </div>
                
                ${desc ? `<p style="font-size:11px; color:var(--fg-dim); line-height:1.4; margin:0;">${escapeHtml(desc)}</p>` : ''}
                
                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(17,17,17,0.1); padding-top:8px; margin-top:2px;">
                  <span style="font-size:10px; font-family: 'Inter', sans-serif; color:var(--fg-dim);">Por <strong style="color:var(--fg);">${escapeHtml(authorNick)}</strong></span>
                  
                  <div style="display:flex; gap:6px; align-items:center;">
                    ${!isOwn ? `
                      <button type="button" class="btn-follow-collection" data-follow-collection-id="${col.id}" style="font-family: 'Inter', sans-serif; font-size:9.5px; font-weight:800; padding:4px 8px; border:1.5px solid ${isFollowing ? 'var(--accent, #E84E1B)' : 'var(--border-strong, #111111)'}; background:${isFollowing ? 'var(--accent, #E84E1B)' : 'transparent'}; color:${isFollowing ? '#FFF' : 'var(--fg)'}; cursor:pointer;">
                        ${isFollowing ? 'SIGUIENDO' : '+ SEGUIR'}
                      </button>
                    ` : `
                      <span style="font-size:9px; font-family: 'Inter', sans-serif; color:var(--accent, #E84E1B); font-weight:800;">TU LISTA</span>
                    `}
                    
                    <button type="button" class="btn-view-collection-map" data-view-collection-id="${col.id}" style="font-family: 'Inter', sans-serif; font-size:9.5px; font-weight:800; padding:4px 8px; border:1.5px solid var(--border-strong, #111111); background:var(--bg-card, #FFFFFF); color:var(--fg); cursor:pointer;">VER EN MAPA ↗</button>
                  </div>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      `;
    }
  }

  window.lucide?.createIcons({ context: document.getElementById('explore-panel') });
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

  // Delegación de clics para rutas, colecciones y seguir listas
  if (container) {
    container.addEventListener('click', async (e) => {
      // 1. Seguir / Dejar de seguir Colección
      const followBtn = e.target.closest('[data-follow-collection-id]');
      if (followBtn) {
        e.stopPropagation();
        e.preventDefault();
        const colId = followBtn.dataset.followCollectionId;
        
        if (!state.sessionToken || !state.userId) {
          const loginModal = document.getElementById('modal-login');
          if (loginModal) loginModal.classList.add('open');
          return;
        }

        const isFollowing = (state.userFollowedCollections || []).some(f => String(f.collection_id) === String(colId));
        followBtn.disabled = true;
        followBtn.textContent = '[ ... ]';

        try {
          if (isFollowing) {
            await unfollowCollection(colId, state.userId, state.sessionToken);
            state.userFollowedCollections = state.userFollowedCollections.filter(f => String(f.collection_id) !== String(colId));
          } else {
            await followCollection(colId, state.userId, state.sessionToken);
            state.userFollowedCollections.push({ collection_id: colId, user_id: state.userId });
          }
          await renderPublicCollections(searchInput?.value || '');
        } catch (err) {
          alert(err.message || 'No se pudo actualizar el seguimiento de la lista.');
          await renderPublicCollections(searchInput?.value || '');
        }
        return;
      }

      // 2. Ver Colección Pública en Mapa
      const viewColBtn = e.target.closest('[data-view-collection-id]');
      if (viewColBtn) {
        e.stopPropagation();
        e.preventDefault();
        const colId = viewColBtn.dataset.viewCollectionId;
        const col = publicCollectionsCache.find((c) => String(c.id) === String(colId));
        if (!col) return;

        if (panel) panel.classList.remove('open');
        const backdrop = document.getElementById('panel-backdrop');
        if (backdrop) backdrop.classList.remove('active');

        window.location.hash = `#list=${encodeURIComponent(col.id)}`;
        return;
      }

      // 3. Tap en Ruta Curatorial Nolli
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
    });
  }

  document.addEventListener('radar:data-ready', () => {
    if (panel && panel.classList.contains('open')) {
      renderPublicCollections(searchInput?.value || '');
    }
  });

  document.addEventListener('radar:user-session-ready', async () => {
    if (state.userId && state.sessionToken) {
      try {
        state.userFollowedCollections = await fetchFollowedCollections(state.userId, state.sessionToken);
      } catch {}
    }
    if (panel && panel.classList.contains('open')) {
      renderPublicCollections(searchInput?.value || '');
    }
  });

  ['radar:user-login', 'radar:logout', 'radar:admin-login'].forEach((evt) => {
    document.addEventListener(evt, () => {
      if (panel && panel.classList.contains('open')) {
        renderPublicCollections(searchInput?.value || '');
      }
    });
  });
}
