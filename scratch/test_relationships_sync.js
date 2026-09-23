import assert from 'node:assert';
import { 
  STUDIO_RELATIONSHIPS, 
  findStudioByNameOrSlug, 
  findStudiosForMember, 
  getAssociatedSearchTerms, 
  isStudio, 
  getStudioMembers,
  reloadRelationships,
  LOCAL_RELATIONSHIPS_KEY 
} from '../js/architectRelationships.js';

console.log('Testing Architect Relationships Dynamic Engine...');

// Mock global localStorage in Node
const storageMap = new Map();
global.window = {};
global.document = {
  dispatchEvent: () => {}
};
global.localStorage = {
  getItem: (k) => storageMap.get(k) || null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

// 1. Verificar que Team 4 está presente en las semillas
console.log('1. Verificando Team 4 en relaciones semilla...');
const team4 = findStudioByNameOrSlug('Team 4');
assert(team4, 'Team 4 debe existir en las relaciones');
assert(team4.members.includes('Norman Foster'), 'Norman Foster debe ser miembro de Team 4');
assert(team4.members.includes('Richard Rogers'), 'Richard Rogers debe ser miembro de Team 4');

const fosterTerms = getAssociatedSearchTerms('Norman Foster');
console.log('Términos para Norman Foster:', fosterTerms);
assert(fosterTerms.includes('Norman Foster'), 'Debe incluir su propio nombre');
assert(fosterTerms.includes('Team 4'), 'Debe incluir Team 4');
assert(fosterTerms.includes('Foster + Partners'), 'Debe incluir Foster + Partners');

// 2. Simular adición de un nuevo colectivo desde el panel de admin en localStorage
console.log('2. Añadiendo nuevo colectivo personalizado a localStorage...');
const customList = JSON.parse(JSON.stringify(STUDIO_RELATIONSHIPS));
customList.push({
  id: 'test-colectivo-valenciano',
  studio: 'Colectivo Valenciano Test',
  members: ['Arquitecto Alfa', 'Arquitecto Beta'],
  aliases: ['Colectivo Test', 'Valenciano Test'],
});
localStorage.setItem(LOCAL_RELATIONSHIPS_KEY, JSON.stringify(customList));

// 3. Ejecutar reloadRelationships
console.log('3. Ejecutando reloadRelationships()...');
reloadRelationships();

// 4. Verificar que se encuentra de inmediato
const nuevoEstudio = findStudioByNameOrSlug('Colectivo Valenciano Test');
assert(nuevoEstudio, 'El nuevo estudio debe encontrarse');
assert.strictEqual(nuevoEstudio.id, 'test-colectivo-valenciano');
assert.strictEqual(isStudio('Colectivo Valenciano Test'), true);
assert.strictEqual(isStudio('test-colectivo-valenciano'), true);

const miembros = getStudioMembers('Colectivo Valenciano Test');
assert.strictEqual(miembros.length, 2);
assert.strictEqual(miembros[0].name, 'Arquitecto Alfa');

const alfaStudios = findStudiosForMember('Arquitecto Alfa');
assert.strictEqual(alfaStudios.length, 1);
assert.strictEqual(alfaStudios[0].studio, 'Colectivo Valenciano Test');

const alfaTerms = getAssociatedSearchTerms('Arquitecto Alfa');
console.log('Términos para Arquitecto Alfa:', alfaTerms);
assert(alfaTerms.includes('Arquitecto Alfa'));
assert(alfaTerms.includes('Colectivo Valenciano Test'));
assert(alfaTerms.includes('Colectivo Test'));

console.log('✅ TODAS LAS PRUEBAS DE RELACIONES DINÁMICAS SUPERADAS CON ÉXITO.');

