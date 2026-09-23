import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from '../../firebase';
import { VAPID_PUBLIC_KEY } from '../constants/vapid';
import { isFirestorePermissionError, waitForFirestoreAccess } from './firestoreAccess';

export const PUSH_SW_PATH = '/push-sw.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function subscriptionDocId(endpoint) {
  let hash = 0;
  for (let i = 0; i < endpoint.length; i += 1) {
    hash = ((hash << 5) - hash) + endpoint.charCodeAt(i);
    hash |= 0;
  }
  return `s_${Math.abs(hash).toString(36)}`;
}

export function webPushSupported() {
  return Platform.OS === 'web'
    && typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/** True when the site is installed to the home screen (standalone PWA). */
export function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false;
  if (window.navigator?.standalone === true) return true;
  try {
    return window.matchMedia?.('(display-mode: standalone)')?.matches === true;
  } catch {
    return false;
  }
}

export function isLikelyIos() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as Mac with touch
  return /Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
}

/**
 * iOS only supports Web Push for apps saved to the home screen (16.4+).
 * In Safari-tab mode, PushManager may exist but subscription fails silently.
 */
export function webPushReadyForDevice() {
  if (!webPushSupported()) return false;
  if (isLikelyIos() && !isStandaloneDisplay()) return false;
  return true;
}

async function waitForActiveWorker(registration, timeoutMs = 8000) {
  if (registration?.active) return registration.active;
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (registration?.active) {
        resolve(registration.active);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(tick, 100);
    };
    registration?.addEventListener?.('updatefound', () => {
      const worker = registration.installing || registration.waiting;
      worker?.addEventListener?.('statechange', () => {
        if (worker.state === 'activated') resolve(worker);
      });
    });
    tick();
  });
}

export async function registerPushServiceWorker() {
  if (!webPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.register(PUSH_SW_PATH, {
      scope: '/',
      updateViaCache: 'none',
    });
    try { registration.update(); } catch { /* ignore */ }
    await waitForActiveWorker(registration);
    await navigator.serviceWorker.ready.catch(() => null);
    return registration;
  } catch (e) {
    console.warn('[webPush] SW register failed', e?.message || e);
    return null;
  }
}

export async function ensureNotificationPermission() {
  if (!webPushSupported()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Start permission prompt SYNCHRONOUSLY from a user gesture.
 * iOS/WebKit drops the prompt if anything is awaited before this call
 * (Apple: request from the gesture handler without intervening awaits).
 * @returns {Promise<'granted'|'denied'|'default'|string>}
 */
export function beginNotificationPermissionFromGesture() {
  if (!webPushSupported()) return Promise.resolve('denied');
  if (Notification.permission === 'granted') return Promise.resolve('granted');
  if (Notification.permission === 'denied') return Promise.resolve('denied');
  try {
    // Do NOT await before this line — keep transient activation.
    return Promise.resolve(Notification.requestPermission());
  } catch {
    return Promise.resolve(Notification.permission || 'denied');
  }
}

export async function savePushSubscription(uid, subscription) {
  if (!uid || !subscription?.endpoint) return;
  const json = subscription.toJSON?.() || {};
  const id = subscriptionDocId(subscription.endpoint);
  await setDoc(doc(db, 'users', uid, 'pushSubscriptions', id), {
    endpoint: subscription.endpoint,
    keys: json.keys || {},
    expirationTime: json.expirationTime || null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    standalone: isStandaloneDisplay(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function removePushSubscription(uid, subscription) {
  if (!uid || !subscription?.endpoint) return;
  const id = subscriptionDocId(subscription.endpoint);
  await deleteDoc(doc(db, 'users', uid, 'pushSubscriptions', id)).catch(() => {});
}

/**
 * After permission is known, register SW + subscribe + save.
 * Prefer enablePushFromUserGesture() for button taps on iOS.
 */
export async function completePushSubscription(uid, permission) {
  if (!uid || !webPushSupported()) {
    return { ok: false, reason: 'unsupported', permission: permission || 'denied' };
  }
  if (!webPushReadyForDevice()) {
    return {
      ok: false,
      reason: isLikelyIos() && !isStandaloneDisplay() ? 'ios-tab' : 'unsupported',
      permission: permission || Notification.permission,
    };
  }
  if (permission !== 'granted') {
    return {
      ok: false,
      reason: permission === 'denied' ? 'denied' : 'permission',
      permission,
    };
  }

  try {
    const registration = await registerPushServiceWorker()
      || await navigator.serviceWorker.ready.catch(() => null);
    if (!registration?.pushManager) {
      console.warn('[webPush] no pushManager after SW register');
      return { ok: false, reason: 'no-sw', permission };
    }

    await waitForActiveWorker(registration);

    let subscription = await registration.pushManager.getSubscription();
    const json = subscription?.toJSON?.() || {};
    const hasKeys = !!(json.keys?.p256dh && json.keys?.auth);
    if (!subscription || !hasKeys) {
      if (subscription) {
        try { await subscription.unsubscribe(); } catch { /* ignore */ }
      }
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await waitForFirestoreAccess(uid);
    try {
      await savePushSubscription(uid, subscription);
    } catch (saveErr) {
      if (isFirestorePermissionError(saveErr)) {
        await waitForFirestoreAccess(uid);
        await savePushSubscription(uid, subscription);
      } else {
        throw saveErr;
      }
    }
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[webPush] subscribed', { endpoint: !!subscription?.endpoint });
    }
    return { ok: true, reason: null, permission: 'granted', subscription };
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[webPush] subscribe failed', err?.name, err?.message || err);
    }
    return {
      ok: false,
      reason: 'subscribe',
      permission: 'granted',
      message: err?.message || String(err),
    };
  }
}

/**
 * Full enable flow for a button tap — permission first (sync), then subscribe.
 * Returns a structured result so UI can show why nothing appeared.
 */
export async function enablePushFromUserGesture(uid) {
  const permissionPromise = beginNotificationPermissionFromGesture();
  const permission = await permissionPromise;
  return completePushSubscription(uid, permission);
}

export async function ensurePushSubscription(uid) {
  if (!uid || !webPushSupported()) return null;
  if (!webPushReadyForDevice()) return null;
  const permission = await ensureNotificationPermission();
  const result = await completePushSubscription(uid, permission);
  return result.ok ? result.subscription : null;
}

export async function disablePushSubscription(uid) {
  if (!webPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await removePushSubscription(uid, subscription);
      await subscription.unsubscribe().catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

/** Current push readiness for UI (banner / settings). */
export async function getPushStatus() {
  if (!webPushSupported()) {
    return { supported: false, permission: 'unsupported', subscribed: false, standalone: false };
  }
  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'denied';
  const standalone = isStandaloneDisplay();
  let subscribed = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_PATH)
      || await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager?.getSubscription();
    subscribed = !!sub?.endpoint;
  } catch { /* ignore */ }
  return {
    supported: true,
    permission,
    subscribed,
    standalone,
    iosSafariTab: isLikelyIos() && !standalone,
  };
}

export function showLocalNotification({ title, body, tag, data } = {}) {
  if (!webPushSupported()) return null;
  if (Notification.permission !== 'granted') return null;
  try {
    const n = new Notification(title || 'ProTop', {
      body: body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: tag || 'weekplan',
      data: data || {},
    });
    n.onclick = () => {
      try { window.focus(); } catch {}
      n.close();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('weekplan-open-notification', { detail: data || {} }));
      }
    };
    return n;
  } catch {
    return null;
  }
}
