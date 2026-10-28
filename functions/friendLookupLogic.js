/**
 * Regler for venneoppslaget (lookupFriendProfile), uten Firebase.
 *
 * Oppslag på e-post eller telefon kan brukes til å kartlegge hvem som har konto.
 * Derfor har de en egen, lavere grense per bruker, og svaret inneholder bare det
 * appen trenger for å sende forespørselen: uid. Navn og brukernavn gis bare ved
 * oppslag på @brukernavn, som allerede er offentlig (QR-koden).
 */

export const LOOKUP_LIMITS = {
  // Alle oppslag.
  any: { hourlyLimit: 40, dailyLimit: 150 },
  // E-post og telefon. Én invitasjon kan prøve både e-post og telefon.
  contact: { hourlyLimit: 15, dailyLimit: 40 },
};

/** Hvilke grenser et oppslag teller mot (per innlogget bruker). kind: 'email' | 'phone' | 'username'. */
export function lookupRateScopes(kind) {
  if (kind === 'email' || kind === 'phone') return ['any', 'contact'];
  return ['any'];
}

/**
 * Det svaret får inneholde. Ved e-post/telefon bare uid (og tomme felt, så formen er lik).
 * Ved brukernavn også navn og brukernavn. Aldri e-post, telefon, bilde eller rolle.
 */
export function lookupProfileFields(uid, data = {}, kind = 'username') {
  if (!uid) return null;
  if (kind === 'email' || kind === 'phone') {
    return { uid, name: '', username: '' };
  }
  return {
    uid,
    name: String(data.displayName || data.name || data.username || 'Bruker').slice(0, 80),
    username: String(data.username || '').slice(0, 40),
  };
}
