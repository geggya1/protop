/**
 * AI-OCR av klasseliste (papir/PDF-bilde) → strukturerte kontakter.
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
import { normalizeClassListContacts } from './classListNormalize.js';

export { normalizeClassListContacts } from './classListNormalize.js';

const CLASS_LIST_PROMPT = `Du er en norsk skoleassistent som tolker klasselister fra bilde eller skannet ark (OCR).
Klasselister er ofte utlevert på papir: elevnavn, foresatte, telefon, e-post, lærere.
Returner KUN gyldig JSON:
{
  "className": "klassenavn hvis synlig, ellers tom streng",
  "schoolName": "skolenavn hvis synlig, ellers tom streng",
  "contacts": [
    {
      "kind": "student|guardian|teacher",
      "name": "fullt navn",
      "phone": "telefon eller tom streng",
      "email": "e-post eller tom streng",
      "roleTitle": "rolle for lærer (kontaktlærer, mattelærer …) eller tom streng",
      "linkedStudentName": "elevens navn når kind=guardian, ellers tom streng",
      "notes": "kort merknad eller tom streng"
    }
  ],
  "summary": "én setning om hva du fant",
  "confidence": 0.0
}
Regler:
- kind=student for elever; guardian for foresatte/mamma/pappa; teacher for lærere/kontaktlærer.
- Hvis en rad har elev + foresatt + telefon: lag student OG guardian (guardian.linkedStudentName = elev).
- Hopp over tomme rader, overskrifter, sidefot, klassekoder uten navn.
- Norske telefonnummer: behold sifre (gjerne med mellomrom).
- Maks 80 kontakter. Ikke finn opp navn.
- confidence 0–1. Ingen markdown utenfor JSON.`;

function cleanStr(v, max = 200) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function handleAiClassListOcr(data, auth) {
  const uid = auth?.uid;
  if (!uid) throw new Error('Ikke innlogget');

  const familyId = String(data?.familyId || '').trim();
  const storagePath = String(data?.storagePath || '').trim();
  const imageBase64 = String(data?.imageBase64 || '');
  const hint = cleanStr(data?.hint, 200);

  if (!familyId) throw new Error('Mangler familie.');
  if (!storagePath && imageBase64.length < 80) {
    throw new Error('Send bilde eller fil av klasselisten.');
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
    text: 'Tolker denne klasselisten til strukturerte kontakter (elever, foresatte, lærere).'
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
    throw new Error('Send bilde eller fil av klasselisten.');
  }

  try {
    const parsed = await callGeminiJson(apiKey, CLASS_LIST_PROMPT, userParts, {
      maxOutputTokens: 8192,
      perModelTimeoutMs: 50000,
    });
    const result = normalizeClassListContacts(parsed);
    if (!result.contacts.length) {
      throw new Error('AI fant ingen navn på klasselisten. Prøv et skarpere bilde.');
    }
    return {
      ...result,
      engine: 'gemini',
    };
  } catch (err) {
    throw new Error(friendlyGeminiError(err));
  }
}
