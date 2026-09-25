/**
 * Deploy entry for the tender proxy only.
 * Does not import MAIL_API_KEY, so the GitHub deploy account can ship it.
 */
import { setGlobalOptions } from 'firebase-functions/v2/options';

setGlobalOptions({ region: 'europe-west1' });

export { tenderProxy } from './tenderProxy.js';
