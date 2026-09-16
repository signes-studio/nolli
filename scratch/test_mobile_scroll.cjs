const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');

console.log('--- 1. Testing css/base.css Mobile Scroll Architecture ---');
const baseCss = fs.readFileSync(path.join(ROOT, 'css', 'base.css'), 'utf8');

assert(baseCss.includes('touch-action: pan-y'), 'base.css must allow vertical gestures with touch-action: pan-y');
assert(baseCss.includes('-webkit-overflow-scrolling: touch'), 'base.css must support iOS momentum scrolling');
assert(baseCss.includes('body.map-body'), 'base.css must define body.map-body for interactive map');
assert(baseCss.includes('body.portal-body'), 'base.css must define body.portal-body for portal pages');
assert(baseCss.includes('main.portal-shell'), 'base.css must exempt portal-shell from fixed positioning');

console.log('✓ css/base.css mobile scroll verified');

console.log('\n--- 2. Testing css/portal.css Mobile Scroll Architecture ---');
const portalCss = fs.readFileSync(path.join(ROOT, 'css', 'portal.css'), 'utf8');
assert(portalCss.includes('body.portal-body'), 'portal.css must include body.portal-body');
assert(portalCss.includes('touch-action: pan-y !important'), 'portal.css must enforce touch-action: pan-y !important');
assert(portalCss.includes('position: static !important'), 'portal.css must enforce position: static !important');
assert(portalCss.includes('-webkit-overflow-scrolling: touch !important'), 'portal.css must enforce momentum scrolling');

console.log('✓ css/portal.css mobile scroll verified');

console.log('\n--- 3. Testing HTML Page Classes for Scroll Isolation ---');
const pageBodyClasses = {
  'index.html': 'map-body',
  'ciudades.html': 'portal-body',
  'arquitectos.html': 'portal-body',
  'categorias.html': 'portal-body',
  'guia.html': 'portal-body',
  'manifiesto.html': 'portal-body',
  'colabora.html': 'portal-body',
  'landing.html': 'landing-page',
  'legal.html': 'legal-page',
  'itinerarios.html': 'admin-body',
  'admin.html': 'admin-body',
  'perfil.html': 'profile-body',
  'public-profile.html': 'profile-body',
  '404.html': 'scrollable-body',
};

for (const [file, requiredClass] of Object.entries(pageBodyClasses)) {
  const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const bodyMatch = content.match(/<body([^>]*)>/i);
  assert(bodyMatch, `${file} must contain a <body> tag`);
  const bodyAttrs = bodyMatch[1];
  assert(
    bodyAttrs.includes(requiredClass),
    `${file} body must contain class "${requiredClass}", got: ${bodyAttrs}`
  );
  console.log(`✓ ${file} has body class "${requiredClass}"`);
}

console.log('\n========================================');
console.log('ALL MOBILE SCROLL TESTS PASSED!');
console.log('========================================');
