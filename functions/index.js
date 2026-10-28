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
export { recordConsent } from './consentLog.js';
export { syncMyProfile } from './profileSync.js';
export { claimUsername } from './usernameClaim.js';
// Avslutning, eksport og sletting av en bedrift (GRUNN-03).
export {
  closeCompany, reopenCompany, exportCompanyData, purgeClosedCompanies,
} from './companyClosure.js';

export { onChatMessageCreated, onFriendChatMessageCreated };

// MAIL_API_KEY: Brevo (xkeysib-...), Resend (re_...) eller SendGrid (SG....)
const MAIL_API_KEY = defineSecret('MAIL_API_KEY');

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

// Push for alle varsler (web push og Expo): egen modul, deployes via notifyPushIndex.js.
export { onNotificationPush } from './notifyPush.js';

export {
  sendInviteV2,
  sendInviteSmsV2,
  sendEmailVerificationV2,
  confirmEmailVerificationV2,
  sendPasswordResetV2,
  setMemberPassword,
  lookupAdultProfile,
  confirmMicrosoftEmail,
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
  aiMatcoachWeeklyPlan,
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
export {
  powerOfficeStatus,
  powerOfficeConnect,
  powerOfficeDisconnect,
  powerOfficeProducts,
  powerOfficeTransferInvoice,
  powerOfficeSyncInvoices,
} from './powerOffice.js';
export { sendInvoiceMail, sendInvoiceEhf, lookupPeppolReceiver } from './invoiceDelivery.js';
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
export { findCompanyByOrgnr, claimCompanyOrgnr, requestCompanyJoin } from './companyJoin.js';
export { recordUsage, listEmployeeUsage } from './usageLog.js';
export { logSensitiveAccess, listAccessLog } from './accessLog.js';
