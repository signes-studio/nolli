/* =========================================================================
   STATE.JS — Estado compartido de la aplicación
   Único objeto mutable importado por los demás módulos. Evita variables
   sueltas en window y centraliza la fuente de verdad.
   ========================================================================= */

export const state = {
  OBRAS: [],
  ARQUITECTOS: [],
  activeArquitectos: new Set(),
  sessionToken: null,
  userRole: null,
  adminMode: false,
  userId: null,
  userEmail: null,
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
