import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const PUSH_ASKED_KEY = 'weekplan_native_push_asked_v1';

function isNative() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function tokenDocId(token) {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = ((hash << 5) - hash) + token.charCodeAt(i);
    hash |= 0;
  }
  return `expo_${Math.abs(hash).toString(36)}`;
}

function projectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId
    || Constants.easConfig?.projectId
    || process.env.EAS_PROJECT_ID
    || process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    || ''
  );
}

export function nativePushSupported() {
  return isNative();
}

async function getNotificationsModule() {
  return import('expo-notifications');
}

async function getDeviceModule() {
  try {
    return await import('expo-device');
  } catch {
    return null;
  }
}

export async function configureNativePushHandler() {
  if (!nativePushSupported()) return;
  try {
    const Notifications = await getNotificationsModule();
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'ProTop',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563eb',
      });
    }
  } catch (e) {
    console.warn('[nativePush] handler setup failed', e?.message || e);
  }
}

export async function ensureNativeNotificationPermission() {
  if (!nativePushSupported()) return 'unsupported';
  const Notifications = await getNotificationsModule();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.status === 'granted') return 'granted';
  if (current.status === 'denied' && !current.canAskAgain) return 'denied';
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted || asked.status === 'granted' ? 'granted' : asked.status || 'denied';
}

export async function getExpoPushTokenSafe() {
  if (!nativePushSupported()) return null;
  const Notifications = await getNotificationsModule();
  const Device = await getDeviceModule();
  if (Device && Device.isDevice === false) {
    // Simulators rarely have push; still try so Expo Go / preview can work when available.
    console.warn('[nativePush] Not a physical device — Expo push may be unavailable');
  }
  const easId = projectId();
  try {
    const tokenResult = easId
      ? await Notifications.getExpoPushTokenAsync({ projectId: easId })
      : await Notifications.getExpoPushTokenAsync();
    return tokenResult?.data || null;
  } catch (e) {
    console.warn('[nativePush] getExpoPushTokenAsync failed', e?.message || e);
    return null;
  }
}

export async function saveExpoPushSubscription(uid, token) {
  if (!uid || !token) return;
  const id = tokenDocId(token);
  await setDoc(doc(db, 'users', uid, 'pushSubscriptions', id), {
    type: 'expo',
    token,
    platform: Platform.OS,
    endpoint: `expo:${token}`,
    keys: {},
    projectId: projectId() || null,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function removeExpoPushSubscription(uid, token) {
  if (!uid || !token) return;
  const id = tokenDocId(token);
  await deleteDoc(doc(db, 'users', uid, 'pushSubscriptions', id)).catch(() => {});
}

export async function ensureNativePushSubscription(uid) {
  if (!uid || !nativePushSupported()) return null;
  await configureNativePushHandler();
  const permission = await ensureNativeNotificationPermission();
  if (permission !== 'granted') return null;
  const token = await getExpoPushTokenSafe();
  if (!token) return null;
  await saveExpoPushSubscription(uid, token);
  return { token, type: 'expo' };
}

export async function disableNativePushSubscription(uid) {
  if (!nativePushSupported()) return;
  try {
    const token = await getExpoPushTokenSafe();
    if (token) await removeExpoPushSubscription(uid, token);
  } catch {
    /* ignore */
  }
}

export async function getNativePushStatus() {
  if (!nativePushSupported()) {
    return { supported: false, permission: 'unsupported', subscribed: false };
  }
  try {
    const Notifications = await getNotificationsModule();
    const perms = await Notifications.getPermissionsAsync();
    const permission = perms.granted || perms.status === 'granted'
      ? 'granted'
      : (perms.status || 'denied');
    let subscribed = false;
    if (permission === 'granted') {
      const token = await getExpoPushTokenSafe();
      subscribed = !!token;
    }
    return { supported: true, permission, subscribed, standalone: true };
  } catch {
    return { supported: true, permission: 'denied', subscribed: false };
  }
}

export async function showNativeLocalNotification({ title, body, tag, data } = {}) {
  if (!nativePushSupported()) return null;
  try {
    const Notifications = await getNotificationsModule();
    return Notifications.scheduleNotificationAsync({
      content: {
        title: title || 'ProTop',
        body: body || '',
        data: data || {},
        sound: true,
      },
      trigger: null,
      identifier: tag || undefined,
    });
  } catch (e) {
    console.warn('[nativePush] local notification failed', e?.message || e);
    return null;
  }
}

export function nativePushAskedKey() {
  return PUSH_ASKED_KEY;
}

/** Subscribe to notification response (tap) and return unsubscribe. */
export async function addNativeNotificationResponseListener(handler) {
  if (!nativePushSupported()) return () => {};
  try {
    const Notifications = await getNotificationsModule();
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data || {};
      handler(data);
    });
    return () => {
      try { sub.remove(); } catch { /* ignore */ }
    };
  } catch {
    return () => {};
  }
}
