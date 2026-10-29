/**
 * AI-OCR av kvittering / faktura → strukturert regnskapsbilag.
 */
import { getFirestore } from 'firebase-admin/firestore';
import {
  AI_LIMITS,
  getGeminiKey,
  assertCompanyAiAllowed,
  assertFamilyAdult,
  checkAndIncrementUsage,
  callGeminiJson,
  downloadImageBase64,
  friendlyGeminiError,
} from './aiShared.js';
import { normalizeReceiptBilag } from './receiptNormalize.js';
import { assertCompanyMember } from './companyMember.js';

const RECEIPT_PROMPT = `Du er en norsk regnskapsassistent som tolker kvitteringer, fakturaer og bilag (OCR).
Returner KUN gyldig JSON:
{
  "supplier": "leverandør / butikknavn",
  "orgNr": "9-sifret organisasjonsnummer uten mellomrom, eller tom streng",
  "date": "YYYY-MM-DD eller tom streng",
  "amount": 123.45,
  "currency": "NOK",
  "vatAmount": 24.69,
  "vatPercent": 25,
  "paymentMethod": "kort|kontant|vipps|faktura|annet|tom streng",
  "invoiceNumber": "kvitterings-/fakturanummer eller tom streng",
  "category": "kort kategori på norsk (mat, drivstoff, kontor, helse, reise, bygg, osv.)",
  "lineItems": [{ "description": "varetekst", "quantity": 1, "amount": 12.5 }],
  "notes": "eventuelle fotnoter / kort oppsummering av hva bilaget gjelder",
  "suggestedTitle": "kort tittel på norsk (f.eks. «Kvittering bad – Byggmakker»)",
  "warrantyMonths": null,
  "warrantyUntil": "YYYY-MM-DD eller tom streng",
  "warrantyText": "kort garantiinfo hvis synlig, ellers tom streng",
  "confidence": 0.0
}
Regler:
- Beløp som tall (punktum som desimal), ikke strenger med "kr".
- amount er totalsum inkl. mva når synlig; vatAmount er mva-beløp.
- Les norsk kvitteringslayout (REMA, Kiwi, Coop, Vinmonopolet, bensinstasjoner, bygg/håndverker, osv.).
- lineItems: maks 40 linjer; hopp over tomme/sum-linjer; behold viktige varer.
- suggestedTitle: maks ~60 tegn, beskriv hva bilaget omhandler.
- Garanti: hvis dokumentet nevner garanti (måneder/år eller sluttdato), fyll warrantyMonths og/eller warrantyUntil og warrantyText. Ellers null/tom streng — ikke gjett.
- confidence 0–1 for hvor sikker du er på total/leverandør/dato.
- Hvis noe mangler: bruk tom streng / null — ikke finn opp beløp eller garanti.
- Ikke inkluder markdown eller forklaringer utenfor JSON.`;

// Utlegg: den ansatte tar bilde av kvitteringen, og alle felt skal fylles. Strengere om totalen,
// datoen, mva og valuta enn bilagsmappen, og typen velges fra bedriftens utgiftstyper.
const EXPENSE_PROMPT = `Du er en nøyaktig norsk regnskapsassistent. En ansatt har tatt bilde av en kvittering
for et utlegg. Les kvitteringen og returner KUN gyldig JSON:
{
  "supplier": "butikk/leverandør slik den står øverst, uten adresse",
  "orgNr": "9 sifre uten mellomrom (Org.nr / Foretaksregisteret), eller tom streng",
  "date": "YYYY-MM-DD, kjøpsdatoen",
  "amount": 69.00,
  "currency": "ISO 4217-kode, f.eks. NOK",
  "vatAmount": 13.80,
  "vatPercent": 25,
  "vatLines": [{ "percent": 25, "base": 55.20, "vat": 13.80 }],
  "paymentMethod": "kort|kontant|vipps|faktura|annet|tom streng",
  "cardLast4": "fire siste sifre på kortet, eller tom streng",
  "invoiceNumber": "kvitterings-/bong-/fakturanummer, eller tom streng",
  "documentType": "receipt|invoice|card_slip|other",
  "expenseType": "id fra listen over utgiftstyper",
  "category": "kort kategori på norsk",
  "lineItems": [{ "description": "varetekst", "quantity": 1, "amount": 69.00 }],
  "suggestedTitle": "kort beskrivelse på norsk, f.eks. «Parkering Aker brygge» eller «Lunsj med kunde – Egon»",
  "notes": "",
  "duplicatePages": false,
  "confidence": 0.0
}
Regler:
- amount er beløpet som faktisk ble betalt, inkl. mva og eventuell tips: TOTAL, SUM, Å BETALE, BETALT
  eller beløpet på kortlinjen/terminalutskriften. Ikke del- eller mellomsummer, ikke «Eks mva»-kolonnen.
- Flere bilder kan være deler av samme lange kvittering, eller samme kvittering tatt flere ganger.
  Tell hvert kjøp bare én gang. Er det samme kvittering to ganger, sett duplicatePages true.
  Er det kortterminalens kvittering og butikkens kvittering for samme kjøp, er det ett kjøp.
- date: kjøpsdatoen, ikke utskriftsdato eller «bytte innen». Les norske formater: 07.10.20, 07/10/2020,
  «onsdag 7. oktober 2020». Tosifret år er 20xx.
- Beløp er tall med punktum som desimaltegn. «1.234,50» er 1234.50. Ikke ta med «kr».
- vatLines: én rad per mva-sats fra mva-spesifikasjonen (Mva % / Grunnlag / Mva). Tom liste hvis den mangler.
  vatPercent er satsen når det bare er én. Norske satser er 25, 15, 12 og 0.
- currency: kr eller NOK i Norge er NOK. Bruk land, adresse og symbol (€, SEK, DKK, $, £) for andre valutaer.
- expenseType: velg den id-en i listen som passer best ut fra butikk og varer. Bruk «other» bare når ingen passer.
- Hvis noe ikke står på kvitteringen: tom streng eller null. Ikke gjett beløp eller dato.
- confidence 0–1: hvor sikker du er på beløp, dato og leverandør samlet.
- Ingen markdown eller tekst utenfor JSON.`;

const MAX_EXPENSE_IMAGES = 4;
// Base64 for omtrent 4 MB per fil. Klienten skalerer bilder ned til godt under dette.
const MAX_BASE64_CHARS = 5_600_000;

function inlinePart(dataUrl) {
  const raw = String(dataUrl || '');
  const mimeMatch = raw.match(/^data:([^;]+);base64,/i);
  const mime = (mimeMatch?.[1] || 'image/jpeg').toLowerCase();
  if (!/^image\/(jpeg|png|webp|heic|heif)$|^application\/pdf$/.test(mime)) {
    throw new Error('Kvitteringen må være et bilde eller en PDF.');
  }
  const data = raw.replace(/^data:[^;]+;base64,/, '');
  if (data.length < 80) throw new Error('Send bilde av kvitteringen.');
  if (data.length > MAX_BASE64_CHARS) throw new Error('Filen er for stor. Ta et nytt bilde eller velg en mindre fil.');
  return { inline_data: { mime_type: mime, data } };
}

/** Typene appen tilbyr, «id: navn; …». Bare bokstaver i id-en, og kort. */
function cleanTypeList(value) {
  return String(value || '')
    .split(';')
    .map((item) => item.trim())
    .filter((item) => /^[a-z]{2,24}: .{1,60}$/.test(item))
    .slice(0, 60)
    .join('; ');
}

/**
 * Utlegg: kvitteringsbilder (1–4) for en ansatt i bedriften.
 * Bare bilder sendt med kallet (ikke stier i Storage), så ingen kan tolke andres filer.
 */
async function handleExpenseReceipt(data, uid) {
  const db = getFirestore();
  const familyId = String(data?.familyId || '').trim();
  await assertCompanyMember(db, familyId, uid);
  await assertCompanyAiAllowed(db, familyId);
  const images = (Array.isArray(data?.images) ? data.images : [data?.imageBase64])
    .filter(Boolean)
    .slice(0, MAX_EXPENSE_IMAGES);
  if (!images.length) throw new Error('Send bilde av kvitteringen.');
  const parts = images.map(inlinePart);
  await checkAndIncrementUsage(db, familyId, uid, 'receipt', AI_LIMITS.receiptsPerUserPerDay);

  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error('AI er ikke tilgjengelig akkurat nå. Fyll ut feltene selv.');
  const types = cleanTypeList(data?.expenseTypes);
  const hint = cleanStr(data?.hint, 200);
  const userParts = [{
    text: [
      `Tolk kvitteringen${parts.length > 1 ? ` (${parts.length} bilder)` : ''} til et utlegg.`,
      types ? `Utgiftstyper (id: navn): ${types}.` : '',
      hint ? `Kontekst: ${hint}` : '',
    ].filter(Boolean).join('\n'),
  }, ...parts];

  try {
    const parsed = await callGeminiJson(apiKey, EXPENSE_PROMPT, userParts, {
      maxOutputTokens: 4096,
      perModelTimeoutMs: 45000,
    });
    const bilag = normalizeReceiptBilag(parsed);
    if (!bilag.supplier && bilag.amount == null && !bilag.date) {
      throw new Error('Fant ikke beløp, dato eller butikk på bildet. Ta bildet rett ovenfra med hele kvitteringen synlig.');
    }
    return { bilag: { ...bilag, ocrStatus: 'done', ocrEngine: 'gemini' }, engine: 'gemini' };
  } catch (err) {
    throw new Error(friendlyGeminiError(err));
  }
}

function cleanStr(v, max = 200) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function handleAiReceiptOcr(data, auth) {
  const uid = auth?.uid;
  if (!uid) throw new Error('Ikke innlogget');
  if (data?.purpose === 'expense') return handleExpenseReceipt(data, uid);

  const familyId = String(data?.familyId || '').trim();
  const storagePath = String(data?.storagePath || '').trim();
  const imageBase64 = String(data?.imageBase64 || '');
  const hint = cleanStr(data?.hint, 200);

  if (!familyId) throw new Error('Mangler familie.');
  if (!storagePath && imageBase64.length < 80) {
    throw new Error('Send bilde av kvitteringen.');
  }

  await assertFamilyAdult(getFirestore(), uid, familyId);
  await assertCompanyAiAllowed(getFirestore(), familyId);
  await checkAndIncrementUsage(
    getFirestore(),
    familyId,
    uid,
    'import',
    AI_LIMITS.importsPerFamilyPerDay,
  );

  const apiKey = getGeminiKey();
  if (!apiKey) {
    throw new Error('AI er ikke tilgjengelig akkurat nå. Prøv igjen senere.');
  }

  const userParts = [{
    text: 'Tolker denne kvitteringen/fakturaen til et regnskapsbilag.'
      + (hint ? ` Kontekst: ${hint}` : ''),
  }];

  if (imageBase64 && imageBase64.length >= 80) {
    const cleaned = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/i);
    userParts.push({
      inline_data: {
        mime_type: mimeMatch?.[1] || 'image/jpeg',
        data: cleaned,
      },
    });
  } else if (storagePath) {
    const img = await downloadImageBase64(storagePath);
    userParts.push({
      inline_data: { mime_type: img.mime || 'image/jpeg', data: img.base64 },
    });
  } else {
    throw new Error('Send bilde av kvitteringen.');
  }

  try {
    const parsed = await callGeminiJson(apiKey, RECEIPT_PROMPT, userParts, {
      maxOutputTokens: 4096,
      perModelTimeoutMs: 45000,
    });
    const bilag = normalizeReceiptBilag(parsed);
    if (!bilag.supplier && bilag.amount == null && !bilag.date && !bilag.lineItems.length) {
      throw new Error('AI fant for lite informasjon på kvitteringen.');
    }
    return {
      bilag: {
        ...bilag,
        ocrStatus: 'done',
        ocrEngine: 'gemini',
      },
      engine: 'gemini',
    };
  } catch (err) {
    throw new Error(friendlyGeminiError(err));
  }
}

export { normalizeReceiptBilag } from './receiptNormalize.js';

export const __expenseTest = { inlinePart, cleanTypeList, EXPENSE_PROMPT };
