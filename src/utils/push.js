/**
 * Unified push helpers — web (VAPID) + native (Expo push tokens).
 */
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from '../../firebase';
import * as web from './webPush';
import * as native from './nativePush';

export {
  PUSH_SW_PATH,
  registerPushServiceWorker,
  isStandaloneDisplay,
  isLikelyIos,
  webPushSupported,
  webPushReadyForDevice,
  beginNotificationPermissionFromGesture,
  completePushSubscription,
} from './webPush';

export function pushSupported() {
  if (Platform.OS === 'web') return web.webPushSupported();
  return native.nativePushSupported();
}

export async function ensureNotificationPermission() {
  if (Platform.OS === 'web') return web.ensureNotificationPermission();
  return native.ensureNativeNotificationPermission();
}

export async function ensurePushSubscription(uid) {
  if (Platform.OS === 'web') return web.ensurePushSubscription(uid);
  return native.ensureNativePushSubscription(uid);
}

/**
 * Button-tap flow: request permission in the same gesture (iOS), then subscribe.
 * @returns {Promise<{ ok: boolean, reason?: string|null, permission?: string, message?: string }>}
 */
export async function enablePushFromUserGesture(uid) {
  if (Platform.OS === 'web') return web.enablePushFromUserGesture(uid);
  try {
    const sub = await native.ensureNativePushSubscription(uid);
    return sub
      ? { ok: true, reason: null, permission: 'granted' }
      : { ok: false, reason: 'permission', permission: 'denied' };
  } catch (err) {
    return { ok: false, reason: 'subscribe', message: err?.message || String(err) };
  }
}

export async function disablePushSubscription(uid) {
  if (Platform.OS === 'web') return web.disablePushSubscription(uid);
  return native.disableNativePushSubscription(uid);
}

export async function getPushStatus() {
  if (Platform.OS === 'web') return web.getPushStatus();
  return native.getNativePushStatus();
}

/**
 * Testvarsel til egen bruker. Serveren sender det som push til alle enhetene
 * der push er slått på, så brukeren ser at det virker.
 */
export async function sendTestPush(uid) {
  if (!uid) return false;
  const id = `pushtest_${Date.now()}`;
  await setDoc(doc(db, 'users', uid, 'notifications', id), {
    eventType: 'pushTest',
    title: 'ProTop',
    body: 'Push-varsler virker på denne enheten.',
    pushTest: true,
    createdBy: uid,
    createdAt: serverTimestamp(),
    seen: true,
  });
  return true;
}

export function showLocalNotification(opts) {
  if (Platform.OS === 'web') return web.showLocalNotification(opts);
  return native.showNativeLocalNotification(opts);
}

export async function configurePushHandlers() {
  if (Platform.OS === 'web') {
    return web.registerPushServiceWorker();
  }
  return native.configureNativePushHandler();
}

export async function addPushOpenListener(handler) {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return () => {};
    const onOpen = (ev) => handler(ev?.detail || {});
    window.addEventListener('protop-open-notification', onOpen);
    return () => window.removeEventListener('protop-open-notification', onOpen);
  }
  return native.addNativeNotificationResponseListener(handler);
}
