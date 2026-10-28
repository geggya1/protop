import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

/**
 * Finnes organisasjonsnummeret i ProTop? Andres bedrifter kan ikke leses fra appen,
 * så serveren svarer med { id, name, member } eller null.
 */
export async function findCompanyByOrgnr(orgnr) {
  const res = await httpsCallable(functions, 'findCompanyByOrgnr')({ orgnr });
  return res?.data?.company || null;
}

/**
 * Knytt bedriftens orgnummer til bedriften i oppslaget (orgnrIndex på serveren).
 * Har en annen bedrift orgnummeret fra før, beholder den oppslaget: svaret er da
 * { claimed: false, taken: { id, name } }.
 */
export async function claimCompanyOrgnr(familyId) {
  const res = await httpsCallable(functions, 'claimCompanyOrgnr')({ familyId });
  return res?.data || null;
}
