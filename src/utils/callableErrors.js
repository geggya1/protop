/**
 * Forståelige meldinger når et kall til serveren (Firebase callable) feiler.
 * Uten nett svarer Firebase bare «internal» (code functions/internal). Det skal
 * aldri vises rått (SOS-17).
 */

export const NETWORK_ERROR_TEXT = 'Fikk ikke kontakt med ProTop. Sjekk nettet og prøv igjen.';

function isOffline() {
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  } catch {
    return false;
  }
}

function errorCode(err) {
  return String(err?.code || '').replace(/^functions\//, '').toLowerCase();
}

function errorText(err) {
  if (err == null) return '';
  if (typeof err === 'string') return err.trim();
  return String(err.message || '').replace(/^FirebaseError:\s*/i, '').trim();
}

/**
 * Tekst til brukeren for en feil fra et serverkall.
 * `fallback` beskriver hva som ikke gikk («Kunne ikke legge til ICS-kalender.»).
 * `offline` kan settes i tester; ellers brukes navigator.onLine.
 */
export function friendlyCallableError(err, fallback = 'Noe gikk galt.', { offline = isOffline() } = {}) {
  const raw = errorText(err);
  const code = errorCode(err);
  const base = String(fallback || 'Noe gikk galt.').trim();
  if (offline || /failed to fetch|networkerror|network request failed|load failed|err_internet_disconnected/i.test(raw)) {
    return NETWORK_ERROR_TEXT;
  }
  if (['internal', 'unavailable', 'deadline-exceeded'].includes(code)
    || /^(internal|unavailable|deadline-exceeded|timeout)$/i.test(raw)) {
    return `${base} Sjekk nettet og prøv igjen.`;
  }
  if (code === 'resource-exhausted' || /^for mange/i.test(raw)) {
    // Klientens egen grense nevner funksjonsnavnet («For mange kall til listCalendarConnections»).
    if (!raw || /[a-z][A-Z]/.test(raw)) return 'For mange forsøk på kort tid. Vent litt og prøv igjen.';
    return raw;
  }
  if (code === 'unauthenticated') return 'Du er logget ut. Logg inn på nytt og prøv igjen.';
  if (code === 'permission-denied' || /PERMISSION_DENIED|insufficient permissions/i.test(raw)) {
    return 'Du har ikke tilgang til dette.';
  }
  if (code === 'not-found' && (!raw || /^not[-_ ]found$|function|404/i.test(raw))) {
    return 'Tjenesten er ikke tilgjengelig akkurat nå. Prøv igjen senere.';
  }
  if (!raw || /^(not-found|not_found|unknown|cancelled|aborted|invalid-argument)$/i.test(raw)
    || /functions\/|firebase|access-control-allow-origin/i.test(raw)) {
    return base;
  }
  return raw;
}
