/**
 * STORAGE.TS — Capa de persistencia en IndexedDB de alto rendimiento
 * Permite almacenar el catálogo completo de obras (+10.000) sin el límite de 5 MB de localStorage.
 * Proporciona carga instantánea offline / 0ms y no bloquea el hilo principal de la UI.
 */

import type { Building } from './types/index.js';

const DB_NAME = 'nolli_cache_db';
const DB_VERSION = 1;
const STORE_NAME = 'catalog_store';
const KEY_CATALOG = 'buildings_catalog';
const KEY_META = 'catalog_meta';

export interface CatalogMetadata {
  count: number;
  syncedAt: number;
  version: string;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function isIndexedDBAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Abre o inicializa la base de datos IndexedDB de Nolli de forma defensiva
 */
export function openCatalogDB(): Promise<IDBDatabase | null> {
  if (!isIndexedDBAvailable()) {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (err) => {
        console.warn('Aviso: No se pudo abrir IndexedDB (modo incógnito o permisos):', err);
        resolve(null);
      };

      request.onblocked = () => {
        console.warn('Aviso: Base de datos IndexedDB bloqueada por otra pestaña.');
        resolve(null);
      };
    } catch (e) {
      console.warn('Aviso: Excepción al inicializar IndexedDB:', e);
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Recupera el catálogo completo de obras desde IndexedDB
 */
export async function getCatalogFromIDB(): Promise<Building[] | null> {
  const db = await openCatalogDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(KEY_CATALOG);

      request.onsuccess = () => {
        const result = request.result;
        if (Array.isArray(result) && result.length > 0) {
          resolve(result as Building[]);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Guarda el catálogo de obras en IndexedDB junto con sus metadatos
 */
export async function saveCatalogToIDB(buildings: Building[], syncedAt: number = Date.now()): Promise<boolean> {
  if (!Array.isArray(buildings) || buildings.length === 0) return false;
  const db = await openCatalogDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      store.put(buildings, KEY_CATALOG);
      store.put({
        count: buildings.length,
        syncedAt,
        version: 'v2',
      } as CatalogMetadata, KEY_META);

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Consulta los metadatos de sincronización del catálogo en IndexedDB
 */
export async function getCatalogMetaFromIDB(): Promise<CatalogMetadata | null> {
  const db = await openCatalogDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(KEY_META);

      request.onsuccess = () => {
        resolve((request.result as CatalogMetadata) || null);
      };

      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Borra el catálogo de IndexedDB (utilizado en invalidaciones forzadas)
 */
export async function clearCatalogIDB(): Promise<boolean> {
  const db = await openCatalogDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.delete(KEY_CATALOG);
      store.delete(KEY_META);

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

