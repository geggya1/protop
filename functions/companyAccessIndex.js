/**
 * Deploy-inngang for speiling av tilgangsmatrisen (callable).
 * Regionen må settes før callable-modulene lastes.
 */
import './setRegion.js';

export { syncCompanyAccess } from './companyAccessSync.js';
