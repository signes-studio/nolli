/* =========================================================================
   MODALSUI.JS — Modal de login de administrador y modal de alta de edificio
   ========================================================================= */

import { state, separarArquitectos } from './state.js';
import { loginAdmin, createBuilding, updateBuilding } from './api.js';
import { actualizarFuenteMapa } from './mapData.js';
import { generarFiltrosUI } from './filtersUI.js';

const ADMIN_SESSION_KEY = 'nolli_admin_session_token';

/* -------------------------------------------------------------------------
   MÓDULO DE LOGIN
   ------------------------------------------------------------------------- */
function initLoginModal() {
  const mLogin = document.getElementById('modal-login');
  const bLoginT = document.getElementById('btn-login-trigger');

  const marcarSesionIniciada = () => {
    bLoginT.textContent = '[ SISTEMA DESBLOQUEADO ]';
    bLoginT.style.color = 'var(--accent-2)';
    bLoginT.style.borderColor = 'var(--accent-2)';
    bLoginT.style.background = 'rgba(57, 255, 20, 0.1)';
    document.dispatchEvent(new CustomEvent('radar:admin-login'));
  };

  const tokenGuardado = localStorage.getItem(ADMIN_SESSION_KEY);
  if (tokenGuardado) {
    state.sessionToken = tokenGuardado;
    marcarSesionIniciada();
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

    const btnLogin = document.getElementById('btn-do-login');
    btnLogin.textContent = 'VERIFICANDO...';
    try {
      state.sessionToken = await loginAdmin(email, password);
      localStorage.setItem(ADMIN_SESSION_KEY, state.sessionToken);
      mLogin.classList.remove('open');
      marcarSesionIniciada();
    } catch (error) {
      err.textContent = error.message;
      err.classList.remove('hidden');
    } finally {
      btnLogin.textContent = 'AUTORIZAR ACCESO';
    }
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
    document.getElementById('add-arquitecto').value = obra.arquitecto || '';
    document.getElementById('add-ano').value = obra.año_construccion || '';
    document.getElementById('add-importancia').value = String(obra.importancia || 1);
    document.getElementById('add-categoria').value = obra.categoria || 'otro';
    document.getElementById('add-visitable').value = obra.visitable ? '1' : '0';
    document.getElementById('add-error').classList.add('hidden');
    mAdd.classList.add('open');
  });

  document.getElementById('btn-add-save').addEventListener('click', async () => {
    const err = document.getElementById('add-error');
    err.classList.add('hidden');

    const nombre = document.getElementById('add-nombre').value.trim();
    const arq = document.getElementById('add-arquitecto').value.trim();
    const ano = parseInt(document.getElementById('add-ano').value, 10);
    const importancia = Number(document.getElementById('add-importancia').value);
    const categoria = document.getElementById('add-categoria').value;
    const visitable = document.getElementById('add-visitable').value === '1';

    if (!nombre || !arq || !state.pendingLngLat) {
      err.textContent = 'Faltan datos obligatorios (Nombre y Arquitecto).';
      err.classList.remove('hidden');
      return;
    }

    const btnSave = document.getElementById('btn-add-save');
    btnSave.innerHTML = 'PUBLICANDO...';

    // Código técnico de fondo generado automáticamente
    const edificio = {
      nombre_obra: nombre,
      arquitecto: arq,
      año_construccion: Number.isNaN(ano) ? null : ano,
      importancia,
      categoria,
      visitable,
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
          coordenadas: [updated.longitud, updated.latitud],
          selected: obra.selected,
        });
      } else {
        const nuevoEdificio = {
          ...edificio,
          id: 'VLC-' + Date.now(),
          añadido_por: 'administrador',
        };
        const insertedData = await createBuilding(nuevoEdificio, state.sessionToken);

        state.OBRAS.push({
          ...nuevoEdificio,
          arquitectos: separarArquitectos(arq),
          añadido_por: 'administrador',
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
    alert('ACCESO DENEGADO. Inicia sesión como administrador para registrar nuevas coordenadas.');
    return;
  }
  state.editingBuildingId = null;
  state.pendingLngLat = lngLat;
  document.getElementById('add-coords').textContent = `${lngLat.lng.toFixed(5)}, ${lngLat.lat.toFixed(5)}`;

  document.getElementById('add-nombre').value = '';
  document.getElementById('add-arquitecto').value = '';
  document.getElementById('add-ano').value = '';
  document.getElementById('add-importancia').value = '1';
  document.getElementById('add-categoria').value = 'otro';
  document.getElementById('add-visitable').value = '1';
  document.getElementById('modal-add-title').textContent = 'REGISTRO DE NUEVA OBRA (DB)';
  document.getElementById('btn-add-save').innerHTML = '<span class="inline-flex items-center gap-1"><i data-lucide="database" width="13" height="13"></i> PUBLICAR</span>';
  document.getElementById('add-error').classList.add('hidden');

  document.getElementById('modal-add-building').classList.add('open');
}

export function initModalsUI() {
  initLoginModal();
  initAddBuildingModal();
}
