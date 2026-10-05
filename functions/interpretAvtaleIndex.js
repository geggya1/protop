/**
 * Deploy entry for interpretAvtaleHttp only.
 * Does not import MAIL_API_KEY or ../src, so the GitHub deploy account can ship it.
 *
 * setRegion MUST be the first import so europe-west1 + public invoker are set
 * before onRequest() runs.
 */
import './setRegion.js';
import { initializeApp, getApps } from 'firebase-admin/app';
import './geminiEnv.js';

if (!getApps().length) initializeApp();

export { interpretAvtaleHttp } from './interpretAvtaleHttp.js';
