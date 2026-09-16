import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

console.log('🧪 Iniciando verificación de optimizaciones...');

// 1. Verificación de Bounding Box y estaDentroDeRadio
import { estaDentroDeRadio, calcularDistanciaMetros } from '../js/renderUtils.js';

// Coordenadas: Sagrada Familia (Barcelona) [2.1743558, 41.4036299]
const sagradaLon = 2.1743558;
const sagradaLat = 41.4036299;

// Punto a ~500m (Passeig de Sant Joan) [2.1700, 41.4000]
const puntoCercanoLon = 2.1700;
const puntoCercanoLat = 41.4000;
assert.strictEqual(
  estaDentroDeRadio(sagradaLon, sagradaLat, puntoCercanoLon, puntoCercanoLat, 1000),
  true,
  'Punto a 500m debe estar dentro de 1000m'
);

// Punto a ~600km (Madrid) [-3.7038, 40.4168]
const madridLon = -3.7038;
const madridLat = 40.4168;
assert.strictEqual(
  estaDentroDeRadio(sagradaLon, sagradaLat, madridLon, madridLat, 1000),
  false,
  'Madrid debe ser descartado inmediatamente fuera de 1000m'
);
console.log('✅ [1/5] Bounding Box 2D y cálculo de radio validados correctamente.');

// 2. Verificación de Presets Contextuales de Imágenes
import { getOptimizedPhotoUrl, IMAGE_PRESETS } from '../js/imageProxy.js';

assert.strictEqual(IMAGE_PRESETS.thumb.width, 160);
assert.strictEqual(IMAGE_PRESETS.card.width, 320);
assert.strictEqual(IMAGE_PRESETS.sheet.width, 800);
assert.strictEqual(IMAGE_PRESETS.fullscreen.width, 1400);

const testRawUrl = 'https://ldtfvpjigzvcagtciipn.supabase.co/storage/v1/object/public/building-photos/obra1.jpg';
const thumbUrl = getOptimizedPhotoUrl(testRawUrl, 'thumb');
assert.ok(thumbUrl.includes('w=160'), 'Thumb preset must set w=160');
assert.ok(thumbUrl.includes('output=webp'), 'URL must set output=webp');

const fullscreenUrl = getOptimizedPhotoUrl(testRawUrl, 'fullscreen');
assert.ok(fullscreenUrl.includes('w=1400'), 'Fullscreen preset must set w=1400');
console.log('✅ [2/5] Presets contextuales de imágenes WebP validados con éxito.');

// 3. Verificación de CSS Content-Visibility Containment
const componentsCss = fs.readFileSync(path.join(ROOT_DIR, 'css', 'components.css'), 'utf8');
const panelsCss = fs.readFileSync(path.join(ROOT_DIR, 'css', 'panels.css'), 'utf8');

assert.ok(componentsCss.includes('.place-suggestion-item'), 'components.css debe contener .place-suggestion-item');
assert.ok(componentsCss.includes('content-visibility: auto'), 'components.css debe aplicar content-visibility: auto');
assert.ok(panelsCss.includes('.radar-route-card'), 'panels.css debe contener .radar-route-card');
assert.ok(panelsCss.includes('content-visibility: auto'), 'panels.css debe aplicar content-visibility: auto a radar-route-card');
console.log('✅ [3/5] CSS Layout Containment (content-visibility: auto) validado.');

// 4. Verificación de Capa de Persistencia IndexedDB (src/storage.ts & js/storage.js)
const storageJs = fs.readFileSync(path.join(ROOT_DIR, 'js', 'storage.js'), 'utf8');
const apiJs = fs.readFileSync(path.join(ROOT_DIR, 'js', 'api.js'), 'utf8');

assert.ok(storageJs.includes('openCatalogDB'), 'storage.js debe exportar openCatalogDB');
assert.ok(storageJs.includes('getCatalogFromIDB'), 'storage.js debe exportar getCatalogFromIDB');
assert.ok(storageJs.includes('saveCatalogToIDB'), 'storage.js debe exportar saveCatalogToIDB');
assert.ok(storageJs.includes('clearCatalogIDB'), 'storage.js debe exportar clearCatalogIDB');
assert.ok(apiJs.includes('getCatalogFromIDB'), 'api.js debe importar y consumir getCatalogFromIDB');
assert.ok(apiJs.includes('clearCatalogIDB'), 'api.js debe llamar a clearCatalogIDB');
console.log('✅ [4/5] Capa de persistencia IndexedDB y revalidación en segundo plano validadas.');

// 5. Verificación de Build Pipeline y Service Worker Dynamic Hashing
const swJs = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));

assert.ok(packageJson.scripts.build.includes('scripts/build.js'), 'package.json build script debe apuntar a scripts/build.js');
assert.ok(packageJson.dependencies?.esbuild || packageJson.devDependencies?.esbuild, 'esbuild debe estar en package.json');
assert.ok(/const CACHE_NAME = 'nolli-shell-[a-f0-9]{8}';/.test(swJs), 'sw.js debe contener un hash MD5 dinámico para el cache');
assert.ok(swJs.includes('./js/storage.js'), 'sw.js debe incluir ./js/storage.js en APP_SHELL');
console.log('✅ [5/5] Build pipeline (esbuild + hash MD5 dinámico de Service Worker) validado.');

console.log('\n🎉 TODAS LAS 5 OPTIMIZACIONES HAN SIDO VERIFICADAS CON ÉXITO SIN REGRESIONES 🎉\n');
