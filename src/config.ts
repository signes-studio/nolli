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

/**
 * Diccionario de coordenadas [longitud, latitud] para ciudades principales.
 * Permite centrar el mapa inmediatamente (0ms) en la ciudad del usuario
 * sin esperar peticiones asíncronas de red ni retardos de geolocalización.
 */
export const KNOWN_CITIES: Record<string, [longitude: number, latitude: number]> = {
  // Comunitat Valenciana
  'valencia': [-0.3763, 39.4699],
  'alicante': [-0.4814, 38.3452],
  'alacant': [-0.4814, 38.3452],
  'elche': [-0.6983, 38.2669],
  'elx': [-0.6983, 38.2669],
  'castellon': [-0.0515, 39.9864],
  'castello': [-0.0515, 39.9864],
  'castello de la plana': [-0.0515, 39.9864],
  'gandia': [-0.1804, 38.9671],
  'denia': [0.1057, 38.8408],
  'alcoy': [-0.4746, 38.7054],
  'alcoi': [-0.4746, 38.7054],
  'benidorm': [-0.1306, 38.5411],
  'torrevieja': [-0.6834, 37.9787],
  'orihuela': [-0.9472, 38.0853],
  'sagunto': [-0.2842, 39.6797],
  'sagunt': [-0.2842, 39.6797],
  'villarreal': [-0.1006, 39.9377],
  'vila-real': [-0.1006, 39.9377],
  'altea': [-0.0489, 38.5991],
  'calpe': [0.0457, 38.6447],
  'calp': [0.0457, 38.6447],
  'javea': [0.1633, 38.7894],
  'xabia': [0.1633, 38.7894],

  // Principales ciudades y capitales de España
  'madrid': [-3.7038, 40.4168],
  'barcelona': [2.1734, 41.3851],
  'sevilla': [-5.9845, 37.3891],
  'malaga': [-4.4214, 36.7213],
  'bilbao': [-2.9350, 43.2630],
  'bilbo': [-2.9350, 43.2630],
  'zaragoza': [-0.8891, 41.6488],
  'palma': [2.6502, 39.5696],
  'palma de mallorca': [2.6502, 39.5696],
  'murcia': [-1.1307, 37.9922],
  'las palmas': [-15.4363, 28.1235],
  'las palmas de gran canaria': [-15.4363, 28.1235],
  'santa cruz de tenerife': [-16.2518, 28.4636],
  'tenerife': [-16.2518, 28.4636],
  'valladolid': [-4.7245, 41.6523],
  'cordoba': [-4.7794, 37.8882],
  'vigo': [-8.7207, 42.2406],
  'gijon': [-5.6611, 43.5322],
  'xixon': [-5.6611, 43.5322],
  'hospitalet': [2.1003, 41.3597],
  'hospitalet de llobregat': [2.1003, 41.3597],
  'vitoria': [-2.6727, 42.8469],
  'vitoria-gasteiz': [-2.6727, 42.8469],
  'gasteiz': [-2.6727, 42.8469],
  'coruña': [-8.4115, 43.3623],
  'a coruña': [-8.4115, 43.3623],
  'la coruña': [-8.4115, 43.3623],
  'granada': [-3.5986, 37.1773],
  'oviedo': [-5.8448, 43.3619],
  'uvieu': [-5.8448, 43.3619],
  'badalona': [2.2474, 41.4500],
  'cartagena': [-0.9862, 37.6051],
  'terrassa': [2.0121, 41.5632],
  'tarrasa': [2.0121, 41.5632],
  'jerez': [-6.1360, 36.6850],
  'jerez de la frontera': [-6.1360, 36.6850],
  'sabadell': [2.1074, 41.5433],
  'santander': [-3.8099, 43.4647],
  'pamplona': [-1.6458, 42.8125],
  'iruña': [-1.6458, 42.8125],
  'almeria': [-2.4637, 36.8340],
  'san sebastian': [-1.9812, 43.3183],
  'donostia': [-1.9812, 43.3183],
  'burgos': [-3.7027, 42.3440],
  'albacete': [-1.8585, 38.9943],
  'salamanca': [-5.6635, 40.9701],
  'huelva': [-6.9447, 37.2614],
  'logroño': [-2.4450, 42.4658],
  'badajoz': [-6.9706, 38.8794],
  'tarragona': [1.2445, 41.1189],
  'leon': [-5.5671, 42.5987],
  'lleida': [0.6267, 41.6176],
  'lerida': [0.6267, 41.6176],
  'cadiz': [-6.2886, 36.5271],
  'jaen': [-3.7903, 37.7796],
  'ourense': [-7.8639, 42.3358],
  'orense': [-7.8639, 42.3358],
  'lugo': [-7.5559, 43.0097],
  'girona': [2.8249, 41.9794],
  'gerona': [2.8249, 41.9794],
  'caceres': [-6.3723, 39.4753],
  'santiago de compostela': [-8.5448, 42.8782],
  'santiago': [-8.5448, 42.8782],
  'ceuta': [-5.3162, 35.8894],
  'melilla': [-2.9385, 35.2923],
  'toledo': [-4.0273, 39.8628],
  'pontevedra': [-8.6444, 42.4310],
  'palencia': [-4.5286, 42.0096],
  'ciudad real': [-3.9274, 38.9861],
  'zamora': [-5.7442, 41.5033],
  'avila': [-4.6977, 40.6567],
  'cuenca': [-2.1374, 40.0704],
  'huesca': [-0.4087, 42.1362],
  'segovia': [-4.1184, 40.9429],
  'soria': [-2.4641, 41.7666],
  'teruel': [-1.1068, 40.3456],
  'guadalajara': [-3.1667, 40.6333],
  'marbella': [-4.8860, 36.5101],
  'algeciras': [-5.4475, 36.1275],
  'reus': [1.1072, 41.1561],
  'dos hermanas': [-5.9228, 37.2831],
  'mataro': [2.4445, 41.5381],
  'mostoles': [-3.8649, 40.3232],
  'alcala de henares': [-3.3644, 40.4819],
  'fuenlabrada': [-3.7942, 40.2842],
  'leganes': [-3.7664, 40.3282],
  'getafe': [-3.7317, 40.3083],
  'alcorcon': [-3.8297, 40.3458],

  // Ciudades internacionales destacadas de arquitectura
  'porto': [-8.6291, 41.1579],
  'oporto': [-8.6291, 41.1579],
  'lisboa': [-9.1393, 38.7223],
  'lisbon': [-9.1393, 38.7223],
  'paris': [2.3522, 48.8566],
  'london': [-0.1278, 51.5074],
  'londres': [-0.1278, 51.5074],
  'rome': [12.4964, 41.9028],
  'roma': [12.4964, 41.9028],
  'berlin': [13.4050, 52.5200],
  'amsterdam': [4.9041, 52.3676],
  'milan': [9.1900, 45.4642],
  'milano': [9.1900, 45.4642],
  'rotterdam': [4.4777, 51.9244],
  'bruxelles': [4.3517, 50.8503],
  'bruselas': [4.3517, 50.8503],
  'vienna': [16.3738, 48.2082],
  'viena': [16.3738, 48.2082],
  'basel': [7.5886, 47.5596],
  'basilea': [7.5886, 47.5596],
  'zurich': [8.5417, 47.3769],
  'tokyo': [139.6917, 35.6895],
  'tokio': [139.6917, 35.6895],
  'new york': [-74.0060, 40.7128],
  'nueva york': [-74.0060, 40.7128],
};

/** Calcula la distancia ortodrómica en kilómetros entre dos coordenadas */
export function calcularDistanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Resuelve el centro geográfico aproximado [longitud, latitud] para un nombre de ciudad */
export function resolverCoordenadasCiudad(nombreCiudad: string | null | undefined): [longitude: number, latitude: number] | null {
  if (!nombreCiudad || typeof nombreCiudad !== 'string') return null;
  const normalizado = nombreCiudad.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '');

  if (!normalizado) return null;

  if (KNOWN_CITIES[normalizado]) {
    return KNOWN_CITIES[normalizado] as [number, number];
  }

  for (const [key, coords] of Object.entries(KNOWN_CITIES)) {
    const keyNorm = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s-]/g, '');
    if (normalizado === keyNorm || normalizado.includes(keyNorm) || keyNorm.includes(normalizado)) {
      return coords as [number, number];
    }
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const cached = localStorage.getItem(`nolli_city_coords_${normalizado}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length === 2 && Number.isFinite(parsed[0]) && Number.isFinite(parsed[1])) {
          return [parsed[0], parsed[1]];
        }
      }
    } catch {}
  }

  return null;
}

/** Obtiene el nombre canónico de la ciudad más cercana a unas coordenadas dadas si está en el radio maxDistKm */
export function obtenerCiudadCercana(lng: number, lat: number, maxDistKm = 35): string | null {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  let ciudadMasCercana: string | null = null;
  let menorDistancia = Infinity;

  for (const [nombre, coords] of Object.entries(KNOWN_CITIES)) {
    const dist = calcularDistanciaKm(lat, lng, coords[1], coords[0]);
    if (dist < menorDistancia) {
      menorDistancia = dist;
      ciudadMasCercana = nombre;
    }
  }

  if (menorDistancia <= maxDistKm && ciudadMasCercana) {
    return ciudadMasCercana.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return null;
}


