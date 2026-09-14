/* =========================================================================
   ADMINUI.JS — Panel de administración para gestión de obras, reportes y usuarios
   Arquitectura Serverless Blindada + Frontend Vanilla Neo-Bauhaus
   ========================================================================= */

import { state, separarArquitectos, esRolAdmin, escapeHtml, formatearImportancia, transformarEdificio, dedupeBuildings, CATEGORY_META, formatCategoria, normalizarCategoria } from './state.js';
import { getOptimizedPhotoUrl } from './imageProxy.js';
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
  updateUserRole,
  getBuildingsCatalog
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
const importanceFilter = document.getElementById('admin-importance-filter');
const categoryFilter = document.getElementById('admin-category-filter');
const auditFilter = document.getElementById('admin-audit-filter');
const cityFilter = document.getElementById('admin-city-filter');
const clearSearchBtn = document.getElementById('btn-admin-clear-search');
const resetFiltersBtn = document.getElementById('btn-admin-reset-filters');
const viewDensityBtn = document.getElementById('btn-admin-view-density');
const densityLabel = document.getElementById('admin-density-label');
const kpiBar = document.getElementById('admin-kpi-bar');

const cityCache = new Map();
let ratingAverages = new Map();
let cachedReports = [];
let cachedUsers = [];
let currentAdminTab = 'projects';
let visibleProjectsCount = 50;
let visibleArchitectsCount = 60;
const expandedFloatingArqs = new Set();
let isTogglingAdmin = false;
let searchDebounceTimer = null;
let archSearchDebounceTimer = null;
let dynamicOptionsInitialized = false;
let activeAdminObraId = null;

const adminFiltersState = {
  kpi: 'all',
};

function cleanDiacritics(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function buildObraCorpus(obra) {
  const parts = [
    obra.nombre_obra,
    obra.arquitecto,
    obra.ciudad,
    obra.municipio,
    obra.place,
    obra.pais,
    obra.categoria,
    obra.estilo,
    obra.año_construccion,
    obra.year,
    obra.id,
    obra.featureId,
    obra.descripcion
  ];
  return cleanDiacritics(parts.filter(Boolean).join(' '));
}

function formatAdminImpBadge(impVal) {
  const imp = Number(impVal);
  if (imp === 0) return { level: 0, label: 'HITO // L0', title: 'Nivel 0: Obra Cumbre (Hito Arquitectónico)' };
  if (imp === 1) return { level: 1, label: 'L1', title: 'Nivel 1: Imprescindible' };
  if (imp === 2) return { level: 2, label: 'L2', title: 'Nivel 2: Recomendada' };
  return { level: 3, label: 'L3', title: 'Nivel 3: Documentada' };
}

function getAdminButtons() {
  return [
    document.getElementById('btn-admin-panel'),
    document.getElementById('btn-float-admin'),
    document.getElementById('btn-mobile-admin'),
    document.getElementById('btn-admin-float'),
  ].filter(Boolean);
}

export function initAdminUI() {
  // Router Global por Hash (#admin)
  window.addEventListener('hashchange', handleAdminHashRoute);
  if (window.location.hash === '#admin') {
    setTimeout(handleAdminHashRoute, 100);
  }

  if (search) {
    search.addEventListener('input', () => {
      if (clearSearchBtn) clearSearchBtn.classList.toggle('hidden', !search.value.trim());
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        visibleProjectsCount = 50;
        renderList();
      }, 150);
    });
  }
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (search) search.value = '';
      clearSearchBtn.classList.add('hidden');
      visibleProjectsCount = 50;
      renderList();
      search?.focus();
    });
  }
  if (reviewFilter) {
    reviewFilter.addEventListener('change', () => {
      visibleProjectsCount = 50;
      renderList();
      actualizarFuenteMapa();
    });
  }
  [importanceFilter, categoryFilter, auditFilter, cityFilter].forEach((selectEl) => {
    selectEl?.addEventListener('change', () => {
      visibleProjectsCount = 50;
      renderList();
    });
  });
  if (sortFilter) {
    sortFilter.addEventListener('change', () => {
      visibleProjectsCount = 50;
      renderList();
    });
  }
  if (kpiBar) {
    kpiBar.addEventListener('click', (event) => {
      const pill = event.target.closest('.admin-kpi-pill');
      if (!pill) return;
      const targetKpi = pill.dataset.kpiFilter || 'all';
      if (adminFiltersState.kpi === targetKpi && targetKpi !== 'all') {
        adminFiltersState.kpi = 'all';
      } else {
        adminFiltersState.kpi = targetKpi;
      }
      kpiBar.querySelectorAll('.admin-kpi-pill').forEach((p) => {
        p.classList.toggle('active', (p.dataset.kpiFilter || 'all') === adminFiltersState.kpi);
      });
      visibleProjectsCount = 50;
      renderList();
    });
  }
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', () => {
      if (search) search.value = '';
      if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
      if (reviewFilter) reviewFilter.value = '';
      if (importanceFilter) importanceFilter.value = '';
      if (categoryFilter) categoryFilter.value = '';
      if (auditFilter) auditFilter.value = '';
      if (cityFilter) cityFilter.value = '';
      if (sortFilter) sortFilter.value = 'recent';
      adminFiltersState.kpi = 'all';
      if (kpiBar) {
        kpiBar.querySelectorAll('.admin-kpi-pill').forEach((p) => {
          p.classList.toggle('active', (p.dataset.kpiFilter || 'all') === 'all');
        });
      }
      visibleProjectsCount = 50;
      renderList();
    });
  }
  if (viewDensityBtn) {
    viewDensityBtn.addEventListener('click', () => {
      if (!panel) return;
      const isCompact = panel.classList.toggle('density-compact');
      if (densityLabel) densityLabel.textContent = isCompact ? 'DETALLADA' : 'COMPACTA';
    });
  }
  if (architectSearch) {
    architectSearch.addEventListener('input', () => {
      clearTimeout(archSearchDebounceTimer);
      archSearchDebounceTimer = setTimeout(() => {
        visibleArchitectsCount = 60;
        renderArchitects();
      }, 150);
    });
  }
  if (architectSort) {
    architectSort.addEventListener('change', () => {
      visibleArchitectsCount = 60;
      renderArchitects();
    });
  }
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
    const cardBody = event.target.closest('.admin-project-body');
    const isActionClick = Boolean(event.target.closest('.admin-project-actions'));

    if ((mapBtn || cardBody) && !isActionClick) {
      const target = mapBtn || cardBody;
      const obraId = target.dataset.adminMap || target.closest('.admin-project')?.dataset.adminCardId;
      const obra = state.OBRAS.find((item) => String(item.id) === String(obraId) || String(item.featureId) === String(obraId));
      if (obra) {
        marcarProyectoActivo(obra.id);
        const coords = (Array.isArray(obra.coordenadas) && obra.coordenadas.length === 2 && !isNaN(obra.coordenadas[0]) && obra.coordenadas[0] !== 0)
          ? obra.coordenadas
          : (obra.longitud && obra.latitud ? [Number(obra.longitud), Number(obra.latitud)] : null);
        if (state.map && coords) {
          const isDesktop = window.innerWidth >= 1024;
          state.map.flyTo({
            center: coords,
            zoom: Math.max(state.map.getZoom(), 17),
            padding: isDesktop ? { left: 450, right: 0, top: 0, bottom: 0 } : { left: 0, right: 0, top: 0, bottom: 0 }
          });
        }
        document.dispatchEvent(new CustomEvent('radar:open-building', { detail: { obra } }));
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

    const loadMoreProjects = event.target.closest('#btn-admin-load-more-projects');
    if (loadMoreProjects) {
      visibleProjectsCount += 50;
      renderList();
      return;
    }

    const loadMoreArqs = event.target.closest('#btn-admin-load-more-arqs');
    if (loadMoreArqs) {
      visibleArchitectsCount += 60;
      renderArchitects();
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

  // Atajos de teclado: Escape para cerrar, Alt + A para alternar panel admin
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel?.classList.contains('open')) {
      e.preventDefault();
      toggleAdminPanel(false);
      return;
    }
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
  if (isTogglingAdmin) return;

  const isCurrentlyOpen = panel.classList.contains('open');
  const shouldOpen = forceOpen !== null ? forceOpen : !isCurrentlyOpen;

  // Evitar re-ejecución si ya está en el estado deseado
  if (shouldOpen === isCurrentlyOpen) return;

  isTogglingAdmin = true;
  try {
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

      // 1. Renderizado instantáneo y fluido con datos actuales en memoria
      renderCurrentTab();

      // 2. Sincronización en segundo plano sin congelar la animación ni la interfaz
      syncAllAdminData().then(() => {
        if (panel.classList.contains('open')) {
          renderCurrentTab();
        }
      }).catch((err) => {
        console.warn('Aviso sincronizando datos de administración en segundo plano:', err);
      });
    } else {
      panel.classList.remove('open');
      getAdminButtons().forEach((b) => b.classList.remove('active-state'));
    }
  } finally {
    setTimeout(() => {
      isTogglingAdmin = false;
    }, 120);
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

  // 1. Cargar obras completas: catálogo global (10.000+) + obras administrativas (pendientes/rechazadas)
  try {
    const [catalogoRaw, adminObras] = await Promise.all([
      getBuildingsCatalog().catch(() => []),
      fetchAllBuildingsForAdmin(state.sessionToken).catch(() => []),
    ]);

    const mapaObras = new Map(state.OBRAS.map((o) => [String(o.id), o]));

    if (Array.isArray(catalogoRaw) && catalogoRaw.length > 0) {
      catalogoRaw.forEach((fila, idx) => {
        const idStr = String(fila.id);
        const anterior = mapaObras.get(idStr);
        const transformado = transformarEdificio(fila, idx);
        mapaObras.set(idStr, {
          ...transformado,
          selected: anterior ? anterior.selected : false,
        });
      });
    }

    if (Array.isArray(adminObras) && adminObras.length > 0) {
      adminObras.forEach((obra) => {
        const idStr = String(obra.id);
        const anterior = mapaObras.get(idStr);
        const transformado = transformarEdificio(obra, 0);
        mapaObras.set(idStr, {
          ...(anterior || {}),
          ...transformado,
          estado_revision: obra.estado_revision || transformado.estado_revision || 'publicada',
        });
      });
    }

    state.OBRAS = dedupeBuildings(Array.from(mapaObras.values()));
  } catch (err) {
    console.warn('Aviso sincronizando catálogo completo en panel admin:', err);
  }

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

function marcarProyectoActivo(obraId) {
  activeAdminObraId = obraId ? String(obraId) : null;
  if (!list) return;
  list.querySelectorAll('.admin-project').forEach((card) => {
    card.classList.toggle('admin-project-active', card.dataset.adminCardId === activeAdminObraId);
  });
}

function updateAdminKpis(allProjects) {
  if (!allProjects) return;
  let pendingCount = 0;
  let publishedCount = 0;
  let rejectedCount = 0;
  let noPhotoCount = 0;
  let noArqCount = 0;

  for (let i = 0; i < allProjects.length; i++) {
    const o = allProjects[i];
    const st = o.estado_revision || 'publicada';
    if (st === 'pendiente') pendingCount++;
    else if (st === 'rechazada') rejectedCount++;
    else publishedCount++;

    const hasPhoto = Boolean(o.foto || o.foto_url || o.imagen || (Array.isArray(o.fotos) && o.fotos.length > 0));
    if (!hasPhoto) noPhotoCount++;

    const arq = String(o.arquitecto || '').trim().toLowerCase();
    if (!arq || arq === 'sin arquitecto' || arq === 'desconocido' || arq === 'anónimo' || arq === 'anonimo') {
      noArqCount++;
    }
  }

  const elAll = document.getElementById('kpi-count-all');
  const elPending = document.getElementById('kpi-count-pending');
  const elPublished = document.getElementById('kpi-count-published');
  const elRejected = document.getElementById('kpi-count-rejected');
  const elNoPhoto = document.getElementById('kpi-count-no-photo');
  const elNoArq = document.getElementById('kpi-count-no-arq');

  if (elAll) elAll.textContent = allProjects.length;
  if (elPending) elPending.textContent = pendingCount;
  if (elPublished) elPublished.textContent = publishedCount;
  if (elRejected) elRejected.textContent = rejectedCount;
  if (elNoPhoto) elNoPhoto.textContent = noPhotoCount;
  if (elNoArq) elNoArq.textContent = noArqCount;
}

function initAdminDynamicOptions() {
  if (!state.OBRAS || state.OBRAS.length === 0) return;

  // 1. Opciones dinámicas de Categoría desde CATEGORY_META
  if (categoryFilter && categoryFilter.options.length <= 1) {
    const currentVal = categoryFilter.value;
    const catEntries = Object.entries(CATEGORY_META);
    categoryFilter.innerHTML = '<option value="">CATEGORÍA: TODAS</option>' +
      catEntries.map(([key, meta]) => `<option value="${escapeHtml(key)}">${escapeHtml((meta.label || key).toUpperCase())}</option>`).join('');
    if (currentVal) categoryFilter.value = currentVal;
  }

  // 2. Opciones dinámicas de Ciudades con recuento de obras
  if (cityFilter && (cityFilter.options.length <= 1 || !dynamicOptionsInitialized)) {
    const currentVal = cityFilter.value;
    const cityCounts = new Map();
    for (let i = 0; i < state.OBRAS.length; i++) {
      const o = state.OBRAS[i];
      const c = (o.ciudad || o.place || o.municipio || '').trim();
      if (c && c !== 'Ubicación no disponible' && c !== 'LOCALIZACIÓN...') {
        cityCounts.set(c, (cityCounts.get(c) || 0) + 1);
      }
    }
    const topCities = Array.from(cityCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 45);

    cityFilter.innerHTML = '<option value="">CIUDAD: TODAS</option>' +
      topCities.map(([c, cnt]) => `<option value="${escapeHtml(c)}">${escapeHtml(c.toUpperCase())} (${cnt})</option>`).join('');
    if (currentVal) cityFilter.value = currentVal;
  }

  dynamicOptionsInitialized = true;
}

async function renderList() {
  if (!state.sessionToken || !esRolAdmin(state.userRole)) {
    renderAuthRequired();
    return;
  }

  initAdminDynamicOptions();

  const allProjects = state.OBRAS || [];
  updateAdminKpis(allProjects);

  const queryClean = cleanDiacritics(search?.value || '');
  const queryTokens = queryClean.split(/\s+/).filter(Boolean);
  const revFilterVal = reviewFilter?.value || '';
  const impFilterVal = importanceFilter?.value ?? '';
  const catFilterVal = categoryFilter?.value || '';
  const auditFilterVal = auditFilter?.value || '';
  const cityFilterVal = (cityFilter?.value || '').toLowerCase().trim();
  const sortMode = sortFilter?.value || 'recent';

  let filtered = allProjects.filter((obra) => {
    // A. Filtro KPI
    if (adminFiltersState.kpi === 'pending') {
      if (obra.estado_revision !== 'pendiente') return false;
    } else if (adminFiltersState.kpi === 'published') {
      if ((obra.estado_revision || 'publicada') !== 'publicada') return false;
    } else if (adminFiltersState.kpi === 'rejected') {
      if (obra.estado_revision !== 'rechazada') return false;
    } else if (adminFiltersState.kpi === 'no-photo') {
      const hasPhoto = Boolean(obra.foto || obra.foto_url || obra.imagen || (Array.isArray(obra.fotos) && obra.fotos.length > 0));
      if (hasPhoto) return false;
    } else if (adminFiltersState.kpi === 'no-arq') {
      const arq = String(obra.arquitecto || '').trim().toLowerCase();
      const isUnknown = !arq || arq === 'sin arquitecto' || arq === 'desconocido' || arq === 'anónimo' || arq === 'anonimo';
      if (!isUnknown) return false;
    }

    // B. Búsqueda multi-término insensible a diacríticos y orden
    if (queryTokens.length > 0) {
      const corpus = buildObraCorpus(obra);
      const matchesAll = queryTokens.every((token) => corpus.includes(token));
      if (!matchesAll) return false;
    }

    // C. Filtro de Estado de Revisión
    if (revFilterVal) {
      if (revFilterVal === 'privada') {
        const isPriv = Boolean(obra.is_personal || obra.is_private || obra.source === 'personal' || obra.origin_source === 'user');
        if (!isPriv) return false;
      } else {
        const st = obra.estado_revision || 'publicada';
        if (st !== revFilterVal) return false;
      }
    }

    // D. Filtro de Jerarquía / Importancia
    if (impFilterVal !== '') {
      if (String(obra.importancia ?? '') !== String(impFilterVal)) return false;
    }

    // E. Filtro de Categoría
    if (catFilterVal) {
      if (String(obra.categoria || '').toLowerCase().trim() !== catFilterVal.toLowerCase().trim()) return false;
    }

    // F. Filtro de Auditoría
    if (auditFilterVal) {
      const hasPhoto = Boolean(obra.foto || obra.foto_url || obra.imagen || (Array.isArray(obra.fotos) && obra.fotos.length > 0));
      const arq = String(obra.arquitecto || '').trim().toLowerCase();
      const hasArq = Boolean(arq && arq !== 'sin arquitecto' && arq !== 'desconocido' && arq !== 'anónimo' && arq !== 'anonimo');
      const year = obra.año_construccion || obra.year;
      const hasYear = Boolean(year && !isNaN(parseInt(year, 10)) && parseInt(year, 10) > 0);
      const coords = obra.coordenadas;
      const hasCoords = Array.isArray(coords) && coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1]) && coords[0] !== 0 && coords[1] !== 0;

      if (auditFilterVal === 'sin-foto' && hasPhoto) return false;
      if (auditFilterVal === 'con-foto' && !hasPhoto) return false;
      if (auditFilterVal === 'sin-arquitecto' && hasArq) return false;
      if (auditFilterVal === 'sin-ano' && hasYear) return false;
      if (auditFilterVal === 'sin-coords' && hasCoords) return false;
    }

    // G. Filtro de Ciudad
    if (cityFilterVal) {
      const c = (obra.ciudad || obra.place || obra.municipio || '').toLowerCase().trim();
      if (c !== cityFilterVal) return false;
    }

    return true;
  });

  // Ordenación de resultados
  filtered.sort((a, b) => {
    // Pendientes prioritarias al inicio a menos que se use ordenación específica
    if (a.estado_revision === 'pendiente' && b.estado_revision !== 'pendiente') return -1;
    if (b.estado_revision === 'pendiente' && a.estado_revision !== 'pendiente') return 1;

    if (sortMode === 'alpha') {
      return (a.nombre_obra || '').localeCompare(b.nombre_obra || '', 'es', { sensitivity: 'base' });
    }
    if (sortMode === 'alpha-desc') {
      return (b.nombre_obra || '').localeCompare(a.nombre_obra || '', 'es', { sensitivity: 'base' });
    }
    if (sortMode === 'imp-desc') {
      const impA = a.importancia !== undefined && a.importancia !== null ? Number(a.importancia) : 3;
      const impB = b.importancia !== undefined && b.importancia !== null ? Number(b.importancia) : 3;
      if (impA !== impB) return impA - impB;
      return (a.nombre_obra || '').localeCompare(b.nombre_obra || '', 'es', { sensitivity: 'base' });
    }
    if (sortMode === 'year-desc') {
      const yA = parseInt(a.año_construccion || a.year, 10) || 0;
      const yB = parseInt(b.año_construccion || b.year, 10) || 0;
      return yB - yA;
    }
    if (sortMode === 'year-asc') {
      const yA = parseInt(a.año_construccion || a.year, 10) || 9999;
      const yB = parseInt(b.año_construccion || b.year, 10) || 9999;
      return yA - yB;
    }
    const timeA = a.created_at ? new Date(a.created_at).getTime() : (a.updated_at ? new Date(a.updated_at).getTime() : 0);
    const timeB = b.created_at ? new Date(b.created_at).getTime() : (b.updated_at ? new Date(b.updated_at).getTime() : 0);
    if (sortMode === 'oldest') {
      return timeA - timeB;
    }
    return timeB - timeA;
  });

  const pendingTotal = allProjects.filter((o) => o.estado_revision === 'pendiente').length;
  const visibleProjects = filtered.slice(0, visibleProjectsCount);

  if (count) {
    if (visibleProjects.length < filtered.length) {
      count.textContent = pendingTotal > 0
        ? `${pendingTotal} PENDIENTES · ${visibleProjects.length}/${filtered.length} OBRAS`
        : `${visibleProjects.length} DE ${filtered.length} OBRAS`;
    } else {
      count.textContent = pendingTotal > 0
        ? `${pendingTotal} PENDIENTES · ${filtered.length} TOTAL`
        : `${filtered.length} OBRAS`;
    }
  }

  if (!filtered.length) {
    if (list) list.innerHTML = '<div class="nearby-empty" style="padding: 24px; text-align: center; color: var(--fg-dim);">No hay proyectos que coincidan con la búsqueda o filtros activos.</div>';
    return;
  }

  if (list) {
    const cardsHtml = visibleProjects.map((obra) => {
      const safeId = escapeHtml(obra.id);
      const safeFeatureId = escapeHtml(obra.featureId || obra.id);
      const safeNombre = escapeHtml(obra.nombre_obra || 'Obra sin título');
      const safeArquitecto = escapeHtml(obra.arquitecto || 'Arquitecto no especificado');
      const isPending = obra.estado_revision === 'pendiente';
      const isRejected = obra.estado_revision === 'rechazada';
      const isPrivate = Boolean(obra.is_personal || obra.is_private || obra.source === 'personal' || obra.origin_source === 'user');
      const isActive = String(obra.id) === String(activeAdminObraId);
      const year = obra.año_construccion || obra.year ? escapeHtml(String(obra.año_construccion || obra.year)) : '';
      const knownCity = obra.ciudad || obra.place || obra.municipio || '';
      const impBadge = formatAdminImpBadge(obra.importancia);

      const catKey = normalizarCategoria(obra.categoria);
      const catMeta = CATEGORY_META[catKey] || CATEGORY_META.otro || {};
      const catName = formatCategoria(obra.categoria);
      const catColor = catMeta.color || 'var(--accent)';

      const rawPhoto = obra.foto || obra.foto_url || obra.imagen || (Array.isArray(obra.fotos) && obra.fotos[0]) || '';
      const thumbUrl = rawPhoto ? getOptimizedPhotoUrl(rawPhoto, { width: 140, quality: 75 }) : '';

      const auditAlerts = [];
      const arqNorm = String(obra.arquitecto || '').trim().toLowerCase();
      if (!arqNorm || arqNorm === 'sin arquitecto' || arqNorm === 'desconocido') {
        auditAlerts.push('<span class="admin-audit-pill" title="Obra sin arquitecto registrado">SIN ARQ</span>');
      }
      if (!year) {
        auditAlerts.push('<span class="admin-audit-pill" title="Obra sin año de construcción">SIN AÑO</span>');
      }
      const coords = obra.coordenadas;
      if (!Array.isArray(coords) || coords.length !== 2 || coords[0] === 0 || isNaN(coords[0])) {
        auditAlerts.push('<span class="admin-audit-pill" title="Obra sin coordenadas geográficas">SIN COORDS</span>');
      }

      const ratingObj = ratingAverages.get(String(obra.id));
      const ratingHtml = ratingObj && ratingObj.count > 0
        ? `<span class="admin-meta-rating" title="Valoración media: ${ratingObj.average.toFixed(1)} / 5 (${ratingObj.count} ${ratingObj.count === 1 ? 'voto' : 'votos'})">★ ${ratingObj.average.toFixed(1)} <small style="font-weight:400; font-size:8px;">(${ratingObj.count})</small></span>`
        : '';

      return `
        <div class="admin-project ${isPending ? 'admin-project-pending' : ''} ${isActive ? 'admin-project-active' : ''}" data-admin-card-id="${safeId}">
          <div class="admin-project-body" data-admin-map="${safeId}">
            <div class="admin-project-thumb-wrap">
              ${thumbUrl 
                ? `<img src="${escapeHtml(thumbUrl)}" alt="${safeNombre}" class="admin-project-thumb" loading="lazy" decoding="async" onerror="this.outerHTML='<div class=\\'admin-project-thumb-placeholder\\'>NO FOTO</div>'">` 
                : '<div class="admin-project-thumb-placeholder">NO FOTO</div>'}
              ${isPending ? '<span class="admin-thumb-pending-pip" title="Pendiente de revisión"></span>' : ''}
            </div>
            <div class="admin-project-info">
              <div class="admin-project-header">
                <h4 class="admin-project-title" title="${safeNombre}">${safeNombre}</h4>
                <div class="admin-project-badges">
                  ${isPending ? '<span class="admin-badge admin-badge-pending">PENDIENTE</span>' : ''}
                  ${isRejected ? '<span class="admin-badge admin-badge-rejected">RECHAZADA</span>' : ''}
                  ${isPrivate ? '<span class="admin-badge admin-badge-private">PRIVADA</span>' : ''}
                  <span class="admin-badge admin-badge-imp imp-${impBadge.level}" title="${escapeHtml(impBadge.title)}">${escapeHtml(impBadge.label)}</span>
                </div>
              </div>
              <div class="admin-project-meta">
                <span class="admin-meta-author" title="${safeArquitecto}">${safeArquitecto}</span>
                ${year ? `<span class="admin-meta-bullet">·</span><span class="admin-meta-year">${year}</span>` : ''}
                <span class="admin-meta-bullet">·</span>
                <span class="admin-meta-city" data-city-for="${safeFeatureId}" title="${escapeHtml(knownCity || 'Ubicación')}">${escapeHtml(knownCity || 'LOCALIZACIÓN...')}</span>
              </div>
              <div class="admin-project-submeta">
                <span class="admin-meta-cat">
                  <span class="admin-cat-pip" style="background:${catColor};"></span>
                  <span>${escapeHtml(catName)}</span>
                </span>
                ${ratingHtml ? `<span class="admin-meta-bullet">·</span>${ratingHtml}` : ''}
                <span class="admin-meta-bullet">·</span>
                <span class="admin-meta-id">#${safeId}</span>
                ${auditAlerts.length > 0 ? `<span class="admin-meta-bullet">·</span>` + auditAlerts.join(' ') : ''}
              </div>
            </div>
          </div>
          <div class="admin-project-actions">
            ${isPending ? `
              <button type="button" class="btn admin-action-approve" data-admin-review="${safeId}" data-review-status="publicada" title="Aprobar obra">APROBAR</button>
              <button type="button" class="btn admin-action-reject" data-admin-review="${safeId}" data-review-status="rechazada" title="Rechazar obra">RECHAZAR</button>
            ` : ''}
            <button type="button" class="btn admin-action-map" data-admin-map="${safeId}" title="Ir a la obra en el mapa">IR AL MAPA</button>
            <button type="button" class="btn admin-action-edit" data-admin-edit="${safeId}" title="Editar ficha de obra">EDITAR</button>
            ${esRolAdmin(state.userRole) && !isPending ? `
              <button type="button" class="btn admin-action-delete" data-admin-delete="${safeId}" title="Eliminar del catálogo">BORRAR</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    const loadMoreBtnHtml = visibleProjects.length < filtered.length ? `
      <div style="padding: 14px; text-align: center; background: var(--bg-panel); border-top: 1px solid var(--border-strong);">
        <button type="button" id="btn-admin-load-more-projects" class="btn btn-auth-primary" style="font-size: 10px; font-weight: 800; letter-spacing: 0.05em; padding: 6px 16px; cursor: pointer;">
          CARGAR MÁS PROYECTOS (${Math.min(50, filtered.length - visibleProjects.length)} MÁS DE ${filtered.length - visibleProjects.length} RESTANTES) ↓
        </button>
      </div>
    ` : '';

    list.innerHTML = cardsHtml + loadMoreBtnHtml;

    if (!list.__scrollBound) {
      list.__scrollBound = true;
      list.addEventListener('scroll', () => {
        if (list.scrollTop + list.clientHeight >= list.scrollHeight - 140) {
          if (visibleProjectsCount < allProjects.length) {
            visibleProjectsCount += 50;
            renderList();
          }
        }
      }, { passive: true });
    }

    visibleProjects.slice(0, 15).forEach(async (obra) => {
      if (obra.ciudad || obra.place || obra.municipio) return;
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

  if (!architectList) return;

  // Si aún se está descargando el catálogo, mostrar estado de carga limpio y claro
  if (!state.OBRAS || state.OBRAS.length === 0) {
    if (architectCount) architectCount.textContent = 'CARGANDO...';
    architectList.innerHTML = `
      <div class="nearby-empty" style="padding: 36px 18px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; font-family: 'Inter', sans-serif;">
        <div class="admin-spinner"></div>
        <div style="font-size: 11px; font-weight: 800; color: var(--fg); letter-spacing: 0.05em;">CARGANDO CATÁLOGO COMPLETO DE ARQUITECTOS...</div>
        <div style="font-size: 10px; color: var(--fg-dim);">Sincronizando 10.000+ referencias arquitectónicas...</div>
      </div>
    `;
    return;
  }

  const searchVal = (architectSearch?.value || '').trim();
  const searchClean = cleanDiacritics(searchVal);
  const filterSort = architectSort?.value || 'count-desc';

  // 1. Agrupación de obras por arquitecto con normalización de nombres y tildes
  const architectMap = new Map();

  for (const obra of state.OBRAS) {
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

  let arqList = Array.from(architectMap.values());

  // 2. Filtrado por búsqueda multi-término insensible a tildes, diacríticos y orden
  const searchTokens = searchClean.split(/\s+/).filter(Boolean);
  if (searchTokens.length > 0) {
    arqList = arqList.filter((item) => {
      const corpus = cleanDiacritics([
        item.name,
        Array.from(item.cities).join(' '),
        item.works.map((w) => w.nombre_obra).join(' ')
      ].join(' '));
      return searchTokens.every((tok) => corpus.includes(tok));
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
  const totalMatches = arqList.length;
  const totalWorksListed = arqList.reduce((acc, curr) => acc + curr.works.length, 0);

  if (totalMatches === 0) {
    if (architectCount) architectCount.textContent = '0 ARQS';
    architectList.innerHTML = '<div class="nearby-empty" style="padding: 24px; text-align: center; color: var(--fg-dim);">No hay arquitectos que coincidan con la búsqueda.</div>';
    return;
  }

  // 5. Renderizado Progresivo (lotes de 60 arquitectos para 60 FPS sin bloquear el DOM)
  const visibleList = arqList.slice(0, visibleArchitectsCount);

  if (architectCount) {
    if (visibleList.length < totalMatches) {
      architectCount.textContent = `${visibleList.length} DE ${totalMatches} ARQS · ${totalWorksListed} OBRAS`;
    } else {
      architectCount.textContent = `${totalMatches} ARQS · ${totalWorksListed} OBRAS`;
    }
  }

  const autoExpand = Boolean(searchClean);

  const cardsHtml = visibleList.map((item) => {
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
              <span style="font-size:9px; font-weight:800; background:var(--accent); color:rgb(255, 255, 255); padding:1px 5px; border-radius:2px;">
                ${item.works.length} ${item.works.length === 1 ? 'OBRA' : 'OBRAS'}
              </span>
              ${item.pendingCount > 0 ? `
                <span class="admin-badge admin-badge-pending" style="font-size:8.5px;">${item.pendingCount} PENDIENTE${item.pendingCount > 1 ? 'S' : ''}</span>
              ` : ''}
              ${item.publishedCount > 0 ? `
                <span style="font-size:8.5px; font-weight:700; background:var(--bg-raised); color:var(--fg-dim); padding:1px 5px; border:1px solid var(--border); border-radius:2px;">${item.publishedCount} PUB</span>
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
            const impBadge = formatAdminImpBadge(obra.importancia);

            return `
              <div class="admin-floating-work-row ${isPending ? 'pending' : ''}">
                <div style="min-width:0; flex:1;">
                  <div style="display:flex; align-items:center; gap:6px; min-width:0;">
                    <span style="font-weight:700; min-width:0; flex:1 1 auto; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${title}">${title}</span>
                    <div style="display:inline-flex; align-items:center; gap:4px; flex-shrink:0;">
                      ${isPending ? '<span class="admin-badge admin-badge-pending">PENDIENTE</span>' : ''}
                      <span class="admin-badge admin-badge-imp imp-${impBadge.level}" title="${escapeHtml(impBadge.title)}">${escapeHtml(impBadge.label)}</span>
                    </div>
                  </div>
                  <div style="color:var(--fg-dim); font-size:9px; margin-top:2px;">
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

  const remaining = totalMatches - visibleList.length;
  const loadMoreBtnHtml = remaining > 0 ? `
    <div style="padding: 12px; text-align: center; border-top: 1px solid var(--border-strong); background: var(--bg-panel);">
      <button type="button" id="btn-admin-load-more-arqs" class="btn btn-admin-load-more">
        <span>MOSTRAR MÁS ARQUITECTOS (+${Math.min(60, remaining)})</span>
        <span style="font-size: 9px; color: var(--fg-dim); font-weight: 700;">(${remaining} RESTANTES)</span>
      </button>
    </div>
  ` : '';

  architectList.innerHTML = cardsHtml + loadMoreBtnHtml;
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
  marcarProyectoActivo(obra.id);
  const coords = (Array.isArray(obra.coordenadas) && obra.coordenadas.length === 2 && !isNaN(obra.coordenadas[0]) && obra.coordenadas[0] !== 0)
    ? obra.coordenadas
    : (obra.longitud && obra.latitud ? [Number(obra.longitud), Number(obra.latitud)] : null);
  if (coords) {
    const isDesktop = window.innerWidth >= 1024;
    state.map.flyTo({
      center: coords,
      zoom: Math.max(state.map.getZoom(), 15),
      padding: isDesktop ? { left: 450, right: 0, top: 0, bottom: 0 } : { left: 0, right: 0, top: 0, bottom: 0 }
    });
  }
  document.dispatchEvent(new CustomEvent('radar:open-building', { detail: { obra } }));
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
  if (obra.ciudad || obra.place || obra.municipio) return obra.ciudad || obra.place || obra.municipio;
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
