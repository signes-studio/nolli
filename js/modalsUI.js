/* =========================================================================
   MODALSUI.JS — Modal de login de administrador y modal de alta de edificio
   ========================================================================= */

import { state, separarArquitectos } from './state.js';
import { loginAdmin, registerUser, fetchUserRole, fetchCurrentUser, fetchBuildingStatuses, createBuilding, updateBuilding } from './api.js';
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
  const registerButton = document.getElementById('btn-register-mode');
  const logoutButton = document.getElementById('btn-logout');
  let registerMode = false;

  const marcarSesionIniciada = (role) => {
    bLoginT.textContent = role === 'admin' ? '[ ADMIN DESBLOQUEADO ]' : '[ SESIÓN INICIADA ]';
    bLoginT.style.color = 'var(--accent-2)';
    bLoginT.style.borderColor = 'var(--accent-2)';
    bLoginT.style.background = 'rgba(57, 255, 20, 0.1)';
    logoutButton.classList.remove('hidden');
    if (role === 'admin') document.dispatchEvent(new CustomEvent('radar:admin-login'));
    else document.dispatchEvent(new CustomEvent('radar:user-login'));
  };

  const cargarEstadoUsuario = async () => {
    const user = await fetchCurrentUser(state.sessionToken);
    state.userId = user.id;
    state.userEmail = user.email || null;
    const statuses = await fetchBuildingStatuses(user.id, state.sessionToken);
    state.buildingStatuses = new Map(statuses.map((item) => [String(item.building_id), {
      favorite: item.favorite === true,
      visited: item.visited === true,
      notas: item.notas || '',
      valoracion: item.valoracion || null,
    }]));
    document.dispatchEvent(new CustomEvent('radar:user-status-ready'));
  };

  const tokenGuardado = localStorage.getItem(ADMIN_SESSION_KEY);
  if (tokenGuardado) {
    try {
      state.sessionToken = tokenGuardado;
      state.userRole = await fetchUserRole(tokenGuardado);
      await cargarEstadoUsuario();
      marcarSesionIniciada(state.userRole);
    } catch (error) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      state.sessionToken = null;
      state.userRole = null;
    }
  }

  bLoginT.addEventListener('click', () => mLogin.classList.add('open'));
  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-login-close')) mLogin.classList.remove('open');
  });

  document.getElementById('btn-do-login').addEventListener('click', async () => {
    const err = document.getElementById('login-error');
    err.classList.add('hidden');

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    if (!email || !password) {
      err.textContent = 'Datos incompletos.';
      err.classList.remove('hidden');
      return;
    }

    const btnLogin = actionButton;
    btnLogin.textContent = registerMode ? 'CREANDO...' : 'VERIFICANDO...';
    try {
      if (registerMode) {
        const data = await registerUser(email, password);
        if (data.access_token) {
          state.sessionToken = data.access_token;
          state.userRole = 'user';
          await cargarEstadoUsuario();
          localStorage.setItem(ADMIN_SESSION_KEY, state.sessionToken);
          marcarSesionIniciada('user');
        }
        err.textContent = 'Cuenta creada. Revisa tu correo para confirmar el registro.';
        err.classList.remove('hidden');
      } else {
        state.sessionToken = await loginAdmin(email, password);
        state.userRole = await fetchUserRole(state.sessionToken);
        await cargarEstadoUsuario();
        localStorage.setItem(ADMIN_SESSION_KEY, state.sessionToken);
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

  registerButton.addEventListener('click', () => {
    registerMode = !registerMode;
    title.textContent = registerMode ? 'REGISTRO DE USUARIO' : 'AUTENTICACIÓN REQUERIDA';
    actionButton.textContent = registerMode ? 'CREAR CUENTA' : 'AUTORIZAR ACCESO';
    registerButton.textContent = registerMode ? 'VOLVER AL LOGIN' : 'CREAR CUENTA';
  });

  logoutButton.addEventListener('click', () => {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    state.sessionToken = null;
    state.userRole = null;
    state.userId = null;
    state.userEmail = null;
    state.buildingStatuses = new Map();
    document.dispatchEvent(new CustomEvent('radar:user-status-ready'));
    logoutButton.classList.add('hidden');
    bLoginT.textContent = '[ INICIAR SESIÓN ]';
    bLoginT.style.color = 'var(--accent)';
    bLoginT.style.borderColor = 'var(--accent)';
    bLoginT.style.background = 'rgba(255, 69, 0, 0.1)';
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
    document.getElementById('add-categoria').value = obra.categoria || 'otro';
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

    if (!nombre || !arq || !state.pendingLngLat) {
      err.textContent = 'Faltan datos obligatorios (Nombre y Arquitecto).';
      err.classList.remove('hidden');
      return;
    }

    const btnSave = document.getElementById('btn-add-save');
    btnSave.innerHTML = state.userRole === 'admin' ? 'PUBLICANDO...' : 'ENVIANDO A REVISIÓN...';

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
          añadido_por: state.userRole === 'admin' ? 'administrador' : (state.userEmail || 'usuario'),
          estado_revision: state.userRole === 'admin' ? 'publicada' : 'pendiente',
        };
        const insertedData = await createBuilding(nuevoEdificio, state.sessionToken);

        state.OBRAS.push({
          ...nuevoEdificio,
          arquitectos: separarArquitectos(arq),
          añadido_por: nuevoEdificio.añadido_por,
          estado_revision: nuevoEdificio.estado_revision,
          id: insertedData[0].id,
          featureId: String(insertedData[0].id ?? `obra-${Date.now()}`),
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
  document.getElementById('modal-add-title').textContent = state.userRole === 'admin' ? 'REGISTRO DE NUEVA OBRA (DB)' : 'PROPONER NUEVA OBRA';
  document.getElementById('btn-add-save').innerHTML = state.userRole === 'admin' ? '<span class="inline-flex items-center gap-1"><i data-lucide="database" width="13" height="13"></i> PUBLICAR</span>' : 'ENVIAR A REVISIÓN';
  document.getElementById('add-error').classList.add('hidden');

  document.getElementById('modal-add-building').classList.add('open');
}

export function initModalsUI() {
  initLoginModal();
  initAddBuildingModal();
}
