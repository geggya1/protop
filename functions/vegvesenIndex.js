/**
 * Deploy entry for Vegvesen kjøretøyoppslag.
 * Does not import MAIL_API_KEY / GEMINI_API_KEY, so GitHub's deploy SA can ship it.
 *
 * Runtime env: VEGVESEN_API_KEY (optional until configured).
 * Rate limiting needs Admin/Firestore — initialize here and in vegvesenLookup.js.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2/options';

if (!getApps().length) initializeApp();
setGlobalOptions({ region: 'europe-west1' });

export { lookupVehicleByReg } from './vegvesenLookup.js';
