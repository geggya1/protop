// functions/index.js
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import * as logger from 'firebase-functions/logger';

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

import { sendMail, friendlyMailError } from './mail.js';
import { sendSms, friendlySmsError, buildInviteSms, toE164 } from './sms.js';
import {
  issueEmailVerifyToken,
  consumeEmailVerifyToken,
  buildVerifyEmailHtml,
  VERIFY_TTL_MS,
} from './emailVerify.js';
import { handleUploadDocument } from './uploadDocument.js';
import { stravaExchangeToken, stravaSyncActivities, getStravaAppStatus, saveStravaAppConfig, stravaDisconnect, stravaWebhook, registerStravaWebhook } from './strava.js';
import webpush from 'web-push';
import { getVapidPrivateKey, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from './vapid.js';
import {
  assertFamilyAdmin,
  assertRateLimit,
  assertSafeAppContinueUrl,
  hashRateKey,
  isValidEmail as isValidEmailSecure,
  redactEmail,
  requireAuth,
} from './security.js';
import { onChatMessageCreated, onFriendChatMessageCreated } from './chatNotify.js';

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

export {
  stravaExchangeToken,
  stravaSyncActivities,
  getStravaAppStatus,
  saveStravaAppConfig,
  stravaDisconnect,
  stravaWebhook,
  registerStravaWebhook,
};

export {
  resolveJoinCode,
  submitJoinRequestByCode,
  listMyFamilies,
} from './joinCallables.js';

export { deleteMyAccount } from './deleteAccount.js';

export { onChatMessageCreated, onFriendChatMessageCreated };

// MAIL_API_KEY: Brevo (xkeysib-...), Resend (re_...) eller SendGrid (SG....)
const MAIL_API_KEY = defineSecret('MAIL_API_KEY');
const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');

setGlobalOptions({
  region: 'europe-west1',
  invoker: 'public',
});

if (!getApps().length) initializeApp();
const db = getFirestore();
const adminAuth = getAuth();

const isValidEmail = isValidEmailSecure;

const isTeamGroupType = (type) => ['team', 'club'].includes(String(type || '').toLowerCase());
const isClassroomGroupType = (type) => ['class', 'classroom'].includes(String(type || '').toLowerCase());

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function resolveGroupContext({ familyId, familyName, groupType }) {
  let name = String(familyName || '').trim();
  let type = String(groupType || '').trim();
  if (familyId && (!name || !type)) {
    try {
      const snap = await db.doc(`families/${familyId}`).get();
      if (snap.exists) {
        const d = snap.data() || {};
        if (!name) name = String(d.name || '').trim();
        if (!type) type = String(d.type || '').trim();
      }
    } catch (err) {
      logger.warn('⚠️ Kunne ikke hente gruppenavn for invitasjon', { familyId, message: err?.message });
    }
  }
  return {
    familyName: name || familyId || 'gruppen',
    groupType: type || 'family',
  };
}

export const buildInviteMessage = ({
  to, name, familyId, familyName, groupType, registerUrl, existingUser = false,
}) => {
  const label = familyName || familyId || 'gruppen';
  const team = isTeamGroupType(groupType);
  const classroom = isClassroomGroupType(groupType);
  const greet = name || (team || classroom ? '' : 'foresatt');
  const hello = greet ? `Hei ${greet}` : 'Hei';
  const roleText = team
    ? `Du er invitert til idrettslaget «${label}» på Weekplan.`
    : (classroom
      ? `Du er invitert til klassen «${label}» på Weekplan.`
      : `Du er invitert som foresatt i familien «${label}» på Weekplan.`);
  const roleHtml = team
    ? `Du er invitert til idrettslaget <strong>${escapeHtml(label)}</strong> på Weekplan.`
    : (classroom
      ? `Du er invitert til klassen <strong>${escapeHtml(label)}</strong> på Weekplan.`
      : `Du er invitert som foresatt i familien <strong>${escapeHtml(label)}</strong> på Weekplan.`);

  if (existingUser) {
    return {
      to,
      name,
      subject: `Du er invitert til ${label} på Weekplan`,
      text:
        `${hello},\n\n` +
        `${roleText}\n\n` +
        `Du har allerede en Weekplan-konto. Godta invitasjonen her: ${registerUrl}\n\n` +
        `Hilsen Weekplan-teamet`,
      html: `
    <p>${escapeHtml(hello)},</p>
    <p>${roleHtml}</p>
    <p>Du har allerede en Weekplan-konto. Åpne lenken under for å godta eller avslå invitasjonen.</p>
    <p>
      <a href="${registerUrl}"
         style="background:#1099F4;color:#fff;padding:10px 16px;border-radius:8px;
                text-decoration:none;display:inline-block">
        Godta invitasjon
      </a>
    </p>
    <p style="color:#475569;font-size:13px">Hvis knappen ikke virker: ${escapeHtml(registerUrl)}</p>
    <p>Med vennlig hilsen,<br/>Weekplan-teamet</p>
  `,
    };
  }

  return {
    to,
    name,
    subject: `Invitasjon til ${label} på Weekplan`,
    text:
      `${hello},\n\n` +
      `${roleText}\n\n` +
      `Registrer deg her: ${registerUrl}\n\n` +
      `Hilsen Weekplan-teamet`,
    html: `
    <p>${escapeHtml(hello)},</p>
    <p>${roleHtml}</p>
    <p>
      <a href="${registerUrl}"
         style="background:#1099F4;color:#fff;padding:10px 16px;border-radius:8px;
                text-decoration:none;display:inline-block">
        Registrer deg nå
      </a>
    </p>
    <p style="color:#475569;font-size:13px">Hvis knappen ikke virker: ${escapeHtml(registerUrl)}</p>
    <p>Med vennlig hilsen,<br/>Weekplan-teamet</p>
  `,
  };
};

export const sendInviteV2 = onCall(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
    secrets: [MAIL_API_KEY],
  },
  async (req) => {
    try {
      const callerUid = requireAuth(req.auth);
      const {
        email, name, familyId, familyName, groupType, registerUrl, inviteLink,
        existingUser, inviteKind,
      } = req.data || {};
      if (!isValidEmail(email)) {
        return { ok: false, error: 'Ugyldig e-postadresse' };
      }
      if (!familyId) return { ok: false, error: 'Mangler gruppe.' };
      await assertFamilyAdmin(db, familyId, callerUid);
      await assertRateLimit(db, {
        key: hashRateKey(['invite-mail', callerUid]),
        limit: 20,
        windowMs: 60 * 60 * 1000,
      });
      const safeFamilyId = familyId;
      const ctx = await resolveGroupContext({ familyId: safeFamilyId, familyName, groupType });
      const isExisting = existingUser === true || inviteKind === 'existing';
      const fallbackUrl = `https://www.protop.no/register?email=${encodeURIComponent(email)}&familyId=${encodeURIComponent(safeFamilyId)}`;
      const url = assertSafeAppContinueUrl(registerUrl || inviteLink || fallbackUrl, fallbackUrl);

      await sendMail(
        MAIL_API_KEY.value(),
        buildInviteMessage({
          to: email,
          name,
          familyId: safeFamilyId,
          familyName: ctx.familyName,
          groupType: ctx.groupType,
          registerUrl: url,
          existingUser: isExisting,
        })
      );

      logger.info('✅ [sendInviteV2] E-post sendt', {
        to: redactEmail(email),
        familyId: safeFamilyId,
        familyName: ctx.familyName,
        groupType: ctx.groupType,
        callerUid,
      });
      return { ok: true, familyName: ctx.familyName, groupType: ctx.groupType };
    } catch (error) {
      if (error instanceof HttpsError) {
        return { ok: false, error: error.message };
      }
      logger.error('❌ [sendInviteV2] Feil ved e-postutsending', {
        message: error?.message,
        status: error?.status,
        details: error?.details,
      });
      return { ok: false, error: friendlyMailError(error) };
    }
  }
);

/** Invite via SMS (Brevo transactional SMS, same MAIL_API_KEY when Brevo). */
export const sendInviteSmsV2 = onCall(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
    secrets: [MAIL_API_KEY],
  },
  async (req) => {
    try {
      const callerUid = requireAuth(req.auth);
      const {
        phone, name, familyId, familyName, groupType, joinCode, registerUrl,
        existingUser, inviteKind,
      } = req.data || {};
      const to = toE164(phone);
      if (!to) {
        return { ok: false, error: 'Ugyldig telefonnummer. Bruk landskode, f.eks. +47…' };
      }
      if (!familyId) return { ok: false, error: 'Mangler gruppe.' };
      await assertFamilyAdmin(db, familyId, callerUid);
      await assertRateLimit(db, {
        key: hashRateKey(['invite-sms', callerUid]),
        limit: 10,
        windowMs: 60 * 60 * 1000,
      });
      const safeFamilyId = familyId;
      const ctx = await resolveGroupContext({ familyId: safeFamilyId, familyName, groupType });
      const isExisting = existingUser === true || inviteKind === 'existing';
      const fallbackUrl = `https://www.protop.no/register?familyId=${encodeURIComponent(safeFamilyId)}&phone=${encodeURIComponent(to)}`;
      const url = assertSafeAppContinueUrl(registerUrl || fallbackUrl, fallbackUrl);

      await sendSms(MAIL_API_KEY.value(), {
        to,
        content: buildInviteSms({
          name,
          familyName: ctx.familyName,
          groupType: ctx.groupType,
          joinCode,
          registerUrl: url,
          existingUser: isExisting,
        }),
      });

      logger.info('✅ [sendInviteSmsV2] SMS sendt', {
        toLast4: to.slice(-4),
        familyName: ctx.familyName,
        groupType: ctx.groupType,
        callerUid,
      });
      return { ok: true, to, familyName: ctx.familyName, groupType: ctx.groupType };
    } catch (error) {
      if (error instanceof HttpsError) {
        return { ok: false, error: error.message };
      }
      logger.error('❌ [sendInviteSmsV2] Feil ved SMS-utsending', {
        message: error?.message,
        status: error?.status,
        details: error?.details,
      });
      return { ok: false, error: friendlySmsError(error) };
    }
  }
);

export const sendParentInviteEmail = onDocumentCreated(
  {
    document: 'families/{familyId}/parents/{parentId}',
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [MAIL_API_KEY],
  },
  async (event) => {
    const snap = event.data;
    const { familyId, parentId } = event.params || {};

    if (!snap) {
      logger.warn('⚠️ Dokument mangler data. Ingen e-post sendt.');
      return;
    }

    const parentData = snap.data() || {};
    const email = parentData.email;
    const name = parentData.name || '';

    // Kun automatisk for placeholder-invitasjoner. Klienten sender selv når clientSendsInvite er satt.
    if (parentData.clientSendsInvite === true) {
      logger.info('ℹ️ [trigger] Hopper over — klienten sender invitasjon.', { familyId, parentId });
      return;
    }
    if (parentData.placeholder !== true) {
      logger.info('ℹ️ [trigger] Hopper over — ikke placeholder-invitasjon.', { familyId, parentId });
      return;
    }
    if (!isValidEmail(email)) {
      logger.error(`❌ Ugyldig e-postadresse: ${redactEmail(email)}`);
      return;
    }

    try {
      await assertRateLimit(db, {
        key: hashRateKey(['invite-trigger', familyId || 'unknown']),
        limit: 30,
        windowMs: 60 * 60 * 1000,
      });
    } catch (rateErr) {
      logger.warn('Invite email trigger rate-limited', { familyId, message: rateErr?.message });
      return;
    }

    const ctx = await resolveGroupContext({ familyId });
    const registerUrl = `https://www.protop.no/register?email=${encodeURIComponent(email)}&familyId=${encodeURIComponent(familyId || '')}`;

    try {
      await sendMail(
        MAIL_API_KEY.value(),
        buildInviteMessage({
          to: email,
          name,
          familyId,
          familyName: ctx.familyName,
          groupType: ctx.groupType,
          registerUrl,
        })
      );
      logger.info(`✅ [trigger] E-post sendt til: ${redactEmail(email)}`, {
        familyName: ctx.familyName,
        groupType: ctx.groupType,
      });

      try {
        await db
          .doc(`families/${familyId}/parents/${parentId}`)
          .set(
            {
              inviteEmailSentAt: FieldValue.serverTimestamp(),
              inviteEmailTo: email,
              inviteEmailError: null,
              inviteStatus: 'pending',
            },
            { merge: true }
          );
      } catch (metaErr) {
        logger.warn('⚠️ [trigger] Kunne ikke oppdatere inviteEmailSentAt', {
          message: metaErr?.message,
        });
      }
    } catch (error) {
      const friendly = friendlyMailError(error);
      logger.error('❌ [trigger] Feil ved e-postutsending:', {
        message: error?.message,
        status: error?.status,
        details: error?.details,
        friendly,
      });
      try {
        await db.doc(`families/${familyId}/parents/${parentId}`).set(
          {
            inviteEmailError: String(friendly).slice(0, 280),
            inviteEmailFailedAt: FieldValue.serverTimestamp(),
            inviteStatus: 'pending',
          },
          { merge: true }
        );
      } catch (_) {
        /* ignore */
      }
      // Ikke kast — unngå endeløse retries; klienten kan sende på nytt
    }
  }
);

function channelOn(prefs, eventType, channel, fallback = true) {
  if (prefs?.enabled === false) return false;
  const v = prefs?.events?.[eventType]?.[channel];
  return typeof v === 'boolean' ? v : fallback;
}

async function sendExpoPushToUser(uid, payload) {
  const snap = await db.collection(`users/${uid}/pushSubscriptions`).get();
  if (snap.empty) return 0;
  const messages = [];
  const docByToken = new Map();
  snap.docs.forEach((d) => {
    const sub = d.data() || {};
    const token = String(sub.token || '').trim();
    const isExpo = sub.type === 'expo'
      || token.startsWith('ExponentPushToken[')
      || token.startsWith('ExpoPushToken[');
    if (!isExpo || !token) return;
    docByToken.set(token, d);
    messages.push({
      to: token,
      sound: 'default',
      title: payload.title || 'Weekplan',
      body: payload.body || '',
      data: {
        eventType: payload.eventType || '',
        chatId: payload.chatId || '',
        familyId: payload.familyId || '',
        inviteId: payload.inviteId || '',
        gameId: payload.gameId || '',
        gameType: payload.gameType || '',
        notificationId: payload.notificationId || '',
        tag: payload.tag || '',
      },
      channelId: 'default',
      priority: 'high',
    });
  });
  if (!messages.length) return 0;

  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      });
      const json = await res.json().catch(() => ({}));
      const tickets = Array.isArray(json?.data) ? json.data : [];
      tickets.forEach((ticket, idx) => {
        if (ticket?.status === 'ok') {
          sent += 1;
          return;
        }
        const err = ticket?.details?.error || ticket?.message;
        if (err === 'DeviceNotRegistered') {
          const token = chunk[idx]?.to;
          const docRef = token ? docByToken.get(token) : null;
          if (docRef) docRef.ref.delete().catch(() => {});
        } else if (err) {
          logger.warn('Expo push ticket error', { uid, err });
        }
      });
    } catch (err) {
      logger.warn('Expo push failed', { uid, message: err?.message });
    }
  }
  return sent;
}

async function sendWebPushToUser(uid, payload) {
  const snap = await db.collection(`users/${uid}/pushSubscriptions`).get();
  if (snap.empty) return 0;
  let privateKey;
  try {
    privateKey = VAPID_PRIVATE_KEY.value() || getVapidPrivateKey();
  } catch (e) {
    logger.warn('Web push skipped — VAPID private key missing', { message: e?.message });
    return 0;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, privateKey);
  let sent = 0;
  await Promise.all(snap.docs.map(async (d) => {
    const sub = d.data() || {};
    if (sub.type === 'expo' || sub.token) return;
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return;
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify(payload),
        { TTL: 60 * 60 },
      );
      sent += 1;
    } catch (err) {
      const status = err?.statusCode;
      if (status === 404 || status === 410) {
        await d.ref.delete().catch(() => {});
      } else {
        logger.warn('Web push failed', { uid, status, message: err?.message });
      }
    }
  }));
  return sent;
}

async function sendPushToUser(uid, payload) {
  const [webSent, expoSent] = await Promise.all([
    sendWebPushToUser(uid, payload),
    sendExpoPushToUser(uid, payload),
  ]);
  logger.info('Push delivery', { uid, webSent, expoSent, eventType: payload.eventType });
  return webSent + expoSent;
}

// --- Notifications (email + web push) ---
export const sendNotificationEmail = onDocumentCreated(
  {
    document: 'users/{uid}/notifications/{notifId}',
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [MAIL_API_KEY, VAPID_PRIVATE_KEY],
  },
  async (event) => {
    const notif = event.data?.data?.() || {};
    const { uid, notifId } = event.params || {};

    if (!uid) return;
    try {
      const userSnap = await db.doc(`users/${uid}`).get();
      const userData = userSnap.exists ? (userSnap.data() || {}) : {};
      const prefs = userData.notificationPrefs || {};
      if (prefs.enabled === false) return;

      const eventType = notif.eventType;
      const title = notif.title || 'Varsel';
      const body = notif.body || '';

      const pushOn = channelOn(prefs, eventType, 'push', true);
      if (pushOn) {
        const pushSent = await sendPushToUser(uid, {
          title,
          body,
          eventType: eventType || '',
          chatId: notif.chatId || '',
          familyId: notif.familyId || '',
          friendChat: notif.friendChat ? '1' : '',
          friendUid: notif.friendUid || '',
          inviteId: notif.inviteId || '',
          gameId: notif.gameId || '',
          gameType: notif.gameType || '',
          notificationId: notifId || '',
          tag: notifId || eventType || 'weekplan',
        });
        if (pushSent > 0) {
          await db.doc(event.data.ref.path).set(
            { pushSentAt: FieldValue.serverTimestamp(), pushSentCount: pushSent },
            { merge: true },
          );
        }
      }

      const emailFallback = eventType === 'attestPending' || eventType === 'wishReserved'
        ? false
        : true;
      const emailOn = channelOn(prefs, eventType, 'email', emailFallback);
      if (!emailOn) return;

      const email = userData.email;
      if (!isValidEmail(email)) return;

      const subject = `Weekplan: ${title}`;
      const text = `Hei!\n\nDu har fått et varsel i Weekplan.\n\n${title}\n\n${body}\n\nHilsen Weekplan-teamet`;
      const html = `
        <p>Hei!</p>
        <p>Du har fått et varsel i <strong>Weekplan</strong>.</p>
        <p><strong>${title}</strong></p>
        <p style="color:#334155">${(body || '').replace(/\\n/g, '<br/>')}</p>
        <p style="color:#94a3b8;font-size:12px">Dette er et automatisk varsel.</p>
      `;

      await sendMail(MAIL_API_KEY.value(), {
        to: email,
        name: userData.displayName || userData.name || '',
        subject,
        text,
        html,
      });

      await db.doc(event.data.ref.path).set(
        { emailSentAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    } catch (e) {
      logger.warn('Notification delivery failed', {
        uid,
        eventType: notif.eventType,
        message: e?.message,
      });
    }
  }
);

export const sendEmailVerificationV2 = onCall(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
    secrets: [MAIL_API_KEY],
  },
  async (req) => {
    try {
      const { email, continueUrl } = req.data || {};
      if (!isValidEmail(email)) return { ok: false, error: 'Ugyldig e-postadresse' };

      // Prefer authenticated caller; allow unauthenticated only for same-email bootstrap with strict rate limit.
      const callerUid = req.auth?.uid || null;
      const callerEmail = String(req.auth?.token?.email || '').toLowerCase();
      const target = String(email).trim().toLowerCase();
      if (callerUid && callerEmail && callerEmail !== target) {
        return { ok: false, error: 'Du kan bare bekrefte din egen e-post.' };
      }
      await assertRateLimit(db, {
        key: hashRateKey(['email-verify', callerUid || target]),
        limit: callerUid ? 8 : 3,
        windowMs: 60 * 60 * 1000,
      });

      const safeContinueUrl = assertSafeAppContinueUrl(
        continueUrl,
        'https://www.protop.no/verify-email',
      );

      const started = Date.now();
      const { token } = await issueEmailVerifyToken(db, adminAuth, email);
      const verifyUrl = `${safeContinueUrl.replace(/\/$/, '')}?vt=${token}`;

      const sendStarted = Date.now();
      await sendMail(MAIL_API_KEY.value(), {
        to: email,
        subject: 'Bekreft e-posten din – Weekplan',
        text:
          `Hei!\n\n` +
          `Bekreft e-posten din (lenken er gyldig i 7 dager):\n${verifyUrl}\n\n` +
          `E-posten kan bruke noen minutter — lenken utløper ikke med det samme.\n\n` +
          `Hilsen Weekplan-teamet`,
        html: buildVerifyEmailHtml(verifyUrl),
      });
      logger.info('✅ [sendEmailVerificationV2] Sendt', {
        email: redactEmail(email),
        verifyTtlDays: VERIFY_TTL_MS / 86400000,
        sendMs: Date.now() - sendStarted,
        totalMs: Date.now() - started,
      });
      return { ok: true };
    } catch (error) {
      if (error instanceof HttpsError) {
        return { ok: false, error: error.message };
      }
      logger.error('❌ [sendEmailVerificationV2] Feil ved utsending', {
        message: error?.message,
        status: error?.status,
        details: error?.details,
      });
      return {
        ok: false,
        error: friendlyMailError(error),
      };
    }
  }
);

export const confirmEmailVerificationV2 = onCall(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      const { token } = req.data || {};
      if (!token || String(token).length < 20) {
        return { ok: false, error: 'Mangler bekreftelseslenke.' };
      }
      await assertRateLimit(db, {
        key: hashRateKey(['confirm-verify', String(token).slice(0, 16)]),
        limit: 10,
        windowMs: 60 * 60 * 1000,
      });
      const result = await consumeEmailVerifyToken(db, adminAuth, token);
      if (!result.ok) return result;
      logger.info('✅ [confirmEmailVerificationV2] Bekreftet', {
        uid: result.uid,
        email: redactEmail(result.email),
      });
      return { ok: true, email: result.email };
    } catch (error) {
      if (error instanceof HttpsError) {
        return { ok: false, error: error.message };
      }
      logger.error('❌ [confirmEmailVerificationV2]', { message: error?.message });
      return { ok: false, error: error?.message || 'Kunne ikke bekrefte e-post' };
    }
  }
);

export const sendPasswordResetV2 = onCall(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
    secrets: [MAIL_API_KEY],
  },
  async (req) => {
    try {
      const { email, continueUrl } = req.data || {};
      if (!isValidEmail(email)) return { ok: false, error: 'Ugyldig e-postadresse' };

      await assertRateLimit(db, {
        key: hashRateKey(['pwd-reset', String(email).trim().toLowerCase()]),
        limit: 5,
        windowMs: 60 * 60 * 1000,
      });

      const safeContinueUrl = assertSafeAppContinueUrl(
        continueUrl,
        'https://www.protop.no/login',
      );

      const resetLink = await adminAuth.generatePasswordResetLink(email, {
        url: safeContinueUrl,
        handleCodeInApp: false,
      });

      await sendMail(MAIL_API_KEY.value(), {
        to: email,
        subject: 'Tilbakestill passordet ditt – Weekplan',
        text:
          `Hei!\n\n` +
          `Klikk lenken for å velge et nytt passord:\n${resetLink}\n\n` +
          `Hvis du ikke ba om dette, kan du se bort fra e-posten.\n\n` +
          `Hilsen Weekplan-teamet`,
        html: `
          <p>Hei!</p>
          <p>Klikk lenken for å velge et nytt passord:</p>
          <p>
            <a href="${resetLink}"
               style="background:#1099F4;color:#fff;padding:10px 16px;border-radius:8px;
                      text-decoration:none;display:inline-block">
              Velg nytt passord
            </a>
          </p>
          <p style="color:#475569;font-size:13px">
            Hvis knappen ikke virker: <br/>${escapeHtml(resetLink)}
          </p>
          <p>Hvis du ikke ba om dette, kan du se bort fra e-posten.</p>
          <p>Hilsen Weekplan-teamet</p>
        `,
      });
      logger.info('✅ [sendPasswordResetV2] Sendt', { email: redactEmail(email) });
      return { ok: true };
    } catch (error) {
      if (error instanceof HttpsError) {
        return { ok: false, error: error.message };
      }
      logger.error('❌ [sendPasswordResetV2] Feil ved utsending', {
        message: error?.message,
        status: error?.status,
        details: error?.details,
      });
      // Always return ok-shaped success to avoid account enumeration via error differences
      // for Firebase "user-not-found"; still surface mail provider failures.
      const msg = String(error?.message || '');
      if (/user-not-found|EMAIL_NOT_FOUND|auth\/user-not-found/i.test(msg)) {
        return { ok: true };
      }
      return { ok: false, error: friendlyMailError(error) };
    }
  }
);

export const setMemberPassword = onCall(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      const caller = req.auth?.uid;
      if (!caller) return { ok: false, error: 'Du må være innlogget.' };
      const { uid, password, familyId } = req.data || {};
      const pwd = String(password || '');
      if (!uid || pwd.length < 6) return { ok: false, error: 'Passordet må ha minst 6 tegn.' };
      if (pwd.length > 128) return { ok: false, error: 'Passordet er for langt.' };

      let isChildMember = false;
      if (uid !== caller) {
        if (!familyId) return { ok: false, error: 'Mangler gruppe.' };
        await assertFamilyAdmin(db, familyId, caller);
        const [child, parent] = await Promise.all([
          db.doc(`families/${familyId}/children/${uid}`).get(),
          db.doc(`families/${familyId}/parents/${uid}`).get(),
        ]);
        if (!child.exists && !parent.exists) return { ok: false, error: 'Personen er ikke i gruppen.' };
        isChildMember = child.exists;
      } else if (familyId) {
        const child = await db.doc(`families/${familyId}/children/${uid}`).get();
        isChildMember = child.exists;
      } else {
        const child = await db.doc(`children/${uid}`).get();
        isChildMember = child.exists;
      }

      await adminAuth.updateUser(uid, { password: pwd });

      // Adults: never keep plaintext. Children: keep a family-admin-readable copy so
      // parents can show the login password on a new device (clients still cannot write it).
      const wipe = { password: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() };
      const store = { password: pwd, updatedAt: FieldValue.serverTimestamp() };
      const jobs = [
        db.doc(`parents/${uid}`).set(wipe, { merge: true }).catch(() => {}),
        db.doc(`users/${uid}`).set(wipe, { merge: true }).catch(() => {}),
      ];
      if (isChildMember) {
        jobs.push(db.doc(`children/${uid}`).set(store, { merge: true }).catch(() => {}));
        if (familyId) {
          jobs.push(db.doc(`families/${familyId}/children/${uid}`).set(store, { merge: true }).catch(() => {}));
        }
      } else {
        jobs.push(db.doc(`children/${uid}`).set(wipe, { merge: true }).catch(() => {}));
        if (familyId) {
          jobs.push(db.doc(`families/${familyId}/children/${uid}`).set(wipe, { merge: true }).catch(() => {}));
        }
      }
      if (familyId) {
        jobs.push(db.doc(`families/${familyId}/parents/${uid}`).set(wipe, { merge: true }).catch(() => {}));
      }
      await Promise.all(jobs);

      return { ok: true };
    } catch (error) {
      if (error instanceof HttpsError) {
        return { ok: false, error: error.message };
      }
      logger.error('❌ [setMemberPassword]', { message: error?.message });
      return { ok: false, error: error?.message || 'Kunne ikke endre passord' };
    }
  }
);

/** Phone variants for invite lookup (E.164 + local digits). Never returned to client. */
function phoneLookupCandidates(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return [];
  const digits = trimmed.replace(/\D/g, '');
  const out = new Set();
  if (trimmed) out.add(trimmed);
  if (digits) {
    out.add(digits);
    out.add(`+${digits}`);
  }
  const e164 = toE164(trimmed);
  if (e164) out.add(e164);
  // Norge: 8-sifret mobil uten landskode
  if (digits.length === 8) {
    out.add(`+47${digits}`);
    out.add(`47${digits}`);
  }
  if (digits.length === 10 && digits.startsWith('47')) {
    out.add(`+${digits}`);
    out.add(digits.slice(2));
  }
  return [...out].filter((v) => String(v).replace(/\D/g, '').length >= 8);
}

function publicAdultProfile(uid, data = {}) {
  return {
    uid,
    username: data.username || '',
    usernameLower: String(data.usernameLower || data.username || '').toLowerCase(),
    name: data.displayName || data.name || 'Bruker',
    // GDPR: never return email/phone to the inviting client
    phone: '',
    photoURL: data.photoURL || null,
    avatarId: data.avatarId || null,
  };
}

/**
 * Minimal adult lookup for invites — avoids granting clients read of all users/parents.
 * Supports e-post, telefon og brukernavn. Returns only non-sensitive display fields.
 */
export const lookupAdultProfile = onCall(
  {
    timeoutSeconds: 20,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      const caller = requireAuth(req.auth);
      await assertRateLimit(db, {
        key: hashRateKey(['lookup-adult', caller]),
        limit: 40,
        windowMs: 60 * 60 * 1000,
      });
      const identifier = String(req.data?.identifier || '').trim();
      if (!identifier) return { ok: true, profile: null };

      const looksLikeEmail = identifier.includes('@') && isValidEmail(identifier);
      if (looksLikeEmail) {
        const email = identifier.toLowerCase();
        const usersSnap = await db.collection('users').where('email', '==', email).limit(3).get();
        for (const d of usersSnap.docs) {
          const data = d.data() || {};
          if (data.role === 'child' || data.type === 'child') continue;
          return { ok: true, profile: publicAdultProfile(d.id, data) };
        }
        const parentsSnap = await db.collection('parents').where('email', '==', email).limit(5).get();
        for (const d of parentsSnap.docs) {
          const data = d.data() || {};
          if (data.placeholder === true && !data.uid) continue;
          const uid = data.uid || (String(d.id).length >= 20 ? d.id : null);
          if (!uid) continue;
          return { ok: true, profile: publicAdultProfile(uid, data) };
        }
        return { ok: true, profile: null };
      }

      const phoneCandidates = phoneLookupCandidates(identifier);
      const looksLikePhone = !identifier.includes('@') && phoneCandidates.length > 0
        && /^\+?[\d\s().-]+$/.test(identifier);
      if (looksLikePhone) {
        for (const candidate of phoneCandidates) {
          const usersSnap = await db.collection('users').where('phone', '==', candidate).limit(3).get();
          for (const d of usersSnap.docs) {
            const data = d.data() || {};
            if (data.role === 'child' || data.type === 'child') continue;
            return { ok: true, profile: publicAdultProfile(d.id, data) };
          }
          const parentsSnap = await db.collection('parents').where('phone', '==', candidate).limit(5).get();
          for (const d of parentsSnap.docs) {
            const data = d.data() || {};
            if (data.placeholder === true && !data.uid) continue;
            const uid = data.uid || (String(d.id).length >= 20 ? d.id : null);
            if (!uid) continue;
            return { ok: true, profile: publicAdultProfile(uid, data) };
          }
        }
        return { ok: true, profile: null };
      }

      const u = identifier.toLowerCase().replace(/^@/, '');
      if (u.length < 3) return { ok: true, profile: null };
      const unameSnap = await db.doc(`usernames/${u}`).get();
      if (unameSnap.exists) {
        const data = unameSnap.data() || {};
        if (data.type === 'child') return { ok: true, profile: null };
        const uid = data.uid;
        if (!uid) return { ok: true, profile: null };
        const [userSnap, parentSnap] = await Promise.all([
          db.doc(`users/${uid}`).get(),
          db.doc(`parents/${uid}`).get(),
        ]);
        const userData = userSnap.exists ? userSnap.data() : {};
        const parentData = parentSnap.exists ? parentSnap.data() : {};
        return {
          ok: true,
          profile: publicAdultProfile(uid, {
            ...parentData,
            ...userData,
            username: userData.username || parentData.username || u,
            usernameLower: u,
            name: userData.displayName || userData.name || parentData.name || u,
            photoURL: userData.photoURL || parentData.photoURL || null,
            avatarId: userData.avatarId || parentData.avatarId || null,
          }),
        };
      }
      return { ok: true, profile: null };
    } catch (error) {
      if (error instanceof HttpsError) {
        return { ok: false, error: error.message, profile: null };
      }
      logger.error('❌ [lookupAdultProfile]', { message: error?.message });
      return { ok: false, error: error?.message || 'Oppslag feilet', profile: null };
    }
  }
);

export {
  sendFriendInviteV2,
  sendFriendInviteSmsV2,
  lookupFriendProfile,
} from './friendInvite.js';

export {
  addIcsCalendar,
  exchangeCalendarOAuth,
  exchangeMicrosoftSignIn,
  fetchExternalCalendarEvents,
  getCalendarOAuthConfig,
  listCalendarConnections,
  removeCalendarConnection,
  listMailFolders,
  listMailMessages,
  syncOutlookMailbox,
  getMailMessage,
  sendOutlookMail,
  replyOutlookMail,
  forwardOutlookMail,
  deleteOutlookMail,
} from './calendarCallables.js';

export {
  aiChat,
  aiVoiceNote,
  aiTutor,
  aiMealIngredients,
  aiRecipeImport,
  aiReceiptOcr,
  aiClassListOcr,
  aiMatcoachWeekPlan,
  aiMatcoachFridgeScan,
  aiMatcoachLunchBoxes,
  aiMatcoachSwapMeal,
  aiImportPlan,
  applyAiImport,
  discardAiImport,
  aiCleanupScheduled,
  uploadDocumentFile,
  createAlbumUploadUrl,
  uploadAlbumFile,
  aiSupportChat,
  createSupportTicket,
} from './aiCallables.js';

export { lookupVehicleByReg } from './vegvesenLookup.js';
export { fetchOpenFeed } from './openFeed.js';
export { searchDoffin, lookupCompany } from './doffinSearch.js';
