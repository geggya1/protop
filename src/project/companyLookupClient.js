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
