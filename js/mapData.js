/* =========================================================================
   MAPDATA.JS — Sincroniza OBRAS (state) con la fuente GeoJSON de Mapbox
   ========================================================================= */

import { state } from './state.js';

export function actualizarFuenteMapa() {
  const geojson = {
    type: 'FeatureCollection',
    features: state.OBRAS.map((o) => ({
      type: 'Feature',
      id: o.featureId,
      geometry: { type: 'Point', coordinates: o.coordenadas },
      properties: {
        ...o,
        arquitectos: o.arquitectos || [],
        estado_acceso: o.estado_acceso || 'privado',
        favorite: state.buildingStatuses.get(String(o.id))?.favorite ? 1 : 0,
        visited: state.buildingStatuses.get(String(o.id))?.visited ? 1 : 0,
        selected: o.selected ? 1 : 0,
      },
    })),
  };

  if (state.map && state.map.getSource('obras')) {
    state.map.getSource('obras').setData(geojson);
  }
}
