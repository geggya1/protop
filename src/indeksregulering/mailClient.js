import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import { indexLetterMessage } from './mail.js';

export async function sendIndexLetter(input) {
  const message = indexLetterMessage(input);
  if (!message.to) throw new Error('Kunden mangler e-post.');
  if (message.text.length < 20) throw new Error('Brevet er for kort til å sendes.');
  const call = httpsCallable(functions, 'sendIndeksLetter', { timeout: 30000 });
  const result = await call(message);
  return { ...message, ...(result?.data || {}) };
}
