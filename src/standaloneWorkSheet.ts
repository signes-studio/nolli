/**
 * STANDALONEWORKSHEET.TS — Paridad de acciones, hidratación de sesión en cliente
 * y navegación fluida (soft navigation) con migas de pan para /obra/:id
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
import { normalizeArchitectKey } from './architectRelationships.js';

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

interface TrailEntry {
  label: string;
  url: string;
  isArchitect?: boolean;
}

// Historial en memoria para la sesión activa de navegación entre fichas
const sessionTrail: TrailEntry[] = [];
let currentBuilding: BuildingData | null = null;
let modalsInitialized = false;
let softNavInitialized = false;

function cleanArchitectName(name: string): string {
  if (!name) return '';
  return String(name)
    .replace(/\s*\((?:intervenci[oó]n|reforma|ampliaci[oó]n|restauraci[oó]n|a[ñn]o)?\s*:?\s*\d{4}(?:\s*[-/–]\s*\d{4})?\s*\)/gi, '')
    .trim();
}

function isIgnoredArchitect(name: string): boolean {
  if (!name) return true;
  const lower = String(name).toLowerCase().trim();
  const ignored = [
    'desconocido',
    'autor desconocido',
    'autores varios',
    'anónimo',
    'anonimo',
    'varios',
    'desconegut',
    'unknown',
    's/d',
    'sin datos',
    'sin arquitecto',
    'no consta',
    'no disponible',
    'n/a',
    'nd',
  ];
  return ignored.includes(lower) || lower.length < 2;
}

function getUrlLangPrefix(): string {
  const path = window.location.pathname;
  if (path.startsWith('/en/') || path === '/en') return '/en';
  if (path.startsWith('/ca/') || path === '/ca') return '/ca';
  return '';
}

/**
 * Renderiza la migaja de pan acumulada durante la sesión de navegación fluida.
 */
function renderSessionTrail(): void {
  const trailEl = document.getElementById('session-trail');
  if (!trailEl) return;

  if (sessionTrail.length === 0) {
    trailEl.style.display = 'none';
    trailEl.innerHTML = '';
    return;
  }

  trailEl.style.display = 'flex';
  const labelText = t('coming_from', null, 'Viniendo de:');

  const linksHtml = sessionTrail.map((item, idx) => {
    return `<a href="${escapeHtml(item.url)}" class="session-trail-link" data-trail-idx="${idx}">${escapeHtml(item.label)}</a>`;
  }).join(' <span class="session-trail-sep">→</span> ');

  trailEl.innerHTML = `
    <span class="session-trail-label">${escapeHtml(labelText)}</span>
    ${linksHtml}
  `;
}

/**
 * Navegación fluida (soft navigation): descarga la nueva ficha vía fetch
 * (aprovechando la misma caché Edge CDN que SSR), actualiza el DOM y sincroniza el historial.
 */
async function performSoftNavigation(targetUrl: string, fromPopState = false): Promise<void> {
  const workCard = document.querySelector('.work-card');
  if (workCard) {
    workCard.classList.add('is-soft-navigating');
  }

  try {
    const res = await fetch(targetUrl);
    if (!res.ok) {
      window.location.href = targetUrl;
      return;
    }

    const htmlText = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    const newWorkCard = doc.querySelector('.work-card');
    const newScript = doc.getElementById('building-data');
    const newBreadcrumbs = doc.querySelector('.breadcrumb-list');

    if (!newWorkCard || !newScript) {
      window.location.href = targetUrl;
      return;
    }

    // Actualizar título de la página
    document.title = doc.title;

    // Actualizar meta description
    const newMetaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content');
    if (newMetaDesc) {
      document.querySelector('meta[name="description"]')?.setAttribute('content', newMetaDesc);
    }

    // Actualizar canonical URL
    const newCanonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
    if (newCanonical) {
      document.querySelector('link[rel="canonical"]')?.setAttribute('href', newCanonical);
    }

    // Registrar la obra actual en la migaja de sesión antes de sustituirla
    if (!fromPopState && currentBuilding) {
      if (sessionTrail.length === 0 && currentBuilding.arquitecto) {
        const cleanArch = cleanArchitectName(currentBuilding.arquitecto);
        if (cleanArch && !isIgnoredArchitect(cleanArch)) {
          const rawSlug = normalizeArchitectKey(cleanArch);
          const prefix = getUrlLangPrefix();
          sessionTrail.push({
            label: cleanArch,
            url: `${prefix}/arquitecto/${encodeURIComponent(rawSlug)}`,
            isArchitect: true,
          });
        }
      }
      sessionTrail.push({
        label: currentBuilding.nombre_obra,
        url: window.location.href,
      });
    }

    // Sustituir migas de pan estándar
    if (newBreadcrumbs) {
      const currentBreadcrumbs = document.querySelector('.breadcrumb-list');
      if (currentBreadcrumbs) {
        currentBreadcrumbs.innerHTML = newBreadcrumbs.innerHTML;
      }
    }

    // Renderizar la migaja acumulativa de sesión
    renderSessionTrail();

    // Reemplazar la tarjeta de obra y sus secciones de descubrimiento
    const currentWorkCard = document.querySelector('.work-card');
    if (currentWorkCard) {
      currentWorkCard.replaceWith(newWorkCard);
    }

    // Reemplazar los datos JSON embebidos
    const currentScript = document.getElementById('building-data');
    if (currentScript) {
      currentScript.replaceWith(newScript);
    } else {
      document.body.appendChild(newScript);
    }

    // Actualizar historial del navegador
    if (!fromPopState) {
      window.history.pushState({ url: targetUrl }, '', targetUrl);
    }

    // Scroll suave hacia la parte superior de la ficha
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Hidratar la nueva obra con la sesión actual
    await initStandaloneWorkSheet();
  } catch (err) {
    console.warn('Fallo en soft navigation, usando navegación clásica:', err);
    window.location.href = targetUrl;
  } finally {
    const card = document.querySelector('.work-card');
    if (card) {
      card.classList.remove('is-soft-navigating');
    }
  }
}

/**
 * Inicializa los controladores globales de soft navigation e historial del navegador.
 */
function initSoftNavigation(): void {
  if (softNavInitialized) return;
  softNavInitialized = true;

  // Interceptar clics en enlaces internos a obras (/obra/:id)
  document.addEventListener('click', (e: MouseEvent) => {
    // Permitir clics con teclas modificadoras (nueva pestaña, abrir en fondo, etc.)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }

    // Caso 1: Enlace en el session-trail
    const trailLink = (e.target as HTMLElement)?.closest<HTMLAnchorElement>('a.session-trail-link');
    if (trailLink) {
      const href = trailLink.getAttribute('href');
      if (href && href.includes('/obra/')) {
        e.preventDefault();
        const idxStr = trailLink.dataset.trailIdx;
        if (idxStr != null) {
          const idx = parseInt(idxStr, 10);
          if (!isNaN(idx)) {
            sessionTrail.splice(idx);
          }
        }
        const fullUrl = new URL(href, window.location.origin).href;
        performSoftNavigation(fullUrl);
        return;
      }
    }

    // Caso 2: Tarjetas de obra en las secciones de descubrimiento
    const cardLink = (e.target as HTMLElement)?.closest<HTMLAnchorElement>('a.obra-card');
    if (cardLink) {
      const href = cardLink.getAttribute('href');
      if (href && href.includes('/obra/')) {
        e.preventDefault();
        const fullUrl = new URL(href, window.location.origin).href;
        performSoftNavigation(fullUrl);
      }
    }
  });

  // Gestionar botones Atrás / Adelante del navegador
  window.addEventListener('popstate', () => {
    if (window.location.pathname.includes('/obra/')) {
      const currentUrl = window.location.href;
      const idx = sessionTrail.findIndex((item) => item.url === currentUrl);
      if (idx !== -1) {
        sessionTrail.splice(idx);
      }
      performSoftNavigation(window.location.href, true);
    }
  });
}

/**
 * Inicializa la ficha de obra standalone, sincroniza el estado de la sesión
 * del usuario y configura los listeners de interacción y modales.
 */
export async function initStandaloneWorkSheet(): Promise<void> {
  initSoftNavigation();

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
  currentBuilding = building;

  // Registrar en el estado global para compatibilidad con módulos de mapa/colecciones
  state.OBRAS = [building as any];
  state.selectedFeatureId = building.id;

  // 1. Detección de sesión de usuario en el cliente
  let sessionToken: string | null = state.sessionToken || localStorage.getItem('nolli_admin_session_token');

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
    if (!currentBuilding) return;
    const bId = String(currentBuilding.id);
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
      const promises: Promise<any>[] = [
        fetchBuildingStatuses([building.id], sessionToken).catch(() => []),
      ];

      // Solo consultar perfil y colecciones completas si no están ya en memoria
      if (!state.userId) {
        promises.push(fetchCurrentProfile(sessionToken).catch(() => null));
      }
      if (!state.userCollections || state.userCollections.length === 0) {
        promises.push(fetchUserCollections(sessionToken).catch(() => []));
        promises.push(fetchUserCollectionItems(sessionToken).catch(() => []));
      }

      const results = await Promise.all(promises);
      const statuses = results[0];

      if (Array.isArray(statuses)) {
        statuses.forEach((st: any) => {
          if (st && st.building_id) {
            state.buildingStatuses.set(String(st.building_id), st);
          }
        });
      }

      if (results.length > 1) {
        const profile = results[1];
        if (profile) {
          state.userId = profile.id;
          state.userRole = profile.role || 'user';
        }
        if (results[2]) {
          state.userCollections = Array.isArray(results[2]) ? results[2] : [];
        }
        if (results[3]) {
          state.userCollectionItems = Array.isArray(results[3]) ? results[3] : [];
        }
      }

      updateUI();
    } catch (err) {
      console.warn('Aviso al sincronizar sesión en ficha standalone:', err);
    }
  }

  // 4. Listeners para acciones personales (específicos de los botones de la ficha actual)

  // Botón Visitar
  const visBtn = document.querySelector('.sheet-hero-btn[data-status="visited"]');
  visBtn?.addEventListener('click', async () => {
    if (!state.sessionToken || !state.userId) {
      showNeoToast(t('toast_login_required_fav', null, 'Inicia sesión para registrar visitas.'));
      return;
    }
    if (!currentBuilding) return;
    const bId = String(currentBuilding.id);
    const current = state.buildingStatuses.get(bId) || ({} as any);
    const nextVisited = !Boolean((current as any).visited);
    const next = { ...current, visited: nextVisited } as any;
    state.buildingStatuses.set(bId, next);
    updateUI();

    try {
      await saveBuildingStatus(state.userId, currentBuilding.id, next, state.sessionToken);
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
    if (!currentBuilding) return;
    const bId = String(currentBuilding.id);
    const current = state.buildingStatuses.get(bId) || ({} as any);
    const nextFav = !Boolean((current as any).favorite);
    const next = { ...current, favorite: nextFav } as any;
    state.buildingStatuses.set(bId, next);
    updateUI();

    try {
      await saveBuildingStatus(state.userId, currentBuilding.id, next, state.sessionToken);
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
    if (!container || !currentBuilding) return;
    const bId = String(currentBuilding.id);
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
    if (!modalOrganizer || !currentBuilding) return;
    const titleEl = document.getElementById('personal-organizer-project');
    if (titleEl) titleEl.textContent = currentBuilding.nombre_obra;
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

  // Configuración única de modales de colecciones y compartir
  if (!modalsInitialized) {
    modalsInitialized = true;

    document.getElementById('btn-personal-organizer-close')?.addEventListener('click', closeOrganizerModal);
    modalOrganizer?.addEventListener('click', (e) => {
      if (e.target === modalOrganizer) closeOrganizerModal();
    });

    // Guardar selección en listas
    document.getElementById('btn-personal-organizer-save')?.addEventListener('click', async () => {
      if (!currentBuilding) return;
      const bId = String(currentBuilding.id);
      const selectedInputs = document.querySelectorAll<HTMLInputElement>('#personal-organizer-options input:checked');
      const selectedIds = Array.from(selectedInputs).map((inp) => inp.value);

      const current = state.userCollectionItems.filter((item) => String(item.building_id) === bId);

      for (const col of state.userCollections) {
        const colId = String(col.id);
        const existing = current.find((item) => String(item.collection_id) === colId);
        if (selectedIds.includes(colId) && !existing) {
          try {
            await addUserCollectionItem(
              { id: `CLI-${Date.now()}-${colId}`, user_id: state.userId, collection_id: colId, building_id: currentBuilding.id },
              state.sessionToken!
            );
            state.userCollectionItems.push({ collection_id: colId, building_id: currentBuilding.id } as any);
          } catch (e) {
            console.warn('Aviso guardando en lista:', e);
          }
        } else if (!selectedIds.includes(colId) && existing) {
          try {
            await deleteUserCollectionItem(colId, state.userId!, currentBuilding.id, state.sessionToken!);
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
    const modalShare = document.getElementById('modal-share');

    document.getElementById('btn-share-close')?.addEventListener('click', () => {
      modalShare?.classList.remove('open');
    });
    modalShare?.addEventListener('click', (e) => {
      if (e.target === modalShare) modalShare?.classList.remove('open');
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
        if (!currentBuilding) return;
        const choice = (btn as HTMLElement).dataset.shareChoice;
        const url = window.location.href;
        const text = `${currentBuilding.nombre_obra} - nolli.`;
        if (choice === 'whatsapp') {
          window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
        } else if (choice === 'google') {
          if (currentBuilding.latitud != null && currentBuilding.longitud != null) {
            window.open(`https://www.google.com/maps/search/?api=1&query=${currentBuilding.latitud},${currentBuilding.longitud}`, '_blank');
          }
        } else if (choice === 'native') {
          if (navigator.share) {
            navigator.share({ title: currentBuilding.nombre_obra, text, url }).catch(() => {});
          } else {
            showNeoToast('Compartir nativo no soportado en este navegador.');
          }
        }
      });
    });
  }

  // Botón Compartir (específico de la ficha actual)
  const shareBtn = document.querySelector('.sheet-hero-btn[data-share-action="open"]');
  const modalShare = document.getElementById('modal-share');

  shareBtn?.addEventListener('click', () => {
    if (!modalShare || !currentBuilding) return;
    const subtitle = document.getElementById('share-project-subtitle');
    if (subtitle) {
      subtitle.textContent = `${currentBuilding.nombre_obra} ${currentBuilding.arquitecto ? `· ${currentBuilding.arquitecto}` : ''}`;
    }
    modalShare.classList.add('open');
  });

  // Botón Editar Obra (Admin)
  const editBtn = document.querySelector<HTMLElement>('[data-edit-building]');
  editBtn?.addEventListener('click', () => {
    if (!esRolAdmin(state.userRole) && !esRolEditor(state.userRole)) {
      showNeoToast('Acceso restringido a administradores.');
      return;
    }
    if (!currentBuilding) return;
    // Redirigir al mapa interactivo con la obra abierta en el modal de edición
    window.location.href = `/?obra=${encodeURIComponent(currentBuilding.id)}&edit=true`;
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
