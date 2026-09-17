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
export function getBuildingsCatalog(): Promise<unknown[]>;
export function fetchBuildings(options?: Record<string, unknown>): Promise<unknown[]>;
export function searchPlaces(query: string, language?: string): Promise<unknown>;


