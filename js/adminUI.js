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
  deleteBuildingReport,
  fetchAllBuildingsForAdmin,
  fetchUserRole,
  updateUserRole
} from './api.js';
import { actualizarFuenteMapa } from './mapData.js';
import { generarFiltrosUI } from './filtersUI.js';

const panel = document.getElementById('admin-panel');
const search = document.getElementById('admin-search');
const reviewFilter = document.getElementById('admin-review-filter');
const sortFilter = document.getElementById('admin-sort-filter');
const count = document.getElementById('admin-count');
const list = document.getElementById('admin-project-list');
const projectsView = document.getElementById('admin-projects-view');
const architectsView = document.getElementById('admin-architects-view');
const architectList = document.getElementById('admin-architect-list');
const architectSearch = document.getElementById('admin-architect-search');
const architectSort = document.getElementById('admin-architect-sort');
const architectCount = document.getElementById('admin-architects-count');
const reportsView = document.getElementById('admin-reports-view');
const reportList = document.getElementById('admin-report-list');
const reportCount = document.getElementById('admin-inbox-count');
const reportBadge = document.getElementById('admin-report-badge');
const reportFilter = document.getElementById('admin-report-filter');
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
const expandedFloatingArqs = new Set();

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
  if (sortFilter) sortFilter.addEventListener('change', renderList);
  if (architectSearch) architectSearch.addEventListener('input', renderArchitects);
  if (architectSort) architectSort.addEventListener('change', renderArchitects);
  if (reportFilter) reportFilter.addEventListener('change', renderReports);
  if (userSearch) userSearch.addEventListener('input', renderUsers);

  document.getElementById('btn-admin-expand-all-arqs')?.addEventListener('click', () => {
    document.querySelectorAll('.admin-floating-arq-item').forEach((el) => {
      el.classList.add('open');
      if (el.dataset.arqKey) expandedFloatingArqs.add(el.dataset.arqKey);
    });
  });
  document.getElementById('btn-admin-collapse-all-arqs')?.addEventListener('click', () => {
    document.querySelectorAll('.admin-floating-arq-item').forEach((el) => el.classList.remove('open'));
    expandedFloatingArqs.clear();
  });

  // Navegación por pestañas del panel
  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-admin-tab]');
    if (!tab) return;
    if (tab.dataset.adminTab === 'users' && !esRolAdmin(state.userRole)) {
      mostrarAlertaSeguridad('ACCESO DENEGADO', 'Se requieren permisos de administrador para consultar usuarios.');
      return;
    }
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

    const mapBtn = event.target.closest('[data-admin-map]');
    if (mapBtn) {
      const obraId = mapBtn.dataset.adminMap;
      const obra = state.OBRAS.find((item) => String(item.id) === String(obraId) || String(item.featureId) === String(obraId));
      if (obra) {
        const coords = (Array.isArray(obra.coordenadas) && obra.coordenadas.length === 2 && !isNaN(obra.coordenadas[0]) && obra.coordenadas[0] !== 0)
          ? obra.coordenadas
          : (obra.longitud && obra.latitud ? [Number(obra.longitud), Number(obra.latitud)] : null);
        if (state.map && coords) {
          state.map.flyTo({ center: coords, zoom: Math.max(state.map.getZoom(), 17) });
        }
        document.dispatchEvent(new CustomEvent('radar:open-building', { detail: { obra } }));
        if (panel) panel.classList.remove('open');
      }
      return;
    }

    const arqHead = event.target.closest('.admin-floating-arq-head');
    const interactiveElem = event.target.closest('button, a');
    if (arqHead && !interactiveElem) {
      const item = arqHead.closest('.admin-floating-arq-item');
      if (item) {
        item.classList.toggle('open');
        const key = item.dataset.arqKey;
        if (item.classList.contains('open')) {
          expandedFloatingArqs.add(key);
        } else {
          expandedFloatingArqs.delete(key);
        }
      }
      return;
    }

    const arqChevron = event.target.closest('.admin-floating-arq-chevron');
    if (arqChevron) {
      const item = arqChevron.closest('.admin-floating-arq-item');
      if (item) {
        item.classList.toggle('open');
        const key = item.dataset.arqKey;
        if (item.classList.contains('open')) {
          expandedFloatingArqs.add(key);
        } else {
          expandedFloatingArqs.delete(key);
        }
      }
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

    const reportDelete = event.target.closest('[data-report-delete]');
    if (reportDelete) {
      eliminarReporte(reportDelete.dataset.reportDelete);
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

  document.addEventListener('radar:data-ready', () => {
    renderList();
    if (currentAdminTab === 'architects') renderArchitects();
  });
  document.addEventListener('radar:buildings-changed', () => {
    renderList();
    if (currentAdminTab === 'architects') renderArchitects();
  });

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
      mostrarAlertaSeguridad('ACCESO DENEGADO', 'Se requieren privilegios de administración para abrir este panel.');
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
    mostrarAlertaSeguridad('AUTENTICACIÓN REQUERIDA', 'Inicia sesión con una cuenta autorizada para acceder a la curaduría.');
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
    btn.classList.toggle('hidden', !isAdmin);
  });
  const userTab = document.querySelector('[data-admin-tab="users"]');
  if (userTab) {
    userTab.classList.toggle('hidden', !isAdmin);
  }
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
      font-family: 'Inter', sans-serif;
      display: flex;
      flex-direction: column;
      gap: 6px;
    `;
    document.body.appendChild(toast);
  }

  toast.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:11px; font-weight:800; color:#E84E1B;">403 // ${escapeHtml(titulo)}</span>
      <button type="button" onclick="this.closest('#admin-security-toast').remove()" style="background:none; border:none; color:#F4F1EA; font-size:12px; cursor:pointer;">✕</button>
    </div>
    <div style="font-size:10px; color:#D5CFC0; line-height:1.4;">${escapeHtml(mensaje)}</div>
  `;

  setTimeout(() => toast?.remove(), 5000);
}

function renderAuthRequired() {
  if (toolbar) toolbar.classList.add('admin-view-hidden');
  if (projectsView) projectsView.classList.remove('admin-view-hidden');
  if (architectsView) architectsView.classList.add('admin-view-hidden');
  if (reportsView) reportsView.classList.add('admin-view-hidden');
  if (usersView) usersView.classList.add('admin-view-hidden');

  if (list) {
    list.innerHTML = `
      <div style="padding: 36px 18px; text-align: center; display: grid; gap: 14px; font-family: 'Inter', sans-serif;">
        <div style="font-size: 28px;"><i data-lucide="shield-alert" width="28" height="28"></i></div>
        <h3 style="font-size: 14px; font-weight: 800; color: var(--accent-2, #EFBC02); margin: 0;">AUTENTICACIÓN REQUERIDA</h3>
        <p style="font-size: 11px; color: var(--fg-dim); line-height: 1.5; margin: 0;">
          Para acceder al panel de administración, revisión de obras, reportes de incidencias y directorio de usuarios, debes identificarte con tu cuenta administradora.
        </p>
        <div>
          <button type="button" id="btn-admin-login-cta" class="filter-action" style="padding: 8px 18px; font-size: 11px; font-weight: 800; color: var(--accent-2, #EFBC02); border: 1.5px solid var(--accent-2, #EFBC02); background: rgba(239, 188, 2, 0.12); cursor: pointer;">INICIAR SESIÓN</button>
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
    const pendingTotal = (cachedReports || []).filter((r) => (r.estado || r.status || 'pendiente') === 'pendiente').length;
    if (reportBadge) reportBadge.textContent = pendingTotal;
    if (reportCount) reportCount.textContent = `${pendingTotal} pendientes`;
  } catch {}

  // 4. Cargar usuarios (solo administradores)
  if (esRolAdmin(state.userRole)) {
    try {
      cachedUsers = await fetchUserDirectory(state.sessionToken);
    } catch {}
  }
}

function renderCurrentTab() {
  if (currentAdminTab === 'users' && !esRolAdmin(state.userRole)) {
    currentAdminTab = 'projects';
    document.querySelectorAll('[data-admin-tab]').forEach((item) => item.classList.toggle('active', item.dataset.adminTab === 'projects'));
  }

  const isProjects = currentAdminTab === 'projects';
  const isArchitects = currentAdminTab === 'architects';
  const isReports = currentAdminTab === 'reports';
  const isUsers = currentAdminTab === 'users';

  if (toolbar) toolbar.classList.toggle('admin-view-hidden', !isProjects);
  if (projectsView) projectsView.classList.toggle('admin-view-hidden', !isProjects);
  if (architectsView) architectsView.classList.toggle('admin-view-hidden', !isArchitects);
  if (reportsView) reportsView.classList.toggle('admin-view-hidden', !isReports);
  if (usersView) usersView.classList.toggle('admin-view-hidden', !isUsers);

  if (isProjects) renderList();
  else if (isArchitects) renderArchitects();
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
  const sortMode = sortFilter?.value || 'recent';

  const allProjects = [...state.OBRAS].sort((a, b) => {
    // 1. Obras pendientes siempre prioritarias al inicio
    if (a.estado_revision === 'pendiente' && b.estado_revision !== 'pendiente') return -1;
    if (b.estado_revision === 'pendiente' && a.estado_revision !== 'pendiente') return 1;

    // 2. Ordenación según el filtro seleccionado
    if (sortMode === 'alpha') {
      return (a.nombre_obra || '').localeCompare(b.nombre_obra || '', 'es', { sensitivity: 'base' });
    }
    const timeA = a.created_at ? new Date(a.created_at).getTime() : (a.updated_at ? new Date(a.updated_at).getTime() : 0);
    const timeB = b.created_at ? new Date(b.created_at).getTime() : (b.updated_at ? new Date(b.updated_at).getTime() : 0);
    if (sortMode === 'oldest') {
      return timeA - timeB;
    }
    // Por defecto: 'recent' (más recientes primero)
    return timeB - timeA;
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
      const rawDate = obra.created_at || obra.updated_at;
      const formattedDate = rawDate ? new Date(rawDate).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

      return `
        <div class="admin-project ${isPending ? 'admin-project-pending' : ''}">
          <div class="admin-project-info">
            <div style="display:flex; align-items:center; gap:6px;">
              <strong>${safeNombre}</strong>
              ${isPending ? '<span style="font-size:9px; font-weight:800; background:var(--accent-2, #EFBC02); color:#141411; padding:1px 4px;">PENDIENTE</span>' : ''}
            </div>
            <span>${safeArquitecto}</span>
            <span class="admin-project-city" data-city-for="${safeFeatureId}">LOCALIZACIÓN...</span>
            ${formattedDate ? `<span style="font-size:9px; color:var(--fg-dim); font-family:monospace;">ALTA: ${escapeHtml(formattedDate)}</span>` : ''}
            <span class="admin-project-rating" style="font-size:9.5px;">${safeRating}</span>
            <span class="admin-project-status ${isPending ? 'pending' : ''}">${safeStatus}</span>
          </div>
          <div class="admin-project-actions">
            <button type="button" class="btn admin-action-map" data-admin-map="${safeId}" title="Ir a la obra en el mapa">IR AL MAPA</button>
            <button type="button" class="btn admin-action-edit" data-admin-edit="${safeId}" title="Editar ficha de obra">EDITAR</button>
            ${isPending ? `
              <button type="button" class="btn admin-action-approve" data-admin-review="${safeId}" data-review-status="publicada">APROBAR</button>
              <button type="button" class="btn admin-action-reject" data-admin-review="${safeId}" data-review-status="rechazada">RECHAZAR</button>
            ` : ''}
            ${esRolAdmin(state.userRole) ? `
              <button type="button" class="btn admin-action-delete" data-admin-delete="${safeId}" title="Eliminar del catálogo">BORRAR</button>
            ` : ''}
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

async function renderArchitects() {
  if (!state.sessionToken || !esRolAdmin(state.userRole)) {
    renderAuthRequired();
    return;
  }

  const searchVal = (architectSearch?.value || '').trim().toLowerCase();
  const filterSort = architectSort?.value || 'count-desc';

  // 1. Agrupación de obras por arquitecto
  const architectMap = new Map();

  for (const obra of state.OBRAS) {
    const rawNames = separarArquitectos(obra.arquitecto);
    const names = rawNames.length > 0 ? rawNames : ['Sin arquitecto asignado'];

    for (const name of names) {
      const trimmedName = name.trim();
      const normKey = trimmedName.toLowerCase();

      if (!architectMap.has(normKey)) {
        architectMap.set(normKey, {
          key: normKey,
          name: trimmedName,
          works: [],
          cities: new Set(),
          years: [],
          pendingCount: 0,
          publishedCount: 0,
          rejectedCount: 0,
        });
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

  let arqList = Array.from(architectMap.values());

  // 2. Filtrado por búsqueda (nombre de arquitecto, ciudad o título de obra)
  if (searchVal) {
    arqList = arqList.filter((item) => {
      const nameMatch = item.name.toLowerCase().includes(searchVal);
      const cityMatch = Array.from(item.cities).some((c) => c.toLowerCase().includes(searchVal));
      const workMatch = item.works.some((w) => (w.nombre_obra || '').toLowerCase().includes(searchVal));
      return nameMatch || cityMatch || workMatch;
    });
  }

  // 3. Ordenación
  arqList.sort((a, b) => {
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

  // 4. Conteo de obras y arquitectos
  const totalWorksListed = arqList.reduce((acc, curr) => acc + curr.works.length, 0);
  if (architectCount) {
    architectCount.textContent = `${arqList.length} ARQS · ${totalWorksListed} OBRAS`;
  }

  if (!architectList) return;

  if (!arqList.length) {
    architectList.innerHTML = '<div class="nearby-empty" style="padding: 24px; text-align: center; color: var(--fg-dim);">No hay arquitectos que coincidan con la búsqueda.</div>';
    return;
  }

  const autoExpand = Boolean(searchVal);

  architectList.innerHTML = arqList.map((item) => {
    const isExpanded = autoExpand || expandedFloatingArqs.has(item.key);
    const minYear = item.years.length ? Math.min(...item.years) : null;
    const maxYear = item.years.length ? Math.max(...item.years) : null;
    const period = minYear ? (minYear === maxYear ? `${minYear}` : `${minYear} — ${maxYear}`) : '';
    const citiesArray = Array.from(item.cities);
    const citiesStr = citiesArray.slice(0, 3).join(', ');
    const moreCities = citiesArray.length > 3 ? ` +${citiesArray.length - 3}` : '';
    const safeKey = escapeHtml(item.key);
    const safeName = escapeHtml(item.name);

    return `
      <article class="admin-floating-arq-item ${isExpanded ? 'open' : ''} ${item.pendingCount > 0 ? 'has-pending' : ''}" data-arq-key="${safeKey}">
        <header class="admin-floating-arq-head" title="Pulsar para desplegar obras de ${safeName}">
          <div style="display:flex; flex-direction:column; gap:2px; min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <strong style="font-size:11px; font-weight:800; color:var(--fg);">${safeName}</strong>
              <span style="font-size:9px; font-weight:800; background:var(--accent); color:#ffffff; padding:1px 5px; border-radius:2px;">
                ${item.works.length} ${item.works.length === 1 ? 'OBRA' : 'OBRAS'}
              </span>
              ${item.pendingCount > 0 ? `
                <span style="font-size:8.5px; font-weight:800; background:var(--accent-2, #EFBC02); color:#141411; padding:1px 5px; border-radius:2px;">${item.pendingCount} PENDIENTE${item.pendingCount > 1 ? 'S' : ''}</span>
              ` : ''}
              ${item.publishedCount > 0 ? `
                <span style="font-size:8.5px; font-weight:700; background:var(--bg-raised); color:var(--fg-dim); padding:1px 5px; border:1px solid var(--border);">${item.publishedCount} PUB</span>
              ` : ''}
            </div>
            <div style="font-size:9.5px; color:var(--fg-dim); display:flex; gap:6px; flex-wrap:wrap;">
              ${period ? `<span>${escapeHtml(period)}</span>` : ''}
              ${period && citiesStr ? `<span>·</span>` : ''}
              ${citiesStr ? `<span>${escapeHtml(citiesStr)}${escapeHtml(moreCities)}</span>` : ''}
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            <span class="admin-floating-arq-chevron" style="color:var(--fg-dim);">▼</span>
          </div>
        </header>

        <div class="admin-floating-arq-works">
          ${item.works.map((obra) => {
            const safeId = escapeHtml(obra.id);
            const title = escapeHtml(obra.nombre_obra || 'Sin título');
            const year = obra.año_construccion ? escapeHtml(obra.año_construccion) : null;
            const place = obra.place ? escapeHtml(obra.place) : '';
            const isPending = obra.estado_revision === 'pendiente';

            return `
              <div class="admin-floating-work-row ${isPending ? 'pending' : ''}">
                <div style="min-width:0; flex:1;">
                  <div style="display:flex; align-items:center; gap:5px;">
                    <span style="font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${title}">${title}</span>
                    ${isPending ? '<span style="font-size:8px; font-weight:800; background:var(--accent-2, #EFBC02); color:#141411; padding:0 3px;">PENDIENTE</span>' : ''}
                  </div>
                  <div style="color:var(--fg-dim); font-size:9px;">
                    ${year ? `<span>${year}</span>` : ''}
                    ${year && place ? `<span> · </span>` : ''}
                    ${place ? `<span>${place}</span>` : ''}
                  </div>
                </div>
                <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                  <button type="button" class="btn admin-action-map" data-admin-map="${safeId}" style="padding:2px 6px; font-size:9px;" title="Ir a la obra en el mapa">IR AL MAPA</button>
                  <button type="button" class="btn admin-action-edit" data-admin-edit="${safeId}" style="padding:2px 6px; font-size:9px;" title="Editar obra">EDITAR</button>
                  ${isPending ? `
                    <button type="button" class="btn admin-action-approve" data-admin-review="${safeId}" data-review-status="publicada" style="padding:2px 5px; font-size:8.5px;" title="Aprobar obra">APROBAR</button>
                    <button type="button" class="btn admin-action-reject" data-admin-review="${safeId}" data-review-status="rechazada" style="padding:2px 5px; font-size:8.5px;" title="Rechazar obra">RECHAZAR</button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </article>
    `;
  }).join('');
}

async function renderReports() {
  if (!state.sessionToken || !esRolAdmin(state.userRole)) {
    renderAuthRequired();
    return;
  }

  try {
    cachedReports = await fetchBuildingReports(state.sessionToken);
  } catch {}

  const pendingTotal = (cachedReports || []).filter((r) => (r.estado || r.status || 'pendiente') === 'pendiente').length;
  if (reportCount) reportCount.textContent = `${pendingTotal} pendientes`;
  if (reportBadge) reportBadge.textContent = pendingTotal;

  const currentFilter = reportFilter?.value || 'pendiente';
  const filteredReports = currentFilter === 'todos'
    ? cachedReports
    : cachedReports.filter((r) => (r.estado || r.status || 'pendiente') === currentFilter);

  if (!filteredReports.length) {
    if (reportList) {
      reportList.innerHTML = `<div class="nearby-empty" style="padding: 24px; text-align: center; color: var(--fg-dim);">No hay reportes con el estado "${escapeHtml(currentFilter.toUpperCase())}".</div>`;
    }
    return;
  }

  if (reportList) {
    reportList.innerHTML = filteredReports.map((report) => {
      const obra = state.OBRAS.find((item) => String(item.id) === String(report.building_id));
      const safeTitle = escapeHtml(obra?.nombre_obra || report.Buildings?.nombre_obra || `Obra #${report.building_id}`);
      const safeDesc = escapeHtml(report.descripcion || report.description || 'Sin descripción');
      const safeDate = escapeHtml(new Date(report.created_at).toLocaleString('es-ES'));
      const safeBuildingId = escapeHtml(report.building_id);
      const safeReportId = escapeHtml(report.id);
      const status = report.estado || report.status || 'pendiente';
      const isPending = status === 'pendiente';
      const statusColor = status === 'revisado' ? '#008844' : status === 'descartado' ? 'var(--fg-dim)' : 'var(--accent-2, #EFBC02)';

      return `
        <article class="admin-report">
          <div class="admin-report-copy">
            <div style="display:flex; align-items:center; gap:6px;">
              <strong>${safeTitle}</strong>
              <span style="font-size:8.5px; font-weight:800; padding:1px 5px; border:1px solid ${statusColor}; color:${statusColor}; font-family:monospace;">${escapeHtml(status.toUpperCase())}</span>
            </div>
            <span style="font-size: 11px; color: var(--fg); margin: 4px 0;">${safeDesc}</span>
            <small style="color: var(--fg-dim); font-size: 9px;">${safeDate}</small>
          </div>
          <div class="admin-report-actions">
            <button type="button" class="btn admin-action-open" data-report-building="${safeBuildingId}">VER OBRA</button>
            ${isPending ? `
              <button type="button" class="btn admin-action-review" data-report-id="${safeReportId}" data-report-status="revisado" style="color:var(--accent-2); border-color:var(--accent-2);">REVISADO</button>
              <button type="button" class="btn admin-action-reject" data-report-id="${safeReportId}" data-report-status="descartado">DESCARTAR</button>
            ` : ''}
            ${esRolAdmin(state.userRole) ? `
              <button type="button" class="btn admin-action-delete" data-report-delete="${safeReportId}" title="Eliminar reporte permanentemente">BORRAR</button>
            ` : ''}
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
    return (Date.now() - new Date(u.last_seen_at).getTime()) < 30 * 60 * 1000;
  }).length;

  if (userCount) {
    userCount.textContent = `${filtered.length} / ${cachedUsers.length} (${onlineCount} online)`;
  }

  if (!filtered.length) {
    if (userList) userList.innerHTML = '<div class="nearby-empty" style="padding: 24px; text-align: center; color: var(--fg-dim);">No hay usuarios que coincidan con la búsqueda.</div>';
    return;
  }

  if (userList) {
    const canManageRoles = esRolAdmin(state.userRole);
    userList.innerHTML = filtered.map((user) => {
      const safeFirstName = escapeHtml(user.first_name || '');
      const safeLastName = escapeHtml(user.last_name || '');
      const safeFullName = `${safeFirstName} ${safeLastName}`.trim() || 'Usuario registrado';
      const safeEmail = escapeHtml(user.email || 'Email no disponible');
      const safeCity = escapeHtml(user.city || 'Ciudad');
      const safeCountry = escapeHtml(user.country || 'País');
      const userRole = String(user.role || 'user').toLowerCase();
      const safeRole = escapeHtml(userRole.toUpperCase());
      const presence = calcularEstadoPresencia(user.last_seen_at);
      const safePresenceLabel = escapeHtml(presence.label);

      return `
        <article class="admin-user ${presence.isOnline ? 'user-online' : ''}">
          <div class="admin-user-main">
            <div class="admin-user-heading">
              <span class="admin-presence-indicator ${presence.isOnline ? 'online' : 'offline'}" title="${safePresenceLabel}"></span>
              <strong>${safeFullName}</strong>
              ${presence.isOnline ? '<span class="admin-badge-online">ONLINE</span>' : ''}
            </div>
            <span>${safeEmail}</span>
            <span>${safeCity} · ${safeCountry}</span>
            <small class="admin-user-presence ${presence.isOnline ? 'online' : ''}">${safePresenceLabel}</small>
          </div>
          ${canManageRoles ? `
            <select class="admin-user-role-select tech-input" data-user-id="${escapeHtml(user.id)}">
              <option value="user" ${userRole === 'user' ? 'selected' : ''}>USER</option>
              <option value="editor" ${userRole === 'editor' ? 'selected' : ''}>EDITOR</option>
              <option value="admin" ${userRole === 'admin' ? 'selected' : ''}>ADMIN</option>
              <option value="superadmin" ${userRole === 'superadmin' ? 'selected' : ''}>SUPERADMIN</option>
            </select>
          ` : `
            <span class="admin-user-role" style="border: 1px solid var(--accent); padding: 2px 6px; font-size: 8.5px;">${safeRole}</span>
          `}
        </article>
      `;
    }).join('');

    if (canManageRoles) {
      userList.querySelectorAll('.admin-user-role-select').forEach((select) => {
        select.addEventListener('change', async () => {
          const targetId = select.dataset.userId;
          const nextRole = select.value;
          try {
            await updateUserRole(targetId, nextRole, state.sessionToken);
            const found = cachedUsers.find((u) => String(u.id) === String(targetId));
            if (found) found.role = nextRole;
            mostrarAlertaSeguridad('ROL ACTUALIZADO', `El rol del usuario ha sido actualizado a ${nextRole.toUpperCase()}.`);
          } catch (err) {
            mostrarAlertaSeguridad('ERROR AL ACTUALIZAR ROL', err.message);
            renderUsers();
          }
        });
      });
    }
  }
}

async function actualizarReporte(id, estado) {
  if (!state.sessionToken || !esRolAdmin(state.userRole)) {
    mostrarAlertaSeguridad('ACCESO RESTRINGIDO', 'Acción reservada a administradores autenticados.');
    return;
  }
  try {
    await updateBuildingReport(id, estado, state.sessionToken);
    const found = cachedReports.find((r) => String(r.id) === String(id));
    if (found) {
      found.estado = estado;
      found.status = estado;
    }
    const pendingTotal = (cachedReports || []).filter((r) => (r.estado || r.status || 'pendiente') === 'pendiente').length;
    if (reportBadge) reportBadge.textContent = pendingTotal;
    if (reportCount) reportCount.textContent = `${pendingTotal} pendientes`;
    renderReports();
    mostrarAlertaSeguridad('INCIDENCIA ACTUALIZADA', `Reporte marcado como ${estado.toUpperCase()}.`);
  } catch (error) {
    mostrarAlertaSeguridad('ERROR', error.message);
  }
}

async function eliminarReporte(id) {
  if (!state.sessionToken || !esRolAdmin(state.userRole)) {
    mostrarAlertaSeguridad('ACCESO DENEGADO', 'Se requieren privilegios de administrador para eliminar reportes.');
    return;
  }
  if (!window.confirm('¿Eliminar definitivamente este reporte de incidencia de la base de datos?')) return;
  try {
    await deleteBuildingReport(id, state.sessionToken);
    cachedReports = cachedReports.filter((r) => String(r.id) !== String(id));
    const pendingTotal = (cachedReports || []).filter((r) => (r.estado || r.status || 'pendiente') === 'pendiente').length;
    if (reportBadge) reportBadge.textContent = pendingTotal;
    if (reportCount) reportCount.textContent = `${pendingTotal} pendientes`;
    renderReports();
    mostrarAlertaSeguridad('REPORTE ELIMINADO', 'El reporte ha sido eliminado permanentemente.');
  } catch (error) {
    mostrarAlertaSeguridad('ERROR', error.message);
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
    if (currentAdminTab === 'architects') renderArchitects();
    mostrarAlertaSeguridad('CURADURÍA', `Obra "${obra.nombre_obra}" marcada como ${estadoRevision === 'publicada' ? 'PUBLICADA' : 'RECHAZADA'}.`);
  } catch (error) {
    mostrarAlertaSeguridad('ERROR', error.message);
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
    mostrarAlertaSeguridad('ACCESO DENEGADO', 'El rol de editor no tiene permisos para eliminar obras.');
    return;
  }
  const obra = state.OBRAS.find((item) => String(item.id) === String(id));
  if (!obra || !window.confirm(`¿Borrar definitivamente "${obra.nombre_obra}" de la base de datos?`)) return;
  try {
    await deleteBuilding(id, state.sessionToken);
    state.OBRAS = state.OBRAS.filter((item) => String(item.id) !== String(id));
    state.ARQUITECTOS = [...new Set(state.OBRAS.flatMap((item) => separarArquitectos(item.arquitecto)))];
    state.activeArquitectos = new Set([...state.activeArquitectos].filter((architect) => state.ARQUITECTOS.includes(architect)));
    actualizarFuenteMapa();
    generarFiltrosUI();
    renderList();
    if (currentAdminTab === 'architects') renderArchitects();
    mostrarAlertaSeguridad('OBRA ELIMINADA', `La obra "${obra.nombre_obra}" ha sido eliminada del catálogo.`);
  } catch (error) {
    mostrarAlertaSeguridad('ERROR', error.message);
  }
}
