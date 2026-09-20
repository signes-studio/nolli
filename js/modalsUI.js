/* =========================================================================
   MODALSUI.JS — Modal de login de administrador y modal de alta de edificio
   ========================================================================= */

import { state, separarArquitectos, normalizarCategoria, esRolAdmin, esRolEditor } from './state.js';
import { loginAdmin, registerUser, refreshUserSession, requestPasswordReset, updateUserPassword, sendMagicLink, updateUserEmail, verifyOtpToken, fetchUserRole, fetchCurrentUser, fetchCurrentProfile, fetchBuildingStatuses, upsertCurrentProfile, createBuildingReport, createBuilding, createPrivateBuilding, updateBuilding, updateUserPresence, invalidateCatalogCache, signInWithGoogle, uploadGenericPhotoWithR2 } from './api.js';
import { actualizarFuenteMapa } from './mapData.js';
import { generarFiltrosUI } from './filtersUI.js';
import { showNeoToast } from './renderUtils.js';
import { t } from './i18n.js';

const ADMIN_SESSION_KEY = 'nolli_admin_session_token';
let presenceTimer = null;

function clearSessionAndUserCaches() {
  [
    'nolli_admin_session_token',
    'nolli_cached_user',
    'nolli_cached_db_profile',
    'nolli_cached_statuses',
    'nolli_cached_collections',
    'nolli_cached_labels',
    'nolli_cached_buildings',
  ].forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });

  state.sessionToken = null;
  state.userRole = null;
  state.adminMode = false;
  state.userId = null;
  state.userEmail = null;
  state.userProfile = null;
  state.buildingStatuses = new Map();
  state.userCollections = [];
  state.userCollectionItems = [];
  state.userFollowedCollections = [];
  state.userPrivateLabels = [];
  state.privateBuildings = [];
}

let userInteractedSinceLastPresence = true;
if (typeof window !== 'undefined') {
  const markActive = () => { userInteractedSinceLastPresence = true; };
  window.addEventListener('pointerdown', markActive, { passive: true });
  window.addEventListener('keydown', markActive, { passive: true });
}

function iniciarLatidoPresencia() {
  if (presenceTimer) clearInterval(presenceTimer);
  if (state.sessionToken) {
    updateUserPresence(state.sessionToken, state.userId);
    userInteractedSinceLastPresence = false;
    presenceTimer = setInterval(() => {
      if (!state.sessionToken) {
        clearInterval(presenceTimer);
        return;
      }
      if (document.hidden || !userInteractedSinceLastPresence) return; // Ahorro de egress: no emitir si la pestaña está oculta o si el usuario no ha interactuado
      userInteractedSinceLastPresence = false;
      updateUserPresence(state.sessionToken, state.userId);
    }, 25 * 60 * 1000);
  }
}

function generarIdAlfanumerico(longitud = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(longitud);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => chars[b % chars.length]).join('');
  }
  let resultado = '';
  for (let i = 0; i < longitud; i++) {
    resultado += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return resultado;
}

/* -------------------------------------------------------------------------
   MÓDULO DE LOGIN
   ------------------------------------------------------------------------- */
async function initLoginModal() {
  const mLogin = document.getElementById('modal-login');
  const bLoginT = document.getElementById('btn-login-trigger');
  const title = document.getElementById('modal-login-title');
  const actionButton = document.getElementById('btn-do-login');
  const loginForm = document.getElementById('login-form');
  const registerButton = document.getElementById('btn-register-mode');
  const logoutButton = document.getElementById('btn-logout');
  const adminModeControl = document.getElementById('admin-mode-control');
  const adminModeToggle = document.getElementById('admin-mode-toggle');
  const registerOnlyFields = document.querySelectorAll('.register-only-field');
  const loginEntryFields = document.querySelectorAll('.login-entry-field');
  const keepSession = document.getElementById('keep-session');
  const forgotPasswordButton = document.getElementById('btn-forgot-password');
  const passwordInput = document.getElementById('login-password');
  const togglePassword = document.getElementById('toggle-password');
  const btnGuestLogin = document.getElementById('btn-guest-login');
  const btnGoogleLogin = document.getElementById('btn-google-login');
  const guestBlock = document.querySelector('.guest-login-block');
  let registerMode = false;

  const marcarSesionIniciada = (role) => {
    const canUseAdminTools = esRolAdmin(role);
    state.adminMode = canUseAdminTools;
    if (adminModeControl) adminModeControl.classList.toggle('hidden', !canUseAdminTools);
    if (adminModeToggle) adminModeToggle.checked = state.adminMode;

    const adminButtons = [
      document.getElementById('btn-admin-panel'),
      document.getElementById('btn-float-admin'),
      document.getElementById('btn-mobile-admin'),
      document.getElementById('btn-admin-float'),
    ].filter(Boolean);
    adminButtons.forEach((btn) => btn.classList.toggle('hidden', !canUseAdminTools));

    bLoginT.textContent = canUseAdminTools ? t('nav_admin_unlocked') : (role === 'editor' ? 'EDITOR' : t('nav_session_active'));
    bLoginT.style.color = 'var(--accent-2)';
    bLoginT.style.borderColor = 'var(--accent-2)';
    bLoginT.style.background = 'rgba(246, 166, 0, 0.12)';

    const mobileBadge = document.getElementById('mobile-identity-badge');
    if (mobileBadge) {
      mobileBadge.textContent = canUseAdminTools ? t('nav_admin') : (role === 'editor' ? 'EDITOR' : t('nav_session'));
    }

    logoutButton.classList.remove('hidden');
    loginEntryFields.forEach((field) => field.classList.add('hidden'));
    iniciarLatidoPresencia();
    if (canUseAdminTools) document.dispatchEvent(new CustomEvent('radar:admin-login'));
    else document.dispatchEvent(new CustomEvent('radar:user-login'));
  };

  adminModeToggle.addEventListener('change', () => {
    if (!esRolAdmin(state.userRole)) return;
    state.adminMode = adminModeToggle.checked;
    document.dispatchEvent(new CustomEvent('radar:admin-mode-change'));
  });

  const cargarEstadoUsuario = async () => {
    const user = await fetchCurrentUser(state.sessionToken);
    state.userId = user.id;
    state.userEmail = user.email || null;
    const dbProfile = await fetchCurrentProfile(user.id, state.sessionToken).catch(() => null);

    const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
    const nameParts = fullName.trim() ? fullName.trim().split(/\s+/) : [];
    const oauthFirst = nameParts[0] || '';
    const oauthLast = nameParts.slice(1).join(' ') || '';

    state.userProfile = {
      firstName: dbProfile?.first_name || user.user_metadata?.first_name || oauthFirst || '',
      lastName: dbProfile?.last_name || user.user_metadata?.last_name || oauthLast || '',
      bio: dbProfile?.bio != null ? dbProfile.bio : (user.user_metadata?.bio || ''),
      city: dbProfile?.city || user.user_metadata?.city || '',
      country: dbProfile?.country || user.user_metadata?.country || '',
      website: dbProfile?.website != null ? dbProfile.website : (user.user_metadata?.website || ''),
    };
    upsertCurrentProfile(user, state.userProfile, state.sessionToken).catch(() => {});
    const statuses = await fetchBuildingStatuses(user.id, state.sessionToken);
    state.buildingStatuses = new Map(statuses.map((item) => [String(item.building_id), {
      favorite: item.favorite === true,
      visited: item.visited === true,
      notas: item.notas || '',
      valoracion: item.valoracion || null,
    }]));
    try {
      localStorage.setItem(`nolli:building-status:${user.id}`, JSON.stringify([...state.buildingStatuses.entries()]));
    } catch {}
    document.dispatchEvent(new CustomEvent('radar:user-status-ready'));
    document.dispatchEvent(new CustomEvent('radar:user-session-ready'));
    return user;
  };

  const checkIncomingAuthRedirect = async () => {
    let hash = window.location.hash;
    let search = window.location.search;
    if (!hash && !search) return false;

    let hashParams = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : hash);
    let searchParams = new URLSearchParams(search.startsWith('?') ? search.substring(1) : search);

    const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');
    const authType = hashParams.get('type') || searchParams.get('type');
    const errorCode = hashParams.get('error') || searchParams.get('error');
    const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');
    const isGoogleAuth = authType === 'google' || Boolean(hashParams.get('provider_token') || searchParams.get('provider_token'));

    if (errorCode || errorDesc) {
      try { history.replaceState(null, '', window.location.pathname); } catch {}
      const cleanMsg = decodeURIComponent((errorDesc || errorCode).replace(/\+/g, ' '));
      showNeoToast(cleanMsg, { type: 'alert', duration: 6000 });
      return false;
    }

    if (!accessToken) return false;

    try { history.replaceState(null, '', window.location.pathname); } catch {}

    const sessionData = { access_token: accessToken, refresh_token: refreshToken || '' };
    try {
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(sessionData));
    } catch {}
    state.sessionToken = accessToken;

    try {
      state.userRole = await fetchUserRole(state.sessionToken);
    } catch {
      state.userRole = 'user';
    }
    marcarSesionIniciada(state.userRole);
    const currentUser = await cargarEstadoUsuario();
    const isGoogle = isGoogleAuth || currentUser?.app_metadata?.provider === 'google' || currentUser?.app_metadata?.providers?.includes('google');

    if (authType === 'recovery') {
      const mNewPass = document.getElementById('modal-new-password');
      if (mNewPass) mNewPass.classList.add('open');
      showNeoToast(t('auth_new_password_desc', null, 'Introduce tu nueva contraseña de acceso.'));
    } else if (authType === 'invite') {
      const mNewPass = document.getElementById('modal-new-password');
      if (mNewPass) mNewPass.classList.add('open');
      showNeoToast(t('auth_invite_accepted', null, '¡Invitación aceptada! Define tu contraseña para comenzar.'));
    } else if (authType === 'signup') {
      showNeoToast(t('auth_signup_confirmed', null, '¡Cuenta confirmada con éxito! Bienvenido a Nolli.'));
    } else if (authType === 'magiclink') {
      showNeoToast(t('auth_magic_link_success', null, 'Sesión iniciada con éxito mediante Enlace Mágico.'));
    } else if (authType === 'email_change') {
      showNeoToast(t('profile_email_updated_success', null, 'Correo electrónico actualizado con éxito.'));
    } else if (isGoogle) {
      showNeoToast(t('auth_login_google_success', null, 'Sesión iniciada con éxito con Google.'));
    } else {
      showNeoToast(t('auth_login_success', null, 'Sesión iniciada con éxito.'));
    }
    return true;
  };

  const redirected = await checkIncomingAuthRedirect();
  if (!redirected) {
    const sesionGuardada = localStorage.getItem(ADMIN_SESSION_KEY) || sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (sesionGuardada) {
      try {
        let savedSession = JSON.parse(sesionGuardada);
        if (typeof savedSession === 'string') savedSession = { access_token: savedSession };
        if (!savedSession.access_token && savedSession.refresh_token) savedSession = await refreshUserSession(savedSession.refresh_token);
        state.sessionToken = savedSession.access_token;
        try {
          state.userRole = await fetchUserRole(state.sessionToken);
        } catch (error) {
          if (savedSession.refresh_token) {
            try {
              savedSession = await refreshUserSession(savedSession.refresh_token);
              state.sessionToken = savedSession.access_token;
              state.userRole = await fetchUserRole(state.sessionToken);
            } catch {}
          }
        }
        if (!state.userRole) {
          state.userRole = esRolAdmin() ? 'superadmin' : 'user';
        }
        marcarSesionIniciada(state.userRole);
        await cargarEstadoUsuario();
        try {
          localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(savedSession));
        } catch {}
      } catch (error) {
        console.warn('Error restaurando sesión:', error);
        const msg = String(error?.message || '');
        if (msg.includes('caducado') || msg.includes('invalid') || msg.includes('JWT') || msg.includes('401')) {
          localStorage.removeItem(ADMIN_SESSION_KEY);
          sessionStorage.removeItem(ADMIN_SESSION_KEY);
          state.sessionToken = null;
          state.userRole = null;
          state.adminMode = false;
        }
      }
    }
  }

  const registerSuccessView = document.getElementById('register-success-view');
  const registerSuccessEmail = document.getElementById('register-success-email');
  const btnSuccessToLogin = document.getElementById('btn-success-to-login');
  const btnMagicLink = document.getElementById('btn-request-magic-link');

  const switchToLoginMode = () => {
    registerMode = false;
    if (loginForm) loginForm.classList.remove('hidden');
    if (registerSuccessView) registerSuccessView.classList.add('hidden');
    if (title) title.textContent = t('auth_modal_title');
    if (actionButton) actionButton.textContent = t('auth_btn_login');
    if (registerButton) registerButton.textContent = t('auth_btn_register_mode');
    registerOnlyFields.forEach((field) => field.classList.add('hidden'));
    forgotPasswordButton?.classList.remove('hidden');
    btnMagicLink?.classList.remove('hidden');
    document.querySelector('.keep-session')?.classList.remove('hidden');
    if (guestBlock) guestBlock.classList.remove('hidden');
    if (passwordInput) passwordInput.autocomplete = 'current-password';
    const err = document.getElementById('login-error');
    if (err) err.classList.add('hidden');
    if (window.lucide) window.lucide.createIcons();
  };

  if (btnSuccessToLogin) {
    btnSuccessToLogin.addEventListener('click', () => {
      switchToLoginMode();
    });
  }

  bLoginT.addEventListener('click', () => {
    if (registerSuccessView && !registerSuccessView.classList.contains('hidden')) {
      switchToLoginMode();
    }
    mLogin.classList.add('open');
  });
  togglePassword.addEventListener('click', () => {
    const showing = passwordInput.type === 'text';
    passwordInput.type = showing ? 'password' : 'text';
    togglePassword.setAttribute('aria-label', showing ? 'Mostrar contraseña' : 'Ocultar contraseña');
    togglePassword.innerHTML = showing
      ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
      : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
  });
  forgotPasswordButton.addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const err = document.getElementById('login-error');
    if (!email) {
      err.textContent = 'Escribe tu email para enviarte el enlace.';
      err.classList.remove('hidden');
      return;
    }
    forgotPasswordButton.disabled = true;
    forgotPasswordButton.textContent = 'ENVIANDO ENLACE...';
    try {
      await requestPasswordReset(email);
      err.textContent = 'Revisa tu correo para restablecer la contraseña.';
      err.classList.remove('hidden');
    } catch (error) {
      err.textContent = error.message;
      err.classList.remove('hidden');
    } finally {
      forgotPasswordButton.disabled = false;
      forgotPasswordButton.textContent = '¿OLVIDASTE LA CONTRASEÑA?';
    }
  });

  if (btnMagicLink) {
    btnMagicLink.addEventListener('click', async () => {
      const email = document.getElementById('login-email')?.value.trim();
      const err = document.getElementById('login-error');
      if (!email || !email.includes('@')) {
        if (err) {
          err.textContent = t('auth_err_enter_email', null, 'Escribe tu email para enviarte el enlace.');
          err.classList.remove('hidden');
        }
        return;
      }
      btnMagicLink.disabled = true;
      const oldText = btnMagicLink.textContent;
      btnMagicLink.textContent = t('auth_sending_link', null, 'ENVIANDO ENLACE...');
      try {
        await sendMagicLink(email);
        if (err) err.classList.add('hidden');
        if (loginForm) loginForm.classList.add('hidden');
        if (registerSuccessView) {
          registerSuccessView.classList.remove('hidden');
          if (registerSuccessEmail) registerSuccessEmail.textContent = email;
          const successTitle = registerSuccessView.querySelector('.register-success-title');
          if (successTitle) successTitle.textContent = 'ENLACE MÁGICO ENVIADO';
          const successMsg = registerSuccessView.querySelector('.register-success-msg');
          if (successMsg) successMsg.textContent = 'Te hemos enviado un enlace de acceso directo a tu correo. Haz clic en él para entrar automáticamente a Nolli sin contraseña.';
        }
        showNeoToast(t('auth_magic_link_sent', null, '¡Enlace mágico enviado! Revisa tu bandeja de entrada.'));
      } catch (error) {
        if (err) {
          err.textContent = error.message;
          err.classList.remove('hidden');
        }
      } finally {
        btnMagicLink.disabled = false;
        btnMagicLink.textContent = oldText;
      }
    });
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-login-close')) {
      try {
        sessionStorage.setItem('nolli:guest_session', 'true');
      } catch (err) {}
      if (mLogin) mLogin.classList.remove('open');
    }
  });

  if (btnGuestLogin) {
    btnGuestLogin.addEventListener('click', () => {
      try {
        sessionStorage.setItem('nolli:guest_session', 'true');
      } catch (err) {}
      if (mLogin) mLogin.classList.remove('open');
    });
  }

  if (btnGoogleLogin) {
    btnGoogleLogin.addEventListener('click', () => {
      signInWithGoogle();
    });
  }

  const termsCheckbox = document.getElementById('register-terms');
  const newsletterCheckbox = document.getElementById('register-newsletter');

  termsCheckbox?.addEventListener('change', () => {
    const err = document.getElementById('login-error');
    if (termsCheckbox.checked && err?.textContent?.includes('términos')) {
      err.classList.add('hidden');
    }
  });

  document.getElementById('btn-do-login')?.addEventListener('click', async () => {
    const err = document.getElementById('login-error');
    err.classList.add('hidden');

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const firstName = document.getElementById('register-first-name')?.value.trim() || '';
    const lastName = document.getElementById('register-last-name')?.value.trim() || '';
    const city = document.getElementById('register-city')?.value.trim() || '';
    const country = document.getElementById('register-country')?.value.trim() || '';
    if (!email || !password) {
      err.textContent = 'Datos incompletos.';
      err.classList.remove('hidden');
      return;
    }
    if (registerMode) {
      if (!firstName || !lastName || !city || !country) {
        err.textContent = 'Completa nombre, apellidos, ciudad y país.';
        err.classList.remove('hidden');
        return;
      }
      if (termsCheckbox && !termsCheckbox.checked) {
        err.textContent = 'Debes aceptar los términos y condiciones para crear una cuenta.';
        err.classList.remove('hidden');
        return;
      }
    }

    const btnLogin = actionButton;
    btnLogin.textContent = registerMode ? 'CREANDO...' : 'VERIFICANDO...';
    try {
      if (registerMode) {
        const data = await registerUser(email, password, {
          firstName,
          lastName,
          city,
          country,
          newsletter: newsletterCheckbox?.checked || false,
        });
        if (data.access_token) {
          state.sessionToken = data.access_token;
          state.userRole = 'user';
          await cargarEstadoUsuario();
          const sessionData = { access_token: data.access_token, refresh_token: data.refresh_token };
          try {
            if (keepSession.checked) localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(sessionData));
            else sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(sessionData));
          } catch {}
          marcarSesionIniciada('user');
        }
        // Desplegar pantalla de confirmación dedicada Neo-Bauhaus
        err.classList.add('hidden');
        if (loginForm) loginForm.classList.add('hidden');
        if (registerSuccessView) {
          registerSuccessView.classList.remove('hidden');
          if (registerSuccessEmail) registerSuccessEmail.textContent = email;
        }
        if (title) title.textContent = 'CONFIRMACIÓN DE CUENTA';
        if (window.lucide) window.lucide.createIcons();
      } else {
        const auth = await loginAdmin(email, password);
        state.sessionToken = auth.access_token;
        state.userRole = await fetchUserRole(state.sessionToken);
        await cargarEstadoUsuario();
        const sessionData = { access_token: auth.access_token, refresh_token: auth.refresh_token };
        try {
          if (keepSession.checked) localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(sessionData));
          else sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(sessionData));
        } catch {}
        mLogin.classList.remove('open');
        marcarSesionIniciada(state.userRole);
      }
    } catch (error) {
      err.textContent = error.message;
      err.classList.remove('hidden');
    } finally {
      btnLogin.textContent = registerMode ? t('auth_btn_register_mode') : t('auth_btn_login');
    }
  });

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    actionButton.click();
  });

  registerButton.addEventListener('click', () => {
    registerMode = !registerMode;
    title.textContent = registerMode ? t('auth_user_registration') : t('auth_modal_title');
    actionButton.textContent = registerMode ? t('auth_btn_register_mode') : t('auth_btn_login');
    registerButton.textContent = registerMode ? t('auth_back_to_login') : t('auth_btn_register_mode');
    registerOnlyFields.forEach((field) => field.classList.toggle('hidden', !registerMode));
    forgotPasswordButton.classList.toggle('hidden', registerMode);
    btnMagicLink?.classList.toggle('hidden', registerMode);
    document.querySelector('.keep-session')?.classList.toggle('hidden', registerMode);
    if (guestBlock) guestBlock.classList.toggle('hidden', registerMode);
    passwordInput.autocomplete = registerMode ? 'new-password' : 'current-password';
    document.getElementById('login-error')?.classList.add('hidden');
  });

  logoutButton.addEventListener('click', () => {
    clearSessionAndUserCaches();
    try {
      sessionStorage.removeItem('nolli:guest_session');
    } catch (e) {}
    if (adminModeControl) adminModeControl.classList.add('hidden');
    if (adminModeToggle) adminModeToggle.checked = false;
    document.dispatchEvent(new CustomEvent('radar:user-status-ready'));
    if (logoutButton) logoutButton.classList.add('hidden');
    loginEntryFields.forEach((field) => field.classList.remove('hidden'));
    btnMagicLink?.classList.remove('hidden');
    if (bLoginT) {
      bLoginT.textContent = t('login_init_btn');
      bLoginT.style.color = 'var(--accent)';
      bLoginT.style.borderColor = 'var(--accent)';
      bLoginT.style.background = 'rgba(234, 86, 13, 0.1)';
    }
    if (mLogin) mLogin.classList.remove('open');
    document.dispatchEvent(new CustomEvent('radar:logout'));
  });
}

/* -------------------------------------------------------------------------
   MÓDULO DE INSERCIÓN EN BD
   ------------------------------------------------------------------------- */
function initAddBuildingModal() {
  const mAdd = document.getElementById('modal-add-building');
  const inputFotoFile = document.getElementById('add-foto-file');
  const inputFotoUrl = document.getElementById('add-foto');
  const inputFotoCredito = document.getElementById('add-foto-credito');
  const wrapFotoPreview = document.getElementById('add-foto-preview-wrap');
  const imgFotoPreview = document.getElementById('add-foto-preview-img');
  const btnRemoveFoto = document.getElementById('btn-add-foto-remove');
  const statusFotoUpload = document.getElementById('add-foto-upload-status');

  function updateAddFotoPreview(url) {
    if (url && wrapFotoPreview && imgFotoPreview) {
      imgFotoPreview.src = url;
      wrapFotoPreview.classList.remove('hidden');
    } else if (wrapFotoPreview && imgFotoPreview) {
      imgFotoPreview.src = '';
      wrapFotoPreview.classList.add('hidden');
    }
  }

  inputFotoUrl?.addEventListener('input', () => {
    updateAddFotoPreview(inputFotoUrl.value.trim());
  });

  btnRemoveFoto?.addEventListener('click', () => {
    if (inputFotoUrl) inputFotoUrl.value = '';
    if (inputFotoFile) inputFotoFile.value = '';
    updateAddFotoPreview('');
    if (statusFotoUpload) {
      statusFotoUpload.textContent = '';
      statusFotoUpload.classList.add('hidden');
    }
  });

  inputFotoFile?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (statusFotoUpload) {
      statusFotoUpload.textContent = 'Subiendo imagen...';
      statusFotoUpload.classList.remove('hidden');
    }
    try {
      const res = await uploadGenericPhotoWithR2(file, state.editingBuildingId || 'new', state.sessionToken, (pct) => {
        if (statusFotoUpload) statusFotoUpload.textContent = `Subiendo imagen... ${pct}%`;
      });
      const photoUrl = res?.publicUrl || res?.url;
      if (photoUrl) {
        if (inputFotoUrl) inputFotoUrl.value = photoUrl;
        updateAddFotoPreview(photoUrl);
        if (statusFotoUpload) {
          statusFotoUpload.textContent = 'Imagen subida correctamente';
        }
      } else {
        throw new Error('No se recibió la URL de la imagen.');
      }
    } catch (err) {
      if (statusFotoUpload) {
        statusFotoUpload.textContent = 'Error al subir la imagen: ' + (err.message || 'Error');
      }
    }
  });

  const closeAdd = () => {
    mAdd.classList.remove('open');
    state.pendingLngLat = null;
    state.editingBuildingId = null;
    state.addingBuilding = false;
    document.getElementById('btn-add-project').classList.remove('active-state');
    if (inputFotoFile) inputFotoFile.value = '';
    if (inputFotoUrl) inputFotoUrl.value = '';
    if (inputFotoCredito) inputFotoCredito.value = '';
    updateAddFotoPreview('');
    if (statusFotoUpload) {
      statusFotoUpload.textContent = '';
      statusFotoUpload.classList.add('hidden');
    }
  };

  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-add-close')) closeAdd();
  });
  document.getElementById('btn-add-cancel')?.addEventListener('click', closeAdd);
  mAdd?.addEventListener('click', (e) => {
    if (e.target === mAdd) closeAdd();
  });

  const selectVisibility = document.getElementById('add-visibility');

  function actualizarOpcionesVisibilidad(selectedVal = null) {
    if (!selectVisibility) return;
    const esEditorOrAdmin = esRolEditor(state.userRole);
    selectVisibility.innerHTML = '';

    if (esEditorOrAdmin) {
      const optDirect = document.createElement('option');
      optDirect.value = 'direct';
      optDirect.textContent = t('add_vis_direct');
      selectVisibility.appendChild(optDirect);
    }

    const optReview = document.createElement('option');
    optReview.value = 'review';
    optReview.textContent = t('add_vis_review');
    selectVisibility.appendChild(optReview);

    const optPrivate = document.createElement('option');
    optPrivate.value = 'private';
    optPrivate.textContent = t('add_vis_private');
    selectVisibility.appendChild(optPrivate);

    if (selectedVal && Array.from(selectVisibility.options).some((o) => o.value === selectedVal)) {
      selectVisibility.value = selectedVal;
    } else if (esEditorOrAdmin) {
      selectVisibility.value = 'direct';
    } else {
      selectVisibility.value = 'review';
    }

    actualizarEstadoFormularioSegunVisibilidad();
  }

  function actualizarEstadoFormularioSegunVisibilidad() {
    const visibility = selectVisibility?.value || 'review';
    const modalTitle = document.getElementById('modal-add-title');
    const btnSave = document.getElementById('btn-add-save');

    if (visibility === 'direct') {
      if (modalTitle) modalTitle.textContent = t('add_modal_direct_title');
      if (btnSave) btnSave.innerHTML = `<span class="inline-flex items-center gap-1"><i data-lucide="database" width="13" height="13"></i> ${t('add_btn_publish_direct')}</span>`;
    } else if (visibility === 'private') {
      if (modalTitle) modalTitle.textContent = t('add_modal_private_title');
      if (btnSave) btnSave.innerHTML = `<span class="inline-flex items-center gap-1"><i data-lucide="bookmark" width="13" height="13"></i> ${t('add_btn_save_private')}</span>`;
    } else {
      if (modalTitle) modalTitle.textContent = t('add_modal_review_title');
      if (btnSave) btnSave.innerHTML = `<span class="inline-flex items-center gap-1"><i data-lucide="send" width="13" height="13"></i> ${t('add_btn_submit_review')}</span>`;
    }
    if (window.lucide) window.lucide.createIcons();
  }

  selectVisibility?.addEventListener('change', actualizarEstadoFormularioSegunVisibilidad);

  document.addEventListener('radar:edit-building', (e) => {
    const obra = e.detail.obra;
    document.getElementById('sheet')?.classList.remove('open');
    state.editingBuildingId = obra.id;
    state.pendingLngLat = { lng: obra.coordenadas[0], lat: obra.coordenadas[1] };
    document.getElementById('modal-add-title').textContent = t('add_modal_edit_title');
    document.getElementById('btn-add-save').innerHTML = `<span class="inline-flex items-center gap-1"><i data-lucide="check" width="13" height="13"></i> ${t('add_btn_save_changes')}</span>`;
    document.getElementById('add-coords').textContent = `${obra.coordenadas[0].toFixed(5)}, ${obra.coordenadas[1].toFixed(5)}`;
    document.getElementById('add-nombre').value = obra.nombre_obra || '';
    document.getElementById('add-foto').value = obra.foto_url || '';
    if (inputFotoCredito) inputFotoCredito.value = obra.foto_credito || '';
    updateAddFotoPreview(obra.foto_url || '');
    document.getElementById('add-enlace').value = obra.enlace_url || '';
    const placeEl = document.getElementById('add-place');
    if (placeEl) placeEl.value = obra.place || obra.ciudad || '';
    document.getElementById('add-arquitecto').value = obra.arquitecto || '';
    document.getElementById('add-ano').value = obra.año_construccion || '';
    document.getElementById('add-importancia').value = String(obra.importancia || 1);
    document.getElementById('add-categoria').value = normalizarCategoria(obra.categoria);
    document.getElementById('add-acceso').value = obra.estado_acceso || 'publico';
    actualizarOpcionesVisibilidad(obra.private ? 'private' : (obra.estado_revision === 'publicada' ? 'direct' : 'review'));
    document.getElementById('add-error').classList.add('hidden');
    mAdd.classList.add('open');
  });

  document.getElementById('btn-add-save')?.addEventListener('click', async () => {
    const err = document.getElementById('add-error');
    err.classList.add('hidden');

    const nombre = document.getElementById('add-nombre').value.trim();
    const fotoUrl = document.getElementById('add-foto').value.trim();
    const fotoCredito = document.getElementById('add-foto-credito')?.value.trim() || '';
    const enlaceUrl = document.getElementById('add-enlace').value.trim();
    const place = document.getElementById('add-place')?.value.trim() || null;
    const arq = document.getElementById('add-arquitecto').value.trim();
    const ano = parseInt(document.getElementById('add-ano').value, 10);
    const importancia = Number(document.getElementById('add-importancia').value);
    const categoria = document.getElementById('add-categoria').value;
    const estadoAcceso = document.getElementById('add-acceso').value;
    const visibility = document.getElementById('add-visibility')?.value || 'review';

    if (!nombre || (!arq && visibility !== 'private') || !state.pendingLngLat) {
      err.textContent = visibility === 'private'
        ? 'Introduce el nombre de tu etiqueta/obra privada.'
        : 'Faltan datos obligatorios (Nombre y Arquitecto).';
      err.classList.remove('hidden');
      return;
    }

    if (fotoUrl && !fotoCredito) {
      err.textContent = 'Indica el autor o crédito de la fotografía para que aparezca citado en la ficha.';
      err.classList.remove('hidden');
      return;
    }

    if (visibility === 'private' && !state.userId) {
      err.textContent = 'Inicia sesión para guardar etiquetas privadas.';
      err.classList.remove('hidden');
      return;
    }

    const finalArq = arq || (visibility === 'private' ? 'Personal / Sin autor' : 'Autor desconocido');
    const btnSave = document.getElementById('btn-add-save');
    btnSave.innerHTML = visibility === 'private'
      ? 'GUARDANDO PRIVADA...'
      : visibility === 'direct' ? 'PUBLICANDO...' : 'ENVIANDO A REVISIÓN...';

    const edificio = {
      nombre_obra: nombre,
      foto_url: fotoUrl || null,
      foto_credito: fotoUrl ? fotoCredito : null,
      enlace_url: enlaceUrl || null,
      place: place,
      ciudad: place,
      arquitecto: finalArq,
      año_construccion: Number.isNaN(ano) ? null : String(ano),
      importancia,
      categoria,
      estado_acceso: estadoAcceso,
      longitud: state.pendingLngLat.lng,
      latitud: state.pendingLngLat.lat,
    };

    try {
      if (state.editingBuildingId !== null) {
        const obraExistente = state.OBRAS.find((item) => String(item.id) === String(state.editingBuildingId));
        const esEditorOrAdmin = esRolEditor(state.userRole);

        // Si el usuario es editor o administrador, aplicar la visibilidad seleccionada
        let estadoRevision = obraExistente?.estado_revision || 'publicada';
        if (esEditorOrAdmin) {
          if (visibility === 'direct') estadoRevision = 'publicada';
          else if (visibility === 'review') estadoRevision = 'pendiente';
        }

        const edificioUpdate = {
          ...edificio,
          estado_revision: estadoRevision,
          place: place || obraExistente?.place || null,
          ciudad: place || obraExistente?.ciudad || null,
        };

        const updatedData = await updateBuilding(state.editingBuildingId, edificioUpdate, state.sessionToken);
        const updated = Array.isArray(updatedData) ? updatedData[0] : updatedData;
        const obra = obraExistente;
        if (obra) Object.assign(obra, {
          ...edificioUpdate,
          foto_credito: edificio.foto_credito,
          arquitectos: separarArquitectos(finalArq),
          id: obra.id,
          coordenadas: [updated?.longitud ?? edificio.longitud, updated?.latitud ?? edificio.latitud],
          featureId: obra.featureId,
          selected: obra.selected,
        });
      } else {
        const isPrivate = visibility === 'private';
        const isDirect = visibility === 'direct' && esRolEditor(state.userRole);
        const nuevoId = generarIdAlfanumerico(8);
        const nowIso = new Date().toISOString();

        const nuevoEdificio = {
          ...edificio,
          id: nuevoId,
          created_at: nowIso,
          añadido_por: isDirect ? (esRolAdmin(state.userRole) ? 'administrador' : 'editor') : (state.userEmail || 'usuario'),
          estado_revision: isDirect ? 'publicada' : 'pendiente',
        };
        const privateData = {
          ...edificio,
          id: nuevoId,
          created_at: nowIso,
          user_id: state.userId,
        };

        const insertedData = isPrivate
          ? await createPrivateBuilding(privateData, state.sessionToken)
          : await createBuilding({ ...nuevoEdificio, propuesto_por: state.userId }, state.sessionToken);

        const inserted = Array.isArray(insertedData) ? insertedData[0] : insertedData;
        const savedItem = {
          ...(isPrivate ? privateData : nuevoEdificio),
          foto_credito: edificio.foto_credito,
          arquitectos: separarArquitectos(finalArq),
          añadido_por: nuevoEdificio.añadido_por,
          created_at: inserted?.created_at || nowIso,
          estado_revision: isPrivate ? 'privada' : nuevoEdificio.estado_revision,
          id: inserted?.id || nuevoId,
          featureId: String(inserted?.id ?? `obra-${nuevoId}`),
          private: isPrivate,
          coordenadas: [state.pendingLngLat.lng, state.pendingLngLat.lat],
          selected: false,
        };

        state.OBRAS.push(savedItem);
        if (isPrivate) state.privateBuildings.push(savedItem);
      }

      invalidateCatalogCache();
      document.dispatchEvent(new CustomEvent('radar:catalog-invalidated'));
      actualizarFuenteMapa();

      // Actualizar filtros si hay un arquitecto nuevo
      const arquitectosNuevos = separarArquitectos(finalArq).some((nombreArquitecto) => !state.ARQUITECTOS.includes(nombreArquitecto));
      separarArquitectos(finalArq).forEach((nombreArquitecto) => {
        if (!state.ARQUITECTOS.includes(nombreArquitecto)) state.ARQUITECTOS.push(nombreArquitecto);
        state.activeArquitectos.add(nombreArquitecto);
      });
      if (arquitectosNuevos) generarFiltrosUI();

      closeAdd();
      document.dispatchEvent(new CustomEvent('radar:cerrar-ficha'));
    } catch (error) {
      err.textContent = error.message;
      err.classList.remove('hidden');
    } finally {
      actualizarEstadoFormularioSegunVisibilidad();
    }
  });

  // Se abre a partir de una pulsación larga sobre el mapa (evento emitido
  // por mapController). Mantiene ambos módulos desacoplados.
  document.addEventListener('radar:map-longpress', (e) => {
    handleMapLongPress(e.detail.lngLat);
  });
}

function handleMapLongPress(lngLat) {
  if (!state.sessionToken) {
    showNeoToast(t('toast_login_required_add'));
    return;
  }
  state.editingBuildingId = null;
  state.addingBuilding = false;
  document.getElementById('btn-add-project').classList.remove('active-state');
  state.pendingLngLat = lngLat;
  document.getElementById('add-coords').textContent = `${lngLat.lng.toFixed(5)}, ${lngLat.lat.toFixed(5)}`;

  document.getElementById('add-nombre').value = '';
  document.getElementById('add-foto').value = '';
  const credEl = document.getElementById('add-foto-credito');
  if (credEl) credEl.value = '';
  const fileEl = document.getElementById('add-foto-file');
  if (fileEl) fileEl.value = '';
  const prevEl = document.getElementById('add-foto-preview-wrap');
  if (prevEl) prevEl.classList.add('hidden');
  const statEl = document.getElementById('add-foto-upload-status');
  if (statEl) {
    statEl.textContent = '';
    statEl.classList.add('hidden');
  }
  document.getElementById('add-enlace').value = '';
  const pEl = document.getElementById('add-place');
  if (pEl) pEl.value = '';
  document.getElementById('add-arquitecto').value = '';
  document.getElementById('add-ano').value = '';
  document.getElementById('add-importancia').value = '1';
  document.getElementById('add-categoria').value = 'otro';
  document.getElementById('add-acceso').value = 'publico';

  const select = document.getElementById('add-visibility');
  if (select) {
    const esEditorOrAdmin = esRolEditor(state.userRole);
    select.innerHTML = '';
    if (esEditorOrAdmin) {
      const optDirect = document.createElement('option');
      optDirect.value = 'direct';
      optDirect.textContent = t('add_vis_direct');
      select.appendChild(optDirect);
    }
    const optReview = document.createElement('option');
    optReview.value = 'review';
    optReview.textContent = t('add_vis_review');
    select.appendChild(optReview);

    const optPrivate = document.createElement('option');
    optPrivate.value = 'private';
    optPrivate.textContent = t('add_vis_private');
    select.appendChild(optPrivate);

    select.value = esEditorOrAdmin ? 'direct' : 'review';
  }

  const modalTitle = document.getElementById('modal-add-title');
  const btnSave = document.getElementById('btn-add-save');
  const isDirect = esRolEditor(state.userRole);
  if (modalTitle) modalTitle.textContent = isDirect ? t('add_modal_direct_title') : t('add_modal_review_title');
  if (btnSave) btnSave.innerHTML = isDirect
    ? `<span class="inline-flex items-center gap-1"><i data-lucide="database" width="13" height="13"></i> ${t('add_btn_publish_direct')}</span>`
    : `<span class="inline-flex items-center gap-1"><i data-lucide="send" width="13" height="13"></i> ${t('add_btn_submit_review')}</span>`;

  document.getElementById('add-error').classList.add('hidden');
  document.getElementById('modal-add-building').classList.add('open');
  if (window.lucide) window.lucide.createIcons();
}

export function initModalsUI() {
  initLoginModal();
  initNewPasswordModal();
  initVerifyOtpModal();
  initAddBuildingModal();
  initReportModal();
}

function initNewPasswordModal() {
  const modal = document.getElementById('modal-new-password');
  const btnClose = document.getElementById('btn-new-password-close');
  const form = document.getElementById('new-password-form');
  const passInput = document.getElementById('new-password-input');
  const confirmInput = document.getElementById('confirm-password-input');
  const errorEl = document.getElementById('new-password-error');
  const btnSubmit = document.getElementById('btn-submit-new-password');
  const toggleBtn = document.getElementById('toggle-new-password');

  if (!modal) return;

  const close = () => {
    modal.classList.remove('open');
    if (passInput) passInput.value = '';
    if (confirmInput) confirmInput.value = '';
    if (errorEl) errorEl.classList.add('hidden');
  };

  btnClose?.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  if (toggleBtn && passInput) {
    toggleBtn.addEventListener('click', () => {
      const showing = passInput.type === 'text';
      passInput.type = showing ? 'password' : 'text';
      toggleBtn.setAttribute('aria-label', showing ? 'Mostrar contraseña' : 'Ocultar contraseña');
      toggleBtn.setAttribute('aria-pressed', String(!showing));
      toggleBtn.innerHTML = showing
        ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
        : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
    });
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.classList.add('hidden');
    const p1 = passInput?.value || '';
    const p2 = confirmInput?.value || '';

    if (p1.length < 6) {
      if (errorEl) {
        errorEl.textContent = t('auth_password_len_err', null, 'La contraseña debe tener al menos 6 caracteres.');
        errorEl.classList.remove('hidden');
      }
      return;
    }
    if (p1 !== p2) {
      if (errorEl) {
        errorEl.textContent = t('auth_password_match_err', null, 'Las contraseñas no coinciden.');
        errorEl.classList.remove('hidden');
      }
      return;
    }

    if (!state.sessionToken) {
      if (errorEl) {
        errorEl.textContent = 'Enlace caducado o sin sesión activa. Solicita un nuevo enlace.';
        errorEl.classList.remove('hidden');
      }
      return;
    }

    btnSubmit.disabled = true;
    const oldLabel = btnSubmit.textContent;
    btnSubmit.textContent = 'ACTUALIZANDO...';

    try {
      await updateUserPassword(state.sessionToken, p1);
      close();
      showNeoToast(t('auth_password_success', null, 'Contraseña actualizada con éxito.'));
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || 'Error al actualizar contraseña.';
        errorEl.classList.remove('hidden');
      }
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = oldLabel;
    }
  });
}

function initVerifyOtpModal() {
  const modal = document.getElementById('modal-verify-otp');
  const btnClose = document.getElementById('btn-verify-otp-close');
  const form = document.getElementById('verify-otp-form');
  const otpInput = document.getElementById('otp-code-input');
  const errorEl = document.getElementById('otp-error');
  const btnSubmit = document.getElementById('btn-submit-otp');

  if (!modal) return;

  const close = () => {
    modal.classList.remove('open');
    if (otpInput) otpInput.value = '';
    if (errorEl) errorEl.classList.add('hidden');
  };

  btnClose?.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.classList.add('hidden');
    const code = otpInput?.value.trim() || '';

    if (code.length !== 6) {
      if (errorEl) {
        errorEl.textContent = 'El código debe tener exactamente 6 dígitos.';
        errorEl.classList.remove('hidden');
      }
      return;
    }

    btnSubmit.disabled = true;
    const oldLabel = btnSubmit.textContent;
    btnSubmit.textContent = 'VERIFICANDO...';

    try {
      const email = state.userEmail || (document.getElementById('login-email')?.value.trim()) || '';
      const data = await verifyOtpToken(email, code, 'email');
      if (data?.access_token) {
        state.sessionToken = data.access_token;
        const sessionData = { access_token: data.access_token, refresh_token: data.refresh_token || '' };
        try { localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(sessionData)); } catch {}
        state.userRole = await fetchUserRole(state.sessionToken).catch(() => 'user');
        document.dispatchEvent(new CustomEvent('radar:user-session-ready'));
      }
      close();
      showNeoToast(t('auth_otp_success', null, 'Código verificado correctamente.'));
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || 'Código no válido o caducado.';
        errorEl.classList.remove('hidden');
      }
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = oldLabel;
    }
  });
}

function initReportModal() {
  const modal = document.getElementById('modal-report');
  const errorElement = document.getElementById('report-error');
  const descriptionInput = document.getElementById('report-description');
  const projectNameEl = document.getElementById('report-project-name');
  const pills = modal?.querySelectorAll('.report-type-pill');

  let activeReportType = 'error_datos';
  let targetObra = null;

  const close = () => {
    modal?.classList.remove('open');
    if (descriptionInput) descriptionInput.value = '';
    if (errorElement) errorElement.classList.add('hidden');
  };

  document.addEventListener('click', (event) => {
    if (event.target.closest('#btn-report-close') || event.target === modal) close();
  });

  const updatePlaceholder = () => {
    if (!descriptionInput) return;
    if (activeReportType === 'duplicado') {
      descriptionInput.placeholder = 'Indica el nombre, arquitecto o enlace de la obra con la que está duplicada...';
    } else if (activeReportType === 'error_datos') {
      descriptionInput.placeholder = 'Describe los datos erróneos o la información correcta...';
    } else {
      descriptionInput.placeholder = 'Describe la incidencia detectada...';
    }
  };

  // Selector de píldoras de tipo de incidencia
  pills?.forEach((pill) => {
    pill.addEventListener('click', () => {
      pills.forEach((p) => {
        p.classList.remove('active');
        p.setAttribute('aria-checked', 'false');
      });
      pill.classList.add('active');
      pill.setAttribute('aria-checked', 'true');
      activeReportType = pill.dataset.reportType || 'error_datos';
      updatePlaceholder();
    });
  });

  // Evento disparado desde la ficha de obra
  document.addEventListener('radar:open-report', (e) => {
    targetObra = e.detail?.obra || state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId));
    activeReportType = e.detail?.reportType || 'error_datos';

    if (projectNameEl) {
      projectNameEl.textContent = targetObra ? `OBRA: ${targetObra.nombre_obra}` : '';
    }

    pills?.forEach((pill) => {
      const isCur = pill.dataset.reportType === activeReportType;
      pill.classList.toggle('active', isCur);
      pill.setAttribute('aria-checked', isCur ? 'true' : 'false');
    });

    updatePlaceholder();
    if (errorElement) errorElement.classList.add('hidden');
    if (descriptionInput) descriptionInput.value = '';
    modal?.classList.add('open');
    if (window.lucide) window.lucide.createIcons();
  });

  document.getElementById('btn-report-submit')?.addEventListener('click', async () => {
    const description = descriptionInput ? descriptionInput.value.trim() : '';
    const obra = targetObra || state.OBRAS.find((item) => String(item.featureId) === String(state.selectedFeatureId));

    if (!obra) {
      if (errorElement) {
        errorElement.textContent = 'No se ha seleccionado ninguna obra válida.';
        errorElement.classList.remove('hidden');
      }
      return;
    }

    if (!description) {
      if (activeReportType === 'duplicado') {
        if (errorElement) {
          errorElement.textContent = 'Indica qué obra es la colisionante (nombre o enlace) antes de enviar.';
          errorElement.classList.remove('hidden');
        }
        return;
      }
      if (activeReportType === 'error_datos') {
        if (errorElement) {
          errorElement.textContent = 'Describe la corrección propuesta.';
          errorElement.classList.remove('hidden');
        }
        return;
      }
    }

    const button = document.getElementById('btn-report-submit');
    if (button) {
      button.textContent = 'ENVIANDO REPORTE...';
      button.disabled = true;
    }

    try {
      await createBuildingReport({
        building_id: obra.id,
        user_id: state.userId || null,
        user_email: state.userEmail || null,
        report_type: activeReportType,
        description: description || `Reporte de ${activeReportType} enviado desde la ficha técnica.`
      }, state.sessionToken);

      if (button) button.textContent = 'REPORTE REGISTRADO CON ÉXITO';
      setTimeout(close, 800);
    } catch (error) {
      if (errorElement) {
        errorElement.textContent = error.message || 'Error al enviar reporte.';
        errorElement.classList.remove('hidden');
      }
    } finally {
      if (button) {
        button.disabled = false;
        setTimeout(() => {
          if (!modal?.classList.contains('open')) button.textContent = 'ENVIAR REPORTE';
        }, 1000);
      }
    }
  });
}
