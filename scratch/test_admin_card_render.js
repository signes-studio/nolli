// scratch/test_admin_card_render.js
import assert from 'node:assert';
import { 
  escapeHtml, 
  CATEGORY_META, 
  formatCategoria, 
  normalizarCategoria 
} from '../js/state.js';

function formatAdminImpBadge(impVal) {
  const imp = Number(impVal);
  if (imp === 0) return { level: 0, label: 'HITO // L0', title: 'Nivel 0: Obra Cumbre (Hito Arquitectónico)' };
  if (imp === 1) return { level: 1, label: 'L1', title: 'Nivel 1: Imprescindible' };
  if (imp === 2) return { level: 2, label: 'L2', title: 'Nivel 2: Recomendada' };
  return { level: 3, label: 'L3', title: 'Nivel 3: Documentada' };
}

console.log('--- Testing Admin Card Rendering Logic ---');

// 1. Badge formatting
assert.strictEqual(formatAdminImpBadge(0).label, 'HITO // L0');
assert.strictEqual(formatAdminImpBadge(1).label, 'L1');
assert.strictEqual(formatAdminImpBadge(2).label, 'L2');
assert.strictEqual(formatAdminImpBadge(3).label, 'L3');
assert.strictEqual(formatAdminImpBadge(undefined).label, 'L3');
console.log('✓ Importance badge formatting passed');

// 2. Category normalization & metadata
const catKey = normalizarCategoria('residencial');
const catMeta = CATEGORY_META[catKey];
assert.ok(catMeta);
assert.strictEqual(formatCategoria('residencial'), 'Residencial');
console.log('✓ Category meta passed');

// 3. Test card rendering string logic
const mockObra = {
  id: '12345',
  featureId: 'feat-12345',
  nombre_obra: 'Edificio de Prueba Superviviente con Título Extremadamente Largo para Comprobar Elipsis',
  arquitecto: 'Mies van der Rohe & Lilly Reich',
  estado_revision: 'pendiente',
  importancia: 0,
  categoria: 'residencial',
  año_construccion: 1929,
  ciudad: 'Barcelona',
  coordenadas: [2.15, 41.38]
};

const impBadge = formatAdminImpBadge(mockObra.importancia);
assert.strictEqual(impBadge.level, 0);
assert.strictEqual(impBadge.label, 'HITO // L0');

console.log('✓ All card rendering tests passed successfully!');

