/**
 * Avtalelesing uten SSB-scheduler, slik at slim HTTP-deploy ikke trenger ../src.
 */
import { HttpsError } from 'firebase-functions/v2/https';
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
import { ocrPdfPages } from './ocrPdf.js';
import { INDEX_SERIES } from './indeksregulering/catalog.js';
import { interpretDocuments, mergeInterpretation } from './indeksregulering/interpret.js';

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
  "startDate": "",
  "endDate": "",
  "regulationExcluded": false,
  "honorar": "",
  "place": "",
  "address": "",
  "description": "",
  "poNumber": "",
  "orgnr": "",
  "supplierOrgnr": "",
  "personnummer": "",
  "contactName": "",
  "phone": "",
  "email": "",
  "surchargePercent": "",
  "kind": "oppdrag | rammeavtale | avrop | endring | ",
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
kind fylles bare når dokumentet selv sier rammeavtale, avrop, endring eller oppdragsavtale.
personnummer og orgnr fylles bare når sifrene står i teksten. Ikke gjette.
variables er andre størrelser avtalen navngir, for eksempel sosiale utgifter eller materialandel, skrevet slik de står.`;

function reject(code, message) {
  throw new HttpsError(code, message);
}

async function readPdf(buffer) {
  let text = '';
  try {
    text = String((await extractPdfText(buffer)).text || '').trim();
  } catch {
    text = '';
  }
  const ocr = text.length >= 40 ? { text: '', images: [] } : await ocrPdfPages(buffer).catch(() => ({ text: '', images: [] }));
  const combined = [text, ocr.text].filter(Boolean).join('\n').trim();
  return { text: combined, images: ocr.images || [] };
}

async function textFromFile(data) {
  const encoded = String(data?.fileBase64 || '').replace(/^data:[^;]+;base64,/, '');
  if (encoded.length < 40) return { text: '', images: [] };
  const buffer = Buffer.from(encoded, 'base64');
  const kind = classifyPlanMime(data?.mimeType, data?.fileName);
  if (kind === 'pdf') return readPdf(buffer);
  if (kind === 'image') {
    return {
      text: '',
      images: [{ buffer, mime: String(data?.mimeType || 'image/jpeg') }],
    };
  }
  if (kind === 'docx') return { text: extractDocxText(buffer), images: [] };
  if (kind === 'text') return { text: decodePlainText(encoded), images: [] };
  return { text: '', images: [] };
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
  let images = [];
  if (text.length < 20 || data?.fileBase64) {
    try {
      const read = await textFromFile(data);
      if (read.text.length > text.length) text = read.text;
      images = read.images || [];
    } catch (error) {
      if (!Array.isArray(data?.documents) || !(data.documents || []).some((doc) => String(doc?.text || '').trim().length >= 20)) {
        reject('invalid-argument', error?.message || 'Kunne ikke lese filen.');
      }
    }
  }
  const documents = documentsFrom(data, text);
  const source = documents.length ? agreementText(documents) : text;
  if (!documents.length && !images.length) {
    reject('invalid-argument', 'Lim inn avtaleteksten, eller last opp PDF, Word eller tekst.');
  }
  const local = documents.length
    ? interpretDocuments(documents)
    : interpretDocuments([{ id: 'dok-1', name: String(data?.fileName || 'Avtale').slice(0, 180), text: source || 'Skannet avtale' }]);
  const apiKey = getGeminiKey();
  const parts = [];
  if (source.length >= 20) parts.push({ text: source.slice(0, 45000) });
  else parts.push({ text: 'Les den skannede avtalen i bildene og fyll ut JSON-feltene. Ikke finn opp verdier som ikke står i dokumentet.' });
  for (const image of images.slice(0, 6)) {
    const raw = image?.buffer || image;
    if (!Buffer.isBuffer(raw) || raw.length < 40) continue;
    parts.push({
      inline_data: {
        mime_type: image?.mime || 'image/png',
        data: raw.toString('base64'),
      },
    });
  }
  if (!apiKey) {
    if (!documents.length) reject('invalid-argument', 'Kunne ikke lese teksten i PDF-en. Lim inn teksten, eller prøv igjen.');
    return { ok: true, extracted: local, engine: images.length ? 'ocr' : 'lokal', documents: documents.length, text: source };
  }
  try {
    const parsed = await callGeminiJson(apiKey, PROMPT, parts, { maxOutputTokens: 8192, perModelTimeoutMs: 45000 });
    if (Array.isArray(parsed?.weights) && parsed.weights.length >= 2) {
      local.weights = parsed.weights.slice(0, 8).map((row) => ({
        indexId: String(row?.indexId || ''),
        weight: String(row?.weight ?? ''),
      })).filter((row) => INDEX_SERIES.some((item) => item.id === row.indexId));
      if (local.weights.length >= 2) local.model = local.model === 'husleie' ? local.model : 'vektet';
    }
    const mergedSource = [source, parsed?.title, parsed?.buyer, parsed?.honorar].filter(Boolean).join('\n');
    return {
      ok: true,
      extracted: mergeInterpretation(local, parsed, mergedSource),
      engine: images.length ? 'ocr+gemini' : 'gemini',
      documents: Math.max(documents.length, 1),
      text: source,
    };
  } catch (error) {
    if (!documents.length) reject('failed-precondition', friendlyGeminiError(error));
    return {
      ok: true,
      extracted: local,
      engine: images.length ? 'ocr' : 'lokal',
      documents: documents.length,
      text: source,
      warning: friendlyGeminiError(error),
    };
  }
}

