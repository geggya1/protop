/** Auth/onboarding paths — must not win linking after a successful sign-in. */
export const AUTH_ENTRY_PATHS = new Set([
  'signup',
  'login',
  'register',
  'start',
  'forgot-password',
  'language',
  'legal',
]);

export function isAuthEntryPath(path) {
  const pathOnly = String(path || '').split('?')[0].replace(/^\/+|\/+$/g, '');
  const head = pathOnly.split('/')[0] || '';
  return AUTH_ENTRY_PATHS.has(head);
}

/**
 * When signed in, auth entry URLs must resolve to Home — otherwise /signup
 * remounts AuthChoice after «Henter familien din…».
 */
export function resolveAuthEntryLinkState(path, { signedIn } = {}) {
  if (signedIn && isAuthEntryPath(path)) {
    return { routes: [{ name: 'Home' }] };
  }
  return null;
}
