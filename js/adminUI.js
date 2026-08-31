/* =========================================================================
   ADMINUI.JS — Gestión de proyectos para administradores
   ========================================================================= */

import { state, separarArquitectos, esRolAdmin, escapeHtml } from './state.js';
import { deleteBuilding, fetchRatingAverages, reviewBuilding, fetchBuildingReports, fetchUserDirectory, updateBuildingReport } from './api.js';
import { actualizarFuenteMapa } from './mapData.js';
import { generarFiltrosUI } from './filtersUI.js';

const panel = document.getElementById('admin-panel');
const button = document.getElementById('btn-admin-panel');
const search = document.getElementById('admin-search');
const reviewFilter = document.getElementById('admin-review-filter');
const count = document.getElementById('admin-count');
const list = document.getElementById('admin-project-list');
const reportList = document.getElementById('admin-report-list');
const reportCount = document.getElementById('admin-report-count');
const reportBadge = document.getElementById('admin-report-badge');
const reportsView = document.getElementById('admin-reports-view');
const usersView = document.getElementById('admin-users-view');
const userList = document.getElementById('admin-user-list');
const userSearch = document.getElementById('admin-user-search');
const userCount = document.getElementById('admin-user-count');
const usersTab = document.querySelector('[data-admin-tab="users"]');
const cityCache = new Map();
let ratingAverages = new Map();

export function initAdminUI() {
  button.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) { renderList(); renderReports(); }
  });
  search.addEventListener('input', renderList);
  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-admin-tab]');
    if (!tab) return;
    const reports = tab.dataset.adminTab === 'reports';
    const users = tab.dataset.adminTab === 'users';
    document.querySelectorAll('[data-admin-tab]').forEach((item) => item.classList.toggle('active', item === tab));
    list.classList.toggle('admin-view-hidden', reports || users);
    document.querySelector('.admin-toolbar').classList.toggle('admin-view-hidden', reports || users);
    reportsView.classList.toggle('admin-view-hidden', !reports);
    usersView.classList.toggle('admin-view-hidden', !users);
    if (reports) renderReports();
    if (users) renderUsers();
  });
  reviewFilter.addEventListener('change', () => {
    renderList();
    actualizarFuenteMapa();
  });
  userSearch.addEventListener('input', renderUsers);

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
    const review = event.target.closest('[data-admin-review]');
    if (review) revisarProyecto(review.dataset.adminReview, review.dataset.reviewStatus);
    const report = event.target.closest('[data-report-id]');
    if (report) actualizarReporte(report.dataset.reportId, report.dataset.reportStatus);
    const reportBuilding = event.target.closest('[data-report-building]');
    if (reportBuilding) abrirProyectoDesdeReporte(reportBuilding.dataset.reportBuilding);
  });

  document.addEventListener('radar:admin-login', () => {
    button.classList.remove('hidden');
    usersTab.classList.toggle('hidden', state.userRole !== 'superadmin');
  });
  document.addEventListener('radar:admin-mode-change', () => {
    button.classList.toggle('hidden', !state.adminMode);
    if (!state.adminMode) panel.classList.remove('open');
  });
  document.addEventListener('radar:logout', () => {
    button.classList.add('hidden');
    panel.classList.remove('open');
    usersTab.classList.add('hidden');
  });
  document.addEventListener('radar:data-ready', renderList);
  document.addEventListener('radar:user-login', () => button.classList.add('hidden'));
  document.addEventListener('radar:admin-login', cargarMedias);
  document.addEventListener('radar:buildings-changed', renderList);
  document.addEventListener('radar:admin-login', renderReports);
}

async function cargarMedias() {
  ratingAverages = await fetchRatingAverages(state.sessionToken);
  if (panel.classList.contains('open')) renderList();
}

async function renderList() {
  if (!esRolAdmin(state.userRole) || !state.adminMode) return;
  const text = search.value.trim().toLowerCase();
  const projects = state.OBRAS.filter((obra) => `${obra.nombre_obra} ${obra.arquitecto}`.toLowerCase().includes(text))
    .filter((obra) => !reviewFilter.value || obra.estado_revision === reviewFilter.value);
  count.textContent = `${projects.length} / ${state.OBRAS.length}`;
  if (!projects.length) {
    list.innerHTML = '<div class="nearby-empty">No hay proyectos que coincidan.</div>';
    return;
  }
  list.innerHTML = projects.map((obra) => {
    const safeId = escapeHtml(obra.id);
    const safeFeatureId = escapeHtml(obra.featureId);
    const safeNombre = escapeHtml(obra.nombre_obra);
    const safeArquitecto = escapeHtml(obra.arquitecto || 'Sin arquitecto');
    const safeRating = escapeHtml(formatearMedia(obra.id));
    const safeStatus = escapeHtml(formatearEstadoRevision(obra.estado_revision));
    const isPending = obra.estado_revision === 'pendiente';

    return `
      <div class="admin-project">
        <div class="admin-project-info">
          <strong>${safeNombre}</strong>
          <span>${safeArquitecto}</span>
          <span class="admin-project-city" data-city-for="${safeFeatureId}">LOCALIZACIÓN...</span>
          <span class="admin-project-rating">${safeRating}</span>
          <span class="admin-project-status ${isPending ? 'pending' : ''}">${safeStatus}</span>
        </div>
        <div class="admin-project-actions">
          <button type="button" class="btn admin-action-edit" data-admin-edit="${safeId}">EDITAR</button>
          ${isPending ? `
            <button type="button" class="btn admin-action-review" data-admin-review="${safeId}" data-review-status="publicada">ACEPTAR</button>
            <button type="button" class="btn admin-action-reject" data-admin-review="${safeId}" data-review-status="rechazada">RECHAZAR</button>
          ` : ''}
          <button type="button" class="btn admin-action-delete" data-admin-delete="${safeId}">BORRAR</button>
        </div>
      </div>
    `;
  }).join('');

  await Promise.all(projects.map(async (obra) => {
    const cityElement = list.querySelector(`[data-city-for="${obra.featureId}"]`);
    if (!cityElement) return;
    cityElement.textContent = await obtenerCiudad(obra);
  }));
}

async function renderReports() {
  if (!esRolAdmin(state.userRole)) return;
  const reports = await fetchBuildingReports(state.sessionToken);
  reportCount.textContent = `${reports.length} pendientes`;
  reportBadge.textContent = reports.length;
  if (!reports.length) {
    reportList.innerHTML = '<div class="nearby-empty">No hay reportes pendientes.</div>';
    return;
  }
  reportList.innerHTML = reports.map((report) => {
    const obra = state.OBRAS.find((item) => String(item.id) === String(report.building_id));
    const safeTitle = escapeHtml(obra?.nombre_obra || `Obra #${report.building_id}`);
    const safeDesc = escapeHtml(report.descripcion || report.description || 'Sin descripción');
    const safeDate = escapeHtml(new Date(report.created_at).toLocaleString('es-ES'));
    const safeBuildingId = escapeHtml(report.building_id);
    const safeReportId = escapeHtml(report.id);

    return `
      <article class="admin-report">
        <div class="admin-report-copy">
          <strong>${safeTitle}</strong>
          <span>${safeDesc}</span>
          <small>${safeDate}</small>
        </div>
        <div class="admin-report-actions">
          <button type="button" class="btn admin-action-open" data-report-building="${safeBuildingId}">VER OBRA</button>
          <button type="button" class="btn admin-action-review" data-report-id="${safeReportId}" data-report-status="revisado">REVISADO</button>
          <button type="button" class="btn admin-action-reject" data-report-id="${safeReportId}" data-report-status="descartado">DESCARTAR</button>
        </div>
      </article>
    `;
  }).join('');
}

let users = [];
async function renderUsers() {
  if (state.userRole !== 'superadmin') {
    userList.innerHTML = '<div class="nearby-empty">El directorio de usuarios está reservado al superadmin.</div>';
    return;
  }
  if (!users.length) {
    try { users = await fetchUserDirectory(state.sessionToken); }
    catch (error) { userList.innerHTML = `<div class="nearby-empty">${escapeHtml(error.message)}</div>`; return; }
  }
  const query = userSearch.value.trim().toLowerCase();
  const filtered = users.filter((user) => `${user.first_name || ''} ${user.last_name || ''} ${user.email || ''} ${user.city || ''} ${user.country || ''}`.toLowerCase().includes(query));
  userCount.textContent = `${filtered.length} / ${users.length}`;
  userList.innerHTML = filtered.length ? filtered.map((user) => {
    const safeFirstName = escapeHtml(user.first_name || '');
    const safeLastName = escapeHtml(user.last_name || '');
    const safeFullName = `${safeFirstName} ${safeLastName}`.trim() || 'Usuario sin nombre';
    const safeEmail = escapeHtml(user.email || 'Email no disponible');
    const safeCity = escapeHtml(user.city || 'Ciudad no indicada');
    const safeCountry = escapeHtml(user.country || 'País no indicado');
    const safeRole = escapeHtml((user.role || 'user').toUpperCase());

    return `
      <article class="admin-user">
        <div class="admin-user-main">
          <strong>${safeFullName}</strong>
          <span>${safeEmail}</span>
          <span>${safeCity} · ${safeCountry}</span>
        </div>
        <span class="admin-user-role">${safeRole}</span>
      </article>
    `;
  }).join('') : '<div class="nearby-empty">No hay usuarios que coincidan.</div>';
}

async function actualizarReporte(id, estado) {
  try {
    await updateBuildingReport(id, estado, state.sessionToken);
    renderReports();
  } catch (error) {
    alert(error.message);
  }
}

function abrirProyectoDesdeReporte(buildingId) {
  const obra = state.OBRAS.find((item) => String(item.id) === String(buildingId));
  if (!obra || !state.map) return;
  state.map.flyTo({ center: obra.coordenadas, zoom: Math.max(state.map.getZoom(), 15) });
  document.dispatchEvent(new CustomEvent('radar:open-building', { detail: { obra } }));
  panel.classList.remove('open');
}

function formatearEstadoRevision(status) {
  return status === 'pendiente' ? 'PENDIENTE DE REVISIÓN' : status === 'rechazada' ? 'RECHAZADA' : 'PUBLICADA';
}

async function revisarProyecto(id, estadoRevision) {
  const obra = state.OBRAS.find((item) => String(item.id) === String(id));
  if (!obra || !esRolAdmin(state.userRole)) return;
  try {
    await reviewBuilding(id, estadoRevision, state.sessionToken);
    obra.estado_revision = estadoRevision;
    actualizarFuenteMapa();
    renderList();
  } catch (error) {
    alert(error.message);
  }
}

function formatearMedia(buildingId) {
  const rating = ratingAverages.get(String(buildingId));
  return rating ? `VALORACIÓN MEDIA ${rating.average.toFixed(1)} / 5 · ${rating.count} ${rating.count === 1 ? 'voto' : 'votos'}` : 'SIN VALORACIONES';
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
