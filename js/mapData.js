/* =========================================================================
   MAPDATA.JS — Sincroniza OBRAS (state) con la fuente GeoJSON de Mapbox
   ========================================================================= */

import { state, esRolAdmin } from './state.js';

function coordenadasVisuales(obra, index, total) {
  if (total === 1) return obra.coordenadas;
  const [longitud, latitud] = obra.coordenadas;
  const radioMetros = 30 + Math.max(0, total - 4) * 3;
  const angulo = (Math.PI * 2 * index / total) - Math.PI / 2;
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
  const gruposPorCoordenadas = new Map();
  obrasVisibles.forEach((obra) => {
    const key = obra.coordenadas.join(',');
    const group = gruposPorCoordenadas.get(key) || [];
    group.push(obra);
    gruposPorCoordenadas.set(key, group);
  });
  gruposPorCoordenadas.forEach((group) => group.sort((first, second) => String(first.id).localeCompare(String(second.id))));

  const geojson = {
    type: 'FeatureCollection',
    features: obrasVisibles.map((obra) => {
      const group = gruposPorCoordenadas.get(obra.coordenadas.join(','));
      const groupIndex = group.indexOf(obra);
      return {
      type: 'Feature',
      id: obra.featureId,
      geometry: { type: 'Point', coordinates: coordenadasVisuales(obra, groupIndex, group.length) },
      properties: {
        ...obra,
        arquitectos: obra.arquitectos || [],
        estado_acceso: obra.estado_acceso || 'privado',
        estado_revision: obra.estado_revision || 'publicada',
        shared_location_count: group.length,
        favorite: state.buildingStatuses.get(String(obra.id))?.favorite ? 1 : 0,
        visited: state.buildingStatuses.get(String(obra.id))?.visited ? 1 : 0,
        selected: obra.selected ? 1 : 0,
      },
    };
    }),
  };

  if (state.map && state.map.getSource('obras')) {
    state.map.getSource('obras').setData(geojson);
  }
}
