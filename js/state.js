/* =========================================================================
   STATE.JS — Estado compartido de la aplicación
   Único objeto mutable importado por los demás módulos. Evita variables
   sueltas en window y centraliza la fuente de verdad.
   ========================================================================= */

export const state = {
  OBRAS: [],
  BUILDING_CATALOG: [],
  ARQUITECTOS: [],
  activeArquitectos: new Set(),
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
  activeCategoria: '',
  activeVisitable: '',
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
