import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import { indexLetterMessage } from './mail.js';
import { openCompanyId } from '../project/companyAlias.js';

export async function sendIndexLetter(input) {
  const message = indexLetterMessage(input);
  if (!message.to) throw new Error('Kunden mangler e-post.');
  if (message.text.length < 20) throw new Error('Brevet er for kort til å sendes.');
  // Serveren sender bare for medlemmer av bedriften brevet gjelder.
  const familyId = String(input?.familyId || openCompanyId() || '').trim();
  if (!familyId) throw new Error('Velg bedriften før varselet sendes.');
  const call = httpsCallable(functions, 'sendIndeksLetter', { timeout: 30000 });
  const result = await call({ ...message, familyId });
  return { ...message, ...(result?.data || {}) };
}
