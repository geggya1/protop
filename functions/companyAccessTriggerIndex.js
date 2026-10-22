/**
 * Firestore-triggere for speiling av tilgangsmatrisen. Deployes manuelt
 * (deploy-kontoen i CI kan ikke opprette Firestore-triggere):
 *
 *   node scripts/stage-function-src.mjs stage
 *   (sett "main": "companyAccessTriggerIndex.js" i functions/package.json midlertidig)
 *   npx firebase deploy --only functions:onCompanyAccessChanged,functions:onEmployeeAccessChanged --project protop-c189c
 *   node scripts/stage-function-src.mjs restore
 *
 * Se docs/product/iso-khms/UTRULLING.md.
 */
import './setRegion.js';

export { onCompanyAccessChanged, onEmployeeAccessChanged } from './companyAccessSync.js';
