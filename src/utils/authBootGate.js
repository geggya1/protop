/**
 * Whether a logged-out /hjem|/start hit may bounce to the marketing homepage.
 * Must stay false while auth is still restoring — otherwise signed-in PWA
 * cold starts clear prefer_app and navigate away mid-"Laster ProTop…".
 */
export function shouldRedirectStartUrlToMarketing({
  authBootstrapped,
  loading,
  user,
  justRegisteredEmail,
  oauthReturn,
} = {}) {
  if (!authBootstrapped || loading) return false;
  if (user || justRegisteredEmail) return false;
  if (oauthReturn) return false;
  return true;
}
