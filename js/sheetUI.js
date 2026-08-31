/* =========================================================================
   SHEETUI.JS - Ficha tecnica y acciones personales de una obra
   ========================================================================= */

import { state, separarArquitectos, normalizarCategoria, normalizarImportancia, nombreCategoria, esRolAdmin, guardarZonaPersonalLocal } from './state.js';
import { actualizarFuenteMapa } from './mapData.js';
import { cerrarFiltros, generarFiltrosUI } from './filtersUI.js';
import { fetchBuildings, saveBuildingStatus, deleteBuilding, deletePrivateBuilding, createUserCollection, addUserCollectionItem, createUserPrivateLabel, deleteUserPrivateLabel } from './api.js';

const sheet = document.getElementById('sheet');
let organizerMode = 'collections';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

export function isValidHttpsUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function abrirFichaArquitecto(nombreArquitecto) {
  const modal = document.getElementById('modal-architect');
  const works = document.getElementById('architect-profile-works');
  document.getElementById('architect-profile-name').textContent = nombreArquitecto;
  document.getElementById('architect-profile-count').textContent = '[ CARGANDO CATÁLOGO... ]';
  works.innerHTML = '<p class="architect-profile-empty">[ CONSULTANDO TODAS LAS OBRAS EN LA BASE DE DATOS... ]</p>';
  modal.classList.add('open');

  let obras;
  try {
    const filas = await fetchBuildings({ architect: nombreArquitecto, includeAllImportance: true });
    obras = (filas || []).map((fila, index) => ({
      id: fila.id,
      featureId: String(fila.id ?? `obra-${index}`),
      nombre_obra: fila.nombre_obra,
      foto_url: fila.foto_url || null,
      enlace_url: fila.enlace_url || null,
      arquitecto: fila.arquitecto,
      arquitectos: Array.isArray(fila.arquitectos) ? fila.arquitectos : separarArquitectos(fila.arquitecto),
      año_construccion: fila.año_construccion,
      importancia: normalizarImportancia(fila.importancia),
      categoria: normalizarCategoria(fila.categoria),
      ciudad: fila.place || fila.ciudad || null,
      estado_acceso: fila.estado_acceso || (fila.visitable ? 'publico' : 'privado'),
      estado_revision: fila.estado_revision || 'publicada',
      coordenadas: [fila.longitud, fila.latitud],
      selected: false,
    }));

    const obrasPorId = new Map(state.OBRAS.map((obra) => [String(obra.id), obra]));
    obras.forEach((obra) => obrasPorId.set(String(obra.id), { ...obrasPorId.get(String(obra.id)), ...obra }));
    state.OBRAS = [...obrasPorId.values()];
  } catch (error) {
    console.error('Error cargando obras del arquitecto:', error);
    document.getElementById('architect-profile-count').textContent = '[ ERROR DE CARGA ]';
    works.innerHTML = '<p class="architect-profile-empty">[ NO SE PUDIERON CARGAR LAS OBRAS ]</p>';
    return;
  }

  obras = obras
    .sort((first, second) => Number(second.año_construccion || 0) - Number(first.año_construccion || 0)
      || String(first.nombre_obra || '').localeCompare(String(second.nombre_obra || ''), 'es'));

  document.getElementById('architect-profile-count').textContent = `[ ${obras.length} ${obras.length === 1 ? 'OBRA REGISTRADA' : 'OBRAS REGISTRADAS'} ]`;

  works.innerHTML = obras.length ? obras.map((obra) => {
    const catKey = obra.categoria || 'otro';
    const catColor = CATEGORY_COLORS[catKey] || '#E95C0C';
    const yearText = obra.año_construccion || '----';
    const cityName = obra.ciudad || '';
    return `
      <button type="button" class="architect-work-card" data-architect-work-id="${escapeHtml(obra.featureId)}" aria-label="Ver ficha de ${escapeHtml(obra.nombre_obra)}">
        <div class="architect-work-year-box">
          <span class="architect-work-year-val">${escapeHtml(yearText)}</span>
        </div>
        <div class="architect-work-info">
          <div class="architect-work-title">${escapeHtml(obra.nombre_obra)}</div>
          <div class="architect-work-meta-row">
            <span class="architect-cat-pill" style="border-left: 3px solid ${catColor};">
              ${escapeHtml(nombreCategoria(obra.categoria))}
            </span>
            ${cityName ? `<span class="architect-city-tag">· ${escapeHtml(cityName)}</span>` : ''}
          </div>
        </div>
        ${obra.foto_url && isValidHttpsUrl(obra.foto_url) ? `
          <div class="architect-work-thumb-wrap">
            <img src="${escapeHtml(obra.foto_url)}" alt="${escapeHtml(obra.nombre_obra)}" class="architect-work-thumb" loading="lazy">
          </div>
        ` : ''}
      </button>
    `;
  }).join('') : '<p class="architect-profile-empty">[ NO HAY OBRAS REGISTRADAS PARA ESTE ARQUITECTO ]</p>';

  if (window.lucide) window.lucide.createIcons();
}

function cerrarFichaArquitecto() {
  document.getElementById('modal-architect').classList.remove('open');
}

document.getElementById('btn-sheet-close')?.addEventListener('click', (event) => {
  event.stopPropagation();
  cerrarFicha();
});

export function cerrarFicha() {
  sheet.classList.remove('open');
  document.getElementById('sheet-header-actions').innerHTML = '';
  const selected = getSelectedBuilding();
  if (selected) selected.selected = false;
  state.selectedFeatureId = null;
  actualizarFuenteMapa();
}

const CATEGORY_COLORS = {
  'residencial': '#E95C0C',
  'dotacional_equipamiento': '#4388C6',
  'religioso_funerario': '#F2ACCD',
  'comercial_terciario': '#EFBC02',
  'espacio_publico_paisaje': '#0d682f',
  'infraestructura_urbanismo': '#D6201D',
  'industrial_logistico': '#691B14',
  'otro': '#064773',
};

export function abrirFicha(building, coordinates, featureId = building?.id || building?.featureId) {
  if (!building) return;
  const targetId = featureId || building.id || building.featureId;
  if (state.selectedFeatureId !== null) {
    const previous = getSelectedBuilding();
    if (previous) previous.selected = false;
  }
  state.selectedFeatureId = targetId;
  const selected = getSelectedBuilding() || building;
  if (selected) selected.selected = true;
  actualizarFuenteMapa();

  const coords = coordinates || selected.coordenadas || building.coordenadas || [0, 0];

  const architectsList = Array.isArray(building.arquitectos) ? building.arquitectos : separarArquitectos(building.arquitecto);
  const architects = architectsList
    .map((architect) => `<button type="button" class="architect-filter" data-arq="${escapeHtml(architect)}">${escapeHtml(architect)}</button>`).join(', ');
  const adminActive = esRolAdmin(state.userRole) && state.adminMode;
  const isFav = getStatus('favorite');
  const isVis = getStatus('visited');
  const isSaved = state.userCollectionItems.some((item) => String(item.building_id) === String(building.id));
  const hasTags = state.userPrivateLabels.some((item) => String(item.building_id) === String(building.id));
  const catKey = building.categoria || 'otro';
  const catColor = CATEGORY_COLORS[catKey] || '#E95C0C';
  const canDeletePrivate = Boolean(selected?.private && state.userId && String(selected.user_id) === String(state.userId));

  document.getElementById('sheet-title').textContent = building.nombre_obra;

  document.getElementById('sheet-header-actions').innerHTML = `
    ${state.sessionToken ? `
      <button type="button" class="sheet-fav-btn ${isFav ? 'active favorite' : ''}" data-status="favorite" title="${isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}" aria-label="${isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}">
        <i data-lucide="heart" width="16" height="16" ${isFav ? 'fill="currentColor"' : ''}></i>
      </button>
    ` : ''}
  `;

  document.getElementById('sheet-body').innerHTML = `
    <!-- Subtítulo de autor y año -->
    <div class="sheet-meta-subtitle">
      <span class="sheet-meta-architects">${architects}</span>
      ${building.año_construccion ? `<span class="sheet-meta-year">· ${escapeHtml(building.año_construccion)}</span>` : ''}
      ${building.ciudad ? `<span class="sheet-meta-city">· ${escapeHtml(building.ciudad)}</span>` : ''}
    </div>

    <!-- Botonera de Acción Rápida (Hero Actions) -->
    <div class="sheet-hero-actions">
      <a href="https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}" target="_blank" rel="noopener noreferrer" class="sheet-hero-btn btn-primary" title="Trazar ruta en Google Maps">
        <i data-lucide="navigation" width="15" height="15"></i>
        <span>CÓMO LLEGAR</span>
      </a>
      ${state.sessionToken ? `
        <button type="button" class="sheet-hero-btn ${isVis ? 'active visited' : ''}" data-status="visited">
          <i data-lucide="check-circle-2" width="15" height="15"></i>
          <span>${isVis ? 'VISITADO' : 'VISITAR'}</span>
        </button>
        <button type="button" class="sheet-hero-btn ${isSaved ? 'active saved' : ''}" data-save-collection>
          <i data-lucide="bookmark" width="15" height="15" ${isSaved ? 'fill="currentColor"' : ''}></i>
          <span>${isSaved ? 'GUARDADO' : 'GUARDAR'}</span>
      ` : ''}
      <button type="button" class="sheet-hero-btn" data-share-action="open">
        <i data-lucide="share-2" width="15" height="15"></i>
        <span>COMPARTIR</span>
      </button>
    </div>

    <!-- Fotografía Principal en Banner Panorámico -->
    ${building.foto_url && isValidHttpsUrl(building.foto_url) ? `
      <div class="sheet-gallery-wrap">
        <button type="button" class="photo-thumb sheet-photo-banner" data-photo-url="${escapeHtml(building.foto_url)}" aria-label="Ampliar fotografía de la obra">
          <img class="sheet-photo" src="${escapeHtml(building.foto_url)}" alt="Fotografía de ${escapeHtml(building.nombre_obra)}" loading="lazy">
          <span class="photo-zoom-badge"><i data-lucide="maximize-2" width="12" height="12"></i> AMPLIAR</span>
        </button>
      </div>
    ` : ''}

    <!-- Ficha Técnica Modular Limpia (Matriz Tipográfica) -->
    <div class="sheet-tech-section">
      <div class="tech-row">
        <span class="tech-label">[ ARQUITECTO ]</span>
        <span class="tech-value tech-value-accent">${architects}</span>
      </div>

      <div class="tech-grid-2col">
        <div class="tech-col">
          <span class="tech-label">[ AÑO ]</span>
          <span class="tech-value">${building.año_construccion || '-'}</span>
        </div>
        <div class="tech-col">
          <span class="tech-label">[ CATEGORÍA ]</span>
          <span class="tech-value">
            <span class="sheet-cat-badge" style="border-left: 3px solid ${catColor};">${nombreCategoria(building.categoria)}</span>
          </span>
        </div>
      </div>

      <div class="tech-row">
        <span class="tech-label">[ ACCESO ]</span>
        <span class="tech-value">
          <span class="sheet-access-badge">${formatAccess(building.estado_acceso || (building.visitable ? 'publico' : 'privado'))}</span>
        </span>
      </div>

      <div class="tech-row">
        <span class="tech-label">[ COORDENADAS ]</span>
        <span class="tech-value tech-value-mono">${coords[1].toFixed(5)}° N, ${coords[0].toFixed(5)}° E</span>
      </div>

      ${building.enlace_url && isValidHttpsUrl(building.enlace_url) ? `
        <div class="tech-row tech-row-link">
          <span class="tech-label">[ ENLACE ]</span>
          <span class="tech-value">
            <a href="${escapeHtml(building.enlace_url)}" target="_blank" rel="noopener noreferrer" class="sheet-web-link">PÁGINA OFICIAL DEL PROYECTO ↗</a>
          </span>
        </div>
      ` : ''}
    </div>

    <!-- Cuaderno Privado (Valoración y Notas) -->
    ${state.sessionToken ? `
      <div class="personal-notes">
        <div class="personal-notes-head">[ MI VALORACIÓN Y NOTAS ]</div>
        <div class="rating-stars">${[1, 2, 3, 4, 5].map((value) => `<button type="button" class="rating-star ${getStatus('valoracion') >= value ? 'active' : ''}" data-rating="${value}" aria-label="Valorar ${value} de 5">&#9733;</button>`).join('')}</div>
        <button type="button" class="btn note-toggle" data-note-toggle>AÑADIR NOTA PRIVADA</button>
        <div class="personal-note-editor" data-note-editor>
          <label for="building-notes">NOTA PRIVADA</label>
          <textarea id="building-notes" class="tech-input" rows="3" placeholder="Escribe tus notas privadas o estado de conservación..."></textarea>
          <button type="button" class="btn save-personal-status" data-save-personal>GUARDAR NOTA</button>
        </div>
      </div>
    ` : ''}

    <!-- Panel de Administración / Moderación -->
    ${adminActive || canDeletePrivate ? `
      <div class="sheet-admin-block">
        <div class="sheet-admin-head">[ GESTIÓN DE OBRA ]</div>
        <div class="sheet-admin-actions">
          ${adminActive ? `
            <button type="button" class="btn btn-admin-action" data-edit-building><i data-lucide="pencil" width="14" height="14"></i> EDITAR OBRA</button>
            <button type="button" class="btn btn-admin-delete" data-delete-building><i data-lucide="trash-2" width="14" height="14"></i> ELIMINAR DE BASE DE DATOS</button>
          ` : ''}
          ${canDeletePrivate ? `
            <button type="button" class="btn btn-admin-delete" data-delete-private><i data-lucide="trash-2" width="14" height="14"></i> ELIMINAR OBRA PRIVADA</button>
          ` : ''}
        </div>
      </div>
    ` : ''}

    <!-- Botones de Reporte de Incidencias Neo-Bauhaus -->
    <div class="sheet-reports-actions">
      <button type="button" class="sheet-report-btn" data-open-report="error_datos">
        <i data-lucide="alert-circle" width="13" height="13"></i>
        <span>[ REPORTAR ERROR ]</span>
      </button>
      <button type="button" class="sheet-report-btn" data-open-report="duplicado">
        <i data-lucide="copy" width="13" height="13"></i>
        <span>[ REPORTAR DUPLICADO ]</span>
      </button>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Listeners para botones de reporte
  document.querySelectorAll('[data-open-report]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const reportType = btn.dataset.openReport || 'error_datos';
      document.dispatchEvent(new CustomEvent('radar:open-report', { detail: { obra: selected, reportType } }));
    });
  });

  const editButton = document.querySelector('[data-edit-building]');
  if (editButton) editButton.addEventListener('click', (event) => {
    event.stopPropagation();
    document.dispatchEvent(new CustomEvent('radar:edit-building', { detail: { obra: selected } }));
  });
  sheet.classList.add('open');
  cerrarFiltros();

  // En móvil, centrar el mapa en la mitad superior para no tapar el marcador
  if (window.innerWidth <= 768 && state.map && coords) {
    state.map.easeTo({
      center: coords,
      padding: { top: 60, bottom: Math.round(window.innerHeight * 0.45), left: 0, right: 0 },
      duration: 350,
    });
    // Cerrar paneles flotantes si estuvieran abiertos
    ['filter-panel', 'search-panel', 'my-places-panel', 'map-style-panel', 'admin-panel'].forEach((id) => {
      document.getElementById(id)?.classList.remove('open');
    });
    document.getElementById('panel-backdrop')?.classList.add('active');
  }

  const notes = document.getElementById('building-notes');
  if (notes) {
    notes.value = state.buildingStatuses.get(String(selected?.id || building.id))?.notas || '';
    if (notes.value) notes.closest('[data-note-editor]').classList.add('open');
  }
}

function formatAccess(value) { return { publico: 'PUBLICO', exterior_visible: 'EXTERIOR VISIBLE', con_reserva: 'CON RESERVA', privado: 'PRIVADO', cerrado_temporalmente: 'CERRADO TEMPORALMENTE', no_construido: 'NO CONSTRUIDO', desaparecido: 'DESAPARECIDO' }[value] || value; }
function getSelectedBuilding() {
  if (!state.selectedFeatureId) return null;
  const target = String(state.selectedFeatureId);
  return state.OBRAS.find((item) => String(item.id) === target || String(item.featureId) === target) || null;
}
function getStatus(status) {
  const building = getSelectedBuilding();
  if (!building || !building.id) return false;
  return state.buildingStatuses?.get(String(building.id))?.[status] || false;
}
function closeOrganizer() { document.getElementById('modal-personal-organizer').classList.remove('open'); }

function organizerOptions(building, mode) {
  if (mode === 'collections') return state.userCollections.length ? state.userCollections.map((collection) => {
    const checked = state.userCollectionItems.some((item) => String(item.collection_id) === String(collection.id) && String(item.building_id) === String(building.id));
    return `<label class="personal-organizer-option"><input type="checkbox" value="${collection.id}" ${checked ? 'checked' : ''}><span>${collection.name}</span></label>`;
  }).join('') : '<div class="nearby-empty">Todavia no tienes listas. Crea la primera abajo.</div>';
  const labels = [...new Set(state.userPrivateLabels.map((item) => item.label).filter(Boolean))];
  return labels.length ? labels.map((label) => {
    const checked = state.userPrivateLabels.some((item) => String(item.building_id) === String(building.id) && String(item.label).toLowerCase() === String(label).toLowerCase());
    return `<label class="personal-organizer-option"><input type="checkbox" value="${label}" ${checked ? 'checked' : ''}><span>#${label}</span></label>`;
  }).join('') : '<div class="nearby-empty">Todavia no tienes etiquetas. Crea la primera abajo.</div>';
}

function openOrganizer(mode) {
  const building = getSelectedBuilding();
  if (!building || !state.userId || !state.sessionToken) { alert('Inicia sesion para organizar tus obras.'); return; }
  organizerMode = mode;
  document.getElementById('personal-organizer-title').textContent = mode === 'collections' ? 'GUARDAR EN LISTAS' : 'ANADIR ETIQUETAS';
  document.getElementById('personal-organizer-project').textContent = building.nombre_obra;
  document.getElementById('personal-organizer-help').textContent = mode === 'collections' ? 'Selecciona una o varias listas. Una obra puede estar en varias listas.' : 'Selecciona una o varias etiquetas. Solo tu puedes verlas.';
  document.getElementById('personal-new-name').placeholder = mode === 'collections' ? 'NOMBRE DE NUEVA LISTA' : 'NUEVA ETIQUETA';
  document.getElementById('personal-organizer-options').innerHTML = organizerOptions(building, mode);
  document.getElementById('personal-organizer-error').classList.add('hidden');
  document.getElementById('modal-personal-organizer').classList.add('open');
}

async function createOrganizerItem() {
  const building = getSelectedBuilding();
  const input = document.getElementById('personal-new-name');
  const name = String(input.value || '').trim();
  if (!building || !name) return;
  try {
    if (organizerMode === 'collections') {
      const created = await createUserCollection({ user_id: state.userId, name, status: 'private' }, state.sessionToken);
      const newCol = (Array.isArray(created) && created[0]) ? created[0] : (created?.id ? created : { id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()), user_id: state.userId, name, status: 'private' });
      state.userCollections.push(newCol);
    } else if (!state.userPrivateLabels.some((item) => String(item.building_id) === String(building.id) && String(item.label).toLowerCase() === name.toLowerCase())) {
      const created = await createUserPrivateLabel({ user_id: state.userId, building_id: building.id, label: name }, state.sessionToken);
      if (created[0]) state.userPrivateLabels.push(created[0]);
    }
    input.value = '';
    guardarZonaPersonalLocal(state.userId);
    openOrganizer(organizerMode);
  } catch (error) {
    const errorElement = document.getElementById('personal-organizer-error'); errorElement.textContent = error.message; errorElement.classList.remove('hidden');
  }
}

async function saveOrganizerSelection() {
  const building = getSelectedBuilding();
  if (!building) return;
  const selected = [...document.querySelectorAll('#personal-organizer-options input:checked')].map((input) => input.value);
  try {
    if (organizerMode === 'collections') {
      const current = state.userCollectionItems.filter((item) => String(item.building_id) === String(building.id));
      for (const collection of state.userCollections) {
        const existing = current.find((item) => String(item.collection_id) === String(collection.id));
        if (selected.includes(String(collection.id)) && !existing) {
          try {
            const saved = await addUserCollectionItem({ id: `CLI-${Date.now()}-${collection.id}`, user_id: state.userId, collection_id: collection.id, building_id: building.id }, state.sessionToken);
            if (saved[0]) state.userCollectionItems.push(saved[0]);
          } catch (err) {
            console.warn('Reintentando sincronización de colección:', err);
            // Si la colección no existía en el servidor, la creamos y reintentamos guardar el item
            if (String(err.message).includes('foreign key constraint') || String(err.message).includes('user_collection_items_collection_id_fkey')) {
              try {
                await createUserCollection({
                  id: collection.id,
                  user_id: state.userId,
                  name: collection.name,
                  icon: collection.icon,
                  description: collection.description
                }, state.sessionToken);
                const retrySaved = await addUserCollectionItem({ id: `CLI-${Date.now()}-${collection.id}`, user_id: state.userId, collection_id: collection.id, building_id: building.id }, state.sessionToken);
                if (retrySaved[0]) state.userCollectionItems.push(retrySaved[0]);
              } catch (retryError) {
                state.userCollectionItems.push({ id: `CLI-${Date.now()}-${collection.id}`, user_id: state.userId, collection_id: collection.id, building_id: building.id });
              }
            } else {
              state.userCollectionItems.push({ id: `CLI-${Date.now()}-${collection.id}`, user_id: state.userId, collection_id: collection.id, building_id: building.id });
            }
          }
        } else if (!selected.includes(String(collection.id)) && existing) {
          state.userCollectionItems = state.userCollectionItems.filter((item) => item !== existing);
        }
      }
    } else {
      const current = state.userPrivateLabels.filter((item) => String(item.building_id) === String(building.id));
      const labels = [...new Set(state.userPrivateLabels.map((item) => item.label).filter(Boolean))];
      for (const label of labels) {
        const existing = current.find((item) => String(item.label).toLowerCase() === String(label).toLowerCase());
        if (selected.includes(label) && !existing) {
          const created = await createUserPrivateLabel({ user_id: state.userId, building_id: building.id, label }, state.sessionToken);
          if (created[0]) state.userPrivateLabels.push(created[0]);
        } else if (!selected.includes(label) && existing) {
          await deleteUserPrivateLabel(existing.id, state.userId, state.sessionToken);
          state.userPrivateLabels = state.userPrivateLabels.filter((item) => item !== existing);
        }
      }
    }
    guardarZonaPersonalLocal(state.userId);
    closeOrganizer();
    renderSheetStatusUI(building);
    document.dispatchEvent(new CustomEvent(organizerMode === 'collections' ? 'radar:user-collections-changed' : 'radar:user-private-labels-changed'));
  } catch (error) {
    const errorElement = document.getElementById('personal-organizer-error'); errorElement.textContent = error.message; errorElement.classList.remove('hidden');
  }
}

export function renderSheetStatusUI(building = getSelectedBuilding()) {
  if (!building) return;
  const bId = String(building.id);
  const status = state.buildingStatuses.get(bId) || {};
  const isFav = Boolean(status.favorite);
  const isVis = Boolean(status.visited);
  const isSaved = state.userCollectionItems.some((item) => String(item.building_id) === bId);
  const hasTags = state.userPrivateLabels.some((item) => String(item.building_id) === bId);

  // 1. Botón de Favorito en Cabecera
  const favBtn = document.querySelector('.sheet-fav-btn[data-status="favorite"]');
  if (favBtn) {
    favBtn.classList.toggle('active', isFav);
    favBtn.classList.toggle('favorite', isFav);
    favBtn.title = isFav ? 'Quitar de favoritos' : 'Añadir a favoritos';
    favBtn.setAttribute('aria-label', isFav ? 'Quitar de favoritos' : 'Añadir a favoritos');
    const heartSvg = favBtn.querySelector('svg');
    if (heartSvg) {
      heartSvg.style.fill = isFav ? 'currentColor' : 'none';
    }
  }

  // 2. Botón de Visitar en Hero Actions
  const visBtn = document.querySelector('.sheet-hero-btn[data-status="visited"]');
  if (visBtn) {
    visBtn.classList.toggle('active', isVis);
    visBtn.classList.toggle('visited', isVis);
    const span = visBtn.querySelector('span');
    if (span) span.textContent = isVis ? 'VISITADO' : 'VISITAR';
  }

  // 3. Botón de Guardar en Colecciones
  const saveBtn = document.querySelector('.sheet-hero-btn[data-save-collection]');
  if (saveBtn) {
    saveBtn.classList.toggle('active', isSaved);
    saveBtn.classList.toggle('saved', isSaved);
    const span = saveBtn.querySelector('span');
    if (span) span.textContent = isSaved ? 'GUARDADO' : 'GUARDAR';
    const bookmarkSvg = saveBtn.querySelector('svg');
    if (bookmarkSvg) {
      bookmarkSvg.style.fill = isSaved ? 'currentColor' : 'none';
    }
  }

  // 4. Botón de Etiquetas
  const tagBtn = document.querySelector('.sheet-hero-btn[data-add-private-tag]');
  if (tagBtn) {
    tagBtn.classList.toggle('active', hasTags);
    tagBtn.classList.toggle('tagged', hasTags);
  }

  // 5. Estrellas de Valoración
  const starsContainer = document.querySelector('.rating-stars');
  if (starsContainer) {
    const val = Number(status.valoracion || 0);
    starsContainer.querySelectorAll('[data-rating]').forEach((star) => {
      star.classList.toggle('active', Number(star.dataset.rating) <= val);
    });
  }
}

async function saveStatus(status, value) {
  const building = getSelectedBuilding();
  if (!building) return;

  if (!state.userId || !state.sessionToken) {
    alert('Inicia sesión para guardar favoritos y visitas.');
    return;
  }

  const key = String(building.id);
  const previous = state.buildingStatuses.get(key) || { favorite: false, visited: false };
  const next = { ...previous, [status]: value };

  // 1. Actualización Optimista Visual Inmediata (0ms)
  state.buildingStatuses.set(key, next);
  renderSheetStatusUI(building);
  guardarEstadoPersonalLocal();
  actualizarFuenteMapa();
  document.dispatchEvent(new CustomEvent('radar:user-status-changed'));

  // 2. Sincronización en segundo plano con Supabase
  try {
    await saveBuildingStatus(state.userId, building.id, next, state.sessionToken);
  } catch (error) {
    console.warn('Sincronización en segundo plano completada con almacenamiento local:', error);
    guardarEstadoPersonalLocal();
  }
}

async function saveNote(button) {
  const building = getSelectedBuilding();
  if (!building || !state.userId || !state.sessionToken) return;
  const key = String(building.id);
  const previous = state.buildingStatuses.get(key) || { favorite: false, visited: false };
  const next = { ...previous, notas: document.getElementById('building-notes').value, valoracion: previous.valoracion || null };
  state.buildingStatuses.set(key, next);
  renderSheetStatusUI(building);
  guardarEstadoPersonalLocal();
  button.disabled = true;
  button.textContent = 'GUARDANDO...';
  try {
    await saveBuildingStatus(state.userId, building.id, next, state.sessionToken);
    button.textContent = 'GUARDADO';
    document.dispatchEvent(new CustomEvent('radar:user-status-changed'));
  } catch (error) {
    button.textContent = 'GUARDADO LOCALMENTE';
    document.dispatchEvent(new CustomEvent('radar:user-status-changed'));
  } finally {
    button.disabled = false;
  }
}

async function deletePrivate() {
  const building = getSelectedBuilding();
  if (!building?.private || !state.userId || String(building.user_id) !== String(state.userId) || !window.confirm(`¿Eliminar "${building.nombre_obra}" de tus chinchetas privadas?`)) return;
  try { await deletePrivateBuilding(building.id, state.userId, state.sessionToken); state.OBRAS = state.OBRAS.filter((item) => item !== building); state.privateBuildings = state.privateBuildings.filter((item) => item !== building); cerrarFicha(); actualizarFuenteMapa(); } catch (error) { alert(error.message); }
}

async function deleteBuildingFromSheet() {
  const building = getSelectedBuilding();
  if (!building || !esRolAdmin(state.userRole) || !state.adminMode || !window.confirm(`¿Eliminar "${building.nombre_obra}"?`)) return;
  try { await deleteBuilding(building.id, state.sessionToken); state.OBRAS = state.OBRAS.filter((item) => item !== building); cerrarFicha(); actualizarFuenteMapa(); generarFiltrosUI(); document.dispatchEvent(new CustomEvent('radar:buildings-changed')); } catch (error) { alert(error.message); }
}

function openShareModal() {
  const building = getSelectedBuilding();
  const modal = document.getElementById('modal-share');
  if (!modal) return;

  const subtitle = document.getElementById('share-project-subtitle');
  if (subtitle) {
    if (building) {
      const arq = building.arquitectos ? (Array.isArray(building.arquitectos) ? building.arquitectos.join(', ') : building.arquitectos) : (building.arquitecto || '');
      subtitle.textContent = `${building.nombre_obra} ${arq ? `· ${arq}` : ''}`;
    } else {
      subtitle.textContent = 'Guía de arquitectura Nolli';
    }
  }

  const copyBtn = document.getElementById('btn-share-copy');
  const copyText = document.getElementById('share-copy-text');
  if (copyBtn) copyBtn.classList.remove('copied');
  if (copyText) copyText.textContent = '[ COPIAR ENLACE ]';

  modal.classList.add('open');
  if (window.lucide) window.lucide.createIcons();
}

function handleShareAction(choice) {
  const building = getSelectedBuilding();
  if (!building) return;

  const origin = window.location.origin;
  const rawPath = window.location.pathname.replace(/\/index\.html$/, '/') || '/';
  const path = rawPath.endsWith('/') ? rawPath : `${rawPath}/`;
  const shareUrl = `${origin}${path}?obra=${encodeURIComponent(building.id || building.featureId)}`;
  const [lng, lat] = building.coordenadas || [0, 0];
  const arq = building.arquitectos ? (Array.isArray(building.arquitectos) ? building.arquitectos.join(', ') : building.arquitectos) : (building.arquitecto || '');

  if (choice === 'whatsapp') {
    const text = `🏛️ ${building.nombre_obra}${arq ? `\n📐 ${arq}` : ''}\n📍 Ver en Nolli: ${shareUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  } else if (choice === 'google') {
    const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    window.open(gmapsUrl, '_blank');
  } else if (choice === 'native') {
    if (navigator.share) {
      navigator.share({
        title: building.nombre_obra,
        text: `🏛️ ${building.nombre_obra} - Guía de Arquitectura Nolli`,
        url: shareUrl
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl);
      const copyBtn = document.getElementById('btn-share-copy');
      const copyText = document.getElementById('share-copy-text');
      if (copyBtn) copyBtn.classList.add('copied');
      if (copyText) copyText.textContent = '[ ¡ENLACE COPIADO! ]';
      setTimeout(() => {
        if (copyBtn) copyBtn.classList.remove('copied');
        if (copyText) copyText.textContent = '[ COPIAR ENLACE ]';
      }, 2000);
    }
  } else if (choice === 'copy') {
    navigator.clipboard.writeText(shareUrl).then(() => {
      const copyBtn = document.getElementById('btn-share-copy');
      const copyText = document.getElementById('share-copy-text');
      if (copyBtn) copyBtn.classList.add('copied');
      if (copyText) copyText.textContent = '[ ¡ENLACE COPIADO! ]';
      setTimeout(() => {
        if (copyBtn) copyBtn.classList.remove('copied');
        if (copyText) copyText.textContent = '[ COPIAR ENLACE ]';
      }, 2000);
    }).catch(() => {});
  }
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (target.closest('[data-save-collection]')) { openOrganizer('collections'); return; }
  if (target.closest('[data-add-private-tag]')) { openOrganizer('labels'); return; }
  if (target.closest('#btn-personal-organizer-close') || target === document.getElementById('modal-personal-organizer')) { closeOrganizer(); return; }
  if (target.closest('#btn-personal-create')) { createOrganizerItem(); return; }
  if (target.closest('#btn-personal-organizer-save')) { saveOrganizerSelection(); return; }
  if (target.closest('[data-delete-private]')) { deletePrivate(); return; }
  if (target.closest('[data-delete-building]')) { deleteBuildingFromSheet(); return; }
  const noteToggle = target.closest('[data-note-toggle]');
  if (noteToggle) { noteToggle.nextElementSibling.classList.toggle('open'); noteToggle.textContent = noteToggle.nextElementSibling.classList.contains('open') ? 'OCULTAR NOTA' : 'ANADIR NOTA'; return; }
  const rating = target.closest('[data-rating]');
  if (rating) { saveStatus('valoracion', Number(rating.dataset.rating)); rating.parentElement.querySelectorAll('[data-rating]').forEach((star) => star.classList.toggle('active', Number(star.dataset.rating) <= Number(rating.dataset.rating))); return; }
  const status = target.closest('[data-status]');
  if (status) { const building = getSelectedBuilding(); saveStatus(status.dataset.status, !state.buildingStatuses.get(String(building?.id))?.[status.dataset.status]); return; }
  if (target.closest('[data-save-personal]')) { saveNote(target.closest('[data-save-personal]')); return; }
  const architect = target.closest('.architect-filter');
  if (architect) { abrirFichaArquitecto(architect.dataset.arq); return; }
  if (target.closest('#btn-architect-close') || target === document.getElementById('modal-architect')) { cerrarFichaArquitecto(); return; }
  const architectWork = target.closest('[data-architect-work-id]');
  if (architectWork) {
    const obra = state.OBRAS.find((item) => String(item.featureId) === String(architectWork.dataset.architectWorkId));
    if (obra) {
      cerrarFichaArquitecto();
      if (state.map) state.map.flyTo({ center: obra.coordenadas, zoom: Math.max(state.map.getZoom(), 15) });
      abrirFicha(obra, obra.coordenadas, obra.featureId);
    }
    return;
  }
  if (target.closest('[data-open-report]')) { const building = getSelectedBuilding(); if (building) { document.getElementById('report-project-name').textContent = building.nombre_obra; document.getElementById('modal-report').classList.add('open'); } return; }
  if (target.closest('[data-share-action]')) { openShareModal(); return; }
  const shareChoiceBtn = target.closest('[data-share-choice]');
  if (shareChoiceBtn) {
    handleShareAction(shareChoiceBtn.dataset.shareChoice);
    return;
  }
  if (target.closest('[data-photo-url]')) { const viewer = document.getElementById('modal-photo'); document.getElementById('photo-viewer-image').src = target.closest('[data-photo-url]').dataset.photoUrl; viewer.classList.add('open'); return; }
  if (target.closest('#btn-share-close') || target === document.getElementById('modal-share')) document.getElementById('modal-share').classList.remove('open');
  if (target.closest('#btn-photo-close') || target === document.getElementById('modal-photo')) document.getElementById('modal-photo').classList.remove('open');
});

function guardarEstadoPersonalLocal() {
  if (!state.userId) return;
  localStorage.setItem(`nolli:building-status:${state.userId}`, JSON.stringify([...state.buildingStatuses.entries()]));
}

document.addEventListener('radar:admin-login', actualizarFichaAbierta);
document.addEventListener('radar:admin-mode-change', actualizarFichaAbierta);
document.addEventListener('radar:logout', actualizarFichaAbierta);
document.addEventListener('radar:user-status-ready', actualizarFichaAbierta);
document.addEventListener('radar:user-collections-changed', () => renderSheetStatusUI());
document.addEventListener('radar:user-private-labels-changed', () => renderSheetStatusUI());
document.addEventListener('radar:user-status-changed', () => renderSheetStatusUI());
document.addEventListener('radar:open-building', (event) => { if (event.detail?.obra) abrirFicha(event.detail.obra, event.detail.obra.coordenadas, event.detail.obra.featureId); });
function actualizarFichaAbierta() { const building = getSelectedBuilding(); if (building) abrirFicha(building, building.coordenadas, building.featureId); }