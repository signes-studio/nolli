#!/usr/bin/env node

/**
 * SCRIPTS/BACKFILL-EMBEDDINGS.JS — Generación masiva de embeddings semánticos para Nolli
 * 
 * Uso:
 *   node scripts/backfill-embeddings.js [--batch-size 50] [--delay 250] [--limit 100]
 * 
 * Características:
 * 1. Resumable: comprueba los registros existentes en building_embeddings y procesa
 *    únicamente las obras pendientes para la versión actual del modelo.
 * 2. Rate-limiting respetuoso: procesamiento en lotes configurables con pausa entre llamadas.
 * 3. Aislamiento de fallos: si un lote falla, aísla la obra conflictiva sin detener el proceso.
 * 4. Métricas en tiempo real y reporte final detallado.
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { getEmbeddingConfig, buildBuildingEmbeddingText, callEmbeddingApi } = require('../api/_lib/embeddings.js');
const { getSupabaseConfig } = require('../api/_lib/supabaseEnv.js');

// Parsear argumentos de línea de comandos
const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return defaultValue;
}

const BATCH_SIZE = parseInt(getArg('--batch-size', '50'), 10) || 50;
const DELAY_MS = parseInt(getArg('--delay', '250'), 10) || 250;
const LIMIT = args.includes('--limit') ? parseInt(getArg('--limit', '0'), 10) : 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBackfill() {
  console.log('=================================================================');
  console.log('🚀 [Backfill Embeddings] Iniciando proceso para el catálogo Nolli');
  console.log('=================================================================');

  const startTime = Date.now();

  // 1. Obtener y validar configuración de embeddings y Supabase
  let config;
  try {
    config = getEmbeddingConfig();
  } catch (err) {
    console.error('❌ Error de configuración:', err.message);
    process.exit(1);
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Error: Falta SUPABASE_SERVICE_ROLE_KEY o SUPABASE_URL.');
    process.exit(1);
  }

  console.log(`📡 Proveedor activo: ${config.provider.toUpperCase()} (${config.model})`);
  console.log(`📐 Dimensión de vector: ${config.dimension}`);
  console.log(`📦 Tamaño de lote: ${BATCH_SIZE} obras por llamada API`);
  console.log(`⏱️ Pausa entre lotes: ${DELAY_MS}ms`);

  const supabaseHeaders = {
    'apikey': serviceRoleKey,
    'Authorization': `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };

  // 2. Obtener IDs ya procesados para este modelo (Reanudabilidad)
  console.log('\n🔍 [1/4] Verificando embeddings ya existentes en la base de datos...');
  const existingIds = new Set();
  let offset = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    const params = new URLSearchParams({
      select: 'building_id',
      model_version: `eq.${config.model}`,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });

    const res = await fetch(`${supabaseUrl}/rest/v1/building_embeddings?${params.toString()}`, {
      headers: supabaseHeaders,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Error al consultar building_embeddings (${res.status}): ${errText}`);
    }

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;

    rows.forEach((r) => {
      if (r.building_id) existingIds.add(String(r.building_id));
    });

    offset += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  console.log(`✅ Embeddings ya existentes para ${config.model}: ${existingIds.size} obras.`);

  // 3. Descargar obras públicas del catálogo
  console.log('\n📥 [2/4] Consultando obras de Buildings...');
  const fields = 'id,nombre_obra,arquitecto,categoria,año_construccion,place,añadido_por,latitud,longitud';
  const allBuildings = [];
  offset = 0;

  while (true) {
    const params = new URLSearchParams({
      select: fields,
      or: '(estado_revision.eq.publicada,estado_revision.is.null)',
      order: 'id.asc',
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });

    const res = await fetch(`${supabaseUrl}/rest/v1/Buildings?${params.toString()}`, {
      headers: supabaseHeaders,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Error al consultar Buildings (${res.status}): ${errText}`);
    }

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;

    allBuildings.push(...rows);
    offset += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  console.log(`✅ Total de obras en catálogo: ${allBuildings.length}`);

  // Filtrar pendientes
  let pendingBuildings = allBuildings.filter((b) => !existingIds.has(String(b.id)));
  if (LIMIT > 0) {
    console.log(`⚠️ Limitando ejecución a ${LIMIT} obras (--limit especificado).`);
    pendingBuildings = pendingBuildings.slice(0, LIMIT);
  }

  console.log(`🎯 Obras pendientes de generar embedding: ${pendingBuildings.length}`);

  if (pendingBuildings.length === 0) {
    console.log('\n✨ Todas las obras ya cuentan con embedding actualizado. Proceso completado.');
    return;
  }

  // 4. Procesar en lotes con generación y guardado
  console.log('\n⚡ [3/4] Generando e insertando embeddings en building_embeddings...');

  let totalProcessed = 0;
  let totalSuccessful = 0;
  let totalFailed = 0;
  const failedItems = [];

  const totalBatches = Math.ceil(pendingBuildings.length / BATCH_SIZE);

  for (let bIdx = 0; bIdx < totalBatches; bIdx++) {
    const batchStart = bIdx * BATCH_SIZE;
    const batch = pendingBuildings.slice(batchStart, batchStart + BATCH_SIZE);

    // Preparar textos de entrada
    const batchPrepared = [];
    for (const building of batch) {
      const text = buildBuildingEmbeddingText(building);
      if (text) {
        batchPrepared.push({ building, text });
      } else {
        totalFailed++;
        failedItems.push({ id: building.id, reason: 'Sin texto sintetizable' });
      }
    }

    if (batchPrepared.length === 0) continue;

    try {
      const texts = batchPrepared.map((p) => p.text);
      const embeddings = await callEmbeddingApi(texts, config);

      // Preparar payload para Supabase (upsert en lote)
      const nowIso = new Date().toISOString();
      const recordsToUpsert = batchPrepared.map((p, idx) => ({
        building_id: String(p.building.id),
        embedding: embeddings[idx],
        model_version: config.model,
        source_text: p.text,
        updated_at: nowIso,
      }));

      const upsertRes = await fetch(`${supabaseUrl}/rest/v1/building_embeddings`, {
        method: 'POST',
        headers: {
          ...supabaseHeaders,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify(recordsToUpsert),
      });

      if (!upsertRes.ok) {
        const errText = await upsertRes.text().catch(() => '');
        throw new Error(`Fallo en upsert a Supabase (${upsertRes.status}): ${errText}`);
      }

      totalSuccessful += recordsToUpsert.length;
    } catch (batchErr) {
      console.warn(`⚠️ Lote ${bIdx + 1} falló en bloque: ${batchErr.message}. Procesando obras individualmente...`);

      // Fallback a nivel de obra individual para aislar el fallo
      for (const item of batchPrepared) {
        try {
          const [singleEmb] = await callEmbeddingApi([item.text], config);
          const singleRes = await fetch(`${supabaseUrl}/rest/v1/building_embeddings`, {
            method: 'POST',
            headers: {
              ...supabaseHeaders,
              'Prefer': 'resolution=merge-duplicates',
            },
            body: JSON.stringify({
              building_id: String(item.building.id),
              embedding: singleEmb,
              model_version: config.model,
              source_text: item.text,
              updated_at: new Date().toISOString(),
            }),
          });

          if (!singleRes.ok) {
            const errText = await singleRes.text().catch(() => '');
            throw new Error(`Error BD: ${errText}`);
          }
          totalSuccessful++;
        } catch (singleErr) {
          totalFailed++;
          failedItems.push({ id: item.building.id, reason: singleErr.message });
        }
      }
    }

    totalProcessed += batch.length;
    const pct = ((totalProcessed / pendingBuildings.length) * 100).toFixed(1);
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (totalProcessed / (elapsedSec || 1)).toFixed(1);

    process.stdout.write(
      `\r📊 Progreso: ${totalProcessed}/${pendingBuildings.length} (${pct}%) | Lote ${bIdx + 1}/${totalBatches} | Éxito: ${totalSuccessful} | Fallos: ${totalFailed} | ${rate} obras/s`
    );

    if (DELAY_MS > 0 && bIdx < totalBatches - 1) {
      await sleep(DELAY_MS);
    }
  }

  process.stdout.write('\n');

  // 5. Reporte final
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n=================================================================');
  console.log('📋 [Backfill Embeddings] Resumen Final de Ejecución');
  console.log('=================================================================');
  console.log(`• Proveedor utilizado: ${config.provider.toUpperCase()} (${config.model}, ${config.dimension} dims)`);
  console.log(`• Obras totales en catálogo: ${allBuildings.length}`);
  console.log(`• Obras previamente existentes (saltadas): ${existingIds.size}`);
  console.log(`• Obras procesadas en esta ejecución: ${totalProcessed}`);
  console.log(`• Embeddings generados con éxito: ${totalSuccessful}`);
  console.log(`• Obras con fallo: ${totalFailed}`);
  console.log(`• Tiempo total transcurrido: ${totalElapsed}s`);

  if (failedItems.length > 0) {
    console.log('\n⚠️ Detalle de obras que fallaron:');
    failedItems.slice(0, 10).forEach((f) => {
      console.log(`  - ID ${f.id}: ${f.reason}`);
    });
    if (failedItems.length > 10) {
      console.log(`  ... y ${failedItems.length - 10} más.`);
    }
  }
  console.log('=================================================================\n');
}

runBackfill().catch((err) => {
  console.error('\n💥 Error fatal en el proceso de backfill:', err);
  process.exit(1);
});
