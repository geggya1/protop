/**
 * «Rediger profil» → syncMyProfile (functions/profileSync.js): navn, bilde og telefon fra
 * users/{uid} til medlemskapene i alle selskaper og til koblede ansattkort (DS-07).
 * previous: det profilen viste før lagringen, så serveren vet hvilke felt på ansattkortet
 * som fulgte profilen.
 * Feiler stille: profilen er lagret uansett, og neste lagring prøver igjen.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

export async function syncMyProfile(previous = null) {
  try {
    const call = httpsCallable(functions, 'syncMyProfile', { timeout: 30000 });
    const result = await call({ previous: previous || null });
    return result.data || { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error || '') };
  }
}
