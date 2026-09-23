/* =========================================================================
   API/_LIB/EMBEDDINGS.JS — Generación de Embeddings Semánticos para Nolli
   ========================================================================= */

const { categoryLabel } = require('./categories.js');
const { cleanArchitectName } = require('./slugs.js');
const { getSupabaseConfig } = require('./supabaseEnv.js');

/**
 * Rutas curatoriales oficiales de Nolli para enriquecer el contexto semántico
 * de las obras de arquitectura (equivalente a src/itinerariesConfig.ts).
 */
const CURATED_ROUTES = [
  {
    id: 'route-docomomo',
    title: 'DOCOMOMO Ibérico',
    addedByFilter: 'DOCOMOMO',
  },
  {
    id: 'route-gatepac',
    title: 'GATEPAC · Racionalismo Español',
    yearRange: [1927, 1937],
    architectsFilter: ['Sert', 'Torres Clavé', 'Subirana', 'Illescas', 'García Mercadal', 'Sánchez Arcas', 'Lacasa', 'Fernández-Shaw', 'Bergamín'],
  },
  {
    id: 'route-racionalismo-valenciano',
    title: 'Racionalismo Valenciano',
    yearRange: [1925, 1936],
    bboxFilter: { latMin: 37.85, latMax: 40.75, lonMin: -1.55, lonMax: 0.75 },
  },
  {
    id: 'route-modernisme-catala',
    title: 'Modernisme Català',
    yearRange: [1888, 1911],
    bboxFilter: { latMin: 40.5, latMax: 42.9, lonMin: 0.15, lonMax: 3.35 },
  },
  {
    id: 'route-escuela-madrid',
    title: 'Escuela de Madrid',
    yearRange: [1949, 1975],
    architectsFilter: ['Sáenz de Oiza', 'Corrales', 'Molezún', 'Fisac', 'Sota', 'Aburto', 'Higueras', 'Cano Lasso'],
  },
  {
    id: 'route-grup-r',
    title: 'Grup R · Escola de Barcelona',
    yearRange: [1949, 1970],
    architectsFilter: ['Coderch', 'Moragas', 'Sostres', 'Bohigas', 'Martorell', 'Mitjans', 'Ribas Piera', 'Pratmarsó'],
  },
  {
    id: 'route-regionalismo-vasco',
    title: 'Regionalismo Vasco',
    yearRange: [1890, 1936],
    bboxFilter: { latMin: 42.85, latMax: 43.45, lonMin: -3.5, lonMax: -1.7 },
  },
  {
    id: 'route-arquitectura-canaria',
    title: 'Arquitectura Canaria',
    yearRange: [1900, 1950],
    bboxFilter: { latMin: 27.6, latMax: 29.5, lonMin: -18.2, lonMax: -13.4 },
  },
  {
    id: 'route-contemporanea-espana',
    title: 'Arquitectura Contemporánea Española',
    yearRange: [1985, 2025],
    architectsFilter: ['Moneo', 'Nieto', 'Sobejano', 'Mansilla', 'Tuñón', 'RCR', 'Souto de Moura', 'Siza', 'Campo Baeza', 'Ábalos', 'Herreros'],
  },
  {
    id: 'route-escola-porto',
    title: 'Escola do Porto',
    yearRange: [1955, 2015],
    architectsFilter: ['Siza', 'Souto de Moura', 'Távora', 'Soutinho'],
  },
  {
    id: 'route-estado-novo-portugal',
    title: 'Arquitectura do Estado Novo',
    yearRange: [1930, 1955],
    architectsFilter: ['Cottinelli Telmo', 'Cristino da Silva', 'Pardal Monteiro', 'Keil do Amaral'],
  },
  {
    id: 'route-mouvement-moderne-francais',
    title: 'Mouvement Moderne Français',
    architectsFilter: ['Le Corbusier', 'Perret', 'Mallet-Stevens', 'Lurçat', 'Chareau'],
  },
  {
    id: 'route-french-touch',
    title: 'French Touch Contemporánea',
    yearRange: [1995, 2025],
    architectsFilter: ['Lacaton & Vassal', 'Perrault', 'Nouvel', 'Ricciotti', 'Bruther', 'LAN'],
  },
];

/**
 * Comprueba si un edificio coincide con los filtros curatoriales de un itinerario.
 */
function buildingMatchesRoute(building, route) {
  if (!building || !route) return false;

  const bId = String(building.id || '').trim();

  // 1. Identificadores manuales
  const manualIds = route.work_ids || route.workIds;
  if (Array.isArray(manualIds) && manualIds.length > 0) {
    if (manualIds.map(String).includes(bId)) return true;
  }
  if (typeof route.stops === 'string' && route.stops.includes(bId)) {
    return true;
  }

  // 2. Filtro por origen o entidad (ej. DOCOMOMO)
  if (route.addedByFilter) {
    const addedBy = String(building.añadido_por || building.anadido_por || '').toUpperCase();
    if (addedBy.includes(route.addedByFilter.toUpperCase())) return true;
  }

  // 3. Filtro por arquitecto o lista de arquitectos
  const arqText = String(building.arquitecto || '').toLowerCase();
  if (route.architectFilter && arqText.includes(route.architectFilter.toLowerCase())) {
    return true;
  }
  if (Array.isArray(route.architectsFilter) && route.architectsFilter.length > 0) {
    if (route.architectsFilter.some((name) => arqText.includes(name.toLowerCase()))) {
      return true;
    }
  }

  // 4. Filtro por año o rango temporal (con bbox opcional)
  const year = parseInt(building.año_construccion, 10);
  if (!Number.isNaN(year) && year > 0) {
    if (route.decadeFilter) {
      const dec = Number(route.decadeFilter);
      if (year >= dec && year < dec + 10) return true;
    }
    if (Array.isArray(route.yearRange) && route.yearRange.length === 2) {
      const [minY, maxY] = route.yearRange;
      if (year >= minY && year <= maxY) {
        if (route.bboxFilter) {
          const lat = Number(building.latitud);
          const lon = Number(building.longitud);
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            const { latMin, latMax, lonMin, lonMax } = route.bboxFilter;
            return lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax;
          }
          return false;
        }
        return true;
      }
    }
  }

  // 5. Filtro por categoría tipológica
  if (route.categoryFilter) {
    if (String(building.categoria || '').toLowerCase() === route.categoryFilter.toLowerCase()) {
      return true;
    }
  }

  // 6. Filtro por palabras clave
  if (Array.isArray(route.keywords) && route.keywords.length > 0) {
    const fullText = `${building.nombre_obra || ''} ${building.arquitecto || ''} ${building.place || ''}`.toLowerCase();
    if (route.keywords.some((kw) => fullText.includes(kw.toLowerCase()))) {
      return true;
    }
  }

  return false;
}

/**
 * Obtiene la configuración del proveedor de embeddings desde las variables de entorno.
 * Aplica la política estricta de seguridad: NUNCA valores hardcodeados como respaldo.
 */
function getEmbeddingConfig() {
  const configuredProvider = (process.env.EMBEDDING_PROVIDER || '').toLowerCase().trim();

  // Si no se definió explícitamente EMBEDDING_PROVIDER, usar voyage si tiene clave, o openai si tiene clave, o voyage por defecto
  const provider = configuredProvider || (process.env.VOYAGE_API_KEY ? 'voyage' : (process.env.OPENAI_API_KEY ? 'openai' : 'voyage'));

  if (provider === 'voyage') {
    const apiKey = (process.env.VOYAGE_API_KEY || '').trim();
    if (!apiKey) {
      throw new Error('Configuración de embeddings incompleta: falta la variable de entorno VOYAGE_API_KEY en Vercel.');
    }
    return {
      provider: 'voyage',
      model: 'voyage-3-lite',
      dimension: 512,
      apiKey,
      endpoint: 'https://api.voyageai.com/v1/embeddings',
    };
  }

  if (provider === 'openai') {
    const apiKey = (process.env.OPENAI_API_KEY || '').trim();
    if (!apiKey) {
      throw new Error('Configuración de embeddings incompleta: falta la variable de entorno OPENAI_API_KEY en Vercel.');
    }
    return {
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimension: 1536,
      apiKey,
      endpoint: 'https://api.openai.com/v1/embeddings',
    };
  }

  throw new Error(`Proveedor de embeddings no soportado: "${provider}". Usa "voyage" o "openai".`);
}

/**
 * Sintetiza el texto semántico que representa la obra para el modelo de embeddings.
 * Combina nombre, arquitecto, tipología formateada, época, ubicación y rutas curatoriales.
 */
function buildBuildingEmbeddingText(building, customRoutes = null) {
  if (!building) return '';

  const parts = [];

  // 1. Nombre de la obra
  const nombre = String(building.nombre_obra || '').trim();
  if (nombre) {
    parts.push(`Obra: ${nombre}`);
  }

  // 2. Autoría arquitectónica
  const arch = cleanArchitectName(building.arquitecto);
  if (arch) {
    parts.push(`Arquitectura: ${arch}`);
  }

  // 3. Tipología formateada (español por defecto para consistencia semántica)
  if (building.categoria) {
    const catLabel = categoryLabel(building.categoria, 'es');
    if (catLabel) {
      parts.push(`Tipología: ${catLabel}`);
    }
  }

  // 4. Año de construcción
  const anio = String(building.año_construccion || '').trim();
  if (anio) {
    parts.push(`Año: ${anio}`);
  }

  // 5. Ubicación geográfica
  const place = String(building.place || '').trim();
  if (place) {
    parts.push(`Ubicación: ${place}`);
  }

  // 6. Colecciones y rutas curatoriales
  const routesToCheck = customRoutes || CURATED_ROUTES;
  const matchedRoutes = routesToCheck
    .filter((route) => buildingMatchesRoute(building, route))
    .map((route) => route.title);

  if (matchedRoutes.length > 0) {
    parts.push(`Colecciones curatoriales: ${matchedRoutes.join('; ')}`);
  }

  return parts.join(' | ');
}

/**
 * Llama a la API del proveedor de embeddings configurado con una lista de textos.
 */
async function callEmbeddingApi(texts, config) {
  if (!Array.isArray(texts) || texts.length === 0) return [];

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  };

  const payload = {
    model: config.model,
    input: texts,
  };

  const res = await fetch(config.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`Error en API de embeddings (${config.provider} - ${res.status}): ${errorBody}`);
  }

  const json = await res.json();
  if (!json?.data || !Array.isArray(json.data)) {
    throw new Error(`Respuesta inválida de la API de embeddings (${config.provider})`);
  }

  // Ordenar por índice para garantizar alineación exacta con texts
  const sorted = [...json.data].sort((a, b) => (a.index || 0) - (b.index || 0));
  return sorted.map((item) => item.embedding);
}

/**
 * Genera el embedding de una única obra arquitectónica.
 * 
 * @param {Object} building Datos de la obra
 * @param {Object} [options] Opciones
 * @param {boolean} [options.throwOnError=false] Si es true, lanza el error en lugar de registrarlo
 * @returns {Promise<{embedding: number[], modelVersion: string, sourceText: string}|null>}
 */
async function generateBuildingEmbedding(building, options = {}) {
  const { throwOnError = false } = options;

  try {
    const config = getEmbeddingConfig();
    const sourceText = buildBuildingEmbeddingText(building);
    if (!sourceText) {
      throw new Error(`La obra ${building?.id || 'sin ID'} no tiene datos textuales para generar embedding.`);
    }

    const [embedding] = await callEmbeddingApi([sourceText], config);
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error(`No se recibió vector para la obra ${building?.id}`);
    }

    return {
      embedding,
      modelVersion: config.model,
      sourceText,
    };
  } catch (error) {
    console.error(`[Embeddings] Fallo al generar embedding para obra ${building?.id}:`, error.message);
    if (throwOnError) {
      throw error;
    }
    return null;
  }
}

/**
 * Genera embeddings en lote para múltiples obras, optimizando llamadas a la API.
 * 
 * @param {Array<Object>} buildings Lista de obras
 * @param {Object} [options] Opciones de configuración
 * @returns {Promise<Array<{buildingId: string, embedding: number[], modelVersion: string, sourceText: string}>>}
 */
async function generateBatchEmbeddings(buildings, options = {}) {
  if (!Array.isArray(buildings) || buildings.length === 0) return [];

  const config = getEmbeddingConfig();
  const prepared = [];

  for (const b of buildings) {
    if (!b || !b.id) continue;
    const text = buildBuildingEmbeddingText(b);
    if (text) {
      prepared.push({ buildingId: String(b.id), text });
    }
  }

  if (prepared.length === 0) return [];

  const texts = prepared.map((p) => p.text);
  const embeddings = await callEmbeddingApi(texts, config);

  return prepared.map((p, idx) => ({
    buildingId: p.buildingId,
    embedding: embeddings[idx],
    modelVersion: config.model,
    sourceText: p.text,
  }));
}

/**
 * Genera y persiste el embedding de una obra en building_embeddings (Supabase).
 * Un fallo en esta función NUNCA bloquea el flujo principal de creación/edición de obras.
 */
async function upsertBuildingEmbedding(building, options = {}) {
  try {
    const result = await generateBuildingEmbedding(building, { throwOnError: false });
    if (!result) return false;

    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    if (!supabaseUrl || !serviceRoleKey) {
      console.warn('[Embeddings] No se pudo guardar embedding: faltan credenciales de Supabase.');
      return false;
    }

    const payload = {
      building_id: String(building.id),
      embedding: result.embedding,
      model_version: result.modelVersion,
      source_text: result.sourceText,
      updated_at: new Date().toISOString(),
    };

    const res = await fetch(`${supabaseUrl}/rest/v1/building_embeddings`, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[Embeddings] Error al persistir embedding en Supabase (${res.status}):`, errText);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[Embeddings] Excepción al persistir embedding de la obra ${building?.id}:`, err);
    return false;
  }
}

module.exports = {
  getEmbeddingConfig,
  buildBuildingEmbeddingText,
  generateBuildingEmbedding,
  generateBatchEmbeddings,
  upsertBuildingEmbedding,
  CURATED_ROUTES,
  buildingMatchesRoute,
};
