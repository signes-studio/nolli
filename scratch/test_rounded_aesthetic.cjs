/**
 * scratch/test_rounded_aesthetic.cjs
 * Verification test to ensure:
 * - Complete absence of 90-degree corners (border-radius: 0) and hard shadows (shadow-hard, 4px 4px 0, 2px 2px 0)
 *   in all portal, landing, and 404 pages.
 * - Conformance to the new web aesthetic (rounded tokens, soft shadows, warm hover glow, pill badges).
 * - Splash screen redesign conformity.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- 1. Testing Portal & Content Pages for Hard Shadows and 90-degree Corners ---');

const portalPages = [
  'landing.html',
  'ciudades.html',
  'arquitectos.html',
  'categorias.html',
  'guia.html',
  'manifiesto.html',
  'colabora.html',
  '404.html'
];

portalPages.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  assert(fs.existsSync(filePath), `${file} should exist`);
  const content = fs.readFileSync(filePath, 'utf8');

  // Assert no border-radius: 0
  assert(!/border-radius:\s*0(?:\s*!important)?/i.test(content), `${file} must not have border-radius: 0`);
  
  // Assert no hard straight shadows
  assert(!content.includes('--shadow-hard'), `${file} must not reference --shadow-hard`);
  assert(!/(?:2px|4px)\s+(?:2px|4px)\s+0/i.test(content), `${file} must not have straight hard shadows`);

  // Assert no copy mentioning neo-bauhaus in customer-facing text
  assert(!/neo-bauhaus/i.test(content), `${file} must not mention Neo-Bauhaus in copy`);

  console.log(`✓ ${file} verified: 0 hard shadows, 0 square overrides`);
});

console.log('\n--- 2. Testing Shared Stylesheet css/portal.css ---');
const portalCssPath = path.join(__dirname, '..', 'css', 'portal.css');
assert(fs.existsSync(portalCssPath), 'css/portal.css should exist');
const portalCss = fs.readFileSync(portalCssPath, 'utf8');

assert(portalCss.includes('--radius-sm: 6px;'), 'css/portal.css must define --radius-sm: 6px;');
assert(portalCss.includes('--radius-md: 10px;'), 'css/portal.css must define --radius-md: 10px;');
assert(portalCss.includes('--radius-lg: 14px;') || portalCss.includes('--radius-lg: 16px;'), 'css/portal.css must define --radius-lg');
assert(portalCss.includes('--radius-pill: 9999px;'), 'css/portal.css must define --radius-pill');
assert(portalCss.includes('--shadow-sm:'), 'css/portal.css must define --shadow-sm');
assert(portalCss.includes('--shadow-md:'), 'css/portal.css must define --shadow-md');
assert(portalCss.includes('--shadow-accent:'), 'css/portal.css must define --shadow-accent');

// Check that buttons use border-radius
assert(portalCss.includes('.portal-btn-primary'), 'css/portal.css must have .portal-btn-primary');
assert(!/border-radius:\s*0\s*!important/i.test(portalCss), 'css/portal.css must not have border-radius: 0 overrides');
console.log('✓ css/portal.css verified: modern rounded tokens and elevation shadows present');

console.log('\n--- 3. Testing Mobile Splash Screen in css/map-hud.css ---');
const mapHudCssPath = path.join(__dirname, '..', 'css', 'map-hud.css');
assert(fs.existsSync(mapHudCssPath), 'css/map-hud.css should exist');
const mapHudCss = fs.readFileSync(mapHudCssPath, 'utf8');

assert(!/mobile-splash-card[^{]*\{[^}]*border-radius:\s*0/i.test(mapHudCss), 'mobile-splash-card must not have border-radius: 0');
assert(!/mobile-splash-card[^{]*\{[^}]*4px\s+4px\s+0/i.test(mapHudCss), 'mobile-splash-card must not have 4px 4px 0 hard shadow');
assert(mapHudCss.includes('border-radius: 20px;') || mapHudCss.includes('border-radius: 16px;'), 'mobile-splash-card must have rounded 20px radius');
assert(!mapHudCss.includes('.mobile-splash-corner'), 'mobile-splash-corner must be removed from map-hud.css');
console.log('✓ css/map-hud.css verified: mobile splash screen has rounded card, soft elevation, and no corner brackets');

console.log('\n========================================');
console.log('ALL ROUNDED AESTHETIC VERIFICATIONS PASSED!');
console.log('========================================');

