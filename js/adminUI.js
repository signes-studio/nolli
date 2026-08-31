/* =========================================================================
   ADMINUI.JS — Panel de administración para gestión de obras, reportes y usuarios
   Arquitectura Serverless Blindada + Frontend Vanilla Neo-Bauhaus
   ========================================================================= */

import { state, separarArquitectos, esRolAdmin, escapeHtml } from './state.js';
import { 
  deleteBuilding, 
  fetchRatingAverages, 
  reviewBuilding, 
  fetchBuildingReports, 
  fetchUserDirectory, 
  updateBuildingReport, 
  fetchAllBuildingsForAdmin,
  fetchUserRole
} from './api.js';
import { actualizarFuenteMapa } from './mapData.js';
import { generarFiltrosUI } from './filtersUI.js';

const panel = document.getElementById('admin-panel');
const search = document.getElementById('admin-search');
const reviewFilter = document.getElementById('admin-review-filter');
const count = document.getElementById('admin-count');
const list = document.getElementById('admin-project-list');
const projectsView = document.getElementById('admin-projects-view');
const reportsView = document.getElementById('admin-reports-view');
const reportList = document.getElementById('admin-report-list');
const reportCount = document.getElementById('admin-inbox-count');
const reportBadge = document.getElementById('admin-report-badge');
const usersView = document.getElementById('admin-users-view');
const userList = document.getElementById('admin-user-list');
const userSearch = document.getElementById('admin-user-search');
const userCount = document.getElementById('admin-user-count');
const toolbar = document.querySelector('.admin-toolbar');

const cityCache = new Map();
let ratingAverages = new Map();
let cachedReports = [];
let cachedUsers = [];
let currentAdminTab = 'projects';

function getAdminButtons() {
  return [
    document.getElementById('btn-admin-panel'),
  ].filter(Boolean);
}

export function initAdminUI() {
  getAdminButtons().forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleAdminPanel();
    });
  });

  // Router Global por Hash (#admin)
  window.addEventListener('hashchange', handleAdminHashRoute);
  if (window.location.hash === '#admin') {
    setTimeout(handleAdminHashRoute, 100);
  }

  if (search) search.addEventListener('input', renderList);
  if (reviewFilter) {
    reviewFilter.addEventListener('change', () => {
      renderList();
      actualizarFuenteMapa();
    });
  }
  if (userSearch) userSearch.addEventListener('input', renderUsers);

  // Navegación por pestañas del panel
  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-admin-tab]');
    if (!tab) return;
    currentAdminTab = tab.dataset.adminTab;
    document.querySelectorAll('[data-admin-tab]').forEach((item) => item.classList.toggle('active', item === tab));
    renderCurrentTab();
  });

  // Eventos de botones y acciones dentro del panel admin
  document.addEventListener('click', (event) => {
    if (event.target.closest('#btn-admin-close')) {
      toggleAdminPanel(false);
      return;
    }

    if (event.target.closest('#btn-admin-login-cta')) {
      const loginModal = document.getElementById('modal-login');
      if (loginModal) loginModal.classList.add('open');
      toggleAdminPanel(false);
      return;
    }

    const edit = event.target.closest('[data-admin-edit]');
    if (edit) {
      const obra = state.OBRAS.find((item) => String(item.id) === edit.dataset.adminEdit);
      if (obra) {
        document.dispatchEvent(new CustomEvent('radar:edit-building', { detail: { obra } }));
        toggleAdminPanel(false);
      }
      return;
    }

    const remove = event.target.closest('[data-admin-delete]');
    if (remove) {
      eliminarProyecto(remove.dataset.adminDelete);
      return;
    }

    const review = event.target.closest('[data-admin-review]');
    if (review) {
      revisarProyecto(review.dataset.adminReview, review.dataset.reviewStatus);
      return;
    }

    const report = event.target.closest('[data-report-id]');
    if (report) {
      actualizarReporte(report.dataset.reportId, report.dataset.reportStatus);
      return;
    }

    const reportBuilding = event.target.closest('[data-report-building]');
    if (reportBuilding) {
      abrirProyectoDesdeReporte(reportBuilding.dataset.reportBuilding);
      return;
    }
  });

  // Atajo de teclado: Alt + A para alternar panel admin
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'a' || e.key === 'A')) {
      if (esRolAdmin(state.userRole)) {
        e.preventDefault();
        toggleAdminPanel();
      }
    }
  });

  document.addEventListener('radar:admin-panel-open', () => {
    toggleAdminPanel(true);
  });

  document.addEventListener('radar:admin-login', async () => {
    checkAdminVisibility();
    await syncAllAdminData();
    if (panel?.classList.contains('open')) renderCurrentTab();
  });

  document.addEventListener('radar:user-session-ready', () => {
    checkAdminVisibility();
    if (window.location.hash === '#admin') handleAdminHashRoute();
  });

  document.addEventListener('radar:admin-mode-change', () => {
    const buttons = getAdminButtons();
    buttons.forEach((btn) => btn.classList.toggle('hidden', !state.adminMode));
    if (!state.adminMode) toggleAdminPanel(false);
  });

  document.addEventListener('radar:logout', () => {
    const buttons = getAdminButtons();
    buttons.forEach((btn) => btn.classList.add('hidden'));
    toggleAdminPanel(false);
    cachedReports = [];
    cachedUsers = [];
  });

  document.addEventListener('radar:data-ready', renderList);
  document.addEventListener('radar:buildings-changed', renderList);

  checkAdminVisibility();
}

export async function toggleAdminPanel(forceOpen = null) {
  if (!panel) return;
  const shouldOpen = forceOpen !== null ? forceOpen : !panel.classList.contains('open');
  
  if (shouldOpen) {
    if (!state.sessionToken) {
      renderAuthRequired();
      panel.classList.add('open');
      return;
    }

    if (!esRolAdmin(state.userRole)) {
      mostrarAlertaSeguridad('ACCESO DENEGADO', 'Se requieren privilegios de administrador para abrir este panel.');
      return;
    }

    panel.classList.add('open');
    getAdminButtons().forEach((b) => b.classList.add('active-state'));
    await syncAllAdminData();
    renderCurrentTab();
  } else {
    panel.classList.remove('open');
    getAdminButtons().forEach((b) => b.classList.remove('active-state'));
  }
}

export async function handleAdminHashRoute() {
  if (window.location.hash !== '#admin') return;

  let token = state.sessionToken;
  if (!token) {
    const saved = localStorage.getItem('nolli_admin_session_token') || sessionStorage.getItem('nolli_admin_session_token');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        token = parsed.access_token || parsed;
      } catch {}
    }
  }

  if (!token) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    mostrarAlertaSeguridad('AUTENTICACIÓN REQUERIDA', 'Inicia sesión con una cuenta de administrador para acceder a la curaduría.');
    return;
  }

  try {
    let role = state.userRole;
    if (!role) {
      role = await fetchUserRole(token);
      state.userRole = role;
    }

    if (!esRolAdmin(role)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      mostrarAlertaSeguridad('ACCESO DENEGADO', `Tu cuenta no tiene privilegios de administración (Rol: ${role.toUpperCase()}).`);
      return;
    }

    await toggleAdminPanel(true);
  } catch (err) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    mostrarAlertaSeguridad('ERROR DE SEGURIDAD', err.message || 'No se pudieron verificar las credenciales de administración.');
  }
}

function checkAdminVisibility() {
  const isAdmin = esRolAdmin(state.userRole);
  const buttons = getAdminButtons();
  buttons.forEach((btn) => {
    btn.classList.toggle('hidden', !isAdmin || state.adminMode === false);
  });
}

function mostrarAlertaSeguridad(titulo, mensaje) {
  const toastId = 'admin-security-toast';
  let toast = document.getElementById(toastId);
  if (!toast) {
    toast = document.createElement('div');
    toast.id = toastId;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      background: #111111;
      color: #F4F1EA;
      border: 2px solid #D6201D;
      box-shadow: 4px 4px 0px #111111;
      padding: 14px 18px;
      max-width: 90vw;
      width: 440px;
      font-family: 'JetBrains Mono', monospace;
      display: flex;
      flex-direction: column;
      gap: 6px;
    `;
    document.body.appendChild(toast);
  }

  toast.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:11px; font-weight:800; color:#E84E1B;">[ 403 // ${escapeHtml(titulo)} ]</span>
      <button type="button" onclick="this.closest('#admin-security-toast').remove()" style="background:none; border:none; color:#F4F1EA; font-size:12px; cursor:pointer;">✕</button>
    </div>
    <div style="font-size:10px; color:#D5CFC0; line-height:1.4;">${escapeHtml(mensaje)}</div>
  `;

  setTimeout(() => toast?.remove(), 5000);
}

function renderAuthRequired() {
  if (toolbar) toolbar.classList.add('admin-view-hidden');
  if (projectsView) projectsView.classList.remove('admin-view-hidden');
  if (reportsView) reportsView.classList.add('admin-view-hidden');
  if (usersView) usersView.classList.add('admin-view-hidden');

  if (list) {
    list.innerHTML = `
      <div style="padding: 36px 18px; text-align: center; display: grid; gap: 14px; font-family: 'JetBrains Mono', monospace;">
        <div style="font-size: 28px;">🔐</div>
        <h3 style="font-size: 14px; font-weight: 800; color: var(--accent-2, #EFBC02); margin: 0;">AUTENTICACIÓN REQUERIDA</h3>
        <p style="font-size: 11px; color: var(--fg-dim); line-height: 1.5; margin: 0;">
          Para acceder al panel de administración, revisión de obras, reportes de incidencias y directorio de usuarios, debes identificarte con tu cuenta administradora.
        </p>
        <div>
          <button type="button" id="btn-admin-login-cta" class="filter-action" style="padding: 8px 18px; font-size: 11px; font-weight: 800; color: var(--accent-2, #EFBC02); border: 1.5px solid var(--accent-2, #EFBC02); background: rgba(239, 188, 2, 0.12); cursor: pointer;">
            [ INICIAR SESIÓN ]
          </button>
        </div>
      </div>
    `;
  }
}

async function syncAllAdminData() {
  if (!state.sessionToken || !esRolAdmin(state.userRole)) return;

  // 1. Cargar obras completas (incluidas pendientes)
  try {
    const adminObras = await fetchAllBuildingsForAdmin(state.sessionToken);
    if (adminObras && adminObras.length) {
      const existingIds = new Set(state.OBRAS.map((o) => String(o.id)));
      adminObras.forEach((obra) => {
        if (!existingIds.has(String(obra.id))) {
          state.OBRAS.push(obra);
          existingIds.add(String(obra.id));
        } else {
          const index = state.OBRAS.findIndex((o) => String(o.id) === String(obra.id));
          if (index !== -1) state.OBRAS[index] = { ...state.OBRAS[index], ...obra };
        }
      });
    }
  } catch {}

  // 2. Cargar valoraciones medias
  try {
    ratingAverages = await fetchRatingAverages(state.sessionToken);
  } catch {}

  // 3. Cargar reportes
  try {
    cachedReports = await fetchBuildingReports(state.sessionToken);
    if (reportBadge) reportBadge.textContent = cachedReports.length;
    if (reportCount) reportCount.textContent = `${cachedReports.length} pendientes`;
  } catch {}

  // 4. Cargar usuarios
  try {
    cachedUsers = await fetchUserDirectory(state.sessionToken);
  } catch {}
}

function renderCurrentTab() {
  const isProjects = currentAdminTab === 'projects';
  const isReports = currentAdminTab === 'reports';
  const isUsers = currentAdminTab === 'users';

  if (toolbar) toolbar.classList.toggle('admin-view-hidden', !isProjects);
  if (projectsView) projectsView.classList.toggle('admin-view-hidden', !isProjects);
  if (reportsView) reportsView.classList.toggle('admin-view-hidden', !isReports);
  if (usersView) usersView.classList.toggle('admin-view-hidden', !isUsers);

  if (isProjects) renderList();
  else if (isReports) renderReports();
  else if (isUsers) renderUsers();
}

async function renderList() {
  if (!state.sessionToken || !esRolAdmin(state.userRole)) {
    renderAuthRequired();
    return;
  }

  const text = (search?.value || '').trim().toLowerCase();
  const filterVal = reviewFilter?.value || '';

  const allProjects = [...state.OBRAS].sort((a, b) => {
    if (a.estado_revision === 'pendiente' && b.estado_revision !== 'pendiente') return -1;
    if (b.estado_revision === 'pendiente' && a.estado_revision !== 'pendiente') return 1;
    return 0;
  });

  const filtered = allProjects
    .filter((obra) => `${obra.nombre_obra || ''} ${obra.arquitecto || ''}`.toLowerCase().includes(text))
    .filter((obra) => !filterVal || obra.estado_revision === filterVal);

  const pendingTotal = allProjects.filter((o) => o.estado_revision === 'pendiente').length;

  if (count) {
    count.textContent = pendingTotal > 0 ? `${pendingTotal} PENDIENTES · ${filtered.length} TOTAL` : `${filtered.length} / ${state.OBRAS.length}`;
  }

  if (!filtered.length) {
    if (list) list.innerHTML = '<div class="nearby-empty" style="padding: 24px; text-align: center; color: var(--fg-dim);">No hay proyectos que coincidan con la búsqueda o filtro.</div>';
    return;
  }

  if (list) {
    list.innerHTML = filtered.map((obra) => {
      const safeId = escapeHtml(obra.id);
      const safeFeatureId = escapeHtml(obra.featureId || obra.id);
      const safeNombre = escapeHtml(obra.nombre_obra || 'Obra sin título');
      const safeArquitecto = escapeHtml(obra.arquitecto || 'Arquitecto no especificado');
      const safeRating = escapeHtml(formatearMedia(obra.id));
      const safeStatus = escapeHtml(formatearEstadoRevision(obra.estado_revision));
      const isPending = obra.estado_revision === 'pendiente';

      return `
        <div class="admin-project ${isPending ? 'admin-project-pending' : ''}" style="${isPending ? 'border-left: 3px solid var(--accent-2, #EFBC02); background: rgba(239, 188, 2, 0.05);' : ''}">
          <div class="admin-project-info">
            <div style="display:flex; align-items:center; gap:6px;">
              <strong>${safeNombre}</strong>
              ${isPending ? '<span style="font-size:9px; font-weight:800; background:var(--accent-2, #EFBC02); color:#141411; padding:1px 4px;">[ PENDIENTE ]</span>' : ''}
            </div>
            <span>${safeArquitecto}</span>
            <span class="admin-project-city" data-city-for="${safeFeatureId}">LOCALIZACIÓN...</span>
            <span class="admin-project-rating" style="font-size:9.5px;">${safeRating}</span>
            <span class="admin-project-status ${isPending ? 'pending' : ''}">${safeStatus}</span>
          </div>
          <div class="admin-project-actions">
            <button type="button" class="btn admin-action-edit" data-admin-edit="${safeId}" title="Editar ficha de obra">EDITAR</button>
            ${isPending ? `
              <button type="button" class="btn admin-action-review" data-admin-review="${safeId}" data-review-status="publicada" style="color:var(--accent-2); border-color:var(--accent-2); font-weight:700;">APROBAR</button>
              <button type="button" class="btn admin-action-reject" data-admin-review="${safeId}" data-review-status="rechazada" style="color:var(--red); border-color:var(--red);">RECHAZAR</button>
            ` : ''}
            <button type="button" class="btn admin-action-delete" data-admin-delete="${safeId}" title="Eliminar del catálogo">BORRAR</button>
          </div>
        </div>
      `;
    }).join('');

    filtered.slice(0, 30).forEach(async (obra) => {
      const cityElement = list.querySelector(`[data-city-for="${obra.featureId || obra.id}"]`);
      if (!cityElement) return;
      cityElement.textContent = await obtenerCiudad(obra);
    });
  }
}

async function renderReports() {
  if (!state.sessionToken || !esRolAdmin(state.userRole)) {
    renderAuthRequired();
    return;
  }

  try {
    cachedReports = await fetchBuildingReports(state.sessionToken);
  } catch {}

  if (reportCount) reportCount.textContent = `${cachedReports.length} incidencias`;
  if (reportBadge) reportBadge.textContent = cachedReports.length;

  if (!cachedReports.length) {
    if (reportList) reportList.innerHTML = '<div class="nearby-empty" style="padding: 24px; text-align: center; color: var(--fg-dim);">No hay reportes de incidencias pendientes.</div>';
    return;
  }

  if (reportList) {
    reportList.innerHTML = cachedReports.map((report) => {
      const obra = state.OBRAS.find((item) => String(item.id) === String(report.building_id));
      const safeTitle = escapeHtml(obra?.nombre_obra || report.Buildings?.nombre_obra || `Obra #${report.building_id}`);
      const safeDesc = escapeHtml(report.descripcion || report.description || 'Sin descripción');
      const safeDate = escapeHtml(new Date(report.created_at).toLocaleString('es-ES'));
      const safeBuildingId = escapeHtml(report.building_id);
      const safeReportId = escapeHtml(report.id);

      return `
        <article class="admin-report">
          <div class="admin-report-copy">
            <strong>${safeTitle}</strong>
            <span style="font-size: 11px; color: var(--fg); margin: 4px 0;">${safeDesc}</span>
            <small style="color: var(--fg-dim); font-size: 9px;">${safeDate}</small>
          </div>
          <div class="admin-report-actions">
            <button type="button" class="btn admin-action-open" data-report-building="${safeBuildingId}">VER OBRA</button>
            <button type="button" class="btn admin-action-review" data-report-id="${safeReportId}" data-report-status="revisado" style="color:var(--accent-2); border-color:var(--accent-2);">REVISADO</button>
            <button type="button" class="btn admin-action-reject" data-report-id="${safeReportId}" data-report-status="descartado">DESCARTAR</button>
          </div>
        </article>
      `;
    }).join('');
  }
}

function calcularEstadoPresencia(lastSeenAt) {
  if (!lastSeenAt) {
    return { isOnline: false, label: 'Sin actividad registrada', shortLabel: 'Desconectado' };
  }
  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 5) {
    return { isOnline: true, label: 'EN LÍNEA AHORA', shortLabel: 'ONLINE' };
  }
  if (diffMin < 60) {
    return { isOnline: false, label: `Última conexión: hace ${diffMin} min`, shortLabel: `hace ${diffMin}m` };
  }
  const diffHoras = Math.floor(diffMin / 60);
  if (diffHoras < 24) {
    return { isOnline: false, label: `Última conexión: hace ${diffHoras} h`, shortLabel: `hace ${diffHoras}h` };
  }
  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias === 1) {
    return { isOnline: false, label: 'Última conexión: ayer', shortLabel: 'ayer' };
  }
  if (diffDias < 7) {
    return { isOnline: false, label: `Última conexión: hace ${diffDias} días`, shortLabel: `hace ${diffDias}d` };
  }
  const fecha = new Date(lastSeenAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return { isOnline: false, label: `Última conexión: ${fecha}`, shortLabel: fecha };
}

async function renderUsers() {
  if (!state.sessionToken || !esRolAdmin(state.userRole)) {
    renderAuthRequired();
    return;
  }

  if (!cachedUsers.length) {
    try {
      cachedUsers = await fetchUserDirectory(state.sessionToken);
    } catch (error) {
      if (userList) userList.innerHTML = `<div class="nearby-empty" style="padding: 20px; text-align: center; color: var(--fg-dim);">${escapeHtml(error.message)}</div>`;
      return;
    }
  }

  const query = (userSearch?.value || '').trim().toLowerCase();
  const filtered = cachedUsers.filter((user) => `${user.first_name || ''} ${user.last_name || ''} ${user.email || ''} ${user.city || ''} ${user.country || ''}`.toLowerCase().includes(query));

  const onlineCount = cachedUsers.filter((u) => {
    if (!u.last_seen_at) return false;
    return (Date.now() - new Date(u.last_seen_at).getTime()) < 5 * 60 * 1000;
  }).length;

  if (userCount) {
    userCount.textContent = `${filtered.length} / ${cachedUsers.length} (${onlineCount} online)`;
  }

  if (!filtered.length) {
    if (userList) userList.innerHTML = '<div class="nearby-empty" style="padding: 24px; text-align: center; color: var(--fg-dim);">No hay usuarios que coincidan con la búsqueda.</div>';
    return;
  }

  if (userList) {
    userList.innerHTML = filtered.map((user) => {
      const safeFirstName = escapeHtml(user.first_name || '');
      const safeLastName = escapeHtml(user.last_name || '');
      const safeFullName = `${safeFirstName} ${safeLastName}`.trim() || 'Usuario registrado';
      const safeEmail = escapeHtml(user.email || 'Email no disponible');
      const safeCity = escapeHtml(user.city || 'Ciudad');
      const safeCountry = escapeHtml(user.country || 'País');
      const safeRole = escapeHtml((user.role || 'user').toUpperCase());
      const presence = calcularEstadoPresencia(user.last_seen_at);
      const safePresenceLabel = escapeHtml(presence.label);

      return `
        <article class="admin-user ${presence.isOnline ? 'user-online' : ''}">
          <div class="admin-user-main">
            <div class="admin-user-heading">
              <span class="admin-presence-indicator ${presence.isOnline ? 'online' : 'offline'}" title="${safePresenceLabel}"></span>
              <strong>${safeFullName}</strong>
              ${presence.isOnline ? '<span class="admin-badge-online">[ ONLINE ]</span>' : ''}
            </div>
            <span>${safeEmail}</span>
            <span>${safeCity} · ${safeCountry}</span>
            <small class="admin-user-presence ${presence.isOnline ? 'online' : ''}">${safePresenceLabel}</small>
          </div>
          <span class="admin-user-role" style="border: 1px solid var(--accent-2); padding: 2px 6px; font-size: 8.5px;">${safeRole}</span>
        </article>
      `;
    }).join('');
  }
}

async function actualizarReporte(id, estado) {
  if (!state.sessionToken || !esRolAdmin(state.userRole)) {
    mostrarAlertaSeguridad('ACCESO RESTRINGIDO', 'Acción reservada a administradores autenticados.');
    return;
  }
  try {
    await updateBuildingReport(id, estado, state.sessionToken);
    await renderReports();
  } catch (error) {
    alert(error.message);
  }
}

function abrirProyectoDesdeReporte(buildingId) {
  const obra = state.OBRAS.find((item) => String(item.id) === String(buildingId));
  if (!obra || !state.map) return;
  state.map.flyTo({ center: obra.coordenadas, zoom: Math.max(state.map.getZoom(), 15) });
  document.dispatchEvent(new CustomEvent('radar:open-building', { detail: { obra } }));
  if (panel) panel.classList.remove('open');
}

function formatearEstadoRevision(status) {
  return status === 'pendiente' ? 'PENDIENTE DE REVISIÓN' : status === 'rechazada' ? 'RECHAZADA' : 'PUBLICADA';
}

async function revisarProyecto(id, estadoRevision) {
  if (!state.sessionToken || !esRolAdmin(state.userRole)) {
    mostrarAlertaSeguridad('ACCESO RESTRINGIDO', 'Acción reservada a administradores autenticados.');
    return;
  }
  const obra = state.OBRAS.find((item) => String(item.id) === String(id));
  if (!obra) return;
  try {
    await reviewBuilding(id, estadoRevision, state.sessionToken);
    obra.estado_revision = estadoRevision;
    actualizarFuenteMapa();
    renderList();
  } catch (error) {
    alert(error.message);
  }
}

function formatearMedia(buildingId) {
  const rating = ratingAverages.get(String(buildingId));
  return rating ? `MEDIA ${rating.average.toFixed(1)} / 5 (${rating.count} ${rating.count === 1 ? 'voto' : 'votos'})` : 'SIN VALORACIONES';
}

async function obtenerCiudad(obra) {
  if (obra.ciudad) return obra.ciudad;
  const coordinates = obra.coordenadas || [];
  if (coordinates.length !== 2 || !coordinates.every(Number.isFinite)) return 'Ubicación no disponible';
  const cacheKey = coordinates.join(',');
  if (cityCache.has(cacheKey)) return cityCache.get(cacheKey);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coordinates[1]}&lon=${coordinates[0]}&zoom=10&addressdetails=1`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await response.json();
    const address = data.address || {};
    const city = address.city || address.town || address.village || address.municipality || address.county || 'Ciudad no disponible';
    cityCache.set(cacheKey, city);
    return city;
  } catch {
    return 'Ciudad no disponible';
  }
}

async function eliminarProyecto(id) {
  if (!state.sessionToken || !esRolAdmin(state.userRole)) {
    mostrarAlertaSeguridad('ACCESO RESTRINGIDO', 'Acción reservada a administradores autenticados.');
    return;
  }
  const obra = state.OBRAS.find((item) => String(item.id) === String(id));
  if (!obra || !window.confirm(`¿Borrar "${obra.nombre_obra}"?`)) return;
  try {
    await deleteBuilding(id, state.sessionToken);
    state.OBRAS = state.OBRAS.filter((item) => String(item.id) !== String(id));
    state.ARQUITECTOS = [...new Set(state.OBRAS.flatMap((item) => separarArquitectos(item.arquitecto)))];
    state.activeArquitectos = new Set([...state.activeArquitectos].filter((architect) => state.ARQUITECTOS.includes(architect)));
    actualizarFuenteMapa();
    generarFiltrosUI();
    renderList();
  } catch (error) {
    alert(error.message);
  }
}
