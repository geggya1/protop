import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

export async function sendVerificationEmailV2(email) {
  const sendVerificationV2 = httpsCallable(functions, 'sendEmailVerificationV2');
  const continueUrl = (typeof window !== 'undefined' && window.location?.origin)
    ? `${window.location.origin}/verify-email`
    : 'https://www.protop.no/verify-email';
  const res = await sendVerificationV2({ email, continueUrl });
  if (!res?.data?.ok) {
    throw new Error(res?.data?.error || 'Kunne ikke sende verifiseringsmail');
  }
}

export async function confirmEmailVerificationV2(token) {
  const fn = httpsCallable(functions, 'confirmEmailVerificationV2');
  const res = await fn({ token });
  if (!res?.data?.ok) {
    throw new Error(res?.data?.error || 'Kunne ikke bekrefte e-post');
  }
  return res.data;
}
