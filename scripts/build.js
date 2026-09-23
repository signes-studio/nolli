#!/usr/bin/env node

/**
 * SCRIPTS/BUILD.JS — Pipeline de compilación y optimización para Nolli
 * 
 * Acciones:
 * 1. Ejecuta TypeScript Compiler (tsc) para validar tipos estrictos y transpilar src/ -> js/
 * 2. Minifica con esbuild (ultra-rápido):
 *    - En CI/Vercel (process.env.VERCEL o --minify): minifica todos los bundles de js/
 *    - En local: minifica los archivos generados desde TypeScript en js/
 * 3. Calcula el hash MD5 de los ficheros críticos del App Shell
 * 4. Actualiza automáticamente la constante CACHE_NAME en sw.js
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { transformSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT_DIR, 'js');
const SW_PATH = path.join(ROOT_DIR, 'sw.js');

const isVercel = Boolean(process.env.VERCEL);
const isProd = process.argv.includes('--minify') || process.argv.includes('--prod') || isVercel;

console.log('🚀 [Build] Iniciando proceso de compilación para Nolli...');
const startTime = Date.now();

// 1. Ejecutar Typecheck y compilación TypeScript
console.log('📦 [1/4] Compilando TypeScript (tsc)...');
try {
  const tscBin = path.join(ROOT_DIR, 'node_modules', 'typescript', 'bin', 'tsc');
  if (fs.existsSync(tscBin)) {
    execSync(`node "${tscBin}"`, { cwd: ROOT_DIR, stdio: 'inherit' });
  } else {
    execSync('npx tsc', { cwd: ROOT_DIR, stdio: 'inherit' });
  }
  console.log('✅ [1/4] TypeScript compilado sin errores.');
} catch (err) {
  console.error('❌ [1/4] Error en compilación de TypeScript:', err);
  process.exit(1);
}

// 2. Minificación con esbuild
console.log(`⚡ [2/4] Optimizando JavaScript con esbuild (${isProd ? 'modo producción / todos los módulos' : 'modo local / módulos compilados'})...`);
try {
  let jsFiles = [];
  if (isProd) {
    // Minificar todos los archivos JS propios en js/ (excepto los que ya terminen en .min.js)
    jsFiles = fs.readdirSync(JS_DIR)
      .filter((file) => file.endsWith('.js') && !file.endsWith('.min.js'))
      .map((file) => path.join(JS_DIR, file));
  } else {
    // En local, solo minificar los outputs generados por tsc desde src/ para preservar formato de código fuente en edición
    const srcFiles = fs.readdirSync(path.join(ROOT_DIR, 'src'))
      .filter((file) => file.endsWith('.ts'))
      .map((file) => path.join(JS_DIR, file.replace(/\.ts$/, '.js')))
      .filter((file) => fs.existsSync(file));
    jsFiles = srcFiles;
  }

  let totalOriginal = 0;
  let totalMinified = 0;

  for (const filePath of jsFiles) {
    const originalCode = fs.readFileSync(filePath, 'utf8');
    totalOriginal += Buffer.byteLength(originalCode, 'utf8');

    const result = transformSync(originalCode, {
      minify: true,
      target: 'es2022',
      format: 'esm',
    });

    fs.writeFileSync(filePath, result.code, 'utf8');
    totalMinified += Buffer.byteLength(result.code, 'utf8');
  }

  const savedKb = ((totalOriginal - totalMinified) / 1024).toFixed(1);
  const percent = totalOriginal > 0 ? (((totalOriginal - totalMinified) / totalOriginal) * 100).toFixed(1) : 0;
  console.log(`✅ [2/4] ${jsFiles.length} archivos procesados. Ahorro: ${savedKb} KB (-${percent}%).`);
} catch (err) {
  console.error('❌ [2/4] Error al minificar con esbuild:', err);
  process.exit(1);
}

// 3. Cálculo de hash MD5 para el App Shell
console.log('🔒 [3/4] Generando hash de integridad del App Shell...');
const criticalFiles = [
  path.join(ROOT_DIR, 'index.html'),
  path.join(ROOT_DIR, 'css', 'base.css'),
  path.join(ROOT_DIR, 'css', 'components.css'),
  path.join(ROOT_DIR, 'css', 'panels.css'),
  path.join(ROOT_DIR, 'js', 'main.js'),
  path.join(ROOT_DIR, 'js', 'api.js'),
  path.join(ROOT_DIR, 'js', 'storage.js'),
  path.join(ROOT_DIR, 'js', 'mapController.js'),
  path.join(ROOT_DIR, 'js', 'sheetUI.js'),
  path.join(ROOT_DIR, 'js', 'renderUtils.js'),
  path.join(ROOT_DIR, 'js', 'imageProxy.js'),
  path.join(ROOT_DIR, 'js', 'pwaUpdate.js'),
];

const md5 = crypto.createHash('md5');
for (const file of criticalFiles) {
  if (fs.existsSync(file)) {
    md5.update(fs.readFileSync(file));
  }
}
const hash = md5.digest('hex').slice(0, 8);
const newCacheName = `nolli-shell-${hash}`;
console.log(`🔑 [3/4] Identificador de versión generado: ${newCacheName}`);

// 4. Actualización dinámica en sw.js
console.log('🔄 [4/4] Actualizando Service Worker cache name...');
try {
  let swContent = fs.readFileSync(SW_PATH, 'utf8');
  const cacheRegex = /(?:const CACHE_NAME = ['"][^'"]+['"];\r?\n?)+/;
  if (cacheRegex.test(swContent)) {
    swContent = swContent.replace(cacheRegex, `const CACHE_NAME = '${newCacheName}';\n`);
    fs.writeFileSync(SW_PATH, swContent, 'utf8');
    console.log(`✅ [4/4] sw.js actualizado con CACHE_NAME = '${newCacheName}'`);
  } else {
    console.warn('⚠️ [4/4] No se encontró la constante CACHE_NAME en sw.js');
  }
} catch (err) {
  console.error('❌ [4/4] Error al actualizar sw.js:', err);
}

const totalDuration = Date.now() - startTime;
console.log(`✨ [Build] Completado con éxito en ${totalDuration}ms.`);

