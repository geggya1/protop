/** Chat med AI for ansatte i ProTop. GEMINI_API_KEY i Functions-miljøet gir fulle svar. */
import { getFirestore } from 'firebase-admin/firestore';
import { assertFamilyMember } from './security.js';
import {
  getGeminiKey,
  checkAndIncrementUsage,
  AI_LIMITS,
  GEMINI_MODEL,
  assertCompanyAiAllowed,
} from './aiShared.js';

// Et kall som henger skal ikke bruke opp hele funksjonens tidsgrense.
const GEMINI_TIMEOUT_MS = 45_000;

const SYSTEM_PARENT = `Du er ProTop-assistenten — en dyktig, saklig arbeidskollega for ansatte og ledere i norske bedrifter.

Rolle og stil:
- Skriv klart og profesjonelt på norsk (bokmål). Unngå klisjéer og «AI-snakk».
- Husk konteksten fra samtalen, still én oppfølging når det hjelper, og gi konkrete neste steg.
- Tilpass lengden: korte spørsmål gir korte svar; ber brukeren om plan, liste eller utkast, kan svaret bli lengre (opptil ca. 350 ord).
- Bruk punktlister når det gjør svaret klarere. Marker nøkkelord med **fet skrift**. Ingen # markdown-overskrifter.

Du hjelper med arbeidet i bedriften:
- Prosjekter, oppgaver, timeføring, fravær og ferie
- Tilbud, anbud, avtaler, kunder og fakturagrunnlag
- HMS, internkontroll og ISO: avvik, risikovurderinger, rutiner og sjekklister
- Møter: agenda, referat og oppfølgingspunkter
- Tekst: e-poster, meldinger, beskrivelser og oppsummeringer
- ProTop-appen: hvor ting ligger og hvordan modulene henger sammen

Sikkerhet:
- Gi aldri medisinske diagnoser, bindende juridiske råd eller farlige instruksjoner. Henvis til fagperson eller myndighet når det trengs.
- Ved alvorlige tema (vold, selvskading, overgrep, rus): vær empatisk og anbefal å snakke med fagfolk, legevakt eller 113 ved akutt fare.
- Ikke finn på fakta om bedriften, kunder, prosjekter eller personer. Si fra når du ikke vet.`;

const PARENT_MAX_MESSAGE = 2000;
const PARENT_HISTORY = 12;
const PARENT_HISTORY_CHARS = 900;
const PARENT_MAX_TOKENS = 1200;

function sanitizeHistory(raw, { limit = 6, maxChars = 400 } = {}) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-limit)
    .map((m) => ({
      role: m?.role === 'user' ? 'user' : 'assistant',
      text: String(m?.text || '').slice(0, maxChars),
    }))
    .filter((m) => m.text);
}

function parentLocalFallback(message, familyName) {
  const q = String(message || '').toLowerCase();
  const where = familyName ? ` i ${familyName}` : '';
  if (/hei|hello|hallo|god morgen|god dag/.test(q)) {
    return `Hei! Jeg kan hjelpe med prosjekter, timer, fravær, HMS, møter og tekster${where}. Hva vil du ta først?`;
  }
  return 'AI-assistenten svarer ikke fullt akkurat nå. Prøv igjen om litt, eller spør mer konkret om prosjekter, timer, fravær, HMS eller et tekstutkast.';
}

async function callGemini(apiKey, systemPrompt, message, history = [], options = {}) {
  const models = [GEMINI_MODEL, 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-flash-lite-latest'];
  const maxOut = Number(options.maxOutputTokens) || 400;
  const maxIn = Number(options.maxInputChars) || 500;
  const contents = [];
  for (const h of history) {
    contents.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.text }],
    });
  }
  contents.push({ role: 'user', parts: [{ text: String(message || '').slice(0, maxIn) }] });

  let lastErr = null;
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: maxOut, temperature: 0.75 },
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn('[aiChat] Gemini HTTP', res.status, model, errText.slice(0, 120));
        lastErr = new Error(`Gemini HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastErr = new Error('Tomt svar');
        continue;
      }
      return String(text).trim();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Gemini feilet');
}

export async function handleAiChat(data, auth) {
  if (!auth?.uid) {
    throw new Error('Du må være innlogget for å bruke AI-assistenten.');
  }

  const message = String(data?.message || '').trim();
  if (!message) throw new Error('Skriv et spørsmål først.');
  if (message.length > PARENT_MAX_MESSAGE) {
    throw new Error(`Spørsmålet er for langt (maks ${PARENT_MAX_MESSAGE} tegn).`);
  }

  const familyName = String(data?.familyName || '').trim();
  const familyId = String(data?.familyId || '').trim() || null;
  const db = getFirestore();

  if (familyId) {
    await assertFamilyMember(db, familyId, auth.uid);
    await assertCompanyAiAllowed(db, familyId);
  }

  await checkAndIncrementUsage(db, familyId, auth.uid, 'chat', AI_LIMITS.chatPerUserPerDay);

  const apiKey = getGeminiKey();
  if (apiKey) {
    try {
      const history = sanitizeHistory(data?.history, {
        limit: PARENT_HISTORY,
        maxChars: PARENT_HISTORY_CHARS,
      });
      const reply = await callGemini(apiKey, SYSTEM_PARENT, message, history, {
        maxOutputTokens: PARENT_MAX_TOKENS,
        maxInputChars: PARENT_MAX_MESSAGE,
      });
      return { reply, engine: 'gemini' };
    } catch {
      // fall through to local fallback
    }
  }

  return { reply: parentLocalFallback(message, familyName), engine: 'local' };
}
