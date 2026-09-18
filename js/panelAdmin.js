/* =========================================================================
   PANELADMIN.JS — Controlador del Centro de Control Maestro (panel-admin.html)
   Macroherramientas de gestión, simulador de herencia en vivo y auditoría global.
   ========================================================================= */

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { 
  fetchCurrentUser, 
  fetchUserRole, 
  fetchPendingBuildings, 
  fetchAllBuildingsForAdmin, 
  fetchBuildingReports, 
  fetchUserDirectory, 
  reviewBuilding, 
  deleteBuilding, 
  updateBuilding,
  updateUserRole,
  getBuildingsCatalog,
  invalidateCatalogCache,
  loginAdmin
} from './api.js';
import { 
  escapeHtml, 
  normalizarCategoria, 
  formatCategoria, 
  separarArquitectos, 
  limpiarNombreArquitecto,
  extraerIntervenciones,
  CATEGORY_META 
} from './state.js';
import { 
  STUDIO_RELATIONSHIPS as SEED_RELATIONSHIPS, 
  normalizeArchitectKey 
} from './architectRelationships.js';

const SESSION_KEY = 'nolli_admin_session_token';
const LOCAL_RELATIONSHIPS_KEY = 'nolli_admin_custom_relationships_v1';

// Estado global del Panel de Macroherramientas
const state = {
  token: null,
  user: null,
  role: null,
  activeTab: 'dashboard',
  allBuildings: [],
  pendingBuildings: [],
  users: [],
  reports: [],
  relationships: [],
  selectedBuildingIds: new Set(),
  editingRelationshipId: null,
  isLoading: false,
};

// =========================================================================
// 1. INICIALIZACIÓN Y SEGURIDAD (GUARDIA DE ACCESO)
// =========================================================================

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  setupNavTabs();
  setupModalListeners();
  await checkAuthAndInitialize();
});

function initTheme() {
  const savedTheme = localStorage.getItem('nolli_theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
  }
  const btnTheme = document.getElementById('btn-theme-toggle');
  btnTheme?.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-mode');
    try {
      localStorage.setItem('nolli_theme', isDark ? 'dark' : 'light');
    } catch {}
    if (window.lucide) window.lucide.createIcons();
  });
}

async function checkAuthAndInitialize() {
  const loadingEl = document.getElementById('admin-loading');
  const lockScreen = document.getElementById('admin-lock-screen');
  const mainApp = document.getElementById('panel-main-app');

  loadingEl?.classList.remove('hidden');

  try {
    const rawSession = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!rawSession) {
      showLockScreen('AUTENTICACIÓN REQUERIDA', 'Debes iniciar sesión con una cuenta de administrador para acceder a esta consola.');
      return;
    }

    let parsed = JSON.parse(rawSession);
    const token = parsed.access_token || parsed;

    const [user, role] = await Promise.all([
      fetchCurrentUser(token).catch(() => null),
      fetchUserRole(token).catch(() => null)
    ]);

    const isFounder = user?.email?.toLowerCase() === 'studio.signes@gmail.com';
    const hasAdminRole = role === 'admin' || role === 'superadmin' || isFounder;

    if (!user || !hasAdminRole) {
      showLockScreen('ACCESO DENEGADO (403)', 'Esta consola maestra está restringida exclusivamente a administradores.');
      return;
    }

    state.token = token;
    state.user = user;
    state.role = role || (isFounder ? 'superadmin' : 'admin');

    // Actualizar datos del usuario en la cabecera
    const emailEl = document.getElementById('admin-user-email');
    const roleEl = document.getElementById('admin-user-role');
    if (emailEl) emailEl.textContent = user.email || 'Admin';
    if (roleEl) roleEl.textContent = state.role.toUpperCase();

    // Mostrar app principal
    lockScreen?.classList.add('hidden');
    mainApp?.classList.remove('hidden');

    // Cargar datos del sistema
    await loadInitialData();
  } catch (err) {
    console.error('Error durante la autenticación:', err);
    showLockScreen('ERROR DE SESIÓN', 'No se pudo verificar la sesión de administración.');
  } finally {
    loadingEl?.classList.add('hidden');
    if (window.lucide) window.lucide.createIcons();
  }
}

function showLockScreen(title, message) {
  const loadingEl = document.getElementById('admin-loading');
  const lockScreen = document.getElementById('admin-lock-screen');
  const mainApp = document.getElementById('panel-main-app');

  loadingEl?.classList.add('hidden');
  mainApp?.classList.add('hidden');
  lockScreen?.classList.remove('hidden');

  const titleEl = document.getElementById('lock-screen-title');
  const descEl = document.getElementById('lock-screen-desc');
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = message;

  setupLockScreenLogin();
}

function setupLockScreenLogin() {
  const form = document.getElementById('lock-login-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('lock-login-email')?.value.trim();
    const password = document.getElementById('lock-login-password')?.value;
    const btnSubmit = document.getElementById('btn-lock-submit');

    if (!email || !password) {
      showToast('Por favor, completa todos los campos.');
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'VERIFICANDO...';
    }

    try {
      const authData = await loginAdmin(email, password);
      if (authData?.access_token) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(authData));
        showToast('Credenciales verificadas con éxito.');
        window.location.reload();
      } else {
        throw new Error('No se recibió token de acceso.');
      }
    } catch (err) {
      showToast(err.message || 'Error de acceso denegado.');
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'AUTORIZAR ACCESO';
      }
    }
  });
}

// =========================================================================
// 2. CARGA DE DATOS CENTRALIZADA
// =========================================================================

async function loadInitialData() {
  showToast('Cargando catálogo maestro y relaciones...');
  
  // 1. Cargar relaciones (local storage overrides or seed)
  loadRelationships();

  // 2. Cargar edificios y pendientes
  try {
    const [allCatalog, pending] = await Promise.all([
      fetchAllBuildingsForAdmin(state.token).catch(() => getBuildingsCatalog()),
      fetchPendingBuildings(state.token).catch(() => [])
    ]);

    state.allBuildings = Array.isArray(allCatalog) ? allCatalog : [];
    state.pendingBuildings = Array.isArray(pending) ? pending : [];

    // Renderizar Dashboard inicial
    renderDashboardKPIs();
    renderRelationshipsTable();
    initSimulator();
    renderNormalizerAudit();
    renderIntegrityAudit();
  } catch (err) {
    console.error('Error cargando catálogo:', err);
    showToast('Aviso: Error cargando datos de edificios.');
  }

  // 3. Carga en segundo plano de usuarios e incidencias
  fetchUserDirectory(state.token)
    .then((users) => {
      state.users = Array.isArray(users) ? users : [];
      renderUsersTable();
      renderDashboardKPIs();
    })
    .catch((err) => console.warn('Usuarios error:', err));

  fetchBuildingReports(state.token)
    .then((reports) => {
      state.reports = Array.isArray(reports) ? reports : [];
      renderDashboardKPIs();
    })
    .catch((err) => console.warn('Reportes error:', err));
}

function loadRelationships() {
  try {
    const custom = localStorage.getItem(LOCAL_RELATIONSHIPS_KEY);
    if (custom) {
      state.relationships = JSON.parse(custom);
      return;
    }
  } catch (e) {
    console.warn('Error leyendo relaciones de localStorage:', e);
  }
  // Clonar las del catálogo semilla
  state.relationships = JSON.parse(JSON.stringify(SEED_RELATIONSHIPS));
}

function saveRelationships() {
  try {
    localStorage.setItem(LOCAL_RELATIONSHIPS_KEY, JSON.stringify(state.relationships));
  } catch (e) {
    console.warn('Error guardando relaciones:', e);
  }
}

// =========================================================================
// 3. PESTAÑA 01: MACRO-DASHBOARD (KPIS Y SALUD DEL SISTEMA)
// =========================================================================

function renderDashboardKPIs() {
  const total = state.allBuildings.length;
  const published = state.allBuildings.filter((b) => (b.estado_revision || 'publicada') === 'publicada').length;
  const pending = state.pendingBuildings.length;
  const noPhoto = state.allBuildings.filter((b) => !b.foto_url || !String(b.foto_url).trim()).length;
  const noArq = state.allBuildings.filter((b) => !b.arquitecto || !String(b.arquitecto).trim()).length;
  const withInterventions = state.allBuildings.filter((b) => /\(\d{4}(?:-\d{4})?\)/.test(b.arquitecto || '')).length;

  document.getElementById('kpi-total-buildings').textContent = total.toLocaleString();
  document.getElementById('kpi-published-buildings').textContent = published.toLocaleString();
  document.getElementById('kpi-pending-buildings').textContent = pending.toLocaleString();
  document.getElementById('kpi-no-photo').textContent = noPhoto.toLocaleString();
  document.getElementById('kpi-no-arq').textContent = noArq.toLocaleString();
  document.getElementById('kpi-with-interventions').textContent = withInterventions.toLocaleString();
  document.getElementById('kpi-studios-count').textContent = state.relationships.length.toString();
  document.getElementById('kpi-users-count').textContent = state.users.length.toString();

  // Badges en pestañas de navegación
  const badgePending = document.getElementById('nav-badge-pending');
  if (badgePending) badgePending.textContent = pending.toString();
  const badgeStudios = document.getElementById('nav-badge-studios');
  if (badgeStudios) badgeStudios.textContent = state.relationships.length.toString();
  const badgeUsers = document.getElementById('nav-badge-users');
  if (badgeUsers) badgeUsers.textContent = state.users.length.toString();
}

// =========================================================================
// 4. PESTAÑA 02: GESTOR DE RELACIONES & SIMULADOR EN VIVO
// =========================================================================

function renderRelationshipsTable(filterText = '') {
  const tbody = document.getElementById('relationships-table-body');
  if (!tbody) return;

  const q = normalizeArchitectKey(filterText);
  const filtered = state.relationships.filter((rel) => {
    if (!q) return true;
    if (normalizeArchitectKey(rel.studio).includes(q)) return true;
    if (rel.members.some((m) => normalizeArchitectKey(m).includes(q))) return true;
    if (rel.aliases?.some((a) => normalizeArchitectKey(a).includes(q))) return true;
    return false;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--admin-fg-dim);">No se encontraron estudios o colectivos que coincidan con "${escapeHtml(filterText)}".</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((rel, index) => {
    const membersHtml = rel.members.map((m) => `<span class="pill-sm">${escapeHtml(m)}</span>`).join(' ');
    const aliasesHtml = (rel.aliases || []).map((a) => `<span class="pill-sm" style="opacity:0.8;">${escapeHtml(a)}</span>`).join(' ') || '<em style="color:var(--admin-fg-dim); font-size:11px;">Sin alias</em>';

    return `
      <tr>
        <td style="font-weight:800; font-family:var(--font-display); font-size:13px;">
          ${escapeHtml(rel.studio)}
          <div style="font-family:var(--font-body); font-size:10px; font-weight:400; color:var(--admin-fg-muted);">${escapeHtml(rel.id)}</div>
        </td>
        <td><div class="pills-group">${membersHtml}</div></td>
        <td><div class="pills-group">${aliasesHtml}</div></td>
        <td>
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

// Simulador de herencia direccional
function initSimulator() {
  const input = document.getElementById('sim-architect-input');
  if (!input) return;

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

    // Calcular con las relaciones vivas del estado
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

    // Filtrar catálogo real
    const normTerms = terms.map((t) => normalizeArchitectKey(t)).filter(Boolean);
    const matchingWorks = state.allBuildings.filter((b) => {
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
            <span style="color:var(--admin-fg-muted); font-size:10.5px;">${escapeHtml(w.arquitecto || '—')}</span>
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

  // 1. Es estudio
  const studio = state.relationships.find((r) => {
    return r.id === key || normalizeArchitectKey(r.studio) === key || r.aliases?.some((a) => normalizeArchitectKey(a) === key);
  });

  if (studio) {
    const terms = new Set();
    terms.add(studio.studio);
    studio.aliases?.forEach((a) => terms.add(a));
    return [...terms];
  }

  // 2. Es miembro
  const memberStudios = state.relationships.filter((r) => {
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
  return state.relationships.some((r) => r.id === key || normalizeArchitectKey(r.studio) === key || r.aliases?.some((a) => normalizeArchitectKey(a) === key));
}

function isMemberInState(input) {
  const key = normalizeArchitectKey(input);
  return state.relationships.some((r) => r.members.some((m) => normalizeArchitectKey(m) === key));
}

// Modal de Creación / Edición de Relaciones
function openRelationshipModal(relationshipId = null) {
  state.editingRelationshipId = relationshipId;
  const modal = document.getElementById('modal-relationship');
  const titleEl = document.getElementById('modal-rel-title');
  const studioInput = document.getElementById('rel-studio-name');
  const membersWrap = document.getElementById('rel-members-chips');
  const aliasesWrap = document.getElementById('rel-aliases-chips');

  if (relationshipId) {
    const rel = state.relationships.find((r) => r.id === relationshipId);
    if (!rel) return;
    titleEl.textContent = `EDITAR // ${rel.studio.toUpperCase()}`;
    studioInput.value = rel.studio;
    renderChipsList(membersWrap, rel.members || []);
    renderChipsList(aliasesWrap, rel.aliases || []);
  } else {
    titleEl.textContent = 'NUEVO ESTUDIO / COLECTIVO';
    studioInput.value = '';
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
  `).join('') + `<input type="text" class="chip-add-input" placeholder="+ Escribir y pulsar Enter..." style="border:none; outline:none; background:transparent; font-size:12px; min-width:140px; padding:4px;">`;

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
    showToast('Debes indicar el nombre oficial del estudio.');
    return;
  }

  const id = normalizeArchitectKey(studioName);

  if (state.editingRelationshipId) {
    // Editar existente
    const idx = state.relationships.findIndex((r) => r.id === state.editingRelationshipId);
    if (idx !== -1) {
      state.relationships[idx] = {
        ...state.relationships[idx],
        studio: studioName,
        members,
        aliases,
      };
    }
  } else {
    // Crear nuevo
    if (state.relationships.some((r) => r.id === id)) {
      showToast('Ya existe un estudio con ese identificador.');
      return;
    }
    state.relationships.push({
      id,
      studio: studioName,
      members,
      aliases,
    });
  }

  saveRelationships();
  renderRelationshipsTable();
  renderDashboardKPIs();
  closeRelationshipModal();
  showToast(`Relación "${studioName}" guardada correctamente.`);

  // Actualizar simulador si tiene ese valor
  const simInput = document.getElementById('sim-architect-input');
  if (simInput && simInput.value) {
    simInput.dispatchEvent(new Event('input'));
  }
}

function closeRelationshipModal() {
  document.getElementById('modal-relationship')?.classList.remove('open');
  state.editingRelationshipId = null;
}

function exportRelationshipsCode() {
  const tsCode = `export const STUDIO_RELATIONSHIPS: StudioRelationship[] = ${JSON.stringify(state.relationships, null, 2)};`;
  navigator.clipboard.writeText(tsCode).then(() => {
    showToast('Código TypeScript copiado al portapapeles.');
  }).catch(() => {
    showToast('No se pudo copiar automáticamente.');
  });
}

// =========================================================================
// 5. PESTAÑA 03: NORMALIZADOR DE AUTORES & INTERVENCIONES
// =========================================================================

function renderNormalizerAudit() {
  const tbody = document.getElementById('interventions-table-body');
  if (!tbody) return;

  const withInterventions = state.allBuildings.filter((b) => /\(\d{4}(?:-\d{4})?\)/.test(b.arquitecto || ''));

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
        <td style="font-family:var(--font-mono); font-size:11px; background:var(--admin-elevated); padding:6px 10px;">${escapeHtml(rawArq)}</td>
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
    showToast('Por favor, indica tanto el autor a sustituir como el autor destino.');
    return;
  }

  const matches = state.allBuildings.filter((b) => {
    return (b.arquitecto || '').toLowerCase().includes(oldAuthor.toLowerCase());
  });

  if (matches.length === 0) {
    showToast(`No se encontraron obras que contengan "${oldAuthor}".`);
    return;
  }

  const confirmed = confirm(`Se actualizarán ${matches.length} obras en la base de datos cambiando "${oldAuthor}" por "${newAuthor}". ¿Continuar?`);
  if (!confirmed) return;

  showToast(`Actualizando ${matches.length} obras en lote...`);

  let updatedCount = 0;
  for (const b of matches) {
    try {
      const updatedArq = (b.arquitecto || '').replace(new RegExp(oldAuthor, 'gi'), newAuthor);
      await updateBuilding(b.id, { arquitecto: updatedArq }, state.token);
      b.arquitecto = updatedArq;
      updatedCount++;
    } catch (e) {
      console.warn(`Error al actualizar obra ${b.id}:`, e);
    }
  }

  showToast(`¡Completado! ${updatedCount} obras actualizadas.`);
  renderNormalizerAudit();
  renderIntegrityAudit();
  invalidateCatalogCache();
}

// =========================================================================
// 6. PESTAÑA 04: AUDITORÍA DE INTEGRIDAD & OPERACIONES EN LOTE
// =========================================================================

function renderIntegrityAudit(filterType = 'all', searchQuery = '') {
  const tbody = document.getElementById('integrity-table-body');
  if (!tbody) return;

  const q = normalizeArchitectKey(searchQuery);

  const filtered = state.allBuildings.filter((b) => {
    // 1. Filtro de anomalía
    if (filterType === 'no-photo' && (b.foto_url && String(b.foto_url).trim())) return false;
    if (filterType === 'no-arq' && (b.arquitecto && String(b.arquitecto).trim())) return false;
    if (filterType === 'no-coords' && (Number.isFinite(b.latitud) && Number.isFinite(b.longitud) && (b.latitud !== 0 || b.longitud !== 0))) return false;
    if (filterType === 'no-r2' && (!b.foto_url || b.foto_url.includes('imagedelivery.net') || b.foto_url.includes('cloudflare'))) return false;
    if (filterType === 'pending' && (b.estado_revision !== 'pendiente')) return false;

    // 2. Filtro de búsqueda
    if (q) {
      const haystack = normalizeArchitectKey(`${b.nombre_obra} ${b.arquitecto} ${b.place} ${b.ciudad} ${b.id}`);
      if (!haystack.includes(q)) return false;
    }

    return true;
  });

  const countBadge = document.getElementById('integrity-count-badge');
  if (countBadge) countBadge.textContent = `${filtered.length} obras encontradas`;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--admin-fg-dim);">No se encontraron obras con los criterios de auditoría seleccionados.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.slice(0, 100).map((b) => {
    const isChecked = state.selectedBuildingIds.has(String(b.id));
    const hasPhoto = Boolean(b.foto_url && String(b.foto_url).trim());
    const hasArq = Boolean(b.arquitecto && String(b.arquitecto).trim());
    const hasCoords = Number.isFinite(b.latitud) && Number.isFinite(b.longitud) && (b.latitud !== 0 || b.longitud !== 0);
    const status = b.estado_revision || 'publicada';

    let statusBadge = `<span class="badge-tag badge-tag-success">${status.toUpperCase()}</span>`;
    if (status === 'pendiente') statusBadge = `<span class="badge-tag badge-tag-warning">PENDIENTE</span>`;
    if (status === 'rechazada') statusBadge = `<span class="badge-tag badge-tag-danger">RECHAZADA</span>`;

    return `
      <tr>
        <td>
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
          ${hasPhoto ? '<span style="color:var(--admin-success); font-weight:700;">✓ R2</span>' : '<span style="color:var(--admin-danger); font-weight:700;">⚠️ Sin foto</span>'}
        </td>
        <td>
          <button type="button" class="btn-action-icon" data-work-edit="${b.id}" title="Editar obra">
            <i data-lucide="external-link" width="13" height="13"></i>
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

  const count = state.selectedBuildingIds.size;
  if (count > 0) {
    if (countLabel) countLabel.textContent = `${count} obra${count === 1 ? '' : 's'} seleccionada${count === 1 ? '' : 's'}`;
    bar.classList.add('visible');
  } else {
    bar.classList.remove('visible');
  }
}

async function executeBatchStatus(newStatus) {
  const ids = Array.from(state.selectedBuildingIds);
  if (ids.length === 0) return;

  const confirmed = confirm(`¿Cambiar estado a "${newStatus.toUpperCase()}" para las ${ids.length} obras seleccionadas?`);
  if (!confirmed) return;

  showToast(`Aplicando estado "${newStatus}" a ${ids.length} obras...`);

  let successCount = 0;
  for (const id of ids) {
    try {
      await reviewBuilding(id, newStatus, state.token);
      const b = state.allBuildings.find((item) => String(item.id) === String(id));
      if (b) b.estado_revision = newStatus;
      successCount++;
    } catch (e) {
      console.warn(`Error actualizando ${id}:`, e);
    }
  }

  showToast(`¡Completado! ${successCount} obras actualizadas.`);
  state.selectedBuildingIds.clear();
  renderIntegrityAudit();
  renderDashboardKPIs();
  invalidateCatalogCache();
}

// =========================================================================
// 7. PESTAÑA 05: DIRECTORIO DE USUARIOS Y ROLES
// =========================================================================

function renderUsersTable(searchQuery = '') {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  const q = searchQuery.toLowerCase().trim();
  const filtered = state.users.filter((u) => {
    if (!q) return true;
    const haystack = `${u.email || ''} ${u.first_name || ''} ${u.last_name || ''} ${u.city || ''} ${u.country || ''}`.toLowerCase();
    return haystack.includes(q);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--admin-fg-dim);">No se encontraron usuarios que coincidan con la búsqueda.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((u) => {
    const role = u.role || 'user';
    const isSuper = role === 'superadmin';
    const isAdmin = role === 'admin';

    return `
      <tr>
        <td style="font-weight:700;">${escapeHtml(u.email || '—')}</td>
        <td>${escapeHtml(`${u.first_name || ''} ${u.last_name || ''}`.trim() || '—')}</td>
        <td>${escapeHtml(u.city || u.country || '—')}</td>
        <td>
          <select class="form-select user-role-select" data-user-id="${u.id}" style="padding:3px 8px; font-size:11.5px; font-weight:700;">
            <option value="user" ${role === 'user' ? 'selected' : ''}>USER</option>
            <option value="editor" ${role === 'editor' ? 'selected' : ''}>EDITOR</option>
            <option value="admin" ${isAdmin ? 'selected' : ''}>ADMIN</option>
            <option value="superadmin" ${isSuper ? 'selected' : ''}>SUPERADMIN</option>
          </select>
        </td>
        <td style="color:var(--admin-fg-muted); font-size:11px;">
          ${u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
        </td>
        <td>
          <span style="font-size:11px; color:var(--admin-fg-dim);">
            ${u.last_seen_at ? new Date(u.last_seen_at).toLocaleDateString() : '—'}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.user-role-select').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      const targetUserId = sel.dataset.userId;
      const newRole = sel.value;
      try {
        await updateUserRole(targetUserId, newRole, state.token);
        showToast(`Rol actualizado a "${newRole.toUpperCase()}".`);
      } catch (err) {
        showToast(err.message || 'Error al actualizar el rol.');
      }
    });
  });
}

// =========================================================================
// 8. PESTAÑA 06: SISTEMA & CACHÉS
// =========================================================================

async function triggerRevalidateCatalog() {
  const btn = document.getElementById('btn-trigger-revalidate');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'REVALIDANDO CDN...';
  }

  try {
    const res = await fetch('./api/revalidate-catalog', { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    showToast('¡Catálogo CDN purgado y revalidado con éxito!');
    logSystemEvent('Revalidación manual de CDN ejecutada con éxito.');
  } catch (err) {
    showToast('Aviso: Fallo al revalidar CDN.');
    console.warn('Revalidate error:', err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'PURGAR CACHÉ CDN (/api/revalidate-catalog)';
    }
  }
}

function clearLocalCaches() {
  invalidateCatalogCache();
  showToast('Caché local e IndexedDB purgadas con éxito.');
  logSystemEvent('Caché local e IndexedDB reseteadas.');
  setTimeout(() => window.location.reload(), 800);
}

function logSystemEvent(msg) {
  const logEl = document.getElementById('system-log-console');
  if (!logEl) return;
  const time = new Date().toLocaleTimeString();
  logEl.innerHTML = `[${time}] ${escapeHtml(msg)}\n` + logEl.innerHTML;
}

// =========================================================================
// 9. NAVEGACIÓN ENTRE PESTAÑAS Y EVENTOS UI
// =========================================================================

function setupNavTabs() {
  const tabs = document.querySelectorAll('.nav-tab-btn');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      switchTab(target);
    });
  });

  // Delegación de clics generales
  document.addEventListener('click', (e) => {
    // Probar en simulador desde tabla
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

    // Editar relación
    const editBtn = e.target.closest('[data-rel-edit]');
    if (editBtn) {
      openRelationshipModal(editBtn.dataset.relEdit);
      return;
    }

    // Eliminar relación
    const delBtn = e.target.closest('[data-rel-delete]');
    if (delBtn) {
      const relId = delBtn.dataset.relDelete;
      const rel = state.relationships.find((r) => r.id === relId);
      if (rel && confirm(`¿Eliminar la relación de "${rel.studio}"?`)) {
        state.relationships = state.relationships.filter((r) => r.id !== relId);
        saveRelationships();
        renderRelationshipsTable();
        renderDashboardKPIs();
        showToast(`Relación "${rel.studio}" eliminada.`);
      }
      return;
    }

    // Checkbox selección de obras
    const check = e.target.closest('.work-select-check');
    if (check) {
      const id = String(check.dataset.workId);
      if (check.checked) {
        state.selectedBuildingIds.add(id);
      } else {
        state.selectedBuildingIds.delete(id);
      }
      updateBatchBar();
      return;
    }
  });

  // Buscador de relaciones
  const searchRelInput = document.getElementById('search-relationships');
  searchRelInput?.addEventListener('input', () => {
    renderRelationshipsTable(searchRelInput.value);
  });

  // Botón nueva relación
  document.getElementById('btn-new-relationship')?.addEventListener('click', () => {
    openRelationshipModal(null);
  });

  // Botón exportar código
  document.getElementById('btn-export-relationships')?.addEventListener('click', exportRelationshipsCode);

  // Fusión de autor en lote
  document.getElementById('btn-execute-author-merge')?.addEventListener('click', executeBatchAuthorMerge);

  // Auditoría: filtro por tipo y búsqueda
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
      if (isChecked) state.selectedBuildingIds.add(id);
      else state.selectedBuildingIds.delete(id);
    });
    updateBatchBar();
  });

  // Acciones en lote
  document.getElementById('btn-batch-publish')?.addEventListener('click', () => executeBatchStatus('publicada'));
  document.getElementById('btn-batch-reject')?.addEventListener('click', () => executeBatchStatus('rechazada'));
  document.getElementById('btn-batch-clear')?.addEventListener('click', () => {
    state.selectedBuildingIds.clear();
    document.querySelectorAll('.work-select-check').forEach((c) => { c.checked = false; });
    const master = document.getElementById('check-select-all-works');
    if (master) master.checked = false;
    updateBatchBar();
  });

  // Buscador de usuarios
  document.getElementById('search-users-input')?.addEventListener('input', (e) => {
    renderUsersTable(e.target.value);
  });

  // Acciones de sistema
  document.getElementById('btn-trigger-revalidate')?.addEventListener('click', triggerRevalidateCatalog);
  document.getElementById('btn-clear-local-caches')?.addEventListener('click', clearLocalCaches);
}

function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.nav-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-view').forEach((view) => {
    view.classList.toggle('active', view.id === `view-${tabId}`);
  });
  if (window.lucide) window.lucide.createIcons();
}

function setupModalListeners() {
  document.getElementById('btn-close-modal-rel')?.addEventListener('click', closeRelationshipModal);
  document.getElementById('btn-cancel-rel')?.addEventListener('click', closeRelationshipModal);
  document.getElementById('btn-save-rel')?.addEventListener('click', saveRelationshipModal);
}

// Toast de notificación flotante
function showToast(message) {
  const existing = document.querySelector('.panel-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'panel-toast';
  toast.innerHTML = `<i data-lucide="info" width="16" height="16"></i><span>${escapeHtml(message)}</span>`;
  document.body.appendChild(toast);

  if (window.lucide) window.lucide.createIcons({ context: toast });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}
