/**
 * PWAUPDATE.TS — Gestor proactivo de ciclo de vida y actualizaciones inmediatas de la PWA
 * 
 * Garantiza que las sesiones instaladas en dispositivos móviles y navegadores
 * siempre ejecuten la versión más reciente del código (comportamiento equivalente a modo incógnito).
 */

declare global {
  interface Window {
    nolliForceAppUpdate?: () => Promise<void>;
    nolliCheckForUpdate?: () => Promise<boolean>;
    nolliState?: {
      editingBuildingId?: string | number | null;
      addingBuilding?: boolean;
    };
  }
}

let registration: ServiceWorkerRegistration | null = null;
let isCheckingUpdate = false;
let hasHadController = Boolean(typeof navigator !== 'undefined' && navigator.serviceWorker?.controller);

/**
 * Muestra notificación interactiva con fallback si renderUtils no está cargado
 */
async function notificarActualizacion(
  mensaje: string,
  actionText: string | null = null,
  onAction: (() => void) | null = null
): Promise<void> {
  try {
    const { showNeoToast } = await import('./renderUtils.js');
    showNeoToast(mensaje, {
      actionText,
      onAction,
      duration: actionText ? 10000 : 3500,
    });
  } catch {
    if (actionText && onAction) {
      onAction();
    }
  }
}

/**
 * Solicita al navegador comprobar byte a byte si hay un sw.js más reciente en el servidor
 */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration || isCheckingUpdate) return false;
  isCheckingUpdate = true;
  try {
    await registration.update();
    return true;
  } catch (e) {
    return false;
  } finally {
    isCheckingUpdate = false;
  }
}

/**
 * Fuerza una actualización inmediata limpiando cachés (equivalente exacto a modo incógnito)
 */
export async function forceAppUpdate(): Promise<void> {
  try {
    await notificarActualizacion('Descargando última versión de nolli...', null, null);

    // 1. Limpiar todos los caches del Service Worker
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }

    // 2. Limpiar IndexedDB del catálogo y marcas locales
    try {
      const { clearCatalogIDB } = await import('./storage.js');
      await clearCatalogIDB();
    } catch {}
    try {
      localStorage.removeItem('nolli:buildings-catalog:v2');
      localStorage.removeItem('nolli:catalog-synced-at');
    } catch {}

    // 3. Forzar actualización de Service Workers registrados
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        await reg.update().catch(() => {});
      }
    }

    // 4. Recargar forzando timestamp para evitar caché HTTP residual
    const url = new URL(window.location.href);
    url.searchParams.set('reload_ts', String(Date.now()));
    window.location.replace(url.toString());
  } catch (err) {
    console.warn('Error al forzar actualización PWA:', err);
    window.location.reload();
  }
}

/**
 * Inicializa el observador del ciclo de vida del Service Worker
 */
export async function initPwaUpdate(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    // 1. Registro con updateViaCache: 'none' (estándar W3C para evitar caché HTTP en sw.js)
    registration = await navigator.serviceWorker.register('/sw.js', {
      updateViaCache: 'none',
    });

    // 2. Comprobación proactiva al inicio
    checkForUpdate();

    // 3. Detectar nuevo Service Worker esperando o instalando
    registration.addEventListener('updatefound', () => {
      const newWorker = registration?.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('[PWA] Nueva versión descargada e instalada en segundo plano.');
        }
      });
    });

    // 4. Revalidar al cambiar de visibilidad (crucial en iOS/Android PWA standalone al salir y volver)
    let lastVisibilityCheck = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        // Comprobar si han pasado al menos 30 segundos desde el último chequeo
        if (now - lastVisibilityCheck > 30 * 1000) {
          lastVisibilityCheck = now;
          checkForUpdate();
        }
      }
    });

    // 5. Revalidar al recuperar conexión online
    window.addEventListener('online', () => {
      checkForUpdate();
    });

    // 6. Polling defensivo cada 15 minutos en segundo plano
    setInterval(() => {
      checkForUpdate();
    }, 15 * 60 * 1000);

    // 7. Manejo de controllerchange (el nuevo Service Worker tomó el control)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Si es la primera vez que se registra en una instalación limpia, no recargar
      if (!hasHadController) {
        hasHadController = true;
        return;
      }

      if (refreshing) return;
      refreshing = true;

      // Cooldown de 10s en sessionStorage para prevenir bucles
      let lastReload = 0;
      try {
        lastReload = Number(sessionStorage.getItem('nolli_pwa_reloaded_at') || 0);
      } catch {}
      if (Date.now() - lastReload < 10000) {
        return;
      }
      try {
        sessionStorage.setItem('nolli_pwa_reloaded_at', String(Date.now()));
      } catch {}

      // Comprobar si hay alguna acción crítica del usuario en curso (ej. modal de añadir obra abierto)
      const modalAdd = document.getElementById('modal-add-building');
      const isEditing = Boolean(
        window.nolliState?.editingBuildingId ||
        window.nolliState?.addingBuilding ||
        (modalAdd && !modalAdd.classList.contains('hidden') && modalAdd.style.display !== 'none') ||
        document.querySelector('#modal-edit-building.open, #modal-add-sheet-photo.open')
      );

      if (isEditing) {
        notificarActualizacion('Nueva versión de nolli. lista.', 'ACTUALIZAR', () => {
          window.location.reload();
        });
      } else {
        console.log('[PWA] Activando nueva versión de la aplicación...');
        window.location.reload();
      }
    });

    // 8. Mensajes desde el Service Worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_ACTIVATED') {
        console.log('[PWA] Versión activa confirmada por SW:', event.data.cacheName);
      }
    });

  } catch (err) {
    console.warn('[PWA] Error en ciclo de vida del Service Worker:', err);
  }
}

// Auto-inicialización en entorno de navegador
if (typeof window !== 'undefined') {
  initPwaUpdate().catch(() => {});
  window.nolliForceAppUpdate = forceAppUpdate;
  window.nolliCheckForUpdate = checkForUpdate;
}

