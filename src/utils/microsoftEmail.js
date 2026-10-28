import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

/**
 * Etter Microsoft-innlogging: la serveren sjekke Microsofts eget ID-token (SEC-17).
 * Sier Microsoft at e-posten er bekreftet, merkes kontoen, og invitasjoner på e-post
 * knyttes som for andre. Ellers må personen bekrefte e-posten med lenken fra ProTop.
 * Feiler stille: innloggingen er allerede fullført.
 */
export async function confirmMicrosoftEmail(user, idToken) {
  if (!user || !idToken || user.emailVerified) return null;
  try {
    const res = await httpsCallable(functions, 'confirmMicrosoftEmail')({ idToken });
    if (res?.data?.verified) {
      // Nytt token med email_verified, og currentUser.emailVerified oppdateres.
      await user.reload().catch(() => {});
      await user.getIdToken(true).catch(() => {});
    }
    return res?.data || null;
  } catch {
    return null;
  }
}
