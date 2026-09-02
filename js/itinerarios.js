/* =========================================================================
   ITINERARIOS.JS — Consola de Administración y Selección Manual de Obras
   Gestor de Itinerarios Nolli con Selección Directa Obra a Obra
   ========================================================================= */

import {
  fetchCurrentUser,
  fetchUserRole,
  loginAdmin,
  getBuildingsCatalog,
  fetchItineraries,
  createItinerary,
  updateItinerary,
  deleteItinerary,
} from './api.js';
import { escapeHtml, normalizarCategoria, CATEGORY_META } from './state.js';
import { CURATED_ROUTES, matchWorksForRoute } from './itinerariesConfig.js';

const SESSION_KEY = 'nolli_admin_session_token';

const itineraryAdminState = {
  token: null,
  user: null,
  role: null,
  itineraries: [],
  catalog: [],
  catalogMap: new Map(),
  activeFilter: '',
  editingId: null,
  currentFormSelectedWorks: [], // Array de objetos de obras añadidas al formulario actual
};

// =========================================================================
// 1. INICIALIZACIÓN Y SEGURIDAD (GUARDIA DE ACCESO)
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  setupLoginForm();
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

function setupLoginForm() {
  const loginForm = document.getElementById('form-inline-login');
  if (!loginForm) return;

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('login-error-msg');
    const submitBtn = document.getElementById('btn-submit-login');

    if (errorMsg) errorMsg.classList.add('hidden');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'VERIFICANDO...';
    }

    try {
      const session = await loginAdmin(email, password);
      const token = session.access_token || session;
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      itineraryAdminState.token = token;
      await checkAccessAndInit();
    } catch (err) {
      if (errorMsg) {
        errorMsg.textContent = `Error: ${err.message || 'Credenciales incorrectas.'}`;
        errorMsg.classList.remove('hidden');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="log-in" width="14" height="14"></i><span>INICIAR SESIÓN</span>';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  });
}

async function checkAccessAndInit() {
  const lockScreen = document.getElementById('admin-lock-screen');
  const mainApp = document.getElementById('admin-main-app');
  const loadingIndicator = document.getElementById('admin-loading');

  if (loadingIndicator) loadingIndicator.classList.remove('hidden');

  try {
    const rawSession = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!rawSession) {
      showLockScreen();
      return;
    }

    let parsed = JSON.parse(rawSession);
    const token = parsed.access_token || parsed;
    if (!token) {
      showLockScreen();
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
      showLockScreen(`Tu cuenta (${userEmail}) no tiene permisos de administrador.`);
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
    showLockScreen('No se pudo verificar la sesión. Inicia sesión con tus credenciales.');
  }
}

function showLockScreen(desc = null) {
  const loadingIndicator = document.getElementById('admin-loading');
  const lockScreen = document.getElementById('admin-lock-screen');
  const mainApp = document.getElementById('admin-main-app');
  const descEl = document.getElementById('lock-screen-desc');

  if (loadingIndicator) loadingIndicator.classList.add('hidden');
  if (mainApp) mainApp.classList.add('hidden');
  if (lockScreen) lockScreen.classList.remove('hidden');
  if (desc && descEl) descEl.textContent = desc;

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
        Cargando catálogo completo de obras e itinerarios...
      </div>
    `;
  }

  try {
    // 1. Cargar catálogo de obras completo
    const catalog = await getBuildingsCatalog().catch(() => []);
    itineraryAdminState.catalog = catalog.map((f, idx) => ({
      ...f,
      id: String(f.id ?? `obra-${idx}`),
      categoria: normalizarCategoria(f.categoria),
      coordenadas: [Number(f.longitud), Number(f.latitud)],
      arquitectos: f.arquitecto || '',
    }));
    
    // Mapeo rápido O(1) por ID
    itineraryAdminState.catalogMap = new Map(itineraryAdminState.catalog.map((b) => [String(b.id), b]));

    // 2. Cargar itinerarios de Supabase / localStorage / CURATED_ROUTES
    const remoteItineraries = await fetchItineraries(itineraryAdminState.token, true);
    if (remoteItineraries && remoteItineraries.length > 0) {
      itineraryAdminState.itineraries = remoteItineraries;
    } else {
      // Pre-poblar los itinerarios base convirtiendo sus filtros iniciales en work_ids explícitos
      itineraryAdminState.itineraries = CURATED_ROUTES.map((r, idx) => {
        const matched = matchWorksForRoute(r, itineraryAdminState.catalog);
        return {
          ...r,
          work_ids: matched.map((w) => String(w.id)),
          stops: `${matched.length} OBRAS`,
          active: true,
          order_num: idx,
        };
      });
    }

    renderItinerariesList();
    updateStats();

  } catch (err) {
    console.error('Error cargando datos:', err);
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; font-family: 'JetBrains Mono', monospace; color: var(--admin-red);">
          Error al cargar los datos. Intenta recargar la página.
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
// 3. RENDERIZADO DEL LISTADO DE ITINERARIOS
// =========================================================================
function renderItinerariesList() {
  const container = document.getElementById('itineraries-list-container');
  if (!container) return;

  const filterText = (itineraryAdminState.activeFilter || '').toLowerCase().trim();
  const list = itineraryAdminState.itineraries.filter((item) => {
    if (!filterText) return true;
    const searchTarget = `${item.title} ${item.subtitle || ''} ${item.tag || ''}`.toLowerCase();
    return searchTarget.includes(filterText);
  });

  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; font-family: 'JetBrains Mono', monospace; color: var(--admin-fg-dim); background: var(--admin-bg-surface); border: 2px dashed var(--admin-border);">
        No se encontraron itinerarios. ¡Crea uno nuevo con el botón superior!
      </div>
    `;
    return;
  }

  container.innerHTML = list.map((item) => {
    const isInactive = item.active === false;
    const workIds = getItineraryWorkIds(item);
    const count = workIds.length;

    // Vista previa de las primeras obras
    const sampleWorks = workIds.slice(0, 8).map((id) => {
      const obra = itineraryAdminState.catalogMap.get(String(id));
      if (!obra) return `<span class="itinerary-work-chip">#${id}</span>`;
      return `<span class="itinerary-work-chip" title="${escapeHtml(obra.arquitecto || '')}">📍 ${escapeHtml(obra.nombre_obra || 'Sin nombre')} (${obra.año_construccion || 's/f'})</span>`;
    });

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
            <span>${count} OBRAS SELECCIONADAS</span>
          </div>
        </div>

        <div class="itinerary-works-preview">
          <div style="font-size: 10px; color: var(--admin-fg-dim); margin-bottom: 6px; font-weight: 700;">OBRAS INCLUIDAS EN LA RUTA:</div>
          ${sampleWorks.length > 0 ? sampleWorks.join('') : '<span style="color: var(--admin-fg-dim);">Ninguna obra seleccionada aún. Haz clic en "EDITAR OBRAS" para añadir paradas.</span>'}
          ${count > 8 ? `<span class="itinerary-work-chip" style="font-weight: 800; background: var(--admin-bg-raised);">+ ${count - 8} obras más...</span>` : ''}
        </div>

        <div class="itinerary-card-footer">
          <div class="itinerary-actions-group">
            <a href="./#route=${encodeURIComponent(item.id)}" target="_blank" class="admin-btn" title="Ver en el mapa público con el icono de brújula">
              <i data-lucide="external-link" width="12" height="12"></i>
              <span>VER EN MAPA</span>
            </a>

            <button type="button" class="admin-btn btn-edit-itinerary" data-id="${escapeHtml(item.id)}" style="background: var(--admin-accent); color: #fff; font-weight: 800;">
              <i data-lucide="edit-3" width="12" height="12"></i>
              <span>EDITAR / AÑADIR OBRAS (${count})</span>
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

function getItineraryWorkIds(item) {
  if (Array.isArray(item.work_ids) && item.work_ids.length > 0) {
    return item.work_ids.map(String);
  }
  if (Array.isArray(item.workIds) && item.workIds.length > 0) {
    return item.workIds.map(String);
  }
  // Si no tiene work_ids explícitos aún, resolver por filtros de catálogo
  if (itineraryAdminState.catalog && itineraryAdminState.catalog.length > 0) {
    const matched = matchWorksForRoute(item, itineraryAdminState.catalog);
    return matched.map((w) => String(w.id));
  }
  return [];
}

// =========================================================================
// 4. EVENTOS Y FORMULARIO MODAL (SELECCIÓN MANUAL)
// =========================================================================
function initAppEvents() {
  // Búsqueda en el listado
  const searchInput = document.getElementById('search-itineraries');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      itineraryAdminState.activeFilter = e.target.value;
      renderItinerariesList();
    });
  }

  // Botón Crear Nuevo Itinerario
  const btnNew = document.getElementById('btn-new-itinerary');
  if (btnNew) {
    btnNew.addEventListener('click', () => {
      openItineraryModal(null);
    });
  }

  // Cerrar Modal
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeItineraryModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeItineraryModal);

  // Delegación de clics en listado (Editar, Toggle, Eliminar)
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

  // Buscador predictivo de obras dentro del modal
  const buildingSearchInput = document.getElementById('input-search-buildings-to-add');
  if (buildingSearchInput) {
    buildingSearchInput.addEventListener('input', handleSearchBuildingsToSelect);
  }

  // Guardar formulario
  const form = document.getElementById('itinerary-edit-form');
  if (form) {
    form.addEventListener('submit', handleSaveItinerary);

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
  }
}

function openItineraryModal(item = null) {
  const modal = document.getElementById('modal-itinerary-form');
  const titleEl = document.getElementById('modal-form-title');
  const isEditEl = document.getElementById('form-is-edit');
  const idInput = document.getElementById('form-id');

  if (!modal) return;

  // Limpiar buscador de obras
  const buildingSearchInput = document.getElementById('input-search-buildings-to-add');
  if (buildingSearchInput) buildingSearchInput.value = '';
  const searchResultsBox = document.getElementById('building-search-results');
  if (searchResultsBox) {
    searchResultsBox.innerHTML = '';
    searchResultsBox.classList.add('hidden');
  }

  if (item) {
    itineraryAdminState.editingId = item.id;
    if (titleEl) titleEl.textContent = `[ EDITAR ITINERARIO // ${item.title.toUpperCase()} ]`;
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

    // Cargar obras seleccionadas
    const workIds = getItineraryWorkIds(item);
    itineraryAdminState.currentFormSelectedWorks = workIds
      .map((id) => itineraryAdminState.catalogMap.get(String(id)))
      .filter(Boolean);

  } else {
    itineraryAdminState.editingId = null;
    if (titleEl) titleEl.textContent = '[ NUEVO ITINERARIO // SELECCIÓN MANUAL ]';
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

    itineraryAdminState.currentFormSelectedWorks = [];
  }

  renderFormSelectedWorksList();
  modal.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function closeItineraryModal() {
  const modal = document.getElementById('modal-itinerary-form');
  if (modal) modal.classList.add('hidden');
}

// =========================================================================
// 5. GESTIÓN MANUAL DE OBRAS EN EL FORMULARIO (UNA A UNA)
// =========================================================================
function handleSearchBuildingsToSelect(e) {
  const query = (e.target.value || '').trim();
  const resultsBox = document.getElementById('building-search-results');
  if (!resultsBox) return;

  if (query.length < 2) {
    resultsBox.innerHTML = '';
    resultsBox.classList.add('hidden');
    return;
  }

  if (!itineraryAdminState.catalog || itineraryAdminState.catalog.length === 0) {
    resultsBox.innerHTML = `
      <div style="padding: 12px; font-family: 'JetBrains Mono'; font-size: 11px; color: var(--admin-fg-dim); text-align: center;">
        ⏳ Cargando catálogo completo de obras (15.000+)...
      </div>
    `;
    resultsBox.classList.remove('hidden');
    return;
  }

  const cleanQuery = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const selectedIds = new Set(itineraryAdminState.currentFormSelectedWorks.map((w) => String(w.id)));

  // Búsqueda en catálogo insensible a mayúsculas y acentos
  const matches = itineraryAdminState.catalog.filter((b) => {
    if (selectedIds.has(String(b.id))) return false;
    const fullText = `${b.nombre_obra || ''} ${b.arquitectos || b.arquitecto || ''} ${b.ciudad || b.place || ''} ${b.id || ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return fullText.includes(cleanQuery);
  }).slice(0, 30);

  if (matches.length === 0) {
    resultsBox.innerHTML = `
      <div style="padding: 12px; font-family: 'JetBrains Mono'; font-size: 11px; color: var(--admin-fg-dim); text-align: center;">
        No se encontraron obras coincidentes para "${escapeHtml(query)}".
      </div>
    `;
    resultsBox.classList.remove('hidden');
    return;
  }

  resultsBox.innerHTML = matches.map((obra) => {
    const catColor = CATEGORY_META[obra.categoria]?.color || '#E84E1B';
    return `
      <div class="building-search-item" data-id="${escapeHtml(obra.id)}">
        <div style="flex: 1; min-width: 0; padding-right: 12px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; background: ${catColor}; border: 1px solid #111; display: inline-block;"></span>
            <strong style="font-size: 13px;">${escapeHtml(obra.nombre_obra || 'Sin título')}</strong>
            <span style="font-size: 11px; color: var(--admin-fg-dim);">(${obra.año_construccion || 's/f'})</span>
          </div>
          <div style="font-size: 11px; color: var(--admin-fg-dim); font-family: 'JetBrains Mono'; margin-top: 2px;">
            ${escapeHtml(obra.arquitecto || obra.arquitectos || 'Autor desconocido')} • ${escapeHtml(obra.place || obra.ciudad || 'VLC')} • ID: ${escapeHtml(obra.id)}
          </div>
        </div>
        <button type="button" class="admin-btn admin-btn-approve btn-add-building-to-route" data-id="${escapeHtml(obra.id)}" style="padding: 4px 10px; font-weight: 800; font-size: 11px;">
          + AÑADIR
        </button>
      </div>
    `;
  }).join('');

  resultsBox.classList.remove('hidden');

  // Event listener para añadir al hacer clic
  resultsBox.querySelectorAll('.btn-add-building-to-route').forEach((btn) => {
    btn.onclick = (event) => {
      event.stopPropagation();
      const obraId = btn.dataset.id;
      const obra = itineraryAdminState.catalogMap.get(String(obraId));
      if (obra) {
        itineraryAdminState.currentFormSelectedWorks.push(obra);
        renderFormSelectedWorksList();
        btn.closest('.building-search-item')?.remove();
        if (resultsBox.children.length === 0) resultsBox.classList.add('hidden');
      }
    };
  });
}

function renderFormSelectedWorksList() {
  const container = document.getElementById('form-selected-works-container');
  const countBadge = document.getElementById('form-selected-count-badge');
  const list = itineraryAdminState.currentFormSelectedWorks;

  if (countBadge) countBadge.textContent = `${list.length} OBRAS AÑADIDAS`;

  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px 12px; font-family: 'JetBrains Mono'; font-size: 11px; color: var(--admin-fg-dim);">
        Aún no has añadido obras. Busca arriba por nombre, arquitecto o ciudad para añadirlas una a una.
      </div>
    `;
    return;
  }

  container.innerHTML = list.map((obra, index) => {
    const catColor = CATEGORY_META[obra.categoria]?.color || '#E84E1B';
    return `
      <div class="selected-work-row" data-id="${escapeHtml(obra.id)}" data-index="${index}">
        <span class="selected-work-num">${index + 1}.</span>
        <div class="selected-work-info">
          <div class="selected-work-title">
            <span style="width: 8px; height: 8px; background: ${catColor}; border: 1px solid #111; display: inline-block; margin-right: 4px;"></span>
            ${escapeHtml(obra.nombre_obra || 'Sin título')} <span style="font-weight: 400; color: var(--admin-fg-dim);">(${obra.año_construccion || 's/f'})</span>
          </div>
          <div class="selected-work-sub">
            ${escapeHtml(obra.arquitecto || 'Autor desconocido')} • ${escapeHtml(obra.place || obra.ciudad || 'VLC')}
          </div>
        </div>

        <div class="selected-work-btns">
          <button type="button" class="btn-icon-small btn-move-up" data-index="${index}" title="Subir parada" ${index === 0 ? 'disabled style="opacity:0.3;cursor:default;"' : ''}>▲</button>
          <button type="button" class="btn-icon-small btn-move-down" data-index="${index}" title="Bajar parada" ${index === list.length - 1 ? 'disabled style="opacity:0.3;cursor:default;"' : ''}>▼</button>
          <button type="button" class="btn-icon-small btn-remove-work" data-index="${index}" title="Quitar obra del itinerario" style="color: var(--admin-red); font-weight: 800;">✕</button>
        </div>
      </div>
    `;
  }).join('');

  // Event listeners de reordenación y eliminación
  container.querySelectorAll('.btn-move-up').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.index);
      if (idx > 0) {
        const item = list.splice(idx, 1)[0];
        list.splice(idx - 1, 0, item);
        renderFormSelectedWorksList();
      }
    };
  });

  container.querySelectorAll('.btn-move-down').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.index);
      if (idx < list.length - 1) {
        const item = list.splice(idx, 1)[0];
        list.splice(idx + 1, 0, item);
        renderFormSelectedWorksList();
      }
    };
  });

  container.querySelectorAll('.btn-remove-work').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.index);
      list.splice(idx, 1);
      renderFormSelectedWorksList();
    };
  });
}

// =========================================================================
// 6. GUARDADO DE ITINERARIO
// =========================================================================
async function handleSaveItinerary(e) {
  e.preventDefault();
  const saveBtn = document.getElementById('btn-save-itinerary');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'GUARDANDO...';
  }

  try {
    const id = document.getElementById('form-id').value.trim();
    const title = document.getElementById('form-title').value.trim();
    const subtitle = document.getElementById('form-subtitle').value.trim();
    const tag = document.getElementById('form-tag').value.trim() || 'MOVIMIENTO MODERNO';
    const color = document.getElementById('form-color').value.trim() || '#E84E1B';
    const order_num = Number(document.getElementById('form-order').value || 0);
    const active = document.getElementById('form-active').checked;
    const isEdit = document.getElementById('form-is-edit').value === 'true';

    const workIds = itineraryAdminState.currentFormSelectedWorks.map((w) => String(w.id));
    const stops = `${workIds.length} OBRAS`;

    const data = {
      id,
      title,
      subtitle,
      tag,
      color,
      stops,
      work_ids: workIds,
      workIds: workIds,
      order_num,
      active,
    };

    if (isEdit) {
      await updateItinerary(id, data, itineraryAdminState.token);
      itineraryAdminState.itineraries = itineraryAdminState.itineraries.map((r) => (r.id === id ? { ...r, ...data } : r));
    } else {
      const created = await createItinerary(data, itineraryAdminState.token);
      itineraryAdminState.itineraries.push(created || data);
    }

    closeItineraryModal();
    renderItinerariesList();
    updateStats();
    alert(`Itinerario "${data.title}" con ${workIds.length} obras guardado con éxito.`);

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
