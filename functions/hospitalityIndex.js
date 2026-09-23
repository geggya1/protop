/**
 * Deploy entry for hospitality functions only.
 * Does not import MAIL_API_KEY / GEMINI_API_KEY Secret Manager params, so the
 * GitHub deploy SA can ship Sign-in / sync / Nuki without secretmanager access.
 */
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { initializeApp, getApps } from 'firebase-admin/app';

setGlobalOptions({ region: 'europe-west1' });
if (!getApps().length) initializeApp();

export {
  hospSaveNukiToken,
  hospGetNukiStatus,
  hospDisconnectNuki,
  hospSyncNukiLocks,
  hospProvisionLockCode,
  hospRevokeLockCode,
  hospSyncChannelIcal,
  hospConnectIcal,
  hospSyncAllChannels,
  hospProcessAutomessages,
  hospGenerateReplyDraft,
  hospLoginChecklist,
  hospScheduledSync,
} from './hospitality.js';

export {
  hospGetChannelStatus,
  hospSavePartnerCredentials,
  hospAirbnbExchangeToken,
  hospBookingConnectProperty,
  hospSyncChannelOAuth,
  hospDisconnectChannel,
} from './hospitalityOauth.js';
