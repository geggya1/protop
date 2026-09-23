import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

export async function setMemberPassword({ uid, password, familyId }) {
  const fn = httpsCallable(functions, 'setMemberPassword');
  const res = await fn({ uid, password, familyId: familyId || null });
  if (!res?.data?.ok) {
    throw new Error(res?.data?.error || 'Kunne ikke endre passord');
  }
}
