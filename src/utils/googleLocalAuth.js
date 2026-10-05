/**
 * GIS OAuth client is registered for protop.no only.
 * Local Metro/emulator must use Firebase popup (firebaseapp.com handler).
 */
export function shouldUseFirebasePopupForGoogle({ isWeb = false, hostname = '' } = {}) {
  const host = String(hostname || '');
  const local = host === 'localhost'
    || host === '127.0.0.1'
    || host === '0.0.0.0'
    || host.endsWith('.localhost');
  return !!isWeb && local;
}
