// functions/index.js
import { setGlobalOptions } from 'firebase-functions/v2/options';

import { initializeApp, getApps } from 'firebase-admin/app';

import { buildInviteMessage } from './inviteMessage.js';

export { buildInviteMessage };
import { onChatMessageCreated, onFriendChatMessageCreated } from './chatNotify.js';

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
// Bildeutgaver (.m.webp og .t.webp) når et bilde lastes opp til Storage.
export { imageVariants } from './imageVariants.js';
// Avslutning, eksport og sletting av en bedrift (GRUNN-03).
export {
  closeCompany, reopenCompany, exportCompanyData, purgeClosedCompanies,
} from './companyClosure.js';

export { onChatMessageCreated, onFriendChatMessageCreated };

setGlobalOptions({
  region: 'europe-west1',
  invoker: 'public',
});

if (!getApps().length) initializeApp();

// sendParentInviteEmail (e-post for plassholdere i familieappen) er fjernet. ProTop-invitasjoner
// går via sendInviteV2 og claimEmployeeInvite.

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
  aiReceiptOcr,
  mileageRates,
  interpretImport,
  aiCleanupScheduled,
  uploadDocumentFile,
  uploadStorageFile,
  downloadStorageFile,
  applyStorageCors,
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
  powerOfficeLookupInvoice,
  powerOfficeInvoiceDocument,
} from './powerOffice.js';
export { sendInvoiceMail, sendInvoiceEhf, lookupPeppolReceiver } from './invoiceDelivery.js';
export { sendMeetingMail, aiMeeting } from './meetingDelivery.js';
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
export {
  icRequestLink, icRespondLink, icWithdrawLink, icEndLink, icUpdateLinkSettings, icAnswerLinkSettings,
  icListPartnerEmployees, icAllocateMembers, icRemoveMember, icSetNumberSeries,
} from './intercompany.js';
export {
  onIcTimeEntryWritten, onIcProjectStateWritten, onIcProjectExpenseWritten, onIcInvoiceWritten,
} from './intercompanyTriggers.js';
export { recordUsage, listEmployeeUsage } from './usageLog.js';
export { logSensitiveAccess, listAccessLog } from './accessLog.js';
export { helpdesk } from './helpdeskCallable.js';
export { customerSurvey } from './customerSurveyCallable.js';
