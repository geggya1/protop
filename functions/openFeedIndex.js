/**
 * Deploy entry for fetchOpenFeed only.
 * Does not import MAIL_API_KEY / GEMINI_API_KEY, so GitHub's deploy SA can ship it.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2/options';

if (!getApps().length) initializeApp();
setGlobalOptions({ region: 'europe-west1', invoker: 'public' });

export { fetchOpenFeed } from './openFeed.js';
