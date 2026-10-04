/**
 * Leser et opplastet skjema og bygger feltene med AI.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAuth } from './security.js';
import { formFromScan } from '../src/anbud/formBuilder.js';
import { classifyPlanMime, decodePlainText, extractDocxText, extractPdfText } from './documentText.js';
import {
  callGeminiJson,
  friendlyGeminiError,
  getGeminiKey,
} from './aiShared.js';

const PROMPT = `Du leser et skjema, en sjekkliste, et brev eller et skannet dokument og bygger et digitalt skjema.
Returner KUN gyldig JSON:
{
  "title": "kort navn på skjemaet",
  "intro": "en setning om hva skjemaet brukes til, eller tom streng",
  "fields": [
    {
      "label": "teksten som står ved feltet",
      "kind": "title|text|long|date|time|number|scale|check|choice|checks|dropdown|image|file",
      "required": false,
      "help": "kort hjelpetekst eller tom streng",
      "options": ["bare for choice, checks og dropdown"]
    }
  ]
}
Bruk title på overskrifter som ikke skal fylles ut.
Bruk date på datoer, time på klokkeslett, number på beløp og antall, scale på en tallskala, check på ja/nei, choice når ett alternativ skal velges, checks når flere kan krysses av, dropdown på lister, image når et bilde skal legges inn, file når et dokument skal lastes opp, long på fritekst over flere linjer.
Ikke finn opp felter som ikke står i dokumentet. Maks 40 felt.`;

function reject(code, message) {
  throw new HttpsError(code, message);
}

async function documentParts(dataUrl, fileName) {
  const cleaned = String(dataUrl || '').replace(/^data:[^;]+;base64,/, '');
  const mime = (String(dataUrl || '').match(/^data:([^;]+);base64,/i) || [])[1] || '';
  const kind = classifyPlanMime(mime, fileName);
  if (cleaned.length < 40) reject('invalid-argument', 'Last opp et bilde eller et dokument.');
  if (kind === 'pdf') {
    const read = await extractPdfText(Buffer.from(cleaned, 'base64'));
    return [{ text: `Dokumenttekst:\n${String(read.text || '').slice(0, 20000)}` }];
  }
  if (kind === 'docx') {
    const read = extractDocxText(Buffer.from(cleaned, 'base64'));
    return [{ text: `Dokumenttekst:\n${String(read || '').slice(0, 20000)}` }];
  }
  if (kind === 'text') {
    return [{ text: `Dokumenttekst:\n${decodePlainText(cleaned).slice(0, 20000)}` }];
  }
  return [
    { text: 'Les dette dokumentet og bygg skjemaet.' },
    { inline_data: { mime_type: mime || 'image/jpeg', data: cleaned } },
  ];
}

export const generateCompanyForm = onCall(
  { region: 'europe-west1', cors: true, invoker: 'public', timeoutSeconds: 90, memory: '1GiB' },
  async (request) => {
    requireAuth(request.auth);
    const apiKey = getGeminiKey();
    if (!apiKey) reject('failed-precondition', 'AI er ikke tilgjengelig akkurat nå.');
    try {
      const parts = await documentParts(request.data?.imageBase64, request.data?.fileName);
      const parsed = await callGeminiJson(apiKey, PROMPT, parts, { maxOutputTokens: 4096, perModelTimeoutMs: 50000 });
      const made = formFromScan(parsed);
      if (!made.ok) reject('failed-precondition', made.error);
      return { ok: true, form: made.form, engine: 'gemini' };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      reject('unavailable', friendlyGeminiError(err));
    }
    return { ok: false };
  },
);
