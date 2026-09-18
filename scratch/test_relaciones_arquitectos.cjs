const assert = require('assert');
const {
  STUDIO_RELATIONSHIPS,
  normalizeArchitectKey,
  findStudioByNameOrSlug,
  findStudiosForMember,
  isStudio,
  getStudioMembers,
  getMemberStudios,
  getCanonicalArchitectName,
  getAssociatedSearchTerms,
} = require('../api/_lib/architectRelationships.js');
const { slugify, slugToRegex } = require('../api/_lib/slugs.js');

console.log('🧪 Iniciando pruebas del sistema de relaciones arquitecto-estudio...\n');

// TEST 1: Herencia asimétrica Miguel del Rey <-> VAM10
console.log('1. Verificando Miguel del Rey y VAM10:');
const miguelTerms = getAssociatedSearchTerms('Miguel del Rey');
const vamTerms = getAssociatedSearchTerms('VAM10');

console.log('   Términos Miguel del Rey:', miguelTerms);
console.log('   Términos VAM10:', vamTerms);

assert(miguelTerms.includes('Miguel del Rey'), 'Debe incluir su propio nombre');
assert(miguelTerms.includes('VAM10'), 'Miguel del Rey DEBE heredar las obras de VAM10');
assert(miguelTerms.some(t => t.toLowerCase().includes('del rey aynat')), 'Debe incluir su alias Aynat');

assert(vamTerms.includes('VAM10'), 'VAM10 debe incluir su propio nombre');
assert(!vamTerms.includes('Miguel del Rey'), 'VAM10 NO debe incluir a Miguel del Rey como término de búsqueda (no al revés)');
assert(!vamTerms.includes('Antonio Gallud'), 'VAM10 NO debe incluir a Antonio Gallud');
console.log('   ✅ Herencia asimétrica Miguel del Rey -> VAM10 validada.');

// TEST 2: Composición de Gradolí & Sanz <-> Carmel Gradolí / Arturo Sanz
console.log('\n2. Verificando Gradolí & Sanz con Carmel Gradolí y Arturo Sanz:');
const carmelTerms = getAssociatedSearchTerms('Carmel Gradolí');
const arturoTerms = getAssociatedSearchTerms('Arturo Sanz');
const gsTerms = getAssociatedSearchTerms('Gradolí & Sanz');

console.log('   Términos Carmel Gradolí:', carmelTerms);
console.log('   Términos Arturo Sanz:', arturoTerms);
console.log('   Términos Gradolí & Sanz:', gsTerms);

assert(carmelTerms.includes('Carmel Gradolí'), 'Carmel debe incluirse a sí mismo');
assert(carmelTerms.some(t => t.includes('Gradolí & Sanz')), 'Carmel debe incluir Gradolí & Sanz');
assert(carmelTerms.some(t => t.includes('Gradolí & Sanz arquitectes')), 'Carmel debe incluir variantes del estudio');
assert(!carmelTerms.includes('Arturo Sanz'), 'Carmel NO debe incluir obras solistas de Arturo Sanz');

assert(arturoTerms.includes('Arturo Sanz'), 'Arturo debe incluirse a sí mismo');
assert(arturoTerms.some(t => t.includes('Gradolí & Sanz')), 'Arturo debe incluir Gradolí & Sanz');
assert(!arturoTerms.includes('Carmel Gradolí'), 'Arturo NO debe incluir obras solistas de Carmel Gradolí');

assert(gsTerms.includes('Gradolí & Sanz'), 'Estudio debe incluirse a sí mismo');
assert(!gsTerms.includes('Carmel Gradolí'), 'Estudio NO debe incluir obras solistas de Carmel');
assert(!gsTerms.includes('Arturo Sanz'), 'Estudio NO debe incluir obras solistas de Arturo');

const gsMembers = getStudioMembers('Gradolí & Sanz');
assert.strictEqual(gsMembers.length, 2, 'Gradolí & Sanz debe tener 2 miembros');
assert.deepStrictEqual(gsMembers.map(m => m.name), ['Carmel Gradolí', 'Arturo Sanz']);
console.log('   ✅ Composición e independencia de integrantes validada.');

// TEST 3: Simulación de catálogo de obras con filtro direccional
console.log('\n3. Verificando filtrado sobre catálogo simulado de obras:');
const catalogoPrueba = [
  { id: '1', nombre: 'Lonja del Cáñamo', arquitecto: 'Francesc Galiança de la Lanxa, VAM10' },
  { id: '2', nombre: 'Recinto de Ferias y Mercados', arquitecto: 'Miguel del Rey' },
  { id: '3', nombre: 'Jardín de las Hespérides', arquitecto: 'Mª Teresa Santamaría, Carlos Campos, Miguel del Rey Aynat, Antonio Gallud Martínez' },
  { id: '4', nombre: 'Centro Cultural La Rambleta', arquitecto: 'Gradolí & Sanz arquitectes' },
  { id: '5', nombre: 'Casa en Benimaclet', arquitecto: 'Carmel Gradolí' },
  { id: '6', nombre: 'Vivienda unifamiliar', arquitecto: 'Arturo Sanz' },
  { id: '7', nombre: 'Pabellón Alemán', arquitecto: 'Mies van der Rohe' },
];

function normalizarTexto(str) {
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function filtrarObras(nombreAutor) {
  const terms = getAssociatedSearchTerms(nombreAutor);
  const normTerms = terms.map(t => normalizarTexto(t)).filter(Boolean);
  return catalogoPrueba.filter(obra => {
    const arqNorm = normalizarTexto(obra.arquitecto);
    return normTerms.some(term => arqNorm.includes(term));
  });
}

const resMiguel = filtrarObras('Miguel del Rey');
console.log('   Obras de Miguel del Rey (esperadas: Lonja del Cáñamo [VAM10], Ferias [Miguel], Hespérides [Aynat]):', resMiguel.map(o => o.nombre));
assert(resMiguel.some(o => o.nombre === 'Lonja del Cáñamo'), 'Miguel del Rey debe ver Lonja del Cáñamo (VAM10)');
assert(resMiguel.some(o => o.nombre === 'Recinto de Ferias y Mercados'), 'Miguel del Rey debe ver sus ferias');
assert(resMiguel.some(o => o.nombre === 'Jardín de las Hespérides'), 'Miguel del Rey debe ver Hespérides');
assert(!resMiguel.some(o => o.nombre === 'Centro Cultural La Rambleta'), 'No debe ver obras de Gradolí');

const resVam = filtrarObras('VAM10');
console.log('   Obras de VAM10 (esperadas: Lonja del Cáñamo [VAM10]):', resVam.map(o => o.nombre));
assert(resVam.some(o => o.nombre === 'Lonja del Cáñamo'), 'VAM10 debe ver Lonja del Cáñamo');
assert(!resVam.some(o => o.nombre === 'Recinto de Ferias y Mercados'), 'VAM10 NO debe ver obras solistas de Miguel del Rey');

const resCarmel = filtrarObras('Carmel Gradolí');
console.log('   Obras de Carmel Gradolí:', resCarmel.map(o => o.nombre));
assert(resCarmel.some(o => o.nombre === 'Centro Cultural La Rambleta'), 'Carmel debe ver La Rambleta (Gradolí & Sanz)');
assert(resCarmel.some(o => o.nombre === 'Casa en Benimaclet'), 'Carmel debe ver su casa en Benimaclet');
assert(!resCarmel.some(o => o.nombre === 'Vivienda unifamiliar'), 'Carmel NO debe ver la obra solista de Arturo Sanz');

const resArturo = filtrarObras('Arturo Sanz');
console.log('   Obras de Arturo Sanz:', resArturo.map(o => o.nombre));
assert(resArturo.some(o => o.nombre === 'Centro Cultural La Rambleta'), 'Arturo debe ver La Rambleta (Gradolí & Sanz)');
assert(resArturo.some(o => o.nombre === 'Vivienda unifamiliar'), 'Arturo debe ver su propia vivienda');
assert(!resArturo.some(o => o.nombre === 'Casa en Benimaclet'), 'Arturo NO debe ver la obra solista de Carmel Gradolí');

const resGS = filtrarObras('Gradolí & Sanz');
console.log('   Obras de Gradolí & Sanz:', resGS.map(o => o.nombre));
assert(resGS.some(o => o.nombre === 'Centro Cultural La Rambleta'), 'Gradolí & Sanz debe ver La Rambleta');
assert(!resGS.some(o => o.nombre === 'Casa en Benimaclet'), 'Gradolí & Sanz NO debe ver obra solista de Carmel');
assert(!resGS.some(o => o.nombre === 'Vivienda unifamiliar'), 'Gradolí & Sanz NO debe ver obra solista de Arturo');
console.log('   ✅ Filtrado de obras coincide exactamente con las reglas solicitadas.');

// TEST 4: Verificación de expresión regular para SSR / Supabase imatch
console.log('\n4. Verificando regex para PostgREST imatch en SSR:');
function construirRegexSSR(nombreOEstudio) {
  const terms = getAssociatedSearchTerms(nombreOEstudio);
  if (terms.length > 1) {
    const parts = terms.map(t => slugToRegex(slugify(t)).replace(/^\.\*/, '').replace(/\.\*$/, ''));
    return `.*(?:${parts.join('|')}).*`;
  }
  return slugToRegex(slugify(nombreOEstudio));
}

const reMiguel = new RegExp(construirRegexSSR('miguel-del-rey'), 'i');
assert(reMiguel.test('Lonja del Cáñamo, VAM10'), 'Regex Miguel debe matchear VAM10');
assert(reMiguel.test('Edificio por Miguel del Rey Aynat'), 'Regex Miguel debe matchear Aynat');
assert(!reMiguel.test('Centro Cultural La Rambleta, Gradolí & Sanz'), 'Regex Miguel no debe matchear Gradolí');

const reVam = new RegExp(construirRegexSSR('vam10'), 'i');
assert(reVam.test('Lonja del Cáñamo, VAM10'), 'Regex VAM10 debe matchear VAM10');
assert(!reVam.test('Recinto ferial por Miguel del Rey'), 'Regex VAM10 NO debe matchear Miguel del Rey solista');

console.log('   ✅ Expresión regular de PostgREST imatch verificada correctamente.');

console.log('\n🎉 ¡TODAS LAS PRUEBAS UNITARIAS Y DE INTEGRACIÓN PASARON CON ÉXITO!');
