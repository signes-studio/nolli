/* =========================================================================
   PROFILE.JS — Lógica de la Vista de Perfil Editorial ("Tú")
   Sincronizado con Supabase, Mapbox y estética pura Neo-Bauhaus
   Gestión completa de Listas, Favoritos, Visitados y Notas
   ========================================================================= */

import {
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
  fetchFollowedCollections,
  unfollowCollection,
  updateCurrentUserProfile,
  upsertCurrentProfile,
  fetchCurrentProfile,
  loginAdmin,
  registerUser,
  requestPasswordReset,
  refreshUserSession,
  updateUserPresence,
  getBuildingsCatalog,
  fetchUserSocialCounts,
  fetchIncomingFriendRequests,
  fetchUserFriends,
  respondFriendshipRpc,
} from './api.js';

import {
  state,
  cargarZonaPersonalLocal,
  guardarZonaPersonalLocal,
  aplicarPreferenciasMapaColecciones,
  transformarEdificio,
  escapeHtml,
} from './state.js';

import { renderInChunks, initTabsScrollIndicator } from './renderUtils.js';
import { getOptimizedPhotoUrl } from './imageProxy.js';
import { renderObraCard } from './workCard.js';
import { t, initI18n, getUrlPrefix, applyI18nToDOM, setupLanguageSwitchers, getLanguage, switchLanguage } from './i18n.js';

const SESSION_KEY = 'nolli_admin_session_token';
const content = document.getElementById('profile-content');
const authRequired = document.getElementById('profile-auth-required');
const app = document.getElementById('profile-app');
const logoutBtn = document.getElementById('btn-profile-logout');
const themeBtn = document.getElementById('btn-theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const settingsBtn = document.getElementById('btn-profile-settings');

const profileState = {
  user: null,
  dbProfile: null,
  statuses: new Map(),
  collections: [],
  items: [],
  followedCollections: [],
  labels: [],
  buildings: [],
  activeTab: 'collections',
};
if (typeof window !== 'undefined') window.profileState = profileState;

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
      try {
        localStorage.setItem('nolli_theme', nowDark ? 'dark' : 'light');
        localStorage.setItem('nolli_map_style', nowDark ? 'dark' : 'abstract');
      } catch {}
      const metaEl = document.getElementById('meta-theme-color');
      if (metaEl) metaEl.setAttribute('content', nowDark ? '#141411' : '#F8F1DF');
      updateThemeIcon(nowDark);
      if (window.lucide) window.lucide.createIcons();
    });
  }
}

function updateThemeIcon(isDark) {
  if (themeIcon) themeIcon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
  updateSettingsDisplays();
  if (window.lucide) window.lucide.createIcons();
}

function clearSessionAndUserCaches() {
  [
    'nolli_admin_session_token',
    'nolli_cached_user',
    'nolli_cached_db_profile',
    'nolli_cached_statuses',
    'nolli_cached_collections',
    'nolli_cached_labels',
    'nolli_cached_buildings',
  ].forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });

  profileState.user = null;
  profileState.dbProfile = null;
  profileState.statuses = new Map();
  profileState.collections = [];
  profileState.items = [];
  profileState.followedCollections = [];
  profileState.labels = [];

  state.sessionToken = null;
  state.userRole = null;
  state.adminMode = false;
  state.userId = null;
  state.userEmail = null;
  state.userProfile = null;
  state.buildingStatuses = new Map();
  state.userCollections = [];
  state.userCollectionItems = [];
  state.userFollowedCollections = [];
  state.userPrivateLabels = [];
}

export function openEditProfileModal() {
  if (!modalEditProfile) return;
  const user = profileState.user || {};
  const metadata = user.user_metadata || {};
  const db = profileState.dbProfile || {};

  const inFirstName = document.getElementById('edit-profile-firstname');
  const inLastName = document.getElementById('edit-profile-lastname');
  const inBio = document.getElementById('edit-profile-bio');
  const inCity = document.getElementById('edit-profile-city');
  const inCountry = document.getElementById('edit-profile-country');
  const inWebsite = document.getElementById('edit-profile-website');
  const inSchool = document.getElementById('edit-profile-school');

  if (inFirstName) inFirstName.value = (db.first_name !== undefined && db.first_name !== null) ? db.first_name : (metadata.first_name || '');
  if (inLastName) inLastName.value = (db.last_name !== undefined && db.last_name !== null) ? db.last_name : (metadata.last_name || '');
  if (inBio) inBio.value = (db.bio !== undefined && db.bio !== null) ? db.bio : (metadata.bio || '');
  if (inCity) inCity.value = (db.city !== undefined && db.city !== null) ? db.city : (metadata.city || '');
  if (inCountry) inCountry.value = (db.country !== undefined && db.country !== null) ? db.country : (metadata.country || '');
  if (inWebsite) inWebsite.value = (db.website !== undefined && db.website !== null) ? db.website : (metadata.website || '');
  if (inSchool) inSchool.value = (db.school !== undefined && db.school !== null) ? db.school : (metadata.school || '');

  if (editStatus) editStatus.classList.add('hidden');
  modalEditProfile.classList.add('open');
  if (window.lucide) window.lucide.createIcons();
}

function bindProfileHeaderActions() {
  if (logoutBtn) logoutBtn.onclick = logout;

  if (settingsBtn && modalEditProfile) {
    settingsBtn.onclick = () => openEditProfileModal();
  }

  const nameEl = document.getElementById('profile-hero-name');
  if (nameEl) {
    nameEl.addEventListener('click', () => {
      if (nameEl.classList.contains('is-placeholder')) openEditProfileModal();
    });
    nameEl.addEventListener('keydown', (e) => {
      if (nameEl.classList.contains('is-placeholder') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        openEditProfileModal();
      }
    });
  }

  const subEl = document.getElementById('profile-hero-sub');
  if (subEl) {
    subEl.addEventListener('click', () => {
      if (subEl.classList.contains('is-placeholder')) openEditProfileModal();
    });
    subEl.addEventListener('keydown', (e) => {
      if (subEl.classList.contains('is-placeholder') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        openEditProfileModal();
      }
    });
  }
}

function logout() {
  clearSessionAndUserCaches();
  document.dispatchEvent(new CustomEvent('radar:logout'));
  if (SESSION_KEY) {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  }
  window.location.reload();
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
      fetched.forEach((raw, idx) => {
        const b = transformarEdificio(raw, profileState.buildings.length + idx);
        if (!b) return;
        const existingIdx = profileState.buildings.findIndex((existing) => String(existing.id) === String(b.id));
        if (existingIdx >= 0) {
          profileState.buildings[existingIdx] = { ...profileState.buildings[existingIdx], ...b };
        } else {
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
  await initI18n();
  applyI18nToDOM();
  initTheme();
  bindProfileHeaderActions();
  setupNavTabs();
  setupEditProfileModal();
  setupCollectionModal();
  setupNoteModal();
  setupFeedActionHandlers();
  setupLoginModal();
  syncBottomNavLinks();
  bindSettingsListActions();
  if (window.lucide) window.lucide.createIcons();

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
  updateUserPresence(token, profileState.user?.id || state.userId);

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
    syncAdminBadge();
  }
  if (cachedDbProfileStr) {
    try {
      profileState.dbProfile = JSON.parse(cachedDbProfileStr);
    } catch {}
    syncAdminBadge();
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
    const buildings = await getBuildingsCatalog();
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

    const [statuses, collections, items, labels, dbProfile, followed] = await Promise.all([
      fetchBuildingStatuses(user.id, token).catch(() => []),
      fetchUserCollections(user.id, token).catch(() => profileState.collections),
      fetchUserCollectionItems(user.id, token).catch(() => profileState.items),
      fetchUserPrivateLabels(user.id, token).catch(() => profileState.labels),
      fetchCurrentProfile(user.id, token).catch(() => null),
      fetchFollowedCollections(user.id, token).catch(() => []),
    ]);

    if (dbProfile) {
      profileState.dbProfile = dbProfile;
      localStorage.setItem('nolli_cached_db_profile', JSON.stringify(dbProfile));
    }
    syncAdminBadge();

    profileState.statuses = new Map(statuses.map((item) => [String(item.building_id), {
      favorite: item.favorite === true,
      visited: item.visited === true,
      notas: item.notas || '',
      valoracion: item.valoracion || null,
    }]));

    profileState.collections = aplicarPreferenciasMapaColecciones(collections || [], user.id);
    profileState.items = items || [];
    profileState.labels = labels || [];
    profileState.followedCollections = followed || [];

    state.userCollections = profileState.collections;
    state.userCollectionItems = profileState.items;
    state.userFollowedCollections = profileState.followedCollections;
    state.userPrivateLabels = profileState.labels;
    guardarZonaPersonalLocal(user.id);

    localStorage.setItem('nolli_cached_user', JSON.stringify(user));
    localStorage.setItem('nolli_cached_statuses', JSON.stringify(statuses));

    if (logoutBtn) {
      logoutBtn.addEventListener('click', logout);
    }
    if (mobileLogoutBtn) {
      mobileLogoutBtn.addEventListener('click', logout);
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
    console.warn('Aviso sincronizando perfil con servidor:', error);
    // Si tenemos usuario o datos en caché local, mantener la vista activa
    if (profileState.user || localStorage.getItem('nolli_cached_user')) {
      renderHero();
      renderMetrics();
      renderFeedContent();
    } else {
      if (authRequired) authRequired.classList.remove('hidden');
    if (app) app.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (mobileLogoutBtn) mobileLogoutBtn.classList.add('hidden');
    if (settingsBtn) settingsBtn.classList.add('hidden');
    }
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
  const fullName = `${firstName} ${lastName}`.trim();

  const nameEl = document.getElementById('profile-hero-name');
  if (nameEl) {
    if (fullName) {
      nameEl.textContent = fullName.toUpperCase();
      nameEl.classList.remove('is-placeholder');
      nameEl.removeAttribute('role');
      nameEl.removeAttribute('tabindex');
    } else {
      nameEl.textContent = t('profile_default_name') || '+ AÑADE TU NOMBRE';
      nameEl.classList.add('is-placeholder');
      nameEl.setAttribute('role', 'button');
      nameEl.setAttribute('tabindex', '0');
    }
  }

  const subEl = document.getElementById('profile-hero-sub');
  if (subEl) {
    const bio = (db.bio !== undefined && db.bio !== null && db.bio !== '') ? db.bio : (metadata.bio || '');
    const city = (db.city !== undefined && db.city !== null && db.city !== '') ? db.city : (metadata.city || '');
    const country = (db.country !== undefined && db.country !== null && db.country !== '') ? db.country : (metadata.country || '');
    const location = [city, country].filter(Boolean).join(', ');
    const websiteRaw = (db.website !== undefined && db.website !== null && db.website !== '') ? db.website : (metadata.website || '');
    const website = websiteRaw ? ` · ${websiteRaw.replace(/^https?:\/\//, '')}` : '';
    const details = [bio, location].filter(Boolean).join(' | ');
    const fullSub = details ? `${details}${website}` : '';

    if (fullSub) {
      subEl.textContent = fullSub;
      subEl.classList.remove('is-placeholder');
      subEl.removeAttribute('role');
      subEl.removeAttribute('tabindex');
    } else {
      subEl.textContent = t('profile_default_bio') || '+ Añade una biografía sobre ti...';
      subEl.classList.add('is-placeholder');
      subEl.setAttribute('role', 'button');
      subEl.setAttribute('tabindex', '0');
    }
  }

  // Badges y datos sociales
  const verifiedBadge = document.getElementById('profile-verified-badge');
  if (verifiedBadge) {
    verifiedBadge.classList.toggle('hidden', !db.is_verified_pro);
    if (db.verified_pro_title) verifiedBadge.textContent = `✓ ${db.verified_pro_title.toUpperCase()}`;
  }

  const schoolBadge = document.getElementById('profile-school-badge');
  if (schoolBadge) {
    if (db.school) {
      schoolBadge.textContent = `// ${db.school.toUpperCase()}`;
      schoolBadge.classList.remove('hidden');
    } else {
      schoolBadge.classList.add('hidden');
    }
  }

  const pointsDisplay = document.getElementById('profile-points-display');
  if (pointsDisplay) {
    pointsDisplay.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px; margin-right:3px;"><polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9"/></svg><span>${db.total_points || 0} PTS NOLLI</span>`;
    pointsDisplay.title = `Visitas: ${db.points_visitor || 0} pts | Aportaciones: ${db.points_contributor || 0} pts`;
  }

  // Cargar métricas sociales del usuario autenticado
  const token = getSessionToken();
  if (token && profileState.user?.id) {
    fetchUserSocialCounts(profileState.user.id).then((counts) => {
      const summaryEl = document.getElementById('profile-social-summary');
      if (summaryEl) {
        summaryEl.textContent = `${counts.followers} seguidores · ${counts.following} siguiendo · ${counts.friends} amigos`;
      }
    }).catch(() => {});

    fetchIncomingFriendRequests(token).then((reqs) => {
      const badge = document.getElementById('badge-network-requests');
      if (badge) {
        if (reqs.length > 0) {
          badge.textContent = reqs.length;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
    }).catch(() => {});
  }

  syncAdminBadge();
  renderGamificationProgress();
}

// -------------------------------------------------------------------------
// 2.5. GAMIFICACIÓN (NIVEL Y PROGRESO DE PUNTOS)
// -------------------------------------------------------------------------
function getGamificationTier(points) {
  const pts = Number(points) || 0;
  if (pts < 100) {
    return {
      level: 1,
      badge: 'Explorador Inicial',
      icon: '№ 01',
      min: 0,
      next: 100,
      nextBadge: 'Urbanista Curioso',
    };
  } else if (pts < 250) {
    return {
      level: 2,
      badge: 'Urbanista Curioso',
      icon: '№ 02',
      min: 100,
      next: 250,
      nextBadge: 'Cronista de Barrio',
    };
  } else if (pts < 500) {
    return {
      level: 3,
      badge: 'Cronista de Barrio',
      icon: '№ 03',
      min: 250,
      next: 500,
      nextBadge: 'Maestro Bauhaus',
    };
  } else if (pts < 1000) {
    return {
      level: 4,
      badge: 'Maestro Bauhaus',
      icon: '№ 04',
      min: 500,
      next: 1000,
      nextBadge: 'Arquitecto Mayor',
    };
  } else {
    return {
      level: 5,
      badge: 'Arquitecto Mayor',
      icon: '№ 05',
      min: 1000,
      next: null,
      nextBadge: null,
    };
  }
}

function renderGamificationProgress() {
  const card = document.getElementById('profile-gamification-card');
  if (!card) return;

  const db = profileState.dbProfile || {};
  const totalPts = Number(db.total_points) || 0;
  const visitorPts = Number(db.points_visitor) || 0;
  const contribPts = Number(db.points_contributor) || 0;

  const tier = getGamificationTier(totalPts);

  let progressPct = 100;
  let remainingText = '';
  let goalText = '';

  if (tier.next !== null) {
    const range = tier.next - tier.min;
    const progressInRange = Math.max(0, totalPts - tier.min);
    progressPct = Math.min(100, Math.max(0, Math.round((progressInRange / range) * 100)));
    const needed = tier.next - totalPts;
    remainingText = `Te faltan <strong>${needed} puntos</strong> para <em>${escapeHtml(tier.nextBadge)}</em>`;
    goalText = `${tier.next} PTS`;
  } else {
    progressPct = 100;
    remainingText = `¡Nivel máximo alcanzado!`;
    goalText = 'MAX';
  }

  card.innerHTML = `
    <div class="gamification-card-header">
      <div class="gamification-level-wrap">
        <div class="gamification-badge-icon" aria-hidden="true">${tier.icon}</div>
        <div class="gamification-level-info">
          <span class="gamification-level-title">NIVEL ${tier.level} · ${escapeHtml(tier.badge.toUpperCase())}</span>
          <span class="gamification-breakdown">${visitorPts} pts visitas · ${contribPts} pts aportaciones</span>
        </div>
      </div>
      <div class="gamification-points-pill">
        <span class="gamification-points-value">${totalPts}</span>
        <span class="gamification-points-unit">PTS</span>
      </div>
    </div>

    <!-- Barra de progreso horizontal rectangular: relleno en naranja sobre fondo oscuro con borde negro -->
    <div class="gamification-track" role="progressbar" aria-valuenow="${progressPct}" aria-valuemin="0" aria-valuemax="100" aria-label="Progreso de nivel">
      <div class="gamification-fill" style="width: ${progressPct}%;"></div>
    </div>

    <div class="gamification-footer">
      <span class="gamification-remaining-text">${remainingText}</span>
      <span class="gamification-goal-text">${goalText}</span>
    </div>
  `;
}
if (typeof window !== 'undefined') window.renderGamificationProgress = renderGamificationProgress;

function syncAdminBadge() {
  const cardAdmin = document.getElementById('profile-admin-card');
  const adminRow = document.getElementById('profile-admin-row');
  const userEmail = String(profileState.user?.email || '').toLowerCase().trim();
  const metaRole = String(profileState.user?.app_metadata?.role || profileState.user?.user_metadata?.role || '').toLowerCase();
  const dbRole = String(profileState.dbProfile?.role || '').toLowerCase();
  const isMasterOwner = userEmail === 'studio.signes@gmail.com' || userEmail.includes('signes.studio') || userEmail.includes('studio.signes');
  const role = dbRole || metaRole || (isMasterOwner ? 'superadmin' : 'user');
  const isAdmin = isMasterOwner || role === 'admin' || role === 'superadmin';
  if (cardAdmin) cardAdmin.classList.toggle('hidden', !isAdmin);
  if (adminRow) adminRow.classList.toggle('hidden', !isAdmin);
}

// -------------------------------------------------------------------------
// 2.7. LISTA UNIFICADA DE AJUSTES (NEO-BAUHAUS)
// -------------------------------------------------------------------------
function updateSettingsDisplays() {
  const isDark = document.body.classList.contains('dark-mode');
  const themeVal = document.getElementById('row-theme-value');
  const themeRowIcon = document.getElementById('row-theme-icon');
  if (themeVal) themeVal.textContent = isDark ? 'Oscuro' : 'Claro';
  if (themeRowIcon) themeRowIcon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');

  const langVal = document.getElementById('row-lang-value');
  if (langVal) {
    const cur = (typeof getLanguage === 'function') ? getLanguage() : 'es';
    const names = { es: 'Castellano', en: 'English', ca: 'Català' };
    langVal.textContent = names[cur] || cur.toUpperCase();
  }

  const notifVal = document.getElementById('row-notifications-value');
  if (notifVal) {
    const isMuted = localStorage.getItem('nolli_notifications_muted') === 'true';
    notifVal.textContent = isMuted ? 'Silenciadas' : 'Activas';
  }

  if (window.lucide) window.lucide.createIcons();
}

function bindSettingsListActions() {
  updateSettingsDisplays();

  // 1. Personalizar perfil
  const rowEdit = document.getElementById('row-edit-profile');
  if (rowEdit) {
    rowEdit.onclick = () => openEditProfileModal();
  }

  // 2. Tema visual
  const rowTheme = document.getElementById('row-theme-toggle');
  if (rowTheme) {
    rowTheme.onclick = () => {
      const isDark = document.body.classList.contains('dark-mode');
      const newDark = !isDark;
      document.documentElement.classList.toggle('dark-mode', newDark);
      document.body.classList.toggle('dark-mode', newDark);
      localStorage.setItem('nolli_theme', newDark ? 'dark' : 'light');
      localStorage.setItem('nolli_map_style', newDark ? 'dark' : 'light');
      const meta = document.getElementById('meta-theme-color');
      if (meta) meta.setAttribute('content', newDark ? '#141411' : '#F8F1DF');
      updateThemeIcon(newDark);
      updateSettingsDisplays();
    };
  }

  // 3. Idioma
  const rowLang = document.getElementById('row-lang-toggle');
  if (rowLang) {
    rowLang.onclick = () => {
      const cur = (typeof getLanguage === 'function') ? getLanguage() : 'es';
      const cycle = { es: 'en', en: 'ca', ca: 'es' };
      const nextLang = cycle[cur] || 'es';
      switchLanguage(nextLang);
    };
  }

  // 4. Notificaciones
  const rowNotif = document.getElementById('row-notifications-toggle');
  if (rowNotif) {
    rowNotif.onclick = () => {
      const isMuted = localStorage.getItem('nolli_notifications_muted') === 'true';
      localStorage.setItem('nolli_notifications_muted', String(!isMuted));
      updateSettingsDisplays();
    };
  }

  // 5. Cerrar sesión
  const rowLogout = document.getElementById('row-logout');
  if (rowLogout) {
    rowLogout.onclick = logout;
  }
}

function syncBottomNavLinks() {
  const prefix = getUrlPrefix();
  const bottomBar = document.getElementById('mobile-bottom-bar');
  if (!bottomBar) return;
  const links = bottomBar.querySelectorAll('a.mobile-nav-btn');
  links.forEach((a) => {
    const rawHref = a.getAttribute('href') || '';
    if (rawHref.includes('admin.html')) {
      a.setAttribute('href', `${prefix}/admin.html`);
    } else if (rawHref.includes('perfil.html') || rawHref === './perfil.html') {
      a.setAttribute('href', `${prefix}/perfil.html`);
    } else if (rawHref.includes('#explore')) {
      a.setAttribute('href', `${prefix}/#explore`);
    } else if (rawHref.includes('#radar')) {
      a.setAttribute('href', `${prefix}/#radar`);
    } else if (rawHref.includes('#places')) {
      a.setAttribute('href', `${prefix}/#places`);
    } else if (rawHref === './' || rawHref === '/') {
      a.setAttribute('href', `${prefix}/` || '/');
    }
  });
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
  const nav = document.querySelector('.profile-curatorial-nav');
  const wrap = document.querySelector('.profile-tabs-scroll-wrap');
  if (nav && wrap) {
    initTabsScrollIndicator(nav, wrap);
  }

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
    const isAct = b.dataset.profileTab === tab;
    b.classList.toggle('active', isAct);
    if (isAct) {
      try {
        b.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
      } catch (_) {}
    }
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
  } else if (activeTab === 'network') {
    renderNetworkFeed();
  } else {
    renderCollectionsFeed();
  }

  if (window.lucide) window.lucide.createIcons();
}
if (typeof window !== 'undefined') window.renderFeedContent = renderFeedContent;

async function renderNetworkFeed() {
  if (!content) return;
  const token = getSessionToken();
  if (!token) return;

  content.innerHTML = `
    <div class="profile-feed-loading" style="padding: 24px; text-align: center; font-size: 11px; font-family: 'Inter', sans-serif;">
      CARGANDO MI RED SOCIAL...
    </div>
  `;

  try {
    const [requests, friends] = await Promise.all([
      fetchIncomingFriendRequests(token).catch(() => []),
      fetchUserFriends(token).catch(() => []),
    ]);

    const badge = document.getElementById('badge-network-requests');
    if (badge) {
      if (requests.length > 0) {
        badge.textContent = requests.length;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    let html = '';

    if (requests.length > 0) {
      html += `
        <div style="margin-bottom: 24px;">
          <h3 style="font-family: 'League Spartan', sans-serif; font-size: 16px; margin: 0 0 12px; color: var(--accent, #E84E1B); letter-spacing: 0.04em;">
            SOLICITUDES DE AMISTAD RECIBIDAS (${requests.length})
          </h3>
          <div style="display: grid; gap: 10px;">
            ${requests.map(req => {
              const s = req.sender || {};
              const name = s.first_name || s.nick || 'Usuario';
              const nick = s.nick ? `@${s.nick}` : '';
              const school = s.school ? ` · // ${escapeHtml(s.school.toUpperCase())}` : '';
              return `
                <div class="my-collection-card" style="background: var(--bg-panel); border: 1.5px solid var(--border-strong); padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 38px; height: 38px; border-radius: 0 !important; background: var(--accent); color:#fff; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid var(--border-strong);">
                      ${escapeHtml(name[0].toUpperCase())}
                    </div>
                    <div>
                      <strong style="font-size: 12px; display: block;">${escapeHtml(name)} ${s.is_verified_pro ? '<span style="color:var(--accent); font-size:10px;">✓ PRO</span>' : ''}</strong>
                      <span style="font-size: 10px; color: var(--fg-dim);">${escapeHtml(nick)}${school}</span>
                    </div>
                  </div>
                  <div style="display: flex; gap: 8px;">
                    <button type="button" class="btn-accept-friend filter-action" data-friendship-id="${req.friendshipId}" style="padding: 6px 12px; font-size: 10px; font-weight: 800; background: var(--fg); color: var(--bg); border: 1px solid var(--border-strong); cursor: pointer;">
                      ✓ ACEPTAR
                    </button>
                    <button type="button" class="btn-decline-friend filter-action" data-friendship-id="${req.friendshipId}" style="padding: 6px 12px; font-size: 10px; font-weight: 800; background: var(--bg-raised); color: var(--fg); border: 1px solid var(--border-strong); cursor: pointer;">
                      ✕ RECHAZAR
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    html += `
      <div>
        <h3 style="font-family: 'League Spartan', sans-serif; font-size: 16px; margin: 0 0 12px; color: var(--fg); letter-spacing: 0.04em;">
          AMIGOS (${friends.length})
        </h3>
    `;

    if (!friends.length) {
      html += `
        <div class="profile-feed-empty" style="padding: 24px; text-align: center; border: 1px dashed var(--border); font-size: 11px;">
          AÚN NO TIENES AMIGOS EN NOLLI.<br>
          <span style="font-size: 10px; color: var(--fg-dim); margin-top: 6px; display: block;">
            Visita perfiles públicos para enviar solicitudes de amistad y conectar con otros arquitectos.
          </span>
        </div>
      `;
    } else {
      html += `
        <div style="display: grid; gap: 10px;">
          ${friends.map(f => {
            const name = f.first_name || f.nick || 'Usuario';
            const nick = f.nick ? `@${f.nick}` : '';
            const school = f.school ? ` · // ${escapeHtml(f.school.toUpperCase())}` : '';
            const location = [f.city, f.country].filter(Boolean).join(', ');
            return `
              <div class="my-collection-card" style="background: var(--bg-panel); border: 1px solid var(--border-strong); padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="width: 38px; height: 38px; border-radius: 0 !important; background: var(--fg); color: var(--bg); display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid var(--border-strong);">
                    ${escapeHtml(name[0].toUpperCase())}
                  </div>
                  <div>
                    <strong style="font-size: 12px; display: block;">${escapeHtml(name)} ${f.is_verified_pro ? '<span style="color:var(--accent); font-size:10px;">✓ PRO</span>' : ''}</strong>
                    <span style="font-size: 10px; color: var(--fg-dim);">${escapeHtml(nick)}${school}${location ? ` · ${escapeHtml(location)}` : ''}</span>
                  </div>
                </div>
                <a href="./public-profile.html?id=${encodeURIComponent(f.id)}" class="filter-action" style="text-decoration: none; padding: 6px 12px; font-size: 10px; font-weight: 800; border: 1px solid var(--border-strong); background: var(--bg-panel); color: var(--fg);">
                  VER PERFIL ↗
                </a>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    html += '</div>';
    content.innerHTML = html;

    content.querySelectorAll('.btn-accept-friend').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.friendshipId;
        btn.disabled = true;
        btn.textContent = 'ACEPTANDO...';
        try {
          await respondFriendshipRpc(id, true, token);
          renderNetworkFeed();
        } catch (e) {
          alert(e.message);
          btn.disabled = false;
        }
      };
    });

    content.querySelectorAll('.btn-decline-friend').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.friendshipId;
        btn.disabled = true;
        btn.textContent = 'RECHAZANDO...';
        try {
          await respondFriendshipRpc(id, false, token);
          renderNetworkFeed();
        } catch (e) {
          alert(e.message);
          btn.disabled = false;
        }
      };
    });

  } catch (err) {
    console.error('Error al cargar red social:', err);
    content.innerHTML = `<div class="profile-feed-empty">Error al cargar la red social: ${escapeHtml(err.message)}</div>`;
  }
}

function renderBuildingsFeed(buildings, tabKey) {
  const isVisited = tabKey === 'visited';
  const emptyText = isVisited
    ? t('profile_empty_visited', null, 'NO TIENES OBRAS MARCADAS COMO VISITADAS. REGISTRA TUS VISITAS DESDE EL MAPA.')
    : t('profile_empty_favorites', null, 'NO TIENES OBRAS FAVORITAS AÚN. GUARDA OBRAS EN FAVORITOS DESDE EL MAPA.');

  if (!buildings.length) {
    const icon = isVisited ? 'check-circle' : 'star';
    const title = isVisited ? 'SIN OBRAS VISITADAS' : 'SIN FAVORITOS AÚN';
    const desc = isVisited
      ? t('profile_empty_visited', null, 'Registra tus visitas desde las fichas del mapa para completar tu pasaporte arquitectónico.')
      : t('profile_empty_favorites', null, 'Guarda obras de referencia pulsando el icono de estrella en cualquier ficha.');

    content.innerHTML = `
      <div class="nolli-empty-state">
        <div class="nolli-empty-icon-wrap">
          <i data-lucide="${icon}" width="22" height="22"></i>
        </div>
        <h4 class="nolli-empty-title">${title}</h4>
        <p class="nolli-empty-desc">${desc}</p>
        <a href="./" class="nolli-empty-action">EXPLORAR EL MAPA ↗</a>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // CRÍTICO FIX #3: Usar renderInChunks para evitar jank en listas grandes
  content.innerHTML = '';
  
  const htmlChunks = buildings.map((obra) => {
    const actionBtnHtml = isVisited
      ? `<button type="button" class="profile-card-action-btn danger" data-remove-visited="${obra.id}" title="${escapeHtml(t('profile_remove_visited_aria', null, 'Quitar de visitados'))}" aria-label="${escapeHtml(t('profile_remove_visited_aria', null, 'Quitar de visitados'))}">
          <i data-lucide="check" width="12" height="12"></i>
          <span>${t('remove_upper', null, 'QUITAR')}</span>
        </button>`
      : `<button type="button" class="profile-card-action-btn danger" data-remove-favorite="${obra.id}" title="${escapeHtml(t('profile_remove_favorites_aria', null, 'Quitar de favoritos'))}" aria-label="${escapeHtml(t('profile_remove_favorites_aria', null, 'Quitar de favoritos'))}">
          <i data-lucide="star" width="12" height="12"></i>
          <span>${t('remove_upper', null, 'QUITAR')}</span>
        </button>`;

    return `<div class="profile-feed-row"><a href="${getUrlPrefix()}/obra/${encodeURIComponent(obra.id || obra.featureId)}" class="profile-feed-item">${renderObraCard(obra, { variant: 'profile', featureId: obra.id || obra.featureId })}</a><div class="profile-feed-row-actions">${actionBtnHtml}</div></div>`;
  });
  
  renderInChunks(content, htmlChunks, 10, () => {
    if (window.lucide) window.lucide.createIcons();
  });
}

function renderCollectionsFeed() {
  const collections = profileState.collections || [];
  const followed = profileState.followedCollections || [];

  content.innerHTML = `
    <div class="profile-collections-top">
      <span style="font-family: 'Inter', sans-serif; font-size:11px; font-weight:800; color:var(--fg-dim);">${t('profile_my_lists_header', { count: collections.length }, `MIS LISTAS // ${collections.length}`)}</span>
      <button type="button" class="profile-new-list-btn" id="btn-create-collection-top">
        <span>${t('profile_btn_new_list', null, '+ NUEVA LISTA')}</span>
      </button>
    </div>
  `;

  if (!collections.length && !followed.length) {
    content.innerHTML += `
      <div class="nolli-empty-state">
        <div class="nolli-empty-icon-wrap">
          <i data-lucide="bookmark" width="22" height="22"></i>
        </div>
        <h4 class="nolli-empty-title">SIN LISTAS DE VIAJE</h4>
        <p class="nolli-empty-desc">${t('profile_empty_collections', null, 'Crea tu primera lista para organizar tus próximas rutas y obras de arquitectura.')}</p>
        <button type="button" class="nolli-empty-action" id="btn-create-collection-empty">+ NUEVA LISTA</button>
      </div>
    `;
    content.querySelector('#btn-create-collection-empty')?.addEventListener('click', () => {
      abrirModalCrearLista();
    });
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const cardsHtml = collections.map((col) => {
    const items = (profileState.items || []).filter((item) => String(item.collection_id) === String(col.id));
    const countText = `${items.length} ${items.length === 1 ? t('building_singular', null, 'obra') : t('building_plural', null, 'obras')}`;
    const isPublic = col.status === 'public' || col.is_public === true;
    const isFriends = col.status === 'friends';

    // Determinar miniatura (cover_photo_url -> primera foto de obra en la lista -> fallback geométrico Bauhaus)
    let thumbUrl = col.cover_photo_url || null;
    if (!thumbUrl && items.length > 0) {
      for (const it of items) {
        const obra = obraFor(it.building_id);
        if (obra && (obra.foto_miniatura || obra.foto_url)) {
          thumbUrl = obra.foto_miniatura || obra.foto_url;
          break;
        }
      }
    }

    const fallbackBg = col.color || 'var(--bg-raised)';
    const colSymbol = (col.icon && !/\p{Extended_Pictographic}/u.test(col.icon)) ? col.icon : '№';

    const thumbHtml = thumbUrl
      ? `
        <div class="profile-col-thumb-square">
          <img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(col.name)}" class="profile-col-thumb-img" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <div class="profile-col-thumb-fallback profile-col-thumb-blueprint" style="display:none; background:${escapeHtml(fallbackBg)};">
            <span class="profile-col-thumb-symbol">${escapeHtml(colSymbol)}</span>
          </div>
        </div>
      `
      : `
        <div class="profile-col-thumb-square">
          <div class="profile-col-thumb-fallback profile-col-thumb-blueprint" style="background:${escapeHtml(fallbackBg)};">
            <span class="profile-col-thumb-symbol">${escapeHtml(colSymbol)}</span>
          </div>
        </div>
      `;

    let badgeClass = 'is-private';
    let badgeText = t('collection_status_private', null, 'PRIVADA');
    if (isPublic) {
      badgeClass = 'is-public';
      badgeText = t('collection_status_public', null, 'PÚBLICA');
    } else if (isFriends) {
      badgeClass = 'is-friends';
      badgeText = t('collection_status_friends', null, 'AMIGOS');
    }

    let metaDate = '';
    if (col.created_at) {
      try {
        const d = new Date(col.created_at);
        if (!isNaN(d.getTime())) {
          metaDate = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
        }
      } catch {}
    }

    return `
      <article class="profile-rich-collection-card" data-col-id="${col.id}">
        ${thumbHtml}
        <div class="profile-col-body">
          <div class="profile-col-title-row">
            <a href="./#list=${encodeURIComponent(col.id)}" class="profile-col-title-link">
              <h3 class="profile-col-name">${escapeHtml(col.name)}</h3>
            </a>
            <span class="profile-col-visibility-badge ${badgeClass}">${escapeHtml(badgeText)}</span>
          </div>
          <div class="profile-col-meta-row">
            <span class="profile-col-works-count">${countText}</span>
            ${metaDate ? `<span class="profile-col-meta-sep">·</span><span class="profile-col-meta-date">${metaDate}</span>` : ''}
            ${col.description ? `<span class="profile-col-meta-sep">·</span><span class="profile-col-desc">${escapeHtml(col.description)}</span>` : ''}
          </div>
        </div>
        <div class="profile-col-actions">
          <a href="./#list=${encodeURIComponent(col.id)}" class="profile-col-action-btn" title="${escapeHtml(t('profile_view_on_map_title', null, 'Ver en el mapa'))}" aria-label="Ver en el mapa">
            <i data-lucide="map" width="14" height="14"></i>
          </a>
          <button type="button" class="profile-col-action-btn" data-edit-col="${col.id}" title="${escapeHtml(t('profile_edit_list_title', null, 'Editar lista'))}" aria-label="Editar lista">
            <i data-lucide="edit-2" width="14" height="14"></i>
          </button>
          <button type="button" class="profile-col-action-btn btn-delete" data-delete-col="${col.id}" title="${escapeHtml(t('profile_delete_list_title', null, 'Eliminar lista'))}" aria-label="Eliminar lista">
            <i data-lucide="trash-2" width="14" height="14"></i>
          </button>
        </div>
      </article>
    `;
  }).join('');

  content.innerHTML += cardsHtml;

  // Renderizar listas seguidas con el mismo patrón de tarjeta enriquecida
  if (followed.length > 0) {
    const followedHtml = followed.map((f) => {
      const col = f.user_collections || f;
      if (!col) return '';
      const creatorName = col.profiles?.nick ? `@${col.profiles.nick}` : (col.profiles?.first_name ? `@${col.profiles.first_name}` : t('profile_community_name', null, 'Comunidad Nolli'));
      const emoji = (col.icon && !/\p{Extended_Pictographic}/u.test(col.icon)) ? col.icon : '№';
      const title = col.name || 'Lista pública';
      const desc = col.description || '';
      const itemsCount = col.work_ids?.length || 0;
      const countLabel = itemsCount > 0 ? `${itemsCount} obras` : '';

      const thumbHtml = col.cover_photo_url
        ? `
          <div class="profile-col-thumb-square">
            <img src="${escapeHtml(col.cover_photo_url)}" alt="${escapeHtml(title)}" class="profile-col-thumb-img" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
            <div class="profile-col-thumb-fallback profile-col-thumb-blueprint" style="display:none; background:var(--bg-raised);">
              <span class="profile-col-thumb-symbol">${escapeHtml(emoji)}</span>
            </div>
          </div>
        `
        : `
          <div class="profile-col-thumb-square">
            <div class="profile-col-thumb-fallback profile-col-thumb-blueprint" style="background:var(--bg-raised);">
              <span class="profile-col-thumb-symbol">${escapeHtml(emoji)}</span>
            </div>
          </div>
        `;

      return `
        <article class="profile-rich-collection-card is-followed" style="border-left: 3.5px solid var(--accent, #E84E1B);">
          ${thumbHtml}
          <div class="profile-col-body">
            <div class="profile-col-title-row">
              <a href="./#list=${encodeURIComponent(col.id)}" class="profile-col-title-link">
                <h3 class="profile-col-name">${escapeHtml(title)}</h3>
              </a>
              <span class="profile-col-visibility-badge is-followed">${t('profile_badge_followed', null, 'SEGUIDA')}</span>
            </div>
            <div class="profile-col-meta-row">
              <span>Por <strong style="color:var(--fg);">${escapeHtml(creatorName)}</strong></span>
              ${countLabel ? `<span class="profile-col-meta-sep">·</span><span>${countLabel}</span>` : ''}
              ${desc ? `<span class="profile-col-meta-sep">·</span><span class="profile-col-desc">${escapeHtml(desc)}</span>` : ''}
            </div>
          </div>
          <div class="profile-col-actions">
            <a href="./#list=${encodeURIComponent(col.id)}" class="profile-col-action-btn" title="${escapeHtml(t('profile_view_on_map_title', null, 'Ver en el mapa'))}" aria-label="Ver en el mapa">
              <i data-lucide="map" width="14" height="14"></i>
            </a>
            <button type="button" class="profile-col-action-btn btn-delete" data-unfollow-col="${col.id}" title="${escapeHtml(t('profile_unfollow_title', null, 'Dejar de seguir'))}" aria-label="Dejar de seguir">
              ✕
            </button>
          </div>
        </article>
      `;
    }).join('');

    content.innerHTML += `
      <div class="profile-collections-top" style="margin-top:28px;">
        <span style="font-family: 'Inter', sans-serif; font-size:11px; font-weight:800; color:var(--accent, #E84E1B);">${t('profile_followed_collections_header', { count: followed.length }, `LISTAS SEGUIDAS DE LA COMUNIDAD // ${followed.length}`)}</span>
      </div>
      ${followedHtml}
    `;
  }

  if (window.lucide) window.lucide.createIcons();
}

function renderNotesFeed() {
  const buildingsWithNotes = notedBuildings();

  if (!buildingsWithNotes.length) {
    content.innerHTML = `
      <div class="nolli-empty-state">
        <div class="nolli-empty-icon-wrap">
          <i data-lucide="file-text" width="22" height="22"></i>
        </div>
        <h4 class="nolli-empty-title">SIN NOTAS PRIVADAS</h4>
        <p class="nolli-empty-desc">${t('profile_empty_notes', null, 'Añade observaciones constructivas o croquis de análisis en cualquier obra.')}</p>
        <a href="./" class="nolli-empty-action">IR AL MAPA ↗</a>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  content.innerHTML = buildingsWithNotes.map((obra) => {
    const status = profileState.statuses.get(String(obra.id)) || {};
    const noteText = status.notas || '';
    const photo = getOptimizedPhotoUrl(obra.foto_miniatura || obra.foto_url || '', { width: 160 });
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
              <div class="profile-feed-thumb-fallback" style="width:50px; height:50px; min-width:50px; min-height:50px; font-size:16px;"></div>
            `}
            <div style="min-width:0; flex:1;">
              <a href="${getUrlPrefix()}/obra/${encodeURIComponent(obra.id)}" class="profile-feed-title" style="font-size:14px; text-decoration:none;">${escapeHtml(title)}${escapeHtml(year)}</a>
              <div class="profile-feed-meta" style="font-size:11px;">${escapeHtml(architect)}</div>
            </div>
          </div>
          <div class="profile-collection-tools">
            <button type="button" class="profile-card-action-btn" data-edit-note="${obra.id}" title="${escapeHtml(t('edit_note', null, 'Editar nota'))}">
              <i data-lucide="edit-2" width="12" height="12"></i>
              <span>${t('edit_upper', null, 'EDITAR')}</span>
            </button>
            <button type="button" class="profile-card-action-btn danger" data-delete-note="${obra.id}" title="${escapeHtml(t('delete_note', null, 'Eliminar nota'))}">
              <i data-lucide="trash-2" width="12" height="12"></i>
              <span>${t('delete_upper', null, 'BORRAR')}</span>
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
    const btnRemoveFav = e.target.closest('[data-remove-favorite], [data-remove-fav]');
    if (btnRemoveFav) {
      const buildingId = btnRemoveFav.dataset.removeFavorite || btnRemoveFav.dataset.removeFav;
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

    // 5b. Dejar de seguir lista pública
    const btnUnfollowCol = e.target.closest('[data-unfollow-col]');
    if (btnUnfollowCol) {
      const colId = btnUnfollowCol.dataset.unfollowCol;
      if (!window.confirm(t('profile_confirm_unfollow', null, '¿Dejar de seguir esta lista pública?'))) return;
      profileState.followedCollections = (profileState.followedCollections || []).filter(f => {
        const c = f.user_collections || f;
        return String(c?.id) !== String(colId);
      });
      renderCollectionsFeed();
      try {
        await unfollowCollection(colId, user.id, token);
      } catch (err) {
        console.warn('Error al dejar de seguir lista:', err);
      }
      return;
    }

    // 5c. Copiar enlace compartible de lista
    const btnCopyCol = e.target.closest('[data-copy-col-link]');
    if (btnCopyCol) {
      const colId = btnCopyCol.dataset.copyColLink;
      const url = `${window.location.origin}/#list=${encodeURIComponent(colId)}`;
      navigator.clipboard?.writeText(url).then(() => {
        alert(t('link_copied', null, 'Enlace copiado al portapapeles'));
      }).catch(() => {
        prompt('Copia el enlace a la lista:', url);
      });
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

    // 10. Copiar enlace compartible de lista
    const btnCopyColLink = e.target.closest('[data-copy-col-link]');
    if (btnCopyColLink) {
      const colId = btnCopyColLink.dataset.copyColLink;
      const url = `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '')}/#list=${encodeURIComponent(colId)}`;
      navigator.clipboard.writeText(url).then(() => {
        alert('¡Enlace directo a la lista copiado al portapapeles!');
      }).catch(() => {
        prompt('Enlace a la lista:', url);
      });
      return;
    }

    // 11. Dejar de seguir lista pública
    const btnUnfollow = e.target.closest('[data-unfollow-col]');
    if (btnUnfollow) {
      const colId = btnUnfollow.dataset.unfollowCol;
      if (!window.confirm(t('profile_confirm_unfollow', null, '¿Dejar de seguir esta lista pública?'))) return;
      try {
        await unfollowCollection(colId, user.id, token);
        profileState.followedCollections = profileState.followedCollections.filter(
          (f) => String(f.collection_id) !== String(colId) && String(f.id) !== String(colId)
        );
        state.userFollowedCollections = profileState.followedCollections;
        renderFeedContent();
      } catch (err) {
        alert(err.message || 'Error al dejar de seguir la lista.');
      }
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
  try {
    localStorage.setItem(`nolli:building-status:${user.id}`, JSON.stringify([...state.buildingStatuses.entries()]));
    localStorage.setItem('nolli_cached_statuses', JSON.stringify([...profileState.statuses.entries()].map(([id, s]) => ({ building_id: id, ...s }))));
  } catch {}

  renderMetrics();
  renderFeedContent();
  document.dispatchEvent(new CustomEvent('radar:user-status-changed', { detail: { buildingId: String(buildingId), ...statusUpdate } }));

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
  if (!window.confirm(t('profile_confirm_delete_list', { name: col?.name || collectionId }, `¿Eliminar la lista "${col?.name || collectionId}"?`))) return;

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
  if (!window.confirm(t('profile_confirm_delete_note', null, '¿Eliminar la nota privada de esta obra?'))) return;
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

  const shareWrap = document.getElementById('collection-share-wrap');
  const btnCopyLink = document.getElementById('btn-copy-collection-link');
  const copyFeedback = document.getElementById('copy-link-feedback');

  if (btnCopyLink) {
    btnCopyLink.addEventListener('click', () => {
      const editId = document.getElementById('collection-edit-id')?.value || '';
      if (!editId) return;
      const url = `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '')}/#list=${encodeURIComponent(editId)}`;
      navigator.clipboard.writeText(url).then(() => {
        if (copyFeedback) {
          copyFeedback.classList.remove('hidden');
          setTimeout(() => copyFeedback.classList.add('hidden'), 2500);
        }
      }).catch(() => {
        prompt('Enlace a la lista:', url);
      });
    });
  }

  // Alternar visualización del botón de compartir al cambiar de radio button
  document.querySelectorAll('input[name="collection-status-radio"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const editId = document.getElementById('collection-edit-id')?.value || '';
      if (shareWrap) {
        shareWrap.classList.toggle('hidden', radio.value !== 'public' || !editId);
      }
    });
  });

  formCollection.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = getSessionToken();
    const user = profileState.user;
    if (!token || !user) return;

    const editId = document.getElementById('collection-edit-id')?.value || '';
    const icon = document.getElementById('collection-icon')?.value.trim() || '';
    const name = document.getElementById('collection-name')?.value.trim() || '';
    const description = document.getElementById('collection-desc')?.value.trim() || '';
    const show_on_map = Boolean(document.getElementById('collection-show-map')?.checked);
    const status = document.querySelector('input[name="collection-status-radio"]:checked')?.value || 'private';

    if (!name) return;

    const submitBtn = document.getElementById('btn-save-collection');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.querySelector('span').textContent = t('saving', null, 'GUARDANDO...');
    }

    try {
      if (editId) {
        // Modificar lista existente
        const col = profileState.collections.find((c) => String(c.id) === String(editId));
        if (col) {
          col.name = name;
          col.icon = icon;
          col.description = description;
          col.status = status;
          col.is_public = status === 'public';
          col.show_on_map = show_on_map;
        }
        guardarColeccionesLocalmente();
        renderFeedContent();
        await updateUserCollection(editId, { name, icon, description, status, show_on_map }, token);
      } else {
        // Crear nueva lista
        const fallbackId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
        const newCol = {
          id: fallbackId,
          user_id: user.id,
          name,
          icon,
          description,
          status,
          is_public: status === 'public',
          show_on_map,
          created_at: new Date().toISOString(),
        };
        const created = await createUserCollection(newCol, token).catch(() => [newCol]);
        const savedCol = (Array.isArray(created) && created[0]) ? { ...created[0], show_on_map, status } : (created?.id ? { ...created, show_on_map, status } : newCol);
        profileState.collections.push(savedCol);
        guardarColeccionesLocalmente();
        renderFeedContent();
      }

      modalCollection.classList.remove('open');
    } catch (err) {
      if (collectionStatus) {
        collectionStatus.textContent = `ERROR: ${err.message || 'No se pudo guardar'}`;
        collectionStatus.classList.remove('hidden');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.querySelector('span').textContent = t('collection_btn_save', null, 'GUARDAR LISTA');
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
  const shareWrap = document.getElementById('collection-share-wrap');
  const radioPrivate = document.getElementById('status-private');

  if (title) title.textContent = t('collection_modal_title', null, 'NUEVA LISTA');
  if (editIdInput) editIdInput.value = '';
  if (iconInput) iconInput.value = '';
  if (nameInput) nameInput.value = '';
  if (descInput) descInput.value = '';
  if (mapToggle) mapToggle.checked = true;
  if (radioPrivate) radioPrivate.checked = true;
  if (shareWrap) shareWrap.classList.add('hidden');
  if (collectionStatus) collectionStatus.classList.add('hidden');

  modalCollection.classList.add('open');
  if (window.lucide) window.lucide.createIcons();
}

function abrirModalEditarLista(colId) {
  if (!modalCollection) return;
  const col = profileState.collections.find((c) => String(c.id) === String(colId));
  if (!col) return;

  const isPublic = col.status === 'public' || col.is_public === true;
  const title = document.getElementById('modal-collection-title');
  const editIdInput = document.getElementById('collection-edit-id');
  const iconInput = document.getElementById('collection-icon');
  const nameInput = document.getElementById('collection-name');
  const descInput = document.getElementById('collection-desc');
  const mapToggle = document.getElementById('collection-show-map');
  const shareWrap = document.getElementById('collection-share-wrap');
  const radioPrivate = document.getElementById('status-private');
  const radioPublic = document.getElementById('status-public');

  if (title) title.textContent = t('profile_title_edit_list', null, 'EDITAR LISTA');
  if (editIdInput) editIdInput.value = col.id;
  if (iconInput) iconInput.value = col.icon || '';
  if (nameInput) nameInput.value = col.name || '';
  if (descInput) descInput.value = col.description || '';
  if (mapToggle) mapToggle.checked = col.show_on_map !== false;

  if (isPublic && radioPublic) radioPublic.checked = true;
  else if (radioPrivate) radioPrivate.checked = true;

  if (shareWrap) shareWrap.classList.toggle('hidden', !isPublic);
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
      if (!window.confirm(t('profile_confirm_delete_note', null, '¿Eliminar la nota privada de esta obra?'))) return;
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
      submitBtn.querySelector('span').textContent = t('saving', null, 'GUARDANDO...');
    }

    try {
      await toggleStatus(buildingId, { notas: text });
      modalEditNote.classList.remove('open');
    } catch (err) {
      if (noteStatus) {
        noteStatus.textContent = `ERROR: ${err.message || 'No se pudo guardar la nota'}`;
        noteStatus.classList.remove('hidden');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.querySelector('span').textContent = t('note_modal_btn_save', null, 'GUARDAR NOTA');
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

      const inputFirst = document.getElementById('edit-profile-firstname');
      const inputLast = document.getElementById('edit-profile-lastname');
      const inputBio = document.getElementById('edit-profile-bio');
      const inputCity = document.getElementById('edit-profile-city');
      const inputCountry = document.getElementById('edit-profile-country');
      const inputWeb = document.getElementById('edit-profile-website');
      const inputSchool = document.getElementById('edit-profile-school');

      if (inputFirst) inputFirst.value = db.first_name || metadata.first_name || '';
      if (inputLast) inputLast.value = db.last_name || metadata.last_name || '';
      if (inputBio) inputBio.value = db.bio || metadata.bio || '';
      if (inputCity) inputCity.value = db.city || metadata.city || '';
      if (inputCountry) inputCountry.value = db.country || metadata.country || '';
      if (inputWeb) inputWeb.value = db.website || metadata.website || '';
      if (inputSchool) inputSchool.value = db.school || metadata.school || '';

      if (editStatus) editStatus.classList.add('hidden');
      setupLanguageSwitchers(modalEditProfile);
      modalEditProfile.classList.add('open');
      if (window.lucide) window.lucide.createIcons();
    });
  }

  if (btnCloseEditProfile && modalEditProfile) {
    btnCloseEditProfile.addEventListener('click', () => modalEditProfile.classList.remove('open'));
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
      const school = document.getElementById('edit-profile-school')?.value || '';

      const submitBtn = document.getElementById('btn-save-profile');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.querySelector('span').textContent = t('saving_changes', null, 'GUARDANDO CAMBIOS...');
      }

      const updatedProfile = {
        firstName,
        lastName,
        bio,
        city,
        country,
        website,
        school,
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
          school,
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
          school,
        };
        localStorage.setItem('nolli_cached_user', JSON.stringify(user));
        state.userProfile = updatedProfile;

        renderHero();

        if (editStatus) {
          editStatus.textContent = t('profile_updated_success', null, 'PERFIL ACTUALIZADO CON ÉXITO');
          editStatus.classList.remove('hidden');
        }

        setTimeout(() => {
          modalEditProfile.classList.remove('open');
          if (editStatus) editStatus.classList.add('hidden');
        }, 1200);
      } catch (err) {
        if (editStatus) {
          editStatus.textContent = `ERROR: ${err.message || 'No se pudo guardar'}`;
          editStatus.classList.remove('hidden');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.querySelector('span').textContent = t('profile_edit_save', null, 'GUARDAR CAMBIOS');
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
  let registerMode = false;

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
  const btnGuestLogin = document.getElementById('btn-guest-login');
  const guestBlock = document.querySelector('.guest-login-block');
  const err = document.getElementById('login-error');
  const termsCheckbox = document.getElementById('register-terms');
  const newsletterCheckbox = document.getElementById('register-newsletter');
  const registerSuccessView = document.getElementById('register-success-view');
  const registerSuccessEmail = document.getElementById('register-success-email');
  const btnSuccessToLogin = document.getElementById('btn-success-to-login');
  const modalTitle = document.getElementById('modal-login-title');

  const switchToLoginMode = () => {
    registerMode = false;
    if (loginForm) loginForm.classList.remove('hidden');
    if (registerSuccessView) registerSuccessView.classList.add('hidden');
    if (modalTitle) modalTitle.textContent = t('auth_modal_title', null, 'AUTENTICACIÓN REQUERIDA');
    if (actionButton) actionButton.textContent = t('auth_btn_login', null, 'AUTORIZAR ACCESO');
    if (registerButton) registerButton.textContent = t('auth_btn_register_mode', null, 'CREAR CUENTA');
    registerOnlyFields.forEach((field) => field.classList.add('hidden'));
    forgotPasswordButton?.classList.remove('hidden');
    document.querySelector('.keep-session')?.classList.remove('hidden');
    if (guestBlock) guestBlock.classList.remove('hidden');
    if (passwordInput) {
      passwordInput.value = '';
      passwordInput.autocomplete = 'current-password';
    }
    if (err) err.classList.add('hidden');
    if (window.lucide) window.lucide.createIcons();
  };

  if (btnSuccessToLogin) {
    btnSuccessToLogin.addEventListener('click', () => {
      switchToLoginMode();
    });
  }

  const openModal = () => {
    if (!mLogin) return;
    if (registerSuccessView && !registerSuccessView.classList.contains('hidden')) {
      switchToLoginMode();
    }
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

  if (btnGuestLogin) {
    btnGuestLogin.addEventListener('click', () => {
      try {
        sessionStorage.setItem('nolli:guest_session', 'true');
      } catch (e) {}
      window.location.href = './';
    });
  }

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', () => {
      const showing = passwordInput.type === 'text';
      passwordInput.type = showing ? 'password' : 'text';
      togglePassword.setAttribute('aria-label', showing ? t('auth_show_password_aria', null, 'Mostrar contraseña') : t('auth_hide_password_aria', null, 'Ocultar contraseña'));
      togglePassword.setAttribute('aria-pressed', String(!showing));
      togglePassword.innerHTML = showing
        ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
        : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
    });
  }

  if (registerButton) {
    registerButton.addEventListener('click', () => {
      registerMode = !registerMode;
      registerOnlyFields.forEach((field) => field.classList.toggle('hidden', !registerMode));
      if (actionButton) actionButton.textContent = registerMode ? t('auth_btn_complete_register', null, 'COMPLETAR REGISTRO') : t('auth_btn_login', null, 'AUTORIZAR ACCESO');
      registerButton.textContent = registerMode ? t('auth_btn_back_to_login', null, 'VOLVER A INICIO DE SESIÓN') : t('auth_btn_register_mode', null, 'CREAR CUENTA');
      if (termsCheckbox) termsCheckbox.required = registerMode;
      if (termsCheckbox && !registerMode) termsCheckbox.checked = false;
      if (guestBlock) guestBlock.classList.toggle('hidden', registerMode);
      if (err) err.classList.add('hidden');
      if (window.lucide) window.lucide.createIcons();
    });
  }

  if (forgotPasswordButton) {
    forgotPasswordButton.addEventListener('click', async () => {
      const email = document.getElementById('login-email')?.value.trim();
      if (!email) {
        if (err) {
          err.textContent = t('auth_err_enter_email', null, 'Escribe tu email para enviarte el enlace.');
          err.classList.remove('hidden');
        }
        return;
      }
      forgotPasswordButton.disabled = true;
      forgotPasswordButton.textContent = t('auth_sending_link', null, 'ENVIANDO ENLACE...');
      try {
        await requestPasswordReset(email);
        if (err) {
          err.textContent = t('auth_msg_check_email_reset', null, 'Revisa tu correo para restablecer la contraseña.');
          err.classList.remove('hidden');
        }
      } catch (error) {
        if (err) {
          err.textContent = error.message;
          err.classList.remove('hidden');
        }
      } finally {
        forgotPasswordButton.disabled = false;
        forgotPasswordButton.textContent = t('auth_forgot_password', null, '¿OLVIDASTE LA CONTRASEÑA?');
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
          err.textContent = t('auth_err_credentials_required', null, 'Introduce tu correo y contraseña.');
          err.classList.remove('hidden');
        }
        return;
      }

      if (registerMode) {
        if (!termsCheckbox?.checked) {
          if (err) {
            err.textContent = t('auth_err_accept_terms', null, 'Debes aceptar los términos y bases legales para registrarte.');
            err.classList.remove('hidden');
          }
          return;
        }
        if (actionButton) {
          actionButton.disabled = true;
          actionButton.textContent = t('auth_creating_account', null, 'CREANDO CUENTA...');
        }
        const firstName = document.getElementById('register-first-name')?.value.trim() || '';
        const lastName = document.getElementById('register-last-name')?.value.trim() || '';
        const city = document.getElementById('register-city')?.value.trim() || '';
        const country = document.getElementById('register-country')?.value.trim() || '';
        const newsletter = Boolean(newsletterCheckbox?.checked);

        try {
          const authData = await registerUser(email, password, { firstName, lastName, city, country, newsletter });
          if (authData.access_token) {
            const storage = keepSession?.checked ? localStorage : sessionStorage;
            storage.setItem(SESSION_KEY, JSON.stringify(authData));
            closeModal();
            await init();
          } else {
            // Desplegar pantalla de confirmación dedicada Neo-Bauhaus
            if (err) err.classList.add('hidden');
            if (loginForm) loginForm.classList.add('hidden');
            if (registerSuccessView) {
              registerSuccessView.classList.remove('hidden');
              if (registerSuccessEmail) registerSuccessEmail.textContent = email;
            }
            if (modalTitle) modalTitle.textContent = t('auth_title_confirm_account', null, 'CONFIRMACIÓN DE CUENTA');
            if (window.lucide) window.lucide.createIcons();
          }
        } catch (error) {
          if (err) {
            err.textContent = error.message;
            err.classList.remove('hidden');
          }
        } finally {
          if (actionButton) {
            actionButton.disabled = false;
            actionButton.textContent = registerMode ? t('auth_btn_complete_register', null, 'COMPLETAR REGISTRO') : t('auth_btn_login', null, 'AUTORIZAR ACCESO');
          }
        }
      } else {
        if (actionButton) {
          actionButton.disabled = true;
          actionButton.textContent = t('auth_authenticating', null, 'AUTENTICANDO...');
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
            actionButton.textContent = t('auth_btn_login', null, 'AUTORIZAR ACCESO');
          }
        }
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      logout();
    });
  }
}

// Iniciar al cargar el DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
