/**
 * GIS + Firebase popup send JavaScript origin = localhost:8081.
 * That OAuth client only allows protop.no → Error 400 origin_mismatch.
 * Local Google must use Firebase redirect via protop-c189c.firebaseapp.com.
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

/** @deprecated use shouldUseFirebaseGoogleOnLocal */
export const shouldUseFirebasePopupForGoogle = shouldUseFirebaseGoogleOnLocal;
