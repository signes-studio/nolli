// Test suite for Admin UI search, KPI, and multi-facet filtering logic
import assert from 'node:assert';

function cleanDiacritics(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function buildObraCorpus(obra) {
  const parts = [
    obra.nombre_obra,
    obra.arquitecto,
    obra.ciudad,
    obra.municipio,
    obra.place,
    obra.pais,
    obra.categoria,
    obra.estilo,
    obra.año_construccion,
    obra.year,
    obra.id,
    obra.featureId,
    obra.descripcion
  ];
  return cleanDiacritics(parts.filter(Boolean).join(' '));
}

function matchesMultiTokenSearch(obra, queryString) {
  const tokens = cleanDiacritics(queryString).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const corpus = buildObraCorpus(obra);
  return tokens.every(token => corpus.includes(token));
}

const mockBuildings = [
  {
    id: '1',
    featureId: 'b-1',
    nombre_obra: 'Pabellón Alemán (Barcelona Pavilion)',
    arquitecto: 'Ludwig Mies van der Rohe',
    ciudad: 'Barcelona',
    año_construccion: '1929',
    categoria: 'museo_exposicion',
    importancia: 0,
    estado_revision: 'publicada',
    foto: 'https://example.com/mies.jpg',
    coordenadas: [2.15, 41.37]
  },
  {
    id: '2',
    featureId: 'b-2',
    nombre_obra: 'Casa Batlló',
    arquitecto: 'Antoni Gaudí',
    ciudad: 'Barcelona',
    año_construccion: '1906',
    categoria: 'residencial',
    importancia: 0,
    estado_revision: 'pendiente',
    foto: '',
    coordenadas: [2.165, 41.391]
  },
  {
    id: '3',
    featureId: 'b-3',
    nombre_obra: 'Ciudad de las Artes y las Ciencias - L\'Hemisfèric',
    arquitecto: 'Santiago Calatrava',
    ciudad: 'Valencia',
    año_construccion: '1998',
    categoria: 'cultural',
    importancia: 1,
    estado_revision: 'publicada',
    foto: 'https://example.com/calatrava.jpg',
    coordenadas: [-0.353, 39.455]
  },
  {
    id: '4',
    featureId: 'b-4',
    nombre_obra: 'Torre de Telecomunicaciones',
    arquitecto: 'Sin arquitecto',
    ciudad: 'Madrid',
    año_construccion: '',
    categoria: 'infraestructura',
    importancia: 3,
    estado_revision: 'rechazada',
    foto: '',
    coordenadas: null
  }
];

console.log('--- 1. Testing Multi-token, Accent & Order Insensitive Search ---');

// Test 1: Reversed word order
assert.strictEqual(matchesMultiTokenSearch(mockBuildings[0], 'rohe mies barcelona'), true, 'Should match inverted order');
assert.strictEqual(matchesMultiTokenSearch(mockBuildings[0], 'barcelona 1929 aleman'), true, 'Should match year + city + name in any order');

// Test 2: Accent insensitivity
assert.strictEqual(matchesMultiTokenSearch(mockBuildings[1], 'gaudi batllo'), true, 'Should match gaudi without accent');
assert.strictEqual(matchesMultiTokenSearch(mockBuildings[1], 'CASA BATLLÓ GAUDÍ'), true, 'Should match uppercase with accents');
assert.strictEqual(matchesMultiTokenSearch(mockBuildings[2], 'hemisferic calatrava'), true, 'Should match hemisferic without accent');

// Test 3: Search by ID
assert.strictEqual(matchesMultiTokenSearch(mockBuildings[2], 'b-3'), true, 'Should match featureId');
assert.strictEqual(matchesMultiTokenSearch(mockBuildings[2], '3 valencia'), true, 'Should match id + city');

// Test 4: Negative match
assert.strictEqual(matchesMultiTokenSearch(mockBuildings[0], 'calatrava'), false, 'Should not match Calatrava in Mies');

console.log('✓ Multi-token search tests passed!');

console.log('--- 2. Testing KPI Calculations ---');
let pendingCount = 0, publishedCount = 0, rejectedCount = 0, noPhotoCount = 0, noArqCount = 0;
for (const o of mockBuildings) {
  const st = o.estado_revision || 'publicada';
  if (st === 'pendiente') pendingCount++;
  else if (st === 'rechazada') rejectedCount++;
  else publishedCount++;

  const hasPhoto = Boolean(o.foto || o.foto_url || o.imagen || (Array.isArray(o.fotos) && o.fotos.length > 0));
  if (!hasPhoto) noPhotoCount++;

  const arq = String(o.arquitecto || '').trim().toLowerCase();
  if (!arq || arq === 'sin arquitecto' || arq === 'desconocido') noArqCount++;
}

assert.strictEqual(publishedCount, 2, '2 published');
assert.strictEqual(pendingCount, 1, '1 pending');
assert.strictEqual(rejectedCount, 1, '1 rejected');
assert.strictEqual(noPhotoCount, 2, '2 without photo');
assert.strictEqual(noArqCount, 1, '1 without architect');

console.log('✓ KPI calculations passed!');

console.log('--- 3. Testing Audit Filters ---');
const sinFoto = mockBuildings.filter(o => !o.foto);
assert.strictEqual(sinFoto.length, 2, '2 buildings without photo');

const sinAno = mockBuildings.filter(o => !o.año_construccion || isNaN(parseInt(o.año_construccion, 10)));
assert.strictEqual(sinAno.length, 1, '1 building without year');

const sinCoords = mockBuildings.filter(o => !Array.isArray(o.coordenadas) || o.coordenadas.length !== 2);
assert.strictEqual(sinCoords.length, 1, '1 building without valid coords');

console.log('✓ Audit filters passed!');

console.log('--- 4. Testing Sorting Logic ---');
// Alpha sort
const alphaSorted = [...mockBuildings].sort((a, b) => (a.nombre_obra || '').localeCompare(b.nombre_obra || '', 'es'));
assert.strictEqual(alphaSorted[0].nombre_obra, 'Casa Batlló');

// Imp-desc sort (cumbre level 0 first)
const impSorted = [...mockBuildings].sort((a, b) => (a.importancia ?? 3) - (b.importancia ?? 3));
assert.strictEqual(impSorted[0].importancia, 0);

// Year-desc sort
const yearSorted = [...mockBuildings].sort((a, b) => (parseInt(b.año_construccion, 10) || 0) - (parseInt(a.año_construccion, 10) || 0));
assert.strictEqual(yearSorted[0].nombre_obra, 'Ciudad de las Artes y las Ciencias - L\'Hemisfèric');

console.log('✓ Sorting logic passed!');
console.log('ALL ADMIN UI TESTS PASSED 100%!');

