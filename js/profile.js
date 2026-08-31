/* =========================================================================
   PROFILE.JS — Lógica de la Vista de Perfil Editorial ("Tú")
   Sincronizado con Supabase, Mapbox y estética pura Neo-Bauhaus
   Gestión completa de Listas, Favoritos, Visitados y Notas
   ========================================================================= */

import {
  fetchBuildings,
  fetchBuildingsByIds,
  fetchCurrentUser,
  fetchBuildingStatuses,
  saveBuildingStatus,
  fetchUserCollections,
  fetchUserCollectionItems,
  fetchUserPrivateLabels,
  createUserCollection,
  updateUserCollection,
  deleteUserCollection,
  deleteUserCollectionItem,
  updateCurrentUserProfile,
  upsertCurrentProfile,
  fetchCurrentProfile,
  loginAdmin,
  registerUser,
  requestPasswordReset,
  refreshUserSession,
} from './api.js';

import {
  state,
  cargarZonaPersonalLocal,
  guardarZonaPersonalLocal,
  aplicarPreferenciasMapaColecciones,
} from './state.js';

const SESSION_KEY = 'nolli_admin_session_token';
const content = document.getElementById('profile-content');
const authRequired = document.getElementById('profile-auth-required');
const app = document.getElementById('profile-app');
const logoutBtn = document.getElementById('btn-profile-logout');
const themeBtn = document.getElementById('btn-theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const settingsBtn = document.getElementById('btn-profile-settings');

// Modales
const modalLogin = document.getElementById('modal-login');
const btnProfileLoginCta = document.getElementById('btn-profile-login-cta');
const btnLoginClose = document.getElementById('btn-login-close');

const modalEditProfile = document.getElementById('modal-edit-profile');
const formEditProfile = document.getElementById('form-edit-profile');
const btnCloseEditProfile = document.getElementById('btn-edit-profile-close');
const editStatus = document.getElementById('profile-edit-status');

const modalCollection = document.getElementById('modal-collection');
const formCollection = document.getElementById('form-collection');
const btnCloseCollection = document.getElementById('btn-modal-collection-close');
const btnCancelCollection = document.getElementById('btn-collection-cancel');
const collectionStatus = document.getElementById('collection-modal-status');

const modalEditNote = document.getElementById('modal-edit-note');
const formEditNote = document.getElementById('form-edit-note');
const btnCloseNote = document.getElementById('btn-modal-note-close');
const btnDeleteNoteModal = document.getElementById('btn-delete-note-modal');
const noteStatus = document.getElementById('note-modal-status');

let activeTab = 'collections'; // 'collections' | 'favorite' | 'visited' | 'notes'
let loginInitialized = false;

let profileState = {
  user: null,
  dbProfile: null,
  buildings: [],
  statuses: new Map(),
  collections: [],
  items: [],
  labels: [],
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[character]));
}

function getSessionToken() {
  const stored = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return parsed.access_token || stored;
  } catch {
    return stored;
  }
}

// -------------------------------------------------------------------------
// GESTIÓN DE TEMA (CLARO / OSCURO)
// -------------------------------------------------------------------------
function initTheme() {
  const savedTheme = localStorage.getItem('nolli_theme') || localStorage.getItem('nolli_map_style');
  const isDark = savedTheme === 'dark';
  document.documentElement.classList.toggle('dark-mode', isDark);
  document.body.classList.toggle('dark-mode', isDark);
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.setAttribute('content', isDark ? '#141411' : '#F8F1DF');
  updateThemeIcon(isDark);

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const nowDark = document.body.classList.toggle('dark-mode');
      document.documentElement.classList.toggle('dark-mode', nowDark);
      localStorage.setItem('nolli_theme', nowDark ? 'dark' : 'light');
      localStorage.setItem('nolli_map_style', nowDark ? 'dark' : 'abstract');
      const metaEl = document.getElementById('meta-theme-color');
      if (metaEl) metaEl.setAttribute('content', nowDark ? '#141411' : '#F8F1DF');
      updateThemeIcon(nowDark);
      if (window.lucide) window.lucide.createIcons();
    });
  }
}

function updateThemeIcon(isDark) {
  if (!themeIcon) return;
  themeIcon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
  if (window.lucide) window.lucide.createIcons();
}

// -------------------------------------------------------------------------
// HELPERS DE ACCESO A OBRAS
// -------------------------------------------------------------------------
const obraFor = (id) => profileState.buildings.find((b) => String(b.id) === String(id));
const statusBuildings = (key) => profileState.buildings.filter((b) => profileState.statuses.get(String(b.id))?.[key]);
const notedBuildings = () => profileState.buildings.filter((b) => Boolean(profileState.statuses.get(String(b.id))?.notas?.trim()));

async function asegurarObrasFaltantes(neededIds) {
  const missing = (neededIds || []).filter((id) => id && !profileState.buildings.some((b) => String(b.id) === String(id)));
  if (!missing.length) return;
  try {
    const fetched = await fetchBuildingsByIds(missing);
    if (Array.isArray(fetched) && fetched.length > 0) {
      let added = false;
      fetched.forEach((b) => {
        if (!profileState.buildings.some((existing) => String(existing.id) === String(b.id))) {
          profileState.buildings.push(b);
          added = true;
        }
      });
      if (added) {
        renderMetrics();
        renderFeedContent();
      }
    }
  } catch (e) {
    console.warn('Aviso al precargar obras de usuario en perfil:', e);
  }
}

// -------------------------------------------------------------------------
// INICIALIZACIÓN
// -------------------------------------------------------------------------
async function init() {
  initTheme();
  setupNavTabs();
  setupEditProfileModal();
  setupCollectionModal();
  setupNoteModal();
  setupFeedActionHandlers();
  setupLoginModal();

  const token = getSessionToken();

  // 1. Si NO está autenticado, mostramos invitación
  if (!token) {
    if (authRequired) authRequired.classList.remove('hidden');
    if (app) app.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (settingsBtn) settingsBtn.classList.add('hidden');
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // 2. Si está autenticado, mostramos perfil
  if (authRequired) authRequired.classList.add('hidden');
  if (app) app.classList.remove('hidden');
  if (logoutBtn) logoutBtn.classList.remove('hidden');
  if (settingsBtn) settingsBtn.classList.remove('hidden');

  // 3. Restauración instantánea desde caché local
  const cachedUserStr = localStorage.getItem('nolli_cached_user');
  const cachedDbProfileStr = localStorage.getItem('nolli_cached_db_profile');
  const cachedStatusesStr = localStorage.getItem('nolli_cached_statuses');
  const cachedBuildingsStr = localStorage.getItem('nolli_cached_buildings');

  if (cachedUserStr) {
    try {
      profileState.user = JSON.parse(cachedUserStr);
      cargarZonaPersonalLocal(profileState.user.id);
      profileState.collections = state.userCollections || [];
      profileState.items = state.userCollectionItems || [];
      profileState.labels = state.userPrivateLabels || [];
    } catch {}
  }
  if (cachedDbProfileStr) {
    try {
      profileState.dbProfile = JSON.parse(cachedDbProfileStr);
    } catch {}
  }
  if (cachedStatusesStr) {
    try {
      const parsed = JSON.parse(cachedStatusesStr);
      profileState.statuses = new Map(parsed.map((item) => [String(item.building_id), {
        favorite: item.favorite === true,
        visited: item.visited === true,
        notas: item.notas || '',
        valoracion: item.valoracion || null,
      }]));
    } catch {}
  }
  if (cachedBuildingsStr) {
    try {
      profileState.buildings = JSON.parse(cachedBuildingsStr);
    } catch {}
  }

  renderHero();
  renderMetrics();
  renderFeedContent();

  // Carga del catálogo
  try {
    const buildings = await fetchBuildings({ includeAllImportance: true });
    profileState.buildings = buildings || [];
    if (buildings && buildings.length) {
      localStorage.setItem('nolli_cached_buildings', JSON.stringify(buildings.slice(0, 50)));
    }
  } catch (err) {
    console.warn('Cargando catálogo en perfil:', err);
  }

  try {
    const user = await fetchCurrentUser(token);
    profileState.user = user;

    cargarZonaPersonalLocal(user.id);
    profileState.collections = state.userCollections || [];
    profileState.items = state.userCollectionItems || [];
    profileState.labels = state.userPrivateLabels || [];

    const [statuses, collections, items, labels, dbProfile] = await Promise.all([
      fetchBuildingStatuses(user.id, token).catch(() => []),
      fetchUserCollections(user.id, token).catch(() => profileState.collections),
      fetchUserCollectionItems(user.id, token).catch(() => profileState.items),
      fetchUserPrivateLabels(user.id, token).catch(() => profileState.labels),
      fetchCurrentProfile(user.id, token).catch(() => null),
    ]);

    if (dbProfile) {
      profileState.dbProfile = dbProfile;
      localStorage.setItem('nolli_cached_db_profile', JSON.stringify(dbProfile));
    }

    profileState.statuses = new Map(statuses.map((item) => [String(item.building_id), {
      favorite: item.favorite === true,
      visited: item.visited === true,
      notas: item.notas || '',
      valoracion: item.valoracion || null,
    }]));

    profileState.collections = aplicarPreferenciasMapaColecciones(collections || [], user.id);
    profileState.items = items || [];
    profileState.labels = labels || [];

    state.userCollections = profileState.collections;
    state.userCollectionItems = profileState.items;
    state.userPrivateLabels = profileState.labels;
    guardarZonaPersonalLocal(user.id);

    localStorage.setItem('nolli_cached_user', JSON.stringify(user));
    localStorage.setItem('nolli_cached_statuses', JSON.stringify(statuses));

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem('nolli_cached_user');
        localStorage.removeItem('nolli_cached_db_profile');
        localStorage.removeItem('nolli_cached_statuses');
        window.location.reload();
      });
    }

    // Aseguramos que todas las obras con estados y en colecciones se carguen en memoria
    const neededIds = [
      ...statuses.map((s) => String(s.building_id)),
      ...items.map((i) => String(i.building_id)),
    ];
    await asegurarObrasFaltantes(neededIds);

    renderHero();
    renderMetrics();
    renderFeedContent();
  } catch (error) {
    console.warn('Sesión caducada o error de red:', error);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    if (authRequired) authRequired.classList.remove('hidden');
    if (app) app.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (settingsBtn) settingsBtn.classList.add('hidden');
  }

  if (window.lucide) window.lucide.createIcons();
}

// -------------------------------------------------------------------------
// 2. HERO MONUMENTAL
// -------------------------------------------------------------------------
function renderHero() {
  const user = profileState.user || {};
  const metadata = user.user_metadata || {};
  const db = profileState.dbProfile || {};

  const firstName = (db.first_name !== undefined && db.first_name !== null && db.first_name !== '') ? db.first_name : (metadata.first_name || '');
  const lastName = (db.last_name !== undefined && db.last_name !== null && db.last_name !== '') ? db.last_name : (metadata.last_name || '');
  const fullName = `${firstName} ${lastName}`.trim() || 'LUIS ALBERTO SIGNES SACRISTÁN';

  const nameEl = document.getElementById('profile-hero-name');
  if (nameEl) nameEl.textContent = fullName.toUpperCase();

  const subEl = document.getElementById('profile-hero-sub');
  if (subEl) {
    const bio = (db.bio !== undefined && db.bio !== null && db.bio !== '') ? db.bio : (metadata.bio || 'Arquitecto & ArchViz | SIGNES.STUDIO');
    const city = (db.city !== undefined && db.city !== null && db.city !== '') ? db.city : (metadata.city || 'Valencia');
    const country = (db.country !== undefined && db.country !== null && db.country !== '') ? db.country : (metadata.country || 'España');
    const location = [city, country].filter(Boolean).join(', ');
    const websiteRaw = (db.website !== undefined && db.website !== null && db.website !== '') ? db.website : (metadata.website || '');
    const website = websiteRaw ? ` · ${websiteRaw.replace(/^https?:\/\//, '')}` : '';
    subEl.textContent = `${bio} | ${location}${website}`;
  }
}

// -------------------------------------------------------------------------
// 3. MÉTRICAS
// -------------------------------------------------------------------------
function renderMetrics() {
  let visitedCount = 0;
  let favCount = 0;
  let notesCount = 0;

  profileState.statuses.forEach((status) => {
    if (status.visited) visitedCount++;
    if (status.favorite) favCount++;
    if (status.notas && status.notas.trim()) notesCount++;
  });

  const visEl = document.getElementById('stat-visited-num');
  if (visEl) visEl.textContent = visitedCount;

  const favEl = document.getElementById('stat-favorite-num');
  if (favEl) favEl.textContent = favCount;

  const notesEl = document.getElementById('stat-notes-num');
  if (notesEl) notesEl.textContent = notesCount;

  document.querySelectorAll('[data-metric-tab]').forEach((el) => {
    el.onclick = () => {
      const tab = el.dataset.metricTab;
      switchTab(tab);
    };
  });
}

// -------------------------------------------------------------------------
// 4. NAVEGACIÓN CURATORIAL
// -------------------------------------------------------------------------
function setupNavTabs() {
  const tabButtons = document.querySelectorAll('.profile-curatorial-tab');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.profileTab;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.profile-curatorial-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.profileTab === tab);
  });
  renderFeedContent();
}

// -------------------------------------------------------------------------
// 5. FEED DE OBRAS (ARCHIVO)
// -------------------------------------------------------------------------
function renderFeedContent() {
  if (!content) return;

  if (activeTab === 'visited') {
    renderBuildingsFeed(statusBuildings('visited'), 'visited');
  } else if (activeTab === 'favorite') {
    renderBuildingsFeed(statusBuildings('favorite'), 'favorite');
  } else if (activeTab === 'notes') {
    renderNotesFeed();
  } else {
    renderCollectionsFeed();
  }

  if (window.lucide) window.lucide.createIcons();
}

function renderBuildingsFeed(buildings, tabKey) {
  const isVisited = tabKey === 'visited';
  const emptyText = isVisited
    ? '[ NO TIENES OBRAS MARCADAS COMO VISITADAS. REGISTRA TUS VISITAS DESDE EL MAPA. ]'
    : '[ NO TIENES OBRAS FAVORITAS AÚN. GUARDA OBRAS EN FAVORITOS DESDE EL MAPA. ]';

  if (!buildings.length) {
    content.innerHTML = `
      <div class="profile-feed-empty">
        ${emptyText}
      </div>
    `;
    return;
  }

  content.innerHTML = buildings.map((obra) => {
    const photo = obra.foto_miniatura || obra.foto_url || '';
    const title = obra.nombre_obra || 'Obra de arquitectura';
    const year = obra.año_construccion || 'S. XX';
    const architect = obra.arquitectos ? (Array.isArray(obra.arquitectos) ? obra.arquitectos.join(', ') : obra.arquitectos) : (obra.arquitecto || 'Arquitecto');
    const city = obra.place || obra.ciudad || '';
    const metaParts = [year, architect, city].filter(Boolean).join(' · ');

    const actionBtnHtml = isVisited
      ? `<button type="button" class="profile-card-action-btn danger" data-remove-visited="${obra.id}" title="Quitar de visitados" aria-label="Quitar de visitados">
          <i data-lucide="check" width="12" height="12"></i>
          <span>QUITAR</span>
        </button>`
      : `<button type="button" class="profile-card-action-btn danger" data-remove-favorite="${obra.id}" title="Quitar de favoritos" aria-label="Quitar de favoritos">
          <i data-lucide="star" width="12" height="12"></i>
          <span>QUITAR</span>
        </button>`;

    return `
      <div class="profile-feed-row">
        <a href="./index.html?obra=${encodeURIComponent(obra.id || obra.featureId)}" class="profile-feed-item" aria-label="Ver ${escapeHtml(title)} en el mapa">
          ${photo ? `
            <img src="${escapeHtml(photo)}" alt="${escapeHtml(title)}" class="profile-feed-thumb" loading="lazy" onerror="this.outerHTML='<div class=\\'profile-feed-thumb-fallback\\'>🏛️</div>'">
          ` : `
            <div class="profile-feed-thumb-fallback">🏛️</div>
          `}
          <div class="profile-feed-info">
            <h3 class="profile-feed-title">${escapeHtml(title)}</h3>
            <p class="profile-feed-meta">${escapeHtml(metaParts)}</p>
          </div>
        </a>
        <div class="profile-feed-row-actions">
          ${actionBtnHtml}
        </div>
      </div>
    `;
  }).join('');
}

function renderCollectionsFeed() {
  const collections = profileState.collections || [];

  content.innerHTML = `
    <div class="profile-collections-top">
      <span style="font-family:'JetBrains Mono', monospace; font-size:11px; font-weight:800; color:var(--fg-dim);">[ COLECCIONES // ${collections.length} ]</span>
      <button type="button" class="profile-new-list-btn" id="btn-create-collection-top">
        <span>+ NUEVA LISTA</span>
      </button>
    </div>
  `;

  if (!collections.length) {
    content.innerHTML += `
      <div class="profile-feed-empty">
        [ NO TIENES COLECCIONES CREADAS. PULSA EN "+ NUEVA LISTA" PARA EMPEZAR A ORGANIZAR OBRAS. ]
      </div>
    `;
    return;
  }

  const cardsHtml = collections.map((col) => {
    const items = (profileState.items || []).filter((item) => String(item.collection_id) === String(col.id));
    const countText = `${items.length} ${items.length === 1 ? 'OBRA' : 'OBRAS'}`;
    const isMapActive = col.show_on_map !== false;

    const eyeIconSvg = isMapActive
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;

    const itemsRows = items.map((item) => {
      const obra = obraFor(item.building_id);
      if (!obra) {
        return `
          <div class="profile-collection-work-row">
            <span style="font-size:11px; color:var(--fg-dim);">Obra #${escapeHtml(item.building_id)}</span>
            <button type="button" class="profile-collection-item-remove-btn" data-collection-id="${col.id}" data-remove-item="${item.building_id}" title="Quitar de la lista">✕</button>
          </div>
        `;
      }
      const photo = obra.foto_miniatura || obra.foto_url || '';
      const title = obra.nombre_obra || 'Obra';
      const architect = obra.arquitecto || obra.arquitectos || '';
      const year = obra.año_construccion ? ` · ${obra.año_construccion}` : '';

      return `
        <div class="profile-collection-work-row">
          <a href="./index.html?obra=${encodeURIComponent(obra.id)}" class="profile-collection-work-link">
            ${photo ? `
              <img src="${escapeHtml(photo)}" alt="${escapeHtml(title)}" class="profile-collection-work-thumb" loading="lazy" onerror="this.style.display='none'">
            ` : ''}
            <div style="min-width:0; flex:1;">
              <div class="profile-collection-work-title">${escapeHtml(title)}</div>
              <div class="profile-collection-work-meta">${escapeHtml(architect)}${escapeHtml(year)}</div>
            </div>
          </a>
          <button type="button" class="profile-collection-item-remove-btn" data-collection-id="${col.id}" data-remove-item="${obra.id}" title="Quitar de la lista">✕</button>
        </div>
      `;
    }).join('') || '<div style="font-size:11px; color:var(--fg-dim); padding:6px 0;">[ Lista sin obras añadidas aún ]</div>';

    return `
      <article class="profile-collection-card" data-col-id="${col.id}">
        <div class="profile-collection-card-head">
          <div style="min-width:0; flex:1;">
            <div class="profile-collection-head-row">
              <h3 class="profile-collection-name">${col.icon ? `${escapeHtml(col.icon)} ` : ''}${escapeHtml(col.name)}</h3>
              <span class="profile-collection-count-badge">[ ${countText} ]</span>
            </div>
            ${col.description ? `<p class="profile-collection-desc" style="margin-top:4px;">${escapeHtml(col.description)}</p>` : ''}
          </div>
          <div class="profile-collection-tools">
            <button type="button" class="profile-collection-tool-btn ${isMapActive ? 'active' : ''}" data-toggle-map-col="${col.id}" title="${isMapActive ? 'Ocultar iconos en mapa' : 'Mostrar iconos en mapa'}">
              ${eyeIconSvg}
            </button>
            <button type="button" class="profile-collection-tool-btn" data-edit-col="${col.id}" title="Editar lista">
              <i data-lucide="edit-2" width="13" height="13"></i>
            </button>
            <button type="button" class="profile-collection-tool-btn btn-delete" data-delete-col="${col.id}" title="Borrar lista">
              <i data-lucide="trash-2" width="13" height="13"></i>
            </button>
          </div>
        </div>
        <div class="profile-collection-items-table">
          ${itemsRows}
        </div>
      </article>
    `;
  }).join('');

  content.innerHTML += cardsHtml;
}

function renderNotesFeed() {
  const buildingsWithNotes = notedBuildings();

  if (!buildingsWithNotes.length) {
    content.innerHTML = `
      <div class="profile-feed-empty">
        [ NO TIENES NOTAS PRIVADAS REGISTRADAS AÚN. REGISTRA TUS NOTAS EN CUALQUIER OBRA DESDE EL MAPA. ]
      </div>
    `;
    return;
  }

  content.innerHTML = buildingsWithNotes.map((obra) => {
    const status = profileState.statuses.get(String(obra.id)) || {};
    const noteText = status.notas || '';
    const photo = obra.foto_miniatura || obra.foto_url || '';
    const title = obra.nombre_obra || 'Obra';
    const year = obra.año_construccion ? ` · ${obra.año_construccion}` : '';
    const architect = obra.arquitecto || obra.arquitectos || '';

    return `
      <article class="profile-collection-card" data-note-building-id="${obra.id}">
        <div class="profile-collection-card-head">
          <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">
            ${photo ? `
              <img src="${escapeHtml(photo)}" alt="${escapeHtml(title)}" class="profile-feed-thumb" style="width:50px; height:50px; min-width:50px; min-height:50px;" loading="lazy">
            ` : `
              <div class="profile-feed-thumb-fallback" style="width:50px; height:50px; min-width:50px; min-height:50px; font-size:16px;">📝</div>
            `}
            <div style="min-width:0; flex:1;">
              <a href="./index.html?obra=${encodeURIComponent(obra.id)}" class="profile-feed-title" style="font-size:14px; text-decoration:none;">${escapeHtml(title)}${escapeHtml(year)}</a>
              <div class="profile-feed-meta" style="font-size:11px;">${escapeHtml(architect)}</div>
            </div>
          </div>
          <div class="profile-collection-tools">
            <button type="button" class="profile-card-action-btn" data-edit-note="${obra.id}" title="Editar nota">
              <i data-lucide="edit-2" width="12" height="12"></i>
              <span>EDITAR</span>
            </button>
            <button type="button" class="profile-card-action-btn danger" data-delete-note="${obra.id}" title="Eliminar nota">
              <i data-lucide="trash-2" width="12" height="12"></i>
              <span>BORRAR</span>
            </button>
          </div>
        </div>
        <div style="background:var(--bg-raised, #ECE6D8); padding:10px 12px; border-left:3px solid var(--accent, #E84E1B); font-size:13px; line-height:1.5; color:var(--fg);">
          “${escapeHtml(noteText)}”
        </div>
      </article>
    `;
  }).join('');
}

// -------------------------------------------------------------------------
// 6. GESTIÓN DE ACCIONES DE FEED (EVENT DELEGATION)
// -------------------------------------------------------------------------
function setupFeedActionHandlers() {
  if (!content) return;

  content.addEventListener('click', async (e) => {
    const token = getSessionToken();
    const user = profileState.user;
    if (!token || !user) return;

    // 1. Quitar de favoritos
    const btnRemoveFav = e.target.closest('[data-remove-favorite]');
    if (btnRemoveFav) {
      const buildingId = btnRemoveFav.dataset.removeFavorite;
      await toggleStatus(buildingId, { favorite: false });
      return;
    }

    // 2. Quitar de visitados
    const btnRemoveVisited = e.target.closest('[data-remove-visited]');
    if (btnRemoveVisited) {
      const buildingId = btnRemoveVisited.dataset.removeVisited;
      await toggleStatus(buildingId, { visited: false });
      return;
    }

    // 3. Crear lista desde el botón superior
    const btnCreateCol = e.target.closest('#btn-create-collection-top');
    if (btnCreateCol) {
      abrirModalCrearLista();
      return;
    }

    // 4. Editar colección
    const btnEditCol = e.target.closest('[data-edit-col]');
    if (btnEditCol) {
      abrirModalEditarLista(btnEditCol.dataset.editCol);
      return;
    }

    // 5. Borrar colección
    const btnDeleteCol = e.target.closest('[data-delete-col]');
    if (btnDeleteCol) {
      await borrarColeccion(btnDeleteCol.dataset.deleteCol);
      return;
    }

    // 6. Alternar mapa en colección
    const btnToggleMap = e.target.closest('[data-toggle-map-col]');
    if (btnToggleMap) {
      const colId = btnToggleMap.dataset.toggleMapCol;
      const col = profileState.collections.find((c) => String(c.id) === String(colId));
      if (col) {
        col.show_on_map = col.show_on_map === false ? true : false;
        guardarColeccionesLocalmente();
        renderFeedContent();
      }
      return;
    }

    // 7. Quitar obra de colección
    const btnRemoveItem = e.target.closest('[data-remove-item]');
    if (btnRemoveItem) {
      const collectionId = btnRemoveItem.dataset.collectionId;
      const buildingId = btnRemoveItem.dataset.removeItem;
      await quitarObraDeColeccion(collectionId, buildingId);
      return;
    }

    // 8. Editar nota
    const btnEditNote = e.target.closest('[data-edit-note]');
    if (btnEditNote) {
      abrirModalEditarNota(btnEditNote.dataset.editNote);
      return;
    }

    // 9. Borrar nota
    const btnDeleteNote = e.target.closest('[data-delete-note]');
    if (btnDeleteNote) {
      await borrarNota(btnDeleteNote.dataset.deleteNote);
      return;
    }
  });
}

// -------------------------------------------------------------------------
// FUNCIONES CRUD
// -------------------------------------------------------------------------
async function toggleStatus(buildingId, statusUpdate) {
  const token = getSessionToken();
  const user = profileState.user;
  if (!token || !user) return;

  const current = profileState.statuses.get(String(buildingId)) || {};
  const next = { ...current, ...statusUpdate };
  profileState.statuses.set(String(buildingId), next);

  // Sincronizar con state global y storage
  state.buildingStatuses.set(String(buildingId), next);
  localStorage.setItem(`nolli:building-status:${user.id}`, JSON.stringify([...state.buildingStatuses.entries()]));
  localStorage.setItem('nolli_cached_statuses', JSON.stringify([...profileState.statuses.entries()].map(([id, s]) => ({ building_id: id, ...s }))));

  renderMetrics();
  renderFeedContent();

  try {
    await saveBuildingStatus(user.id, buildingId, next, token);
  } catch (err) {
    console.warn('Aviso sincronizando estado con Supabase:', err);
  }
}

function guardarColeccionesLocalmente() {
  const user = profileState.user;
  if (!user) return;
  state.userCollections = profileState.collections;
  state.userCollectionItems = profileState.items;
  guardarZonaPersonalLocal(user.id);
}

async function borrarColeccion(collectionId) {
  const token = getSessionToken();
  const user = profileState.user;
  if (!token || !user || !collectionId) return;

  const col = profileState.collections.find((c) => String(c.id) === String(collectionId));
  if (!window.confirm(`¿Eliminar la lista "${col?.name || collectionId}"?`)) return;

  profileState.collections = profileState.collections.filter((c) => String(c.id) !== String(collectionId));
  profileState.items = profileState.items.filter((i) => String(i.collection_id) !== String(collectionId));
  guardarColeccionesLocalmente();
  renderFeedContent();

  try {
    await deleteUserCollection(collectionId, user.id, token);
  } catch (err) {
    console.warn('Aviso borrando lista en Supabase:', err);
  }
}

async function quitarObraDeColeccion(collectionId, buildingId) {
  const token = getSessionToken();
  const user = profileState.user;
  if (!token || !user || !collectionId || !buildingId) return;

  profileState.items = profileState.items.filter(
    (item) => !(String(item.collection_id) === String(collectionId) && String(item.building_id) === String(buildingId))
  );
  guardarColeccionesLocalmente();
  renderFeedContent();

  try {
    await deleteUserCollectionItem(collectionId, user.id, buildingId, token);
  } catch (err) {
    console.warn('Aviso quitando obra de lista en Supabase:', err);
  }
}

async function borrarNota(buildingId) {
  if (!window.confirm('¿Eliminar la nota privada de esta obra?')) return;
  await toggleStatus(buildingId, { notas: '' });
}

// -------------------------------------------------------------------------
// 7. MODAL DE CREAR / EDITAR LISTA
// -------------------------------------------------------------------------
function setupCollectionModal() {
  if (!modalCollection || !formCollection) return;

  if (btnCloseCollection) {
    btnCloseCollection.addEventListener('click', () => modalCollection.classList.remove('open'));
  }
  if (btnCancelCollection) {
    btnCancelCollection.addEventListener('click', () => modalCollection.classList.remove('open'));
  }
  modalCollection.addEventListener('click', (e) => {
    if (e.target === modalCollection) modalCollection.classList.remove('open');
  });

  formCollection.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = getSessionToken();
    const user = profileState.user;
    if (!token || !user) return;

    const editId = document.getElementById('collection-edit-id')?.value || '';
    const icon = document.getElementById('collection-icon')?.value.trim() || '🏛️';
    const name = document.getElementById('collection-name')?.value.trim() || '';
    const description = document.getElementById('collection-desc')?.value.trim() || '';
    const show_on_map = Boolean(document.getElementById('collection-show-map')?.checked);

    if (!name) return;

    const submitBtn = document.getElementById('btn-save-collection');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.querySelector('span').textContent = '[ GUARDANDO... ]';
    }

    try {
      if (editId) {
        // Modificar lista existente
        const col = profileState.collections.find((c) => String(c.id) === String(editId));
        if (col) {
          col.name = name;
          col.icon = icon;
          col.description = description;
          col.show_on_map = show_on_map;
        }
        guardarColeccionesLocalmente();
        renderFeedContent();
        await updateUserCollection(editId, { name, icon, description, show_on_map }, token);
      } else {
        // Crear nueva lista
        const newCol = {
          id: `COL-${Date.now()}`,
          user_id: user.id,
          name,
          icon,
          description,
          show_on_map,
          created_at: new Date().toISOString(),
        };
        const created = await createUserCollection(newCol, token).catch(() => [newCol]);
        const savedCol = (Array.isArray(created) && created[0]) ? { ...created[0], show_on_map } : newCol;
        profileState.collections.push(savedCol);
        guardarColeccionesLocalmente();
        renderFeedContent();
      }

      modalCollection.classList.remove('open');
    } catch (err) {
      if (collectionStatus) {
        collectionStatus.textContent = `[ ERROR: ${err.message || 'No se pudo guardar'} ]`;
        collectionStatus.classList.remove('hidden');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.querySelector('span').textContent = '[ GUARDAR LISTA ]';
      }
    }
  });
}

function abrirModalCrearLista() {
  if (!modalCollection) return;
  const title = document.getElementById('modal-collection-title');
  const editIdInput = document.getElementById('collection-edit-id');
  const iconInput = document.getElementById('collection-icon');
  const nameInput = document.getElementById('collection-name');
  const descInput = document.getElementById('collection-desc');
  const mapToggle = document.getElementById('collection-show-map');

  if (title) title.textContent = '[ NUEVA LISTA ]';
  if (editIdInput) editIdInput.value = '';
  if (iconInput) iconInput.value = '🏛️';
  if (nameInput) nameInput.value = '';
  if (descInput) descInput.value = '';
  if (mapToggle) mapToggle.checked = true;
  if (collectionStatus) collectionStatus.classList.add('hidden');

  modalCollection.classList.add('open');
  if (window.lucide) window.lucide.createIcons();
}

function abrirModalEditarLista(colId) {
  if (!modalCollection) return;
  const col = profileState.collections.find((c) => String(c.id) === String(colId));
  if (!col) return;

  const title = document.getElementById('modal-collection-title');
  const editIdInput = document.getElementById('collection-edit-id');
  const iconInput = document.getElementById('collection-icon');
  const nameInput = document.getElementById('collection-name');
  const descInput = document.getElementById('collection-desc');
  const mapToggle = document.getElementById('collection-show-map');

  if (title) title.textContent = '[ EDITAR LISTA ]';
  if (editIdInput) editIdInput.value = col.id;
  if (iconInput) iconInput.value = col.icon || '🏛️';
  if (nameInput) nameInput.value = col.name || '';
  if (descInput) descInput.value = col.description || '';
  if (mapToggle) mapToggle.checked = col.show_on_map !== false;
  if (collectionStatus) collectionStatus.classList.add('hidden');

  modalCollection.classList.add('open');
  if (window.lucide) window.lucide.createIcons();
}

// -------------------------------------------------------------------------
// 8. MODAL DE NOTAS
// -------------------------------------------------------------------------
function setupNoteModal() {
  if (!modalEditNote || !formEditNote) return;

  if (btnCloseNote) {
    btnCloseNote.addEventListener('click', () => modalEditNote.classList.remove('open'));
  }
  modalEditNote.addEventListener('click', (e) => {
    if (e.target === modalEditNote) modalEditNote.classList.remove('open');
  });

  if (btnDeleteNoteModal) {
    btnDeleteNoteModal.addEventListener('click', async () => {
      const buildingId = document.getElementById('note-building-id')?.value;
      if (!buildingId) return;
      if (!window.confirm('¿Eliminar la nota privada de esta obra?')) return;
      modalEditNote.classList.remove('open');
      await toggleStatus(buildingId, { notas: '' });
    });
  }

  formEditNote.addEventListener('submit', async (e) => {
    e.preventDefault();
    const buildingId = document.getElementById('note-building-id')?.value;
    const text = document.getElementById('note-text-input')?.value.trim() || '';
    if (!buildingId) return;

    const submitBtn = document.getElementById('btn-save-note');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.querySelector('span').textContent = '[ GUARDANDO... ]';
    }

    try {
      await toggleStatus(buildingId, { notas: text });
      modalEditNote.classList.remove('open');
    } catch (err) {
      if (noteStatus) {
        noteStatus.textContent = `[ ERROR: ${err.message || 'No se pudo guardar la nota'} ]`;
        noteStatus.classList.remove('hidden');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.querySelector('span').textContent = '[ GUARDAR NOTA ]';
      }
    }
  });
}

function abrirModalEditarNota(buildingId) {
  if (!modalEditNote) return;
  const obra = obraFor(buildingId);
  const status = profileState.statuses.get(String(buildingId)) || {};

  const buildingIdInput = document.getElementById('note-building-id');
  const buildingTitle = document.getElementById('modal-note-building-title');
  const noteTextInput = document.getElementById('note-text-input');

  if (buildingIdInput) buildingIdInput.value = buildingId;
  if (buildingTitle) buildingTitle.textContent = obra?.nombre_obra ? obra.nombre_obra.toUpperCase() : `EDIFICIO #${buildingId}`;
  if (noteTextInput) noteTextInput.value = status.notas || '';
  if (noteStatus) noteStatus.classList.add('hidden');

  modalEditNote.classList.add('open');
  if (window.lucide) window.lucide.createIcons();
}

// -------------------------------------------------------------------------
// 9. MODAL DE PERSONALIZACIÓN DE PERFIL
// -------------------------------------------------------------------------
function setupEditProfileModal() {
  if (settingsBtn && modalEditProfile) {
    settingsBtn.addEventListener('click', () => {
      const user = profileState.user || {};
      const metadata = user.user_metadata || {};
      const db = profileState.dbProfile || {};

      const inFirstName = document.getElementById('edit-profile-firstname');
      const inLastName = document.getElementById('edit-profile-lastname');
      const inBio = document.getElementById('edit-profile-bio');
      const inCity = document.getElementById('edit-profile-city');
      const inCountry = document.getElementById('edit-profile-country');
      const inWebsite = document.getElementById('edit-profile-website');

      if (inFirstName) inFirstName.value = (db.first_name !== undefined && db.first_name !== null) ? db.first_name : (metadata.first_name || 'Luis Alberto');
      if (inLastName) inLastName.value = (db.last_name !== undefined && db.last_name !== null) ? db.last_name : (metadata.last_name || 'Signes Sacristán');
      if (inBio) inBio.value = (db.bio !== undefined && db.bio !== null) ? db.bio : (metadata.bio || 'Arquitecto & ArchViz | SIGNES.STUDIO');
      if (inCity) inCity.value = (db.city !== undefined && db.city !== null) ? db.city : (metadata.city || 'Valencia');
      if (inCountry) inCountry.value = (db.country !== undefined && db.country !== null) ? db.country : (metadata.country || 'España');
      if (inWebsite) inWebsite.value = (db.website !== undefined && db.website !== null) ? db.website : (metadata.website || 'https://signes.studio');

      if (editStatus) editStatus.classList.add('hidden');
      modalEditProfile.classList.add('open');
      if (window.lucide) window.lucide.createIcons();
    });
  }

  if (btnCloseEditProfile && modalEditProfile) {
    btnCloseEditProfile.addEventListener('click', () => {
      modalEditProfile.classList.remove('open');
    });
  }

  if (modalEditProfile) {
    modalEditProfile.addEventListener('click', (e) => {
      if (e.target === modalEditProfile) {
        modalEditProfile.classList.remove('open');
      }
    });
  }

  if (formEditProfile) {
    formEditProfile.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = getSessionToken();
      const user = profileState.user;
      if (!token || !user) return;

      const firstName = document.getElementById('edit-profile-firstname')?.value || '';
      const lastName = document.getElementById('edit-profile-lastname')?.value || '';
      const bio = document.getElementById('edit-profile-bio')?.value || '';
      const city = document.getElementById('edit-profile-city')?.value || '';
      const country = document.getElementById('edit-profile-country')?.value || '';
      const website = document.getElementById('edit-profile-website')?.value || '';

      const submitBtn = document.getElementById('btn-save-profile');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.querySelector('span').textContent = '[ GUARDANDO CAMBIOS... ]';
      }

      const updatedProfile = {
        firstName,
        lastName,
        bio,
        city,
        country,
        website,
      };

      try {
        await Promise.all([
          updateCurrentUserProfile(token, updatedProfile).catch(() => {}),
          upsertCurrentProfile(user, updatedProfile, token),
        ]);

        profileState.dbProfile = {
          ...(profileState.dbProfile || {}),
          id: user.id,
          first_name: firstName,
          last_name: lastName,
          bio,
          city,
          country,
          website,
        };
        localStorage.setItem('nolli_cached_db_profile', JSON.stringify(profileState.dbProfile));

        user.user_metadata = {
          ...user.user_metadata,
          first_name: firstName,
          last_name: lastName,
          bio,
          city,
          country,
          website,
        };
        localStorage.setItem('nolli_cached_user', JSON.stringify(user));
        state.userProfile = updatedProfile;

        renderHero();

        if (editStatus) {
          editStatus.textContent = '[ PERFIL ACTUALIZADO CON ÉXITO ]';
          editStatus.classList.remove('hidden');
        }

        setTimeout(() => {
          modalEditProfile.classList.remove('open');
          if (editStatus) editStatus.classList.add('hidden');
        }, 1200);
      } catch (err) {
        if (editStatus) {
          editStatus.textContent = `[ ERROR: ${err.message || 'No se pudo guardar'} ]`;
          editStatus.classList.remove('hidden');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.querySelector('span').textContent = '[ GUARDAR CAMBIOS ]';
        }
      }
    });
  }
}

// -------------------------------------------------------------------------
// 10. MODAL DE AUTENTICACIÓN / LOGIN EN PERFIL
// -------------------------------------------------------------------------
function setupLoginModal() {
  if (loginInitialized) return;
  loginInitialized = true;

  const mLogin = document.getElementById('modal-login');
  const btnLoginCta = document.getElementById('btn-profile-login-cta');
  const btnLoginClose = document.getElementById('btn-login-close');
  const loginForm = document.getElementById('login-form');
  const actionButton = document.getElementById('btn-do-login');
  const registerButton = document.getElementById('btn-register-mode');
  const registerOnlyFields = document.querySelectorAll('.register-only-field');
  const loginEntryFields = document.querySelectorAll('.login-entry-field');
  const keepSession = document.getElementById('keep-session');
  const forgotPasswordButton = document.getElementById('btn-forgot-password');
  const passwordInput = document.getElementById('login-password');
  const togglePassword = document.getElementById('toggle-password');
  const err = document.getElementById('login-error');
  const termsCheckbox = document.getElementById('register-terms');
  const newsletterCheckbox = document.getElementById('register-newsletter');
  let registerMode = false;

  const openModal = () => {
    if (!mLogin) return;
    if (err) err.classList.add('hidden');
    mLogin.classList.add('open');
    if (window.lucide) window.lucide.createIcons();
  };

  const closeModal = () => {
    if (!mLogin) return;
    mLogin.classList.remove('open');
  };

  if (btnLoginCta) btnLoginCta.addEventListener('click', openModal);
  if (btnLoginClose) btnLoginClose.addEventListener('click', closeModal);
  if (mLogin) {
    mLogin.addEventListener('click', (e) => {
      if (e.target === mLogin) closeModal();
    });
  }

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', () => {
      const showing = passwordInput.type === 'text';
      passwordInput.type = showing ? 'password' : 'text';
      togglePassword.setAttribute('aria-label', showing ? 'Mostrar contraseña' : 'Ocultar contraseña');
      togglePassword.setAttribute('aria-pressed', String(!showing));
      togglePassword.innerHTML = `<i data-lucide="${showing ? 'eye' : 'eye-off'}" width="15" height="15"></i>`;
      if (window.lucide) window.lucide.createIcons();
    });
  }

  if (registerButton) {
    registerButton.addEventListener('click', () => {
      registerMode = !registerMode;
      registerOnlyFields.forEach((field) => field.classList.toggle('hidden', !registerMode));
      if (actionButton) actionButton.textContent = registerMode ? 'COMPLETAR REGISTRO' : 'AUTORIZAR ACCESO';
      registerButton.textContent = registerMode ? 'VOLVER A INICIO DE SESIÓN' : 'CREAR CUENTA';
      if (termsCheckbox) termsCheckbox.required = registerMode;
      if (termsCheckbox && !registerMode) termsCheckbox.checked = false;
      if (err) err.classList.add('hidden');
      if (window.lucide) window.lucide.createIcons();
    });
  }

  if (forgotPasswordButton) {
    forgotPasswordButton.addEventListener('click', async () => {
      const email = document.getElementById('login-email')?.value.trim();
      if (!email) {
        if (err) {
          err.textContent = 'Escribe tu email para enviarte el enlace.';
          err.classList.remove('hidden');
        }
        return;
      }
      forgotPasswordButton.disabled = true;
      forgotPasswordButton.textContent = 'ENVIANDO ENLACE...';
      try {
        await requestPasswordReset(email);
        if (err) {
          err.textContent = 'Revisa tu correo para restablecer la contraseña.';
          err.classList.remove('hidden');
        }
      } catch (error) {
        if (err) {
          err.textContent = error.message;
          err.classList.remove('hidden');
        }
      } finally {
        forgotPasswordButton.disabled = false;
        forgotPasswordButton.textContent = '¿OLVIDASTE LA CONTRASEÑA?';
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (err) err.classList.add('hidden');
      const email = document.getElementById('login-email')?.value.trim();
      const password = document.getElementById('login-password')?.value;

      if (!email || !password) {
        if (err) {
          err.textContent = 'Introduce tu correo y contraseña.';
          err.classList.remove('hidden');
        }
        return;
      }

      if (registerMode) {
        if (!termsCheckbox?.checked) {
          if (err) {
            err.textContent = 'Debes aceptar los términos y bases legales para registrarte.';
            err.classList.remove('hidden');
          }
          return;
        }
        if (actionButton) {
          actionButton.disabled = true;
          actionButton.textContent = 'CREANDO CUENTA...';
        }
        const firstName = document.getElementById('register-first-name')?.value.trim() || '';
        const lastName = document.getElementById('register-last-name')?.value.trim() || '';
        const city = document.getElementById('register-city')?.value.trim() || '';
        const country = document.getElementById('register-country')?.value.trim() || '';
        const newsletter = Boolean(newsletterCheckbox?.checked);

        try {
          const authData = await registerUser(email, password, { firstName, lastName, city, country, newsletter });
          const storage = keepSession?.checked ? localStorage : sessionStorage;
          storage.setItem(SESSION_KEY, JSON.stringify(authData));
          closeModal();
          await init();
        } catch (error) {
          if (err) {
            err.textContent = error.message;
            err.classList.remove('hidden');
          }
        } finally {
          if (actionButton) {
            actionButton.disabled = false;
            actionButton.textContent = registerMode ? 'COMPLETAR REGISTRO' : 'AUTORIZAR ACCESO';
          }
        }
      } else {
        if (actionButton) {
          actionButton.disabled = true;
          actionButton.textContent = 'AUTENTICANDO...';
        }
        try {
          const authData = await loginAdmin(email, password);
          const storage = keepSession?.checked ? localStorage : sessionStorage;
          storage.setItem(SESSION_KEY, JSON.stringify(authData));
          closeModal();
          await init();
        } catch (error) {
          if (err) {
            err.textContent = error.message;
            err.classList.remove('hidden');
          }
        } finally {
          if (actionButton) {
            actionButton.disabled = false;
            actionButton.textContent = 'AUTORIZAR ACCESO';
          }
        }
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem('nolli_cached_user');
      localStorage.removeItem('nolli_cached_db_profile');
      localStorage.removeItem('nolli_cached_statuses');
      profileState.user = null;
      profileState.dbProfile = null;
      profileState.statuses.clear();
      init();
    });
  }
}

// Iniciar al cargar el DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

