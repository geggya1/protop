/**
 * GIS cannot run on localhost (OAuth JS origins are only protop.no).
 * Local Google uses Firebase: popup first so the Metro tab stays open,
 * then redirect via protop-c189c.firebaseapp.com if the popup is blocked.
 */
export function isLocalGoogleHost(hostname) {
  const host = String(hostname || '');
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
  if (host.endsWith('.localhost')) return true;
  if (/^192\.168\./.test(host) || /^10\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

export function shouldUseFirebaseGoogleOnLocal({ isWeb = false, hostname = '' } = {}) {
  return !!isWeb && isLocalGoogleHost(hostname);
}

/** Popup keeps Metro's tab alive; redirect is the fallback after origin_mismatch. */
export function localGoogleAuthStrategy({ isWeb = false, hostname = '' } = {}) {
  if (!shouldUseFirebaseGoogleOnLocal({ isWeb, hostname })) return 'gis-or-firebase';
  return 'firebase-popup-then-redirect';
}

/** @deprecated use shouldUseFirebaseGoogleOnLocal */
export const shouldUseFirebasePopupForGoogle = shouldUseFirebaseGoogleOnLocal;
