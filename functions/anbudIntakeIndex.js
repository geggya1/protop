/**
 * Deploy entry for scanAnbudDocumentHttp only.
 * Same-origin Hosting rewrite — avoid callable CORS from protop.no.
 *
 * setRegion MUST be the first import so europe-west1 + public invoker are set
 * before onRequest() runs.
 */
import './setRegion.js';
import { initializeApp, getApps } from 'firebase-admin/app';
import './geminiEnv.js';

if (!getApps().length) initializeApp();

export { scanAnbudDocumentHttp } from './anbudIntakeHttp.js';
