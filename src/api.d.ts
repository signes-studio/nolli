/**
 * API.D.TS — Declaraciones de tipos para la capa api.js durante la migración incremental
 */

import type { VisitPhotoRow } from './types/index.js';

export function createVisitPhoto(
  photoData: Record<string, unknown>,
  sessionToken: string
): Promise<VisitPhotoRow>;

export function fetchBuildingVisitPhotos(
  buildingId: string | number,
  sessionToken?: string | null
): Promise<VisitPhotoRow[]>;

export function deleteVisitPhoto(
  photoId: string | number,
  sessionToken: string
): Promise<{ success: boolean; message?: string }>;

export function updateVisitPhoto(
  photoId: string | number,
  updates: Record<string, unknown>,
  sessionToken: string
): Promise<{ success: boolean; photo: VisitPhotoRow }>;

export function uploadGenericPhotoWithR2(
  file: File,
  buildingId?: string | number | null,
  sessionToken?: string | null,
  onProgress?: ((percent: number, loaded: number, total: number) => void) | null
): Promise<{ publicUrl: string; url: string; key: string; fallbackReason?: string }>;

export function uploadAvatarFileWithR2(
  file: File,
  sessionToken: string | null | undefined,
  onProgress?: ((percent: number, loaded: number, total: number) => void) | null
): Promise<string>;

export function fetchCurrentUser(sessionToken: string): Promise<{ id: string; email?: string } | null>;
export function fetchCurrentProfile(sessionToken: string): Promise<any>;
export function fetchBuildingStatuses(
  buildingIds?: (string | number)[],
  sessionToken?: string | null
): Promise<any[]>;
export function saveBuildingStatus(
  userId: string,
  buildingId: string | number,
  status: Record<string, unknown>,
  sessionToken: string
): Promise<unknown>;
export function fetchUserCollections(sessionToken: string): Promise<any[]>;
export function fetchUserCollectionItems(sessionToken: string): Promise<any[]>;
export function createUserCollection(collectionData: Record<string, unknown>, sessionToken: string): Promise<any>;
export function addUserCollectionItem(itemData: Record<string, unknown>, sessionToken: string): Promise<any>;
export function deleteUserCollectionItem(collectionId: string | number, userId: string, buildingId: string | number, sessionToken: string): Promise<any>;
export function getBuildingsCatalog(forceRefresh?: boolean): Promise<unknown[]>;
export function fetchBuildings(options?: Record<string, unknown>): Promise<unknown[]>;
export function searchPlaces(query: string, language?: string): Promise<unknown>;


