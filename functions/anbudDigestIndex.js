/**
 * Morgenvarsel for anbud. Importerer ikke MAIL_API_KEY som defineSecret.
 */
import './setRegion.js';
import { initializeApp, getApps } from 'firebase-admin/app';

if (!getApps().length) initializeApp();

export { anbudDigestDaily } from './anbudDigest.js';
