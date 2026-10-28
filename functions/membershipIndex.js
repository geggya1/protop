/**
 * Deploy entry for membership/join helpers only.
 * Avoids importing MAIL_API_KEY / GEMINI secrets so the GitHub deploy SA can ship
 * listMyFamilies without Secret Manager access.
 */
import './setRegion.js';

export {
  resolveJoinCode,
  submitJoinRequestByCode,
  approveJoinRequest,
  listMyFamilies,
} from './joinCallables.js';

export { deleteMyAccount } from './deleteAccount.js';
export { recordConsent } from './consentLog.js';
// «Rediger profil»: navn, bilde og telefon til medlemskapene og koblede ansattkort (DS-07).
export { syncMyProfile } from './profileSync.js';
// Avslutning av bedriften, eksport og sletting etter 90 dager (GRUNN-03).
export {
  closeCompany, reopenCompany, exportCompanyData, purgeClosedCompanies,
} from './companyClosure.js';
