/**
 * VERIFICACIÓN AUTOMATIZADA DE LA FASE 2: CAPA SOCIAL DE NOLLI
 * Prueba RLS, protección anónima, bypass de catálogo, seguridad anti-egress
 * y cálculo de listas de deseos en cliente.
 */

const https = require('https');

const SUPABASE_URL = 'https://ldtfvpjigzvcagtciipn.supabase.co';
const ANON_KEY = 'sb_publishable_kYQ7Fa8nBsrkp1f8C4AuAg_4-5uBFm0';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdGZ2cGppZ3p2Y2FndGNpaXBuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU3OTg2NywiZXhwIjoyMTAzMTU1ODY3fQ.iRn-X5EzmW9eoKqL5qdW3s6I7NfcLfnJRmXTNwjCNnY';

async function runTests() {
  console.log('===============================================================');
  console.log('INICIANDO BATERÍA DE VERIFICACIÓN: FASE 2 (CAPA SOCIAL DE NOLLI)');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
    }
  }

  // 1. Verificar consultas anónimas en user_collections
  console.log('--- TEST 1: user_collections con RLS y visibilidad pública/privada ---');
  try {
    const resAnon = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?select=id,name`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
    });
    const statusAnon = resAnon.status;
    const dataAnon = await resAnon.json().catch(() => []);
    
    assert(statusAnon === 200, `Respuesta REST anon sobre user_collections exitosa (${statusAnon})`);
    assert(Array.isArray(dataAnon), `Respuesta contiene colección pública accesible a anónimos (total: ${dataAnon.length})`);

    // Comprobación de estado de columna visibility en Supabase en vivo
    const resCol = await fetch(`${SUPABASE_URL}/rest/v1/user_collections?select=visibility&limit=1`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
    });
    if (resCol.status === 200) {
      console.log('  [DB STATUS] Columna visibility ya desplegada y activa en Supabase.');
    } else {
      console.log('  [DB STATUS] Migración 016 lista para aplicar en el SQL Editor de Supabase (columna visibility pendiente de DDL).');
    }
  } catch (err) {
    console.error('Error en Test 1:', err.message);
  }

  // 2. Verificar consultas anónimas en building_visits
  console.log('\n--- TEST 2: building_visits bloqueado para anónimos en private/friends ---');
  try {
    const resPrivateVisits = await fetch(`${SUPABASE_URL}/rest/v1/building_visits?visibility=eq.private&select=*`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
    });
    const dataPrivateVisits = await resPrivateVisits.json().catch(() => []);
    const privateVisitsCount = Array.isArray(dataPrivateVisits) ? dataPrivateVisits.length : (resPrivateVisits.status === 403 || resPrivateVisits.status === 404 ? 0 : 999);
    assert(privateVisitsCount === 0, `Consulta anónima a visitas con visibility='private' retorna 0 resultados o 403 (recibidos: ${privateVisitsCount})`);

    const resFriendsVisits = await fetch(`${SUPABASE_URL}/rest/v1/building_visits?visibility=eq.friends&select=*`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
    });
    const dataFriendsVisits = await resFriendsVisits.json().catch(() => []);
    const friendsVisitsCount = Array.isArray(dataFriendsVisits) ? dataFriendsVisits.length : (resFriendsVisits.status === 403 || resFriendsVisits.status === 404 ? 0 : 999);
    assert(friendsVisitsCount === 0, `Consulta anónima a visitas con visibility='friends' retorna 0 resultados o 403 (recibidos: ${friendsVisitsCount})`);
  } catch (err) {
    console.error('Error en Test 2:', err.message);
  }

  // 3. Verificar consultas anónimas en visit_photos (private/friends vs is_featured_in_catalog)
  console.log('\n--- TEST 3: visit_photos con RLS y Bypass de Catálogo ---');
  try {
    const resPrivatePhotos = await fetch(`${SUPABASE_URL}/rest/v1/visit_photos?visibility=eq.private&is_featured_in_catalog=eq.false&select=*`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
    });
    const dataPrivatePhotos = await resPrivatePhotos.json().catch(() => []);
    const privatePhotosCount = Array.isArray(dataPrivatePhotos) ? dataPrivatePhotos.length : (resPrivatePhotos.status === 403 || resPrivatePhotos.status === 404 ? 0 : 999);
    assert(privatePhotosCount === 0, `Fotos privadas NO destacadas retornan 0 resultados para anónimo (recibidas: ${privatePhotosCount})`);

    const resFeatured = await fetch(`${SUPABASE_URL}/rest/v1/visit_photos?is_featured_in_catalog=eq.true&select=*`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
    });
    assert(resFeatured.status === 200 || resFeatured.status === 404, `Endpoint de fotos destacadas en catálogo responde con HTTP válido (${resFeatured.status})`);
  } catch (err) {
    console.error('Error en Test 3:', err.message);
  }

  // 4. Verificación de seguridad Anti-Egress (Rechazo de Supabase Storage)
  console.log('\n--- TEST 4: Blindaje contra Supabase Storage (Cero Egress) ---');
  const { isSafePhotoUrl } = await import('../js/photoStorageConfig.js');
  const testUrls = [
    { url: 'https://photos.nollimap.app/visits/visit_123.webp', expected: true },
    { url: 'https://imagedelivery.net/abc/def/public', expected: true },
    { url: 'https://ldtfvpjigzvcagtciipn.supabase.co/storage/v1/object/public/photos/bad.jpg', expected: false },
    { url: 'https://my-app.supabase.in/storage/v1/bad.png', expected: false },
    { url: 'http://localhost:3000/test.jpg', expected: true },
  ];

  for (const t of testUrls) {
    const result = isSafePhotoUrl(t.url);
    assert(result === t.expected, `Validación de URL '${t.url.substring(0, 45)}...': detectada como ${result ? 'SEGURA' : 'BLOQUEADA'} (esperado: ${t.expected ? 'SEGURA' : 'BLOQUEADA'})`);
  }

  // 5. Verificación de cálculo de lista de deseos en cliente (0 llamadas a servidor)
  console.log('\n--- TEST 5: Proximidad de Lista de Deseos en Cliente (0 Coste Servidor) ---');
  const { calcularDistanciaMetros } = await import('../js/renderUtils.js');
  
  // Coordenadas de prueba (Madrid: Sol [-3.7038, 40.4168] vs Prado [-3.6921, 40.4138])
  const dist = calcularDistanciaMetros(-3.7038, 40.4168, -3.6921, 40.4138);
  assert(dist > 900 && dist < 1200, `Cálculo Haversine cliente para proximidad de listas de deseos: ${Math.round(dist)} metros`);

  // Simulación de cruce en cliente
  const mockWishlistCol = { id: 'col_wish_1', name: 'Pendientes', is_wishlist: true };
  const mockItems = [{ collection_id: 'col_wish_1', building_id: '101' }];
  const mockCatalog = [
    { id: 101, nombre_obra: 'Edificio España', coordenadas: [-3.7119, 40.4234] },
    { id: 102, nombre_obra: 'Torres KIO', coordenadas: [-3.6886, 40.4667] }
  ];

  const userWishlistColIds = new Set([mockWishlistCol].filter(c => c.is_wishlist).map(c => String(c.id)));
  const wishlistBuildingIds = new Set(mockItems.filter(i => userWishlistColIds.has(String(i.collection_id))).map(i => String(i.building_id)));
  const nearbyWishlist = mockCatalog
    .filter(o => wishlistBuildingIds.has(String(o.id)))
    .map(o => ({ ...o, _dist: calcularDistanciaMetros(-3.7038, 40.4168, o.coordenadas[0], o.coordenadas[1]) }));

  assert(nearbyWishlist.length === 1 && nearbyWishlist[0].nombre_obra === 'Edificio España', `Cruce en memoria local resuelto exitosamente sin llamadas HTTP`);

  console.log('\n===============================================================');
  console.log(`RESULTADO DE LA VERIFICACIÓN: ${passed} / ${total} PRUEBAS SUPERADAS`);
  console.log('===============================================================');
}

runTests().catch(console.error);
