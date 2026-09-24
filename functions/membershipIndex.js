/**
 * Deploy entry for membership/join helpers only.
 * Avoids importing MAIL_API_KEY / GEMINI secrets so the GitHub deploy SA can ship
 * listMyFamilies without Secret Manager access.
 */
import { setGlobalOptions } from 'firebase-functions/v2/options';

setGlobalOptions({ region: 'europe-west1' });

export {
  resolveJoinCode,
  submitJoinRequestByCode,
  listMyFamilies,
} from './joinCallables.js';

export { deleteMyAccount } from './deleteAccount.js';
