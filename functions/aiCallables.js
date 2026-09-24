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
import {
  handleAiImportPlan,
  handleApplyAiImport,
  handleDiscardAiImport,
} from './aiImport.js';
import { handleAiMealIngredients } from './aiMealPlan.js';
import { handleAiRecipeImport } from './aiRecipeImport.js';
import { handleAiReceiptOcr } from './aiReceiptOcr.js';
import { handleAiClassListOcr } from './aiClassListOcr.js';
import {
  handleAiMatcoachWeekPlan,
  handleAiMatcoachFridgeScan,
  handleAiMatcoachLunchBoxes,
  handleAiMatcoachSwapMeal,
} from './aiMatcoach.js';
import { handleAiTutor } from './aiTutor.js';
import { handleUploadDocument } from './uploadDocument.js';
import { runAiCleanup } from './aiCleanup.js';
import { handleAiSupportChat, handleCreateSupportTicket } from './aiSupport.js';
import { assertRateLimits, hashRateKey, requireAuth } from './security.js';

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

/** Leksehjelpen — sokratisk steg-for-steg veileder (barn + foresatte). */
export const aiTutor = onCall(
  {
    region: 'europe-west1',
    // Litt slakk: cold start + parallell modell-race skal ikke treffe deadline.
    timeoutSeconds: 120,
    memory: '1GiB',
    cpu: 1,
    cors: true,
  },
  async (req) => {
    try {
      touchGeminiEnv();
      const uid = requireAuth(req.auth);
      // Time for en ekte lekseøkt uten burst-stopp midtveis.
      await guardAiBurst(uid, 'tutor', 45, 100);
      return await handleAiTutor(req.data, req.auth);
    } catch (error) {
      logger.warn('aiTutor failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke starte Leksehjelpen.');
    }
  },
);

/** Generer handleliste-ingredienser for en middag (kun foresatte). */
export const aiMealIngredients = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      await guardAiBurst(uid, 'meal', 15, 40);
      return await handleAiMealIngredients(req.data, req.auth);
    } catch (error) {
      logger.warn('aiMealIngredients failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke generere handleliste for middagen.');
    }
  },
);

/** Importer oppskrift fra bilde eller nettside-URL (kun foresatte). */
export const aiRecipeImport = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
  },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      await guardAiBurst(uid, 'meal', 15, 40);
      return await handleAiRecipeImport(req.data, req.auth);
    } catch (error) {
      logger.warn('aiRecipeImport failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke tolke oppskriften.');
    }
  },
);

/** OCR kvittering/faktura → regnskapsbilag (kun foresatte). */
export const aiReceiptOcr = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '512MiB',
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

/** OCR klasseliste (papir/bilde) → elever, foresatte, lærere. */
export const aiClassListOcr = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
  },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      await guardAiBurst(uid, 'import', 20, 60);
      return await handleAiClassListOcr(req.data, req.auth);
    } catch (error) {
      logger.warn('aiClassListOcr failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke tolke klasselisten.');
    }
  },
);

/** AI Matcoach — generer familietilpasset middagsuke. */
export const aiMatcoachWeekPlan = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 90,
    memory: '512MiB',
    cors: true,
  },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      await guardAiBurst(uid, 'meal', 15, 40);
      return await handleAiMatcoachWeekPlan(req.data, req.auth);
    } catch (error) {
      logger.warn('aiMatcoachWeekPlan failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke lage AI-ukeplan.');
    }
  },
);

/** AI Matcoach — skann kjøleskap (bilde eller tekstliste). */
export const aiMatcoachFridgeScan = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 90,
    memory: '512MiB',
    cors: true,
  },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      await guardAiBurst(uid, 'meal', 15, 40);
      return await handleAiMatcoachFridgeScan(req.data, req.auth);
    } catch (error) {
      logger.warn('aiMatcoachFridgeScan failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke skanne kjøleskapet.');
    }
  },
);

/** AI Matcoach — matpakkeuke. */
export const aiMatcoachLunchBoxes = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      await guardAiBurst(uid, 'meal', 15, 40);
      return await handleAiMatcoachLunchBoxes(req.data, req.auth);
    } catch (error) {
      logger.warn('aiMatcoachLunchBoxes failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke lage matpakker.');
    }
  },
);

/** AI Matcoach — bytt én middag i planen. */
export const aiMatcoachSwapMeal = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      await guardAiBurst(uid, 'meal', 15, 40);
      return await handleAiMatcoachSwapMeal(req.data, req.auth);
    } catch (error) {
      logger.warn('aiMatcoachSwapMeal failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke bytte rett.');
    }
  },
);

/** Analyser skole-/ukeplan-bilde → forslag til godkjenning (kun foresatte). */
export const aiImportPlan = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 180,
    memory: '1GiB',
    cors: true,
  },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      await guardAiBurst(uid, 'import', 8, 30);
      return await handleAiImportPlan(req.data, req.auth);
    } catch (error) {
      logger.warn('aiImportPlan failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke analysere dokumentet.');
    }
  },
);

/** Lagre godkjente AI-forslag på barnet. */
export const applyAiImport = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      return await handleApplyAiImport(req.data, req.auth);
    } catch (error) {
      logger.warn('applyAiImport failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke lagre forslagene.');
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

/** Avvis utkast og slett midlertidig bilde. */
export const discardAiImport = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      return await handleDiscardAiImport(req.data, req.auth);
    } catch (error) {
      logger.warn('discardAiImport failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke avvise utkastet.');
    }
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

/** Signert URL for familiealbum — støtter fremdriftsbar opplasting (inkl. video). */
export const createAlbumUploadUrl = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      const { handleCreateAlbumUploadUrl } = await import('./uploadAlbum.js');
      return await handleCreateAlbumUploadUrl(req.data, req.auth);
    } catch (error) {
      logger.warn('createAlbumUploadUrl failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke starte album-opplasting.');
    }
  },
);

/** Base64-opplasting for album-varianter / mindre filer (≤ 15 MB). */
export const uploadAlbumFile = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
  },
  async (req) => {
    try {
      const { handleUploadAlbumFile } = await import('./uploadAlbum.js');
      return await handleUploadAlbumFile(req.data, req.auth);
    } catch (error) {
      logger.warn('uploadAlbumFile failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke laste opp til album.');
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
