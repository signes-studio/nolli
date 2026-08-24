/* =========================================================================
   MAPDATA.JS — Sincroniza OBRAS (state) con la fuente GeoJSON de Mapbox
   Módulo intermedio para que sheetUI/modalsUI puedan refrescar el mapa
   sin depender de mapController (evita dependencias circulares).
   ========================================================================= */

import { state } from './state.js';

export function actualizarFuenteMapa() {
  const geojson = {
    type: 'FeatureCollection',
    features: state.OBRAS.map((o) => ({
      type: 'Feature',
      id: o.id,
      geometry: { type: 'Point', coordinates: o.coordenadas },
      properties: o,
    })),
  };

  if (state.map.getSource('obras')) {
    state.map.getSource('obras').setData(geojson);
  } else {
    state.map.addSource('obras', { type: 'geojson', data: geojson });
  }
}
