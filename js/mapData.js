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

let updateTimeout = null;

export function actualizarFuenteMapa() {
  if (updateTimeout) clearTimeout(updateTimeout);

  updateTimeout = setTimeout(() => {
    if (!state.map) return;

    const obrasVisibles = state.OBRAS.filter((obra) => esRolAdmin(state.userRole) && state.adminMode
      ? obra.estado_revision !== 'rechazada'
      : obra.estado_revision !== 'pendiente' && obra.estado_revision !== 'rechazada');
    
    const ubicacionesCompartidas = new Map();
    obrasVisibles.forEach((obra) => {
      const key = obra.coordenadas.join(',');
      ubicacionesCompartidas.set(key, (ubicacionesCompartidas.get(key) || 0) + 1);
    });

    // Mapeo de obras pertenecientes a listas con visualización en mapa activada (por defecto activa)
    const coleccionesConIconoActivo = (state.userCollections || []).filter((col) => col.show_on_map !== false && col.icon);
    const coleccionPorObra = new Map();
    if (coleccionesConIconoActivo.length > 0 && Array.isArray(state.userCollectionItems)) {
      coleccionesConIconoActivo.forEach((col) => {
        state.userCollectionItems.forEach((item) => {
          if (String(item.collection_id) === String(col.id)) {
            coleccionPorObra.set(String(item.building_id), col);
          }
        });
      });
    }

    const masterFeatures = [];
    const standardFeatures = [];

    obrasVisibles.forEach((obra) => {
      const activeCollection = coleccionPorObra.get(String(obra.id));
      const feature = {
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
          ...(activeCollection ? {
            collection_emoji: activeCollection.icon,
            collection_id: activeCollection.id,
          } : {}),
        },
      };

      if (obra.importancia === 0) {
        masterFeatures.push(feature);
      } else {
        standardFeatures.push(feature);
      }
    });

    const publicSource = state.map.getSource('obras');
    const masterpieceSource = state.map.getSource('obras-maestras');

    if (publicSource) {
      publicSource.setData({
        type: 'FeatureCollection',
        features: standardFeatures,
      });
    }
    
    if (masterpieceSource) {
      masterpieceSource.setData({
        type: 'FeatureCollection',
        features: masterFeatures,
      });
    }
  }, 30);
}