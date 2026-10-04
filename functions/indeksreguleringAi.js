/**
 * Leser alle avtaledokumentene for indeksregulering, og sjekker SSB én gang i døgnet.
 * Lokal tolkning kjører alltid. Gemini fyller ut når nøkkelen er satt.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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
import { INDEX_SERIES } from '../src/indeksregulering/catalog.js';
import { interpretDocuments, mergeInterpretation } from '../src/indeksregulering/interpret.js';
import { fetchAllIndices } from '../src/indeksregulering/ssb.js';
import { indexNews, latestMap } from '../src/indeksregulering/watch.js';

const INDEX_GUIDE = INDEX_SERIES.map((row) => `${row.id} = ${row.name}, tabell ${row.table}`).join('\n');

const PROMPT = `Du leser ett eller flere norske avtaledokumenter som sammen utgjør én avtale om entreprise, rådgivning eller leie.
Metoden er NS 3405 når avtalen er en NS-entreprise eller viser til lønns- og prisstigning: e = A × s × (t − t0) / t0.
A er ytelsen i kontraktens priser eks. mva. s er regulert andel. t0 er indeksen i basismåneden. t er indeksen i avregningsmåneden.
Basismåneden er måneden tilbudsfristen løp ut. Uten tilbudsfrist brukes tilbudsdatoen. Bruk kontraktsdato bare når avtalen sier det.
Fast andel trekkes fra 100 og blir sharePercent. Terskel og tak skal bare fylles ut når avtalen nevner dem.
Når dokumentene sier forskjellig, gjelder det siste dokumentet.
Trekk ut bare det som står i teksten. Ikke finn opp beløp, dato, parter, andel eller indeks.
Returner KUN JSON:
{
  "title": "",
  "reference": "",
  "buyer": "",
  "supplier": "",
  "standard": "NS 8403 | NS 8405 | NS 8406 | NS 8407 | NS 8415 | NS 8416 | NS 8417 | husleieloven | bustadoppføringslova | håndverkertjenesteloven | avtalt",
  "model": "ns3405 | engang | husleie | vektet",
  "indexId": "",
  "sharePercent": 100,
  "vatPercent": 25,
  "offerDate": "",
  "tenderDeadline": "",
  "contractDate": "",
  "regulationExcluded": false,
  "honorar": "",
  "place": "",
  "poNumber": "",
  "terms": {
    "baseRule": "auto | tender | offer | contract",
    "frequency": "month | quarter | year | once",
    "thresholdPercent": "",
    "capPercent": "",
    "roundToKrone": false,
    "variables": [{ "name": "", "value": "" }]
  },
  "lines": [{ "text": "", "quantity": 1, "unit": "RS", "rate": 0, "indexId": "", "sharePercent": "", "included": true }],
  "weights": [{ "indexId": "", "weight": 0 }]
}
Gyldige indexId:
${INDEX_GUIDE}
NS 8407 og NS 8417 uten annen navngitt indeks skal ha indexId bki-boligblokk og model ns3405.
NS 8403 og timepris for konsulent skal ha indexId ppi-byggeteknisk og model engang når tabell 14335 eller byggeteknisk konsulentvirksomhet er nevnt.
Husleie skal ha model husleie, indexId kpi og vatPercent 0.
Datoer skrives YYYY-MM-DD. Tom streng når feltet ikke finnes. rate skal være et tall som står i teksten.
variables er andre størrelser avtalen navngir, for eksempel sosiale utgifter eller materialandel, skrevet slik de står.`;

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

function documentsFrom(data, fallbackText) {
  const incoming = Array.isArray(data?.documents) ? data.documents : [];
  const documents = incoming.map((doc, index) => ({
    id: `dok-${index + 1}`,
    name: String(doc?.name || `Dokument ${index + 1}`).slice(0, 180),
    text: String(doc?.text || '').trim().slice(0, 20000),
  })).filter((doc) => doc.text.length >= 20);
  if (!documents.length && fallbackText.length >= 20) {
    documents.push({ id: 'dok-1', name: String(data?.fileName || 'Avtale').slice(0, 180), text: fallbackText.slice(0, 40000) });
  }
  return documents;
}

function agreementText(documents) {
  return documents.map((doc, index) => `DOKUMENT ${index + 1}: ${doc.name}\n${doc.text}`).join('\n\n');
}

export async function handleInterpretIndeks(data) {
  let text = String(data?.text || '').trim();
  if (text.length < 20 && !Array.isArray(data?.documents)) {
    try {
      text = String(await textFromFile(data) || '').trim();
    } catch (error) {
      reject('invalid-argument', error?.message || 'Kunne ikke lese filen.');
    }
  }
  const documents = documentsFrom(data, text);
  if (!documents.length) reject('invalid-argument', 'Lim inn avtaleteksten, eller last opp PDF, Word eller tekst.');
  const source = agreementText(documents);
  const local = interpretDocuments(documents);
  const apiKey = getGeminiKey();
  if (!apiKey) return { ok: true, extracted: local, engine: 'lokal', documents: documents.length };
  try {
    const parsed = await callGeminiJson(apiKey, PROMPT, [
      { text: source.slice(0, 45000) },
    ], { maxOutputTokens: 8192, perModelTimeoutMs: 45000 });
    if (Array.isArray(parsed?.weights) && parsed.weights.length >= 2) {
      local.weights = parsed.weights.slice(0, 8).map((row) => ({
        indexId: String(row?.indexId || ''),
        weight: String(row?.weight ?? ''),
      })).filter((row) => INDEX_SERIES.some((item) => item.id === row.indexId));
      if (local.weights.length >= 2) local.model = local.model === 'husleie' ? local.model : 'vektet';
    }
    return {
      ok: true,
      extracted: mergeInterpretation(local, parsed, source),
      engine: 'gemini',
      documents: documents.length,
    };
  } catch (error) {
    return {
      ok: true,
      extracted: local,
      engine: 'lokal',
      documents: documents.length,
      warning: friendlyGeminiError(error),
    };
  }
}

export async function recordSsbCheck(fetchImpl = fetch) {
  if (!getApps().length) initializeApp();
  const bundle = await fetchAllIndices({ fetchImpl });
  const db = getFirestore();
  const ref = db.doc('system/indeksSsb');
  const prev = await ref.get();
  const next = latestMap(bundle.series);
  const news = indexNews(prev.data()?.series, next);
  const row = {
    checkedAt: new Date().toISOString(),
    errors: bundle.errors || [],
    series: next,
    news,
  };
  await ref.set(row);
  logger.info('SSB-indeks sjekket', { series: Object.keys(next).length, news: news.length });
  return row;
}

export const indeksSsbDaily = onSchedule(
  {
    schedule: 'every day 07:00',
    timeZone: 'Europe/Oslo',
    region: 'europe-west1',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async () => {
    try {
      await recordSsbCheck();
    } catch (error) {
      logger.error('SSB-sjekken feilet', { message: error?.message });
    }
  },
);

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
