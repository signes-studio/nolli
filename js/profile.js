/* =========================================================================
   PROFILE.JS — Lógica de la Vista de Perfil Editorial ("Tú")
   Sincronizado con Supabase, Mapbox y estética pura Neo-Bauhaus
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
const modalEditProfile = document.getElementById('modal-edit-profile');
const formEditProfile = document.getElementById('form-edit-profile');
const btnCloseEditProfile = document.getElementById('btn-edit-profile-close');
const editStatus = document.getElementById('profile-edit-status');

let activeTab = 'collections'; // 'collections' | 'visited' | 'notes' | 'favorite'

let profileState = {
  user: null,
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

// -------------------------------------------------------------------------
// INICIALIZACIÓN CON LÓGICA CONDICIONAL LIMPIA
// -------------------------------------------------------------------------
async function init() {
  initTheme();
  setupNavTabs();
  setupEditProfileModal();

  const token = getSessionToken();

  // 1. CONDICIONAL: Si NO está autenticado, mostramos SOLO invitación y salimos
  if (!token) {
    if (authRequired) authRequired.classList.remove('hidden');
    if (app) app.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (settingsBtn) settingsBtn.classList.add('hidden');
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // 2. CONDICIONAL: Si está autenticado, mostramos el Perfil completo y ocultamos Auth
  if (authRequired) authRequired.classList.add('hidden');
  if (app) app.classList.remove('hidden');
  if (logoutBtn) logoutBtn.classList.remove('hidden');
  if (settingsBtn) settingsBtn.classList.remove('hidden');

  // Cargamos edificios del catálogo
  try {
    const buildings = await fetchBuildings({ includeAllImportance: true });
    profileState.buildings = buildings || [];
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

    const [statuses, collections, items, labels] = await Promise.all([
      fetchBuildingStatuses(user.id, token).catch(() => []),
      fetchUserCollections(user.id, token).catch(() => profileState.collections),
      fetchUserCollectionItems(user.id, token).catch(() => profileState.items),
      fetchUserPrivateLabels(user.id, token).catch(() => profileState.labels),
    ]);

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

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);
        window.location.reload();
      });
    }

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
  const firstName = metadata.first_name || '';
  const lastName = metadata.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim() || 'LUIS ALBERTO SIGNES SACRISTÁN';

  const nameEl = document.getElementById('profile-hero-name');
  if (nameEl) nameEl.textContent = fullName.toUpperCase();

  const subEl = document.getElementById('profile-hero-sub');
  if (subEl) {
    const bio = metadata.bio || 'Arquitecto & ArchViz | SIGNES.STUDIO';
    const city = metadata.city || 'Valencia';
    const country = metadata.country || 'España';
    const location = [city, country].filter(Boolean).join(', ');
    const website = metadata.website ? ` · ${metadata.website.replace(/^https?:\/\//, '')}` : '';
    subEl.textContent = `${bio} | ${location}${website}`;
  }
}

// -------------------------------------------------------------------------
// 3. MÉTRICAS (GRID INVISIBLE)
// -------------------------------------------------------------------------
function renderMetrics() {
  const visitedCount = statusBuildings('visited').length;
  const favCount = statusBuildings('favorite').length;
  const notesCount = notedBuildings().length;

  const visEl = document.getElementById('stat-visited-num');
  if (visEl) visEl.textContent = visitedCount;

  const favEl = document.getElementById('stat-favorite-num');
  if (favEl) favEl.textContent = favCount;

  const notesEl = document.getElementById('stat-notes-num');
  if (notesEl) notesEl.textContent = notesCount;

  // Interacción al tocar métricas para cambiar de pestaña
  document.querySelectorAll('[data-metric-tab]').forEach((el) => {
    el.addEventListener('click', () => {
      const tab = el.dataset.metricTab;
      switchTab(tab);
    });
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
    renderBuildingsFeed(statusBuildings('visited'), 'VISITADOS');
  } else if (activeTab === 'favorite') {
    renderBuildingsFeed(statusBuildings('favorite'), 'FAVORITOS');
  } else if (activeTab === 'notes') {
    renderNotesFeed();
  } else {
    renderCollectionsFeed();
  }

  if (window.lucide) window.lucide.createIcons();
}

function renderBuildingsFeed(buildings, tabName) {
  const list = buildings;

  if (!list.length) {
    content.innerHTML = `
      <div class="profile-feed-empty">
        [ NO HAY OBRAS EN ESTA SECCIÓN AÚN. EXPLORA EL MAPA PARA REGISTRAR ARQUITECTURA. ]
      </div>
    `;
    return;
  }

  content.innerHTML = list.map((obra) => {
    const photo = obra.foto_miniatura || obra.foto_url || '';
    const title = obra.nombre_obra || 'Obra de arquitectura';
    const year = obra.año_construccion || 'S. XX';
    const architect = obra.arquitectos ? (Array.isArray(obra.arquitectos) ? obra.arquitectos.join(', ') : obra.arquitectos) : (obra.arquitecto || 'Arquitecto');
    const city = obra.place || obra.ciudad || '';
    const metaParts = [year, architect, city].filter(Boolean).join(' · ');

    return `
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
    `;
  }).join('');
}

function renderCollectionsFeed() {
  const collections = profileState.collections;

  if (!collections || !collections.length) {
    content.innerHTML = `
      <div class="profile-feed-empty">
        [ NO TIENES COLECCIONES CREADAS. CREA TUS LISTAS DESDE LA VISTA EXPLORA O EL MAPA. ]
      </div>
    `;
    return;
  }

  content.innerHTML = collections.map((col) => {
    const items = profileState.items.filter((item) => String(item.collection_id) === String(col.id));
    const countText = `${items.length} ${items.length === 1 ? 'OBRA' : 'OBRAS'}`;

    return `
      <article class="profile-feed-collection-item" data-col-id="${col.id}">
        <div class="profile-collection-head-row">
          <h3 class="profile-collection-name">${col.icon ? `${escapeHtml(col.icon)} ` : ''}${escapeHtml(col.name)}</h3>
          <span class="profile-collection-count-badge">[ ${countText} ]</span>
        </div>
        ${col.description ? `<p class="profile-collection-desc">${escapeHtml(col.description)}</p>` : ''}
        ${items.length > 0 ? `
          <div class="profile-collection-items-mini">
            ${items.slice(0, 6).map((item) => {
              const obra = obraFor(item.building_id);
              const photo = obra?.foto_miniatura || obra?.foto_url || '';
              return photo ? `
                <img src="${escapeHtml(photo)}" alt="${escapeHtml(obra?.nombre_obra || '')}" class="profile-collection-mini-thumb" loading="lazy">
              ` : `
                <div class="profile-collection-mini-thumb profile-feed-thumb-fallback">🏛️</div>
              `;
            }).join('')}
          </div>
        ` : ''}
      </article>
    `;
  }).join('');
}

function renderNotesFeed() {
  const buildingsWithNotes = notedBuildings();

  if (!buildingsWithNotes.length) {
    content.innerHTML = `
      <div class="profile-feed-empty">
        [ NO TIENES NOTAS PRIVADAS REGISTRADAS AÚN. ]
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

    return `
      <article class="profile-feed-note-item">
        ${photo ? `
          <img src="${escapeHtml(photo)}" alt="${escapeHtml(title)}" class="profile-feed-thumb" loading="lazy">
        ` : `
          <div class="profile-feed-thumb-fallback">📝</div>
        `}
        <div class="profile-feed-note-content">
          <h3 class="profile-feed-title">${escapeHtml(title)}${escapeHtml(year)}</h3>
          <p class="profile-feed-note-text">“${escapeHtml(noteText)}”</p>
        </div>
      </article>
    `;
  }).join('');
}

// -------------------------------------------------------------------------
// 6. MODAL DE PERSONALIZACIÓN DE PERFIL
// -------------------------------------------------------------------------
function setupEditProfileModal() {
  if (settingsBtn && modalEditProfile) {
    settingsBtn.addEventListener('click', () => {
      const user = profileState.user || {};
      const metadata = user.user_metadata || {};

      const inFirstName = document.getElementById('edit-profile-firstname');
      const inLastName = document.getElementById('edit-profile-lastname');
      const inBio = document.getElementById('edit-profile-bio');
      const inCity = document.getElementById('edit-profile-city');
      const inCountry = document.getElementById('edit-profile-country');
      const inWebsite = document.getElementById('edit-profile-website');

      if (inFirstName) inFirstName.value = metadata.first_name || 'Luis Alberto';
      if (inLastName) inLastName.value = metadata.last_name || 'Signes Sacristán';
      if (inBio) inBio.value = metadata.bio || 'Arquitecto & ArchViz | SIGNES.STUDIO';
      if (inCity) inCity.value = metadata.city || 'Valencia';
      if (inCountry) inCountry.value = metadata.country || 'España';
      if (inWebsite) inWebsite.value = metadata.website || 'https://signes.studio';

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
        await updateCurrentUserProfile(token, updatedProfile);
        await upsertCurrentProfile(user, updatedProfile, token).catch(() => {});

        // Actualizar estado local
        user.user_metadata = {
          ...user.user_metadata,
          first_name: firstName,
          last_name: lastName,
          bio,
          city,
          country,
          website,
        };
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

// Iniciar al cargar el DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
