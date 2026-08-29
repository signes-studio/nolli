/* =========================================================================
   MODALSUI.JS — Modal de login de administrador y modal de alta de edificio
   ========================================================================= */

import { state, separarArquitectos, normalizarCategoria, esRolAdmin } from './state.js';
import { loginAdmin, registerUser, refreshUserSession, requestPasswordReset, fetchUserRole, fetchCurrentUser, fetchBuildingStatuses, upsertCurrentProfile, createBuildingReport, createBuilding, createPrivateBuilding, updateBuilding } from './api.js';
import { actualizarFuenteMapa } from './mapData.js';
import { generarFiltrosUI } from './filtersUI.js';

const ADMIN_SESSION_KEY = 'nolli_admin_session_token';

/* -------------------------------------------------------------------------
   MÓDULO DE LOGIN
   ------------------------------------------------------------------------- */
async function initLoginModal() {
  const mLogin = document.getElementById('modal-login');
  const bLoginT = document.getElementById('btn-login-trigger');
  const title = document.getElementById('modal-login-title');
  const actionButton = document.getElementById('btn-do-login');
  const loginForm = document.getElementById('login-form');
  const registerButton = document.getElementById('btn-register-mode');
  const logoutButton = document.getElementById('btn-logout');
  const adminModeControl = document.getElementById('admin-mode-control');
  const adminModeToggle = document.getElementById('admin-mode-toggle');
  const registerOnlyFields = document.querySelectorAll('.register-only-field');
  const loginEntryFields = document.querySelectorAll('.login-entry-field');
  const keepSession = document.getElementById('keep-session');
  const forgotPasswordButton = document.getElementById('btn-forgot-password');
  const passwordInput = document.getElementById('login-password');
  const togglePassword = document.getElementById('toggle-password');
  let registerMode = false;

  const marcarSesionIniciada = (role) => {
    const canUseAdminTools = esRolAdmin(role);
    state.adminMode = canUseAdminTools;
    adminModeControl.classList.toggle('hidden', !canUseAdminTools);
    adminModeToggle.checked = state.adminMode;
    bLoginT.textContent = canUseAdminTools ? '[ ADMIN DESBLOQUEADO ]' : '[ SESIÓN INICIADA ]';
    bLoginT.style.color = 'var(--accent-2)';
    bLoginT.style.borderColor = 'var(--accent-2)';
    bLoginT.style.background = 'rgba(239, 188, 2, 0.12)';
    logoutButton.classList.remove('hidden');
    loginEntryFields.forEach((field) => field.classList.add('hidden'));
    if (canUseAdminTools) document.dispatchEvent(new CustomEvent('radar:admin-login'));
    else document.dispatchEvent(new CustomEvent('radar:user-login'));
  };

  adminModeToggle.addEventListener('change', () => {
    if (!esRolAdmin(state.userRole)) return;
    state.adminMode = adminModeToggle.checked;
    document.dispatchEvent(new CustomEvent('radar:admin-mode-change'));
  });

  const cargarEstadoUsuario = async () => {
    const user = await fetchCurrentUser(state.sessionToken);
    state.userId = user.id;
    state.userEmail = user.email || null;
    state.userProfile = {
      firstName: user.user_metadata?.first_name || '',
      lastName: user.user_metadata?.last_name || '',
      city: user.user_metadata?.city || '',
      country: user.user_metadata?.country || '',
    };
    upsertCurrentProfile(user, state.userProfile, state.sessionToken).catch(() => {});
    const statuses = await fetchBuildingStatuses(user.id, state.sessionToken);
    state.buildingStatuses = new Map(statuses.map((item) => [String(item.building_id), {
      favorite: item.favorite === true,
      visited: item.visited === true,
      notas: item.notas || '',
      valoracion: item.valoracion || null,
    }]));
    document.dispatchEvent(new CustomEvent('radar:user-status-ready'));
    document.dispatchEvent(new CustomEvent('radar:user-session-ready'));
  };

  const sesionGuardada = localStorage.getItem(ADMIN_SESSION_KEY) || sessionStorage.getItem(ADMIN_SESSION_KEY);
  if (sesionGuardada) {
    try {
      let savedSession = JSON.parse(sesionGuardada);
      if (typeof savedSession === 'string') savedSession = { access_token: savedSession };
      if (!savedSession.access_token && savedSession.refresh_token) savedSession = await refreshUserSession(savedSession.refresh_token);
      state.sessionToken = savedSession.access_token;
      try {
        state.userRole = await fetchUserRole(state.sessionToken);
      } catch (error) {
        if (!savedSession.refresh_token) throw error;
        savedSession = await refreshUserSession(savedSession.refresh_token);
        state.sessionToken = savedSession.access_token;
        state.userRole = await fetchUserRole(state.sessionToken);
      }
      await cargarEstadoUsuario();
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(savedSession));
      marcarSesionIniciada(state.userRole);
    } catch (error) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      state.sessionToken = null;
      state.userRole = null;
      state.adminMode = false;
    }
  }

  bLoginT.addEventListener('click', () => mLogin.classList.add('open'));
  togglePassword.addEventListener('click', () => {
    const showing = passwordInput.type === 'text';
    passwordInput.type = showing ? 'password' : 'text';
    togglePassword.setAttribute('aria-label', showing ? 'Mostrar contraseña' : 'Ocultar contraseña');
    togglePassword.setAttribute('aria-pressed', String(!showing));
    togglePassword.innerHTML = `<i data-lucide="${showing ? 'eye' : 'eye-off'}" width="15" height="15"></i>`;
    lucide.createIcons();
  });
  forgotPasswordButton.addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const err = document.getElementById('login-error');
    if (!email) {
      err.textContent = 'Escribe tu email para enviarte el enlace.';
      err.classList.remove('hidden');
      return;
    }
    forgotPasswordButton.disabled = true;
    forgotPasswordButton.textContent = 'ENVIANDO ENLACE...';
    try {
      await requestPasswordReset(email);
      err.textContent = 'Revisa tu correo para restablecer la contraseña.';
      err.classList.remove('hidden');
    } catch (error) {
      err.textContent = error.message;
      err.classList.remove('hidden');
    } finally {
      forgotPasswordButton.disabled = false;
      forgotPasswordButton.textContent = '¿OLVIDASTE LA CONTRASEÑA?';
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-login-close')) mLogin.classList.remove('open');
  });

  document.getElementById('btn-do-login').addEventListener('click', async () => {
    const err = document.getElementById('login-error');
    err.classList.add('hidden');

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const firstName = document.getElementById('register-first-name')?.value.trim() || '';
    const lastName = document.getElementById('register-last-name')?.value.trim() || '';
    const city = document.getElementById('register-city')?.value.trim() || '';
    const country = document.getElementById('register-country')?.value.trim() || '';
    if (!email || !password) {
      err.textContent = 'Datos incompletos.';
      err.classList.remove('hidden');
      return;
    }
    if (registerMode && (!firstName || !lastName || !city || !country)) {
      err.textContent = 'Completa nombre, apellido, ciudad y país.';
      err.classList.remove('hidden');
      return;
    }

    const btnLogin = actionButton;
    btnLogin.textContent = registerMode ? 'CREANDO...' : 'VERIFICANDO...';
    try {
      if (registerMode) {
        const data = await registerUser(email, password, { firstName, lastName, city, country });
        if (data.access_token) {
          state.sessionToken = data.access_token;
          state.userRole = 'user';
          await cargarEstadoUsuario();
          const sessionData = { access_token: data.access_token, refresh_token: data.refresh_token };
          if (keepSession.checked) localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(sessionData));
          else sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(sessionData));
          marcarSesionIniciada('user');
        }
        err.textContent = 'Cuenta creada. Revisa tu correo para confirmar el registro.';
        err.classList.remove('hidden');
      } else {
        const auth = await loginAdmin(email, password);
        state.sessionToken = auth.access_token;
        state.userRole = await fetchUserRole(state.sessionToken);
        await cargarEstadoUsuario();
        const sessionData = { access_token: auth.access_token, refresh_token: auth.refresh_token };
        if (keepSession.checked) localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(sessionData));
        else sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(sessionData));
        mLogin.classList.remove('open');
        marcarSesionIniciada(state.userRole);
      }
    } catch (error) {
      err.textContent = error.message;
      err.classList.remove('hidden');
    } finally {
      btnLogin.textContent = registerMode ? 'CREAR CUENTA' : 'AUTORIZAR ACCESO';
    }
  });

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    actionButton.click();
  });

  registerButton.addEventListener('click', () => {
    registerMode = !registerMode;
    title.textContent = registerMode ? 'REGISTRO DE USUARIO' : 'AUTENTICACIÓN REQUERIDA';
    actionButton.textContent = registerMode ? 'CREAR CUENTA' : 'AUTORIZAR ACCESO';
    registerButton.textContent = registerMode ? 'VOLVER AL LOGIN' : 'CREAR CUENTA';
    registerOnlyFields.forEach((field) => field.classList.toggle('hidden', !registerMode));
    forgotPasswordButton.classList.toggle('hidden', registerMode);
    passwordInput.autocomplete = registerMode ? 'new-password' : 'current-password';
  });

  logoutButton.addEventListener('click', () => {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    state.sessionToken = null;
    state.userRole = null;
    state.adminMode = false;
    adminModeControl.classList.add('hidden');
    adminModeToggle.checked = false;
    state.userId = null;
    state.userEmail = null;
    state.userProfile = null;
    state.buildingStatuses = new Map();
    state.userCollections = [];
    state.userCollectionItems = [];
    state.userPrivateLabels = [];
    document.dispatchEvent(new CustomEvent('radar:user-status-ready'));
    logoutButton.classList.add('hidden');
    loginEntryFields.forEach((field) => field.classList.remove('hidden'));
    bLoginT.textContent = '[ INICIAR SESIÓN ]';
    bLoginT.style.color = 'var(--accent)';
    bLoginT.style.borderColor = 'var(--accent)';
    bLoginT.style.background = 'rgba(233, 92, 12, 0.1)';
    mLogin.classList.remove('open');
    document.dispatchEvent(new CustomEvent('radar:logout'));
  });
}

/* -------------------------------------------------------------------------
   MÓDULO DE INSERCIÓN EN BD
   ------------------------------------------------------------------------- */
function initAddBuildingModal() {
  const mAdd = document.getElementById('modal-add-building');
  const closeAdd = () => {
    mAdd.classList.remove('open');
    state.pendingLngLat = null;
    state.editingBuildingId = null;
    state.addingBuilding = false;
    document.getElementById('btn-add-project').classList.remove('active-state');
  };

  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-add-close')) closeAdd();
  });
  document.getElementById('btn-add-cancel').addEventListener('click', closeAdd);

  document.addEventListener('radar:edit-building', (e) => {
    const obra = e.detail.obra;
    document.getElementById('sheet')?.classList.remove('open');
    state.editingBuildingId = obra.id;
    state.pendingLngLat = { lng: obra.coordenadas[0], lat: obra.coordenadas[1] };
    document.getElementById('modal-add-title').textContent = 'EDITAR OBRA (DB)';
    document.getElementById('btn-add-save').innerHTML = 'GUARDAR CAMBIOS';
    document.getElementById('add-coords').textContent = `${obra.coordenadas[0].toFixed(5)}, ${obra.coordenadas[1].toFixed(5)}`;
    document.getElementById('add-nombre').value = obra.nombre_obra || '';
    document.getElementById('add-foto').value = obra.foto_url || '';
    document.getElementById('add-enlace').value = obra.enlace_url || '';
    document.getElementById('add-arquitecto').value = obra.arquitecto || '';
    document.getElementById('add-ano').value = obra.año_construccion || '';
    document.getElementById('add-importancia').value = String(obra.importancia || 1);
    document.getElementById('add-categoria').value = normalizarCategoria(obra.categoria);
    document.getElementById('add-acceso').value = obra.estado_acceso || 'publico';
    document.getElementById('add-error').classList.add('hidden');
    mAdd.classList.add('open');
  });

  document.getElementById('btn-add-save').addEventListener('click', async () => {
    const err = document.getElementById('add-error');
    err.classList.add('hidden');

    const nombre = document.getElementById('add-nombre').value.trim();
    const fotoUrl = document.getElementById('add-foto').value.trim();
    const enlaceUrl = document.getElementById('add-enlace').value.trim();
    const arq = document.getElementById('add-arquitecto').value.trim();
    const ano = parseInt(document.getElementById('add-ano').value, 10);
    const importancia = Number(document.getElementById('add-importancia').value);
    const categoria = document.getElementById('add-categoria').value;
    const estadoAcceso = document.getElementById('add-acceso').value;
    const visibility = document.getElementById('add-visibility').value;

    if (!nombre || !arq || !state.pendingLngLat) {
      err.textContent = 'Faltan datos obligatorios (Nombre y Arquitecto).';
      err.classList.remove('hidden');
      return;
    }

    const btnSave = document.getElementById('btn-add-save');
    const adminActivo = esRolAdmin(state.userRole) && state.adminMode;
    btnSave.innerHTML = visibility === 'private'
      ? 'GUARDANDO PRIVADA...'
      : adminActivo ? 'PUBLICANDO...' : 'ENVIANDO A REVISIÓN...';

    // Código técnico de fondo generado automáticamente
    const edificio = {
      nombre_obra: nombre,
      foto_url: fotoUrl || null,
      enlace_url: enlaceUrl || null,
      arquitecto: arq,
      año_construccion: Number.isNaN(ano) ? null : ano,
      importancia,
      categoria,
      estado_acceso: estadoAcceso,
      longitud: state.pendingLngLat.lng,
      latitud: state.pendingLngLat.lat,
    };

    try {
      if (state.editingBuildingId !== null) {
        const updatedData = await updateBuilding(state.editingBuildingId, edificio, state.sessionToken);
        const updated = updatedData[0];
        const obra = state.OBRAS.find((item) => String(item.id) === String(state.editingBuildingId));
        if (obra) Object.assign(obra, {
          ...edificio,
          arquitectos: separarArquitectos(arq),
          id: obra.id,
          coordenadas: [updated?.longitud ?? edificio.longitud, updated?.latitud ?? edificio.latitud],
          featureId: obra.featureId,
          selected: obra.selected,
        });
      } else {
        const nuevoEdificio = {
          ...edificio,
          id: 'VLC-' + Date.now(),
          añadido_por: adminActivo ? 'administrador' : (state.userEmail || 'usuario'),
          estado_revision: adminActivo ? 'publicada' : 'pendiente',
        };
        const privateData = {
          ...edificio,
          id: 'PRIV-' + Date.now(),
          user_id: state.userId,
        };
        const insertedData = visibility === 'private' && !adminActivo
          ? await createPrivateBuilding(privateData, state.sessionToken)
          : await createBuilding({ ...nuevoEdificio, propuesto_por: state.userId }, state.sessionToken);

        const isPrivate = visibility === 'private' && !adminActivo;
        state.OBRAS.push({
          ...(isPrivate ? privateData : nuevoEdificio),
          arquitectos: separarArquitectos(arq),
          añadido_por: nuevoEdificio.añadido_por,
          estado_revision: isPrivate ? 'privada' : nuevoEdificio.estado_revision,
          id: insertedData[0].id,
          featureId: String(insertedData[0].id ?? `obra-${Date.now()}`),
          private: visibility === 'private' && !adminActivo,
          coordenadas: [state.pendingLngLat.lng, state.pendingLngLat.lat],
          selected: false,
        });
      }
      actualizarFuenteMapa();

      // Actualizar filtros si hay un arquitecto nuevo
      const arquitectosNuevos = separarArquitectos(arq).some((nombreArquitecto) => !state.ARQUITECTOS.includes(nombreArquitecto));
      separarArquitectos(arq).forEach((nombreArquitecto) => {
        if (!state.ARQUITECTOS.includes(nombreArquitecto)) state.ARQUITECTOS.push(nombreArquitecto);
        state.activeArquitectos.add(nombreArquitecto);
      });
      if (arquitectosNuevos) generarFiltrosUI();

      closeAdd();
      document.dispatchEvent(new CustomEvent('radar:cerrar-ficha'));
    } catch (error) {
      err.textContent = error.message;
      err.classList.remove('hidden');
    } finally {
      document.getElementById('modal-add-title').textContent = 'REGISTRO DE NUEVA OBRA (DB)';
      btnSave.innerHTML = '<span class="inline-flex items-center gap-1"><i data-lucide="database" width="13" height="13"></i> PUBLICAR</span>';
      lucide.createIcons();
    }
  });

  // Se abre a partir de una pulsación larga sobre el mapa (evento emitido
  // por mapController). Mantiene ambos módulos desacoplados.
  document.addEventListener('radar:map-longpress', (e) => {
    handleMapLongPress(e.detail.lngLat);
  });
}

function handleMapLongPress(lngLat) {
  if (!state.sessionToken) {
    alert('Inicia sesión para proponer una nueva obra.');
    return;
  }
  state.editingBuildingId = null;
  state.addingBuilding = false;
  document.getElementById('btn-add-project').classList.remove('active-state');
  state.pendingLngLat = lngLat;
  document.getElementById('add-coords').textContent = `${lngLat.lng.toFixed(5)}, ${lngLat.lat.toFixed(5)}`;

  document.getElementById('add-nombre').value = '';
  document.getElementById('add-foto').value = '';
  document.getElementById('add-enlace').value = '';
  document.getElementById('add-arquitecto').value = '';
  document.getElementById('add-ano').value = '';
  document.getElementById('add-importancia').value = '1';
  document.getElementById('add-categoria').value = 'otro';
  document.getElementById('add-acceso').value = 'publico';
  const adminActivo = esRolAdmin(state.userRole) && state.adminMode;
  document.getElementById('modal-add-title').textContent = adminActivo ? 'REGISTRO DE NUEVA OBRA (DB)' : 'PROPONER NUEVA OBRA';
  document.getElementById('btn-add-save').innerHTML = adminActivo ? '<span class="inline-flex items-center gap-1"><i data-lucide="database" width="13" height="13"></i> PUBLICAR</span>' : 'ENVIAR A REVISIÓN';
  document.getElementById('add-error').classList.add('hidden');

  document.getElementById('modal-add-building').classList.add('open');
}

export function initModalsUI() {
  initLoginModal();
  initAddBuildingModal();
  initReportModal();
}

function initReportModal() {
  const modal = document.getElementById('modal-report');
  const close = () => modal.classList.remove('open');
  document.addEventListener('click', (event) => {
    if (event.target.closest('#btn-report-close') || event.target === modal) close();
  });
  document.getElementById('btn-report-submit').addEventListener('click', async () => {
    const description = document.getElementById('report-description').value.trim();
    const errorElement = document.getElementById('report-error');
    const obra = state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId));
    if (!obra || !state.userId || !state.sessionToken) return;
    if (!description) {
      errorElement.textContent = 'Describe el error antes de enviarlo.';
      errorElement.classList.remove('hidden');
      return;
    }
    const button = document.getElementById('btn-report-submit');
    button.textContent = 'ENVIANDO...';
    button.disabled = true;
    try {
      await createBuildingReport({ user_id: state.userId, building_id: obra.id, descripcion: description }, state.sessionToken);
      button.textContent = 'ENVIADO';
      setTimeout(close, 700);
    } catch (error) {
      errorElement.textContent = error.message;
      errorElement.classList.remove('hidden');
    } finally {
      button.disabled = false;
      if (!modal.classList.contains('open')) button.textContent = 'ENVIAR REPORTE';
    }
  });
}
