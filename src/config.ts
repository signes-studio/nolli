/* =========================================================================
   CONFIG.TS — Constantes de configuración fuertemente tipadas
   NOTA: MAPBOX_TOKEN y SUPABASE_KEY son claves públicas (pk./sb_publishable_),
   diseñadas para exponerse en el cliente. La seguridad real de escritura
   depende de las Row Level Security policies en Supabase.
   ========================================================================= */

import type { MapStyleKey } from './types/index.js';

export const SITE_URL: string = 'https://nollimap.app';
export const SITE_DOMAIN: string = 'nollimap.app';

export const MAPBOX_TOKEN: string = 'pk.eyJ1Ijoic2lnbmVzYXJjaCIsImEiOiJjbXQ3YjdzNXQyNjB2MnhxdW5vdjF6YjV3In0.tFJ9jN3e1z3ezNM9x0ofpg';

export const SUPABASE_URL: string = 'https://ldtfvpjigzvcagtciipn.supabase.co';
export const SUPABASE_KEY: string = 'sb_publishable_kYQ7Fa8nBsrkp1f8C4AuAg_4-5uBFm0';

export const MAP_STYLE: string = 'mapbox://styles/signesarch/cmtcs22rq001p01sgato8bqvj';

export const MAP_STYLES: Record<MapStyleKey, string> = {
  abstract: 'mapbox://styles/signesarch/cmtcs22rq001p01sgato8bqvj',
  light: 'mapbox://styles/signesarch/cmtcs22rq001p01sgato8bqvj',
  dark: 'mapbox://styles/mapbox/dark-v11',
  hybrid: 'mapbox://styles/mapbox/standard',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
};

export const DEFAULT_CENTER: [longitude: number, latitude: number] = [-0.3690, 39.4690];
export const DEFAULT_ZOOM: number = 12.4;

export const GEOCODING_LANGUAGE: string = 'es';

