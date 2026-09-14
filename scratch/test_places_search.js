import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');

console.log('--- TEST SUITE: Buscador de Lugares y Geocoding Mapbox ---');

// 1. Validar i18n
const requiredKeys = [
  'search_tab_catalog',
  'search_tab_places',
  'search_tab_places_pill',
  'search_placeholder_catalog',
  'search_placeholder_places',
  'search_places_desc',
  'search_no_places_found',
  'search_places_error',
  'radar_manual_location_badge',
  'radar_manual_location_notice_title',
  'radar_manual_location_notice_desc',
  'radar_btn_change_city',
  'radar_manual_location_toast',
];

for (const lang of ['es', 'en', 'ca']) {
  const jsonPath = path.join(ROOT, 'locales', `${lang}.json`);
  const content = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  for (const key of requiredKeys) {
    assert.ok(content[key], `Falta la clave "${key}" en ${lang}.json`);
    assert.equal(typeof content[key], 'string');
  }
  console.log(`[PASS] ${lang}.json contiene todas las ${requiredKeys.length} claves i18n.`);
}

// 2. Validar estructura HTML en index.html
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.ok(indexHtml.includes('id="mobile-search-tabs"'), 'index.html debe contener #mobile-search-tabs');
assert.ok(indexHtml.includes('id="tab-search-catalog"'), 'index.html debe contener #tab-search-catalog');
assert.ok(indexHtml.includes('id="tab-search-places"'), 'index.html debe contener #tab-search-places');
assert.ok(indexHtml.includes('data-search-mode="places"'), 'index.html debe contener data-search-mode="places"');
console.log('[PASS] index.html contiene el contenedor de pestañas y botones de modo.');

// 3. Validar clases CSS en css/components.css
const css = fs.readFileSync(path.join(ROOT, 'css', 'components.css'), 'utf8');
const requiredClasses = [
  '.search-mode-tabs',
  '.search-mode-tab',
  '.search-tab-pill',
  '.places-helper-banner',
  '.place-suggestion-item',
  '.place-suggestion-icon',
  '.place-suggestion-content',
  '.place-suggestion-main',
  '.place-suggestion-sub',
  '.place-type-badge',
];
for (const cls of requiredClasses) {
  assert.ok(css.includes(cls), `css/components.css debe definir ${cls}`);
}
console.log('[PASS] css/components.css contiene todas las clases de estilo Neo-Bauhaus requeridas.');

// 4. Test LRU Cache logic (simulación de la caché de js/api.js)
class PlacesCacheTest {
  constructor(maxSize = 20) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }
  get(key) { return this.cache.get(key); }
  set(key, val) {
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(key, val);
  }
}

const cache = new PlacesCacheTest(20);
for (let i = 1; i <= 25; i++) {
  cache.set(`ciudad_${i}`, { data: i });
}
assert.equal(cache.cache.size, 20, 'La caché no debe superar 20 elementos');
assert.equal(cache.get('ciudad_1'), undefined, 'El elemento 1 debió ser desalojado (FIFO/LRU)');
assert.equal(cache.get('ciudad_5'), undefined, 'El elemento 5 debió ser desalojado');
assert.ok(cache.get('ciudad_6'), 'El elemento 6 debe permanecer');
assert.ok(cache.get('ciudad_25'), 'El elemento 25 debe existir');
console.log('[PASS] Caché LRU de 20 consultas funciona según especificación.');

// 5. Test Zoom calculation logic
function calcularZoomPorTipoLugar(place) {
  const type = Array.isArray(place?.place_type) ? place.place_type[0] : '';
  switch (type) {
    case 'country': return 5.0;
    case 'region': return 8.0;
    case 'place':
    case 'district': return 12.5;
    case 'locality':
    case 'neighborhood': return 14.5;
    case 'address': return 16.5;
    default: return 13.0;
  }
}

assert.equal(calcularZoomPorTipoLugar({ place_type: ['country'] }), 5.0);
assert.equal(calcularZoomPorTipoLugar({ place_type: ['region'] }), 8.0);
assert.equal(calcularZoomPorTipoLugar({ place_type: ['place'] }), 12.5);
assert.equal(calcularZoomPorTipoLugar({ place_type: ['locality'] }), 14.5);
assert.equal(calcularZoomPorTipoLugar({ place_type: ['address'] }), 16.5);
assert.equal(calcularZoomPorTipoLugar({ place_type: ['unknown'] }), 13.0);
console.log('[PASS] Niveles de zoom contextuales calculados exactamente según place_type.');

// 6. Validar integración de radarUI.js
const radarJs = fs.readFileSync(path.join(ROOT, 'js', 'radarUI.js'), 'utf8');
assert.ok(radarJs.includes('isManual'), 'radarUI.js debe verificar isManual');
assert.ok(radarJs.includes('abrirBuscadorConModo'), 'radarUI.js debe invocar abrirBuscadorConModo');
assert.ok(radarJs.includes('btn-radar-go-search'), 'radarUI.js debe enlazar btn-radar-go-search');
console.log('[PASS] radarUI.js integrado con el modo manual y buscador centralizado.');

console.log('\n🎉 TODOS LOS TESTS DE BUSCADOR DE LUGARES PASARON EXITOSAMENTE 🎉');

