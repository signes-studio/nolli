/**
 * TYPES: MAPBOX.TS
 * Tipos específicos de Mapbox GL JS, GeoJSON y Geocoding en Nolli.
 */

import type { BuildingCategory, BuildingAccessState, BuildingImportance } from './building.js';

export type MapStyleKey = 'abstract' | 'light' | 'dark' | 'hybrid' | 'satellite';

/**
 * Propiedades inyectadas en cada punto GeoJSON del mapa
 */
export interface BuildingFeatureProperties {
  id: string | number;
  nombre_obra: string;
  arquitecto: string;
  año_construccion: number | string;
  importancia: BuildingImportance | number;
  categoria: BuildingCategory | string;
  estado_acceso: BuildingAccessState | string;
  foto_url: string;
  visitable: string;
  decada: string;
  isShared?: boolean;
  alpha_rank?: number;
  texto_etiqueta?: string;
  arquitectos?: string[] | string | null;
  estado_revision?: string;
  shared_location_count?: number;
  favorite?: number;
  visited?: number;
  selected?: number;
  is_search?: number;
  is_explore?: number;
  collection_emoji?: string;
  collection_id?: string;
}

export type BuildingGeoJSONFeature = GeoJSON.Feature<GeoJSON.Point, BuildingFeatureProperties>;

export type BuildingFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, BuildingFeatureProperties>;

/**
 * Respuesta del endpoint de Mapbox Geocoding (/geocoding/v5/mapbox.places/{query}.json)
 */
export interface MapboxGeocodingFeature {
  id: string;
  type: 'Feature';
  place_type: Array<'country' | 'region' | 'postcode' | 'district' | 'place' | 'locality' | 'neighborhood' | 'address' | 'poi' | string>;
  relevance: number;
  properties: Record<string, unknown>;
  text: string;
  place_name: string;
  bbox?: [number, number, number, number];
  center: [longitude: number, latitude: number];
  geometry: {
    type: 'Point';
    coordinates: [longitude: number, latitude: number];
  };
  context?: Array<{
    id: string;
    text: string;
    wikidata?: string;
    short_code?: string;
  }>;
}

export interface MapboxGeocodingResponse {
  type: 'FeatureCollection';
  query: string[];
  features: MapboxGeocodingFeature[];
  attribution?: string;
}
