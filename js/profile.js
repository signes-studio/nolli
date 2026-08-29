/* =========================================================================
   PROFILE.JS — Lógica del Espacio Personal del Usuario
   Sincronizado con el sistema visual, mapa Mapbox y base de datos Supabase
   ========================================================================= */

import {
  fetchBuildings,
  fetchCurrentUser,
  fetchBuildingStatuses,
  fetchUserCollections,
  fetchUserCollectionItems,
  fetchUserPrivateLabels,
  updateCurrentUserProfile,
  upsertCurrentProfile,
  createUserCollection,
  updateUserCollection,
  deleteUserCollection,
  addUserCollectionItem,
  deleteUserCollectionItem,
  createUserPrivateLabel,
  deleteUserPrivateLabel,
  saveBuildingStatus,
} from './api.js';

import {
  state,
  cargarZonaPersonalLocal,
  guardarZonaPersonalLocal,
  aplicarPreferenciasMapaColecciones,
} from './state.js';

const SESSION_KEY = 'nolli_admin_session_token';
const content = document.getElementById('profile-content');
const stats = document.getElementById('profile-stats');
const authRequired = document.getElementById('profile-auth-required');
const app = document.getElementById('profile-app');
const logoutBtn = document.getElementById('btn-profile-logout');
const themeBtn = document.getElementById('btn-theme-toggle');
const themeIcon = document.getElementById('theme-icon');

let activeTab = 'overview';
let profileState = {
  user: null,
  buildings: [],
  statuses: new Map(),
  collections: [],
  items: [],
  labels: [],
};

const CATEGORY_COLORS = {
  'residencial': '#E95C0C',
  'dotacional_equipamiento': '#4388C6',
  'religioso_funerario': '#F2ACCD',
  'comercial_terciario': '#EFBC02',
  'espacio_publico_paisaje': '#0d682f',
  'infraestructura_urbanismo': '#D6201D',
  'industrial_logistico': '#691B14',
  'otro': '#064773',
};

const CATEGORY_NAMES = {
  'residencial': 'Residencial',
  'dotacional_equipamiento': 'Dotacional / Equipamiento',
  'religioso_funerario': 'Religioso / Funerario',
  'comercial_terciario': 'Comercial / Terciario',
  'espacio_publico_paisaje': 'Espacio Público',
  'infraestructura_urbanismo': 'Infraestructura',
  'industrial_logistico': 'Industrial / Logístico',
  'otro': 'Otros',
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
  document.body.classList.toggle('dark-mode', isDark);
  updateThemeIcon(isDark);

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const nowDark = document.body.classList.toggle('dark-mode');
      localStorage.setItem('nolli_theme', nowDark ? 'dark' : 'light');
      localStorage.setItem('nolli_map_style', nowDark ? 'dark' : 'light');
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
const savedBuildings = () => [...new Set(profileState.items.map((item) => String(item.building_id)))].map(obraFor).filter(Boolean);

// -------------------------------------------------------------------------
// INICIALIZACIÓN
// -------------------------------------------------------------------------
async function init() {
  initTheme();

  const token = getSessionToken();
  if (!token) {
    authRequired.classList.remove('hidden');
    app.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    return;
  }

  try {
    const user = await fetchCurrentUser(token);
    profileState.user = user;

    // Cargar datos locales de inmediato mientras se descargan los remotos
    cargarZonaPersonalLocal(user.id);
    profileState.collections = state.userCollections || [];
    profileState.items = state.userCollectionItems || [];
    profileState.labels = state.userPrivateLabels || [];

    const [buildings, statuses, collections, items, labels] = await Promise.all([
      fetchBuildings({ includeAllImportance: true }).catch(() => []),
      fetchBuildingStatuses(user.id, token).catch(() => []),
      fetchUserCollections(user.id, token).catch(() => profileState.collections),
      fetchUserCollectionItems(user.id, token).catch(() => profileState.items),
      fetchUserPrivateLabels(user.id, token).catch(() => profileState.labels),
    ]);

    profileState.buildings = buildings;
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

    authRequired.classList.add('hidden');
    app.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');

    renderHero();
    renderStats();
    renderTabContent();
  } catch (error) {
    console.error('Error cargando perfil:', error);
    authRequired.classList.remove('hidden');
    app.classList.add('hidden');
  }
}

// -------------------------------------------------------------------------
// RENDER HERO & STATS
// -------------------------------------------------------------------------
function renderHero() {
  const user = profileState.user || {};
  const metadata = user.user_metadata || {};
  const firstName = metadata.first_name || '';
  const lastName = metadata.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim() || 'ARQUITECTO';
  const email = user.email || '';
  const city = metadata.city || '';
  const country = metadata.country || '';
  const location = [city, country].filter(Boolean).join(', ') || 'Ubicación no especificada';

  const initials = (firstName.charAt(0) + (lastName.charAt(0) || firstName.charAt(1) || 'N')).toUpperCase() || 'N';

  const avatarEl = document.getElementById('profile-avatar-initials');
  if (avatarEl) avatarEl.textContent = initials;

  const titleEl = document.getElementById('profile-title');
  if (titleEl) titleEl.textContent = fullName;

  const emailEl = document.getElementById('profile-user-email');
  if (emailEl) emailEl.textContent = email;

  const locEl = document.getElementById('profile-user-location');
  if (locEl) locEl.textContent = location;

  const publicLink = document.getElementById('public-profile-link');
  if (publicLink) {
    publicLink.href = `./public-profile.html?user=${encodeURIComponent(user.id)}`;
  }
}

function renderStats() {
  const counts = [
    { label: 'VISITADOS', count: statusBuildings('visited').length, tab: 'visited' },
    { label: 'FAVORITOS', count: statusBuildings('favorite').length, tab: 'favorite' },
    { label: 'MIS LISTAS', count: profileState.collections.length, tab: 'collections' },
    { label: 'NOTAS', count: notedBuildings().length, tab: 'notes' },
    { label: 'ETIQUETAS', count: profileState.labels.length, tab: 'labels' },
  ];

  stats.innerHTML = counts.map((item) => `
    <div class="profile-stat-card" data-switch-tab="${item.tab}" title="Ver ${item.label}">
      <span class="profile-stat-val">${item.count}</span>
      <span class="profile-stat-label">${item.label}</span>
    </div>
  `).join('');
}

// -------------------------------------------------------------------------
// RENDER TAB CONTENIDOS
// -------------------------------------------------------------------------
function renderTabContent() {
  if (activeTab === 'overview') renderOverview();
  else if (activeTab === 'visited') renderBuildingList('visited');
  else if (activeTab === 'favorite') renderBuildingList('favorite');
  else if (activeTab === 'collections') renderCollections();
  else if (activeTab === 'notes') renderNotes();
  else if (activeTab === 'labels') renderLabels();
  else if (activeTab === 'account') renderAccount();

  if (window.lucide) window.lucide.createIcons();
}

function renderOverview() {
  const visited = statusBuildings('visited');
  const favorites = statusBuildings('favorite');
  const notes = notedBuildings();

  // Desglose por categorías
  const catCount = {};
  [...visited, ...favorites].forEach((b) => {
    const cat = b.categoria || 'otro';
    catCount[cat] = (catCount[cat] || 0) + 1;
  });

  const catChips = Object.entries(catCount).map(([cat, count]) => {
    const color = CATEGORY_COLORS[cat] || '#888';
    const name = CATEGORY_NAMES[cat] || cat;
    return `
      <span class="profile-cat-badge">
        <span class="profile-cat-dot" style="background:${color};"></span>
        ${escapeHtml(name)}: <strong>${count}</strong>
      </span>
    `;
  }).join('') || '<span style="font-size:11px; color:var(--fg-dim);">Explora el mapa y marca tus edificios visitados para generar estadísticas.</span>';

  content.innerHTML = `
    <div style="display: grid; gap: 20px;">
      <div>
        <h2 class="profile-section-title">RESUMEN DEL ARCHIVO PERSONAL</h2>
        <p class="profile-section-desc">Panorama general de tu exploración arquitectónica y obras clasificadas.</p>
      </div>

      <div class="profile-collection-card" style="padding: 16px;">
        <div class="profile-kicker" style="margin-bottom: 8px;">[ DISTRIBUCIÓN POR TIPOLOGÍA ]</div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${catChips}
        </div>
      </div>

      <div>
        <h3 class="profile-section-title" style="font-size: 15px; margin-bottom: 10px;">ÚLTIMOS VISITADOS</h3>
        ${visited.length ? `
          <div class="profile-buildings-grid">
            ${visited.slice(0, 5).map(renderBuildingRow).join('')}
          </div>
        ` : `
          <div class="profile-empty-state">
            <span>Todavía no has marcado ningún edificio como visitado.</span>
            <a href="./index.html" class="btn btn-accent" style="text-decoration:none; font-size:10px; padding:6px 12px;">EXPLORAR MAPA</a>
          </div>
        `}
      </div>

      <div>
        <h3 class="profile-section-title" style="font-size: 15px; margin-bottom: 10px;">FAVORITOS DESTACADOS</h3>
        ${favorites.length ? `
          <div class="profile-buildings-grid">
            ${favorites.slice(0, 5).map(renderBuildingRow).join('')}
          </div>
        ` : `
          <div class="profile-empty-state">
            <span>Guarda tus obras favoritas con el icono de corazón para tenerlas siempre a mano.</span>
          </div>
        `}
      </div>
    </div>
  `;
}

function renderBuildingRow(obra) {
  if (!obra) return '';
  const status = profileState.statuses.get(String(obra.id)) || {};
  const isFav = Boolean(status.favorite);
  const isVis = Boolean(status.visited);
  const cat = obra.categoria || 'otro';
  const catColor = CATEGORY_COLORS[cat] || '#888';
  const catLabel = CATEGORY_NAMES[cat] || cat;

  return `
    <article class="profile-building-row">
      <div class="profile-building-main">
        <div class="profile-building-title">${escapeHtml(obra.nombre_obra)}</div>
        <div class="profile-building-meta">
          <span class="profile-cat-badge">
            <span class="profile-cat-dot" style="background:${catColor};"></span>
            ${escapeHtml(catLabel)}
          </span>
          <span>${escapeHtml(obra.arquitecto || 'Arquitecto no especificado')}</span>
          ${obra.año_construccion ? `<span>· ${escapeHtml(obra.año_construccion)}</span>` : ''}
          ${obra.ciudad ? `<span>· ${escapeHtml(obra.ciudad)}</span>` : ''}
        </div>
      </div>
      <div class="profile-building-actions">
        <button type="button" class="profile-btn-icon ${isFav ? 'active' : ''}" data-toggle-fav="${obra.id}" title="${isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}" aria-label="Favorito">
          <i data-lucide="heart" width="13" height="13"></i>
        </button>
        <button type="button" class="profile-btn-icon ${isVis ? 'active' : ''}" data-toggle-vis="${obra.id}" title="${isVis ? 'Marcar como no visitado' : 'Marcar como visitado'}" aria-label="Visitado">
          <i data-lucide="check-circle-2" width="13" height="13"></i>
        </button>
        <a href="./index.html?obra=${encodeURIComponent(obra.id)}" class="profile-btn-icon" title="Ver en el mapa" aria-label="Ver en el mapa">
          <i data-lucide="map-pin" width="13" height="13"></i>
        </a>
      </div>
    </article>
  `;
}

function renderBuildingList(type) {
  const isVisited = type === 'visited';
  const list = isVisited ? statusBuildings('visited') : statusBuildings('favorite');
  const title = isVisited ? 'EDIFICIOS VISITADOS' : 'EDIFICIOS FAVORITOS';
  const desc = isVisited
    ? 'Registro cronológico de todas las obras de arquitectura que has visitado.'
    : 'Tu selección de edificios y proyectos arquitectónicos destacados.';

  content.innerHTML = `
    <div>
      <div style="display: flex; justify-content: space-between; align-items: baseline;">
        <h2 class="profile-section-title">${title}</h2>
        <span class="profile-kicker">[ TOTAL: ${list.length} ]</span>
      </div>
      <p class="profile-section-desc">${desc}</p>
    </div>
    ${list.length ? `
      <div class="profile-buildings-grid">
        ${list.map(renderBuildingRow).join('')}
      </div>
    ` : `
      <div class="profile-empty-state">
        <span>No tienes ${isVisited ? 'edificios visitados' : 'favoritos'} guardados todavía.</span>
        <a href="./index.html" class="btn btn-accent" style="text-decoration:none; font-size:10px; padding:6px 12px;">EXPLORAR MAPA</a>
      </div>
    `}
  `;
}

function renderCollections() {
  const cards = profileState.collections.map((col) => {
    const items = profileState.items.filter((item) => String(item.collection_id) === String(col.id));
    const isMapActive = col.show_on_map !== false;

    const eyeIconSvg = isMapActive
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;

    const rows = items.map((item) => {
      const obra = obraFor(item.building_id);
      if (!obra) return '';
      return `
        <div class="profile-collection-item-row">
          <div style="min-width:0; flex:1;">
            <strong style="color:var(--fg); font-size:12px; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(obra.nombre_obra)}</strong>
            <span style="color:var(--fg-dim); font-size:10px;">${escapeHtml(obra.arquitecto || '')}</span>
          </div>
          <div style="display:flex; gap:4px; align-items:center;">
            <a href="./index.html?obra=${encodeURIComponent(obra.id)}" class="profile-btn-icon" title="Ver en mapa" aria-label="Ver en mapa">
              <i data-lucide="map-pin" width="12" height="12"></i>
            </a>
            <button type="button" class="profile-btn-icon btn-danger" data-remove-item-col="${col.id}" data-remove-item-building="${obra.id}" title="Quitar de la lista" aria-label="Quitar">
              ✕
            </button>
          </div>
        </div>
      `;
    }).join('') || '<div style="font-size:11px; color:var(--fg-dim); padding:8px 0;">Lista vacía. Añade obras desde el mapa.</div>';

    const colEmoji = col.icon ? `<span style="font-size:14px; margin-right:6px;">${escapeHtml(col.icon)}</span>` : '';

    return `
      <article class="profile-collection-card">
        <div class="profile-collection-head">
          <div class="profile-collection-title-wrap">
            <div class="profile-collection-title">${colEmoji}${escapeHtml(col.name)}</div>
            ${col.description ? `<div class="profile-collection-desc">${escapeHtml(col.description)}</div>` : ''}
          </div>
          <div class="profile-collection-tools">
            <button type="button" class="collection-map-toggle ${isMapActive ? 'active' : ''}" data-toggle-map-col="${col.id}" title="${isMapActive ? 'Ocultar iconos de la lista en el mapa' : 'Mostrar iconos de la lista en el mapa'}" aria-label="Ver en mapa">
              ${eyeIconSvg}
            </button>
            <span class="collection-counter" title="Total de obras">${items.length}</span>
            <button type="button" class="collection-tool-btn" data-edit-col="${col.id}" title="Editar lista" aria-label="Editar">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            </button>
            <button type="button" class="collection-tool-btn btn-delete" data-delete-col="${col.id}" title="Borrar lista" aria-label="Borrar">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            </button>
          </div>
        </div>
        <div class="profile-collection-items-box">
          ${rows}
        </div>
      </article>
    `;
  }).join('');

  content.innerHTML = `
    <div style="display:grid; gap:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <h2 class="profile-section-title" style="margin:0;">LISTAS PERSONALIZADAS</h2>
          <p class="profile-section-desc" style="margin:4px 0 0 0;">Agrupa y clasifica tus itinerarios y edificios con emojis propios.</p>
        </div>
        <button type="button" class="btn btn-accent" id="btn-open-create-col" style="padding:6px 12px; font-size:11px;">+ NUEVA LISTA</button>
      </div>

      <div class="profile-collections-grid">
        ${cards || '<div class="profile-empty-state">No tienes ninguna lista creada todavía. Pulsa "+ NUEVA LISTA" para comenzar.</div>'}
      </div>
    </div>
  `;
}

function renderNotes() {
  const notes = notedBuildings();

  content.innerHTML = `
    <div>
      <div style="display: flex; justify-content: space-between; align-items: baseline;">
        <h2 class="profile-section-title">NOTAS PRIVADAS</h2>
        <span class="profile-kicker">[ TOTAL: ${notes.length} ]</span>
      </div>
      <p class="profile-section-desc">Anotaciones personales, valoraciones y memorias de visita sobre cada obra.</p>
    </div>

    ${notes.length ? `
      <div class="profile-buildings-grid">
        ${notes.map((obra) => {
          const status = profileState.statuses.get(String(obra.id)) || {};
          const noteText = status.notas || '';
          const cat = obra.categoria || 'otro';
          const catColor = CATEGORY_COLORS[cat] || '#888';

          return `
            <article class="profile-note-card">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <strong style="color:var(--fg); font-size:13px;">${escapeHtml(obra.nombre_obra)}</strong>
                  <div style="font-size:10px; color:var(--fg-dim); margin-top:2px;">
                    <span class="profile-cat-badge">
                      <span class="profile-cat-dot" style="background:${catColor};"></span>
                      ${escapeHtml(CATEGORY_NAMES[cat] || cat)}
                    </span>
                    <span>${escapeHtml(obra.arquitecto || '')}</span>
                  </div>
                </div>
                <a href="./index.html?obra=${encodeURIComponent(obra.id)}" class="profile-btn-icon" title="Ver en el mapa">
                  <i data-lucide="map-pin" width="13" height="13"></i>
                </a>
              </div>
              <div class="profile-note-text">"${escapeHtml(noteText)}"</div>
            </article>
          `;
        }).join('')}
      </div>
    ` : `
      <div class="profile-empty-state">
        <span>No tienes ninguna nota guardada. Puedes escribir notas privadas al abrir la ficha de cualquier obra en el mapa.</span>
      </div>
    `}
  `;
}

function renderLabels() {
  content.innerHTML = `
    <div style="display:grid; gap:16px;">
      <div>
        <h2 class="profile-section-title">ETIQUETAS PRIVADAS</h2>
        <p class="profile-section-desc">Crea etiquetas personalizadas para categorizar obras según tus propios criterios (#brutalismo, #pendiente-visitar, etc.).</p>
      </div>

      <div class="profile-collection-card" style="padding:14px;">
        <div class="profile-kicker" style="margin-bottom:8px;">[ ASIGNAR NUEVA ETIQUETA ]</div>
        <div style="display:grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap:8px;">
          <select id="label-building-select" class="tech-input" style="font-size:11px;">
            <option value="">SELECCIONA UNA OBRA...</option>
            ${profileState.buildings.map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.nombre_obra)}</option>`).join('')}
          </select>
          <input type="text" id="label-name-input" class="tech-input" placeholder="#etiqueta" style="font-size:11px;">
          <button type="button" class="btn btn-accent" id="btn-create-label" style="padding:6px 12px; font-size:11px;">AÑADIR</button>
        </div>
      </div>

      <div class="profile-buildings-grid">
        ${profileState.labels.length ? profileState.labels.map((lbl) => {
          const obra = obraFor(lbl.building_id);
          return `
            <div class="profile-building-row">
              <div class="profile-building-main">
                <span class="profile-kicker" style="font-size:12px; color:var(--accent);">#${escapeHtml(lbl.label)}</span>
                <span style="font-size:11px; color:var(--fg); margin-left:8px;">${escapeHtml(obra?.nombre_obra || 'Obra no disponible')}</span>
              </div>
              <div class="profile-building-actions">
                ${obra ? `
                  <a href="./index.html?obra=${encodeURIComponent(obra.id)}" class="profile-btn-icon" title="Ver en mapa">
                    <i data-lucide="map-pin" width="12" height="12"></i>
                  </a>
                ` : ''}
                <button type="button" class="profile-btn-icon btn-danger" data-delete-lbl="${lbl.id}" title="Eliminar etiqueta">
                  ✕
                </button>
              </div>
            </div>
          `;
        }).join('') : '<div class="profile-empty-state">No tienes ninguna etiqueta asignada todavía.</div>'}
      </div>
    </div>
  `;
}

function renderAccount() {
  const user = profileState.user || {};
  const metadata = user.user_metadata || {};

  content.innerHTML = `
    <div style="display:grid; gap:20px;">
      <div>
        <h2 class="profile-section-title">DATOS PERSONALES Y CUENTA</h2>
        <p class="profile-section-desc">Gestiona los datos de tu identidad y preferencias de sincronización.</p>
      </div>

      <div class="profile-collection-card" style="padding:16px;">
        <div class="profile-kicker" style="margin-bottom:12px;">[ EDITAR METADATOS ]</div>
        <form id="form-account-profile" class="profile-form-grid">
          <div class="profile-form-field">
            <label for="acc-first-name">NOMBRE</label>
            <input type="text" id="acc-first-name" class="tech-input" value="${escapeHtml(metadata.first_name || '')}" placeholder="Nombre">
          </div>
          <div class="profile-form-field">
            <label for="acc-last-name">APELLIDOS</label>
            <input type="text" id="acc-last-name" class="tech-input" value="${escapeHtml(metadata.last_name || '')}" placeholder="Apellidos">
          </div>
          <div class="profile-form-field">
            <label for="acc-city">CIUDAD</label>
            <input type="text" id="acc-city" class="tech-input" value="${escapeHtml(metadata.city || '')}" placeholder="Ej: Madrid, Barcelona, Londres">
          </div>
          <div class="profile-form-field">
            <label for="acc-country">PAÍS</label>
            <input type="text" id="acc-country" class="tech-input" value="${escapeHtml(metadata.country || '')}" placeholder="Ej: España">
          </div>
          <div class="profile-form-field full-width">
            <label for="acc-email">CORREO ELECTRÓNICO (SOLO LECTURA)</label>
            <input type="email" id="acc-email" class="tech-input" value="${escapeHtml(user.email || '')}" disabled style="opacity:0.6;">
          </div>
          <div class="profile-form-actions full-width">
            <button type="submit" class="btn btn-accent" style="padding:8px 16px; font-size:11px;">GUARDAR CAMBIOS</button>
            <span id="account-feedback-msg" class="profile-form-msg"></span>
          </div>
        </form>
      </div>

      <div class="profile-collection-card" style="padding:16px;">
        <div class="profile-kicker" style="margin-bottom:8px;">[ PERFIL PÚBLICO // COMPARTIR ]</div>
        <p style="font-size:11px; color:var(--fg-dim); line-height:1.6; margin-bottom:12px;">
          Tu perfil público permite a otros amantes de la arquitectura consultar tus listas públicas y obras visitadas.
        </p>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="text" class="tech-input" value="${window.location.origin}/public-profile.html?user=${encodeURIComponent(user.id)}" readonly style="font-size:10px; flex:1;">
          <button type="button" class="btn" id="btn-copy-public-link" style="padding:6px 12px; font-size:10px;">COPIAR ENLACE</button>
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------------------
// MODAL GESTIÓN DE LISTAS (CREAR / EDITAR)
// -------------------------------------------------------------------------
function openCreateCollectionModal() {
  const container = document.getElementById('profile-modal-container');
  if (!container) return;

  container.innerHTML = `
    <div class="profile-modal-backdrop" id="col-modal-backdrop">
      <div class="profile-modal-box">
        <div class="profile-modal-head">
          <strong>NUEVA LISTA</strong>
          <button type="button" class="filter-action" id="btn-close-col-modal">✕</button>
        </div>
        <div style="display:grid; grid-template-columns: 50px 1fr; gap:6px;">
          <input type="text" id="modal-col-emoji" class="tech-input" placeholder="🏛️" maxlength="4" style="text-align:center;" title="Icono emoji">
          <input type="text" id="modal-col-name" class="tech-input" placeholder="NOMBRE DE LISTA">
        </div>
        <textarea id="modal-col-desc" class="tech-input" placeholder="Descripción breve (opcional)..." style="resize:vertical; min-height:50px;"></textarea>
        <label style="display:flex; align-items:center; gap:6px; font-size:10px; cursor:pointer;">
          <input type="checkbox" id="modal-col-map-toggle" checked>
          <span>Mostrar en el mapa con este emoji</span>
        </label>
        <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:6px;">
          <button type="button" class="filter-action" id="btn-cancel-col-modal">CANCELAR</button>
          <button type="button" class="btn btn-accent" id="btn-confirm-create-col" style="padding:6px 12px;">CREAR LISTA</button>
        </div>
      </div>
    </div>
  `;
}

function openEditCollectionModal(colId) {
  const col = profileState.collections.find((c) => String(c.id) === String(colId));
  if (!col) return;

  const container = document.getElementById('profile-modal-container');
  if (!container) return;

  container.innerHTML = `
    <div class="profile-modal-backdrop" id="col-modal-backdrop">
      <div class="profile-modal-box">
        <div class="profile-modal-head">
          <strong>EDITAR LISTA</strong>
          <button type="button" class="filter-action" id="btn-close-col-modal">✕</button>
        </div>
        <div style="display:grid; grid-template-columns: 50px 1fr; gap:6px;">
          <input type="text" id="modal-col-emoji" class="tech-input" value="${escapeHtml(col.icon || '')}" placeholder="🏛️" maxlength="4" style="text-align:center;">
          <input type="text" id="modal-col-name" class="tech-input" value="${escapeHtml(col.name || '')}" placeholder="NOMBRE DE LISTA">
        </div>
        <textarea id="modal-col-desc" class="tech-input" placeholder="Descripción breve (opcional)..." style="resize:vertical; min-height:50px;">${escapeHtml(col.description || '')}</textarea>
        <label style="display:flex; align-items:center; gap:6px; font-size:10px; cursor:pointer;">
          <input type="checkbox" id="modal-col-map-toggle" ${col.show_on_map !== false ? 'checked' : ''}>
          <span>Mostrar en el mapa con este emoji</span>
        </label>
        <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:6px;">
          <button type="button" class="filter-action" id="btn-cancel-col-modal">CANCELAR</button>
          <button type="button" class="btn btn-accent" id="btn-confirm-save-col" data-col-id="${col.id}" style="padding:6px 12px;">GUARDAR</button>
        </div>
      </div>
    </div>
  `;
}

function closeCollectionModal() {
  const container = document.getElementById('profile-modal-container');
  if (container) container.innerHTML = '';
}

// -------------------------------------------------------------------------
// EVENT DELEGATION
// -------------------------------------------------------------------------
document.addEventListener('click', async (event) => {
  // Pestañas
  const tabBtn = event.target.closest('[data-profile-tab]');
  if (tabBtn) {
    activeTab = tabBtn.dataset.profileTab;
    document.querySelectorAll('[data-profile-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.profileTab === activeTab);
    });
    renderTabContent();
    return;
  }

  // Tarjetas de stats con salto de pestaña
  const statCard = event.target.closest('[data-switch-tab]');
  if (statCard) {
    activeTab = statCard.dataset.switchTab;
    document.querySelectorAll('[data-profile-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.profileTab === activeTab);
    });
    renderTabContent();
    return;
  }

  // Toggle Favorito
  const favBtn = event.target.closest('[data-toggle-fav]');
  if (favBtn) {
    const id = favBtn.dataset.toggleFav;
    const prev = profileState.statuses.get(String(id)) || { favorite: false, visited: false, notas: '' };
    const nextVal = !prev.favorite;
    const token = getSessionToken();
    try {
      await saveBuildingStatus(profileState.user.id, id, { ...prev, favorite: nextVal }, token);
      profileState.statuses.set(String(id), { ...prev, favorite: nextVal });
      renderStats();
      renderTabContent();
    } catch (e) {
      alert(e.message);
    }
    return;
  }

  // Toggle Visitado
  const visBtn = event.target.closest('[data-toggle-vis]');
  if (visBtn) {
    const id = visBtn.dataset.toggleVis;
    const prev = profileState.statuses.get(String(id)) || { favorite: false, visited: false, notas: '' };
    const nextVal = !prev.visited;
    const token = getSessionToken();
    try {
      await saveBuildingStatus(profileState.user.id, id, { ...prev, visited: nextVal }, token);
      profileState.statuses.set(String(id), { ...prev, visited: nextVal });
      renderStats();
      renderTabContent();
    } catch (e) {
      alert(e.message);
    }
    return;
  }

  // Abrir modal nueva lista
  if (event.target.closest('#btn-open-create-col')) {
    openCreateCollectionModal();
    return;
  }

  // Cerrar modal lista
  if (event.target.closest('#btn-close-col-modal') || event.target.closest('#btn-cancel-col-modal')) {
    closeCollectionModal();
    return;
  }

  // Confirmar creación de lista
  if (event.target.closest('#btn-confirm-create-col')) {
    const name = document.getElementById('modal-col-name')?.value.trim();
    const icon = document.getElementById('modal-col-emoji')?.value.trim() || '🏛️';
    const description = document.getElementById('modal-col-desc')?.value.trim() || null;
    const showOnMap = document.getElementById('modal-col-map-toggle')?.checked ?? true;

    if (!name) {
      alert('Introduce un nombre para la lista.');
      return;
    }

    const colPayload = {
      id: `COL-${Date.now()}`,
      user_id: profileState.user.id,
      name,
      icon,
      description,
      show_on_map: showOnMap,
    };

    const token = getSessionToken();
    try {
      const created = await createUserCollection(colPayload, token);
      profileState.collections.push(created[0] || colPayload);
    } catch {
      profileState.collections.push(colPayload);
    }

    state.userCollections = profileState.collections;
    guardarZonaPersonalLocal(profileState.user.id);
    closeCollectionModal();
    renderStats();
    renderTabContent();
    return;
  }

  // Abrir modal editar lista
  const editColBtn = event.target.closest('[data-edit-col]');
  if (editColBtn) {
    openEditCollectionModal(editColBtn.dataset.editCol);
    return;
  }

  // Guardar edición de lista
  const confirmSaveCol = event.target.closest('#btn-confirm-save-col');
  if (confirmSaveCol) {
    const colId = confirmSaveCol.dataset.colId;
    const name = document.getElementById('modal-col-name')?.value.trim();
    const icon = document.getElementById('modal-col-emoji')?.value.trim() || '🏛️';
    const description = document.getElementById('modal-col-desc')?.value.trim() || null;
    const showOnMap = document.getElementById('modal-col-map-toggle')?.checked ?? true;

    if (!name) {
      alert('El nombre no puede estar vacío.');
      return;
    }

    const col = profileState.collections.find((c) => String(c.id) === String(colId));
    if (col) {
      col.name = name;
      col.icon = icon;
      col.description = description;
      col.show_on_map = showOnMap;

      const token = getSessionToken();
      updateUserCollection(colId, profileState.user.id, { name, icon, description, show_on_map: showOnMap }, token).catch(() => {});
      state.userCollections = profileState.collections;
      guardarZonaPersonalLocal(profileState.user.id);
    }

    closeCollectionModal();
    renderTabContent();
    return;
  }

  // Toggle mapa de lista
  const toggleMapCol = event.target.closest('[data-toggle-map-col]');
  if (toggleMapCol) {
    const colId = toggleMapCol.dataset.toggleMapCol;
    const col = profileState.collections.find((c) => String(c.id) === String(colId));
    if (col) {
      col.show_on_map = col.show_on_map === false ? true : false;
      const token = getSessionToken();
      updateUserCollection(colId, profileState.user.id, { show_on_map: col.show_on_map }, token).catch(() => {});
      state.userCollections = profileState.collections;
      guardarZonaPersonalLocal(profileState.user.id);
      renderTabContent();
    }
    return;
  }

  // Borrar lista
  const deleteColBtn = event.target.closest('[data-delete-col]');
  if (deleteColBtn) {
    const colId = deleteColBtn.dataset.deleteCol;
    if (confirm('¿Seguro que deseas eliminar esta lista y desvincular sus obras?')) {
      const token = getSessionToken();
      deleteUserCollection(colId, profileState.user.id, token).catch(() => {});
      profileState.collections = profileState.collections.filter((c) => String(c.id) !== String(colId));
      profileState.items = profileState.items.filter((item) => String(item.collection_id) !== String(colId));
      state.userCollections = profileState.collections;
      state.userCollectionItems = profileState.items;
      guardarZonaPersonalLocal(profileState.user.id);
      renderStats();
      renderTabContent();
    }
    return;
  }

  // Quitar obra de lista
  const removeItemCol = event.target.closest('[data-remove-item-col]');
  if (removeItemCol) {
    const colId = removeItemCol.dataset.removeItemCol;
    const buildingId = removeItemCol.dataset.removeItemBuilding;
    const token = getSessionToken();
    deleteUserCollectionItem(colId, profileState.user.id, buildingId, token).catch(() => {});
    profileState.items = profileState.items.filter((item) => !(String(item.collection_id) === String(colId) && String(item.building_id) === String(buildingId)));
    state.userCollectionItems = profileState.items;
    guardarZonaPersonalLocal(profileState.user.id);
    renderTabContent();
    return;
  }

  // Crear etiqueta
  if (event.target.closest('#btn-create-label')) {
    const buildingId = document.getElementById('label-building-select')?.value;
    const name = document.getElementById('label-name-input')?.value.trim().replace(/^#/, '');
    if (!buildingId || !name) {
      alert('Selecciona una obra e introduce un nombre para la etiqueta.');
      return;
    }
    const token = getSessionToken();
    try {
      const created = await createUserPrivateLabel({ user_id: profileState.user.id, building_id: buildingId, label: name }, token);
      profileState.labels.unshift(created[0] || { id: `LBL-${Date.now()}`, user_id: profileState.user.id, building_id: buildingId, label: name });
    } catch {
      profileState.labels.unshift({ id: `LBL-${Date.now()}`, user_id: profileState.user.id, building_id: buildingId, label: name });
    }
    state.userPrivateLabels = profileState.labels;
    guardarZonaPersonalLocal(profileState.user.id);
    renderStats();
    renderTabContent();
    return;
  }

  // Eliminar etiqueta
  const deleteLblBtn = event.target.closest('[data-delete-lbl]');
  if (deleteLblBtn) {
    const lblId = deleteLblBtn.dataset.deleteLbl;
    const token = getSessionToken();
    deleteUserPrivateLabel(lblId, profileState.user.id, token).catch(() => {});
    profileState.labels = profileState.labels.filter((item) => String(item.id) !== String(lblId));
    state.userPrivateLabels = profileState.labels;
    guardarZonaPersonalLocal(profileState.user.id);
    renderStats();
    renderTabContent();
    return;
  }

  // Copiar enlace de perfil público
  if (event.target.closest('#btn-copy-public-link')) {
    const publicUrl = `${window.location.origin}/public-profile.html?user=${encodeURIComponent(profileState.user.id)}`;
    navigator.clipboard.writeText(publicUrl).then(() => {
      alert('Enlace del perfil público copiado al portapapeles.');
    });
    return;
  }

  // Cerrar sesión
  if (event.target.closest('#btn-profile-logout')) {
    if (confirm('¿Cerrar sesión en Nolli?')) {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      window.location.href = './index.html';
    }
    return;
  }
});

// Guardar datos de cuenta
document.addEventListener('submit', async (event) => {
  if (event.target.id === 'form-account-profile') {
    event.preventDefault();
    const firstName = document.getElementById('acc-first-name')?.value.trim();
    const lastName = document.getElementById('acc-last-name')?.value.trim();
    const city = document.getElementById('acc-city')?.value.trim();
    const country = document.getElementById('acc-country')?.value.trim();
    const msgEl = document.getElementById('account-feedback-msg');

    const metadata = { firstName, lastName, city, country };
    const token = getSessionToken();

    try {
      await updateCurrentUserProfile(token, metadata);
      await upsertCurrentProfile(profileState.user, metadata, token).catch(() => {});
      profileState.user.user_metadata = {
        ...profileState.user.user_metadata,
        first_name: firstName,
        last_name: lastName,
        city,
        country,
      };
      renderHero();
      if (msgEl) {
        msgEl.textContent = 'PERFIL ACTUALIZADO CORRECTAMENTE';
        setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 3000);
      }
    } catch (e) {
      if (msgEl) msgEl.textContent = e.message || 'ERROR AL GUARDAR';
    }
  }
});

init();
