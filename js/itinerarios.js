/* =========================================================================
   ITINERARIOS.JS — Consola de Administración y Gestión de Itinerarios Nolli
   Acceso Restringido a Administradores (Auth Supabase)
   ========================================================================= */

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import {
  fetchCurrentUser,
  fetchUserRole,
  getBuildingsCatalog,
  fetchItineraries,
  createItinerary,
  updateItinerary,
  deleteItinerary,
} from './api.js';
import { escapeHtml, normalizarCategoria } from './state.js';
import { CURATED_ROUTES, matchWorksForRoute } from './radarUI.js';

const SESSION_KEY = 'nolli_admin_session_token';

const itineraryAdminState = {
  token: null,
  user: null,
  role: null,
  itineraries: [],
  catalog: [],
  activeFilter: '',
  editingId: null,
};

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
      showLockScreen('AUTENTICACIÓN REQUERIDA', 'Debes iniciar sesión con una cuenta autorizada de administrador para gestionar itinerarios.');
      return;
    }

    let parsed = JSON.parse(rawSession);
    const token = parsed.access_token || parsed;
    if (!token) {
      showLockScreen('SESIÓN INVÁLIDA', 'No se encontró un token de autenticación válido.');
      return;
    }

    itineraryAdminState.token = token;

    // 1. Verificar usuario
    const user = await fetchCurrentUser(token);
    itineraryAdminState.user = user;

    // 2. Verificar rol
    const role = await fetchUserRole(token);
    itineraryAdminState.role = role;

    const userEmail = String(user.email || '').toLowerCase().trim();
    const isMasterFounder = userEmail === 'studio.signes@gmail.com';
    const isAuthorized = role === 'admin' || role === 'superadmin' || isMasterFounder;

    if (!isAuthorized) {
      showLockScreen('PRIVILEGIOS INSUFICIENTES', `Tu cuenta (${userEmail}) no tiene permisos de administrador.`);
      return;
    }

    // Actualizar UI de usuario
    const userEmailEl = document.getElementById('admin-user-email');
    const userRoleEl = document.getElementById('admin-user-role');
    if (userEmailEl) userEmailEl.textContent = user.email || 'Admin';
    if (userRoleEl) userRoleEl.textContent = `[ ${String(role || 'ADMIN').toUpperCase()} ]`;

    // 3. Desbloquear pantalla y cargar datos
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
    if (lockScreen) lockScreen.classList.add('hidden');
    if (mainApp) mainApp.classList.remove('hidden');

    initAppEvents();
    await loadInitialData();

  } catch (error) {
    console.error('Error de autenticación:', error);
    showLockScreen('ERROR DE CONEXIÓN', 'No se pudo verificar la sesión. Inicia sesión nuevamente.');
  }
}

function showLockScreen(title, desc) {
  const loadingIndicator = document.getElementById('admin-loading');
  const lockScreen = document.getElementById('admin-lock-screen');
  const mainApp = document.getElementById('admin-main-app');
  const titleEl = document.getElementById('lock-screen-title');
  const descEl = document.getElementById('lock-screen-desc');

  if (loadingIndicator) loadingIndicator.classList.add('hidden');
  if (mainApp) mainApp.classList.add('hidden');
  if (lockScreen) lockScreen.classList.remove('hidden');
  if (titleEl) titleEl.textContent = `[ 403 // ${title.toUpperCase()} ]`;
  if (descEl) descEl.textContent = desc;

  const btnLogin = document.getElementById('btn-lock-login');
  if (btnLogin) {
    btnLogin.onclick = () => {
      window.location.href = './admin.html';
    };
  }

  if (window.lucide) window.lucide.createIcons();
}

// =========================================================================
// 2. CARGA Y GESTIÓN DE DATOS
// =========================================================================
async function loadInitialData() {
  const container = document.getElementById('itineraries-list-container');
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; font-family: 'JetBrains Mono', monospace; color: var(--admin-fg-dim);">
        Cargando catálogo de edificios e itinerarios...
      </div>
    `;
  }

  try {
    // 1. Cargar catálogo de obras para cálculo en tiempo real
    const catalog = await getBuildingsCatalog().catch(() => []);
    itineraryAdminState.catalog = catalog.map((f) => ({ ...f, categoria: normalizarCategoria(f.categoria) }));

    // 2. Cargar itinerarios de Supabase / localStorage / CURATED_ROUTES
    const remoteItineraries = await fetchItineraries(itineraryAdminState.token, true);
    if (remoteItineraries && remoteItineraries.length > 0) {
      itineraryAdminState.itineraries = remoteItineraries;
    } else {
      // Usar CURATED_ROUTES iniciales
      itineraryAdminState.itineraries = CURATED_ROUTES.map((r, idx) => ({
        ...r,
        active: true,
        order_num: idx,
      }));
    }

    renderItinerariesList();
    updateStats();

  } catch (err) {
    console.error('Error cargando itinerarios:', err);
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; font-family: 'JetBrains Mono', monospace; color: var(--admin-red);">
          Error al cargar los itinerarios. Intenta recargar la página.
        </div>
      `;
    }
  }
}

function updateStats() {
  const totalEl = document.getElementById('stat-total-count');
  const activeEl = document.getElementById('stat-active-count');
  if (totalEl) totalEl.textContent = itineraryAdminState.itineraries.length;
  if (activeEl) activeEl.textContent = itineraryAdminState.itineraries.filter((i) => i.active !== false).length;
}

// =========================================================================
// 3. RENDERIZADO DEL LISTADO
// =========================================================================
function renderItinerariesList() {
  const container = document.getElementById('itineraries-list-container');
  if (!container) return;

  const filterText = (itineraryAdminState.activeFilter || '').toLowerCase().trim();
  const list = itineraryAdminState.itineraries.filter((item) => {
    if (!filterText) return true;
    const searchTarget = `${item.title} ${item.subtitle} ${item.tag} ${item.architectFilter || ''} ${(item.architectsFilter || []).join(' ')} ${item.addedByFilter || ''}`.toLowerCase();
    return searchTarget.includes(filterText);
  });

  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; font-family: 'JetBrains Mono', monospace; color: var(--admin-fg-dim); background: var(--admin-bg-surface); border: 2px dashed var(--admin-border);">
        No se encontraron itinerarios que coincidan con la búsqueda.
      </div>
    `;
    return;
  }

  container.innerHTML = list.map((item) => {
    const isInactive = item.active === false;
    const matchCount = calculateMatchesCount(item);
    
    // Reglas formateadas
    const rules = [];
    if (item.categoryFilter) rules.push(`<div class="itinerary-rule-item"><span class="itinerary-rule-label">Categoría:</span><span class="itinerary-rule-val">${escapeHtml(item.categoryFilter)}</span></div>`);
    if (item.addedByFilter) rules.push(`<div class="itinerary-rule-item"><span class="itinerary-rule-label">Añadido por:</span><span class="itinerary-rule-val">${escapeHtml(item.addedByFilter)}</span></div>`);
    if (item.yearRange && Array.isArray(item.yearRange)) rules.push(`<div class="itinerary-rule-item"><span class="itinerary-rule-label">Periodo:</span><span class="itinerary-rule-val">${item.yearRange[0]} – ${item.yearRange[1]}</span></div>`);
    if (item.decadeFilter) rules.push(`<div class="itinerary-rule-item"><span class="itinerary-rule-label">Década:</span><span class="itinerary-rule-val">${item.decadeFilter}s</span></div>`);
    if (item.architectFilter) rules.push(`<div class="itinerary-rule-item"><span class="itinerary-rule-label">Arquitecto:</span><span class="itinerary-rule-val">${escapeHtml(item.architectFilter)}</span></div>`);
    if (item.architectsFilter && item.architectsFilter.length) rules.push(`<div class="itinerary-rule-item"><span class="itinerary-rule-label">Autores:</span><span class="itinerary-rule-val">${escapeHtml(item.architectsFilter.join(', '))}</span></div>`);
    if (item.bboxFilter) rules.push(`<div class="itinerary-rule-item"><span class="itinerary-rule-label">Bbox Geo:</span><span class="itinerary-rule-val">[${item.bboxFilter.latMin}..${item.bboxFilter.latMax}, ${item.bboxFilter.lonMin}..${item.bboxFilter.lonMax}]</span></div>`);
    if (item.keywords && item.keywords.length) rules.push(`<div class="itinerary-rule-item"><span class="itinerary-rule-label">Keywords:</span><span class="itinerary-rule-val">${escapeHtml(item.keywords.join(', '))}</span></div>`);

    return `
      <article class="itinerary-card ${isInactive ? 'inactive' : ''}" data-id="${escapeHtml(item.id)}">
        <div class="itinerary-card-header">
          <div>
            <div class="itinerary-badge-row">
              <span class="itinerary-color-chip" style="background-color: ${escapeHtml(item.color || '#E84E1B')};"></span>
              <span class="itinerary-tag-badge">${escapeHtml(item.tag || 'MOVIMIENTO')}</span>
              <span style="font-family: 'JetBrains Mono'; font-size: 10px; color: var(--admin-fg-dim);">ID: ${escapeHtml(item.id)}</span>
              ${isInactive ? '<span style="font-family: \'JetBrains Mono\'; font-size: 10px; color: var(--admin-red); font-weight: 800;">[ INACTIVO ]</span>' : ''}
            </div>
            <h3 class="itinerary-title">${escapeHtml(item.title)}</h3>
            <p class="itinerary-subtitle">${escapeHtml(item.subtitle || '')}</p>
          </div>
          
          <div class="itinerary-match-pill" style="border-color: ${escapeHtml(item.color || '#E84E1B')};">
            <i data-lucide="compass" width="13" height="13" style="color: ${escapeHtml(item.color || '#E84E1B')};"></i>
            <span>${matchCount} OBRAS</span>
          </div>
        </div>

        <div class="itinerary-rules-box">
          ${rules.length > 0 ? rules.join('') : '<div style="color: var(--admin-fg-dim);">Sin filtros restrictivos definidos</div>'}
        </div>

        <div class="itinerary-card-footer">
          <div class="itinerary-actions-group">
            <a href="./#route=${encodeURIComponent(item.id)}" target="_blank" class="admin-btn" title="Ver en el mapa público con el icono de brújula">
              <i data-lucide="external-link" width="12" height="12"></i>
              <span>VER EN MAPA</span>
            </a>

            <button type="button" class="admin-btn btn-edit-itinerary" data-id="${escapeHtml(item.id)}">
              <i data-lucide="edit-3" width="12" height="12"></i>
              <span>EDITAR REGLAS</span>
            </button>

            <button type="button" class="admin-btn btn-toggle-active" data-id="${escapeHtml(item.id)}" data-active="${!isInactive}">
              <i data-lucide="${isInactive ? 'eye' : 'eye-off'}" width="12" height="12"></i>
              <span>${isInactive ? 'ACTIVAR' : 'DESACTIVAR'}</span>
            </button>
          </div>

          <button type="button" class="admin-btn admin-btn-reject btn-delete-itinerary" data-id="${escapeHtml(item.id)}" title="Eliminar itinerario">
            <i data-lucide="trash-2" width="12" height="12"></i>
            <span>ELIMINAR</span>
          </button>
        </div>
      </article>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

function calculateMatchesCount(itinerary) {
  if (!itineraryAdminState.catalog || itineraryAdminState.catalog.length === 0) {
    return itinerary.stops || '~';
  }
  const matches = matchWorksForRoute(itinerary, itineraryAdminState.catalog);
  return matches.length;
}

// =========================================================================
// 4. EVENTOS Y FORMULARIO MODAL
// =========================================================================
function initAppEvents() {
  // Búsqueda
  const searchInput = document.getElementById('search-itineraries');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      itineraryAdminState.activeFilter = e.target.value;
      renderItinerariesList();
    });
  }

  // Botón Nuevo Itinerario
  const btnNew = document.getElementById('btn-new-itinerary');
  if (btnNew) {
    btnNew.addEventListener('click', () => {
      openItineraryModal(null);
    });
  }

  // Cerrar / Cancelar Modal
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeItineraryModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeItineraryModal);

  // Delegación de eventos en listado (Editar, Toggle, Eliminar)
  const container = document.getElementById('itineraries-list-container');
  if (container) {
    container.addEventListener('click', async (e) => {
      const btnEdit = e.target.closest('.btn-edit-itinerary');
      if (btnEdit) {
        const id = btnEdit.dataset.id;
        const item = itineraryAdminState.itineraries.find((r) => r.id === id);
        if (item) openItineraryModal(item);
        return;
      }

      const btnToggle = e.target.closest('.btn-toggle-active');
      if (btnToggle) {
        const id = btnToggle.dataset.id;
        await handleToggleActive(id);
        return;
      }

      const btnDelete = e.target.closest('.btn-delete-itinerary');
      if (btnDelete) {
        const id = btnDelete.dataset.id;
        await handleDeleteItinerary(id);
        return;
      }
    });
  }

  // Formulario de edición / guardado
  const form = document.getElementById('itinerary-edit-form');
  if (form) {
    form.addEventListener('submit', handleSaveItinerary);

    // Eventos en vivo para cálculo de coincidencias instantáneo
    ['form-category', 'form-addedby', 'form-year-min', 'form-year-max', 'form-decade', 'form-architects', 'form-lat-min', 'form-lat-max', 'form-lon-min', 'form-lon-max', 'form-keywords'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', updateLiveMatchPreview);
        el.addEventListener('change', updateLiveMatchPreview);
      }
    });

    // Swatches de color
    document.querySelectorAll('.color-swatch-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        const colorInput = document.getElementById('form-color');
        const colorPicker = document.getElementById('form-color-picker');
        if (colorInput) colorInput.value = color;
        if (colorPicker) colorPicker.value = color;
        document.querySelectorAll('.color-swatch-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    const colorPicker = document.getElementById('form-color-picker');
    if (colorPicker) {
      colorPicker.addEventListener('input', (e) => {
        const colorInput = document.getElementById('form-color');
        if (colorInput) colorInput.value = e.target.value;
      });
    }

    // Presets de Bounding Box
    document.querySelectorAll('.preset-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const bboxStr = btn.dataset.bbox;
        const latMinEl = document.getElementById('form-lat-min');
        const latMaxEl = document.getElementById('form-lat-max');
        const lonMinEl = document.getElementById('form-lon-min');
        const lonMaxEl = document.getElementById('form-lon-max');

        if (!bboxStr) {
          if (latMinEl) latMinEl.value = '';
          if (latMaxEl) latMaxEl.value = '';
          if (lonMinEl) lonMinEl.value = '';
          if (lonMaxEl) lonMaxEl.value = '';
        } else {
          const [latMin, latMax, lonMin, lonMax] = bboxStr.split(',');
          if (latMinEl) latMinEl.value = latMin;
          if (latMaxEl) latMaxEl.value = latMax;
          if (lonMinEl) lonMinEl.value = lonMin;
          if (lonMaxEl) lonMaxEl.value = lonMax;
        }
        updateLiveMatchPreview();
      });
    });
  }
}

function openItineraryModal(item = null) {
  const modal = document.getElementById('modal-itinerary-form');
  const titleEl = document.getElementById('modal-form-title');
  const isEditEl = document.getElementById('form-is-edit');
  const idInput = document.getElementById('form-id');

  if (!modal) return;

  if (item) {
    itineraryAdminState.editingId = item.id;
    if (titleEl) titleEl.textContent = `[ EDITAR ITINERARIO // ${item.id.toUpperCase()} ]`;
    if (isEditEl) isEditEl.value = 'true';
    if (idInput) {
      idInput.value = item.id;
      idInput.disabled = true;
    }

    document.getElementById('form-title').value = item.title || '';
    document.getElementById('form-subtitle').value = item.subtitle || '';
    document.getElementById('form-tag').value = item.tag || 'MOVIMIENTO MODERNO';
    document.getElementById('form-color').value = item.color || '#E84E1B';
    document.getElementById('form-color-picker').value = item.color || '#E84E1B';
    document.getElementById('form-order').value = item.order_num || 0;
    document.getElementById('form-active').checked = item.active !== false;

    // Reglas
    document.getElementById('form-category').value = item.categoryFilter || '';
    document.getElementById('form-addedby').value = item.addedByFilter || '';
    document.getElementById('form-year-min').value = item.yearRange ? item.yearRange[0] : '';
    document.getElementById('form-year-max').value = item.yearRange ? item.yearRange[1] : '';
    document.getElementById('form-decade').value = item.decadeFilter || '';
    document.getElementById('form-architects').value = item.architectsFilter ? item.architectsFilter.join(', ') : (item.architectFilter || '');

    if (item.bboxFilter) {
      document.getElementById('form-lat-min').value = item.bboxFilter.latMin ?? '';
      document.getElementById('form-lat-max').value = item.bboxFilter.latMax ?? '';
      document.getElementById('form-lon-min').value = item.bboxFilter.lonMin ?? '';
      document.getElementById('form-lon-max').value = item.bboxFilter.lonMax ?? '';
    } else {
      document.getElementById('form-lat-min').value = '';
      document.getElementById('form-lat-max').value = '';
      document.getElementById('form-lon-min').value = '';
      document.getElementById('form-lon-max').value = '';
    }

    document.getElementById('form-keywords').value = item.keywords ? item.keywords.join(', ') : '';

  } else {
    itineraryAdminState.editingId = null;
    if (titleEl) titleEl.textContent = '[ NUEVO ITINERARIO // EXPLORA ]';
    if (isEditEl) isEditEl.value = 'false';
    if (idInput) {
      idInput.value = `route-${Date.now().toString(36)}`;
      idInput.disabled = false;
    }

    document.getElementById('form-title').value = '';
    document.getElementById('form-subtitle').value = '';
    document.getElementById('form-tag').value = 'MOVIMIENTO MODERNO';
    document.getElementById('form-color').value = '#E84E1B';
    document.getElementById('form-color-picker').value = '#E84E1B';
    document.getElementById('form-order').value = itineraryAdminState.itineraries.length + 1;
    document.getElementById('form-active').checked = true;

    document.getElementById('form-category').value = '';
    document.getElementById('form-addedby').value = '';
    document.getElementById('form-year-min').value = '';
    document.getElementById('form-year-max').value = '';
    document.getElementById('form-decade').value = '';
    document.getElementById('form-architects').value = '';
    document.getElementById('form-lat-min').value = '';
    document.getElementById('form-lat-max').value = '';
    document.getElementById('form-lon-min').value = '';
    document.getElementById('form-lon-max').value = '';
    document.getElementById('form-keywords').value = '';
  }

  modal.classList.remove('hidden');
  updateLiveMatchPreview();
  if (window.lucide) window.lucide.createIcons();
}

function closeItineraryModal() {
  const modal = document.getElementById('modal-itinerary-form');
  if (modal) modal.classList.add('hidden');
}

function getFormData() {
  const id = document.getElementById('form-id').value.trim();
  const title = document.getElementById('form-title').value.trim();
  const subtitle = document.getElementById('form-subtitle').value.trim();
  const tag = document.getElementById('form-tag').value.trim() || 'MOVIMIENTO MODERNO';
  const color = document.getElementById('form-color').value.trim() || '#E84E1B';
  const order_num = Number(document.getElementById('form-order').value || 0);
  const active = document.getElementById('form-active').checked;

  const categoryFilter = document.getElementById('form-category').value.trim() || null;
  const addedByFilter = document.getElementById('form-addedby').value.trim() || null;

  const yearMin = document.getElementById('form-year-min').value.trim();
  const yearMax = document.getElementById('form-year-max').value.trim();
  const yearRange = (yearMin && yearMax) ? [Number(yearMin), Number(yearMax)] : null;

  const decadeVal = document.getElementById('form-decade').value.trim();
  const decadeFilter = decadeVal ? Number(decadeVal) : null;

  const arqRaw = document.getElementById('form-architects').value.trim();
  const architectsFilter = arqRaw ? arqRaw.split(',').map((s) => s.trim()).filter(Boolean) : null;

  const latMin = document.getElementById('form-lat-min').value.trim();
  const latMax = document.getElementById('form-lat-max').value.trim();
  const lonMin = document.getElementById('form-lon-min').value.trim();
  const lonMax = document.getElementById('form-lon-max').value.trim();
  const bboxFilter = (latMin && latMax && lonMin && lonMax) ? {
    latMin: Number(latMin),
    latMax: Number(latMax),
    lonMin: Number(lonMin),
    lonMax: Number(lonMax),
  } : null;

  const kwRaw = document.getElementById('form-keywords').value.trim();
  const keywords = kwRaw ? kwRaw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : null;

  return {
    id,
    title,
    subtitle,
    tag,
    color,
    order_num,
    active,
    categoryFilter,
    addedByFilter,
    yearRange,
    decadeFilter,
    architectsFilter,
    bboxFilter,
    keywords,
  };
}

function updateLiveMatchPreview() {
  const currentConfig = getFormData();
  const countEl = document.getElementById('form-live-count');
  const sampleEl = document.getElementById('form-live-sample');

  if (!itineraryAdminState.catalog || itineraryAdminState.catalog.length === 0) {
    if (countEl) countEl.textContent = 'CARGANDO CATÁLOGO...';
    return;
  }

  const matches = matchWorksForRoute(currentConfig, itineraryAdminState.catalog);

  if (countEl) {
    countEl.textContent = `${matches.length} OBRAS COINCIDENTES`;
    countEl.style.color = matches.length > 0 ? 'var(--admin-green)' : 'var(--admin-red)';
  }

  if (sampleEl) {
    if (matches.length === 0) {
      sampleEl.textContent = 'Ninguna obra del catálogo coincide con la combinación de filtros actual.';
    } else {
      const sample = matches.slice(0, 5).map((w) => `• ${w.nombre_obra || 'Sin título'} (${w.año_construccion || 's/f'}) — ${w.arquitecto || 'Autor desc.'} [${w.place || w.ciudad || 'VLC'}]`).join('\n');
      sampleEl.textContent = `${sample}${matches.length > 5 ? `\n... y ${matches.length - 5} obras más.` : ''}`;
    }
  }
}

async function handleSaveItinerary(e) {
  e.preventDefault();
  const saveBtn = document.getElementById('btn-save-itinerary');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'GUARDANDO...';
  }

  try {
    const data = getFormData();
    const isEdit = document.getElementById('form-is-edit').value === 'true';

    // Calcular stops estimados
    const matchCount = calculateMatchesCount(data);
    data.stops = matchCount > 0 ? `~${matchCount} OBRAS` : 'CATÁLOGO';

    if (isEdit) {
      await updateItinerary(data.id, data, itineraryAdminState.token);
      itineraryAdminState.itineraries = itineraryAdminState.itineraries.map((r) => (r.id === data.id ? { ...r, ...data } : r));
    } else {
      const created = await createItinerary(data, itineraryAdminState.token);
      itineraryAdminState.itineraries.push(created || data);
    }

    closeItineraryModal();
    renderItinerariesList();
    updateStats();
    alert(`Itinerario "${data.title}" guardado con éxito.`);

  } catch (err) {
    console.error('Error al guardar itinerario:', err);
    alert(`Error: ${err.message || 'No se pudo guardar el itinerario.'}`);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i data-lucide="save" width="14" height="14"></i><span>GUARDAR ITINERARIO</span>';
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

async function handleToggleActive(id) {
  const item = itineraryAdminState.itineraries.find((r) => r.id === id);
  if (!item) return;

  const newActive = item.active === false;
  try {
    await updateItinerary(id, { ...item, active: newActive }, itineraryAdminState.token);
    item.active = newActive;
    renderItinerariesList();
    updateStats();
  } catch (err) {
    alert(`No se pudo cambiar el estado: ${err.message}`);
  }
}

async function handleDeleteItinerary(id) {
  const item = itineraryAdminState.itineraries.find((r) => r.id === id);
  if (!item) return;

  const confirmDelete = confirm(`¿Estás seguro de que deseas eliminar permanentemente el itinerario "${item.title}"?`);
  if (!confirmDelete) return;

  try {
    await deleteItinerary(id, itineraryAdminState.token);
    itineraryAdminState.itineraries = itineraryAdminState.itineraries.filter((r) => r.id !== id);
    renderItinerariesList();
    updateStats();
    alert('Itinerario eliminado correctamente.');
  } catch (err) {
    alert(`Error al eliminar: ${err.message}`);
  }
}

