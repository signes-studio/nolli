/**
 * SUITE DE VERIFICACIÓN AUTOMATIZADA: FASE 3 (PUNTOS E INSIGNIAS)
 * Proyecto: Nolli Architecture Atlas (Supabase ldtfvpjigzvcagtciipn)
 * Usuario de prueba: user@nolli.app
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ldtfvpjigzvcagtciipn.supabase.co';
const ANON_KEY = process.env.SUPABASE_KEY || 'sb_publishable_kYQ7Fa8nBsrkp1f8C4AuAg_4-5uBFm0';
const TEST_EMAIL = 'user@nolli.app';
const TEST_PASSWORD = 'beta-tester';
const SAMPLE_BUILDING_ID = '00600c35'; // Edificio de viviendas en Avellanes nº18

async function runVerification() {
  console.log('======================================================================');
  console.log('   BATERÍA DE VERIFICACIÓN FASE 3: GAMIFICACIÓN (PUNTOS E INSIGNIAS)  ');
  console.log('======================================================================\n');

  const results = {
    auth: false,
    initialProfile: null,
    anonGamificationBadgesRead: null,
    anonUserBadgesRead: null,
    anonUserBadgesInsertRejected: null,
    authUserBadgesDirectInsertRejected: null,
    visitInsertStatus: null,
    afterProfile: null,
    userBadgesAwarded: []
  };

  // 1. Autenticación con el usuario de pruebas
  console.log('1. Autenticando usuario de pruebas (' + TEST_EMAIL + ')...');
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
  });

  const authData = await authRes.json();
  if (!authRes.ok) {
    console.error('❌ Error de autenticación:', authData);
    process.exit(1);
  }

  const token = authData.access_token;
  const userId = authData.user.id;
  results.auth = true;
  console.log(`✅ Sesión iniciada con éxito. UID: ${userId}\n`);

  // 2. Leer estado numérico inicial de profiles
  console.log('2. Comprobando métricas numéricas ANTES de cualquier acción...');
  const profBeforeRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=points_visitor,points_contributor,total_points`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` }
  });
  const profBeforeData = await profBeforeRes.json();
  results.initialProfile = profBeforeData[0] || null;
  console.log('   Métricas iniciales en profiles:');
  console.log(`   - points_visitor:     ${results.initialProfile?.points_visitor ?? 'N/A'}`);
  console.log(`   - points_contributor: ${results.initialProfile?.points_contributor ?? 'N/A'}`);
  console.log(`   - total_points:       ${results.initialProfile?.total_points ?? 'N/A'}\n`);

  // 3. Comprobar consulta anónima a gamification_badges (debe ser pública)
  console.log('3. Verificando lectura pública y anónima de gamification_badges...');
  const badgesAnonRes = await fetch(`${SUPABASE_URL}/rest/v1/gamification_badges?select=id,title,tier,category,points_bonus`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
  });
  results.anonGamificationBadgesRead = {
    status: badgesAnonRes.status,
    ok: badgesAnonRes.ok,
    data: await badgesAnonRes.json().catch(() => null)
  };
  console.log(`   Status HTTP anon gamification_badges: ${results.anonGamificationBadgesRead.status}`);
  if (results.anonGamificationBadgesRead.ok) {
    console.log(`   ✅ gamification_badges es legible por anónimos. Total insignias en catálogo: ${results.anonGamificationBadgesRead.data?.length}`);
    results.anonGamificationBadgesRead.data.forEach(b => {
      console.log(`      * [${b.tier.toUpperCase()}] ${b.title} (slug: ${b.id}, cat: ${b.category}, bonus: +${b.points_bonus})`);
    });
  } else {
    console.log(`   ⚠️ gamification_badges devolvió status ${results.anonGamificationBadgesRead.status} (pendiente de ejecutar DDL en Supabase SQL Editor).`);
  }
  console.log('');

  // 4. Comprobar consulta anónima a user_badges (debe ser pública)
  console.log('4. Verificando lectura pública y anónima de user_badges...');
  const userBadgesAnonRes = await fetch(`${SUPABASE_URL}/rest/v1/user_badges?select=id,user_id,badge_id,awarded_at`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
  });
  results.anonUserBadgesRead = {
    status: userBadgesAnonRes.status,
    ok: userBadgesAnonRes.ok,
    data: await userBadgesAnonRes.json().catch(() => null)
  };
  console.log(`   Status HTTP anon user_badges: ${results.anonUserBadgesRead.status}`);
  if (results.anonUserBadgesRead.ok) {
    console.log(`   ✅ user_badges es legible por anónimos. Total insignias de usuarios en sistema: ${results.anonUserBadgesRead.data?.length}`);
  } else {
    console.log(`   ⚠️ user_badges devolvió status ${results.anonUserBadgesRead.status} (pendiente de ejecutar DDL en Supabase SQL Editor).`);
  }
  console.log('');

  // 5. Comprobar que un INSERT anónimo a user_badges es RECHAZADO
  console.log('5. Verificando rechazo de INSERT anónimo directo en user_badges...');
  const anonInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/user_badges`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      user_id: userId,
      badge_id: 'urbanista-curioso'
    })
  });
  const anonInsertData = await anonInsertRes.json().catch(() => null);
  results.anonUserBadgesInsertRejected = {
    status: anonInsertRes.status,
    rejected: anonInsertRes.status === 401 || anonInsertRes.status === 403 || anonInsertRes.status === 404,
    body: anonInsertData
  };
  console.log(`   Status HTTP: ${anonInsertRes.status}`);
  console.log(`   Respuesta:`, anonInsertData);
  if (results.anonUserBadgesInsertRejected.rejected) {
    console.log('   ✅ RECHAZO CONFIRMADO: Los usuarios anónimos NO pueden insertar en user_badges.');
  } else {
    console.error('   ❌ FALLO DE SEGURIDAD: Inserción anónima permitida.');
  }
  console.log('');

  // 6. Comprobar que un INSERT autenticado directo de un usuario normal a user_badges es RECHAZADO por RLS
  console.log('6. Verificando rechazo de INSERT directo por cliente autenticado no-admin en user_badges...');
  const authInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/user_badges`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      user_id: userId,
      badge_id: 'urbanista-curioso'
    })
  });
  const authInsertData = await authInsertRes.json().catch(() => null);
  results.authUserBadgesDirectInsertRejected = {
    status: authInsertRes.status,
    rejected: authInsertRes.status === 401 || authInsertRes.status === 403 || authInsertRes.status === 404 || (authInsertData && authInsertData.code === '42501'),
    body: authInsertData
  };
  console.log(`   Status HTTP: ${authInsertRes.status}`);
  console.log(`   Respuesta:`, authInsertData);
  if (results.authUserBadgesDirectInsertRejected.rejected) {
    console.log('   ✅ RECHAZO CONFIRMADO: Los usuarios autenticados no-admin NO pueden autoasignarse insignias.');
  } else {
    console.error('   ❌ FALLO: Usuario no admin pudo autoasignarse una insignia directamente.');
  }
  console.log('');

  // 7. Registrar una visita de prueba y verificar incremento de puntos
  console.log('7. Registrando visita de prueba en building_visits para verificar trigger de puntos...');
  const testVisitPayload = {
    user_id: userId,
    building_id: SAMPLE_BUILDING_ID,
    notes: 'Visita de prueba verificación automatizada Fase 3',
    points_awarded: 10,
    visibility: 'public'
  };

  const visitRes = await fetch(`${SUPABASE_URL}/rest/v1/building_visits`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(testVisitPayload)
  });

  results.visitInsertStatus = visitRes.status;
  const visitData = await visitRes.json().catch(() => []);
  console.log(`   Status HTTP registro de visita: ${visitRes.status}`);
  console.log('   Fila creada en building_visits:', visitData);

  // 8. Comprobar métricas numéricas DESPUÉS de la visita
  console.log('\n8. Comprobando métricas numéricas DESPUÉS de la visita...');
  const profAfterRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=points_visitor,points_contributor,total_points`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` }
  });
  const profAfterData = await profAfterRes.json();
  results.afterProfile = profAfterData[0] || null;
  console.log('   Métricas resultantes en profiles:');
  console.log(`   - points_visitor:     ${results.initialProfile?.points_visitor ?? 0} -> ${results.afterProfile?.points_visitor ?? 'N/A'}`);
  console.log(`   - points_contributor: ${results.initialProfile?.points_contributor ?? 0} -> ${results.afterProfile?.points_contributor ?? 'N/A'}`);
  console.log(`   - total_points:       ${results.initialProfile?.total_points ?? 0} -> ${results.afterProfile?.total_points ?? 'N/A'}`);

  // 9. Comprobar insignias obtenidas
  console.log('\n9. Comprobando insignias obtenidas por el usuario en user_badges...');
  const userBadgesRes = await fetch(`${SUPABASE_URL}/rest/v1/user_badges?user_id=eq.${userId}&select=*`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` }
  });
  if (userBadgesRes.ok) {
    const badgesWon = await userBadgesRes.json();
    results.userBadgesAwarded = badgesWon;
    console.log(`   Total insignias adjudicadas al usuario: ${badgesWon.length}`);
    badgesWon.forEach(bw => {
      console.log(`   * Insignia: ${bw.badge_id} (Otorgada: ${bw.awarded_at}, Datos: ${JSON.stringify(bw.progress_data)})`);
    });
  } else {
    console.log(`   ⚠️ Consulta a user_badges devolvió status ${userBadgesRes.status}`);
  }

  // 10. Limpieza defensiva de la visita de test si se insertó
  if (Array.isArray(visitData) && visitData[0]?.id) {
    console.log(`\n10. Limpiando visita de prueba temporal (${visitData[0].id})...`);
    const delRes = await fetch(`${SUPABASE_URL}/rest/v1/building_visits?id=eq.${visitData[0].id}`, {
      method: 'DELETE',
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` }
    });
    console.log(`    Visita de prueba eliminada con status ${delRes.status}.`);
  }

  console.log('\n======================================================================');
  console.log('                       RESUMEN DE VERIFICACIÓN                         ');
  console.log('======================================================================');
  console.log(JSON.stringify({
    dbStatus: {
      gamification_badges_ready: results.anonGamificationBadgesRead.status === 200,
      user_badges_ready: results.anonUserBadgesRead.status === 200,
      building_visits_ready: results.visitInsertStatus === 201
    },
    metrics: {
      points_visitor_before: results.initialProfile?.points_visitor,
      points_visitor_after: results.afterProfile?.points_visitor,
      points_contributor_before: results.initialProfile?.points_contributor,
      points_contributor_after: results.afterProfile?.points_contributor,
      total_points_before: results.initialProfile?.total_points,
      total_points_after: results.afterProfile?.total_points
    },
    security: {
      anon_badges_read_public: results.anonGamificationBadgesRead.status === 200,
      anon_user_badges_insert_blocked: results.anonUserBadgesInsertRejected.rejected,
      auth_user_badges_direct_insert_blocked: results.authUserBadgesDirectInsertRejected.rejected
    },
    badgesAwarded: results.userBadgesAwarded
  }, null, 2));
}

runVerification().catch(err => {
  console.error('Error fatal en suite de verificación:', err);
});
