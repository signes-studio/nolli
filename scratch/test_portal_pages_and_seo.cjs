const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');

console.log('--- 1. Testing Portal Pages Existence and HTML Syntax ---');
const portalPages = [
  'landing.html',
  'ciudades.html',
  'arquitectos.html',
  'categorias.html',
  'guia.html',
  'manifiesto.html',
  'colabora.html',
];

for (const page of portalPages) {
  const filePath = path.join(ROOT, page);
  assert(fs.existsSync(filePath), `Page ${page} must exist`);
  const content = fs.readFileSync(filePath, 'utf8');

  // Must have doctype, html, head, body
  assert(content.includes('<!DOCTYPE html>'), `${page} must have <!DOCTYPE html>`);
  assert(content.includes('<html lang="es">'), `${page} must have <html lang="es">`);
  assert(content.includes('</head>'), `${page} must close </head>`);
  assert(content.includes('</body>'), `${page} must close </body>`);

  // SEO Essentials
  assert(content.includes('<link rel="canonical"'), `${page} must have canonical tag`);
  assert(content.includes('<meta name="description"'), `${page} must have meta description`);
  assert(content.includes('<meta property="og:title"'), `${page} must have og:title`);
  assert(content.includes('<meta name="twitter:card"'), `${page} must have twitter:card`);
  assert(content.includes('<script type="application/ld+json">'), `${page} must have schema.org JSON-LD`);

  // Brand rules
  assert(content.includes('guía colectiva de arquitectura'), `${page} must include "guía colectiva de arquitectura"`);
  // Ensure lowercase tagline
  assert(!content.includes('GUÍA COLECTIVA DE ARQUITECTURA'), `${page} must NOT have uppercase GUÍA COLECTIVA DE ARQUITECTURA`);
  assert(!content.includes('Guía Colectiva de Arquitectura'), `${page} must NOT have capitalized Guía Colectiva de Arquitectura`);

  // Footer attribution
  assert(content.includes('SIGNES'), `${page} must include SIGNES in footer`);
  assert(content.includes('.STUDIO'), `${page} must include .STUDIO in footer`);
  assert(content.includes('brand-signes'), `${page} must use brand-signes`);
  assert(content.includes('brand-nolli'), `${page} must use brand-nolli`);

  // Navigation links check
  assert(content.includes('/ciudades'), `${page} must link to /ciudades`);
  assert(content.includes('/arquitectos'), `${page} must link to /arquitectos`);
  assert(content.includes('/categorias'), `${page} must link to /categorias`);
  assert(content.includes('/guia'), `${page} must link to /guia`);
  assert(content.includes('/manifiesto'), `${page} must link to /manifiesto`);
  assert(content.includes('/colabora'), `${page} must link to /colabora`);

  // Should NOT link to private admin /itinerarios
  assert(!content.includes('href="/itinerarios"'), `${page} must NOT link to /itinerarios`);

  console.log(`✓ ${page} verified`);
}

console.log('\n--- 2. Testing Shared Stylesheet css/portal.css ---');
const portalCssPath = path.join(ROOT, 'css', 'portal.css');
assert(fs.existsSync(portalCssPath), 'css/portal.css must exist');
const portalCss = fs.readFileSync(portalCssPath, 'utf8');
assert(portalCss.includes('.portal-header'), 'portal.css must have .portal-header');
assert(portalCss.includes('.portal-drawer'), 'portal.css must have .portal-drawer');
assert(portalCss.includes('.portal-card'), 'portal.css must have .portal-card');
assert(portalCss.includes('body.dark-mode'), 'portal.css must have dark mode tokens');
console.log('✓ css/portal.css verified');

console.log('\n--- 3. Testing js/portalNav.js ---');
const portalJsPath = path.join(ROOT, 'js', 'portalNav.js');
assert(fs.existsSync(portalJsPath), 'js/portalNav.js must exist');
const portalJs = fs.readFileSync(portalJsPath, 'utf8');
assert(portalJs.includes('openDrawer'), 'portalNav.js must implement openDrawer');
assert(portalJs.includes('closeDrawer'), 'portalNav.js must implement closeDrawer');
assert(portalJs.includes('filterCards'), 'portalNav.js must implement filterCards');
console.log('✓ js/portalNav.js verified');

console.log('\n--- 4. Testing vercel.json routing for portal pages ---');
const vercelJsonPath = path.join(ROOT, 'vercel.json');
const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
const requiredRoutes = ['ciudades', 'arquitectos', 'categorias', 'guia', 'manifiesto', 'colabora'];
for (const r of requiredRoutes) {
  const hasEn = vercelJson.rewrites.some((rw) => rw.source === `/en/${r}` && rw.destination === `/${r}`);
  const hasCa = vercelJson.rewrites.some((rw) => rw.source === `/ca/${r}` && rw.destination === `/${r}`);
  assert(hasEn, `vercel.json must have rewrite for /en/${r}`);
  assert(hasCa, `vercel.json must have rewrite for /ca/${r}`);
}
console.log('✓ vercel.json rewrites for all 6 portal pages verified');

console.log('\n--- 5. Testing api/sitemap.js for static portal pages ---');
const sitemapHandler = require('../api/sitemap.js');
const mockReq = { query: { type: 'static' }, headers: {} };
let responseStatus = 0;
let responseHeaders = {};
let responseBody = '';

const mockRes = {
  status(s) {
    responseStatus = s;
    return this;
  },
  setHeader(k, v) {
    responseHeaders[k] = v;
    return this;
  },
  send(body) {
    responseBody = body;
    return this;
  },
};

(async () => {
  await sitemapHandler(mockReq, mockRes);
  assert.strictEqual(responseStatus, 200, 'Static sitemap must return 200');
  assert(responseBody.includes('<loc>https://nollimap.app/landing</loc>'), 'Sitemap must contain /landing');
  for (const r of requiredRoutes) {
    assert(responseBody.includes(`<loc>https://nollimap.app/${r}</loc>`), `Sitemap must contain /${r}`);
  }
  console.log('✓ sitemap-static.xml verified with all 6 portal pages');

  console.log('\n========================================');
  console.log('ALL PORTAL & SEO TESTS PASSED SUCCESSFULLY!');
  console.log('========================================\n');
})();
