/* =========================================================================
   STATE.JS — Estado compartido de la aplicación (Actualizado para filtros de Categorías y Accesos)
   ========================================================================= */

export const state = {
  OBRAS: [],
  BUILDING_CATALOG: [],
  ARQUITECTOS: [],
  sessionToken: null,
  userRole: null,
  adminMode: false,
  userId: null,
  userEmail: null,
  userProfile: null,
  buildingStatuses: new Map(),
  pendingLngLat: null,
  editingBuildingId: null,
  selectedFeatureId: null,
  activeItinerary: null,
  locationMarker: null,
  userLocation: null,
  activeDecada: '',
  activeVisitable: '',
  // Nuevos conjuntos por defecto para los filtros de categorías y estados de acceso
  activeCategorias: new Set([
    'residencial',
    'dotacional_equipamiento',
    'industrial_logistico',
    'religioso_funerario',
    'comercial_terciario',
    'espacio_publico_paisaje',
    'infraestructura_urbanismo',
    'otro',
  ]),
  activeAccesos: new Set([
    'publico',
    'exterior_visible',
    'con_reserva',
    'privado',
    'cerrado_temporalmente',
    'no_construido',
    'desaparecido',
  ]),
  activeArquitectos: new Set(),
  map: null,
  mapStyle: 'abstract',
  addingBuilding: false,
  privateBuildings: [],
  userCollections: [],
  userCollectionItems: [],
  userFollowedCollections: [],
  userPrivateLabels: [],
};

export const AUTH_STORAGE_KEYS = [
  'nolli_admin_session_token',
  'nolli_cached_user',
  'nolli_cached_db_profile',
  'nolli_cached_statuses',
  'nolli_cached_collections',
  'nolli_cached_labels',
];

export function clearAuthState() {
  AUTH_STORAGE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });

  state.sessionToken = null;
  state.userRole = null;
  state.adminMode = false;
  state.userId = null;
  state.userEmail = null;
  state.userProfile = null;
  state.buildingStatuses = new Map();
  state.userCollections = [];
  state.userCollectionItems = [];
  state.userFollowedCollections = [];
  state.userPrivateLabels = [];
  state.privateBuildings = [];
  return true;
}

export function normalizeBuildingIdentity(building = null) {
  if (!building) return '';
  return String(building.id ?? building.featureId ?? building.building_id ?? building.obra_id ?? '').trim();
}

export function upsertBuilding(list = [], building = null) {
  if (!building) return list;
  const nextList = Array.isArray(list) ? [...list] : [];
  const identity = normalizeBuildingIdentity(building);
  if (!identity) {
    nextList.push(building);
    return nextList;
  }

  const idx = nextList.findIndex((item) => normalizeBuildingIdentity(item) === identity);
  if (idx >= 0) {
    nextList[idx] = { ...nextList[idx], ...building };
    return nextList;
  }

  nextList.push(building);
  return nextList;
}

export function dedupeBuildings(list = []) {
  const byId = new Map();
  for (const building of list || []) {
    if (!building) continue;
    const identity = normalizeBuildingIdentity(building);
    if (!identity) continue;
    const existing = byId.get(identity);
    if (existing) {
      byId.set(identity, { ...existing, ...building });
    } else {
      byId.set(identity, building);
    }
  }
  return [...byId.values()];
}

export function esRolAdmin(role = state.userRole) {
  return role === 'admin' || role === 'superadmin';
}

export function esRolTester(role = state.userRole) {
  return role === 'tester' || role === 'admin' || role === 'superadmin';
}

export function esRolSuperadmin(role = state.userRole) {
  return role === 'superadmin';
}

export function separarArquitectos(valor) {
  return String(valor || '')
    .split(/[,;]/)
    .map((nombre) => nombre.trim())
    .filter(Boolean);
}

export function normalizarCategoria(valor) {
  const categoria = String(valor || '').trim().toLowerCase();
  if (!categoria) return 'otro';
  if (categoria.includes('residencial') || categoria.includes('vivienda') || categoria.includes('casa')) return 'residencial';
  if (categoria.includes('religios') || categoria.includes('funer') || categoria.includes('tanatorio') || categoria.includes('cementerio')) return 'religioso_funerario';
  if (categoria.includes('industrial') || categoria.includes('logíst') || categoria.includes('logist')) return 'industrial_logistico';
  if (categoria.includes('comercial') || categoria.includes('comercio') || categoria.includes('mercado') || categoria.includes('hotel') || categoria.includes('oficina')) return 'comercial_terciario';
  if (categoria.includes('parque') || categoria.includes('plaza') || categoria.includes('paisaje') || categoria.includes('jard')) return 'espacio_publico_paisaje';
  if (categoria.includes('infraestruct') || categoria.includes('puente') || categoria.includes('estación') || categoria.includes('estacion') || categoria.includes('urban')) return 'infraestructura_urbanismo';
  if (categoria.includes('equipamiento') || categoria.includes('educativ') || categoria.includes('escuela') || categoria.includes('colegio') || categoria.includes('univers') || categoria.includes('biblioteca') || categoria.includes('museo') || categoria.includes('cultural') || categoria.includes('deport') || categoria.includes('salud') || categoria.includes('hospital') || categoria.includes('ayuntamiento')) return 'dotacional_equipamiento';
  return 'otro';
}

export function nombreCategoria(valor) {
  return {
    residencial: 'RESIDENCIAL',
    dotacional_equipamiento: 'DOTACIONAL Y EQUIPAMIENTO',
    industrial_logistico: 'INDUSTRIAL Y LOGÍSTICO',
    religioso_funerario: 'RELIGIOSO Y FUNERARIO',
    comercial_terciario: 'COMERCIAL Y TERCIARIO',
    espacio_publico_paisaje: 'ESPACIO PÚBLICO Y PAISAJE',
    infraestructura_urbanismo: 'INFRAESTRUCTURA Y URBANISMO',
    otro: 'OTRO',
  }[normalizarCategoria(valor)] || 'OTRO';
}

export const CATEGORY_COLORS = {
  residencial: '#E95C0C',
  dotacional_equipamiento: '#EFBC02',
  industrial_logistico: '#064773',
  religioso_funerario: '#F2ACCD',
  comercial_terciario: '#4388C6',
  espacio_publico_paisaje: '#0D682F',
  infraestructura_urbanismo: '#E41F23',
  otro: '#691B14'
};                                   

export const CATEGORY_NAMES = {
  residencial: 'RESIDENCIAL',
  dotacional_equipamiento: 'DOTACIONAL / EQUIPAMIENTO',
  industrial_logistico: 'INDUSTRIAL / LOGÍSTICO',
  religioso_funerario: 'RELIGIOSO / FUNERARIO',
  comercial_terciario: 'COMERCIAL / TERCIARIO',
  espacio_publico_paisaje: 'ESPACIO PÚBLICO / PAISAJE',
  infraestructura_urbanismo: 'INFRAESTRUCTURA / URBANISMO',
  otro: 'OTRO'
};

/**
 * CATEGORY_META — Fuente única de verdad para metadatos de categorías
 * Consolidado de: filtersUI, mapController, searchUI, sheetUI, mobileBottomNav
 * Evita duplicación y facilita cambios globales
 */
export const CATEGORY_META = {
  residencial: {
    key: 'residencial',
    label: 'Residencial',
    labelShort: 'RESIDENCIAL',
    color: '#E84E1B',
    emoji: '🏠',
    icon: 'home'
  },
  dotacional_equipamiento: {
    key: 'dotacional_equipamiento',
    label: 'Dotacional / Equipamiento',
    labelShort: 'DOTACIONAL Y EQUIPAMIENTO',
    color: '#EFBC02',
    emoji: '🏛️',
    icon: 'building-2'
  },
  industrial_logistico: {
    key: 'industrial_logistico',
    label: 'Industrial / Logístico',
    labelShort: 'INDUSTRIAL Y LOGÍSTICO',
    color: '#0d682f',
    emoji: '🏭',
    icon: 'factory'
  },
  religioso_funerario: {
    key: 'religioso_funerario',
    label: 'Religioso / Funerario',
    labelShort: 'RELIGIOSO Y FUNERARIO',
    color: '#7c3aed',
    emoji: '⛪',
    icon: 'cross'
  },
  comercial_terciario: {
    key: 'comercial_terciario',
    label: 'Comercial / Terciario',
    labelShort: 'COMERCIAL Y TERCIARIO',
    color: '#0284c7',
    emoji: '🏪',
    icon: 'shopping-bag'
  },
  espacio_publico_paisaje: {
    key: 'espacio_publico_paisaje',
    label: 'Espacio Público / Paisaje',
    labelShort: 'ESPACIO PÚBLICO Y PAISAJE',
    color: '#10b981',
    emoji: '🌳',
    icon: 'trees'
  },
  infraestructura_urbanismo: {
    key: 'infraestructura_urbanismo',
    label: 'Infraestructura / Urbanismo',
    labelShort: 'INFRAESTRUCTURA Y URBANISMO',
    color: '#64748b',
    emoji: '🌉',
    icon: 'bridge'
  },
  otro: {
    key: 'otro',
    label: 'Otros',
    labelShort: 'OTRO',
    color: '#555550',
    emoji: '📍',
    icon: 'map-pin'
  }
};

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function normalizarImportancia(valor) {
  const importancia = Number(valor);
  return Number.isFinite(importancia) && importancia >= 0 && importancia <= 3 ? importancia : 1;
}

export function transformarEdificio(fila, index = 0) {
  if (!fila) return null;
  const idStr = String(fila.id ?? `obra-${index}`);
  const lon = Number(fila.longitud ?? (Array.isArray(fila.coordenadas) ? fila.coordenadas[0] : 0));
  const lat = Number(fila.latitud ?? (Array.isArray(fila.coordenadas) ? fila.coordenadas[1] : 0));
  return {
    id: fila.id ?? idStr,
    featureId: idStr,
    nombre_obra: fila.nombre_obra || 'Obra de arquitectura',
    foto_url: fila.foto_url || null,
    enlace_url: fila.enlace_url || null,
    arquitecto: fila.arquitecto || '',
    arquitectos: Array.isArray(fila.arquitectos) ? fila.arquitectos : separarArquitectos(fila.arquitecto),
    año_construccion: fila.año_construccion || null,
    importancia: normalizarImportancia(fila.importancia),
    categoria: normalizarCategoria(fila.categoria),
    ciudad: fila.place || fila.ciudad || null,
    place: fila.place || fila.ciudad || null,
    estado_acceso: fila.estado_acceso || (fila.visitable ? 'publico' : 'privado'),
    añadido_por: fila.añadido_por || null,
    estado_revision: fila.estado_revision || 'publicada',
    coordenadas: [lon, lat],
    selected: Boolean(fila.selected),
    private: Boolean(fila.private),
  };
}

export function getPersonalFallbackKey(userId) {
  return `nolli:personal-zone:${String(userId || 'guest')}`;
}

export function getCollectionMapPrefsKey(userId) {
  return `nolli:collection-map-prefs:${String(userId || 'guest')}`;
}

export function cargarPreferenciasMapaColecciones(userId) {
  try {
    const raw = localStorage.getItem(getCollectionMapPrefsKey(userId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function guardarPreferenciasMapaColecciones(userId, prefs) {
  try {
    localStorage.setItem(getCollectionMapPrefsKey(userId), JSON.stringify(prefs));
  } catch {}
}

export function aplicarPreferenciasMapaColecciones(collections, userId) {
  if (!Array.isArray(collections)) return [];
  const prefs = cargarPreferenciasMapaColecciones(userId);
  return collections.map((col) => {
    const colId = String(col.id);
    const show_on_map = prefs[colId] !== undefined
      ? prefs[colId]
      : (col.show_on_map !== undefined ? col.show_on_map : true); // Por defecto TRUE
    return {
      ...col,
      show_on_map: Boolean(show_on_map),
    };
  });
}

export function cargarZonaPersonalLocal(userId) {
  if (!userId) {
    state.userCollections = [];
    state.userCollectionItems = [];
    state.userPrivateLabels = [];
    return;
  }
  try {
    const raw = localStorage.getItem(getPersonalFallbackKey(userId));
    const payload = raw ? JSON.parse(raw) : {};
    const rawCollections = Array.isArray(payload.collections) ? payload.collections : [];
    state.userCollections = aplicarPreferenciasMapaColecciones(rawCollections, userId);
    state.userCollectionItems = Array.isArray(payload.items) ? payload.items : [];
    state.userPrivateLabels = Array.isArray(payload.labels) ? payload.labels : [];

    // Restaurar estados de edificios si aún no se han cargado en memoria
    if (state.buildingStatuses.size === 0) {
      const cachedStatuses = localStorage.getItem(`nolli:building-status:${userId}`);
      if (cachedStatuses) {
        try {
          const parsed = JSON.parse(cachedStatuses);
          state.buildingStatuses = new Map(Array.isArray(parsed) ? parsed : []);
        } catch {}
      }
    }
  } catch {
    state.userCollections = [];
    state.userCollectionItems = [];
    state.userPrivateLabels = [];
  }
}

export function guardarZonaPersonalLocal(userId) {
  if (!userId) return;

  // Persistir preferencias específicas de visualización en mapa
  const prefs = {};
  (state.userCollections || []).forEach((col) => {
    if (col && col.id) {
      prefs[String(col.id)] = col.show_on_map !== false;
    }
  });
  guardarPreferenciasMapaColecciones(userId, prefs);

  const payload = {
    collections: state.userCollections,
    items: state.userCollectionItems,
    labels: state.userPrivateLabels,
  };
  localStorage.setItem(getPersonalFallbackKey(userId), JSON.stringify(payload));
}