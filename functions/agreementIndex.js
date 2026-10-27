/**
 * Deploy entry for avtalebehandling.
 * Uses PROTOP_MAIL_KEY / runtime MAIL_API_KEY, not defineSecret.
 */
import './setRegion.js';
import { initializeApp, getApps } from 'firebase-admin/app';

if (!getApps().length) initializeApp();

export { agreementTreatment } from './agreementTreatment.js';
