/**
 * AI-OCR av kvittering / faktura → strukturert regnskapsbilag.
 */
import { getFirestore } from 'firebase-admin/firestore';
import {
  AI_LIMITS,
  getGeminiKey,
  assertFamilyAdult,
  checkAndIncrementUsage,
  callGeminiJson,
  downloadImageBase64,
  friendlyGeminiError,
} from './aiShared.js';
import { normalizeReceiptBilag } from './receiptNormalize.js';

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

function cleanStr(v, max = 200) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function handleAiReceiptOcr(data, auth) {
  const uid = auth?.uid;
  if (!uid) throw new Error('Ikke innlogget');

  const familyId = String(data?.familyId || '').trim();
  const storagePath = String(data?.storagePath || '').trim();
  const imageBase64 = String(data?.imageBase64 || '');
  const hint = cleanStr(data?.hint, 200);

  if (!familyId) throw new Error('Mangler familie.');
  if (!storagePath && imageBase64.length < 80) {
    throw new Error('Send bilde av kvitteringen.');
  }

  await assertFamilyAdult(getFirestore(), uid, familyId);
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
