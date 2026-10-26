/**
 * Push for alle varsler. Egen inngang: Firestore-trigger, ikke i samme deploy
 * som kallbare funksjoner. VAPID-nøkkelen hentes i kjøring (runtimeSecret.js).
 */
import './setRegion.js';

export { onNotificationPush } from './notifyPush.js';
