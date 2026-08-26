/* =========================================================================
   MAPDATA.JS — Sincroniza OBRAS (state) con la fuente GeoJSON de Mapbox
   ========================================================================= */

import { state, esRolAdmin } from './state.js';

function coordenadasVisuales(obra) {
  const [longitud, latitud] = obra.coordenadas;
  const id = String(obra.id ?? obra.featureId);
  const hash = [...id].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 7);
  const radioMetros = 14 + (hash % 8);
  const angulo = (hash / 4294967296) * Math.PI * 2;
  const metrosPorGradoLatitud = 111320;
  const metrosPorGradoLongitud = metrosPorGradoLatitud * Math.cos(latitud * Math.PI / 180);
  return [
    longitud + (Math.cos(angulo) * radioMetros / metrosPorGradoLongitud),
    latitud + (Math.sin(angulo) * radioMetros / metrosPorGradoLatitud),
  ];
}

export function actualizarFuenteMapa() {
  const obrasVisibles = state.OBRAS.filter((obra) => esRolAdmin(state.userRole) && state.adminMode
    ? obra.estado_revision !== 'rechazada'
    : obra.estado_revision !== 'pendiente' && obra.estado_revision !== 'rechazada');
  const ubicacionesCompartidas = new Map();
  obrasVisibles.forEach((obra) => {
    const key = obra.coordenadas.join(',');
    ubicacionesCompartidas.set(key, (ubicacionesCompartidas.get(key) || 0) + 1);
  });
  const geojson = {
    type: 'FeatureCollection',
    features: obrasVisibles.map((obra) => {
      return {
      type: 'Feature',
      id: obra.featureId,
      geometry: { type: 'Point', coordinates: coordenadasVisuales(obra) },
      properties: {
        ...obra,
        arquitectos: obra.arquitectos || [],
        estado_acceso: obra.estado_acceso || 'privado',
        estado_revision: obra.estado_revision || 'publicada',
        shared_location_count: ubicacionesCompartidas.get(obra.coordenadas.join(',')) || 1,
        favorite: state.buildingStatuses.get(String(obra.id))?.favorite ? 1 : 0,
        visited: state.buildingStatuses.get(String(obra.id))?.visited ? 1 : 0,
        selected: obra.selected ? 1 : 0,
      },
    };
    }),
  };

  if (state.map) {
    const publicSource = state.map.getSource('obras');
    const masterpieceSource = state.map.getSource('obras-maestras');
    publicSource?.setData({
      ...geojson,
      features: geojson.features.filter((feature) => feature.properties.importancia > 0),
    });
    masterpieceSource?.setData({
      ...geojson,
      features: geojson.features.filter((feature) => feature.properties.importancia === 0),
    });
  }
}
