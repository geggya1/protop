/**
 * Leser et opplastet skjema og bygger feltene med AI.
 * Keep this entry inside functions/ — ../src is not uploaded on slim deploys.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { requireAuth } from './security.js';
import { formFromScan, formPrompt, mergeFormReads } from './anbud/formBuilder.js';
import { formDocumentParts } from './formDocument.js';
import { touchGeminiEnv } from './geminiEnv.js';
import {
  callGeminiJson,
  friendlyGeminiError,
  getGeminiKey,
} from './aiShared.js';

function reject(code, message) {
  throw new HttpsError(code, message);
}

function readForm(parsed, localForm) {
  const scanned = parsed ? formFromScan(parsed) : null;
  const merged = mergeFormReads(localForm, scanned?.ok ? scanned.form : null);
  return merged?.fields?.length ? merged : null;
}

export const generateCompanyForm = onCall(
  { region: 'europe-west1', cors: true, invoker: 'public', timeoutSeconds: 120, memory: '1GiB' },
  async (request) => {
    try {
      requireAuth(request.auth);
      touchGeminiEnv();
      const prepared = await formDocumentParts(request.data?.imageBase64, request.data?.fileName);
      if (prepared.error) reject('invalid-argument', prepared.error);
      if (!prepared.parts.length && !prepared.localForm) reject('invalid-argument', 'Last opp et bilde eller et dokument.');
      const apiKey = getGeminiKey();
      let parsed = null;
      let engine = prepared.localForm ? (prepared.usedOcr ? 'ocr' : 'text') : '';
      if (!apiKey && !prepared.localForm) reject('failed-precondition', 'AI er ikke tilgjengelig akkurat nå.');
      if (apiKey && prepared.parts.length > 1) {
        try {
          parsed = await callGeminiJson(apiKey, formPrompt(), prepared.parts, { maxOutputTokens: 8192, perModelTimeoutMs: 55000 });
          engine = prepared.usedOcr ? 'ocr+gemini' : 'gemini';
        } catch (err) {
          if (!prepared.localForm) throw err;
          logger.warn('generateCompanyForm used local read', { message: err?.message });
        }
      }
      const form = readForm(parsed, prepared.localForm);
      if (!form) reject('failed-precondition', 'AI fant ikke et skjema i dokumentet.');
      return {
        ok: true,
        form,
        engine: engine || 'text',
        summary: String(parsed?.designNote || '').replace(/\s+/g, ' ').trim().slice(0, 240),
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.warn('generateCompanyForm failed', { message: err?.message });
      reject('failed-precondition', friendlyGeminiError(err));
    }
    return { ok: false };
  },
);
