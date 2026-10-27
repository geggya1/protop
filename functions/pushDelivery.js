/**
 * Push og e-post for varsler i users/{uid}/notifications: web push (nettleser og PWA),
 * Expo (app) og e-post, etter brukerens varselinnstillinger (src/notifications/prefs.js).
 * Brukes av triggeren i notifyPush.js. Avhengigheter kan byttes i tester.
 */
import { createECDH } from 'node:crypto';
import webpush from 'web-push';
import * as logger from 'firebase-functions/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT } from './vapid.js';
import { resolveRuntimeSecret } from './runtimeSecret.js';
import { assertRateLimit, hashRateKey } from './security.js';
import { channelEnabled, notificationAccess } from '../src/notifications/prefs.js';
import { companyAllows } from '../src/notifications/audience.js';
import { isOrganizationType } from '../src/utils/groupTypes.js';
import { sendNotificationEmail } from './notifyEmail.js';

const PRODUCT = 'ProTop';
// Vern mot at én avsender kan oversvømme én mottaker med push og e-post.
const PAIR_LIMIT_PER_HOUR = 120;

function text(value) {
  return String(value ?? '').trim();
}

export function vapidPrivateKey(options = {}) {
  return resolveRuntimeSecret('VAPID_PRIVATE_KEY', {
    envNames: ['VAPID_PRIVATE_KEY', 'PROTOP_VAPID_PRIVATE_KEY'],
    ...options,
  });
}

/** Hører den private nøkkelen til den offentlige i appen? Ellers avviser push-tjenesten alt. */
export function vapidKeyMatches(privateKey, publicKey = VAPID_PUBLIC_KEY) {
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(Buffer.from(String(privateKey), 'base64url'));
    return ecdh.getPublicKey().toString('base64url') === publicKey;
  } catch {
    return false;
  }
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

/**
 * Har mottakeren rettigheten typen krever i bedriften varselet gjelder (tilgangsstyringen)?
 * Typer uten krav, og varsler utenfor en bedrift, er alltid tillatt.
 */
export async function recipientHasAccess({ db, uid, notif = {} }) {
  if (!notificationAccess(notif.eventType)) return true;
  const familyId = text(notif.familyId);
  if (!familyId || familyId.includes('/')) return true;
  const famSnap = await db.doc(`families/${familyId}`).get();
  const family = famSnap.exists ? (famSnap.data() || {}) : null;
  if (!family || !isOrganizationType(family.type)) return true;
  const own = await db.collection(`families/${familyId}/employees`).where('personUid', '==', uid).limit(5).get();
  const employees = own.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return companyAllows({ family, employees, uid, type: notif.eventType });
}

/**
 * Push og e-post etter brukerens valg per varseltype (standard fra katalogen), med unntak:
 * - varsler appen lager til seg selv (den viser dem lokalt), unntatt testvarsel,
 * - typer som krever en rettighet mottakeren ikke har i bedriften (tilgangsstyringen),
 * - samme avsender har sendt over grensen til samme mottaker siste time.
 * Varselet ligger i bjellen uansett.
 */
export async function deliveryDecision({ db, uid, notif = {}, rateLimit = assertRateLimit }) {
  const sender = text(notif.createdBy);
  const eventType = text(notif.eventType);
  if (notif.pushTest === true && sender === uid) return { push: true, email: false, reason: 'test' };
  if (sender && sender === uid) return { push: false, email: false, reason: 'self' };
  const userSnap = await db.doc(`users/${uid}`).get();
  const user = userSnap.exists ? (userSnap.data() || {}) : {};
  const prefs = user.notificationPrefs || {};
  const push = notif.skipPush !== true && channelEnabled(prefs, eventType, 'push');
  const email = notif.skipEmail !== true && channelEnabled(prefs, eventType, 'email');
  if (!push && !email) return { push: false, email: false, reason: 'prefs' };
  if (!(await recipientHasAccess({ db, uid, notif }))) return { push: false, email: false, reason: 'access' };
  if (sender) {
    try {
      await rateLimit(db, { key: hashRateKey(['push', sender, uid]), limit: PAIR_LIMIT_PER_HOUR });
    } catch {
      return { push: false, email: false, reason: 'limit' };
    }
  }
  return {
    push,
    email,
    reason: sender ? 'user' : 'server',
    to: text(user.email).toLowerCase(),
    name: text(user.displayName || user.name),
  };
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

async function sendWebPush({ uid, docs, payload, sender, privateKey, publicKey = VAPID_PUBLIC_KEY }) {
  const subs = docs.map((d) => ({ d, sub: webSubscription(d.data()) })).filter((row) => row.sub);
  if (!subs.length) return { sent: 0, devices: 0 };
  const key = privateKey !== undefined ? privateKey : await vapidPrivateKey();
  if (!key) {
    logger.warn('Web push hoppet over: VAPID_PRIVATE_KEY mangler', { uid });
    return { sent: 0, devices: subs.length, missingKey: true };
  }
  if (!vapidKeyMatches(key, publicKey)) {
    logger.error('VAPID_PRIVATE_KEY hører ikke til den offentlige nøkkelen i appen (functions/vapid.js)', { uid });
    return { sent: 0, devices: subs.length, keyMismatch: true };
  }
  const options = {
    TTL: 60 * 60,
    vapidDetails: { subject: VAPID_SUBJECT, publicKey, privateKey: key },
  };
  let sent = 0;
  await Promise.all(subs.map(async ({ d, sub }) => {
    try {
      await sender.sendNotification(sub, JSON.stringify(payload), options);
      sent += 1;
    } catch (err) {
      const status = err?.statusCode;
      // Utløpt eller avmeldt, eller laget med en tidligere nøkkel (avvises med 401/403):
      // fjern det. Appen lager et nytt abonnement neste gang den åpnes.
      const oldKey = (status === 401 || status === 403) && d.data()?.vapidPublicKey !== publicKey;
      if (status === 404 || status === 410 || oldKey) await d.ref.delete().catch(() => {});
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
 * Sender push og/eller e-post for ett varsel og skriver resultatet på varselet
 * (push.sent, push.reason, mail.sent, mail.reason), så det kan sjekkes i ettertid.
 */
export async function deliverNotification({ db, uid, notifId, notif = {}, ref = null, deps = {} }) {
  const decision = await deliveryDecision({ db, uid, notif, rateLimit: deps.rateLimit });
  let web = { sent: 0, devices: 0 };
  let expo = { sent: 0, devices: 0 };
  if (decision.push) {
    const payload = pushPayloadFor(notifId, notif);
    const snap = await db.collection(`users/${uid}/pushSubscriptions`).get();
    [web, expo] = await Promise.all([
      sendWebPush({
        uid,
        docs: snap.docs,
        payload,
        sender: deps.webpush || webpush,
        privateKey: deps.vapidKey,
        publicKey: deps.vapidPublicKey,
      }),
      sendExpoPush({ uid, docs: snap.docs, payload, fetchImpl: deps.fetch || fetch }),
    ]);
  }
  const mail = decision.email
    ? await sendNotificationEmail({ to: decision.to, name: decision.name, notif, deps })
    : { sent: false, reason: decision.push ? 'off' : decision.reason };
  const result = {
    sent: web.sent + expo.sent,
    devices: web.devices + expo.devices,
    reason: !decision.push && decision.email
      ? 'off'
      : (web.missingKey ? 'missing-key' : (web.keyMismatch ? 'key-mismatch' : decision.reason)),
  };
  if (ref) {
    const at = FieldValue.serverTimestamp();
    await ref.set({ push: { ...result, at }, mail: { ...mail, at } }, { merge: true }).catch(() => {});
  }
  return { ...result, mail };
}
