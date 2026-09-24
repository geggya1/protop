import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { resolveLoginEmail } from './usernames';

export async function sendPasswordResetV2(identifier) {
  const resolved = await resolveLoginEmail(identifier);
  const email = resolved || String(identifier || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Skriv inn e-postadressen som er knyttet til kontoen.');
  }
  const sendReset = httpsCallable(functions, 'sendPasswordResetV2');
  const continueUrl = (typeof window !== 'undefined' && window.location?.origin)
    ? `${window.location.origin}/login`
    : 'https://www.protop.no/login';
  const res = await sendReset({ email, continueUrl });
  if (!res?.data?.ok) {
    throw new Error(res?.data?.error || 'Kunne ikke sende tilbakestillingsmail');
  }
}
