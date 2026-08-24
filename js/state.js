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
  pendingLngLat: null,
  editingBuildingId: null,
  selectedFeatureId: null,
  locationMarker: null,
  userLocation: null,
  activeDecada: '',
  activeCategoria: '',
  activeVisitable: '',
  map: null,
};

export function separarArquitectos(valor) {
  return String(valor || '')
    .split(',')
    .map((nombre) => nombre.trim())
    .filter(Boolean);
}
