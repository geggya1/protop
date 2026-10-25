/**
 * Deploy entry for indeksregulering: tolkning av avtalen og utsending av brevet.
 * Does not import MAIL_API_KEY. Gemini key comes from functions/.env; the mail key
 * is resolved at runtime (resolveMailApiKey).
 */
import './setRegion.js';
import { initializeApp, getApps } from 'firebase-admin/app';

if (!getApps().length) initializeApp();

export { interpretIndeksAvtale } from './indeksreguleringAi.js';
export { sendIndeksLetter } from './indeksLetter.js';
