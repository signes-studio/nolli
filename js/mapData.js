/* =========================================================================
   MAPDATA.JS — Sincroniza OBRAS (state) con la fuente GeoJSON de Mapbox
   ========================================================================= */

import { state, esRolAdmin } from './state.js';

/**
 * Agrupa edificios en clusters por proximidad geográfica cuando zoom < 9
 * Para evitar renderizar cientos de marcadores simultáneamente.
 * 
 * @param {Array} features - Array de features GeoJSON a potencialmente agrupar
 * @param {number} zoom - Nivel de zoom actual
 * @returns {Array} Features agrupadas (clusters + individuales) o features originales si zoom >= 9
 */
function clusterFeaturesByProximity(features, zoom) {
  if (zoom >= 9 || !features || features.length === 0) {
    return features; // Sin clustering a zoom alto
  }

  // Crear cuadrícula geográfica: dividir mapa en celdas
  const gridSize = Math.pow(2, 8 - Math.floor(zoom)); // Ajusta tamaño de celda según zoom
  const clusters = new Map();
  const clusteredIndices = new Set();

  features.forEach((feature, idx) => {
    const [lon, lat] = feature.geometry.coordinates;
    const cellKey = `${Math.floor(lon / gridSize)},${Math.floor(lat / gridSize)}`;
    
    if (!clusters.has(cellKey)) {
      clusters.set(cellKey, []);
    }
    clusters.get(cellKey).push({ feature, idx, lon, lat });
  });

  // Convertir clusters con múltiples elementos en puntos de cluster
  const result = [];
  clusters.forEach((cellFeatures) => {
    if (cellFeatures.length === 1) {
      // Si hay solo un edificio en la celda, incluirlo normalmente
      result.push(cellFeatures[0].feature);
    } else {
      // Crear cluster punto en el centroide de los edificios
      const avgLon = cellFeatures.reduce((sum, f) => sum + f.lon, 0) / cellFeatures.length;
      const avgLat = cellFeatures.reduce((sum, f) => sum + f.lat, 0) / cellFeatures.length;
      
      result.push({
        type: 'Feature',
        id: `cluster-${cellFeatures.map(f => f.idx).join('-')}`,
        geometry: { type: 'Point', coordinates: [avgLon, avgLat] },
        properties: {
          ...cellFeatures[0].feature.properties,
          is_cluster: true,
          cluster_count: cellFeatures.length,
          cluster_ids: cellFeatures.map(f => f.feature.id),
        },
      });
      
      cellFeatures.forEach(f => clusteredIndices.add(f.idx));
    }
  });

  return result;
}

function coordenadasVisuales(obra) {
  if (!obra || !Array.isArray(obra.coordenadas) || !Number.isFinite(obra.coordenadas[0]) || !Number.isFinite(obra.coordenadas[1])) {
    return [0, 0];
  }
  const [longitud, latitud] = obra.coordenadas;
  const id = String(obra.id ?? obra.featureId ?? '0');
  const hash = [...id].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 7);
  const radioMetros = 14 + (hash % 8);
  const angulo = (hash / 4294967296) * Math.PI * 2;
  const metrosPorGradoLatitud = 111320;
  const metrosPorGradoLongitud = metrosPorGradoLatitud * Math.cos(latitud * Math.PI / 180);
  if (!Number.isFinite(metrosPorGradoLongitud) || metrosPorGradoLongitud === 0) {
    return [longitud, latitud];
  }
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

    try {
      let obrasVisibles = (state.OBRAS || []).filter((obra) => {
        if (!obra || !Array.isArray(obra.coordenadas) || !Number.isFinite(obra.coordenadas[0]) || !Number.isFinite(obra.coordenadas[1])) {
          return false;
        }
        if (obra.private) return true; // Las etiquetas/obras privadas del usuario son siempre visibles en su mapa
        if (esRolAdmin(state.userRole) && state.adminMode) {
          return obra.estado_revision !== 'rechazada';
        }
        return obra.estado_revision !== 'pendiente' && obra.estado_revision !== 'rechazada';
      });

      // Aislamiento de datos en Modo Itinerario
      if (state.activeItinerary && state.activeItinerary.workIds && state.activeItinerary.workIds.size > 0) {
        obrasVisibles = obrasVisibles.filter((obra) => state.activeItinerary.workIds.has(String(obra.id)));
      }
      
      const ubicacionesCompartidas = new Map();
      obrasVisibles.forEach((obra) => {
        const key = obra.coordenadas.join(',');
        ubicacionesCompartidas.set(key, (ubicacionesCompartidas.get(key) || 0) + 1);
      });

      // Mapeo de obras pertenecientes a listas con visualización en mapa activada
      // RECOMENDADO FIX #2: Optimizar de O(n*m) a O(n) usando Map
      const coleccionesConIconoActivo = (state.userCollections || []).filter((col) => col.show_on_map !== false && col.icon);
      const coleccionPorObra = new Map();
      
      if (coleccionesConIconoActivo.length > 0 && Array.isArray(state.userCollectionItems)) {
       // Mapeo O(n): una sola pasada por items
       state.userCollectionItems.forEach((item) => {
         const buildingId = String(item.building_id);
         // Si este item ya está mapeado, mantener la primera colección
         if (!coleccionPorObra.has(buildingId)) {
           const col = coleccionesConIconoActivo.find((c) => String(c.id) === String(item.collection_id));
           if (col) {
             coleccionPorObra.set(buildingId, col);
           }
         }
       });
      }

      const isSearchActive = Boolean(state.activeItinerary && (state.activeItinerary.isSearch || String(state.activeItinerary.id || '').startsWith('search-')));

      const masterFeatures = [];
      const standardFeatures = [];

      obrasVisibles.forEach((obra) => {
        const activeCollection = coleccionPorObra.get(String(obra.id));
        const hasCustomEmoji = activeCollection && activeCollection.icon && activeCollection.id && state.map.hasImage && state.map.hasImage(`collection-emoji-${activeCollection.id}`);

        const feature = {
          type: 'Feature',
          id: obra.featureId,
          geometry: { type: 'Point', coordinates: coordenadasVisuales(obra) },
          properties: {
            ...obra,
            arquitectos: obra.arquitectos || [],
            estado_acceso: obra.estado_acceso || 'privado',
            estado_revision: obra.private ? 'privada' : (obra.estado_revision || 'publicada'),
            shared_location_count: ubicacionesCompartidas.get(obra.coordenadas.join(',')) || 1,
            favorite: state.buildingStatuses?.get(String(obra.id))?.favorite ? 1 : 0,
            visited: state.buildingStatuses?.get(String(obra.id))?.visited ? 1 : 0,
            selected: obra.selected ? 1 : 0,
            is_search: isSearchActive ? 1 : 0,
            ...(hasCustomEmoji ? {
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

      // Aplicar clustering a zoom bajo (< 9) solo si NO estamos en modo búsqueda de resultados
      const currentZoom = state.map?.getZoom?.() || 10;
      const clusteringEnabled = isSearchActive ? false : (currentZoom < 9);
      const clusteredStandardFeatures = clusteringEnabled ? clusterFeaturesByProximity(standardFeatures, currentZoom) : standardFeatures;

      if (publicSource) {
        publicSource.setData({
          type: 'FeatureCollection',
          features: clusteredStandardFeatures,
        });
      }
       
      if (masterpieceSource) {
        masterpieceSource.setData({
          type: 'FeatureCollection',
          features: masterFeatures,
        });
      }
    } catch (err) {
      console.warn('Aviso en sincronización de datos de mapa:', err);
    }
  }, 30);
}