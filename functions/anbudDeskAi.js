/** Sammendrag, go/no-go, spørsmål, utkast og oppgaver. Regler først, Gemini når nøkkelen finnes. */
import { touchGeminiEnv } from './geminiEnv.js';
import { callGeminiJson, getGeminiKey } from './aiShared.js';
import {
  askNotice,
  buildBrief,
  draftFromLibrary,
  qualifyNotice,
  tasksFromNotice,
} from '../src/anbud/desk.js';

touchGeminiEnv();

const SUMMARY_PROMPT = `Du lager et kort sammendrag av en offentlig anskaffelse for en norsk leverandør.
Returner KUN gyldig JSON: { "summary": "maks 8 setninger", "relevance": "én setning om hvorfor dette kan være aktuelt" }
Bruk bare opplysninger som står i teksten. Ikke finn opp krav, frister eller verdier.`;

function noticeFrom(body) {
  return {
    ...(body?.notice || {}),
    excerpts: body?.excerpts || body?.notice?.excerpts || [],
  };
}

export async function summarizeNotice(body) {
  const excerpts = Array.isArray(body?.excerpts) ? body.excerpts : [];
  const gated = Array.isArray(body?.gated) ? body.gated : [];
  const brief = buildBrief({ notice: body?.notice, excerpts, gated });
  const key = getGeminiKey();
  if (!key) return { ok: true, engine: 'rules', brief };
  try {
    const parsed = await callGeminiJson(key, SUMMARY_PROMPT, [{
      text: `${brief.summary}\n\n${excerpts.map((row) => row.text).join('\n')}`.slice(0, 8000),
    }], { maxOutputTokens: 500 });
    return {
      ok: true,
      engine: 'gemini',
      brief: {
        ...brief,
        summary: String(parsed?.summary || brief.summary).slice(0, 900),
        relevance: String(parsed?.relevance || '').slice(0, 240),
      },
    };
  } catch {
    return { ok: true, engine: 'rules', brief };
  }
}

export function qualifyOpenNotice(body) {
  return { ok: true, engine: 'rules', answers: qualifyNotice(noticeFrom(body), body?.questions) };
}

export function askOpenNotice(body) {
  const result = askNotice(noticeFrom(body), body?.question);
  if (!result.ok) return result;
  return { ...result, engine: 'rules' };
}

export function draftOpenAnswer(body) {
  const result = draftFromLibrary({ library: body?.library }, body?.prompt);
  return { ...result, engine: 'rules' };
}

export function planOpenTasks(body) {
  return { ok: true, engine: 'rules', tasks: tasksFromNotice(noticeFrom(body)) };
}
