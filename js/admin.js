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
  fetchUserDirectory, 
  reviewBuilding, 
  deleteBuilding, 
  updateBuilding,
  updateUserPresence 
} from './api.js';
import { escapeHtml, normalizarCategoria, nombreCategoria } from './state.js';

const SESSION_KEY = 'nolli_admin_session_token';

// Estado local de la consola de administración
const adminConsoleState = {
  token: null,
  user: null,
  role: null,
  activeTab: 'pending', // 'pending' | 'reports' | 'users'
  pendingWorks: [],
  allWorks: [],
  reports: [],
  users: [],
  editingWorkId: null,
};

let presenceTimer = null;

// =========================================================================
// 1. INICIALIZACIÓN Y SEGURIDAD (GUARDIA DE ACCESO)
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await checkAccessAndInit();
});

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
      localStorage.setItem('nolli_theme', isDark ? 'dark' : 'light');
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

  if (titleEl) titleEl.textContent = `[ 403 // ${title} ]`;
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
  if (roleEl) roleEl.textContent = `[ ${role.toUpperCase()} ]`;
}

function iniciarPresencia() {
  if (presenceTimer) clearInterval(presenceTimer);
  if (adminConsoleState.token) {
    updateUserPresence(adminConsoleState.token);
    presenceTimer = setInterval(() => {
      if (adminConsoleState.token) updateUserPresence(adminConsoleState.token);
      else clearInterval(presenceTimer);
    }, 2 * 60 * 1000);
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
      adminConsoleState.activeTab = target;

      document.querySelectorAll('.admin-tab-view').forEach((view) => view.classList.add('hidden'));
      const activeView = document.getElementById(`view-${target}`);
      if (activeView) activeView.classList.remove('hidden');

      if (target === 'pending') renderModulePending();
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
  await Promise.all([
    loadWorksData(),
    loadReportsData(),
    loadUsersData(),
  ]);
  updateBadges();
  renderModulePending();
}

async function loadWorksData() {
  try {
    const all = await fetchAllBuildingsForAdmin(adminConsoleState.token);
    adminConsoleState.allWorks = all || [];
    adminConsoleState.pendingWorks = (all || []).filter((w) => w.estado_revision === 'pendiente');
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
  const badgeReports = document.getElementById('badge-count-reports');
  const badgeUsers = document.getElementById('badge-count-users');

  if (badgePending) badgePending.textContent = adminConsoleState.pendingWorks.length;
  if (badgeReports) badgeReports.textContent = adminConsoleState.reports.length;

  const onlineCount = adminConsoleState.users.filter((u) => {
    if (!u.last_seen_at) return false;
    return (Date.now() - new Date(u.last_seen_at).getTime()) < 5 * 60 * 1000;
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

  let works = adminConsoleState.allWorks;
  if (filterState !== 'todos') {
    works = works.filter((w) => (w.estado_revision || 'publicada') === filterState);
  }

  if (searchVal) {
    works = works.filter((w) => `${w.nombre_obra || ''} ${w.arquitecto || ''} ${w.place || ''}`.toLowerCase().includes(searchVal));
  }

  if (!works.length) {
    container.innerHTML = `
      <div style="border:2px dashed var(--admin-border-light); padding:40px; text-align:center; font-family: 'Inter', sans-serif; font-size:12px; color:var(--admin-fg-dim);">
        [ NO SE ENCONTRARON OBRAS BAJO ESTE CRITERIO // BANDEJA LIMPIA ]
      </div>
    `;
    return;
  }

  container.innerHTML = works.map((obra) => {
    const safeId = escapeHtml(obra.id);
    const title = escapeHtml(obra.nombre_obra || 'Sin título');
    const architect = escapeHtml(obra.arquitecto || 'Arquitecto no especificado');
    const year = obra.año_construccion ? ` · ${escapeHtml(obra.año_construccion)}` : '';
    const category = nombreCategoria(obra.categoria);
    const place = obra.place ? escapeHtml(obra.place) : 'Ubicación registrada';
    const isPending = obra.estado_revision === 'pendiente';
    const photo = obra.foto_url || obra.foto_miniatura || '';

    return `
      <article class="admin-work-card ${isPending ? 'pending-border' : ''}" data-work-id="${safeId}">
        ${photo ? `
          <img src="${escapeHtml(photo)}" alt="${title}" class="admin-work-thumb" loading="lazy" onerror="this.outerHTML='<div class=\\'admin-work-thumb-fallback\\'>🏛️</div>'">
        ` : `
          <div class="admin-work-thumb-fallback">🏛️</div>
        `}
        
        <div class="admin-work-info">
          <div class="admin-work-title-row">
            <h3 class="admin-work-title">${title}</h3>
            ${isPending ? `<span class="admin-badge-pending">[ PENDIENTE DE REVISIÓN ]</span>` : ''}
            <span class="admin-work-tag" style="background:var(--admin-bg-raised);">${escapeHtml(obra.estado_revision || 'publicada').toUpperCase()}</span>
          </div>

          <div class="admin-work-meta">
            <span>📐 <strong>${architect}</strong>${year}</span>
            <span>📍 ${place}</span>
          </div>

          <div class="admin-work-tags">
            <span class="admin-work-tag">🏷️ ${escapeHtml(category)}</span>
            ${obra.estado_acceso ? `<span class="admin-work-tag">🚪 ${escapeHtml(obra.estado_acceso)}</span>` : ''}
            ${obra.añadido_por ? `<span class="admin-work-tag">👤 Por: ${escapeHtml(obra.añadido_por)}</span>` : ''}
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
          <a href="./?obra=${safeId}" target="_blank" rel="noopener noreferrer" class="admin-btn" style="text-decoration:none;">
            <i data-lucide="map-pin" width="14" height="14"></i>
            <span>VER MAPA</span>
          </a>
          <button type="button" class="admin-btn admin-btn-reject" data-action="delete" data-id="${safeId}">
            <i data-lucide="trash-2" width="14" height="14"></i>
            <span>BORRAR</span>
          </button>
        </div>
      </article>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

// =========================================================================
// 5. MÓDULO 02: REPORTES DE ERROR
// =========================================================================
function renderModuleReports() {
  const container = document.getElementById('reports-list');
  if (!container) return;

  const searchVal = (document.getElementById('search-reports')?.value || '').trim().toLowerCase();

  let reports = adminConsoleState.reports;
  if (searchVal) {
    reports = reports.filter((r) => {
      const desc = (r.descripcion || r.description || '').toLowerCase();
      const bTitle = (r.Buildings?.nombre_obra || '').toLowerCase();
      return desc.includes(searchVal) || bTitle.includes(searchVal);
    });
  }

  if (!reports.length) {
    container.innerHTML = `
      <div style="border:2px dashed var(--admin-border-light); padding:40px; text-align:center; font-family: 'Inter', sans-serif; font-size:12px; color:var(--admin-fg-dim);">
        [ NO HAY INCIDENCIAS PENDIENTES // BUZÓN VACÍO ]
      </div>
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

    return `
      <article class="admin-report-card" data-report-id="${safeId}">
        <div class="admin-report-head">
          <div>
            <h3 class="admin-report-building">${buildingTitle}</h3>
            ${architect ? `<div style="font-size:11px; color:var(--admin-fg-dim); font-family: 'Inter', sans-serif;">📐 ${architect}</div>` : ''}
          </div>
          <span class="admin-report-date">📅 ${date}</span>
        </div>

        <div class="admin-report-body">
          <strong style="display:block; font-family: 'Inter', sans-serif; font-size:10px; margin-bottom:4px; color:var(--admin-accent);">MOTIVO / DETALLE REPORTADO:</strong>
          ${desc}
        </div>

        <div class="admin-report-footer">
          <span class="admin-report-sender">👤 Remitente: <strong>${user}</strong></span>
          <div class="admin-report-actions-row">
            <a href="./?obra=${buildingId}" target="_blank" rel="noopener noreferrer" class="admin-btn">
              <i data-lucide="compass" width="13" height="13"></i>
              <span>VER EN EL MAPA</span>
            </a>
            <button type="button" class="admin-btn admin-btn-approve" data-report-action="resolve" data-id="${safeId}">
              <i data-lucide="check-check" width="13" height="13"></i>
              <span>RESOLVER / ARCHIVAR</span>
            </button>
            <button type="button" class="admin-btn admin-btn-reject" data-report-action="dismiss" data-id="${safeId}">
              <i data-lucide="trash-2" width="13" height="13"></i>
              <span>DESCARTAR</span>
            </button>
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
              ⚠️ CONFLICTO DE POLÍTICAS RLS EN SUPABASE (RECURSIÓN INFINITA EN "PROFILES")
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
        <td colspan="5" style="text-align:center; padding:30px; color:var(--admin-fg-dim);">
          [ NO SE ENCONTRARON USUARIOS CON ESTE FILTRO ]
        </td>
      </tr>
    `;
    return;
  }

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
              <div class="admin-user-name">${fullName} ${presence.isOnline ? `<span class="admin-online-badge">[ ONLINE ]</span>` : ''}</div>
              <div class="admin-user-email">${email}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="admin-role-tag ${role}">[ ${role.toUpperCase()} ]</span>
        </td>
        <td>📍 ${location}</td>
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
}

function calculateUserPresence(lastSeenAt) {
  if (!lastSeenAt) {
    return { isOnline: false, label: 'Sin registro', title: 'Desconectado' };
  }

  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 5) {
    return { isOnline: true, label: '🟢 Activo ahora', title: 'En línea en este momento' };
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

  document.getElementById('search-reports')?.addEventListener('input', renderModuleReports);

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
    }
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
  } catch (err) {
    alert(`Error al aprobar obra: ${err.message}`);
  }
}

async function handleRejectWork(id) {
  if (!confirm('¿Marcar esta propuesta como rechazada?')) return;
  try {
    await reviewBuilding(id, 'rechazada', adminConsoleState.token);
    const item = adminConsoleState.allWorks.find((w) => String(item.id) === String(id));
    if (item) item.estado_revision = 'rechazada';
    adminConsoleState.pendingWorks = adminConsoleState.allWorks.filter((w) => w.estado_revision === 'pendiente');
    updateBadges();
    renderModulePending();
  } catch (err) {
    alert(`Error al rechazar obra: ${err.message}`);
  }
}

async function handleDeleteWork(id) {
  const item = adminConsoleState.allWorks.find((w) => String(w.id) === String(id));
  const name = item ? item.nombre_obra : `#${id}`;
  if (!confirm(`¿Eliminar definitivamente la obra "${name}" de la base de datos? Esta acción es irreversible.`)) return;

  try {
    await deleteBuilding(id, adminConsoleState.token);
    adminConsoleState.allWorks = adminConsoleState.allWorks.filter((w) => String(w.id) !== String(id));
    adminConsoleState.pendingWorks = adminConsoleState.allWorks.filter((w) => w.estado_revision === 'pendiente');
    updateBadges();
    renderModulePending();
  } catch (err) {
    alert(`Error al eliminar obra: ${err.message}`);
  }
}

// Acciones de Reportes
async function handleResolveReport(id) {
  try {
    await updateBuildingReport(id, 'revisado', adminConsoleState.token);
    adminConsoleState.reports = adminConsoleState.reports.filter((r) => String(r.id) !== String(id));
    updateBadges();
    renderModuleReports();
  } catch (err) {
    alert(`Error al resolver reporte: ${err.message}`);
  }
}

async function handleDismissReport(id) {
  try {
    await updateBuildingReport(id, 'descartado', adminConsoleState.token);
    adminConsoleState.reports = adminConsoleState.reports.filter((r) => String(r.id) !== String(id));
    updateBadges();
    renderModuleReports();
  } catch (err) {
    alert(`Error al descartar reporte: ${err.message}`);
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

      const payload = {
        nombre_obra: document.getElementById('edit-nombre').value.trim(),
        arquitecto: document.getElementById('edit-arquitecto').value.trim(),
        año_construccion: document.getElementById('edit-ano').value ? parseInt(document.getElementById('edit-ano').value, 10) : null,
        categoria: document.getElementById('edit-categoria').value,
        estado_acceso: document.getElementById('edit-acceso').value,
        foto_url: document.getElementById('edit-foto').value.trim() || null,
        enlace_url: document.getElementById('edit-enlace').value.trim() || null,
        place: document.getElementById('edit-place').value.trim() || null,
        estado_revision: document.getElementById('edit-estado-revision').value,
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
        alert('Ficha de obra actualizada correctamente.');
      } catch (err) {
        alert(`Error al guardar cambios: ${err.message}`);
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
  document.getElementById('edit-foto').value = obra.foto_url || '';
  document.getElementById('edit-enlace').value = obra.enlace_url || '';
  document.getElementById('edit-place').value = obra.place || '';
  document.getElementById('edit-estado-revision').value = obra.estado_revision || 'publicada';

  if (modal) modal.classList.add('open');
}

