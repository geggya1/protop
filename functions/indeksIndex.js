/**
 * Deploy entry for interpretIndeksAvtale only.
 * Does not import MAIL_API_KEY. Gemini key comes from functions/.env.
 */
import './setRegion.js';
import { initializeApp, getApps } from 'firebase-admin/app';

if (!getApps().length) initializeApp();

export { interpretIndeksAvtale } from './indeksreguleringAi.js';
