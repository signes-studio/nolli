/* =========================================================================
   MAPDATA.TS — Sincroniza OBRAS (state) con la fuente GeoJSON de Mapbox
   ========================================================================= */

import { state, esRolAdmin, separarArquitectos } from './state.js';
import { obraCumpleFiltrosActivos } from './filterEngine.js';
import type { Building, BuildingGeoJSONFeature } from './types/index.js';

interface InternalBuildingFields extends Building {
  _alphaRank?: number;
  _textoEtiqueta?: string;
  _nombreObraLimpio?: string;
  _arqNombre?: string;
  _sharedCoords?: [number, number];
  private?: boolean;
  selected?: boolean;
}

interface MapSourceWithSetData {
  setData: (data: unknown) => void;
}

interface MapWithSources {
  getSource: (id: string) => MapSourceWithSetData | null | undefined;
  hasImage?: (id: string) => boolean;
}

export function formatArquitectosParaEtiqueta(obra: Building | null | undefined): string {
  let list: string[] = [];
  if (Array.isArray(obra?.arquitectos) && obra.arquitectos.length > 0) {
    list = obra.arquitectos.flatMap((a) => separarArquitectos(a));
  } else if (obra?.arquitecto) {
    list = separarArquitectos(obra.arquitecto);
  }
  
  list = [...new Set(
    list.map((name) => String(name || '').replace(/,/g, '').trim()).filter(Boolean)
  )];

  if (!list.length) return '';

  if (list.length <= 3) {
    return list.join('\n');
  }

  const mostrados = list.slice(0, 3);
  const restantes = list.length - 3;
  return `${mostrados.join('\n')}\n+ ${restantes} más`;
}

function coordenadasVisuales(obra: Building, isShared: boolean = false): [number, number] {
  if (!obra || !Array.isArray(obra.coordenadas) || !Number.isFinite(obra.coordenadas[0]) || !Number.isFinite(obra.coordenadas[1])) {
    return [0, 0];
  }
  const coords = obra.coordenadas as [number, number];
  if (!isShared) return coords;
  const [longitud, latitud] = coords;
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

let updateRafId: number | null = null;

export function actualizarFuenteMapa(): void {
  if (updateRafId) cancelAnimationFrame(updateRafId);

  updateRafId = requestAnimationFrame(() => {
    updateRafId = null;
    if (!state.map) return;
    const map = state.map as MapWithSources;

    try {
      let obrasVisibles = (state.OBRAS || []).filter((obra) => {
        if (!obra || !Array.isArray(obra.coordenadas) || !Number.isFinite(obra.coordenadas[0]) || !Number.isFinite(obra.coordenadas[1])) {
          return false;
        }
        if ((obra as InternalBuildingFields).private) return true;
        if (esRolAdmin(state.userRole) && state.adminMode) {
          return obra.estado_revision !== 'rechazada';
        }
        return obra.estado_revision !== 'pendiente' && obra.estado_revision !== 'rechazada';
      });

      // Aislamiento de datos en Modo Itinerario
      const activeItin = state.activeItinerary as { workIds?: Set<string>; isSearch?: boolean; isExplore?: boolean; isCurated?: boolean; id?: string } | null;
      if (activeItin?.workIds && activeItin.workIds.size > 0) {
        obrasVisibles = obrasVisibles.filter((obra) => activeItin.workIds?.has(String(obra.id)));
      }

      // Filtros combinables con lógica AND en memoria
      if (Array.isArray(state.activeFilterChips) && state.activeFilterChips.length > 0) {
        obrasVisibles = obrasVisibles.filter((obra) => obraCumpleFiltrosActivos(obra));
      }
      
      const ubicacionesCompartidas = new Map<string, number>();
      obrasVisibles.forEach((obra) => {
        if (Array.isArray(obra.coordenadas)) {
          const key = obra.coordenadas.join(',');
          ubicacionesCompartidas.set(key, (ubicacionesCompartidas.get(key) || 0) + 1);
        }
      });

      // Mapeo de obras pertenecientes a listas con visualización en mapa activada
      const coleccionesConIconoActivo = (state.userCollections || []).filter((col) => (col as unknown as { show_on_map?: boolean; icon?: string }).show_on_map !== false && (col as unknown as { icon?: string }).icon);
      const coleccionPorObra = new Map<string, typeof coleccionesConIconoActivo[0]>();
      
      if (coleccionesConIconoActivo.length > 0 && Array.isArray(state.userCollectionItems)) {
        state.userCollectionItems.forEach((item) => {
          const buildingId = String(item.building_id);
          if (!coleccionPorObra.has(buildingId)) {
            const col = coleccionesConIconoActivo.find((c) => String(c.id) === String(item.collection_id));
            if (col) {
              coleccionPorObra.set(buildingId, col);
            }
          }
        });
      }

      const isSearchActive = Boolean((activeItin && (activeItin.isSearch || String(activeItin.id || '').startsWith('search-'))) || (Array.isArray(state.activeFilterChips) && state.activeFilterChips.length > 0));
      const isExploreActive = Boolean(activeItin && (activeItin.isExplore || activeItin.isCurated || String(activeItin.id || '').startsWith('route-') || String(activeItin.id || '').startsWith('explore-')));

      const masterFeatures: BuildingGeoJSONFeature[] = [];
      const standardFeatures: BuildingGeoJSONFeature[] = [];

      obrasVisibles.forEach((obra) => {
        const itemObra = obra as InternalBuildingFields;
        const activeCollection = coleccionPorObra.get(String(obra.id)) as { id?: string; icon?: string } | undefined;
        const hasCustomEmoji = activeCollection && activeCollection.icon && activeCollection.id && map.hasImage && map.hasImage(`collection-emoji-${activeCollection.id}`);

        if (itemObra._alphaRank === undefined) {
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
          itemObra._alphaRank = (safeC1 * 676) + (safeC2 * 26) + safeC3;
        }
        const alphaRank = itemObra._alphaRank;

        const coordKey = Array.isArray(obra.coordenadas) ? obra.coordenadas.join(',') : '';
        const sharedCount = ubicacionesCompartidas.get(coordKey) || 1;

        if (itemObra._textoEtiqueta === undefined) {
          const nombreObra = String(obra.nombre_obra || '').trim();
          const arqNombre = formatArquitectosParaEtiqueta(obra);
          itemObra._nombreObraLimpio = nombreObra || 'Obra de arquitectura';
          itemObra._arqNombre = arqNombre;
          itemObra._textoEtiqueta = (nombreObra && arqNombre)
            ? `${nombreObra}\n${arqNombre}`
            : (nombreObra || arqNombre || '');
        }
        const nombreObra = itemObra._nombreObraLimpio || '';
        const arqNombre = itemObra._arqNombre || '';
        const textoEtiqueta = itemObra._textoEtiqueta || '';

        let coordsVisuales: [number, number];
        if (sharedCount > 1) {
          if (!itemObra._sharedCoords) itemObra._sharedCoords = coordenadasVisuales(obra, true);
          coordsVisuales = itemObra._sharedCoords;
        } else {
          coordsVisuales = (obra.coordenadas as [number, number]) || [0, 0];
        }

        const feature: BuildingGeoJSONFeature = {
          type: 'Feature',
          id: obra.featureId,
          geometry: { type: 'Point', coordinates: coordsVisuales },
          properties: {
            ...obra,
            nombre_obra: nombreObra,
            alpha_rank: alphaRank,
            texto_etiqueta: textoEtiqueta,
            arquitecto: arqNombre,
            año_construccion: obra.año_construccion || '',
            importancia: obra.importancia ?? 1,
            categoria: obra.categoria,
            estado_acceso: obra.estado_acceso || 'privado',
            foto_url: obra.foto_url || '',
            visitable: obra.visitable ? '1' : '0',
            decada: obra.decada || '',
            isShared: sharedCount > 1,
            estado_revision: itemObra.private ? 'privada' : (obra.estado_revision || 'publicada'),
            shared_location_count: sharedCount,
            favorite: (state.buildingStatuses?.get(String(obra.id)) as unknown as { favorite?: boolean })?.favorite ? 1 : 0,
            visited: (state.buildingStatuses?.get(String(obra.id)) as unknown as { visited?: boolean })?.visited ? 1 : 0,
            selected: itemObra.selected ? 1 : 0,
            is_search: isSearchActive ? 1 : 0,
            is_explore: isExploreActive ? 1 : 0,
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

      const publicSource = map.getSource('obras');
      const masterpieceSource = map.getSource('obras-maestras');

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
    } catch (err: unknown) {
      console.warn('Aviso en sincronización de datos de mapa:', err);
    }
  });
}

