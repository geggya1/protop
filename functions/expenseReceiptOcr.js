/**
 * Utlegg: tolking av kvitteringer den ansatte har lastet opp (aiReceiptOcr med purpose 'expense').
 *
 * 1. Filene hentes fra Storage. Bare filer under families/{bedrift}/mileage/utlegg/{uid}/, altså
 *    det personen selv har lastet opp. Opptil 40 MB per fil.
 * 2. Bilder appen ikke har skannet (appen på telefonen, store originaler), beskjæres og skannes
 *    her (receiptScan.js). Skannet lagres ved siden av originalen og blir bilaget.
 * 3. AI-en får skann og fargebilde av hver del. Første runde med en rask, sterk modell.
 * 4. Mangler noe, er sikkerheten lav eller går ikke summene opp (receiptProblems), kontrolleres
 *    tolkningen i en ny runde med den sterkeste modellen, med funnene som kontekst.
 * Svaret er bilag, det som fortsatt ikke stemmer (checks) og skannene som ble laget.
 */
import { randomUUID } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import {
  AI_LIMITS,
  GEMINI_MODEL_FALLBACKS,
  assertCompanyAiAllowed,
  callGeminiJson,
  checkAndIncrementUsage,
  friendlyGeminiError,
  getGeminiKey,
} from './aiShared.js';
import { assertCompanyMember } from './companyMember.js';
import { mergeReceiptPasses, normalizeReceiptBilag, receiptProblems } from './receiptNormalize.js';
import { scanReceiptImage, scannableMime } from './receiptScan.js';
import { mediaBucket } from './storageBucket.js';

export const EXPENSE_PROMPT = `Du er en svært nøyaktig norsk regnskapsassistent. En ansatt har tatt bilde av en kvittering
for et utlegg. Kvitteringen kan være krøllete, blek (termopapir), i skygge eller delvis uklar. Les den
nøye, tegn for tegn, og returner KUN gyldig JSON:
{
  "supplier": "butikk/leverandør slik den står øverst, uten adresse",
  "orgNr": "9 sifre uten mellomrom (Org.nr / Foretaksregisteret), eller tom streng",
  "vendorCountry": "landkode, f.eks. NO",
  "date": "YYYY-MM-DD, kjøpsdatoen",
  "time": "HH:MM eller tom streng",
  "amount": 69.00,
  "currency": "ISO 4217-kode, f.eks. NOK",
  "vatAmount": 13.80,
  "vatPercent": 25,
  "vatLines": [{ "percent": 25, "base": 55.20, "vat": 13.80 }],
  "paymentMethod": "kort|kontant|vipps|faktura|annet|tom streng",
  "cardLast4": "fire siste sifre på kortet, eller tom streng",
  "invoiceNumber": "kvitterings-/bong-/fakturanummer, eller tom streng",
  "documentType": "receipt|invoice|card_slip|other",
  "isService": false,
  "expenseType": "id fra listen over utgiftstyper",
  "category": "kort kategori på norsk",
  "lineItems": [{ "description": "varetekst", "quantity": 1, "amount": 69.00 }],
  "suggestedTitle": "kort beskrivelse på norsk, f.eks. «Parkering Aker brygge» eller «Lunsj med kunde – Egon»",
  "purpose": "forslag til formål for utlegget, én kort setning på norsk",
  "notes": "",
  "duplicatePages": false,
  "confidence": 0.0
}
Bildene:
- Hver del av kvitteringen kommer som et skann (svart-hvitt, forbedret) og ofte et fargebilde av samme del.
  Les teksten i skannet. Bruk fargebildet når et tegn er uklart i skannet, og omvendt.
- Flere deler kan være én lang kvittering, eller samme kvittering tatt flere ganger.
  Tell hvert kjøp bare én gang. Er det samme kvittering to ganger, sett duplicatePages true.
  Er det kortterminalens kvittering og butikkens kvittering for samme kjøp, er det ett kjøp.
Regler:
- amount er beløpet som faktisk ble betalt, inkl. mva og eventuell tips: TOTAL, SUM, Å BETALE, BETALT
  eller beløpet på kortlinjen/terminalutskriften. Ikke del- eller mellomsummer, ikke «Eks mva»-kolonnen.
- Kontroller selv: mva-linjene (grunnlag + mva) skal til sammen bli totalen, og mva = grunnlag × sats.
  Stemmer det ikke, les tallene på nytt før du svarer.
- date: kjøpsdatoen, ikke utskriftsdato eller «bytte innen». Les norske formater: 07.10.20, 07/10/2020,
  «onsdag 7. oktober 2020». Tosifret år er 20xx.
- Beløp er tall med punktum som desimaltegn. «1.234,50» er 1234.50. Ikke ta med «kr».
- vatLines: én rad per mva-sats fra mva-spesifikasjonen (Mva % / Grunnlag / Mva). Tom liste hvis den mangler.
  vatPercent er satsen når det bare er én. Norske satser er 25, 15, 12 og 0.
- currency: kr eller NOK i Norge er NOK. Bruk land, adresse og symbol (€, SEK, DKK, $, £) for andre valutaer.
- isService: true når kjøpet er en tjeneste (abonnement, programvare, transport, overnatting, kurs), false for varer.
- expenseType: velg den id-en i listen som passer best ut fra butikk og varer. Bruk «other» bare når ingen passer.
- purpose: foreslå formålet ut fra varene og konteksten (prosjekt, fakturering), f.eks. «Materiell til prosjekt #12».
- Hvis noe ikke står på kvitteringen: tom streng eller null. Ikke gjett beløp eller dato.
- confidence 0–1: hvor sikker du er på beløp, dato og leverandør samlet.
- Ingen markdown eller tekst utenfor JSON.`;

// Kvitteringer leses med sterkere modeller enn resten av appen (lite-modellene bommer på uklare tall).
export const RECEIPT_MODELS = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  ...GEMINI_MODEL_FALLBACKS,
].filter((model, index, list) => model && list.indexOf(model) === index);

export const VERIFY_MODELS = [
  'gemini-pro-latest',
  'gemini-2.5-pro',
  ...RECEIPT_MODELS,
].filter((model, index, list) => model && list.indexOf(model) === index);

const MAX_FILES = 4;
export const MAX_FILE_BYTES = 40 * 1024 * 1024;
// Gemini tar inntil 20 MB per forespørsel. Litt margin til tekst og base64.
const MAX_INLINE_BYTES = 14 * 1024 * 1024;
const MAX_LEGACY_BASE64_CHARS = 12_000_000;

function cleanStr(v, max = 200) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Typene appen tilbyr, «id: navn; …». Bare bokstaver i id-en, og kort. */
export function cleanTypeList(value) {
  return String(value || '')
    .split(';')
    .map((item) => item.trim())
    .filter((item) => /^[a-z]{2,24}: .{1,60}$/.test(item))
    .slice(0, 60)
    .join('; ');
}

/** Stien må ligge i personens egen utleggsmappe i bedriften. */
export function ownReceiptPath(path, familyId, uid) {
  const value = String(path || '').trim();
  const prefix = `families/${familyId}/mileage/utlegg/${String(uid || '').replace(/[^\w-]+/g, '_')}/`;
  if (!familyId || !uid || !value.startsWith(prefix) || value.includes('..') || value.length > 400 || value.endsWith('/')) {
    const err = new Error('Kvitteringen ligger ikke i din utleggsmappe.');
    err.code = 'permission-denied';
    throw err;
  }
  return value;
}

/** Eldre klienter sendte bildet med kallet (data-URL). */
export function inlinePart(dataUrl) {
  const raw = String(dataUrl || '');
  const mimeMatch = raw.match(/^data:([^;]+);base64,/i);
  const mime = (mimeMatch?.[1] || 'image/jpeg').toLowerCase();
  if (!/^image\/(jpeg|png|webp|heic|heif)$|^application\/pdf$/.test(mime)) {
    throw new Error('Kvitteringen må være et bilde eller en PDF.');
  }
  const data = raw.replace(/^data:[^;]+;base64,/, '');
  if (data.length < 80) throw new Error('Send bilde av kvitteringen.');
  if (data.length > MAX_LEGACY_BASE64_CHARS) throw new Error('Filen er for stor. Ta et nytt bilde eller velg en mindre fil.');
  return { inline_data: { mime_type: mime, data } };
}

function part(buffer, mime) {
  return { inline_data: { mime_type: mime, data: buffer.toString('base64') } };
}

async function download(bucket, path) {
  const file = bucket.file(path);
  const [meta] = await file.getMetadata().catch(() => [null]);
  if (!meta) throw new Error('Fant ikke kvitteringen i lagringen. Last den opp på nytt.');
  const size = Number(meta.size || 0);
  if (size > MAX_FILE_BYTES) throw new Error(`Filen er ${Math.round(size / 1048576)} MB. Største fil er 40 MB.`);
  const [buffer] = await file.download();
  return { buffer, mime: String(meta.contentType || 'application/octet-stream').toLowerCase() };
}

/** Lagrer skannet ved siden av originalen, med nedlastingslenke. */
async function saveScan(bucket, path, buffer, uid) {
  const target = `${path.replace(/\.[A-Za-z0-9]{2,5}$/, '')}-skann.jpg`;
  const token = randomUUID();
  await bucket.file(target).save(buffer, {
    metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: token, uploadedBy: uid } },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(target)}?alt=media&token=${token}`;
  return { path: target, url };
}

/**
 * Bildedeler til AI-en for én fil. kind: 'scan' (nettleseren har skannet, colorPath er fargebildet),
 * 'color' eller 'original' (skannes her når det er et vanlig bilde).
 */
async function filePieces(bucket, entry, { familyId, uid }) {
  const path = ownReceiptPath(entry?.path, familyId, uid);
  const kind = ['scan', 'color', 'original'].includes(entry?.kind) ? entry.kind : 'original';
  const main = await download(bucket, path);
  if (kind === 'scan') {
    const pieces = [{ role: 'scan', buffer: main.buffer, mime: 'image/jpeg' }];
    if (entry.colorPath) {
      const color = await download(bucket, ownReceiptPath(entry.colorPath, familyId, uid)).catch(() => null);
      if (color) pieces.push({ role: 'color', buffer: color.buffer, mime: 'image/jpeg' });
    }
    return { path, pieces };
  }
  if (scannableMime(main.mime)) {
    const made = await scanReceiptImage(main.buffer);
    if (made) {
      const saved = await saveScan(bucket, path, made.scan, uid);
      return {
        path,
        scan: { ...saved, cropped: made.cropped },
        pieces: [
          { role: 'scan', buffer: made.scan, mime: 'image/jpeg' },
          { role: 'color', buffer: made.color, mime: 'image/jpeg' },
        ],
      };
    }
  }
  const mime = /pdf/.test(main.mime) ? 'application/pdf' : main.mime;
  if (!/^image\/|^application\/pdf$/.test(mime)) throw new Error('Kvitteringen må være et bilde eller en PDF.');
  return { path, pieces: [{ role: 'original', buffer: main.buffer, mime }] };
}

/** Delene i rekkefølge med etiketter. Fargebilder droppes først hvis det blir for mye. */
export function assembleParts(files) {
  const total = (list) => list.reduce((sum, file) => sum + file.pieces.reduce((acc, p) => acc + p.buffer.length, 0), 0);
  let list = files;
  if (total(list) > MAX_INLINE_BYTES) {
    list = files.map((file) => ({ ...file, pieces: file.pieces.filter((p) => p.role !== 'color' || file.pieces.length === 1) }));
  }
  if (total(list) > MAX_INLINE_BYTES) {
    throw new Error('Kvitteringen er for stor til å tolkes samlet (maks 14 MB etter skanning). Tolk færre sider om gangen.');
  }
  const parts = [];
  list.forEach((file, index) => {
    for (const piece of file.pieces) {
      const label = piece.role === 'scan' ? 'skann' : piece.role === 'color' ? 'fargebilde' : 'original';
      parts.push({ text: `Del ${index + 1} av ${list.length} (${label}):` });
      parts.push(part(piece.buffer, piece.mime));
    }
  });
  return parts;
}

function contextText(data) {
  const types = cleanTypeList(data?.expenseTypes);
  const hint = cleanStr(data?.hint, 300);
  return [
    types ? `Utgiftstyper (id: navn): ${types}.` : '',
    hint ? `Kontekst: ${hint}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * To runder: tolk, kontroller. callModel(prompt, parts, models) gir rå JSON.
 * Gir { bilag, checks, verified }.
 */
export async function interpretReceipt({ parts, context = '', callModel, today }) {
  const intro = { text: ['Tolk kvitteringen til et utlegg.', context].filter(Boolean).join('\n') };
  const first = normalizeReceiptBilag(await callModel(EXPENSE_PROMPT, [intro, ...parts], RECEIPT_MODELS));
  const problems = receiptProblems(first, { today });
  if (!problems.length) return { bilag: first, checks: [], verified: false };
  let second = null;
  try {
    second = normalizeReceiptBilag(await callModel(EXPENSE_PROMPT, [{
      text: [
        'Kontroller denne tolkningen av kvitteringen mot bildene, felt for felt, og rett alt som er feil.',
        `Funn som må sjekkes: ${problems.join(' ')}`,
        `Tolkningen: ${JSON.stringify(first)}`,
        context,
        'Returner hele JSON-en på nytt med riktige verdier.',
      ].filter(Boolean).join('\n'),
    }, ...parts], VERIFY_MODELS));
  } catch {
    // Kontrollrunden er en forbedring. Feiler den, brukes første tolkning med funnene som varsler.
  }
  const bilag = second ? normalizeReceiptBilag(mergeReceiptPasses(first, second)) : first;
  return { bilag, checks: receiptProblems(bilag, { today }), verified: !!second };
}

export async function handleExpenseReceipt(data, uid) {
  const db = getFirestore();
  const familyId = String(data?.familyId || '').trim();
  await assertCompanyMember(db, familyId, uid);
  await assertCompanyAiAllowed(db, familyId);

  const entries = (Array.isArray(data?.files) ? data.files : []).slice(0, MAX_FILES);
  const legacy = entries.length ? [] : (Array.isArray(data?.images) ? data.images : [data?.imageBase64]).filter(Boolean).slice(0, MAX_FILES);
  if (!entries.length && !legacy.length) throw new Error('Last opp bilde av kvitteringen.');
  // Stiene sjekkes før dagsgrensen telles.
  entries.forEach((entry) => {
    ownReceiptPath(entry?.path, familyId, uid);
    if (entry?.colorPath) ownReceiptPath(entry.colorPath, familyId, uid);
  });
  await checkAndIncrementUsage(db, familyId, uid, 'receipt', AI_LIMITS.receiptsPerUserPerDay);

  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error('AI er ikke tilgjengelig akkurat nå. Fyll ut feltene selv.');

  let parts;
  const scans = [];
  if (entries.length) {
    const bucket = await mediaBucket();
    const files = [];
    for (const entry of entries) {
      const file = await filePieces(bucket, entry, { familyId, uid });
      files.push(file);
      if (file.scan) scans.push({ source: file.path, path: file.scan.path, url: file.scan.url, cropped: file.scan.cropped });
    }
    parts = assembleParts(files);
  } else {
    parts = legacy.map(inlinePart);
  }

  try {
    const { bilag, checks, verified } = await interpretReceipt({
      parts,
      context: contextText(data),
      today: new Date().toISOString().slice(0, 10),
      callModel: (prompt, userParts, models) => callGeminiJson(apiKey, prompt, userParts, {
        models,
        maxOutputTokens: 6144,
        perModelTimeoutMs: 75000,
        maxModels: 4,
      }),
    });
    if (!bilag.supplier && bilag.amount == null && !bilag.date) {
      throw new Error('Fant ikke beløp, dato eller butikk på bildet. Ta bildet rett ovenfra med hele kvitteringen synlig.');
    }
    return { bilag: { ...bilag, ocrStatus: 'done', ocrEngine: 'gemini' }, engine: 'gemini', checks, verified, scans };
  } catch (err) {
    const error = new Error(friendlyGeminiError(err));
    error.scans = scans;
    throw error;
  }
}
