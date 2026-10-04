/**
 * Leser en avtale for indeksregulering.
 * Lokal tolkning kjører alltid. Gemini fyller ut når nøkkelen er satt.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAuth } from './security.js';
import {
  classifyPlanMime,
  decodePlainText,
  extractDocxText,
  extractPdfText,
} from './documentText.js';
import {
  callGeminiJson,
  friendlyGeminiError,
  getGeminiKey,
} from './aiShared.js';
import { interpretContract, mergeInterpretation } from '../src/indeksregulering/interpret.js';

const PROMPT = `Du leser en norsk avtale om entreprise, underentreprise eller husleie.
Trekk ut bare det som står i teksten. Ikke finn opp beløp, dato, parter eller indeks.
Returner KUN JSON med denne formen:
{
  "title": "",
  "reference": "",
  "buyer": "",
  "supplier": "",
  "standard": "NS 8405 | NS 8406 | NS 8407 | NS 8415 | NS 8416 | NS 8417 | husleieloven | bustadoppføringslova | håndverkertjenesteloven | avtalt",
  "model": "ns3405 | engang | husleie | vektet",
  "indexId": "bki-boligblokk | bki-enebolig | bki-bustader | bki-bustader-arbeid | bki-bustader-materialer | bki-veg | bki-ror | kpi",
  "sharePercent": 100,
  "vatPercent": 25,
  "offerDate": "",
  "tenderDeadline": "",
  "regulationExcluded": false,
  "lines": [{ "text": "", "quantity": 1, "unit": "RS", "rate": 0 }]
}
NS 8407 og NS 8417 uten annen navngitt indeks skal ha indexId bki-boligblokk og model ns3405.
Husleie skal ha model husleie, indexId kpi og vatPercent 0.
Datoer skrives YYYY-MM-DD. Tom streng når feltet ikke finnes. Ikke sett rate til et tall som ikke står i teksten.`;

function reject(code, message) {
  throw new HttpsError(code, message);
}

async function textFromFile(data) {
  const encoded = String(data?.fileBase64 || '').replace(/^data:[^;]+;base64,/, '');
  if (encoded.length < 40) return '';
  const buffer = Buffer.from(encoded, 'base64');
  const kind = classifyPlanMime(data?.mimeType, data?.fileName);
  if (kind === 'pdf') return (await extractPdfText(buffer)).text;
  if (kind === 'docx') return extractDocxText(buffer);
  if (kind === 'text') return decodePlainText(encoded);
  return '';
}

export async function handleInterpretIndeks(data) {
  let text = String(data?.text || '').trim();
  if (text.length < 20) {
    try {
      text = String(await textFromFile(data) || '').trim();
    } catch (error) {
      reject('invalid-argument', error?.message || 'Kunne ikke lese filen.');
    }
  }
  if (text.length < 20) reject('invalid-argument', 'Lim inn avtaleteksten, eller last opp PDF, Word eller tekst.');
  const local = interpretContract(text.slice(0, 40000));
  const apiKey = getGeminiKey();
  if (!apiKey) return { ok: true, extracted: local, engine: 'lokal' };
  try {
    const parsed = await callGeminiJson(apiKey, PROMPT, [
      { text: text.slice(0, 30000) },
    ], { maxOutputTokens: 4096, perModelTimeoutMs: 40000 });
    return { ok: true, extracted: mergeInterpretation(local, parsed), engine: 'gemini' };
  } catch (error) {
    return {
      ok: true,
      extracted: local,
      engine: 'lokal',
      warning: friendlyGeminiError(error),
    };
  }
}

export const interpretIndeksAvtale = onCall(
  {
    region: 'europe-west1',
    cors: true,
    invoker: 'public',
    timeoutSeconds: 90,
    memory: '1GiB',
  },
  async (request) => {
    requireAuth(request.auth);
    return handleInterpretIndeks(request.data || {});
  },
);
