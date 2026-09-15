/**
 * API.D.TS — Declaraciones de tipos para la capa api.js durante la migración incremental
 */

import type { VisitPhotoRow } from './types/index.js';

export function createVisitPhoto(
  photoData: Record<string, unknown>,
  sessionToken: string
): Promise<VisitPhotoRow>;

export function getBuildingsCatalog(): Promise<unknown[]>;
export function fetchBuildings(options?: Record<string, unknown>): Promise<unknown[]>;
export function searchPlaces(query: string, language?: string): Promise<unknown>;

