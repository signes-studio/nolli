/**
 * TYPES: SUPABASE.TS
 * Esquemas de tablas, consultas REST y autenticación de Supabase en Nolli.
 */

import type { RawBuildingRow } from './building.js';

export interface SupabaseUserMetadata {
  name?: string;
  full_name?: string;
  avatar_url?: string;
  picture?: string;
  first_name?: string;
  last_name?: string;
  [key: string]: unknown;
}

export interface SupabaseUser {
  id: string;
  email?: string;
  app_metadata: Record<string, unknown>;
  user_metadata: SupabaseUserMetadata;
  aud?: string;
  created_at?: string;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: SupabaseUser;
}

export interface PublicProfileRow {
  id: string;
  nick: string | null;
  nombre: string | null;
  apellidos: string | null;
  ciudad: string | null;
  pais: string | null;
  avatar_url: string | null;
  role: 'admin' | 'editor' | 'user' | string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UserCollectionRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'private' | 'shared';
  created_at: string;
  updated_at?: string;
}

export interface UserCollectionItemRow {
  id: string;
  collection_id: string;
  building_id: string | number;
  notes: string | null;
  created_at: string;
}

export type BuildingVisitStatus = 'visited' | 'favorite' | 'wishlist' | 'none';

export interface UserBuildingStatusRow {
  id?: string;
  user_id: string;
  building_id: string | number;
  status: BuildingVisitStatus;
  visited_at: string | null;
  rating: number | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BuildingReportRow {
  id: string;
  building_id: string | number;
  user_id: string | null;
  report_type: string;
  details: string | null;
  status: 'pending' | 'resolved' | 'dismissed' | string;
  created_at: string;
}

export interface BuildingVisitRow {
  id: string;
  building_id: string | number;
  user_id: string;
  visit_date: string | null;
  notes: string | null;
  rating: number | null;
  created_at: string;
}

export interface VisitPhotoRow {
  id: string;
  building_id: string | number;
  user_id: string;
  photo_url: string;
  caption: string | null;
  created_at: string;
}

export interface UserFriendshipRow {
  id: string;
  user_id_1: string;
  user_id_2: string;
  status: 'pending' | 'accepted' | 'rejected' | string;
  created_at: string;
}

export interface UserFollowRow {
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface ItineraryRow {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  buildings: Array<string | number>;
  created_at: string;
}

export interface SupabaseErrorResponse {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

