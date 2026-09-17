/**
 * TYPES: BUILDING.TS
 * Modelo de datos central de Obras / Edificios arquitectónicos en Nolli.
 */

export type BuildingCategory =
  | 'residencial'
  | 'dotacional_equipamiento'
  | 'industrial_logistico'
  | 'religioso_funerario'
  | 'comercial_terciario'
  | 'espacio_publico_paisaje'
  | 'infraestructura_urbanismo'
  | 'otro';

export type BuildingAccessState =
  | 'publico'
  | 'exterior_visible'
  | 'con_reserva'
  | 'privado'
  | 'cerrado_temporalmente'
  | 'no_construido'
  | 'desaparecido';

export type BuildingReviewStatus =
  | 'aprobada'
  | 'pendiente'
  | 'rechazada';

export type BuildingImportance = 0 | 1 | 2 | 3;

/** Coordenadas geográficas estándar [longitud, latitud] compatibles con Mapbox GL / GeoJSON */
export type LngLatCoordinates = [longitude: number, latitude: number];

/**
 * Intervención arquitectónica en edificio histórico (año y arquitecto interviniente)
 */
export interface BuildingIntervention {
  arquitecto: string;
  año: string;
  texto?: string;
}

/**
 * Entidad de obra enriquecida para el cliente web (utilizada en state.OBRAS y UI)
 */
export interface Building {
  id: string | number;
  nombre_obra: string;
  foto_url: string | null;
  foto_credito?: string | null;
  foto_licencia?: string | null;
  foto_fuente_url?: string | null;
  enlace_url?: string | null;
  arquitecto: string | null;
  arquitectos?: string[] | string | null;
  intervenciones?: BuildingIntervention[];
  año_construccion: number | string | null;
  importancia: BuildingImportance | number | null;
  categoria: BuildingCategory | string;
  estado_acceso: BuildingAccessState | string;
  visitable?: boolean | string | null;
  añadido_por?: string | null;
  estado_revision?: BuildingReviewStatus | string | null;
  longitud: number;
  latitud: number;
  place?: string | null;

  // Propiedades calculadas en cliente
  coordenadas?: LngLatCoordinates;
  decada?: string;
  distancia_metros?: number;
  featureId?: string | number;
  building_id?: string | number;
  obra_id?: string | number;
  notes?: string | null;
}

/**
 * Fila cruda directa desde la tabla `Buildings` en la API REST de Supabase
 */
export interface RawBuildingRow {
  id: string | number;
  nombre_obra: string;
  foto_url: string | null;
  foto_credito?: string | null;
  foto_licencia?: string | null;
  foto_fuente_url?: string | null;
  enlace_url: string | null;
  arquitecto: string | null;
  arquitectos?: string[] | string | null;
  intervenciones?: BuildingIntervention[];
  año_construccion: number | string | null;
  importancia: number | null;
  categoria: string;
  estado_acceso: string;
  visitable: boolean | string | null;
  añadido_por: string | null;
  estado_revision: string | null;
  longitud: number;
  latitud: number;
  place: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Filtros activos aplicables sobre la colección de obras
 */
export interface ActiveBuildingFilters {
  categorias: Set<BuildingCategory>;
  accesos: Set<BuildingAccessState>;
  arquitectos: Set<string>;
  decada: string;
  visitable: string;
  query: string;
}

