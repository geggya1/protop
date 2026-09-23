/**
 * Leksehjelpen — sokratisk AI-veileder for barn.
 * Guidar steg for steg; gir ikke fasit før eleven har prøvd / bedt om det.
 *
 * Gemini: lite-modeller + parallell race (parallel:2) med kort per-modell-timeout
 * så barn får svar raskt selv ved 429 på tung flash. CF har 120s / 1GiB slakk.
 */
import { getFirestore } from 'firebase-admin/firestore';
import {
  AI_LIMITS,
  assertFamilyAdult,
  callGeminiJson,
  checkAndIncrementUsage,
  downloadImageBase64,
  getGeminiKey,
  childAllowsApp,
  TUTOR_GEMINI_MODELS,
} from './aiShared.js';

import {
  parseAge,
  ageFromBirthday,
  detectArithmeticProblem,
  buildMathCoachResponse,
  serverCanReveal,
} from './tutorMath.js';
import { localTutorFallback } from './tutorLocal.js';

const TUTOR_LIMIT = AI_LIMITS.tutorPerUserPerDay || 50;

/**
 * Barn-først: lite-modeller + parallell race, kort timeout per modell.
 * Worst case ~2×10s batches under CF-timeout; typisk vinner lite på 2–5s.
 */
const TUTOR_GEMINI_OPTS = {
  models: TUTOR_GEMINI_MODELS,
  maxModels: 5,
  parallel: 2,
  perModelTimeoutMs: 10000,
  maxOutputTokens: 2048,
};

const SYSTEM_TUTOR = `Du er Leksehjelpen i Weekplan — en varm, tålmodig norsk lærerveileder for barn.

MÅL: Eleven skal FORSTÅ og løse selv. Du er IKKE en fasit-maskin (ikke Photomath/Gauth-stil).
Du er en «los» (som Lekselos): fører trygt i havn uten å overta roret.
Pedagogikk: scaffolding (diagnose → støtte → fading), sokratiske spørsmål, LK20-dybdelæring,
growth mindset (ros innsats/metode), og «blyanttavle» inspirert av tenkende klasserom.

STRENGE REGLER:
1) Gi ALDRI det endelige svaret/fasiten med mindre allowFasit=true OG revealRequested=true OG (hintLevel>=2 ELLER attemptCount>=2).
2) Still maks ÉTT kort spørsmål per svar — helst inne i "message", la "questionToStudent" stå tom hvis spørsmålet allerede er i message.
3) Ikke list flere spørsmål eller valgalternativer i samme svar. Maks 2 quickReplies, korte og tydelige.
4) Bruk sokratisk metode: hint og små steg — ikke dump hele løsningen.
5) Hint skal være progressive (hintLevel 1 = peke-retning, 2 = metode, 3 = nesten-steg uten tall/svar).
6) Hvis eleven har rett resonnering: ros METODE/innsats og gå videre. Hvis feil: forklar HVORFOR uten å gi fasit, og sett studentLooksCorrect=false.
7) Skriv enkelt norsk, tilpasset alder. Kort og vennlig. Ingen emoji-spam (maks 1).
8) Ved alvorlige/voksne tema (selvskading, vold, sex): sett safetyRedirect=true og be eleven snakke med en voksen. Ikke veiled videre.
9) Hvis bildet er uleselig: be om nytt bilde eller at eleven skriver oppgaven — ikke gjett.
10) Returner KUN gyldig JSON etter schema. Ingen markdown utenfor JSON.
11) Fyll ALLTID boardSteps for matte (og gjerne andre fag med synlige steg): linjer eleven «skriver med blyant».
    Bruk ^ for potens (f.eks. 5^2). kind="ask" på linjen eleven skal fylle ut. Ikke avslør fasit i boardSteps før reveal.
12) Alle fag (matte, norsk, engelsk, naturfag, samfunn, KRLE, …): samme pedagogikk — hint først, prøv selv, ros.
13) Unngå meta-spørsmål som «hva tror du oppgaven spør om?» / «fortell meg med egne ord hva den spør om».
    På nettbrett er det tungvint og lite hjelpsomt. Gi heller et KONKRET neste steg
    (f.eks. «skriv to søkeord», «finn årstallet», «skriv første setning i svaret»).
14) Ikke bagatelliser med «Ingen fare», «la oss forenkle» eller «bare én setning» når eleven står fast —
    gi konkret mikro-hjelp på innholdet.
15) Oppgaver om å finne fakta på internett/nettet: veiled SØKEORD → NOTER FAKTA → KILDE → SVAR MED EGNE ORD.
    Ikke spør hva oppgaven «egentlig betyr». Oppdater boardSteps synlig for hvert av disse stegene.
16) Tekstsvar (norsk, samfunn, naturfag, …): når eleven skriver noe, ØK boardVisible og tegn neste steg.
    Ikke bli stående på samme «forstå oppgaven»-linje. boardSteps skal vise fremgang.

ALDER OG PEDAGOGIKK (svært viktig):
- Tilpass metode til elevens alder (norsk skole / LK20).
- Barneskole matematikk (ca. 6–12 år), multiplikasjon flersifret × ett siffer
  (f.eks. 324 × 9): FØRST forklar at vi ganger hele tallet. DERETTER del tallet i
  hundre / tiere / enere (324 = 300 + 20 + 4). Så ta ÉN del om gangen
  (start med hundre: «Hva er 300 × 9?»). IKKE gi del-svar eller totalsvar før reveal.
  Si tydelig: «Først …, så …, deretter …». Vis det på boardSteps.
- Potens (f.eks. 5^2): forklar som gjentatt multiplikasjon på tavlen (5 × 5).
- Under ca. 10 år: korte setninger, konkrete tallord, ett spørsmål. 10–12 år: kan bruke
  mer formell oppstilling, fortsatt ett steg om gangen.
- Første svar på ny oppgave skal KUN starte steg 1 — aldri hele løsningen.
- Ikke snakk ned til eleven. Vær vennlig og tydelig, men ikke «baby-språk».

JSON-schema:
{
  "subject": "matematikk|norsk|engelsk|naturfag|samfunnsfag|rle|annet",
  "problemSummary": "kort hva oppgaven handler om (uten fasit)",
  "difficulty": "lett|middels|vanskelig",
  "message": "det du sier til eleven nå",
  "questionToStudent": "ett spørsmål eleven skal svare på, eller tom streng",
  "hintLevel": 0-3,
  "steps": [
    { "id": "s1", "title": "kort stegtittel", "status": "done|current|locked", "coachNote": "kort veiledning uten fasit" }
  ],
  "currentStepIndex": 0,
  "boardSteps": [
    { "id": "b1", "expression": "324 × 9", "note": "kort note", "kind": "write|ask" }
  ],
  "boardVisible": 2,
  "encouragement": "kort oppmuntring (ros innsats/metode)",
  "conceptTip": "valgfri mini-teori uten fasit",
  "studentLooksCorrect": false,
  "missionAccomplished": false,
  "canRevealAnswer": false,
  "finalAnswer": null,
  "quickReplies": ["kort forslag 1", "kort forslag 2"],
  "safetyRedirect": false
}

Når missionAccomplished=true: feire forståelsen, oppsummer METODEN (ikke bare svaret), fyll boardSteps med hele utregningen.
Når allowFasit=true og revealRequested=true og det er OK: sett finalAnswer til eksakt svar med utregning eller vist løsning steg for steg, canRevealAnswer=true, og tegn hele boardSteps.
Når allowFasit=false: finalAnswer må alltid være null, selv ved reveal — gi i stedet et nytt hint.
Ellers: finalAnswer må være null.`

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-10)
    .map((m) => ({
      role: m?.role === 'assistant' ? 'assistant' : 'user',
      text: String(m?.text || '').slice(0, 600),
    }))
    .filter((m) => m.text);
}

async function assertTutorAccess(db, uid, familyId, childId) {
  if (!uid || !familyId) throw new Error('Mangler tilgang.');
  try {
    const adult = await assertFamilyAdult(db, uid, familyId);
    return { ...adult, asAdult: true };
  } catch {
    // Barn: egen profil
  }
  if (!childId) throw new Error('Mangler barn.');
  const childSnap = await db.doc(`families/${familyId}/children/${childId}`).get();
  if (!childSnap.exists) throw new Error('Fant ikke barnet.');
  const cd = childSnap.data() || {};
  if (!childAllowsApp(cd, 'leksehjelp') && !childAllowsApp(cd, 'mattehjelp')) {
    throw new Error('Lær skole / Leksehjelp er skrudd av for dette barnet.');
  }
  // ... keep reading for second message
  if (cd.uid === uid || cd.authUid === uid || cd.userId === uid || childId === uid) {
    return { role: 'child', asAdult: false };
  }
  throw new Error('Mangler tilgang til Lær skole.');
}


function normalizeTutorResult(raw, engine, { allowFasit = true, attemptCount = 0 } = {}) {
  const steps = Array.isArray(raw?.steps)
    ? raw.steps.slice(0, 8).map((s, i) => ({
      id: String(s?.id || `s${i + 1}`).slice(0, 20),
      title: String(s?.title || `Steg ${i + 1}`).slice(0, 60),
      status: ['done', 'current', 'locked'].includes(s?.status) ? s.status : (i === 0 ? 'current' : 'locked'),
      coachNote: String(s?.coachNote || '').slice(0, 220),
    }))
    : [];

  const hintLevel = Math.min(3, Math.max(0, Number(raw?.hintLevel) || 0));
  const canReveal = allowFasit
    && raw?.canRevealAnswer === true
    && serverCanReveal({ allowFasit, hintLevel, attemptCount });
  let finalAnswer = raw?.finalAnswer != null ? String(raw.finalAnswer).slice(0, 500) : null;
  if (!canReveal) finalAnswer = null;

  const quick = Array.isArray(raw?.quickReplies)
    ? raw.quickReplies.map((q) => String(q).slice(0, 50)).filter(Boolean).slice(0, 2)
    : [];

  const boardSteps = Array.isArray(raw?.boardSteps)
    ? raw.boardSteps.slice(0, 8).map((b, i) => ({
      id: String(b?.id || `b${i + 1}`).slice(0, 20),
      expression: String(b?.expression || '').slice(0, 80),
      note: String(b?.note || '').slice(0, 120),
      kind: b?.kind === 'ask' ? 'ask' : 'write',
      hiddenAnswer: b?.kind === 'ask',
    })).filter((b) => b.expression || b.note)
    : [];

  const boardVisible = Number.isFinite(Number(raw?.boardVisible))
    ? Math.min(boardSteps.length, Math.max(0, Number(raw.boardVisible)))
    : boardSteps.length;

  return {
    subject: String(raw?.subject || 'annet').slice(0, 40),
    problemSummary: String(raw?.problemSummary || '').slice(0, 200),
    difficulty: ['lett', 'middels', 'vanskelig'].includes(raw?.difficulty) ? raw.difficulty : 'middels',
    message: String(raw?.message || 'La oss ta det steg for steg.').slice(0, 800),
    questionToStudent: String(raw?.questionToStudent || '').slice(0, 240),
    hintLevel,
    steps,
    currentStepIndex: Math.min(Math.max(0, Number(raw?.currentStepIndex) || 0), Math.max(0, steps.length - 1)),
    boardSteps,
    boardVisible,
    encouragement: String(raw?.encouragement || '').slice(0, 160),
    conceptTip: raw?.conceptTip ? String(raw.conceptTip).slice(0, 280) : null,
    studentLooksCorrect: raw?.studentLooksCorrect === true,
    missionAccomplished: raw?.missionAccomplished === true,
    canRevealAnswer: canReveal,
    finalAnswer,
    quickReplies: quick,
    safetyRedirect: raw?.safetyRedirect === true,
    engine: engine || raw?.engine || 'local',
  };
}

export async function handleAiTutor(data, auth) {
  const uid = auth?.uid;
  if (!uid) throw new Error('Du må være innlogget for å bruke Leksehjelpen.');

  const familyId = String(data?.familyId || '').trim();
  const childId = String(data?.childId || '').trim();
  const message = String(data?.message || '').trim().slice(0, 800);
  const subject = data?.subject ? String(data.subject).slice(0, 40) : null;
  const action = ['start', 'reply', 'hint', 'stuck', 'check', 'reveal'].includes(data?.action)
    ? data.action
    : (message ? 'reply' : 'start');
  const hintLevel = Number(data?.hintLevel) || 0;
  let age = parseAge(data?.childAge);
  const childName = String(data?.childName || 'elev').slice(0, 40);
  const history = sanitizeHistory(data?.history);
  const revealRequested = action === 'reveal' || data?.revealRequested === true;
  const storagePath = data?.storagePath ? String(data.storagePath).slice(0, 400) : null;
  const imageBase64 = data?.imageBase64 ? String(data.imageBase64) : null;
  const allowFasitFromClient = data?.allowFasit !== false;
  const attemptCount = Math.min(20, Math.max(0, Number(data?.attemptCount) || 0));

  if (!familyId || !childId) throw new Error('Mangler familie eller barn.');
  if (!message && !storagePath && !imageBase64 && action === 'start') {
    // start uten innhold er OK — AI spør hva de trenger hjelp til
  } else if (!message && !storagePath && !imageBase64 && action !== 'hint' && action !== 'stuck' && action !== 'reveal') {
    throw new Error('Skriv oppgaven, ta bilde, eller be om hint.');
  }

  const db = getFirestore();
  await assertTutorAccess(db, uid, familyId, childId);
  const childSnap = await db.doc(`families/${familyId}/children/${childId}`).get();
  const cd = childSnap.exists ? (childSnap.data() || {}) : {};
  if (age == null) {
    age = ageFromBirthday(cd.birthday || cd.birthdate) || parseAge(cd.age);
  }
  const allowFasit = allowFasitFromClient && cd.leksehjelpAllowFasit !== false;
  await checkAndIncrementUsage(db, familyId, uid, 'tutor', TUTOR_LIMIT);

  // Enkle tekst-regnestykker: lokal pedagogisk veileder først (unngår timeout).
  const simpleMath = detectArithmeticProblem(message);
  const textOnly = !storagePath && !imageBase64;
  if (simpleMath && textOnly && (action === 'start' || action === 'hint' || action === 'stuck' || action === 'reply' || action === 'reveal')) {
    return normalizeTutorResult(
      buildMathCoachResponse({
        problem: simpleMath, action, hintLevel, age, allowFasit, attemptCount,
      }),
      'local-math',
      { allowFasit, attemptCount },
    );
  }

  const apiKey = getGeminiKey();
  if (!apiKey) {
    return normalizeTutorResult(
      localTutorFallback({ message, subject, action, hintLevel, age, allowFasit, attemptCount, history }),
      'local',
      { allowFasit, attemptCount },
    );
  }

  try {
    const userParts = [];
    if (storagePath) {
      const img = await downloadImageBase64(storagePath);
      userParts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
    } else if (imageBase64 && imageBase64.length > 80) {
      const cleaned = imageBase64.replace(/^data:[^;]+;base64,/, '');
      if (cleaned.length * 0.75 > AI_LIMITS.maxImageBytes) {
        throw new Error('Bildet er for stort. Ta et nærmere foto.');
      }
      userParts.push({ inline_data: { mime_type: 'image/jpeg', data: cleaned } });
    }

    const histText = history.length
      ? history.map((h) => `${h.role === 'assistant' ? 'Veileder' : 'Elev'}: ${h.text}`).join('\n')
      : '(ingen tidligere dialog)';

    const ageBand = age == null
      ? 'ukjent alder'
      : age < 10
        ? 'barneskole (yngre) — korte setninger, posisjonssystem med hundre/tiere/enere, potens som gjentatt multiplikasjon'
        : age < 13
          ? 'barneskole (eldre) — tydelige steg, posisjonssystem / oppstilling, ^ for potens på boardSteps'
          : 'ungdomsskole — mer formell metode, fortsatt ett steg om gangen, fyll boardSteps';

    const brief = [
      `Elev: ${childName}${age != null ? `, ca. ${age} år` : ''}`,
      `Pedagogikk-bånd: ${ageBand}`,
      `Fag (hint fra app): ${subject || 'ukjent'}`,
      `Handling: ${action}`,
      `Nåværende hintLevel fra app: ${hintLevel}`,
      `attemptCount (elevsvar denne økten): ${attemptCount}`,
      `revealRequested: ${revealRequested}`,
      `allowFasit: ${allowFasit}`,
      '',
      'Tidligere dialog:',
      histText,
      '',
      `Ny melding fra elev: ${message || '(bilde / be om hint)'}`,
      '',
      'Svar med JSON-schema. Husk: ingen fasit med mindre revealRequested=true og attemptCount/hintLevel er nok.',
      'Start ALLTID med hva eleven skal gjøre FØRST. Ett steg. Ett konkret spørsmål (ikke meta som «hva spør oppgaven om»). Fyll boardSteps og øk boardVisible når eleven svarer.',
    ].join('\n');

    userParts.push({ text: brief });

    const raw = await callGeminiJson(apiKey, SYSTEM_TUTOR, userParts, TUTOR_GEMINI_OPTS);
    return normalizeTutorResult(raw, 'gemini', { allowFasit, attemptCount });
  } catch (err) {
    // Gemini-feil skal ikke skremme barn med «AI-tjenesten er utilgjengelig»
    // når lokal veileder fortsatt kan hjelpe.
    console.warn('[aiTutor]', err?.message);
    const fb = localTutorFallback({ message, subject, action, hintLevel, age, allowFasit, attemptCount, history });
    if (/tid|timeout|abort/i.test(String(err?.message || ''))) {
      fb.message = `Det tok litt lang tid, så jeg hjelper deg videre herfra. ${fb.message}`;
    }
    return normalizeTutorResult(fb, 'local', { allowFasit, attemptCount });
  }
}
