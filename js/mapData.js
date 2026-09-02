/* =========================================================================
   MAPDATA.JS — Sincroniza OBRAS (state) con la fuente GeoJSON de Mapbox
   ========================================================================= */

import { state, esRolAdmin } from './state.js';



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

        const cleanName = (obra.nombre_obra || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase()
          .trim();
        const c1 = cleanName.length > 0 ? (cleanName.charCodeAt(0) - 64) : 1;
        const c2 = cleanName.length > 1 ? (cleanName.charCodeAt(1) - 64) : 1;
        const c3 = cleanName.length > 2 ? (cleanName.charCodeAt(2) - 64) : 1;
        const safeC1 = Math.max(1, Math.min(26, c1));
        const safeC2 = Math.max(1, Math.min(26, c2));
        const safeC3 = Math.max(1, Math.min(26, c3));
        const alphaRank = (safeC1 * 676) + (safeC2 * 26) + safeC3;

        const feature = {
          type: 'Feature',
          id: obra.featureId,
          geometry: { type: 'Point', coordinates: coordenadasVisuales(obra) },
          properties: {
            ...obra,
            alpha_rank: alphaRank,
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

        if (obra.importancia === 0 || obra.importancia === 1) {
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
    } catch (err) {
      console.warn('Aviso en sincronización de datos de mapa:', err);
    }
  }, 30);
}