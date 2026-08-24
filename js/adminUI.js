/* =========================================================================
   ADMINUI.JS — Gestión de proyectos para administradores
   ========================================================================= */

import { state, separarArquitectos } from './state.js';
import { deleteBuilding } from './api.js';
import { actualizarFuenteMapa } from './mapData.js';
import { generarFiltrosUI } from './filtersUI.js';

const panel = document.getElementById('admin-panel');
const button = document.getElementById('btn-admin-panel');
const search = document.getElementById('admin-search');
const count = document.getElementById('admin-count');
const list = document.getElementById('admin-project-list');

export function initAdminUI() {
  button.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) renderList();
  });
  search.addEventListener('input', renderList);

  document.addEventListener('click', (event) => {
    if (event.target.closest('#btn-admin-close')) panel.classList.remove('open');
    const edit = event.target.closest('[data-admin-edit]');
    if (edit) {
      const obra = state.OBRAS.find((item) => String(item.id) === edit.dataset.adminEdit);
      if (obra) {
        document.dispatchEvent(new CustomEvent('radar:edit-building', { detail: { obra } }));
        panel.classList.remove('open');
      }
    }
    const remove = event.target.closest('[data-admin-delete]');
    if (remove) eliminarProyecto(remove.dataset.adminDelete);
  });

  document.addEventListener('radar:admin-login', () => button.classList.remove('hidden'));
  document.addEventListener('radar:logout', () => {
    button.classList.add('hidden');
    panel.classList.remove('open');
  });
  document.addEventListener('radar:data-ready', renderList);
  document.addEventListener('radar:user-login', () => button.classList.add('hidden'));
}

function renderList() {
  if (state.userRole !== 'admin') return;
  const text = search.value.trim().toLowerCase();
  const projects = state.OBRAS.filter((obra) => `${obra.nombre_obra} ${obra.arquitecto}`.toLowerCase().includes(text));
  count.textContent = `${projects.length} / ${state.OBRAS.length}`;
  if (!projects.length) {
    list.innerHTML = '<div class="nearby-empty">No hay proyectos que coincidan.</div>';
    return;
  }
  list.innerHTML = projects.map((obra) => `
    <div class="admin-project">
      <div class="admin-project-info">
        <strong>${obra.nombre_obra}</strong>
        <span>${obra.arquitecto || 'Sin arquitecto'}</span>
      </div>
      <div class="admin-project-actions">
        <button type="button" class="btn admin-action-edit" data-admin-edit="${obra.id}">EDITAR</button>
        <button type="button" class="btn admin-action-delete" data-admin-delete="${obra.id}">BORRAR</button>
      </div>
    </div>
  `).join('');
}

async function eliminarProyecto(id) {
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
