import { Platform } from 'react-native';
import { initializeApp, getApps } from 'firebase/app';
import {
  GoogleAuthProvider,
  OAuthProvider,
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
} from 'firebase/auth';
import { auth, firebaseConfig } from '../../firebase';
import { isCalendarOauthReturn } from './calendarOAuthCapture';

/**
 * ProTop web client (protop-c189c). Google only accepts JavaScript origins and
 * the auth handler that are registered on this client.
 */
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  || '330510386923-uskc5cfk4as0t6gravidjrp65t07iddc.apps.googleusercontent.com';

const GOOGLE_HELPER_ORIGIN = 'https://protop-c189c.firebaseapp.com';
const GOOGLE_BRIDGE_QUERY = 'protop_google';
const GOOGLE_BRIDGE_MESSAGE = 'protop-google';

function prefersRedirectAuth() {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  const android = /Android/i.test(ua);
  return iOS || android;
}

const OAUTH_PENDING_KEY = 'weekplan_oauth_pending';
const OAUTH_ERROR_KEY = 'weekplan_oauth_error';

function setOauthPending(providerId) {
  const value = providerId || 'unknown';
  // Dual-write: iOS Safari can drop sessionStorage across IdP redirects.
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(OAUTH_PENDING_KEY, value);
    }
  } catch {}
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(OAUTH_PENDING_KEY, value);
    }
  } catch {}
}

function clearOauthPending() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(OAUTH_PENDING_KEY);
    }
  } catch {}
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(OAUTH_PENDING_KEY);
    }
  } catch {}
}

function getOauthPending() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const v = sessionStorage.getItem(OAUTH_PENDING_KEY);
      if (v) return v;
    }
  } catch {}
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(OAUTH_PENDING_KEY);
    }
  } catch {}
  return null;
}

/** Apex → www before OAuth so authDomain and Google JS origins match. */
function bounceToWwwIfApex() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.location.hostname !== 'protop.no') return false;
    const url = new URL(window.location.href);
    url.hostname = 'www.protop.no';
    window.location.replace(url.toString());
    return true;
  } catch {
    return false;
  }
}

/** Persist error across redirect return so LoginScreen can show it. */
export function stashOauthError(err, provider) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(OAUTH_ERROR_KEY, JSON.stringify({
      provider: provider || 'unknown',
      code: err?.code || '',
      message: err?.message || String(err || ''),
      at: Date.now(),
    }));
  } catch {}
}

export function consumeOauthError() {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(OAUTH_ERROR_KEY);
    sessionStorage.removeItem(OAUTH_ERROR_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** True when we may be returning from an IdP redirect — do not wipe the page. */
export function isLikelyOauthReturn() {
  if (typeof window === 'undefined') return false;
  if (getOauthPending()) return true;
  try {
    if (String(window.location.pathname || '').includes('oauth/calendar')) return true;
  } catch {}
  const s = `${window.location.search || ''}${window.location.hash || ''}`;
  return /[?&#](code|state|id_token|access_token)=/i.test(s);
}

export function mapAuthError(err) {
  const code = String(err?.code || '');
  const message = String(err?.message || '');
  const type = String(err?.type || err?.cause?.type || '');
  const blob = `${code} ${message} ${type}`.toLowerCase();

  if (blob.includes('origin_mismatch') || blob.includes('idpiframe_initialization_failed')) {
    return 'origin-mismatch';
  }
  if (
    code === 'auth/operation-not-allowed'
    || message === 'provider-disabled'
    || message.includes('google-not-configured')
  ) {
    return 'provider-disabled';
  }
  if (code === 'auth/popup-blocked') return 'popup-blocked';
  if (
    code === 'auth/popup-closed-by-user'
    || code === 'auth/cancelled-popup-request'
    || message === 'cancelled'
  ) {
    return 'cancelled';
  }
  if (code === 'auth/unauthorized-domain') return 'unauthorized-domain';
  if (message === 'apple-unavailable' || code === 'apple-unavailable') return 'apple-unavailable';
  if (
    code === 'auth/redirect-cancelled-or-failed'
    || message === 'redirect-empty'
    || code === 'auth/redirect-empty'
  ) {
    return 'redirect-failed';
  }
  if (code) return code;
  if (message) return message;
  return 'unknown';
}

/** User-facing text for social auth errors (keeps real Firebase codes visible). */
export function socialErrorMessage(t, err, provider) {
  const key = mapAuthError(err);
  if (key === 'cancelled') return null;
  if (key === 'origin-mismatch') return t('auth.originMismatch');
  if (key === 'apple-unavailable') return t('auth.appleUnavailable');
  if (key === 'popup-blocked') return t('auth.popupBlocked');
  if (key === 'redirect-failed') {
    return provider === 'apple' || String(err?.provider || '').includes('apple')
      ? t('auth.appleRedirectFailed')
      : t('auth.redirectFailed');
  }
  if (key === 'unauthorized-domain') return t('auth.unauthorizedDomain');
  if (key === 'provider-disabled') {
    if (provider === 'apple') return t('auth.appleNotEnabled');
    if (provider === 'google') return t('auth.googleNotEnabled');
    if (provider === 'microsoft') return t('auth.microsoftNotEnabled');
    return t('auth.socialFail');
  }
  if (key === 'auth/account-exists-with-different-credential') {
    return t('auth.accountExistsOther');
  }
  const detail = err?.cause?.code || err?.code || key;
  if (detail && detail !== 'unknown') {
    return `${t('auth.socialGeneric')} (${detail})`;
  }
  return t('auth.socialGeneric');
}

function loadGisScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no-window'));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-gis="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('gis-load-failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.dataset.gis = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('gis-load-failed'));
    document.head.appendChild(s);
  });
}

function googlePageOriginIsRegistered() {
  if (typeof window === 'undefined') return false;
  return window.location.origin === GOOGLE_HELPER_ORIGIN;
}

function requestGoogleAccessToken() {
  return loadGisScript().then(() => new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('gis-unavailable'));
      return;
    }
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_WEB_CLIENT_ID,
        scope: 'openid email profile',
        callback: (resp) => {
          if (resp.error) {
            if (resp.error === 'popup_closed_by_user' || resp.error === 'access_denied') {
              reject(new Error('cancelled'));
              return;
            }
            reject(Object.assign(new Error(resp.error), { code: resp.error }));
            return;
          }
          if (!resp.access_token) {
            reject(new Error('cancelled'));
            return;
          }
          resolve(resp.access_token);
        },
        error_callback: (err) => {
          const type = String(err?.type || err?.message || err || '');
          const lower = type.toLowerCase();
          if (lower.includes('popup_closed') || lower.includes('closed')) {
            // User may have closed after seeing origin_mismatch — surface that hint
            if (typeof window !== 'undefined' && window.__weekplanGoogleOriginHint) {
              reject(Object.assign(new Error('origin_mismatch'), { code: 'origin_mismatch' }));
              return;
            }
            reject(new Error('cancelled'));
            return;
          }
          if (lower.includes('origin') || lower.includes('mismatch')) {
            reject(Object.assign(new Error('origin_mismatch'), { code: 'origin_mismatch' }));
            return;
          }
          reject(Object.assign(new Error(type || 'gis-error'), { code: type, type }));
        },
      });
      // If the Google error page opens, origin is almost always the cause on custom domains
      if (typeof window !== 'undefined') window.__weekplanGoogleOriginHint = true;
      client.requestAccessToken({ prompt: 'select_account' });
    } catch (e) {
      reject(e);
    }
  }));
}

async function signInWithGoogleAccessToken(accessToken) {
  const credential = GoogleAuthProvider.credential(null, accessToken);
  const cred = await signInWithCredential(auth, credential);
  return cred.user;
}

/** Google Identity Services access-token → Firebase credential (web). */
async function signInWithGoogleGis() {
  const accessToken = await requestGoogleAccessToken();
  return signInWithGoogleAccessToken(accessToken);
}

function signInWithGoogleViaBridge() {
  return new Promise((resolve, reject) => {
    const popup = window.open(
      `${GOOGLE_HELPER_ORIGIN}/?${GOOGLE_BRIDGE_QUERY}=1`,
      'protop-google',
      'popup,width=480,height=720',
    );
    if (!popup) {
      reject(Object.assign(new Error('popup-blocked'), { code: 'auth/popup-blocked' }));
      return;
    }
    let settled = false;
    const timer = setInterval(() => {
      if (popup.closed) finish(new Error('cancelled'));
    }, 400);
    function finish(err, user) {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      window.removeEventListener('message', onMessage);
      if (err) reject(err);
      else resolve(user);
    }
    async function onMessage(event) {
      if (event.origin !== GOOGLE_HELPER_ORIGIN) return;
      const data = event.data;
      if (!data || data.type !== GOOGLE_BRIDGE_MESSAGE) return;
      if (data.error) {
        try { popup.close(); } catch { /* ignore */ }
        finish(data.error === 'cancelled'
          ? new Error('cancelled')
          : Object.assign(new Error(data.error), { code: data.error }));
        return;
      }
      try {
        const user = await signInWithGoogleAccessToken(data.accessToken);
        try { popup.close(); } catch { /* ignore */ }
        finish(null, user);
      } catch (err) {
        try { popup.close(); } catch { /* ignore */ }
        finish(err);
      }
    }
    window.addEventListener('message', onMessage);
  });
}

/** Popup page on the registered Firebase origin. Posts the Google token back. */
export async function completeGoogleOriginBridge() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get(GOOGLE_BRIDGE_QUERY) !== '1' || !window.opener) return false;
  try {
    const accessToken = await requestGoogleAccessToken();
    window.opener.postMessage({ type: GOOGLE_BRIDGE_MESSAGE, accessToken }, '*');
  } catch (err) {
    const error = err?.message === 'cancelled' ? 'cancelled' : (err?.code || err?.message || 'gis-error');
    window.opener.postMessage({ type: GOOGLE_BRIDGE_MESSAGE, error }, '*');
  }
  window.close();
  return true;
}

async function signInWithProviderFirebase(provider, { allowRedirect = true } = {}) {
  const providerId = provider?.providerId || 'unknown';

  if (allowRedirect && prefersRedirectAuth()) {
    if (bounceToWwwIfApex()) return null;
    setOauthPending(providerId);
    await signInWithRedirect(auth, provider);
    return null;
  }

  try {
    const cred = await signInWithPopup(auth, provider);
    clearOauthPending();
    return cred.user;
  } catch (err) {
    // Apple + full-page redirect often returns with a blank session on custom domains.
    // Only fall back to redirect on mobile, or when explicitly allowed.
    if (err?.code === 'auth/popup-blocked' && allowRedirect) {
      if (bounceToWwwIfApex()) return null;
      setOauthPending(providerId);
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

const REDIRECT_RESULT_TIMEOUT_MS = 5000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error(`${label}-timeout`);
        err.code = 'auth/redirect-timeout';
        reject(err);
      }, ms);
    }),
  ]);
}

export async function completeRedirectSignIn() {
  if (Platform.OS !== 'web') return null;
  // Microsoft account login reuses /oauth/calendar — handled by CalendarOAuthRedirect.
  if (isCalendarOauthReturn()) return null;
  // Cold PWA / desktop-saved launches have no pending IdP redirect. Skip
  // getRedirectResult so IndexedDB / auth-iframe stalls cannot hang
  // "Laster ProTop…" on every resume.
  if (!isLikelyOauthReturn()) return null;
  const pending = getOauthPending();
  try {
    if (pending && String(pending).includes('google')) {
      const helperResult = await withTimeout(
        getRedirectResult(googleHelperAuth()),
        REDIRECT_RESULT_TIMEOUT_MS,
        'google-helper-redirect',
      );
      const helperCredential = helperResult && GoogleAuthProvider.credentialFromResult(helperResult);
      if (helperCredential) {
        const cred = await signInWithCredential(auth, helperCredential);
        clearOauthPending();
        return cred.user;
      }
    }
    const result = await withTimeout(
      getRedirectResult(auth),
      REDIRECT_RESULT_TIMEOUT_MS,
      'redirect-result',
    );
    if (result?.user) {
      clearOauthPending();
      return result.user;
    }
    // Redirect can apply the session without a consumable getRedirectResult
    // (Safari / custom domain). Treat currentUser as success when we had pending.
    if (pending && auth.currentUser) {
      clearOauthPending();
      return auth.currentUser;
    }
    if (pending) {
      clearOauthPending();
      const e = new Error('redirect-empty');
      e.code = 'auth/redirect-cancelled-or-failed';
      e.provider = pending;
      stashOauthError(e, oauthProviderLabel(pending));
      throw e;
    }
    return null;
  } catch (err) {
    if (err?.code === 'auth/redirect-cancelled-or-failed') throw err;
    // Session may still be valid after a noisy getRedirectResult error.
    if (pending && auth.currentUser) {
      clearOauthPending();
      return auth.currentUser;
    }
    // Timed-out redirect: continue with onAuthStateChanged rather than
    // blocking the splash or treating a slow IdP return as a hard cancel.
    if (err?.code === 'auth/redirect-timeout') {
      console.warn('[auth] getRedirectResult timed out, continuing');
      if (auth.currentUser) {
        clearOauthPending();
        return auth.currentUser;
      }
      // Drop pending so the next cold start does not re-block on redirect.
      clearOauthPending();
      return null;
    }
    clearOauthPending();
    stashOauthError(err, oauthProviderLabel(pending));
    throw err;
  }
}

function oauthProviderLabel(pending) {
  const id = String(pending || '');
  if (id.includes('apple')) return 'apple';
  if (id.includes('microsoft')) return 'microsoft';
  return 'google';
}

function googleHelperAuth() {
  const name = 'protop-google-helper';
  const existing = getApps().find((app) => app.name === name);
  const app = existing || initializeApp({
    ...firebaseConfig,
    authDomain: 'protop-c189c.firebaseapp.com',
  }, name);
  return getAuth(app);
}

async function signInWithGoogleHelperRedirect(provider) {
  setOauthPending(provider?.providerId || 'google.com');
  await signInWithRedirect(googleHelperAuth(), provider);
  return null;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  provider.setCustomParameters({ prompt: 'select_account' });

  if (Platform.OS === 'web') {
    // Mobile Safari: full-page redirect through the registered Firebase origin.
    if (prefersRedirectAuth()) {
      return signInWithGoogleHelperRedirect(provider);
    }
    if (!googlePageOriginIsRegistered()) {
      try {
        return await signInWithGoogleViaBridge();
      } catch (bridgeErr) {
        if (mapAuthError(bridgeErr) === 'cancelled') throw bridgeErr;
        if (bridgeErr?.code === 'auth/popup-blocked') {
          return signInWithGoogleHelperRedirect(provider);
        }
        throw bridgeErr;
      }
    }
    try {
      return await signInWithGoogleGis();
    } catch (gisErr) {
      if (mapAuthError(gisErr) === 'cancelled') throw gisErr;
      return signInWithGoogleHelperRedirect(provider);
    }
  }

  const AuthSession = await import('expo-auth-session');
  const WebBrowser = await import('expo-web-browser');
  WebBrowser.maybeCompleteAuthSession();
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'weekplan' });
  const discovery = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
  };
  if (!GOOGLE_WEB_CLIENT_ID) {
    const e = new Error('provider-disabled');
    e.code = 'google-not-configured';
    throw e;
  }
  const request = new AuthSession.AuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID,
    redirectUri,
    scopes: ['openid', 'profile', 'email'],
    responseType: AuthSession.ResponseType.IdToken,
  });
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params?.id_token) {
    throw new Error('cancelled');
  }
  const credential = GoogleAuthProvider.credential(result.params.id_token);
  const cred = await signInWithCredential(auth, credential);
  return cred.user;
}

export async function signInWithApple() {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  provider.setCustomParameters({ locale: 'no' });

  if (Platform.OS === 'web') {
    // Fail fast with a clear message when Apple IdP is missing in Firebase
    // (otherwise popup/redirect can look like a silent page refresh).
    const configured = await isAppleSignInConfigured();
    if (!configured) {
      const e = new Error('provider-disabled');
      e.code = 'auth/operation-not-allowed';
      throw e;
    }
    // Desktop: popup only — redirect often reloads the SPA with no session.
    // Mobile: redirect still needed (popup is unreliable on iOS Safari).
    const mobile = prefersRedirectAuth();
    return signInWithProviderFirebase(provider, { allowRedirect: mobile });
  }

  if (Platform.OS !== 'ios') {
    throw new Error('apple-unavailable');
  }

  const Apple = await import('expo-apple-authentication');
  const available = await Apple.isAvailableAsync();
  if (!available) throw new Error('apple-unavailable');
  const apple = await Apple.signInAsync({
    requestedScopes: [
      Apple.AppleAuthenticationScope.FULL_NAME,
      Apple.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!apple.identityToken) throw new Error('cancelled');
  const credential = provider.credential({ idToken: apple.identityToken });
  const cred = await signInWithCredential(auth, credential);
  return cred.user;
}

let appleConfiguredCache = null;

/** True when Firebase has an Apple IdP config (createAuthUri succeeds). */
export async function isAppleSignInConfigured() {
  if (appleConfiguredCache != null) return appleConfiguredCache;
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    appleConfiguredCache = true; // native uses different path
    return true;
  }
  try {
    const key = firebaseConfig?.apiKey;
    if (!key) {
      appleConfiguredCache = false;
      return false;
    }
    const continueUri = `${window.location.origin}/`;
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ continueUri, providerId: 'apple.com' }),
      },
    );
    const json = await res.json();
    const ok = !json?.error && Boolean(json?.authUri);
    appleConfiguredCache = ok;
    return ok;
  } catch {
    appleConfiguredCache = false;
    return false;
  }
}

/** Reset cache after enabling Apple in Firebase (call on next login attempt if needed). */
export function clearAppleConfigCache() {
  appleConfiguredCache = null;
}

let microsoftConfiguredCache = null;

/** True when Firebase has a Microsoft IdP config (createAuthUri succeeds). */
export async function isMicrosoftSignInConfigured() {
  if (microsoftConfiguredCache != null) return microsoftConfiguredCache;
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    microsoftConfiguredCache = true;
    return true;
  }
  try {
    const key = firebaseConfig?.apiKey;
    if (!key) {
      microsoftConfiguredCache = false;
      return false;
    }
    const continueUri = `${window.location.origin}/`;
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ continueUri, providerId: 'microsoft.com' }),
      },
    );
    const json = await res.json();
    const ok = !json?.error && Boolean(json?.authUri);
    microsoftConfiguredCache = ok;
    return ok;
  } catch {
    microsoftConfiguredCache = false;
    return false;
  }
}

/** Reset cache after enabling Microsoft in Firebase. */
export function clearMicrosoftConfigCache() {
  microsoftConfiguredCache = null;
}

export async function signInWithMicrosoft() {
  const provider = new OAuthProvider('microsoft.com');
  provider.addScope('email');
  provider.addScope('profile');
  provider.addScope('openid');
  provider.setCustomParameters({ prompt: 'select_account' });

  if (Platform.OS === 'web') {
    const configured = await isMicrosoftSignInConfigured();
    if (!configured) {
      const e = new Error('provider-disabled');
      e.code = 'auth/operation-not-allowed';
      throw e;
    }
    // Do NOT use Firebase signInWithRedirect/Popup here: Azure often lacks
    // https://www.protop.no/__/auth/handler (AADSTS50011). Reuse the
    // already-registered /oauth/calendar redirect instead.
    const { beginMicrosoftAccountSignIn } = await import('./calendarIntegration');
    await beginMicrosoftAccountSignIn();
    return null;
  }

  const AuthSession = await import('expo-auth-session');
  const WebBrowser = await import('expo-web-browser');
  WebBrowser.maybeCompleteAuthSession();
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'weekplan' });
  const tenant = process.env.EXPO_PUBLIC_MICROSOFT_TENANT_ID || 'common';
  const clientId = process.env.EXPO_PUBLIC_MICROSOFT_CLIENT_ID;
  if (!clientId) {
    const e = new Error('provider-disabled');
    e.code = 'microsoft-not-configured';
    throw e;
  }
  const discovery = {
    authorizationEndpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenEndpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
  };
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: ['openid', 'profile', 'email', 'User.Read'],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params?.code) {
    throw new Error('cancelled');
  }
  const tokenRes = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier },
    },
    discovery,
  );
  if (!tokenRes.idToken) {
    throw new Error('microsoft-token-failed');
  }
  const credential = provider.credential({ idToken: tokenRes.idToken });
  const cred = await signInWithCredential(auth, credential);
  return cred.user;
}
