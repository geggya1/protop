/**
 * Push for alle varsler i users/{uid}/notifications: web push (nettleser og PWA)
 * og Expo (app). Brukes av triggeren i notifyPush.js. Avhengigheter kan byttes i tester.
 */
import webpush from 'web-push';
import * as logger from 'firebase-functions/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT } from './vapid.js';
import { resolveRuntimeSecret } from './runtimeSecret.js';
import { assertRateLimit, hashRateKey } from './security.js';

const PRODUCT = 'ProTop';
// Vern mot at én avsender kan oversvømme én mottaker med push.
const PAIR_LIMIT_PER_HOUR = 120;

function text(value) {
  return String(value ?? '').trim();
}

export function vapidPrivateKey(options = {}) {
  return resolveRuntimeSecret('VAPID_PRIVATE_KEY', {
    envNames: ['VAPID_PRIVATE_KEY', 'WEEKPLAN_VAPID_PRIVATE_KEY'],
    ...options,
  });
}

export function pushPayloadFor(notifId, notif = {}) {
  const chatId = text(notif.chatId);
  return {
    title: text(notif.title) || PRODUCT,
    body: text(notif.body).slice(0, 280),
    eventType: text(notif.eventType),
    chatId,
    familyId: text(notif.familyId),
    friendChat: notif.friendChat ? '1' : '',
    friendUid: text(notif.friendUid),
    inviteId: text(notif.inviteId),
    gameId: text(notif.gameId),
    gameType: text(notif.gameType),
    notificationId: text(notifId),
    // Samme tag per chat: en ny melding erstatter forrige varsel i stedet for å hope seg opp.
    tag: chatId ? `chat_${chatId}` : (text(notifId) || 'protop'),
  };
}

export function pushChannelOn(prefs, eventType) {
  if (prefs?.enabled === false) return false;
  const value = prefs?.events?.[eventType]?.push;
  return typeof value === 'boolean' ? value : true;
}

/**
 * Alle varseltyper gir push, med disse unntakene:
 * - varsler appen lager til seg selv (den viser dem lokalt), unntatt testvarsel,
 * - brukeren har slått av push for typen eller alle varsler,
 * - samme avsender har sendt over grensen til samme mottaker siste time.
 */
export async function pushDecision({ db, uid, notif = {}, rateLimit = assertRateLimit }) {
  const sender = text(notif.createdBy);
  if (notif.pushTest === true && sender === uid) return { push: true, reason: 'test' };
  if (notif.skipPush === true) return { push: false, reason: 'skip' };
  if (sender && sender === uid) return { push: false, reason: 'self' };
  const userSnap = await db.doc(`users/${uid}`).get();
  const prefs = userSnap.exists ? (userSnap.data()?.notificationPrefs || {}) : {};
  if (!pushChannelOn(prefs, text(notif.eventType))) return { push: false, reason: 'prefs' };
  if (sender) {
    try {
      await rateLimit(db, { key: hashRateKey(['push', sender, uid]), limit: PAIR_LIMIT_PER_HOUR });
    } catch {
      return { push: false, reason: 'limit' };
    }
  }
  return { push: true, reason: sender ? 'user' : 'server' };
}

function webSubscription(data) {
  if (data?.type === 'expo' || data?.token) return null;
  if (!data?.endpoint || !data?.keys?.p256dh || !data?.keys?.auth) return null;
  return { endpoint: data.endpoint, keys: { p256dh: data.keys.p256dh, auth: data.keys.auth } };
}

function expoToken(data) {
  const token = text(data?.token);
  const expo = data?.type === 'expo' || token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
  return expo && token ? token : '';
}

async function sendWebPush({ uid, docs, payload, sender, privateKey }) {
  const subs = docs.map((d) => ({ d, sub: webSubscription(d.data()) })).filter((row) => row.sub);
  if (!subs.length) return { sent: 0, devices: 0 };
  const key = privateKey !== undefined ? privateKey : await vapidPrivateKey();
  if (!key) {
    logger.warn('Web push hoppet over: VAPID_PRIVATE_KEY mangler', { uid });
    return { sent: 0, devices: subs.length, missingKey: true };
  }
  const options = {
    TTL: 60 * 60,
    vapidDetails: { subject: VAPID_SUBJECT, publicKey: VAPID_PUBLIC_KEY, privateKey: key },
  };
  let sent = 0;
  await Promise.all(subs.map(async ({ d, sub }) => {
    try {
      await sender.sendNotification(sub, JSON.stringify(payload), options);
      sent += 1;
    } catch (err) {
      const status = err?.statusCode;
      // Utløpt eller avmeldt abonnement: fjern det, så vi ikke prøver igjen.
      if (status === 404 || status === 410) await d.ref.delete().catch(() => {});
      else logger.warn('Web push feilet', { uid, status, message: err?.message });
    }
  }));
  return { sent, devices: subs.length };
}

async function sendExpoPush({ uid, docs, payload, fetchImpl }) {
  const rows = docs.map((d) => ({ d, token: expoToken(d.data()) })).filter((row) => row.token);
  if (!rows.length) return { sent: 0, devices: 0 };
  const messages = rows.map(({ token }) => ({
    to: token,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: payload,
    channelId: 'default',
    priority: 'high',
  }));
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetchImpl('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      });
      const json = await res.json().catch(() => ({}));
      const tickets = Array.isArray(json?.data) ? json.data : [];
      tickets.forEach((ticket, idx) => {
        if (ticket?.status === 'ok') {
          sent += 1;
          return;
        }
        if (ticket?.details?.error === 'DeviceNotRegistered') {
          rows[i + idx]?.d.ref.delete().catch(() => {});
        } else if (ticket?.message) {
          logger.warn('Expo push feilet', { uid, message: ticket.message });
        }
      });
    } catch (err) {
      logger.warn('Expo push feilet', { uid, message: err?.message });
    }
  }
  return { sent, devices: rows.length };
}

/**
 * Sender push for ett varsel og skriver resultatet på varselet (push.sent, push.reason),
 * så det kan sjekkes i ettertid.
 */
export async function deliverNotificationPush({ db, uid, notifId, notif = {}, ref = null, deps = {} }) {
  const decision = await pushDecision({ db, uid, notif, rateLimit: deps.rateLimit });
  let web = { sent: 0, devices: 0 };
  let expo = { sent: 0, devices: 0 };
  if (decision.push) {
    const payload = pushPayloadFor(notifId, notif);
    const snap = await db.collection(`users/${uid}/pushSubscriptions`).get();
    [web, expo] = await Promise.all([
      sendWebPush({ uid, docs: snap.docs, payload, sender: deps.webpush || webpush, privateKey: deps.vapidKey }),
      sendExpoPush({ uid, docs: snap.docs, payload, fetchImpl: deps.fetch || fetch }),
    ]);
  }
  const result = {
    sent: web.sent + expo.sent,
    devices: web.devices + expo.devices,
    reason: web.missingKey ? 'missing-key' : decision.reason,
  };
  if (ref) {
    await ref.set({ push: { ...result, at: FieldValue.serverTimestamp() } }, { merge: true }).catch(() => {});
  }
  return result;
}
