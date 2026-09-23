/**
 * STANDALONEWORKSHEET.TS — Paridad de acciones e hidratación de sesión en cliente para /obra/:id
 * 
 * Funcionalidades:
 * 1. Lee los datos públicos de la obra desde #building-data (inyectados por SSR de forma neutral).
 * 2. Comprueba la sesión local del visitante en el navegador (localStorage).
 * 3. Si hay sesión activa:
 *    - Carga rol del usuario (admin / editor / user).
 *    - Carga estados personales (visitado, favorito).
 *    - Carga colecciones y listas privadas del usuario.
 *    - Hidrata la UI con clases activas y textos correspondientes.
 *    - Si es administrador o editor, revela el botón [data-edit-building].
 * 4. Gestiona los eventos interactivos (visitar, favoritos, guardar en listas, compartir, editar).
 */

import { state, esRolAdmin, esRolEditor, escapeHtml } from './state.js';
import {
  saveBuildingStatus,
  fetchBuildingStatuses,
  fetchUserCollections,
  fetchUserCollectionItems,
  createUserCollection,
  addUserCollectionItem,
  deleteUserCollectionItem,
  fetchCurrentProfile,
} from './api.js';
import { showNeoToast } from './renderUtils.js';
import { t } from './i18n.js';

interface BuildingData {
  id: string;
  nombre_obra: string;
  arquitecto?: string;
  año_construccion?: string;
  categoria?: string;
  place?: string;
  latitud?: number | null;
  longitud?: number | null;
  foto_url?: string;
  foto_credito?: string;
  enlace_url?: string;
  importancia?: number;
}

export async function initStandaloneWorkSheet(): Promise<void> {
  const scriptEl = document.getElementById('building-data');
  if (!scriptEl?.textContent) return;

  let building: BuildingData;
  try {
    building = JSON.parse(scriptEl.textContent);
  } catch (err) {
    console.error('Error al parsear building-data:', err);
    return;
  }

  if (!building?.id) return;

  // Registrar en el estado global para compatibilidad con utilidades
  state.OBRAS = [building as any];
  state.selectedFeatureId = building.id;

  // 1. Detección de sesión de usuario en el cliente
  let sessionToken: string | null = localStorage.getItem('nolli_admin_session_token');

  if (!sessionToken) {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        try {
          const parsed = JSON.parse(localStorage.getItem(key) || '{}');
          if (parsed.access_token) {
            sessionToken = parsed.access_token;
            state.userId = parsed.user?.id || null;
            break;
          }
        } catch {}
      }
    }
  }

  // 2. Función de actualización de la UI según el estado del usuario
  function updateUI(): void {
    const bId = String(building.id);
    const status = state.buildingStatuses.get(bId) || {};
    const isVisited = Boolean((status as any).visited);
    const isFav = Boolean((status as any).favorite);
    const isSaved = state.userCollectionItems.some((item) => String(item.building_id) === bId);

    // Botón Visitar
    const visBtn = document.querySelector('.sheet-hero-btn[data-status="visited"]');
    if (visBtn) {
      visBtn.classList.toggle('active', isVisited);
      visBtn.classList.toggle('visited', isVisited);
      const span = visBtn.querySelector('span');
      if (span) {
        span.textContent = isVisited ? t('action_visited', null, 'Visitado') : t('action_visit', null, 'Visitar');
      }
    }

    // Botón Favorito
    const favBtn = document.querySelector('.sheet-fav-btn[data-status="favorite"]');
    if (favBtn) {
      favBtn.classList.toggle('active', isFav);
      favBtn.classList.toggle('favorite', isFav);
      const svg = favBtn.querySelector('svg');
      if (svg) svg.style.fill = isFav ? 'currentColor' : 'none';
      const span = favBtn.querySelector('span');
      if (span) {
        span.textContent = isFav ? t('action_favorite', null, 'Favorito') : t('action_favorite', null, 'Favorito');
      }
    }

    // Botón Guardar en lista
    const saveBtn = document.querySelector('.sheet-hero-btn[data-save-collection]');
    if (saveBtn) {
      saveBtn.classList.toggle('active', isSaved);
      saveBtn.classList.toggle('saved', isSaved);
      const span = saveBtn.querySelector('span');
      if (span) {
        span.textContent = isSaved ? t('action_saved', null, 'Guardado') : t('action_save', null, 'Guardar');
      }
      const svg = saveBtn.querySelector('svg');
      if (svg) svg.style.fill = isSaved ? 'currentColor' : 'none';
    }

    // Botón de Edición de Administrador
    const editBtn = document.querySelector<HTMLElement>('[data-edit-building]');
    if (editBtn) {
      const canEdit = esRolAdmin(state.userRole) || esRolEditor(state.userRole);
      editBtn.style.display = canEdit ? 'inline-flex' : 'none';
    }
  }

  // 3. Si hay sesión, cargar datos del visitante en paralelo
  if (sessionToken) {
    state.sessionToken = sessionToken;

    try {
      const [profile, statuses, cols, items] = await Promise.all([
        fetchCurrentProfile(sessionToken).catch(() => null),
        fetchBuildingStatuses([building.id], sessionToken).catch(() => []),
        fetchUserCollections(sessionToken).catch(() => []),
        fetchUserCollectionItems(sessionToken).catch(() => []),
      ]);

      if (profile) {
        state.userId = profile.id;
        state.userRole = profile.role || 'user';
      }

      if (Array.isArray(statuses)) {
        statuses.forEach((st: any) => {
          if (st && st.building_id) {
            state.buildingStatuses.set(String(st.building_id), st);
          }
        });
      }

      state.userCollections = Array.isArray(cols) ? cols : [];
      state.userCollectionItems = Array.isArray(items) ? items : [];

      updateUI();
    } catch (err) {
      console.warn('Aviso al sincronizar sesión en ficha standalone:', err);
    }
  }

  // 4. Listeners para acciones personales

  // Botón Visitar
  const visBtn = document.querySelector('.sheet-hero-btn[data-status="visited"]');
  visBtn?.addEventListener('click', async () => {
    if (!state.sessionToken || !state.userId) {
      showNeoToast(t('toast_login_required_fav', null, 'Inicia sesión para registrar visitas.'));
      return;
    }
    const bId = String(building.id);
    const current = state.buildingStatuses.get(bId) || ({} as any);
    const nextVisited = !Boolean((current as any).visited);
    const next = { ...current, visited: nextVisited } as any;
    state.buildingStatuses.set(bId, next);
    updateUI();

    try {
      await saveBuildingStatus(state.userId, building.id, next, state.sessionToken);
      showNeoToast(nextVisited ? 'Obra marcada como visitada.' : 'Visita desmarcada.');
    } catch (err: any) {
      state.buildingStatuses.set(bId, current as any);
      updateUI();
      showNeoToast(err.message || 'Error al guardar estado de visita.');
    }
  });

  // Botón Favorito
  const favBtn = document.querySelector('.sheet-fav-btn[data-status="favorite"]');
  favBtn?.addEventListener('click', async () => {
    if (!state.sessionToken || !state.userId) {
      showNeoToast(t('toast_login_required_fav', null, 'Inicia sesión para guardar favoritos.'));
      return;
    }
    const bId = String(building.id);
    const current = state.buildingStatuses.get(bId) || ({} as any);
    const nextFav = !Boolean((current as any).favorite);
    const next = { ...current, favorite: nextFav } as any;
    state.buildingStatuses.set(bId, next);
    updateUI();

    try {
      await saveBuildingStatus(state.userId, building.id, next, state.sessionToken);
      showNeoToast(nextFav ? 'Añadida a favoritos.' : 'Eliminada de favoritos.');
    } catch (err: any) {
      state.buildingStatuses.set(bId, current as any);
      updateUI();
      showNeoToast(err.message || 'Error al guardar favorito.');
    }
  });

  // Modal Organizador de Colecciones
  const modalOrganizer = document.getElementById('modal-personal-organizer');
  const saveBtn = document.querySelector('.sheet-hero-btn[data-save-collection]');

  function renderOrganizerOptions(): void {
    const container = document.getElementById('personal-organizer-options');
    if (!container) return;
    const bId = String(building.id);
    const collections = state.userCollections || [];
    if (collections.length === 0) {
      container.innerHTML = `<div style="padding:14px; text-align:center; font-size:12px; color:var(--ink-dim);">No tienes listas creadas aún. Puedes crear una nueva abajo.</div>`;
      return;
    }
    container.innerHTML = collections.map((col: any) => {
      const checked = state.userCollectionItems.some(
        (item) => String(item.collection_id) === String(col.id) && String(item.building_id) === bId
      );
      return `
        <label class="personal-organizer-option">
          <input type="checkbox" value="${escapeHtml(String(col.id))}" ${checked ? 'checked' : ''}>
          <span>${escapeHtml(col.name)}</span>
        </label>
      `;
    }).join('');
  }

  function openOrganizerModal(): void {
    if (!modalOrganizer) return;
    const titleEl = document.getElementById('personal-organizer-project');
    if (titleEl) titleEl.textContent = building.nombre_obra;
    renderOrganizerOptions();
    modalOrganizer.classList.add('open');
  }

  function closeOrganizerModal(): void {
    if (modalOrganizer) modalOrganizer.classList.remove('open');
  }

  saveBtn?.addEventListener('click', () => {
    if (!state.sessionToken || !state.userId) {
      showNeoToast(t('sheet_login_to_organize', null, 'Inicia sesión para guardar en tus listas.'));
      return;
    }
    openOrganizerModal();
  });

  document.getElementById('btn-personal-organizer-close')?.addEventListener('click', closeOrganizerModal);
  modalOrganizer?.addEventListener('click', (e) => {
    if (e.target === modalOrganizer) closeOrganizerModal();
  });

  // Guardar selección en listas
  document.getElementById('btn-personal-organizer-save')?.addEventListener('click', async () => {
    const bId = String(building.id);
    const selectedInputs = document.querySelectorAll<HTMLInputElement>('#personal-organizer-options input:checked');
    const selectedIds = Array.from(selectedInputs).map((inp) => inp.value);

    const current = state.userCollectionItems.filter((item) => String(item.building_id) === bId);

    for (const col of state.userCollections) {
      const colId = String(col.id);
      const existing = current.find((item) => String(item.collection_id) === colId);
      if (selectedIds.includes(colId) && !existing) {
        try {
          await addUserCollectionItem(
            { id: `CLI-${Date.now()}-${colId}`, user_id: state.userId, collection_id: colId, building_id: building.id },
            state.sessionToken!
          );
          state.userCollectionItems.push({ collection_id: colId, building_id: building.id } as any);
        } catch (e) {
          console.warn('Aviso guardando en lista:', e);
        }
      } else if (!selectedIds.includes(colId) && existing) {
        try {
          await deleteUserCollectionItem(colId, state.userId!, building.id, state.sessionToken!);
          state.userCollectionItems = state.userCollectionItems.filter((item) => item !== existing);
        } catch (e) {
          console.warn('Aviso eliminando de lista:', e);
        }
      }
    }

    updateUI();
    closeOrganizerModal();
    showNeoToast('Listas actualizadas con éxito.');
  });

  // Crear nueva lista
  const btnNewList = document.getElementById('btn-organizer-new-list');
  const createRow = document.getElementById('personal-create-tag-row');
  const newNameInput = document.getElementById('personal-new-name') as HTMLInputElement | null;
  const btnCreate = document.getElementById('btn-personal-create');

  btnNewList?.addEventListener('click', () => {
    if (createRow) createRow.classList.toggle('hidden');
    newNameInput?.focus();
  });

  btnCreate?.addEventListener('click', async () => {
    const name = newNameInput?.value.trim();
    if (!name) return;
    try {
      const fallbackId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
      const created = await createUserCollection(
        { id: fallbackId, user_id: state.userId, name, status: 'private' },
        state.sessionToken!
      );
      const newCol = (Array.isArray(created) && created[0]) ? created[0] : (created?.id ? created : { id: fallbackId, user_id: state.userId, name });
      state.userCollections.push(newCol);
      if (newNameInput) newNameInput.value = '';
      if (createRow) createRow.classList.add('hidden');
      renderOrganizerOptions();
      showNeoToast(`Lista "${name}" creada.`);
    } catch (err: any) {
      showNeoToast(err.message || 'Error al crear lista.');
    }
  });

  // Modal Compartir
  const shareBtn = document.querySelector('.sheet-hero-btn[data-share-action="open"]');
  const modalShare = document.getElementById('modal-share');

  shareBtn?.addEventListener('click', () => {
    if (!modalShare) return;
    const subtitle = document.getElementById('share-project-subtitle');
    if (subtitle) {
      subtitle.textContent = `${building.nombre_obra} ${building.arquitecto ? `· ${building.arquitecto}` : ''}`;
    }
    modalShare.classList.add('open');
  });

  document.getElementById('btn-share-close')?.addEventListener('click', () => {
    modalShare?.classList.remove('open');
  });
  modalShare?.addEventListener('click', (e) => {
    if (e.target === modalShare) modalShare.classList.remove('open');
  });

  // Copiar enlace
  document.getElementById('btn-share-copy')?.addEventListener('click', async () => {
    const canonicalUrl = window.location.href;
    try {
      await navigator.clipboard.writeText(canonicalUrl);
      const copyText = document.getElementById('share-copy-text');
      const copyBtn = document.getElementById('btn-share-copy');
      if (copyBtn) copyBtn.classList.add('copied');
      if (copyText) copyText.textContent = '¡ENLACE COPIADO!';
      showNeoToast('Enlace copiado al portapapeles.');
      setTimeout(() => {
        if (copyBtn) copyBtn.classList.remove('copied');
        if (copyText) copyText.textContent = 'COPIAR ENLACE';
      }, 3000);
    } catch {
      showNeoToast('No se pudo copiar automáticamente.');
    }
  });

  // Canales de compartir
  document.querySelectorAll('[data-share-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const choice = (btn as HTMLElement).dataset.shareChoice;
      const url = window.location.href;
      const text = `${building.nombre_obra} - nolli.`;
      if (choice === 'whatsapp') {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
      } else if (choice === 'google') {
        if (building.latitud != null && building.longitud != null) {
          window.open(`https://www.google.com/maps/search/?api=1&query=${building.latitud},${building.longitud}`, '_blank');
        }
      } else if (choice === 'native') {
        if (navigator.share) {
          navigator.share({ title: building.nombre_obra, text, url }).catch(() => {});
        } else {
          showNeoToast('Compartir nativo no soportado en este navegador.');
        }
      }
    });
  });

  // Botón Editar Obra (Admin)
  const editBtn = document.querySelector<HTMLElement>('[data-edit-building]');
  editBtn?.addEventListener('click', () => {
    if (!esRolAdmin(state.userRole) && !esRolEditor(state.userRole)) {
      showNeoToast('Acceso restringido a administradores.');
      return;
    }
    // Redirigir al mapa interactivo con la obra abierta en el modal de edición
    window.location.href = `/?obra=${encodeURIComponent(building.id)}&edit=true`;
  });
}

// Inicialización automática cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initStandaloneWorkSheet().catch(console.error);
  });
} else {
  initStandaloneWorkSheet().catch(console.error);
}
