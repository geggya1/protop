import { getGeminiKey, GEMINI_MODEL, checkAndIncrementUsage, AI_LIMITS } from './aiShared.js';
import { getFirestore } from 'firebase-admin/firestore';

const SYSTEM_SUMMARIZE = `Du er en norsk notatassistent.
Oppgaven din: skriv om det som ble sagt til et klart, fint og naturlig notat på norsk.
Du skal GJENGI / OMSKRIVE det som ble sagt — ikke lage sammendrag med nøkkelpunkter.

Returner KUN gyldig JSON:
{
  "title": "kort beskrivende tittel, maks 60 tegn",
  "body": "hele notatet som løpende, lesbar tekst (avsnitt er OK)"
}

Regler:
- Omskriv dikteringen til god skriftlig norsk.
- Behold fakta, navn, datoer, avtaler og meningen i det som ble sagt.
- Rydd vekk fyllord, stamminger og unødige gjentakelser.
- IKKE lag «Nøkkelpunkter», punktlister, «Transkripsjon» eller meta-overskrifter.
- IKKE lim inn råtranskripsjonen under notatet.
- Ingen innledning som «Her er notatet» eller «Oppsummering:».
- body skal kunne stå alene som hele notatet.`;

const SYSTEM_ASK = `Du svarer på spørsmål om et notat basert på innholdet.
Svar kort og presist på norsk. Hvis svaret ikke finnes i notatet, si det ærlig.`;

async function callGeminiJson(apiKey, systemPrompt, userText) {
  const models = [GEMINI_MODEL, 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-flash-lite-latest'];
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userText.slice(0, 12000) }] }],
          generationConfig: { maxOutputTokens: 1600, temperature: 0.4, responseMimeType: 'application/json' },
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;
      return JSON.parse(text);
    } catch {
      // try next model
    }
  }
  throw new Error('AI-oppsummering feilet');
}

async function callGeminiText(apiKey, systemPrompt, userText) {
  const models = [GEMINI_MODEL, 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-flash-lite-latest'];
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userText.slice(0, 8000) }] }],
          generationConfig: { maxOutputTokens: 500, temperature: 0.5 },
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return String(text).trim();
    } catch {
      // try next
    }
  }
  throw new Error('AI-svar feilet');
}

/** Lokal fallback: enkel setningsrydding uten nøkkelpunkter/transkripsjon. */
function localSummarize(transcript) {
  const t = String(transcript || '').trim().replace(/\s+/g, ' ');
  const sentences = t
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const title = (sentences[0] || t).slice(0, 50) || 'Notat';
  let body = sentences.length ? sentences.join(' ') : t;
  if (body && !/[.!?]$/.test(body)) body = `${body}.`;
  return {
    title,
    summary: body.slice(0, 280),
    keyPoints: [],
    body,
    segments: [],
    engine: 'local',
  };
}

export async function handleAiVoiceNote(data, auth) {
  if (!auth?.uid) throw new Error('Du må være innlogget.');

  const action = String(data?.action || 'summarize');
  const transcript = String(data?.transcript || '').trim();
  const summary = String(data?.summary || '').trim();
  const question = String(data?.question || '').trim();
  const familyId = String(data?.familyId || '').trim() || null;

  const db = getFirestore();
  await checkAndIncrementUsage(db, familyId, auth.uid, 'chat', AI_LIMITS.chatPerUserPerDay);

  if (action === 'summarize') {
    if (!transcript) throw new Error('Ingen tekst å omskrive.');
    const apiKey = getGeminiKey();
    if (apiKey) {
      try {
        const parsed = await callGeminiJson(apiKey, SYSTEM_SUMMARIZE, transcript);
        const body = String(parsed.body || parsed.summary || '').slice(0, 8000).trim();
        return {
          title: String(parsed.title || '').slice(0, 80),
          summary: body.slice(0, 2000),
          keyPoints: [],
          body,
          segments: [],
          engine: 'gemini',
        };
      } catch {
        // fallback
      }
    }
    return localSummarize(transcript);
  }

  if (action === 'ask') {
    if (!question) throw new Error('Skriv et spørsmål.');
    const ctx = `NOTAT:\n${transcript || summary}\n\nSPØRSMÅL: ${question}`;
    const apiKey = getGeminiKey();
    if (apiKey) {
      try {
        const reply = await callGeminiText(apiKey, SYSTEM_ASK, ctx);
        return { reply, engine: 'gemini' };
      } catch {
        // fallback
      }
    }
    return {
      reply: summary
        ? `Basert på notatet: ${summary.slice(0, 400)}`
        : 'Jeg fant ikke nok innhold i notatet til å svare.',
      engine: 'local',
    };
  }

  throw new Error('Ukjent handling.');
}
