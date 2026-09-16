import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assert = require('assert');
const fs = require('fs');

function createMockRes() {
  const headers = {};
  return {
    statusCode: 200,
    headers,
    body: null,
    setHeader(key, val) {
      headers[key.toLowerCase()] = val;
      headers[key] = val;
    },
    getHeader(key) {
      return headers[key.toLowerCase()] || headers[key];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(content) {
      this.body = content;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    end() {
      return this;
    }
  };
}

async function testAll() {
  console.log('--- 1. Testing vercel.json rewrite ---');
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
  const buildingRewrite = vercelConfig.rewrites.find(r => r.source === '/sitemap-buildings-:n.xml');
  assert(buildingRewrite, 'Rewrite for /sitemap-buildings-:n.xml must exist');
  assert(buildingRewrite.destination === '/api/sitemap?type=buildings&page=:n', `Destination must pass page=:n, got ${buildingRewrite.destination}`);
  console.log('✓ vercel.json rewrite verified:', buildingRewrite);

  console.log('\n--- 2. Testing sitemap.xsl syntax and design tokens ---');
  const xslContent = fs.readFileSync(path.join(__dirname, '../sitemap.xsl'), 'utf8');
  assert(!xslContent.includes('border-radius: 0 !important'), 'Brutalist 0 border-radius must be removed from sitemap.xsl');
  assert(xslContent.includes('border-radius: 12px'), 'sitemap.xsl must contain border-radius: 12px');
  assert(xslContent.includes('@media (prefers-color-scheme: dark)'), 'sitemap.xsl must support dark mode');
  console.log('✓ sitemap.xsl tokens verified');

  console.log('\n--- 3. Testing api/obra.js ---');
  const obraHandler = require('../api/obra.js');
  const obra404Res = createMockRes();
  await obraHandler({ query: { id: 'nonexistent-xyz-999' }, headers: {} }, obra404Res);
  assert.strictEqual(obra404Res.statusCode, 404, 'Non-existent building should return 404');
  assert(obra404Res.getHeader('x-robots-tag').includes('index, follow'), 'Spanish 404 / default should have proper header');
  assert(obra404Res.body.includes('not-found-card'), '404 page should use modern not-found-card');
  assert(obra404Res.body.includes('border-radius: var(--radius-md)'), '404 page should have rounded corners');
  assert(obra404Res.body.includes('@media (prefers-color-scheme: dark)'), '404 page should support dark mode');
  console.log('✓ api/obra.js 404 page and headers verified');

  console.log('\n--- 3b. Testing api/obra.js 200 render with mock building ---');
  const originalFetchObra = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => [{
      id: 'mad-01',
      nombre_obra: 'Torres Blancas',
      arquitecto: 'Francisco Javier Sáenz de Oíza',
      año_construccion: 1968,
      categoria: 'residencial',
      place: 'Madrid, España',
      foto_url: 'https://images.unsplash.com/photo-example',
      foto_credito: 'Wikimedia Commons',
      foto_licencia: 'CC BY-SA 4.0',
      enlace_url: 'https://es.wikipedia.org/wiki/Torres_Blancas',
      latitud: 40.439,
      longitud: -3.672,
      estado_revision: 'publicada',
    }],
  });
  const obra200Res = createMockRes();
  await obraHandler({ query: { id: 'mad-01' }, headers: {} }, obra200Res);
  global.fetch = originalFetchObra;
  assert.strictEqual(obra200Res.statusCode, 200);
  assert(obra200Res.getHeader('x-robots-tag').includes('index, follow'), 'Spanish 200 should have index, follow');
  assert(obra200Res.body.includes('content="index, follow"'), 'meta robots must be index, follow');
  assert(obra200Res.body.includes('Torres Blancas'), 'Page must render building name');
  assert(obra200Res.body.includes('Francisco Javier Sáenz de Oíza'), 'Page must render architect');
  assert(obra200Res.body.includes('work-card'), 'Page must render work-card');
  assert(obra200Res.body.includes('tech-card'), 'Page must render tech-card');
  assert(obra200Res.body.includes('btn-primary-map'), 'Page must render btn-primary-map');
  assert(obra200Res.body.includes('border-radius: var(--radius-lg)'), 'Page must have rounded corners');
  assert(obra200Res.body.includes('@media (prefers-color-scheme: dark)'), 'Page must have dark mode CSS');
  assert(obra200Res.body.includes('https://schema.org'), 'Page must contain structured schema');
  console.log('✓ api/obra.js 200 page render verified');

  console.log('\n--- 4. Testing api/sitemap.js ---');
  const sitemapHandler = require('../api/sitemap.js');
  const sitemapIndexRes = createMockRes();
  await sitemapHandler({ query: { type: 'index' }, headers: {} }, sitemapIndexRes);
  assert.strictEqual(sitemapIndexRes.statusCode, 200);
  assert(sitemapIndexRes.getHeader('content-type').includes('application/xml'));
  assert(sitemapIndexRes.body.includes('<sitemapindex'), 'Index sitemap must be sitemapindex');
  assert(sitemapIndexRes.body.includes('/sitemap-static.xml'), 'Index must include static');
  assert(sitemapIndexRes.body.includes('/sitemap-categories.xml'), 'Index must include categories');
  assert(sitemapIndexRes.body.includes('/sitemap-architects.xml'), 'Index must include architects');
  assert(sitemapIndexRes.body.includes('/sitemap-cities.xml'), 'Index must include cities');
  console.log('✓ api/sitemap.js index verified');

  console.log('\n--- 4b. Testing api/sitemap.js buildings chunk with mock fetch ---');
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    return {
      ok: true,
      status: 200,
      json: async () => [
        { id: 'mad-01', updated_at: '2026-09-01T10:00:00Z' },
        { id: 'bcn-02', updated_at: '2026-09-02T12:00:00Z' },
      ],
    };
  };
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-for-testing-purposes-only-123456';
  const sitemapBuildingsRes = createMockRes();
  await sitemapHandler({ query: { type: 'buildings', page: '0' }, headers: {} }, sitemapBuildingsRes);
  global.fetch = originalFetch;
  assert.strictEqual(sitemapBuildingsRes.statusCode, 200);
  assert(sitemapBuildingsRes.getHeader('content-type').includes('application/xml'));
  assert(sitemapBuildingsRes.getHeader('cache-control').includes('s-maxage=86400'));
  assert(sitemapBuildingsRes.getHeader('vercel-cache-tag').includes('sitemap-buildings-0'));
  assert(sitemapBuildingsRes.body.includes('<urlset'), 'Must return urlset');
  assert(sitemapBuildingsRes.body.includes('/obra/mad-01'), 'Must contain building 1');
  assert(sitemapBuildingsRes.body.includes('/obra/bcn-02'), 'Must contain building 2');
  console.log('✓ api/sitemap.js buildings chunk verified');

  console.log('\n--- 5. Testing api/categoria.js and api/arquitecto.js and api/ciudad.js CSS ---');
  const catCode = fs.readFileSync(path.join(__dirname, '../api/categoria.js'), 'utf8');
  assert(catCode.includes('border-radius: var(--radius-md)'), 'api/categoria.js should use rounded cards');
  assert(catCode.includes('@media (prefers-color-scheme: dark)'), 'api/categoria.js should support dark mode');

  const archCode = fs.readFileSync(path.join(__dirname, '../api/arquitecto.js'), 'utf8');
  assert(archCode.includes('border-radius: var(--radius-md)'), 'api/arquitecto.js should use rounded cards');
  assert(archCode.includes('@media (prefers-color-scheme: dark)'), 'api/arquitecto.js should support dark mode');

  const ciudadCode = fs.readFileSync(path.join(__dirname, '../api/ciudad.js'), 'utf8');
  assert(ciudadCode.includes('border-radius: var(--radius-md)'), 'api/ciudad.js should use rounded cards');
  assert(ciudadCode.includes('@media (prefers-color-scheme: dark)'), 'api/ciudad.js should support dark mode');
  console.log('✓ All category/architect/city hubs have rounded cards and dark mode');

  console.log('\n--- 6. Testing architect title and brand name across i18n ---');
  const i18n = require('../api/_lib/i18n.js');
  ['es', 'en', 'ca'].forEach((lang) => {
    const archTitle = i18n.getSSRText('architect_title', lang, { nombre: 'Antoni Gaudí' });
    assert(archTitle.includes('nolli.'), `Architect title in ${lang} must include 'nolli.': ${archTitle}`);
    assert(!archTitle.includes('Nolli'), `Architect title in ${lang} must NOT include uppercase 'Nolli': ${archTitle}`);

    const archDesc = i18n.getSSRText('architect_desc', lang, { nombre: 'Antoni Gaudí', count: 15 });
    assert(archDesc.includes('nolli.'), `Architect description in ${lang} must include 'nolli.': ${archDesc}`);
    assert(!archDesc.includes('Nolli'), `Architect description in ${lang} must NOT include uppercase 'Nolli': ${archDesc}`);
  });
  console.log('✓ All architect titles and descriptions use nolli. with no uppercase Nolli');

  console.log('\n--- 7. Testing multi-architect linking in api/obra.js ---');
  const multiObraFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => [{
      id: 'multi-01',
      nombre_obra: 'Edificio España',
      arquitecto: 'Joaquín Otamendi, Julián Otamendi, Desconocido',
      año_construccion: 1953,
      categoria: 'residencial',
      place: 'Madrid, España',
      foto_url: '',
      estado_revision: 'publicada',
    }],
  });
  const multiObraRes = createMockRes();
  await obraHandler({ query: { id: 'multi-01' }, headers: {} }, multiObraRes);
  global.fetch = multiObraFetch;
  assert.strictEqual(multiObraRes.statusCode, 200);
  assert(multiObraRes.body.includes('/arquitecto/joaquin-otamendi'), 'Should link joaquin-otamendi with slug');
  assert(multiObraRes.body.includes('/arquitecto/julian-otamendi'), 'Should link julian-otamendi with slug');
  assert(!multiObraRes.body.includes('/arquitecto/desconocido'), 'Should NOT link desconocido');
  console.log('✓ Multi-architect linking and ignored architect filtering verified');

  console.log('\n--- 8. Testing api/arquitecto.js 301 redirects and 404 noindex ---');
  const arquitectoHandler = require('../api/arquitecto.js');
  
  // Test 8a: Alias redirect (javier-goerlich-lleo -> francisco-javier-goerlich)
  const aliasRes = createMockRes();
  await arquitectoHandler({ query: { slug: 'javier-goerlich-lleo' }, headers: {} }, aliasRes);
  assert.strictEqual(aliasRes.statusCode, 301, 'javier-goerlich-lleo must return 301 redirect');
  assert(aliasRes.getHeader('location').includes('/arquitecto/francisco-javier-goerlich'), `Target must be canonical slug, got: ${aliasRes.getHeader('location')}`);
  console.log('✓ javier-goerlich-lleo -> francisco-javier-goerlich 301 redirect verified');

  // Test 8b: Ignored architect (desconocido) -> 404 + noindex
  const ignoredRes = createMockRes();
  await arquitectoHandler({ query: { slug: 'desconocido' }, headers: {} }, ignoredRes);
  assert.strictEqual(ignoredRes.statusCode, 404, 'desconocido must return 404');
  assert(ignoredRes.getHeader('x-robots-tag').includes('noindex'), '404 must have noindex');
  console.log('✓ desconocido architect -> 404 noindex verified');

  // Test 8c: Non-existent architect (0 works in DB) -> 404 + noindex
  const originalFetchArch = global.fetch;
  global.fetch = async (url) => {
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-range': '0-0/0' }),
      json: async () => [],
    };
  };
  const nonexistentArchRes = createMockRes();
  await arquitectoHandler({ query: { slug: 'arquitecto-inventado-inexistente' }, headers: {} }, nonexistentArchRes);
  global.fetch = originalFetchArch;
  assert.strictEqual(nonexistentArchRes.statusCode, 404, 'Architect with 0 works must return 404');
  assert(nonexistentArchRes.getHeader('x-robots-tag').includes('noindex'), '404 must have noindex');
  assert(nonexistentArchRes.body.includes('not-found-card'), 'Must render soft 404 UI');
  console.log('✓ Non-existent architect -> 404 noindex verified');

  console.log('\n--- 9. Testing api/ciudad.js 404 noindex on 0 works ---');
  const ciudadHandler = require('../api/ciudad.js');
  const originalFetchCity = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-range': '0-0/0' }),
    json: async () => [],
  });
  const nonexistentCityRes = createMockRes();
  await ciudadHandler({ query: { slug: 'ciudad-inventada-999' }, headers: {} }, nonexistentCityRes);
  global.fetch = originalFetchCity;
  assert.strictEqual(nonexistentCityRes.statusCode, 404, 'City with 0 works must return 404');
  assert(nonexistentCityRes.getHeader('x-robots-tag').includes('noindex'), '404 must have noindex');
  console.log('✓ Non-existent city -> 404 noindex verified');

  console.log('\n--- 10. Testing api/categoria.js 404 noindex on invalid / 0 works ---');
  const categoriaHandler = require('../api/categoria.js');
  const invalidCatRes = createMockRes();
  await categoriaHandler({ query: { slug: 'categoria-inexistente' }, headers: {} }, invalidCatRes);
  assert.strictEqual(invalidCatRes.statusCode, 404, 'Invalid category must return 404');
  assert(invalidCatRes.getHeader('x-robots-tag').includes('noindex'), '404 must have noindex');
  console.log('✓ Invalid category -> 404 noindex verified');

  console.log('\n========================================');
  console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
  console.log('========================================');
}

testAll().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
