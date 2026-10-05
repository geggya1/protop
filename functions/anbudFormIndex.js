/**
 * Deploy entry for generateCompanyForm only.
 * Does not import MAIL_API_KEY, so the GitHub deploy account can ship it.
 *
 * setRegion MUST be the first import so europe-west1 + public invoker are set
 * before onCall() runs (body setGlobalOptions is too late).
 */
import './setRegion.js';
import { initializeApp, getApps } from 'firebase-admin/app';
import './geminiEnv.js';

if (!getApps().length) initializeApp();

export { generateCompanyForm } from './anbudForm.js';
