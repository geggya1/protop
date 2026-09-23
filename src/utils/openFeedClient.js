/**
 * Klientkall mot fetchOpenFeed når nettleseren blokkerer CORS.
 */
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../../firebase';

export async function proxyOpenFeed(url) {
  const user = auth.currentUser;
  if (user) {
    try { await user.getIdToken(); } catch { /* callable still sends auth if present */ }
  }
  const fn = httpsCallable(functions, 'fetchOpenFeed', { timeout: 20000 });
  const res = await fn({ url });
  const body = res?.data?.body;
  if (typeof body !== 'string' || !body) {
    throw new Error('Tomt svar fra kilden');
  }
  return body;
}
