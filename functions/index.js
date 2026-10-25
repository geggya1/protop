// functions/index.js
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import * as logger from 'firebase-functions/logger';

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import { sendMail, friendlyMailError } from './mail.js';
import { buildInviteMessage } from './inviteMessage.js';

export { buildInviteMessage };
import { stravaExchangeToken, stravaSyncActivities, getStravaAppStatus, saveStravaAppConfig, stravaDisconnect, stravaWebhook, registerStravaWebhook } from './strava.js';
import webpush from 'web-push';
import { getVapidPrivateKey, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from './vapid.js';
import {
  assertRateLimit,
  hashRateKey,
  isValidEmail as isValidEmailSecure,
  redactEmail,
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
  approveJoinRequest,
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

const isValidEmail = isValidEmailSecure;

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

      const emailFallback = eventType === 'attestPending' || eventType === 'wishReserved' || notif.skipEmail === true
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

export {
  sendInviteV2,
  sendInviteSmsV2,
  sendEmailVerificationV2,
  confirmEmailVerificationV2,
  sendPasswordResetV2,
  setMemberPassword,
  lookupAdultProfile,
} from './authCallables.js';

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
  interpretImport,
  aiMatcoachWeekPlan,
  aiMatcoachFridgeScan,
  aiMatcoachLunchBoxes,
  aiMatcoachSwapMeal,
  aiImportPlan,
  applyAiImport,
  discardAiImport,
  aiCleanupScheduled,
  uploadDocumentFile,
  uploadStorageFile,
  downloadStorageFile,
  applyStorageCors,
  createAlbumUploadUrl,
  uploadAlbumFile,
  aiSupportChat,
  createSupportTicket,
  scanTimesheetReview,
} from './aiCallables.js';

export { lookupVehicleByReg, lookupVehicleHttp } from './vegvesenLookup.js';
export { fetchOpenFeed, fetchOpenFeedHttp } from './openFeed.js';
export { searchDoffin, searchTed, lookupCompany, fetchDossier } from './doffinSearch.js';
export { tenderProxy } from './tenderProxy.js';
export { sendTenderAlert } from './anbudAlert.js';
export { agreementTreatment } from './agreementTreatment.js';
export { sendAnbudRequest, scanAnbudDocument } from './anbudIntake.js';
export { scanAnbudDocumentHttp } from './anbudIntakeHttp.js';
export { interpretIndeksAvtale, indeksSsbDaily } from './indeksreguleringAi.js';
export { sendIndeksLetter } from './indeksLetter.js';
export { interpretAvtaleHttp } from './interpretAvtaleHttp.js';
export { friendListHttp } from './friendListHttp.js';
export { generateCompanyForm } from './anbudForm.js';
export { claimEmployeeInvite } from './employeeInvite.js';
export { respondGroupInvite, syncMyInvites, invitePreview } from './groupInvite.js';
export { findCompanyByOrgnr, requestCompanyJoin } from './companyJoin.js';
export { recordUsage, listEmployeeUsage } from './usageLog.js';
