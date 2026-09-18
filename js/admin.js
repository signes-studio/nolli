/* =========================================================================
   ADMIN.JS — Consola de Administración Avanzada y Blindada para Nolli
   Arquitectura Serverless Supabase + Frontend Vanilla Moderno
   ========================================================================= */

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { 
  fetchCurrentUser, 
  fetchUserRole, 
  fetchPendingBuildings, 
  fetchAllBuildingsForAdmin, 
  fetchBuildingReports, 
  updateBuildingReport, 
  deleteBuildingReport,
  fetchUserDirectory, 
  reviewBuilding, 
  deleteBuilding, 
  updateBuilding,
  updateUserPresence,
  updateUserRole,
  getBuildingsCatalog,
  invalidateCatalogCache
} from './api.js';
import { 
  escapeHtml, 
  normalizarCategoria, 
  formatCategoria, 
  separarArquitectos, 
  limpiarNombreArquitecto,
  extraerIntervenciones,
  formatearImportancia 
} from './state.js';
import { 
  STUDIO_RELATIONSHIPS as SEED_RELATIONSHIPS, 
  normalizeArchitectKey 
} from './architectRelationships.js';

const SESSION_KEY = 'nolli_admin_session_token';
const LOCAL_RELATIONSHIPS_KEY = 'nolli_admin_custom_relationships_v1';

let visibleAdminConsoleArqsCount = 60;

function cleanDiacritics(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Estado local unificado de la consola de administración
const adminConsoleState = {
  token: null,
  user: null,
  role: null,
  activeTab: 'dashboard', // 'dashboard' | 'pending' | 'relationships' | 'architects' | 'normalizer' | 'reports' | 'users' | 'system'
  pendingWorks: [],
  allWorks: [],
  reports: [],
  users: [],
  relationships: [],
  selectedWorkIds: new Set(),
  editingWorkId: null,
  editingRelationshipId: null,
  expandedArchitects: new Set(),
};

let presenceTimer = null;

// =========================================================================
// 1. INICIALIZACIÓN Y SEGURIDAD (GUARDIA DE ACCESO)
// =========================================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    await checkAccessAndInit();
  });
} else {
  initTheme();
  checkAccessAndInit();
}

function initTheme() {
  const saved = localStorage.getItem('nolli_theme');
  if (saved === 'dark') {
    document.documentElement.classList.add('dark-mode');
    document.body?.classList.add('dark-mode');
  }
  const btnTheme = document.getElementById('btn-theme-toggle');
  if (btnTheme) {
    btnTheme.addEventListener('click', () => {
      const isDark = document.body.classList.toggle('dark-mode');
      document.documentElement.classList.toggle('dark-mode', isDark);
      try {
        localStorage.setItem('nolli_theme', isDark ? 'dark' : 'light');
      } catch {}
      if (window.lucide) window.lucide.createIcons();
    });
  }
}

async function checkAccessAndInit() {
  const lockScreen = document.getElementById('admin-lock-screen');
  const mainApp = document.getElementById('admin-main-app');
  const loadingIndicator = document.getElementById('admin-loading');

  if (loadingIndicator) loadingIndicator.classList.remove('hidden');

  try {
    const rawSession = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!rawSession) {
      showLockScreen('AUTENTICACIÓN REQUERIDA', 'Debes iniciar sesión con una cuenta autorizada de administrador para acceder a esta consola.');
      return;
    }

    let parsed = JSON.parse(rawSession);
    const token = parsed.access_token || parsed;
    if (!token) {
      showLockScreen('SESIÓN INVÁLIDA', 'No se encontró un token de autenticación válido.');
      return;
    }

    adminConsoleState.token = token;

    // Verificar identidad de usuario
    const user = await fetchCurrentUser(token);
    adminConsoleState.user = user;

    // Verificar rol estricto
    const role = await fetchUserRole(token);
    adminConsoleState.role = role;

    const userEmail = String(user.email || '').toLowerCase().trim();
    const isMasterFounder = userEmail === 'studio.signes@gmail.com';
    const isAuthorized = role === 'admin' || role === 'superadmin' || isMasterFounder;

    if (!isAuthorized) {
      showLockScreen('PRIVILEGIOS INSUFICIENTES', `Tu cuenta (${userEmail}) no tiene los permisos necesarios (Rol actual: ${role.toUpperCase()}).`);
      return;
    }

    // ACCESO CONCEDIDO
    if (lockScreen) lockScreen.classList.add('hidden');
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
    if (mainApp) mainApp.classList.remove('hidden');

    if (role === 'editor') {
      const tabUsers = document.querySelector('[data-tab-target="users"]');
      if (tabUsers) tabUsers.style.display = 'none';
      const viewUsers = document.getElementById('view-users');
      if (viewUsers) viewUsers.remove();
    }

    renderAdminIdentity(user, isMasterFounder ? 'superadmin' : role);
    iniciarPresencia();
    setupTabNavigation();
    setupSearchAndFilters();
    setupModalEvents();

    // Cargar datos iniciales
    await loadDashboardData();

  } catch (error) {
    showLockScreen('ERROR DE AUTENTICACIÓN', error.message || 'La sesión ha caducado o es inválida.');
  } finally {
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
  }
}

function showLockScreen(title, message) {
  const lockScreen = document.getElementById('admin-lock-screen');
  const mainApp = document.getElementById('admin-main-app');
  const loadingIndicator = document.getElementById('admin-loading');
  const titleEl = document.getElementById('lock-screen-title');
  const descEl = document.getElementById('lock-screen-desc');

  if (loadingIndicator) loadingIndicator.classList.add('hidden');
  if (mainApp) mainApp.classList.add('hidden');
  if (lockScreen) lockScreen.classList.remove('hidden');

  if (titleEl) titleEl.textContent = `403 // ${title}`;
  if (descEl) descEl.textContent = message;

  const btnLogin = document.getElementById('btn-lock-login');
  if (btnLogin) {
    btnLogin.addEventListener('click', () => {
      window.location.href = './index.html#admin';
    });
  }
}

function renderAdminIdentity(user, role) {
  const emailEl = document.getElementById('admin-user-email');
  const roleEl = document.getElementById('admin-user-role');
  if (emailEl) emailEl.textContent = user.email || 'Admin';
  if (roleEl) roleEl.textContent = `${role.toUpperCase()}`;
}

let adminInteractedSinceLastPresence = true;
if (typeof window !== 'undefined') {
  const markAdminActive = () => { adminInteractedSinceLastPresence = true; };
  window.addEventListener('pointerdown', markAdminActive, { passive: true });
  window.addEventListener('keydown', markAdminActive, { passive: true });
}

function iniciarPresencia() {
  if (presenceTimer) clearInterval(presenceTimer);
  if (adminConsoleState.token) {
    updateUserPresence(adminConsoleState.token, adminConsoleState.user?.id);
    adminInteractedSinceLastPresence = false;
    presenceTimer = setInterval(() => {
      if (!adminConsoleState.token) {
        clearInterval(presenceTimer);
        return;
      }
      if (document.hidden || !adminInteractedSinceLastPresence) return; // Ahorro de egress: no emitir si oculta o inactiva
      adminInteractedSinceLastPresence = false;
      updateUserPresence(adminConsoleState.token, adminConsoleState.user?.id);
    }, 25 * 60 * 1000);
  }
}

// =========================================================================
// 2. NAVEGACIÓN POR PESTAÑAS
// =========================================================================
function setupTabNavigation() {
  const tabs = document.querySelectorAll('[data-tab-target]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      const target = tab.dataset.tabTarget;
      if (target === 'users' && adminConsoleState.role === 'editor') return;
      adminConsoleState.activeTab = target;

      document.querySelectorAll('.admin-tab-view').forEach((view) => view.classList.add('hidden'));
      const activeView = document.getElementById(`view-${target}`);
      if (activeView) activeView.classList.remove('hidden');

      if (target === 'dashboard') renderDashboardKPIs();
      else if (target === 'pending') renderModulePending();
      else if (target === 'relationships') renderRelationshipsTable();
      else if (target === 'architects') renderModuleArchitects();
      else if (target === 'normalizer') {
        renderNormalizerAudit();
        renderIntegrityAudit();
      }
      else if (target === 'reports') renderModuleReports();
      else if (target === 'users') renderModuleUsers();

      if (window.lucide) window.lucide.createIcons();
    });
  });
}

// =========================================================================
// 3. CARGA GLOBAL DE DATOS
// =========================================================================
async function loadDashboardData() {
  loadRelationships();
  await Promise.all([
    loadWorksData(),
    loadReportsData(),
    loadUsersData(),
  ]);
  updateBadges();
  renderDashboardKPIs();
  renderRelationshipsTable();
  initSimulator();
  renderNormalizerAudit();
  renderIntegrityAudit();
}

async function loadWorksData() {
  try {
    const [catalogoRaw, adminObras] = await Promise.all([
      getBuildingsCatalog().catch(() => []),
      fetchAllBuildingsForAdmin(adminConsoleState.token).catch(() => []),
    ]);

    const mapa = new Map();
    if (Array.isArray(catalogoRaw)) {
      catalogoRaw.forEach((obra) => mapa.set(String(obra.id), obra));
    }
    if (Array.isArray(adminObras)) {
      adminObras.forEach((obra) => {
        const prev = mapa.get(String(obra.id)) || {};
        mapa.set(String(obra.id), { ...prev, ...obra });
      });
    }
    const all = Array.from(mapa.values());
    adminConsoleState.allWorks = all;
    adminConsoleState.pendingWorks = all.filter((w) => w.estado_revision === 'pendiente');
  } catch (error) {
    console.error('Error al cargar obras:', error);
  }
}

async function loadReportsData() {
  try {
    const reports = await fetchBuildingReports(adminConsoleState.token);
    adminConsoleState.reports = reports || [];
  } catch (error) {
    console.error('Error al cargar reportes:', error);
  }
}

async function loadUsersData() {
  if (adminConsoleState.role === 'editor') {
    adminConsoleState.users = [];
    return;
  }
  try {
    const users = await fetchUserDirectory(adminConsoleState.token);
    adminConsoleState.users = users || [];
    adminConsoleState.usersError = null;
  } catch (error) {
    adminConsoleState.usersError = error.message;
    console.error('Error al cargar usuarios:', error);
  }
}

function updateBadges() {
  const badgePending = document.getElementById('badge-count-pending');
  const badgeRelationships = document.getElementById('badge-count-relationships');
  const badgeArchitects = document.getElementById('badge-count-architects');
  const badgeReports = document.getElementById('badge-count-reports');
  const badgeUsers = document.getElementById('badge-count-users');

  if (badgePending) badgePending.textContent = adminConsoleState.pendingWorks.length;
  if (badgeRelationships) badgeRelationships.textContent = adminConsoleState.relationships.length;

  const architectsSet = new Set();
  (adminConsoleState.allWorks || []).forEach((w) => {
    separarArquitectos(w.arquitecto).forEach((a) => architectsSet.add(a));
  });
  if (badgeArchitects) badgeArchitects.textContent = architectsSet.size;

  const pendingReportsTotal = adminConsoleState.reports.filter((r) => (r.estado || r.status || 'pendiente') === 'pendiente').length;
  if (badgeReports) badgeReports.textContent = pendingReportsTotal;

  const onlineCount = adminConsoleState.users.filter((u) => {
    if (!u.last_seen_at) return false;
    return (Date.now() - new Date(u.last_seen_at).getTime()) < 30 * 60 * 1000;
  }).length;

  if (badgeUsers) badgeUsers.textContent = `${onlineCount} on / ${adminConsoleState.users.length}`;
}

// =========================================================================
// 4. MÓDULO 01: OBRAS PENDIENTES & CATÁLOGO
// =========================================================================
function renderModulePending() {
  const container = document.getElementById('pending-works-list');
  if (!container) return;

  const searchVal = (document.getElementById('search-pending')?.value || '').trim().toLowerCase();
  const filterState = document.getElementById('filter-pending-state')?.value || 'pendiente';
  const filterSort = document.getElementById('filter-pending-sort')?.value || 'recent';

  let works = adminConsoleState.allWorks;
  if (filterState !== 'todos') {
    works = works.filter((w) => (w.estado_revision || 'publicada') === filterState);
  }

  if (searchVal) {
    works = works.filter((w) => `${w.nombre_obra || ''} ${w.arquitecto || ''} ${w.place || ''}`.toLowerCase().includes(searchVal));
  }

  // Ordenación por fecha de creación o alfabética
  works = [...works].sort((a, b) => {
    // Si se están viendo todas, las pendientes siempre van primero
    if (a.estado_revision === 'pendiente' && b.estado_revision !== 'pendiente') return -1;
    if (b.estado_revision === 'pendiente' && a.estado_revision !== 'pendiente') return 1;

    if (filterSort === 'alpha') {
      return (a.nombre_obra || '').localeCompare(b.nombre_obra || '', 'es', { sensitivity: 'base' });
    }
    const timeA = a.created_at ? new Date(a.created_at).getTime() : (a.updated_at ? new Date(a.updated_at).getTime() : 0);
    const timeB = b.created_at ? new Date(b.created_at).getTime() : (b.updated_at ? new Date(b.updated_at).getTime() : 0);
    if (filterSort === 'oldest') {
      return timeA - timeB;
    }
    // Por defecto: 'recent' (más recientes primero)
    return timeB - timeA;
  });

  if (!works.length) {
    container.innerHTML = `
      <div style="border:2px dashed var(--admin-border-light); padding:40px; text-align:center; font-family: 'Inter', sans-serif; font-size:12px; color:var(--admin-fg-dim);">NO SE ENCONTRARON OBRAS BAJO ESTE CRITERIO // BANDEJA LIMPIA</div>
    `;
    return;
  }

  container.innerHTML = works.map((obra) => {
    const safeId = escapeHtml(obra.id);
    const title = escapeHtml(obra.nombre_obra || 'Sin título');
    const architect = escapeHtml(obra.arquitecto || 'Arquitecto no especificado');
    const year = obra.año_construccion ? ` · ${escapeHtml(obra.año_construccion)}` : '';
    const category = formatCategoria(obra.categoria);
    const place = obra.place ? escapeHtml(obra.place) : 'Ubicación registrada';
    const isPending = obra.estado_revision === 'pendiente';
    const photo = obra.foto_url || obra.foto_miniatura || '';
    const rawDate = obra.created_at || obra.updated_at;
    const createdDateStr = rawDate ? new Date(rawDate).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
    const lat = obra.latitud ?? (Array.isArray(obra.coordenadas) ? obra.coordenadas[1] : '');
    const lng = obra.longitud ?? (Array.isArray(obra.coordenadas) ? obra.coordenadas[0] : '');
    const mapUrl = `./?obra=${safeId}${lat && lng ? `&lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&zoom=17` : ''}`;
    const impInfo = formatearImportancia(obra.importancia);

    return `
      <article class="admin-work-card ${isPending ? 'pending-border' : ''}" data-work-id="${safeId}">
        ${photo ? `
          <img src="${escapeHtml(photo)}" alt="${title}" class="admin-work-thumb" loading="lazy" onerror="this.outerHTML='<div class=\\'admin-work-thumb-fallback\\'></div>'">
        ` : `
          <div class="admin-work-thumb-fallback"></div>
        `}
        
        <div class="admin-work-info">
          <div class="admin-work-title-row" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <h3 class="admin-work-title">${title}</h3>
            <span class="admin-importance-tag imp-${impInfo.level}" title="${escapeHtml(impInfo.title)}">${escapeHtml(impInfo.label)}</span>
            ${isPending ? `<span class="admin-badge-pending">PENDIENTE DE REVISIÓN</span>` : ''}
            <span class="admin-work-tag" style="background:var(--admin-bg-raised);">${escapeHtml(obra.estado_revision || 'publicada').toUpperCase()}</span>
          </div>

          <div class="admin-work-meta">
            <span><strong>${architect}</strong>${year}</span>
            <span>${place}</span>
          </div>

          <div class="admin-work-tags">
            <span class="admin-work-tag">${escapeHtml(category)}</span>
            ${obra.estado_acceso ? `<span class="admin-work-tag">${escapeHtml(obra.estado_acceso)}</span>` : ''}
            ${obra.añadido_por ? `<span class="admin-work-tag">Por: ${escapeHtml(obra.añadido_por)}</span>` : ''}
            ${createdDateStr ? `<span class="admin-work-tag" style="background:var(--admin-bg-raised); font-family:'Inter',sans-serif;">Alta: ${escapeHtml(createdDateStr)}</span>` : ''}
          </div>
        </div>

        <div class="admin-work-actions">
          ${isPending ? `
            <button type="button" class="admin-btn admin-btn-approve" data-action="approve" data-id="${safeId}">
              <i data-lucide="check" width="14" height="14"></i>
              <span>APROBAR</span>
            </button>
            <button type="button" class="admin-btn admin-btn-reject" data-action="reject" data-id="${safeId}">
              <i data-lucide="x" width="14" height="14"></i>
              <span>RECHAZAR</span>
            </button>
          ` : ''}
          <button type="button" class="admin-btn" data-action="edit" data-id="${safeId}">
            <i data-lucide="edit-3" width="14" height="14"></i>
            <span>EDITAR</span>
          </button>
          <a href="${mapUrl}" target="_blank" rel="noopener noreferrer" class="admin-btn" style="text-decoration:none;" title="Ver y centrar en el mapa interactivo">
            <i data-lucide="map-pin" width="14" height="14"></i>
            <span>IR AL MAPA</span>
          </a>
          ${adminConsoleState.role !== 'editor' ? `
          <button type="button" class="admin-btn admin-btn-reject" data-action="delete" data-id="${safeId}">
            <i data-lucide="trash-2" width="14" height="14"></i>
            <span>BORRAR</span>
          </button>
          ` : ''}
        </div>
      </article>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

// =========================================================================
// 5. MÓDULO 02: DIRECTORIO DE ARQUITECTOS & DESGLOSE DE OBRAS
// =========================================================================
function renderModuleArchitects() {
  const container = document.getElementById('architects-list');
  const summaryEl = document.getElementById('architects-summary-bar');
  if (!container) return;

  const searchVal = (document.getElementById('search-architects')?.value || '').trim();
  const searchClean = cleanDiacritics(searchVal);
  const filterSort = document.getElementById('filter-architects-sort')?.value || 'count-desc';

  // 1. Agrupación de obras por arquitecto
  const architectMap = new Map();

  for (const obra of adminConsoleState.allWorks) {
    const rawNames = separarArquitectos(obra.arquitecto);
    const names = rawNames.length > 0 ? rawNames : ['Sin arquitecto asignado'];

    for (const name of names) {
      const trimmedName = name.replace(/\s+/g, ' ').trim();
      const normKey = cleanDiacritics(trimmedName);

      if (!architectMap.has(normKey)) {
        architectMap.set(normKey, {
          key: normKey,
          name: trimmedName,
          cleanName: normKey,
          works: [],
          cities: new Set(),
          years: [],
          pendingCount: 0,
          publishedCount: 0,
          rejectedCount: 0,
        });
      } else {
        const existing = architectMap.get(normKey);
        if (trimmedName.length >= existing.name.length && /[áéíóúüñÁÉÍÓÚÜÑ]/.test(trimmedName)) {
          existing.name = trimmedName;
        }
      }

      const item = architectMap.get(normKey);
      if (!item.works.some((w) => String(w.id) === String(obra.id))) {
        item.works.push(obra);
        if (obra.place) item.cities.add(obra.place);
        if (obra.año_construccion) {
          const y = parseInt(obra.año_construccion, 10);
          if (!isNaN(y)) item.years.push(y);
        }
        if (obra.estado_revision === 'pendiente') item.pendingCount++;
        else if (obra.estado_revision === 'rechazada') item.rejectedCount++;
        else item.publishedCount++;
      }
    }
  }

  let list = Array.from(architectMap.values());

  // 2. Filtrado por búsqueda insensible a diacríticos y tildes
  if (searchClean) {
    list = list.filter((item) => {
      const nameMatch = item.cleanName.includes(searchClean);
      const cityMatch = Array.from(item.cities).some((c) => cleanDiacritics(c).includes(searchClean));
      const workMatch = item.works.some((w) => cleanDiacritics(w.nombre_obra).includes(searchClean));
      return nameMatch || cityMatch || workMatch;
    });
  }

  // 3. Ordenación
  list.sort((a, b) => {
    if (filterSort === 'count-desc') {
      const diff = b.works.length - a.works.length;
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    }
    if (filterSort === 'count-asc') {
      const diff = a.works.length - b.works.length;
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    }
    if (filterSort === 'alpha-desc') {
      return b.name.localeCompare(a.name, 'es', { sensitivity: 'base' });
    }
    // 'alpha-asc' por defecto
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });

  // 4. Actualizar barra de resumen
  const totalMatches = list.length;
  const totalWorksListed = list.reduce((acc, curr) => acc + curr.works.length, 0);

  if (!totalMatches) {
    if (summaryEl) summaryEl.textContent = 'MOSTRANDO 0 ARQUITECTOS // 0 REFERENCIAS';
    container.innerHTML = `
      <div style="border:2px dashed var(--admin-border-light); padding:40px; text-align:center; font-family: 'Inter', sans-serif; font-size:12px; color:var(--admin-fg-dim);">
        NO SE ENCONTRARON ARQUITECTOS BAJO ESTE CRITERIO // CATÁLOGO FILTRADO
      </div>
    `;
    return;
  }

  // 5. Renderizado progresivo para evitar congelamiento
  const visibleList = list.slice(0, visibleAdminConsoleArqsCount);

  if (summaryEl) {
    if (visibleList.length < totalMatches) {
      summaryEl.textContent = `MOSTRANDO ${visibleList.length} DE ${totalMatches} ARQUITECTOS // ${totalWorksListed} REFERENCIAS DE OBRAS REGISTRADAS`;
    } else {
      summaryEl.textContent = `MOSTRANDO ${totalMatches} ARQUITECTOS // ${totalWorksListed} REFERENCIAS DE OBRAS REGISTRADAS`;
    }
  }

  const autoExpand = Boolean(searchClean);

  const cardsHtml = visibleList.map((item) => {
    const isExpanded = autoExpand || adminConsoleState.expandedArchitects.has(item.key);
    const minYear = item.years.length ? Math.min(...item.years) : null;
    const maxYear = item.years.length ? Math.max(...item.years) : null;
    const period = minYear ? (minYear === maxYear ? `${minYear}` : `${minYear} — ${maxYear}`) : '';
    const citiesArray = Array.from(item.cities);
    const citiesStr = citiesArray.slice(0, 3).join(', ');
    const moreCities = citiesArray.length > 3 ? ` +${citiesArray.length - 3}` : '';
    const safeKey = escapeHtml(item.key);
    const safeName = escapeHtml(item.name);

    return `
      <article class="admin-architect-card ${isExpanded ? 'open' : ''} ${item.pendingCount > 0 ? 'has-pending' : ''}" data-architect-key="${safeKey}">
        <header class="admin-architect-header" title="Pulsar para desplegar obras de ${safeName}">
          <div class="admin-architect-info">
            <div class="admin-architect-name-row">
              <h3 class="admin-architect-name">${safeName}</h3>
              <span class="admin-work-tag" style="background:var(--admin-accent); color:#FFFFFF; font-weight:800; border-color:var(--admin-accent);">
                ${item.works.length} ${item.works.length === 1 ? 'OBRA' : 'OBRAS'}
              </span>
              ${item.pendingCount > 0 ? `
                <span class="admin-badge-pending">${item.pendingCount} PENDIENTE${item.pendingCount > 1 ? 'S' : ''}</span>
              ` : ''}
              ${item.publishedCount > 0 ? `
                <span class="admin-work-tag" style="background:var(--admin-bg-raised);">${item.publishedCount} PUBLICADA${item.publishedCount > 1 ? 'S' : ''}</span>
              ` : ''}
            </div>

            <div class="admin-architect-meta">
              ${period ? `<span><i data-lucide="calendar" width="12" height="12"></i> ${period}</span>` : ''}
              ${citiesStr ? `<span><i data-lucide="map-pin" width="12" height="12"></i> ${escapeHtml(citiesStr)}${moreCities}</span>` : ''}
            </div>
          </div>

          <div class="admin-architect-header-actions">
            <a href="./?q=${encodeURIComponent(item.name)}" target="_blank" rel="noopener noreferrer" class="admin-btn" title="Ver obras en el mapa interactivo" style="text-decoration:none;">
              <i data-lucide="compass" width="13" height="13"></i>
              <span class="admin-header-btn-text">VER EN WEB</span>
            </a>
            <button type="button" class="admin-architect-chevron" aria-label="Desplegar u ocultar obras">
              <i data-lucide="chevron-down" width="16" height="16"></i>
            </button>
          </div>
        </header>

        <div class="admin-architect-body">
          <div class="admin-architect-works-grid">
            ${item.works.map((obra) => {
              const safeId = escapeHtml(obra.id);
              const title = escapeHtml(obra.nombre_obra || 'Sin título');
              const year = obra.año_construccion ? escapeHtml(obra.año_construccion) : null;
              const category = formatCategoria(obra.categoria);
              const place = obra.place ? escapeHtml(obra.place) : 'Ubicación registrada';
              const photo = obra.foto_url || obra.foto_miniatura || '';
              const isPending = obra.estado_revision === 'pendiente';
              const lat = obra.latitud ?? (Array.isArray(obra.coordenadas) ? obra.coordenadas[1] : '');
              const lng = obra.longitud ?? (Array.isArray(obra.coordenadas) ? obra.coordenadas[0] : '');
              const mapUrl = `./?obra=${safeId}${lat && lng ? `&lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&zoom=17` : ''}`;
              const impInfo = formatearImportancia(obra.importancia);

              return `
                <div class="admin-architect-work-item ${isPending ? 'pending-border' : ''}">
                  ${photo ? `
                    <img src="${escapeHtml(photo)}" alt="${title}" class="admin-architect-work-thumb" loading="lazy" onerror="this.outerHTML='<div class=\\'admin-architect-work-thumb-fallback\\'><svg width=\\'20\\' height=\\'20\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\' stroke-linecap=\\'square\\' stroke-linejoin=\\'miter\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\'></rect><line x1=\\'3\\' y1=\\'9\\' x2=\\'21\\' y2=\\'9\\'></line><line x1=\\'9\\' y1=\\'21\\' x2=\\'9\\' y2=\\'9\\'></line></svg></div>'">
                  ` : `
                    <div class="admin-architect-work-thumb-fallback"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><rect x="3" y="3" width="18" height="18"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg></div>
                  `}

                  <div class="admin-architect-work-details">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap;">
                      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <h4 class="admin-architect-work-title" title="${title}">${title}</h4>
                        <span class="admin-importance-tag imp-${impInfo.level}" title="${escapeHtml(impInfo.title)}">${escapeHtml(impInfo.label)}</span>
                      </div>
                      <span class="admin-work-tag" style="font-size:8.5px; ${isPending ? 'background:var(--admin-accent-2); color:#111111; font-weight:800;' : ''}">
                        ${escapeHtml((obra.estado_revision || 'publicada').toUpperCase())}
                      </span>
                    </div>

                    <div class="admin-architect-work-sub">
                      ${year ? `<strong>${year}</strong> · ` : ''}
                      <span>${place}</span> · 
                      <span>${escapeHtml(category)}</span>
                    </div>

                    <div class="admin-architect-work-actions">
                      <a href="${mapUrl}" target="_blank" rel="noopener noreferrer" class="admin-btn admin-btn-sm" style="text-decoration:none;" title="Ver y centrar en el mapa">
                        <i data-lucide="map-pin" width="12" height="12"></i>
                        <span>IR AL MAPA</span>
                      </a>
                      <button type="button" class="admin-btn admin-btn-sm" data-action="edit" data-id="${safeId}">
                        <i data-lucide="edit-3" width="12" height="12"></i>
                        <span>EDITAR</span>
                      </button>
                      ${isPending ? `
                        <button type="button" class="admin-btn admin-btn-sm admin-btn-approve" data-action="approve" data-id="${safeId}">
                          <i data-lucide="check" width="12" height="12"></i>
                          <span>APROBAR</span>
                        </button>
                        <button type="button" class="admin-btn admin-btn-sm admin-btn-reject" data-action="reject" data-id="${safeId}">
                          <i data-lucide="x" width="12" height="12"></i>
                          <span>RECHAZAR</span>
                        </button>
                      ` : ''}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </article>
    `;
  }).join('');

  const remaining = totalMatches - visibleList.length;
  const loadMoreBtnHtml = remaining > 0 ? `
    <div style="padding: 16px; text-align: center;">
      <button type="button" id="btn-load-more-architects-console" class="admin-btn" style="width: 100%; max-width: 320px; padding: 10px 16px; font-weight: 800; font-family: 'Inter', sans-serif;">
        MOSTRAR MÁS ARQUITECTOS (+${Math.min(60, remaining)}) · ${remaining} RESTANTES
      </button>
    </div>
  ` : '';

  container.innerHTML = cardsHtml + loadMoreBtnHtml;

  if (window.lucide) window.lucide.createIcons({ context: container });
}

// =========================================================================
// 6. MÓDULO 03: REPORTES DE ERROR
// =========================================================================
function renderModuleReports() {
  const container = document.getElementById('reports-list');
  if (!container) return;

  const searchVal = (document.getElementById('search-reports')?.value || '').trim().toLowerCase();
  const filterReportState = document.getElementById('filter-reports-state')?.value || 'pendiente';

  let reports = adminConsoleState.reports;
  if (filterReportState !== 'todos') {
    reports = reports.filter((r) => (r.estado || r.status || 'pendiente') === filterReportState);
  }

  if (searchVal) {
    reports = reports.filter((r) => {
      const desc = (r.descripcion || r.description || '').toLowerCase();
      const bTitle = (r.Buildings?.nombre_obra || '').toLowerCase();
      return desc.includes(searchVal) || bTitle.includes(searchVal);
    });
  }

  if (!reports.length) {
    container.innerHTML = `
      <div style="border:2px dashed var(--admin-border-light); padding:40px; text-align:center; font-family: 'Inter', sans-serif; font-size:12px; color:var(--admin-fg-dim);">NO HAY INCIDENCIAS CON ESTADO "${escapeHtml(filterReportState.toUpperCase())}" // BANDEJA LIMPIA</div>
    `;
    return;
  }

  container.innerHTML = reports.map((report) => {
    const safeId = escapeHtml(report.id);
    const buildingId = escapeHtml(report.building_id);
    const buildingTitle = escapeHtml(report.Buildings?.nombre_obra || `Obra #${buildingId}`);
    const architect = escapeHtml(report.Buildings?.arquitecto || '');
    const desc = escapeHtml(report.descripcion || report.description || 'Sin descripción detallada.');
    const date = new Date(report.created_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
    const user = escapeHtml(report.user_email || (report.user_id ? `Usuario ID: ${report.user_id.slice(0, 8)}...` : 'Usuario anónimo'));
    const status = report.estado || report.status || 'pendiente';
    const isPending = status === 'pendiente';
    const statusColor = status === 'revisado' ? 'var(--admin-green)' : status === 'descartado' ? 'var(--admin-fg-dim)' : 'var(--admin-accent)';

    return `
      <article class="admin-report-card" data-report-id="${safeId}">
        <div class="admin-report-head">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <h3 class="admin-report-building">${buildingTitle}</h3>
              <span class="admin-work-tag" style="border:1px solid ${statusColor}; color:${statusColor}; font-weight:800; font-family:'Inter',sans-serif;">${escapeHtml(status.toUpperCase())}</span>
            </div>
            ${architect ? `<div style="font-size:11px; color:var(--admin-fg-dim); font-family: 'Inter', sans-serif;">${architect}</div>` : ''}
          </div>
          <span class="admin-report-date">${date}</span>
        </div>

        <div class="admin-report-body">
          <strong style="display:block; font-family: 'Inter', sans-serif; font-size:10px; margin-bottom:4px; color:var(--admin-accent);">MOTIVO / DETALLE REPORTADO:</strong>
          ${desc}
        </div>

        <div class="admin-report-footer">
          <span class="admin-report-sender">Remitente: <strong>${user}</strong></span>
          <div class="admin-report-actions-row">
            <a href="./?obra=${buildingId}" target="_blank" rel="noopener noreferrer" class="admin-btn">
              <i data-lucide="compass" width="13" height="13"></i>
              <span>VER EN EL MAPA</span>
            </a>
            ${isPending ? `
              <button type="button" class="admin-btn admin-btn-approve" data-report-action="resolve" data-id="${safeId}">
                <i data-lucide="check-check" width="13" height="13"></i>
                <span>RESOLVER / ARCHIVAR</span>
              </button>
              <button type="button" class="admin-btn admin-btn-reject" data-report-action="dismiss" data-id="${safeId}">
                <i data-lucide="x" width="13" height="13"></i>
                <span>DESCARTAR</span>
              </button>
            ` : ''}
            ${adminConsoleState.role !== 'editor' ? `
              <button type="button" class="admin-btn admin-btn-reject" data-report-action="delete" data-id="${safeId}" title="Eliminar reporte definitivamente">
                <i data-lucide="trash-2" width="13" height="13"></i>
                <span>BORRAR</span>
              </button>
            ` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

// =========================================================================
// 6. MÓDULO 03: DIRECTORIO DE USUARIOS & CONECTIVIDAD
// =========================================================================
function renderModuleUsers() {
  const container = document.getElementById('users-table-body');
  if (!container) return;

  if (adminConsoleState.usersError) {
    container.innerHTML = `
      <tr>
        <td colspan="5" style="padding: 24px;">
          <div style="border: 1.5px solid var(--admin-red); background: var(--admin-red-bg); padding: 18px; color: var(--admin-fg);">
            <strong style="color: var(--admin-red); display: block; font-size: 12px; margin-bottom: 6px; font-family: 'Inter', sans-serif;">
              CONFLICTO DE POLÍTICAS RLS EN SUPABASE (RECURSIÓN INFINITA EN "PROFILES")
            </strong>
            <p style="font-size: 11px; margin: 0 0 10px; line-height: 1.5;">
              La política de seguridad de la tabla <code>profiles</code> en Supabase contiene una subconsulta que se evalúa a sí misma recursivamente.
            </p>
            <p style="font-size: 11px; margin: 0; line-height: 1.5; color: var(--admin-fg-dim);">
              <strong>Solución:</strong> Ejecuta el bloque SQL anti-recursión en el <em>SQL Editor</em> del dashboard de Supabase para limpiar las políticas recursivas de <code>public.profiles</code>.
            </p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const searchVal = (document.getElementById('search-users')?.value || '').trim().toLowerCase();
  const roleFilter = document.getElementById('filter-users-role')?.value || 'all';

  let users = adminConsoleState.users;

  if (roleFilter !== 'all') {
    users = users.filter((u) => (u.role || 'user').toLowerCase() === roleFilter.toLowerCase());
  }

  if (searchVal) {
    users = users.filter((u) => {
      const full = `${u.first_name || ''} ${u.last_name || ''} ${u.email || ''} ${u.city || ''} ${u.country || ''}`.toLowerCase();
      return full.includes(searchVal);
    });
  }

  if (!users.length) {
    container.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:30px; color:var(--admin-fg-dim);">NO SE ENCONTRARON USUARIOS CON ESTE FILTRO</td>
      </tr>
    `;
    return;
  }

  const canEditRole = adminConsoleState.role === 'admin' || adminConsoleState.role === 'superadmin' || String(adminConsoleState.user?.email).toLowerCase().trim() === 'studio.signes@gmail.com';

  container.innerHTML = users.map((user) => {
    const firstName = escapeHtml(user.first_name || '');
    const lastName = escapeHtml(user.last_name || '');
    const fullName = `${firstName} ${lastName}`.trim() || 'Usuario Registrado';
    const email = escapeHtml(user.email || 'Email no disponible');
    const location = [escapeHtml(user.city || ''), escapeHtml(user.country || '')].filter(Boolean).join(', ') || 'No indicada';
    const role = String(user.role || 'user').toLowerCase();
    
    // Cálculo de conectividad en tiempo real
    const presence = calculateUserPresence(user.last_seen_at);

    return `
      <tr>
        <td>
          <div class="admin-user-cell">
            <span class="admin-presence-dot ${presence.isOnline ? 'online' : ''}" title="${presence.title}"></span>
            <div>
              <div class="admin-user-name">${fullName} ${presence.isOnline ? `<span class="admin-online-badge">ONLINE</span>` : ''}</div>
              <div class="admin-user-email">${email}</div>
            </div>
          </div>
        </td>
        <td>
          ${canEditRole ? `
            <select class="admin-user-role-select" data-user-id="${escapeHtml(user.id)}" style="background:var(--admin-bg-raised); color:var(--admin-fg); border:1px solid var(--admin-border-light); font-size:10px; font-weight:700; padding:2px 6px; font-family:'Inter', sans-serif; cursor:pointer;">
              <option value="user" ${role === 'user' ? 'selected' : ''}>USER</option>
              <option value="editor" ${role === 'editor' ? 'selected' : ''}>EDITOR</option>
              <option value="admin" ${role === 'admin' ? 'selected' : ''}>ADMIN</option>
              <option value="superadmin" ${role === 'superadmin' ? 'selected' : ''}>SUPERADMIN</option>
            </select>
          ` : `
            <span class="admin-role-tag ${role}">${role.toUpperCase()}</span>
          `}
        </td>
        <td>${location}</td>
        <td>
          <span style="color:${presence.isOnline ? 'var(--admin-green)' : 'var(--admin-fg-dim)'}; font-weight:${presence.isOnline ? '700' : '500'};">
            ${presence.label}
          </span>
        </td>
        <td>
          <div style="font-size:10px; color:var(--admin-fg-dim);">
            ${user.created_at ? new Date(user.created_at).toLocaleDateString('es-ES') : '—'}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (canEditRole) {
    container.querySelectorAll('.admin-user-role-select').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const targetId = sel.dataset.userId;
        const nextRole = sel.value;
        try {
          await updateUserRole(targetId, nextRole, adminConsoleState.token);
          const u = adminConsoleState.users.find((user) => String(user.id) === String(targetId));
          if (u) u.role = nextRole;
          showAdminToast(`Rol de usuario actualizado a ${nextRole.toUpperCase()}.`, 'success');
        } catch (err) {
          showAdminToast(`Error al actualizar rol: ${err.message}`, 'error');
          renderModuleUsers();
        }
      });
    });
  }
}

function calculateUserPresence(lastSeenAt) {
  if (!lastSeenAt) {
    return { isOnline: false, label: 'Sin registro', title: 'Desconectado' };
  }

  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 30) {
    return { isOnline: true, label: 'Activo ahora', title: 'En línea en este momento' };
  }
  if (diffMin < 60) {
    return { isOnline: false, label: `Hace ${diffMin} min`, title: `Última conexión: hace ${diffMin} minutos` };
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return { isOnline: false, label: `Hace ${diffHours} h`, title: `Última conexión: hace ${diffHours} horas` };
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return { isOnline: false, label: 'Ayer', title: 'Última conexión: ayer' };
  }
  if (diffDays < 7) {
    return { isOnline: false, label: `Hace ${diffDays} días`, title: `Última conexión: hace ${diffDays} días` };
  }
  const formatted = new Date(lastSeenAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return { isOnline: false, label: formatted, title: `Última conexión: ${formatted}` };
}

// =========================================================================
// 7. EVENTOS DE ACCIÓN Y MODALES
// =========================================================================
function setupSearchAndFilters() {
  document.getElementById('search-pending')?.addEventListener('input', renderModulePending);
  document.getElementById('filter-pending-state')?.addEventListener('change', renderModulePending);
  document.getElementById('filter-pending-sort')?.addEventListener('change', renderModulePending);

  // Módulo de Arquitectos
  document.getElementById('search-architects')?.addEventListener('input', () => {
    visibleAdminConsoleArqsCount = 60;
    renderModuleArchitects();
  });
  document.getElementById('filter-architects-sort')?.addEventListener('change', () => {
    visibleAdminConsoleArqsCount = 60;
    renderModuleArchitects();
  });

  document.getElementById('btn-expand-all-architects')?.addEventListener('click', () => {
    document.querySelectorAll('.admin-architect-card').forEach((card) => {
      card.classList.add('open');
      if (card.dataset.architectKey) {
        adminConsoleState.expandedArchitects.add(card.dataset.architectKey);
      }
    });
  });

  document.getElementById('btn-collapse-all-architects')?.addEventListener('click', () => {
    document.querySelectorAll('.admin-architect-card').forEach((card) => {
      card.classList.remove('open');
    });
    adminConsoleState.expandedArchitects.clear();
  });

  // Delegación de eventos en el listado de arquitectos
  document.getElementById('architects-list')?.addEventListener('click', async (e) => {
    const loadMoreBtn = e.target.closest('#btn-load-more-architects-console');
    if (loadMoreBtn) {
      visibleAdminConsoleArqsCount += 60;
      renderModuleArchitects();
      return;
    }

    const actionBtn = e.target.closest('button[data-action]');
    if (actionBtn) {
      const action = actionBtn.dataset.action;
      const id = actionBtn.dataset.id;
      if (action === 'approve') {
        await handleApproveWork(id);
      } else if (action === 'reject') {
        await handleRejectWork(id);
      } else if (action === 'delete') {
        await handleDeleteWork(id);
      } else if (action === 'edit') {
        openEditModal(id);
      }
      return;
    }

    const header = e.target.closest('.admin-architect-header');
    const chevron = e.target.closest('.admin-architect-chevron');
    const externalLink = e.target.closest('a');
    if ((header && !externalLink) || chevron) {
      const card = (header || chevron).closest('.admin-architect-card');
      if (card) {
        card.classList.toggle('open');
        const key = card.dataset.architectKey;
        if (card.classList.contains('open')) {
          adminConsoleState.expandedArchitects.add(key);
        } else {
          adminConsoleState.expandedArchitects.delete(key);
        }
      }
    }
  });

  document.getElementById('search-reports')?.addEventListener('input', renderModuleReports);
  document.getElementById('filter-reports-state')?.addEventListener('change', renderModuleReports);

  document.getElementById('search-users')?.addEventListener('input', renderModuleUsers);
  document.getElementById('filter-users-role')?.addEventListener('change', renderModuleUsers);

  // Delegación de eventos para Obras
  document.getElementById('pending-works-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'approve') {
      await handleApproveWork(id);
    } else if (action === 'reject') {
      await handleRejectWork(id);
    } else if (action === 'delete') {
      await handleDeleteWork(id);
    } else if (action === 'edit') {
      openEditModal(id);
    }
  });

  // Delegación de eventos para Reportes
  document.getElementById('reports-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-report-action]');
    if (!btn) return;
    const action = btn.dataset.reportAction;
    const id = btn.dataset.id;

    if (action === 'resolve') {
      await handleResolveReport(id);
    } else if (action === 'dismiss') {
      await handleDismissReport(id);
    } else if (action === 'delete') {
      await handleDeleteReport(id);
    }
  });

  setupMacroToolsEvents();
}

// =========================================================================
// FEEDBACK VISUAL INTEGRADO (TOASTS & DIÁLOGOS NEO-BAUHAUS)
// =========================================================================
function showAdminToast(message, type = 'info') {
  let toast = document.getElementById('admin-console-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'admin-console-toast';
    document.body.appendChild(toast);
  }
  toast.className = `admin-toast admin-toast-${type} show`;
  toast.innerHTML = `
    <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'alert-octagon' : 'info'}" width="16" height="16"></i>
    <span>${escapeHtml(message)}</span>
  `;
  if (window.lucide) window.lucide.createIcons({ context: toast });

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

function confirmAdminAction(title, message) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('admin-confirm-dialog');
    const titleEl = document.getElementById('admin-confirm-title');
    const msgEl = document.getElementById('admin-confirm-message');
    const btnCancel = document.getElementById('btn-admin-confirm-cancel');
    const btnOk = document.getElementById('btn-admin-confirm-ok');

    if (!dialog || !btnCancel || !btnOk) {
      resolve(confirm(`${title}\n\n${message}`));
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;

    dialog.classList.add('open');

    const cleanUp = (result) => {
      dialog.classList.remove('open');
      btnCancel.removeEventListener('click', onCancel);
      btnOk.removeEventListener('click', onOk);
      dialog.removeEventListener('click', onBackdrop);
      resolve(result);
    };

    const onCancel = () => cleanUp(false);
    const onOk = () => cleanUp(true);
    const onBackdrop = (e) => {
      if (e.target === dialog) cleanUp(false);
    };

    btnCancel.addEventListener('click', onCancel);
    btnOk.addEventListener('click', onOk);
    dialog.addEventListener('click', onBackdrop);
  });
}

// Acciones de Obras
async function handleApproveWork(id) {
  try {
    await reviewBuilding(id, 'publicada', adminConsoleState.token);
    const item = adminConsoleState.allWorks.find((w) => String(w.id) === String(id));
    if (item) item.estado_revision = 'publicada';
    adminConsoleState.pendingWorks = adminConsoleState.allWorks.filter((w) => w.estado_revision === 'pendiente');
    updateBadges();
    renderModulePending();
    renderModuleArchitects();
    showAdminToast('Obra aprobada y publicada correctamente en el catálogo.', 'success');
  } catch (err) {
    showAdminToast(`Error al aprobar obra: ${err.message}`, 'error');
  }
}

async function handleRejectWork(id) {
  const confirmed = await confirmAdminAction('RECHAZAR OBRA', '¿Marcar esta propuesta como rechazada? Dejará de ser visible en el catálogo público.');
  if (!confirmed) return;
  try {
    await reviewBuilding(id, 'rechazada', adminConsoleState.token);
    const item = adminConsoleState.allWorks.find((w) => String(w.id) === String(id));
    if (item) item.estado_revision = 'rechazada';
    adminConsoleState.pendingWorks = adminConsoleState.allWorks.filter((w) => w.estado_revision === 'pendiente');
    updateBadges();
    renderModulePending();
    renderModuleArchitects();
    showAdminToast('Propuesta marcada como rechazada.', 'info');
  } catch (err) {
    showAdminToast(`Error al rechazar obra: ${err.message}`, 'error');
  }
}

async function handleDeleteWork(id) {
  if (adminConsoleState.role === 'editor') {
    showAdminToast('Acceso denegado: El rol de editor no tiene permisos para eliminar obras.', 'error');
    return;
  }

  const item = adminConsoleState.allWorks.find((w) => String(w.id) === String(id));
  const name = item ? item.nombre_obra : `#${id}`;
  const confirmed = await confirmAdminAction('ELIMINAR DEFINITIVAMENTE', `¿Eliminar definitivamente la obra "${name}" de la base de datos? Esta acción es irreversible.`);
  if (!confirmed) return;

  try {
    await deleteBuilding(id, adminConsoleState.token);
    adminConsoleState.allWorks = adminConsoleState.allWorks.filter((w) => String(w.id) !== String(id));
    adminConsoleState.pendingWorks = adminConsoleState.allWorks.filter((w) => w.estado_revision === 'pendiente');
    updateBadges();
    renderModulePending();
    renderModuleArchitects();
    showAdminToast('Obra eliminada permanentemente de la base de datos.', 'success');
  } catch (err) {
    showAdminToast(`Error al eliminar obra: ${err.message}`, 'error');
  }
}

// Acciones de Reportes
async function handleResolveReport(id) {
  try {
    await updateBuildingReport(id, 'revisado', adminConsoleState.token);
    const item = adminConsoleState.reports.find((r) => String(r.id) === String(id));
    if (item) {
      item.estado = 'revisado';
      item.status = 'revisado';
    }
    updateBadges();
    renderModuleReports();
    showAdminToast('Incidencia marcada como resuelta.', 'success');
  } catch (err) {
    showAdminToast(`Error al resolver reporte: ${err.message}`, 'error');
  }
}

async function handleDismissReport(id) {
  try {
    await updateBuildingReport(id, 'descartado', adminConsoleState.token);
    const item = adminConsoleState.reports.find((r) => String(r.id) === String(id));
    if (item) {
      item.estado = 'descartado';
      item.status = 'descartado';
    }
    updateBadges();
    renderModuleReports();
    showAdminToast('Incidencia descartada.', 'info');
  } catch (err) {
    showAdminToast(`Error al descartar reporte: ${err.message}`, 'error');
  }
}

async function handleDeleteReport(id) {
  if (adminConsoleState.role === 'editor') {
    showAdminToast('Acceso denegado: Se requieren permisos de administrador para eliminar reportes.', 'error');
    return;
  }
  const confirmed = await confirmAdminAction('ELIMINAR REPORTE', '¿Eliminar definitivamente este reporte de la base de datos?');
  if (!confirmed) return;
  try {
    await deleteBuildingReport(id, adminConsoleState.token);
    adminConsoleState.reports = adminConsoleState.reports.filter((r) => String(r.id) !== String(id));
    updateBadges();
    renderModuleReports();
    showAdminToast('Reporte eliminado permanentemente de la base de datos.', 'success');
  } catch (err) {
    showAdminToast(`Error al eliminar reporte: ${err.message}`, 'error');
  }
}

// =========================================================================
// 8. MODAL DE EDICIÓN DE OBRAS
// =========================================================================
function setupModalEvents() {
  const modal = document.getElementById('modal-edit-work');
  const btnClose = document.getElementById('btn-modal-close');
  const form = document.getElementById('form-edit-work');

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => modal.classList.remove('open'));
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = adminConsoleState.editingWorkId;
      if (!id) return;

      const editAnoVal = document.getElementById('edit-ano').value.trim();
      const payload = {
        nombre_obra: document.getElementById('edit-nombre').value.trim(),
        arquitecto: document.getElementById('edit-arquitecto').value.trim(),
        año_construccion: editAnoVal ? editAnoVal : null,
        categoria: document.getElementById('edit-categoria').value,
        estado_acceso: document.getElementById('edit-acceso').value,
        foto_url: document.getElementById('edit-foto').value.trim() || null,
        foto_credito: document.getElementById('edit-foto-credito')?.value.trim() || null,
        enlace_url: document.getElementById('edit-enlace').value.trim() || null,
        place: document.getElementById('edit-place').value.trim() || null,
        estado_revision: document.getElementById('edit-estado-revision').value,
        importancia: Number(document.getElementById('edit-importancia')?.value ?? 1),
      };

      try {
        await updateBuilding(id, payload, adminConsoleState.token);
        const index = adminConsoleState.allWorks.findIndex((w) => String(w.id) === String(id));
        if (index !== -1) {
          adminConsoleState.allWorks[index] = { ...adminConsoleState.allWorks[index], ...payload };
          adminConsoleState.pendingWorks = adminConsoleState.allWorks.filter((w) => w.estado_revision === 'pendiente');
        }
        modal.classList.remove('open');
        updateBadges();
        renderModulePending();
        renderModuleArchitects();
        showAdminToast('Ficha de obra actualizada correctamente.', 'success');
      } catch (err) {
        showAdminToast(`Error al guardar cambios: ${err.message}`, 'error');
      }
    });
  }
}

function openEditModal(id) {
  const obra = adminConsoleState.allWorks.find((w) => String(w.id) === String(id));
  if (!obra) return;

  adminConsoleState.editingWorkId = id;
  const modal = document.getElementById('modal-edit-work');

  document.getElementById('edit-nombre').value = obra.nombre_obra || '';
  document.getElementById('edit-arquitecto').value = obra.arquitecto || '';
  document.getElementById('edit-ano').value = obra.año_construccion || '';
  document.getElementById('edit-categoria').value = normalizarCategoria(obra.categoria);
  document.getElementById('edit-acceso').value = obra.estado_acceso || 'publico';
  const impSelect = document.getElementById('edit-importancia');
  if (impSelect) {
    impSelect.value = String(obra.importancia !== undefined && obra.importancia !== null ? obra.importancia : 1);
  }
  document.getElementById('edit-foto').value = obra.foto_url || '';
  const inCredito = document.getElementById('edit-foto-credito');
  if (inCredito) inCredito.value = obra.foto_credito || '';
  document.getElementById('edit-enlace').value = obra.enlace_url || '';
  document.getElementById('edit-place').value = obra.place || '';
  document.getElementById('edit-estado-revision').value = obra.estado_revision || 'publicada';

  // Configurar enlace para ir a la obra en el mapa
  const btnModalMap = document.getElementById('btn-modal-view-map');
  if (btnModalMap) {
    const lat = obra.latitud ?? (Array.isArray(obra.coordenadas) ? obra.coordenadas[1] : '');
    const lng = obra.longitud ?? (Array.isArray(obra.coordenadas) ? obra.coordenadas[0] : '');
    btnModalMap.href = `./?obra=${encodeURIComponent(obra.id)}${lat && lng ? `&lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&zoom=17` : ''}`;
  }

  if (modal) {
    modal.classList.add('open');
    if (window.lucide) window.lucide.createIcons({ context: modal });
  }
}

// =========================================================================
// 8. MACROHERRAMIENTAS: DASHBOARD, RELACIONES, NORMALIZADOR Y SISTEMA
// =========================================================================

function setupMacroToolsEvents() {
  // Búsqueda de relaciones
  document.getElementById('search-relationships')?.addEventListener('input', (e) => {
    renderRelationshipsTable(e.target.value);
  });
  document.getElementById('btn-new-relationship')?.addEventListener('click', () => {
    openRelationshipModal(null);
  });
  document.getElementById('btn-export-relationships')?.addEventListener('click', exportRelationshipsCode);
  document.getElementById('btn-close-modal-rel')?.addEventListener('click', closeRelationshipModal);
  document.getElementById('btn-cancel-rel')?.addEventListener('click', closeRelationshipModal);
  document.getElementById('btn-save-rel')?.addEventListener('click', saveRelationshipModal);

  // Delegación de clics generales para relaciones y lotes
  document.addEventListener('click', (e) => {
    const simBtn = e.target.closest('[data-sim-test]');
    if (simBtn) {
      const studio = simBtn.dataset.simTest;
      const simInput = document.getElementById('sim-architect-input');
      if (simInput) {
        simInput.value = studio;
        simInput.dispatchEvent(new Event('input'));
        simInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    const editBtn = e.target.closest('[data-rel-edit]');
    if (editBtn) {
      openRelationshipModal(editBtn.dataset.relEdit);
      return;
    }

    const delBtn = e.target.closest('[data-rel-delete]');
    if (delBtn) {
      const relId = delBtn.dataset.relDelete;
      const rel = adminConsoleState.relationships.find((r) => r.id === relId);
      if (rel && confirm(`¿Eliminar la relación de "${rel.studio}"?`)) {
        adminConsoleState.relationships = adminConsoleState.relationships.filter((r) => r.id !== relId);
        saveRelationships();
        renderRelationshipsTable();
        renderDashboardKPIs();
        updateBadges();
        showAdminToast(`Relación "${rel.studio}" eliminada.`, 'info');
      }
      return;
    }

    const check = e.target.closest('.work-select-check');
    if (check) {
      const id = String(check.dataset.workId);
      if (check.checked) {
        adminConsoleState.selectedWorkIds.add(id);
      } else {
        adminConsoleState.selectedWorkIds.delete(id);
      }
      updateBatchBar();
      return;
    }

    const workEditBtn = e.target.closest('[data-work-edit]');
    if (workEditBtn) {
      const id = workEditBtn.dataset.workEdit;
      openEditModal(id);
      return;
    }
  });

  // Normalizador: Fusión de autor en lote
  document.getElementById('btn-execute-author-merge')?.addEventListener('click', executeBatchAuthorMerge);

  // Auditoría: filtro y buscador
  const auditFilterSelect = document.getElementById('integrity-audit-filter');
  const auditSearchInput = document.getElementById('integrity-search-input');
  const applyAuditFilter = () => {
    renderIntegrityAudit(auditFilterSelect?.value || 'all', auditSearchInput?.value || '');
  };
  auditFilterSelect?.addEventListener('change', applyAuditFilter);
  auditSearchInput?.addEventListener('input', applyAuditFilter);

  // Seleccionar todas las obras visibles
  document.getElementById('check-select-all-works')?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('.work-select-check').forEach((chk) => {
      chk.checked = isChecked;
      const id = String(chk.dataset.workId);
      if (isChecked) adminConsoleState.selectedWorkIds.add(id);
      else adminConsoleState.selectedWorkIds.delete(id);
    });
    updateBatchBar();
  });

  // Acciones en lote
  document.getElementById('btn-batch-publish')?.addEventListener('click', () => executeBatchStatus('publicada'));
  document.getElementById('btn-batch-reject')?.addEventListener('click', () => executeBatchStatus('rechazada'));
  document.getElementById('btn-batch-clear')?.addEventListener('click', () => {
    adminConsoleState.selectedWorkIds.clear();
    document.querySelectorAll('.work-select-check').forEach((c) => { c.checked = false; });
    const master = document.getElementById('check-select-all-works');
    if (master) master.checked = false;
    updateBatchBar();
  });

  // Controles de sistema
  document.getElementById('btn-trigger-revalidate')?.addEventListener('click', triggerRevalidateCatalog);
  document.getElementById('btn-clear-local-caches')?.addEventListener('click', clearLocalCaches);
}

function loadRelationships() {
  try {
    const custom = localStorage.getItem(LOCAL_RELATIONSHIPS_KEY);
    if (custom) {
      adminConsoleState.relationships = JSON.parse(custom);
      return;
    }
  } catch (e) {
    console.warn('Error leyendo relaciones de localStorage:', e);
  }
  adminConsoleState.relationships = JSON.parse(JSON.stringify(SEED_RELATIONSHIPS));
}

function saveRelationships() {
  try {
    localStorage.setItem(LOCAL_RELATIONSHIPS_KEY, JSON.stringify(adminConsoleState.relationships));
  } catch (e) {
    console.warn('Error guardando relaciones:', e);
  }
}

function renderDashboardKPIs() {
  const total = adminConsoleState.allWorks.length;
  const published = adminConsoleState.allWorks.filter((b) => (b.estado_revision || 'publicada') === 'publicada').length;
  const pending = adminConsoleState.pendingWorks.length;
  const noPhoto = adminConsoleState.allWorks.filter((b) => !b.foto_url || !String(b.foto_url).trim()).length;
  const noArq = adminConsoleState.allWorks.filter((b) => !b.arquitecto || !String(b.arquitecto).trim()).length;
  const withInterventions = adminConsoleState.allWorks.filter((b) => /\(\d{4}(?:-\d{4})?\)/.test(b.arquitecto || '')).length;

  const kpiTotal = document.getElementById('kpi-total-buildings');
  const kpiPub = document.getElementById('kpi-published-buildings');
  const kpiPend = document.getElementById('kpi-pending-buildings');
  const kpiNoPhoto = document.getElementById('kpi-no-photo');
  const kpiNoArq = document.getElementById('kpi-no-arq');
  const kpiInterv = document.getElementById('kpi-with-interventions');
  const kpiStud = document.getElementById('kpi-studios-count');
  const kpiUsers = document.getElementById('kpi-users-count');

  if (kpiTotal) kpiTotal.textContent = total.toLocaleString();
  if (kpiPub) kpiPub.textContent = published.toLocaleString();
  if (kpiPend) kpiPend.textContent = pending.toLocaleString();
  if (kpiNoPhoto) kpiNoPhoto.textContent = noPhoto.toLocaleString();
  if (kpiNoArq) kpiNoArq.textContent = noArq.toLocaleString();
  if (kpiInterv) kpiInterv.textContent = withInterventions.toLocaleString();
  if (kpiStud) kpiStud.textContent = adminConsoleState.relationships.length.toString();
  if (kpiUsers) kpiUsers.textContent = adminConsoleState.users.length.toString();
}

function renderRelationshipsTable(filterText = '') {
  const tbody = document.getElementById('relationships-table-body');
  if (!tbody) return;

  const q = normalizeArchitectKey(filterText);
  const filtered = adminConsoleState.relationships.filter((rel) => {
    if (!q) return true;
    if (normalizeArchitectKey(rel.studio).includes(q)) return true;
    if (rel.members.some((m) => normalizeArchitectKey(m).includes(q))) return true;
    if (rel.aliases?.some((a) => normalizeArchitectKey(a).includes(q))) return true;
    return false;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--admin-fg-dim);">No se encontraron estudios o colectivos que coincidan con "${escapeHtml(filterText)}".</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((rel) => {
    const membersHtml = rel.members.map((m) => `<span class="pill-sm">${escapeHtml(m)}</span>`).join(' ');
    const aliasesHtml = (rel.aliases || []).map((a) => `<span class="pill-sm" style="opacity:0.8;">${escapeHtml(a)}</span>`).join(' ') || '<em style="color:var(--admin-fg-dim); font-size:11px;">Sin alias</em>';

    return `
      <tr>
        <td style="font-weight:800; font-family:'League Spartan', sans-serif; font-size:13px;">
          ${escapeHtml(rel.studio)}
          <div style="font-family:'Inter', sans-serif; font-size:10px; font-weight:400; color:var(--admin-fg-dim);">${escapeHtml(rel.id)}</div>
        </td>
        <td><div class="pills-group">${membersHtml}</div></td>
        <td><div class="pills-group">${aliasesHtml}</div></td>
        <td style="text-align:right;">
          <button type="button" class="btn-action-icon" data-sim-test="${escapeHtml(rel.studio)}" title="Probar en simulador">
            <i data-lucide="play" width="13" height="13"></i>
          </button>
          <button type="button" class="btn-action-icon" data-rel-edit="${escapeHtml(rel.id)}" title="Editar relación">
            <i data-lucide="edit-2" width="13" height="13"></i>
          </button>
          <button type="button" class="btn-action-icon btn-action-icon-danger" data-rel-delete="${escapeHtml(rel.id)}" title="Eliminar relación">
            <i data-lucide="trash-2" width="13" height="13"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons({ context: tbody });
}

function initSimulator() {
  const input = document.getElementById('sim-architect-input');
  if (!input || input.dataset.bound) return;
  input.dataset.bound = 'true';

  const runSim = () => {
    const rawVal = input.value.trim();
    const typeBadge = document.getElementById('sim-result-type');
    const termsContainer = document.getElementById('sim-result-terms');
    const countEl = document.getElementById('sim-result-count');
    const previewEl = document.getElementById('sim-result-preview');

    if (!rawVal) {
      if (typeBadge) typeBadge.textContent = '—';
      if (termsContainer) termsContainer.innerHTML = '<span style="color:var(--admin-fg-dim)">Introduce un nombre arriba para simular.</span>';
      if (countEl) countEl.textContent = '0 obras';
      if (previewEl) previewEl.innerHTML = '';
      return;
    }

    const terms = resolveAssociatedTermsWithState(rawVal);
    const isStud = isStudioInState(rawVal);
    const isMemb = isMemberInState(rawVal);

    if (typeBadge) {
      if (isStud) {
        typeBadge.textContent = 'ESTUDIO DE ARQUITECTURA';
        typeBadge.className = 'badge-tag badge-tag-success';
      } else if (isMemb) {
        typeBadge.textContent = 'MIEMBRO DE ESTUDIO';
        typeBadge.className = 'badge-tag badge-tag-blue';
      } else {
        typeBadge.textContent = 'AUTOR INDEPENDIENTE';
        typeBadge.className = 'badge-tag badge-tag-warning';
      }
    }

    if (termsContainer) {
      termsContainer.innerHTML = terms.map((t) => `<span class="sim-term-pill">${escapeHtml(t)}</span>`).join('');
    }

    const normTerms = terms.map((t) => normalizeArchitectKey(t)).filter(Boolean);
    const matchingWorks = adminConsoleState.allWorks.filter((b) => {
      const arqRaw = String(b.arquitectos ? (Array.isArray(b.arquitectos) ? b.arquitectos.join(' ') : b.arquitectos) : (b.arquitecto || ''));
      const arqNorm = normalizeArchitectKey(arqRaw);
      return normTerms.some((term) => arqNorm.includes(term));
    });

    if (countEl) {
      countEl.textContent = `${matchingWorks.length} obra${matchingWorks.length === 1 ? '' : 's'} coincidente${matchingWorks.length === 1 ? '' : 's'}`;
    }

    if (previewEl) {
      if (matchingWorks.length === 0) {
        previewEl.innerHTML = '<div style="color:var(--admin-fg-dim); font-size:11px; padding:6px 0;">No se encontraron obras coincidentes en el catálogo local.</div>';
      } else {
        previewEl.innerHTML = matchingWorks.slice(0, 15).map((w) => `
          <div class="sim-work-item">
            <span style="font-weight:600;">${escapeHtml(w.nombre_obra || 'Sin título')}</span>
            <span style="color:var(--admin-fg-dim); font-size:10.5px;">${escapeHtml(w.arquitecto || '—')}</span>
          </div>
        `).join('') + (matchingWorks.length > 15 ? `<div style="font-size:10px; text-align:center; padding:4px; color:var(--admin-accent);">+ ${matchingWorks.length - 15} obras más</div>` : '');
      }
    }
  };

  input.addEventListener('input', runSim);
}

function resolveAssociatedTermsWithState(input) {
  if (!input) return [];
  const key = normalizeArchitectKey(input);

  const studio = adminConsoleState.relationships.find((r) => {
    return r.id === key || normalizeArchitectKey(r.studio) === key || r.aliases?.some((a) => normalizeArchitectKey(a) === key);
  });

  if (studio) {
    const terms = new Set();
    terms.add(studio.studio);
    studio.aliases?.forEach((a) => terms.add(a));
    return [...terms];
  }

  const memberStudios = adminConsoleState.relationships.filter((r) => {
    return r.members.some((m) => {
      if (normalizeArchitectKey(m) === key) return true;
      const aliases = r.memberAliases?.[m];
      return aliases?.some((a) => normalizeArchitectKey(a) === key);
    });
  });

  if (memberStudios.length > 0) {
    const terms = new Set();
    terms.add(input);
    memberStudios.forEach((s) => {
      s.members.forEach((m) => {
        if (normalizeArchitectKey(m) === key || s.memberAliases?.[m]?.some((a) => normalizeArchitectKey(a) === key)) {
          terms.add(m);
          s.memberAliases?.[m]?.forEach((a) => terms.add(a));
        }
      });
      terms.add(s.studio);
      s.aliases?.forEach((a) => terms.add(a));
    });
    return [...terms];
  }

  return [input];
}

function isStudioInState(input) {
  const key = normalizeArchitectKey(input);
  return adminConsoleState.relationships.some((r) => r.id === key || normalizeArchitectKey(r.studio) === key || r.aliases?.some((a) => normalizeArchitectKey(a) === key));
}

function isMemberInState(input) {
  const key = normalizeArchitectKey(input);
  return adminConsoleState.relationships.some((r) => r.members.some((m) => normalizeArchitectKey(m) === key));
}

function openRelationshipModal(relationshipId = null) {
  adminConsoleState.editingRelationshipId = relationshipId;
  const modal = document.getElementById('modal-relationship');
  const titleEl = document.getElementById('modal-rel-title');
  const studioInput = document.getElementById('rel-studio-name');
  const membersWrap = document.getElementById('rel-members-chips');
  const aliasesWrap = document.getElementById('rel-aliases-chips');

  if (relationshipId) {
    const rel = adminConsoleState.relationships.find((r) => r.id === relationshipId);
    if (!rel) return;
    if (titleEl) titleEl.textContent = `EDITAR // ${rel.studio.toUpperCase()}`;
    if (studioInput) studioInput.value = rel.studio;
    renderChipsList(membersWrap, rel.members || []);
    renderChipsList(aliasesWrap, rel.aliases || []);
  } else {
    if (titleEl) titleEl.textContent = 'NUEVO ESTUDIO / COLECTIVO';
    if (studioInput) studioInput.value = '';
    renderChipsList(membersWrap, []);
    renderChipsList(aliasesWrap, []);
  }

  modal?.classList.add('open');
}

function renderChipsList(container, items = []) {
  if (!container) return;
  container.innerHTML = items.map((item) => `
    <span class="input-chip" data-chip-val="${escapeHtml(item)}">
      ${escapeHtml(item)}
      <span class="chip-remove" title="Eliminar">×</span>
    </span>
  `).join('') + `<input type="text" class="chip-add-input" placeholder="+ Escribir y pulsar Enter..." style="border:none; outline:none; background:transparent; font-size:12px; min-width:140px; padding:4px; color:var(--admin-fg);">`;

  const addInput = container.querySelector('.chip-add-input');
  addInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = addInput.value.trim().replace(/,$/, '');
      if (val) {
        const current = getChipsFromContainer(container);
        if (!current.includes(val)) {
          current.push(val);
          renderChipsList(container, current);
          container.querySelector('.chip-add-input')?.focus();
        }
      }
    }
  });

  container.querySelectorAll('.chip-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const chip = btn.closest('.input-chip');
      const val = chip?.dataset.chipVal;
      const current = getChipsFromContainer(container).filter((item) => item !== val);
      renderChipsList(container, current);
    });
  });
}

function getChipsFromContainer(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll('.input-chip')).map((chip) => chip.dataset.chipVal);
}

function saveRelationshipModal() {
  const studioName = document.getElementById('rel-studio-name')?.value.trim();
  const members = getChipsFromContainer(document.getElementById('rel-members-chips'));
  const aliases = getChipsFromContainer(document.getElementById('rel-aliases-chips'));

  if (!studioName) {
    showAdminToast('Debes indicar el nombre oficial del estudio.', 'error');
    return;
  }

  const id = normalizeArchitectKey(studioName);

  if (adminConsoleState.editingRelationshipId) {
    const idx = adminConsoleState.relationships.findIndex((r) => r.id === adminConsoleState.editingRelationshipId);
    if (idx !== -1) {
      adminConsoleState.relationships[idx] = {
        ...adminConsoleState.relationships[idx],
        studio: studioName,
        members,
        aliases,
      };
    }
  } else {
    if (adminConsoleState.relationships.some((r) => r.id === id)) {
      showAdminToast('Ya existe un estudio con ese identificador.', 'error');
      return;
    }
    adminConsoleState.relationships.push({
      id,
      studio: studioName,
      members,
      aliases,
    });
  }

  saveRelationships();
  renderRelationshipsTable();
  renderDashboardKPIs();
  updateBadges();
  closeRelationshipModal();
  showAdminToast(`Relación "${studioName}" guardada en el proyecto.`, 'success');

  const simInput = document.getElementById('sim-architect-input');
  if (simInput && simInput.value) {
    simInput.dispatchEvent(new Event('input'));
  }
}

function closeRelationshipModal() {
  document.getElementById('modal-relationship')?.classList.remove('open');
  adminConsoleState.editingRelationshipId = null;
}

function exportRelationshipsCode() {
  const tsCode = `export const STUDIO_RELATIONSHIPS: StudioRelationship[] = ${JSON.stringify(adminConsoleState.relationships, null, 2)};`;
  navigator.clipboard.writeText(tsCode).then(() => {
    showAdminToast('Código TypeScript copiado al portapapeles.', 'success');
  }).catch(() => {
    showAdminToast('No se pudo copiar automáticamente.', 'error');
  });
}

function renderNormalizerAudit() {
  const tbody = document.getElementById('interventions-table-body');
  if (!tbody) return;

  const withInterventions = adminConsoleState.allWorks.filter((b) => /\(\d{4}(?:-\d{4})?\)/.test(b.arquitecto || ''));

  if (withInterventions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--admin-fg-dim);">No se detectaron obras con menciones de intervenciones (año entre paréntesis).</td></tr>';
    return;
  }

  tbody.innerHTML = withInterventions.map((b) => {
    const rawArq = b.arquitecto || '';
    const cleanNames = separarArquitectos(rawArq).join(', ');
    const extracted = extraerIntervenciones(rawArq);
    const intervText = extracted.map((i) => `${i.arquitecto} (${i.año})`).join('; ') || 'Detectada sin parsear';

    return `
      <tr>
        <td style="font-weight:700;">${escapeHtml(b.nombre_obra || 'Sin título')}</td>
        <td style="color:var(--admin-fg-dim); font-size:11.5px;">${escapeHtml(b.place || b.ciudad || '—')}</td>
        <td style="font-family:'Inter', monospace; font-size:11px; background:var(--admin-bg-raised); padding:6px 10px;">${escapeHtml(rawArq)}</td>
        <td style="color:var(--admin-accent); font-weight:600;">${escapeHtml(cleanNames)}</td>
        <td><span class="badge-tag badge-tag-success">${escapeHtml(intervText)}</span></td>
      </tr>
    `;
  }).join('');
}

async function executeBatchAuthorMerge() {
  const oldAuthor = document.getElementById('merge-old-author')?.value.trim();
  const newAuthor = document.getElementById('merge-new-author')?.value.trim();

  if (!oldAuthor || !newAuthor) {
    showAdminToast('Indica tanto el autor a sustituir como el autor destino.', 'error');
    return;
  }

  const matches = adminConsoleState.allWorks.filter((b) => {
    return (b.arquitecto || '').toLowerCase().includes(oldAuthor.toLowerCase());
  });

  if (matches.length === 0) {
    showAdminToast(`No se encontraron obras que contengan "${oldAuthor}".`, 'error');
    return;
  }

  const confirmed = confirm(`Se actualizarán ${matches.length} obras en la base de datos cambiando "${oldAuthor}" por "${newAuthor}". ¿Continuar?`);
  if (!confirmed) return;

  showAdminToast(`Actualizando ${matches.length} obras en lote...`, 'info');

  let updatedCount = 0;
  for (const b of matches) {
    try {
      const updatedArq = (b.arquitecto || '').replace(new RegExp(oldAuthor, 'gi'), newAuthor);
      await updateBuilding(b.id, { arquitecto: updatedArq }, adminConsoleState.token);
      b.arquitecto = updatedArq;
      updatedCount++;
    } catch (e) {
      console.warn(`Error al actualizar obra ${b.id}:`, e);
    }
  }

  showAdminToast(`¡Completado! ${updatedCount} obras actualizadas.`, 'success');
  renderNormalizerAudit();
  renderIntegrityAudit();
  invalidateCatalogCache();
}

function renderIntegrityAudit(filterType = 'all', searchQuery = '') {
  const tbody = document.getElementById('integrity-table-body');
  if (!tbody) return;

  const q = normalizeArchitectKey(searchQuery);

  const filtered = adminConsoleState.allWorks.filter((b) => {
    if (filterType === 'no-photo' && (b.foto_url && String(b.foto_url).trim())) return false;
    if (filterType === 'no-arq' && (b.arquitecto && String(b.arquitecto).trim())) return false;
    if (filterType === 'no-coords' && (Number.isFinite(b.latitud) && Number.isFinite(b.longitud) && (b.latitud !== 0 || b.longitud !== 0))) return false;
    if (filterType === 'no-r2' && (!b.foto_url || b.foto_url.includes('imagedelivery.net') || b.foto_url.includes('cloudflare'))) return false;
    if (filterType === 'pending' && (b.estado_revision !== 'pendiente')) return false;

    if (q) {
      const haystack = normalizeArchitectKey(`${b.nombre_obra} ${b.arquitecto} ${b.place} ${b.ciudad} ${b.id}`);
      if (!haystack.includes(q)) return false;
    }

    return true;
  });

  const countBadge = document.getElementById('integrity-count-badge');
  if (countBadge) countBadge.textContent = `${filtered.length} obras encontradas`;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--admin-fg-dim);">No se encontraron obras con los criterios seleccionados.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.slice(0, 100).map((b) => {
    const isChecked = adminConsoleState.selectedWorkIds.has(String(b.id));
    const hasPhoto = Boolean(b.foto_url && String(b.foto_url).trim());
    const status = b.estado_revision || 'publicada';

    let statusBadge = `<span class="badge-tag badge-tag-success">${status.toUpperCase()}</span>`;
    if (status === 'pendiente') statusBadge = `<span class="badge-tag badge-tag-warning">PENDIENTE</span>`;
    if (status === 'rechazada') statusBadge = `<span class="badge-tag badge-tag-danger">RECHAZADA</span>`;

    return `
      <tr>
        <td style="text-align:center;">
          <input type="checkbox" class="work-select-check" data-work-id="${b.id}" ${isChecked ? 'checked' : ''}>
        </td>
        <td style="font-weight:700;">
          <a href="./obra/${encodeURIComponent(b.id)}" target="_blank" style="color:inherit; text-decoration:underline;">
            ${escapeHtml(b.nombre_obra || 'Sin título')}
          </a>
        </td>
        <td>${escapeHtml(b.arquitecto || '⚠️ SIN AUTOR')}</td>
        <td>${escapeHtml(b.place || b.ciudad || '—')}</td>
        <td>${statusBadge}</td>
        <td>
          ${hasPhoto ? '<span style="color:var(--admin-green); font-weight:700;">✓ R2</span>' : '<span style="color:var(--admin-red); font-weight:700;">⚠️ Sin foto</span>'}
        </td>
        <td style="text-align:right;">
          <button type="button" class="btn-action-icon" data-work-edit="${b.id}" title="Editar ficha completa">
            <i data-lucide="edit" width="13" height="13"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons({ context: tbody });
  updateBatchBar();
}

function updateBatchBar() {
  const bar = document.getElementById('batch-action-bar');
  const countLabel = document.getElementById('batch-selected-count');
  if (!bar) return;

  const count = adminConsoleState.selectedWorkIds.size;
  if (count > 0) {
    if (countLabel) countLabel.textContent = `${count} obra${count === 1 ? '' : 's'} seleccionada${count === 1 ? '' : 's'}`;
    bar.classList.add('visible');
  } else {
    bar.classList.remove('visible');
  }
}

async function executeBatchStatus(newStatus) {
  const ids = Array.from(adminConsoleState.selectedWorkIds);
  if (ids.length === 0) return;

  const confirmed = confirm(`¿Cambiar estado a "${newStatus.toUpperCase()}" para las ${ids.length} obras seleccionadas?`);
  if (!confirmed) return;

  showAdminToast(`Aplicando estado "${newStatus}" a ${ids.length} obras...`, 'info');

  let successCount = 0;
  for (const id of ids) {
    try {
      await reviewBuilding(id, newStatus, adminConsoleState.token);
      const b = adminConsoleState.allWorks.find((item) => String(item.id) === String(id));
      if (b) b.estado_revision = newStatus;
      successCount++;
    } catch (e) {
      console.warn(`Error actualizando ${id}:`, e);
    }
  }

  showAdminToast(`¡Completado! ${successCount} obras actualizadas.`, 'success');
  adminConsoleState.selectedWorkIds.clear();
  renderIntegrityAudit();
  renderDashboardKPIs();
  updateBadges();
  invalidateCatalogCache();
}

async function triggerRevalidateCatalog() {
  const btn = document.getElementById('btn-trigger-revalidate');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'REVALIDANDO CDN...';
  }

  try {
    const res = await fetch('./api/revalidate-catalog', { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showAdminToast('¡Catálogo CDN purgado y revalidado con éxito!', 'success');
    logSystemEvent('Revalidación manual de CDN ejecutada con éxito.');
  } catch (err) {
    showAdminToast('Aviso: Fallo al revalidar CDN.', 'error');
    console.warn('Revalidate error:', err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="refresh-cw" width="14" height="14"></i><span>PURGAR CACHÉ CDN (/api/revalidate-catalog)</span>';
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

function clearLocalCaches() {
  invalidateCatalogCache();
  showAdminToast('Caché local e IndexedDB purgadas con éxito.', 'success');
  logSystemEvent('Caché local e IndexedDB reseteadas.');
  setTimeout(() => window.location.reload(), 800);
}

function logSystemEvent(msg) {
  const logEl = document.getElementById('system-log-console');
  if (!logEl) return;
  const time = new Date().toLocaleTimeString();
  logEl.innerHTML = `[${time}] ${escapeHtml(msg)}\n` + logEl.innerHTML;
}

