/**
 * AI callables (Gemini). Kept out of index.js so CI can deploy them without
 * loading MAIL_API_KEY from Secret Manager.
 *
 * Region is pinned on every onCall + setRegion is imported first: without that,
 * new functions land in us-central1 while the web client calls europe-west1
 * (silent 404 — looks like “AI does nothing”).
 */
import './setRegion.js';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import './geminiEnv.js';
import { touchGeminiEnv } from './geminiEnv.js';
import { handleAiChat } from './aiChat.js';
import { handleAiVoiceNote } from './aiVoiceNote.js';
import { handleAiReceiptOcr } from './aiReceiptOcr.js';
import { handleMileageRates } from './mileageRates.js';
import { handleInterpretImport } from './importInterpret.js';
import { handleUploadDocument } from './uploadDocument.js';
import { handleUploadStorageFile, handleDownloadStorageFile, handleApplyStorageCors } from './uploadStorage.js';
import { runAiCleanup } from './aiCleanup.js';
import { handleAiSupportChat, handleCreateSupportTicket } from './aiSupport.js';
import { handleScanTimesheet } from './timesheetReviewAi.js';
import { assertCompanyAiAllowed } from './aiShared.js';
import { assertFamilyMember, assertRateLimits, hashRateKey, requireAuth } from './security.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

function rethrowCallable(error, fallback) {
  if (error instanceof HttpsError) throw error;
  const message = String(error?.message || fallback || 'Noe gikk galt.').slice(0, 400);
  const code = error?.code === 'resource-exhausted' ? 'resource-exhausted' : 'failed-precondition';
  // failed-precondition/resource-exhausted sender meldingen til klienten (ikke bare INTERNAL).
  throw new HttpsError(code, message);
}

async function guardAiBurst(uid, kind, hourlyLimit, dailyLimit) {
  await assertRateLimits(db, {
    key: hashRateKey([`ai-${kind}`, uid]),
    hourlyLimit,
    dailyLimit,
  });
}

/** Spør-AI chatbot — Gemini når GEMINI_API_KEY er satt, ellers lokale fallback-svar. */
export const aiChat = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      await guardAiBurst(uid, 'chat', 40, 80);
      return await handleAiChat(req.data, req.auth);
    } catch (error) {
      logger.warn('aiChat failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke hente svar fra AI-assistenten.');
    }
  },
);

/** AI lydnotater — oppsummer transkripsjon og svar på spørsmål om notatet. */
export const aiVoiceNote = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 90,
    memory: '512MiB',
    cors: true,
  },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      await guardAiBurst(uid, 'voice', 20, 60);
      return await handleAiVoiceNote(req.data, req.auth);
    } catch (error) {
      logger.warn('aiVoiceNote failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke behandle lydnotatet.');
    }
  },
);

/**
 * OCR kvittering/faktura → regnskapsbilag. Utlegg (purpose 'expense'): skann av store bilder
 * og to tolkerunder, derfor mer minne og tid.
 */
export const aiReceiptOcr = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 300,
    memory: '1GiB',
    cors: true,
  },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      await guardAiBurst(uid, 'import', 20, 60);
      return await handleAiReceiptOcr(req.data, req.auth);
    } catch (error) {
      logger.warn('aiReceiptOcr failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke tolke kvitteringen.');
    }
  },
);

/**
 * Satser for bilgodtgjørelse (statens sats og trekkfri sats), hentet automatisk og lagret i ett døgn.
 * Alle innloggede kan lese dem. Se mileageRates.js.
 */
export const mileageRates = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
  },
  async (req) => {
    try {
      requireAuth(req.auth);
      return await handleMileageRates(req.auth);
    } catch (error) {
      logger.warn('mileageRates failed', { message: error?.message });
      rethrowCallable(error, 'Kunne ikke hente satsene.');
    }
  },
);

/** OCR og kolonne-tolking av kundelister, medarbeiderlister og CV-er. */
export const interpretImport = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 180,
    memory: '1GiB',
    cors: true,
  },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      await guardAiBurst(uid, 'import', 20, 60);
      return await handleInterpretImport(req.data, req.auth);
    } catch (error) {
      logger.warn('interpretImport failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke tolke importfilen.');
    }
  },
);

/** Planlagt opprydding av utløpte AI-utkast, midlertidige bilder og gamle tellere. */
export const aiCleanupScheduled = onSchedule(
  {
    schedule: 'every 6 hours',
    region: 'europe-west1',
    memory: '256MiB',
    timeoutSeconds: 300,
  },
  async () => {
    const stats = await runAiCleanup();
    logger.info('[aiCleanupScheduled]', stats);
  },
);

/** Last opp dokument via server — omgår Storage CORS-problemer på web. */
export const uploadDocumentFile = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
  },
  async (req) => {
    try {
      return await handleUploadDocument(req.data, req.auth);
    } catch (error) {
      logger.warn('uploadDocumentFile failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke laste opp filen.');
    }
  },
);

/** Generell bilde/fil-opplasting via Admin SDK (CV, profil, osv.). */
export const uploadStorageFile = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
  },
  async (req) => {
    try {
      return await handleUploadStorageFile(req.data, req.auth);
    } catch (error) {
      logger.warn('uploadStorageFile failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke laste opp filen.');
    }
  },
);

/** Bilde-nedlasting via Admin SDK — CV-PDF på web (omgår Storage CORS). */
export const downloadStorageFile = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 60,
    memory: '512MiB',
    cors: true,
  },
  async (req) => {
    try {
      return await handleDownloadStorageFile(req.data, req.auth);
    } catch (error) {
      logger.warn('downloadStorageFile failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke hente bildet.');
    }
  },
);

/** Sett GCS CORS for Firebase Storage-bucketen. */
export const applyStorageCors = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      return await handleApplyStorageCors(req.data, req.auth);
    } catch (error) {
      logger.warn('applyStorageCors failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke oppdatere Storage CORS.');
    }
  },
);

/** Skjetten — Help & support chatbot (FAQ + escalate to ticket). */
export const aiSupportChat = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      await guardAiBurst(uid, 'support', 40, 80);
      return await handleAiSupportChat(req.data, req.auth);
    } catch (error) {
      logger.warn('aiSupportChat failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke hente svar fra hjelpeboten.');
    }
  },
);

/** Kontroll av låst timeliste: skrivefeil og avvik før godkjenning. */
export const scanTimesheetReview = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 45,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      await guardAiBurst(uid, 'timesheetReview', 30, 80);
      // Nyere klienter sender bedriften, så en bedrift som har slått av AI, ikke får timelisten sendt.
      const familyId = String(req.data?.familyId || '').trim();
      if (familyId) {
        await assertFamilyMember(db, familyId, uid);
        await assertCompanyAiAllowed(db, familyId);
      }
      return await handleScanTimesheet(req.data);
    } catch (error) {
      logger.warn('scanTimesheetReview failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke lese timelisten.');
    }
  },
);

/** Opprett supportsak med saksnummer (+ bug-analyse til admin ved feilmeldinger). */
export const createSupportTicket = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 90,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      await guardAiBurst(uid, 'supportTicket', 10, 20);
      return await handleCreateSupportTicket(req.data, req.auth);
    } catch (error) {
      logger.warn('createSupportTicket failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke opprette supportsak.');
    }
  },
);
