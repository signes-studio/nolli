/* =========================================================================
   MODALSUI.JS — Modal de login de administrador y modal de alta de edificio
   ========================================================================= */

import { state } from './state.js';
import { loginAdmin, createBuilding } from './api.js';
import { actualizarFuenteMapa } from './mapData.js';
import { generarFiltrosUI } from './filtersUI.js';

/* -------------------------------------------------------------------------
   MÓDULO DE LOGIN
   ------------------------------------------------------------------------- */
function initLoginModal() {
  const mLogin = document.getElementById('modal-login');
  const bLoginT = document.getElementById('btn-login-trigger');

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
      mLogin.classList.remove('open');
      bLoginT.textContent = '[ SISTEMA DESBLOQUEADO ]';
      bLoginT.style.color = 'var(--accent-2)';
      bLoginT.style.borderColor = 'var(--accent-2)';
      bLoginT.style.background = 'rgba(57, 255, 20, 0.1)';
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
  const closeAdd = () => { mAdd.classList.remove('open'); state.pendingLngLat = null; };

  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-add-close')) closeAdd();
  });
  document.getElementById('btn-add-cancel').addEventListener('click', closeAdd);

  document.getElementById('btn-add-save').addEventListener('click', async () => {
    const err = document.getElementById('add-error');
    err.classList.add('hidden');

    const nombre = document.getElementById('add-nombre').value.trim();
    const arq = document.getElementById('add-arquitecto').value.trim();
    const ano = parseInt(document.getElementById('add-ano').value, 10);

    if (!nombre || !arq || !state.pendingLngLat) {
      err.textContent = 'Faltan datos obligatorios (Nombre y Arquitecto).';
      err.classList.remove('hidden');
      return;
    }

    const btnSave = document.getElementById('btn-add-save');
    btnSave.innerHTML = 'PUBLICANDO...';

    // Código técnico de fondo generado automáticamente
    const codigoAutogenerado = 'VLC-' + Date.now();
    const nuevoEdificio = {
      codigo_obra: codigoAutogenerado,
      nombre_obra: nombre,
      arquitecto: arq,
      año_construccion: Number.isNaN(ano) ? null : ano,
      longitud: state.pendingLngLat.lng,
      latitud: state.pendingLngLat.lat,
    };

    try {
      const insertedData = await createBuilding(nuevoEdificio, state.sessionToken);

      // Añadir al mapa en vivo
      const nuevoObj = {
        ...nuevoEdificio,
        id: insertedData[0].id,
        coordenadas: [state.pendingLngLat.lng, state.pendingLngLat.lat],
        selected: false,
      };
      state.OBRAS.push(nuevoObj);
      actualizarFuenteMapa();

      // Actualizar filtros si hay un arquitecto nuevo
      if (!state.ARQUITECTOS.includes(arq)) {
        state.ARQUITECTOS.push(arq);
        state.activeArquitectos.add(arq);
        generarFiltrosUI();
      }

      closeAdd();
    } catch (error) {
      err.textContent = error.message;
      err.classList.remove('hidden');
    } finally {
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
  state.pendingLngLat = lngLat;
  document.getElementById('add-coords').textContent = `${lngLat.lng.toFixed(5)}, ${lngLat.lat.toFixed(5)}`;

  document.getElementById('add-nombre').value = '';
  document.getElementById('add-arquitecto').value = '';
  document.getElementById('add-ano').value = '';
  document.getElementById('add-error').classList.add('hidden');

  document.getElementById('modal-add-building').classList.add('open');
}

export function initModalsUI() {
  initLoginModal();
  initAddBuildingModal();
}
