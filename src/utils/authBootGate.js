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

/**
 * «Laster ProTop…» while a personal workspace is created.
 * The create call must not keep the spinner after the boot timeout.
 * A rerun of that effect used to leave the busy flag on forever.
 * `ensuring`: opprettelsen pågår eller har ikke startet. Når den har svart (også med feil
 * eller tidsavbrudd), slippes brukeren videre i stedet for å vente på tidsavbruddet,
 * som aldri kommer når profil og gruppeliste allerede er lest (ANSATT-08).
 */
export function shouldHoldFamilyBootSpinner({ bootTimedOut = false, ensuring = true } = {}) {
  return !bootTimedOut && ensuring !== false;
}
