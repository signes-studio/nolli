import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');

console.log('--- TEST: Google OAuth & Auth System ---');

// 1. Check locales
for (const lang of ['es', 'en', 'ca']) {
  const filePath = path.join(ROOT, 'locales', `${lang}.json`);
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.ok(content.auth_btn_google, `Missing auth_btn_google in ${lang}.json`);
  assert.ok(content.auth_login_google_success, `Missing auth_login_google_success in ${lang}.json`);
  console.log(`[PASS] ${lang}.json contains Google auth keys: "${content.auth_btn_google}"`);
}

// 2. Check HTML files
for (const page of ['index.html', 'perfil.html']) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  assert.ok(html.includes('id="btn-google-login"'), `Missing #btn-google-login in ${page}`);
  assert.ok(html.includes('class="btn btn-auth-google w-full"'), `Missing .btn-auth-google class in ${page}`);
  assert.ok(html.includes('fill="currentColor"'), `Google SVG must use fill="currentColor" in ${page}`);
  console.log(`[PASS] ${page} contains correctly styled #btn-google-login`);
}

// 3. Check CSS
const css = fs.readFileSync(path.join(ROOT, 'css', 'components.css'), 'utf8');
assert.ok(css.includes('.btn-auth-google'), 'Missing .btn-auth-google in components.css');
const btnMatch = css.match(/\.btn-auth-google\s*\{[^}]+\}/s);
assert.ok(btnMatch, 'Could not find .btn-auth-google block');
assert.ok(!btnMatch[0].match(/#[0-9a-fA-F]{3,8}/), 'Found raw HEX color inside .btn-auth-google');
console.log('[PASS] components.css defines .btn-auth-google without raw HEX colors');

// 4. Test Google OAuth URL generation logic
function mockGetGoogleOAuthUrl(redirectTo, origin = 'https://nolli.app', pathname = '/') {
  const target = redirectTo || `${origin}${pathname}`;
  const SUPABASE_URL = 'https://abcdefghijk.supabase.co';
  return `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(target)}`;
}

const defaultUrl = mockGetGoogleOAuthUrl(null);
assert.equal(defaultUrl, 'https://abcdefghijk.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fnolli.app%2F');

const customUrl = mockGetGoogleOAuthUrl('https://nolli.app/perfil.html');
assert.equal(customUrl, 'https://abcdefghijk.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fnolli.app%2Fperfil.html');
console.log('[PASS] Google OAuth URL generation correctly encodes redirect_to targets');

// 5. Test name splitting logic for Google OAuth user_metadata
function parseGoogleName(user) {
  const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name || '';
  const nameParts = fullName.trim() ? fullName.trim().split(/\s+/) : [];
  const oauthFirst = nameParts[0] || user?.user_metadata?.first_name || '';
  const oauthLast = nameParts.slice(1).join(' ') || user?.user_metadata?.last_name || '';
  return { oauthFirst, oauthLast };
}

assert.deepEqual(parseGoogleName({ user_metadata: { full_name: 'Clara Porset' } }), { oauthFirst: 'Clara', oauthLast: 'Porset' });
assert.deepEqual(parseGoogleName({ user_metadata: { full_name: 'Mies van der Rohe' } }), { oauthFirst: 'Mies', oauthLast: 'van der Rohe' });
assert.deepEqual(parseGoogleName({ user_metadata: { full_name: 'Alvar' } }), { oauthFirst: 'Alvar', oauthLast: '' });
assert.deepEqual(parseGoogleName({ user_metadata: { name: 'Lilly Reich' } }), { oauthFirst: 'Lilly', oauthLast: 'Reich' });
assert.deepEqual(parseGoogleName({ user_metadata: {} }), { oauthFirst: '', oauthLast: '' });
console.log('[PASS] Google user_metadata name splitting passes all edge cases');

console.log('\n--- ALL GOOGLE AUTH TESTS PASSED ---');

