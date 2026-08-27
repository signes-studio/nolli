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
  map: null,
  mapStyle: 'dark',
  addingBuilding: false,
  privateBuildings: [],
  userCollections: [],
  userCollectionItems: [],
  userPrivateLabels: [],
};

export function esRolAdmin(role = state.userRole) {
  return role === 'admin' || role === 'superadmin';
}

export function separarArquitectos(valor) {
  return String(valor || '')
    .split(/[,/]/)
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

export function normalizarImportancia(valor) {
  const importancia = Number(valor);
  return Number.isFinite(importancia) && importancia >= 0 && importancia <= 3 ? importancia : 1;
}

export function getPersonalFallbackKey(userId) {
  return `nolli:personal-zone:${String(userId || 'guest')}`;
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
    state.userCollections = Array.isArray(payload.collections) ? payload.collections : [];
    state.userCollectionItems = Array.isArray(payload.items) ? payload.items : [];
    state.userPrivateLabels = Array.isArray(payload.labels) ? payload.labels : [];
  } catch {
    state.userCollections = [];
    state.userCollectionItems = [];
    state.userPrivateLabels = [];
  }
}

export function guardarZonaPersonalLocal(userId) {
  if (!userId) return;
  const payload = {
    collections: state.userCollections,
    items: state.userCollectionItems,
    labels: state.userPrivateLabels,
  };
  localStorage.setItem(getPersonalFallbackKey(userId), JSON.stringify(payload));
}