/** Optional: set GEMINI_API_KEY in Firebase Functions env for smarter parent replies. */
import { getFirestore } from 'firebase-admin/firestore';
import { assertFamilyMember } from './security.js';
import {
  getGeminiKey,
  checkAndIncrementUsage,
  AI_LIMITS,
  GEMINI_MODEL,
  childAllowsApp,
} from './aiShared.js';
import { childChatLocal } from './childChatLocal.js';

const SYSTEM_PARENT = `Du er Weekplan-assistenten — en dyktig, naturlig samtalepartner for norske foresatte.

Rolle og stil:
- Skriv klart, vennlig og voksen på norsk (bokmål). Unngå klisjéer og «AI-snakk».
- Før en god samtale: husk kontekst fra historikken, still én oppfølging når det hjelper, og gi konkrete neste steg.
- Tilpass lengde: korte spørsmål → korte svar; når brukeren ber om plan, liste eller forklaring → mer utfyllende (opptil ca. 350 ord).
- Bruk punktlister når det gjør svaret klarere. Marker nøkkelord og ukedager med **fet skrift** (f.eks. **Fredag:**). Ingen # markdown-overskrifter.

Du er spesielt god på:
- Familie-hverdag: ukeplan, kalender, morgen-/kveldsrutiner, søskendynamikk
- Mat: middag for uka, raske retter, handleliste-tips, allergi/preferanser når oppgitt
- Barn: gjøremål, belønning, lekser, motivasjon, skjermtid — praktiske tips uten moralisering
- Weekplan-appen: hvordan kalender, gjøremål, chat, notater og ukeplan-import henger sammen
- Generell produktivitet og planlegging for travle foresatte

Sikkerhet:
- Gi aldri medisinske diagnoser, juridiske råd eller farlige instruksjoner.
- Ved alvorlige tema (vold, selvskading, overgrep, rus): vær empatisk og anbefal å snakke med fagfolk / legevakt / alarm 113 ved akutte nødsituasjoner.
- Oppfinn ikke personlige fakta om familien.`;

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

function parseAge(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 4 || n > 18) return null;
  return Math.round(n);
}

async function fetchActiveTodoTitles(db, familyId, childId) {
  if (!familyId || !childId) return [];
  try {
    const snap = await db.collection('families').doc(familyId)
      .collection('children').doc(childId)
      .collection('todos')
      .where('active', '==', true)
      .limit(15)
      .get();
    return snap.docs
      .map((d) => String(d.data()?.title || '').trim())
      .filter(Boolean)
      .slice(0, 8);
  } catch {
    return [];
  }
}

function parentLocalFallback(message, familyName) {
  const q = String(message || '').toLowerCase();
  const fam = familyName ? ` for ${familyName}` : '';

  if (/middag|mat|oppskrift|kveldsmat|handleliste/.test(q)) {
    return [
      'Her er et konkret middagsopplegg for en travel uke:',
      '• **Man:** pasta med kjøttdeig og frosne grønnsaker',
      '• **Tir:** ovnsbakt fisk med poteter og erter',
      '• **Ons:** tacofredag midt i uka — tortilla, bønner, salat',
      '• **Tor:** omelett + brødmat (raskt)',
      '• **Fre:** gryterett dere kan varme på nytt i helga',
      '',
      'Si hvor mange dere er, tidsbudsjett eller allergier — så tilpasser jeg.',
    ].join('\n');
  }
  if (/gjøremål|oppgave|poeng|belønning/.test(q)) {
    return `I Weekplan legger foresatte inn gjøremål${fam}. Barn krysser av for i dag (eller tidligere dager), og dere kan attestere i ukeoversikten. Tips: start med 2–3 faste gjøremål, synlig belønning, og ros innsats mer enn perfeksjon. Vil du ha et forslag til ukerutine for en bestemt alder?`;
  }
  if (/lekse|skole|les/.test(q)) {
    return 'Lekser som fungerer i praksis: fast tid (f.eks. 16:30), 15–20 min økter, pause, og «start med det letteste». Weekplan kan ha rutine-gjøremål som «Lese 15 min». Leksehjelp-modulen hjelper steg for steg uten å gi fasit når dere skrur det av.';
  }
  if (/ukeplan|timeplan|kalender|planlegge/.test(q)) {
    return 'Kalender = hendelser, Ukeplan/Program = barnets faste timer, Gjøremål = daglige oppgaver. Et godt grepp: blokkér «familie-tid» og «leksetid» først, fyll aktiviteter etterpå, og la barna se planen. Vil du ha mal for en typisk skoleuke?';
  }
  if (/hei|hello|hallo|god morgen|god kveld/.test(q)) {
    return `Hei! Jeg kan hjelpe med ukeplan, middager, gjøremål, lekser og hverdagsplanlegging${fam}. Hva vil du ta først — mat, kalender eller barna?`;
  }
  return 'Jeg er litt begrenset uten full AI akkurat nå. Prøv å spørre mer konkret om middag, ukeplan, gjøremål, lekser eller rutiner — eller omformuler, så gjør jeg mitt beste.';
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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const context = data?.context === 'child' ? 'child' : 'parent';
  const message = String(data?.message || '').trim();
  if (!message) throw new Error('Skriv et spørsmål først.');
  const maxLen = context === 'child' ? 500 : PARENT_MAX_MESSAGE;
  if (message.length > maxLen) {
    throw new Error(`Spørsmålet er for langt (maks ${maxLen} tegn).`);
  }

  const familyName = String(data?.familyName || '').trim();
  const familyId = String(data?.familyId || '').trim() || null;
  const childId = String(data?.childId || '').trim() || null;
  const db = getFirestore();

  if (familyId) {
    await assertFamilyMember(db, familyId, auth.uid);
  }

  if (context === 'child' && familyId && childId) {
    const childSnap = await db.doc(`families/${familyId}/children/${childId}`).get();
    if (childSnap.exists && !childAllowsApp(childSnap.data() || {}, 'ai')) {
      throw new Error('AI er skrudd av for dette barnet.');
    }
  }

  const chatLimit = context === 'child'
    ? AI_LIMITS.chatPerChildPerDay
    : AI_LIMITS.chatPerUserPerDay;
  await checkAndIncrementUsage(db, familyId, auth.uid, 'chat', chatLimit);

  if (context === 'child') {
    const age = parseAge(data?.childAge);
    const history = sanitizeHistory(data?.history, { limit: 6, maxChars: 400 });
    const todos = await fetchActiveTodoTitles(db, familyId, childId);
    const reply = childChatLocal({
      message,
      childName: String(data?.childName || '').trim(),
      age,
      history,
      todos,
    });
    return { reply, engine: 'local' };
  }

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
