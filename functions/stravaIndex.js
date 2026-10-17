/**
 * Deploy entry for Strava. Region settes før onCall(), og Admin initialiseres
 * her fordi strava.js selv ikke kaller initializeApp.
 */
import './setRegion.js';
import { initializeApp, getApps } from 'firebase-admin/app';

if (!getApps().length) initializeApp();

export {
  getStravaAppStatus,
  saveStravaAppConfig,
  stravaExchangeToken,
  stravaSyncActivities,
  stravaDisconnect,
  stravaWebhook,
  registerStravaWebhook,
} from './strava.js';
