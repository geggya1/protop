/**
 * Deploy entry for Doffin/TED-kall og anbudsforespørsel.
 * Nettleseren på protop.no kaller disse direkte. tenderProxy dekker ikke alle.
 */
import './setRegion.js';
import { initializeApp, getApps } from 'firebase-admin/app';

if (!getApps().length) initializeApp();

export { searchDoffin, searchTed, lookupCompany, fetchDossier } from './doffinSearch.js';
export { sendTenderAlert } from './anbudAlert.js';
export { sendAnbudRequest, scanAnbudDocument } from './anbudIntake.js';
