/**
 * TYPES: STATE.TS
 * Tipado del estado reactivo global de la aplicación Nolli.
 */

import type { Building, BuildingCategory, BuildingAccessState } from './building.js';
import type { PublicProfileRow, UserCollectionRow, UserCollectionItemRow, UserBuildingStatusRow } from './supabase.js';
import type { MapStyleKey } from './mapbox.js';

export interface AppState {
  OBRAS: Building[];
  BUILDING_CATALOG: Building[];
  ARQUITECTOS: string[];
  sessionToken: string | null;
  userRole: 'admin' | 'editor' | 'user' | string | null;
  adminMode: boolean;
  userId: string | null;
  userEmail: string | null;
  userProfile: PublicProfileRow | null;
  buildingStatuses: Map<string, UserBuildingStatusRow>;
  pendingLngLat: [number, number] | null;
  editingBuildingId: string | number | null;
  selectedFeatureId: string | number | null;
  activeItinerary: Record<string, unknown> | null;
  activeFilterChips: string[];
  locationMarker: unknown | null;
  userLocation: [number, number] | null;
  activeDecada: string;
  activeVisitable: string;
  activeCategorias: Set<BuildingCategory>;
  activeAccesos: Set<BuildingAccessState>;
  activeArquitectos: Set<string>;
  map: unknown | null;
  mapStyle: MapStyleKey | string;
  addingBuilding: boolean;
  privateBuildings: Building[];
  userCollections: UserCollectionRow[];
  userCollectionItems: UserCollectionItemRow[];
  userFollowedCollections: Array<Record<string, unknown>>;
  userPrivateLabels: Array<Record<string, unknown>>;
  isManualLocation?: boolean;
  manualLocationName?: string;
}

