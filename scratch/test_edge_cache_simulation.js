import assert from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const obraHandler = require('../api/obra.js');
const buildingHandler = require('../api/building.js');
const { purgeBuildingCdnCache } = require('../api/_lib/cdnPurge.js');

console.log('================================================================');
console.log('SIMULACIÓN DE BORDE CDN (EDGE CACHE HIT / MISS & PURGE)');
console.log('Objetivo: Verificar que la segunda petición NO golpea Supabase (0 egress)');
console.log('================================================================\n');

// Mock Edge Cache Storage (simula el comportamiento de Vercel Edge Cache / Cloudflare)
class EdgeCdnSimulator {
  constructor() {
    this.cache = new Map();
  }

  async fetchThroughEdge(url, handler, req) {
    const key = url;
    if (this.cache.has(key)) {
      const cached = this.cache.get(key);
      if (Date.now() < cached.expiresAt) {
        return {
          status: cached.status,
          headers: { ...cached.headers, 'x-vercel-cache': 'HIT', 'cf-cache-status': 'HIT' },
          body: cached.body,
          fromCache: true,
        };
      }
      this.cache.delete(key);
    }

    const headers = {};
    let statusCode = 200;
    let responseBody = null;

    const mockRes = {
      setHeader(k, v) {
        headers[k.toLowerCase()] = v;
      },
      getHeader(k) {
        return headers[k.toLowerCase()];
      },
      status(code) {
        statusCode = code;
        return this;
      },
      send(body) {
        responseBody = body;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      },
    };

    await handler(req, mockRes);

    const cacheControl = headers['cache-control'] || '';
    const maxAgeMatch = cacheControl.match(/s-maxage=(\d+)/);
    const ttlSeconds = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;

    if (ttlSeconds > 0 && statusCode === 200) {
      const tags = (headers['vercel-cache-tag'] || headers['cache-tag'] || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      this.cache.set(key, {
        status: statusCode,
        headers,
        body: responseBody,
        tags,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
    }

    return {
      status: statusCode,
      headers: { ...headers, 'x-vercel-cache': 'MISS', 'cf-cache-status': 'MISS' },
      body: responseBody,
      fromCache: false,
    };
  }

  purgeTag(tag) {
    let purged = 0;
    for (const [key, value] of this.cache.entries()) {
      if (value.tags?.includes(tag)) {
        this.cache.delete(key);
        purged++;
      }
    }
    return purged;
  }
}

async function runEdgeSimulation() {
  const edge = new EdgeCdnSimulator();
  let supabaseCalls = 0;

  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (url.includes('/rest/v1/Buildings')) {
      supabaseCalls++;
      return {
        ok: true,
        json: async () => [{
          id: 'mad-01',
          nombre_obra: 'Edificio España',
          arquitecto: 'Otamendi Machimbarrena',
          año_construccion: 1953,
          categoria: 'racionalismo',
          place: 'Madrid, España',
          foto_url: 'https://photos.nollimap.app/visits/mad-01/foto.webp',
        }],
        headers: new Map([['content-range', '0-0/1']]),
      };
    }
    return originalFetch(url, options);
  };

  try {
    // -------------------------------------------------------------
    // PRUEBA 1: /api/obra?id=mad-01 (Ficha HTML Individual)
    // -------------------------------------------------------------
    console.log('--- PRUEBA 1: /api/obra?id=mad-01 ---');
    supabaseCalls = 0;

    // Petición 1: MISS (Golpea Supabase)
    const req1 = { query: { id: 'mad-01' }, headers: { 'x-forwarded-for': '10.0.0.1' } };
    const res1 = await edge.fetchThroughEdge('https://nollimap.app/api/obra?id=mad-01', obraHandler, req1);
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.fromCache, false, 'Petición 1 debe ser un MISS en edge');
    assert.strictEqual(supabaseCalls, 1, 'Petición 1 debe consultar Supabase');
    console.log(`[PASS] Petición 1: MISS en Edge (status ${res1.status}) -> Supabase llamadas: ${supabaseCalls}`);

    // Petición 2: HIT (Edge Cache responde de inmediato, 0 llamadas a Supabase)
    const req2 = { query: { id: 'mad-01' }, headers: { 'x-forwarded-for': '10.0.0.2' } };
    const res2 = await edge.fetchThroughEdge('https://nollimap.app/api/obra?id=mad-01', obraHandler, req2);
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.fromCache, true, 'Petición 2 debe ser un HIT directo en Edge Cache');
    assert.strictEqual(supabaseCalls, 1, 'Petición 2 NO DEBE consultar Supabase (0 egress)');
    assert.strictEqual(res2.headers['x-vercel-cache'], 'HIT');
    console.log(`[PASS] Petición 2: HIT en Edge (status ${res2.status}, x-vercel-cache: HIT) -> Supabase llamadas: ${supabaseCalls} (0 egress)`);

    // Petición 3: Invalidación de tag 'building-mad-01'
    const purgedCount = edge.purgeTag('building-mad-01');
    assert.ok(purgedCount >= 1, 'Tag building-mad-01 debe purgar la entrada de caché');
    console.log(`[PASS] Purga de Tag 'building-mad-01' ejecutada con éxito.`);

    // Petición 4: MISS tras purga
    const req3 = { query: { id: 'mad-01' }, headers: { 'x-forwarded-for': '10.0.0.3' } };
    const res3 = await edge.fetchThroughEdge('https://nollimap.app/api/obra?id=mad-01', obraHandler, req3);
    assert.strictEqual(res3.status, 200);
    assert.strictEqual(res3.fromCache, false, 'Petición post-purga debe ser MISS');
    assert.strictEqual(supabaseCalls, 2, 'Petición post-purga debe refrescar desde Supabase');
    console.log(`[PASS] Petición 3 tras purga: MISS en Edge -> Refresco exitoso desde Supabase (total llamadas: ${supabaseCalls})`);

    // -------------------------------------------------------------
    // PRUEBA 2: /api/building?id=mad-01 (API JSON para el cliente)
    // -------------------------------------------------------------
    console.log('\n--- PRUEBA 2: /api/building?id=mad-01 ---');
    supabaseCalls = 0;

    // Petición 1: MISS (Golpea Supabase)
    const bReq1 = { method: 'GET', query: { id: 'mad-01' }, headers: { 'x-forwarded-for': '20.0.0.1' } };
    const bRes1 = await edge.fetchThroughEdge('https://nollimap.app/api/building?id=mad-01', buildingHandler, bReq1);
    assert.strictEqual(bRes1.status, 200);
    assert.strictEqual(bRes1.fromCache, false);
    assert.strictEqual(supabaseCalls, 1);
    console.log(`[PASS] Petición 1: MISS en Edge -> Supabase llamadas: ${supabaseCalls}`);

    // Petición 2: HIT (Edge Cache)
    const bReq2 = { method: 'GET', query: { id: 'mad-01' }, headers: { 'x-forwarded-for': '20.0.0.2' } };
    const bRes2 = await edge.fetchThroughEdge('https://nollimap.app/api/building?id=mad-01', buildingHandler, bReq2);
    assert.strictEqual(bRes2.status, 200);
    assert.strictEqual(bRes2.fromCache, true);
    assert.strictEqual(supabaseCalls, 1, 'Petición repetida NO DEBE golpear Supabase');
    assert.strictEqual(bRes2.headers['x-vercel-cache'], 'HIT');
    console.log(`[PASS] Petición 2: HIT en Edge -> Supabase llamadas: ${supabaseCalls} (0 egress garantizado)`);

    console.log('\n🎉 SIMULACIÓN COMPLETADA CON ÉXITO: 0 EGRESS EN PETICIONES REPETIDAS EN EL EDGE 🎉\n');
  } finally {
    global.fetch = originalFetch;
  }
}

runEdgeSimulation().catch((err) => {
  console.error('Error en simulación Edge:', err);
  process.exit(1);
});

