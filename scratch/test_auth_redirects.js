import assert from 'node:assert';
import fs from 'node:fs';

console.log('=== TEST 1: Verificación de Claves de Traducción i18n ===');
const es = JSON.parse(fs.readFileSync('locales/es.json', 'utf8'));
const en = JSON.parse(fs.readFileSync('locales/en.json', 'utf8'));
const ca = JSON.parse(fs.readFileSync('locales/ca.json', 'utf8'));

const requiredKeys = [
  'auth_new_password_title',
  'auth_new_password_desc',
  'auth_label_new_password',
  'auth_label_confirm_password',
  'auth_btn_save_new_password',
  'auth_password_match_err',
  'auth_password_len_err',
  'auth_password_success',
  'auth_btn_magic_link',
  'auth_magic_link_sent',
  'auth_magic_link_success',
  'auth_signup_confirmed',
  'auth_invite_accepted',
  'auth_otp_title',
  'auth_otp_desc',
  'auth_label_otp',
  'auth_btn_verify_otp',
  'auth_otp_success',
  'profile_edit_email_label',
  'profile_btn_change_email',
  'profile_email_hint',
  'profile_email_sent_notice',
  'profile_email_updated_success',
  'admin_btn_invite_user',
  'admin_invite_user_title',
  'admin_invite_user_desc',
  'admin_invite_user_ph',
  'admin_invite_send_btn',
  'admin_invite_success'
];

for (const key of requiredKeys) {
  assert.ok(es[key], `Clave faltante en es.json: ${key}`);
  assert.ok(en[key], `Clave faltante en en.json: ${key}`);
  assert.ok(ca[key], `Clave faltante en ca.json: ${key}`);
}
console.log(`✓ Todas las ${requiredKeys.length} claves nuevas existen en es.json, en.json y ca.json.`);

console.log('\n=== TEST 2: Comprobación de Exportaciones en js/api.js ===');
import * as api from '../js/api.js';

assert.strictEqual(typeof api.updateUserPassword, 'function', 'updateUserPassword debe ser una función');
assert.strictEqual(typeof api.sendMagicLink, 'function', 'sendMagicLink debe ser una función');
assert.strictEqual(typeof api.updateUserEmail, 'function', 'updateUserEmail debe ser una función');
assert.strictEqual(typeof api.inviteUserByEmail, 'function', 'inviteUserByEmail debe ser una función');
assert.strictEqual(typeof api.verifyOtpToken, 'function', 'verifyOtpToken debe ser una función');
console.log('✓ Las 5 funciones exportadas en js/api.js son válidas y están disponibles.');

console.log('\n=== TEST 3: Simulación de Lógica de Detección de Redirecciones ===');

function parseAuthRedirectSimulator(hashStr, searchStr) {
  let hash = hashStr || '';
  let search = searchStr || '';
  let hashParams = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : hash);
  let searchParams = new URLSearchParams(search.startsWith('?') ? search.substring(1) : search);

  const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');
  const authType = hashParams.get('type') || searchParams.get('type');
  const errorCode = hashParams.get('error') || searchParams.get('error');
  const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');

  return { accessToken, refreshToken, authType, errorCode, errorDesc };
}

// 1. Caso Signup
const signupCase = parseAuthRedirectSimulator('#access_token=token_signup_123&refresh_token=refresh_123&type=signup', '');
assert.strictEqual(signupCase.accessToken, 'token_signup_123');
assert.strictEqual(signupCase.authType, 'signup');

// 2. Caso Recovery
const recoveryCase = parseAuthRedirectSimulator('#access_token=token_recovery_456&type=recovery', '');
assert.strictEqual(recoveryCase.accessToken, 'token_recovery_456');
assert.strictEqual(recoveryCase.authType, 'recovery');

// 3. Caso Magic Link
const magicCase = parseAuthRedirectSimulator('#access_token=token_magic_789&type=magiclink', '');
assert.strictEqual(magicCase.accessToken, 'token_magic_789');
assert.strictEqual(magicCase.authType, 'magiclink');

// 4. Caso Invite
const inviteCase = parseAuthRedirectSimulator('#access_token=token_invite_abc&type=invite', '');
assert.strictEqual(inviteCase.accessToken, 'token_invite_abc');
assert.strictEqual(inviteCase.authType, 'invite');

// 5. Caso Error
const errorCase = parseAuthRedirectSimulator('#error=access_denied&error_description=Email+link+is+invalid+or+has+expired', '');
assert.strictEqual(errorCase.errorCode, 'access_denied');
assert.strictEqual(errorCase.errorDesc, 'Email link is invalid or has expired');

console.log('✓ Lógica de parser simula correctamente los 5 escenarios de URL de Supabase.');

console.log('\n=== TEST 4: Verificación de Presencia de Elementos en index.html y perfil.html ===');
const indexHtml = fs.readFileSync('index.html', 'utf8');
const perfilHtml = fs.readFileSync('perfil.html', 'utf8');

assert.ok(indexHtml.includes('id="modal-new-password"'), 'index.html debe contener #modal-new-password');
assert.ok(indexHtml.includes('id="modal-verify-otp"'), 'index.html debe contener #modal-verify-otp');
assert.ok(indexHtml.includes('id="btn-request-magic-link"'), 'index.html debe contener #btn-request-magic-link');
assert.ok(indexHtml.includes('id="btn-admin-invite-user"'), 'index.html debe contener #btn-admin-invite-user');

assert.ok(perfilHtml.includes('id="modal-new-password"'), 'perfil.html debe contener #modal-new-password');
assert.ok(perfilHtml.includes('id="modal-verify-otp"'), 'perfil.html debe contener #modal-verify-otp');
assert.ok(perfilHtml.includes('id="btn-request-magic-link"'), 'perfil.html debe contener #btn-request-magic-link');
assert.ok(perfilHtml.includes('id="btn-change-email"'), 'perfil.html debe contener #btn-change-email');

console.log('✓ Todos los elementos HTML requeridos están presentes en index.html y perfil.html.');

console.log('\n========================================');
console.log('🎉 TODOS LOS TESTS DE AUTENTICACIÓN PASARON');
console.log('========================================');
