/**
 * Deploy entry for hospitality functions only.
 * Does not import MAIL_API_KEY / GEMINI_API_KEY Secret Manager params, so the
 * GitHub deploy SA can ship Sign-in / sync / Nuki without secretmanager access.
 */
import './setRegion.js';
import { initializeApp, getApps } from 'firebase-admin/app';

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
} from './hospitality.js';

export {
  hospGetChannelStatus,
  hospSavePartnerCredentials,
  hospAirbnbExchangeToken,
  hospBookingConnectProperty,
  hospSyncChannelOAuth,
  hospDisconnectChannel,
} from './hospitalityOauth.js';
