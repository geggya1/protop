/** Gemini-tolkning av bedrift og rangering av anbudstreff. */
import { touchGeminiEnv } from './geminiEnv.js';
import { callGeminiJson, friendlyGeminiError, getGeminiKey } from './aiShared.js';

const PROFILE_PROMPT = `Du hjelper en norsk bedrift med anbudsvarsling på Doffin og TED.
Gitt navn, beskrivelse og ev. tekst fra hjemmesiden, returner KUN gyldig JSON:
{
  "summary": "2-4 setninger om hva bedriften faktisk leverer",
  "keywords": ["norske fagord som treffer i kunngjøringstitler"],
  "cpvHints": ["åttesifret CPV som passer, eller tom liste"]
}
keywords: 8-16 konkrete fagord, ikke generelle ord som bedrift, tjeneste, kvalitet.
Ikke finn opp CPV. Tom liste om du er usikker.`;

const RANK_PROMPT = `Du rangerer offentlige anbudstreff mot en leverandør.
Returner KUN gyldig JSON:
{ "hits": [{ "id": "samme id som i listen", "score": 8, "reason": "én kort setning" }] }
score 8-10 = må ses nå, 5-7 = relevant, 1-4 = svakt treff.
Begrunn kort på norsk. Ta bare med treff med score 5 eller høyere, maks 12.`;

function text(value) {
  return String(value || '').trim();
}

async function siteText(url) {
  try {
    const href = new URL(String(url || ''));
    if (!/^https?:$/.test(href.protocol)) return '';
    const res = await fetch(href.href, {
      redirect: 'follow',
      headers: { Accept: 'text/html', 'User-Agent': 'ProTop' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);
  } catch {
    return '';
  }
}

function requireKey() {
  touchGeminiEnv();
  const key = getGeminiKey();
  if (!key) {
    const err = new Error('AI er ikke tilgjengelig akkurat nå.');
    err.status = 503;
    throw err;
  }
  return key;
}

export async function interpretProfile(input = {}) {
  const key = requireKey();
  const page = input.website ? await siteText(input.website) : '';
  const parsed = await callGeminiJson(key, PROFILE_PROMPT, [{
    text: [
      `Bedrift: ${text(input.companyName) || 'Ukjent'}`,
      input.orgnr ? `Orgnr: ${text(input.orgnr)}` : '',
      `Beskrivelse: ${text(input.description) || 'Ikke oppgitt'}`,
      input.website ? `Hjemmeside: ${text(input.website)}` : '',
      page ? `Tekst fra nettsiden: ${page}` : '',
    ].filter(Boolean).join('\n'),
  }], { maxOutputTokens: 1024, perModelTimeoutMs: 25000 });
  const keywords = (Array.isArray(parsed?.keywords) ? parsed.keywords : [])
    .map((row) => text(row))
    .filter((row) => row.length >= 2 && row.length <= 40)
    .slice(0, 20);
  return {
    ok: true,
    summary: text(parsed?.summary).slice(0, 800),
    keywords,
    cpvHints: (Array.isArray(parsed?.cpvHints) ? parsed.cpvHints : []).map((row) => text(row)).filter(Boolean).slice(0, 8),
    engine: 'gemini',
  };
}

export async function rankHits(input = {}) {
  const key = requireKey();
  const notices = (Array.isArray(input.notices) ? input.notices : []).slice(0, 20);
  if (!notices.length) return { ok: true, hits: [] };
  const parsed = await callGeminiJson(key, RANK_PROMPT, [{
    text: [
      `Leverandør: ${text(input.companyName) || 'Ukjent'}`,
      `Profil: ${text(input.summary) || text(input.description) || 'Ikke oppgitt'}`,
      `Søkeord: ${(Array.isArray(input.keywords) ? input.keywords : []).join(', ')}`,
      'Treff:',
      ...notices.map((row) => `- ${row.id}: ${text(row.title)} | ${text(row.buyer)} | CPV ${(row.cpvCodes || []).slice(0, 3).join(', ')} | ${text(row.description).slice(0, 220)}`),
    ].join('\n'),
  }], { maxOutputTokens: 1200, perModelTimeoutMs: 30000 });
  const hits = (Array.isArray(parsed?.hits) ? parsed.hits : [])
    .map((row) => ({
      id: text(row?.id),
      score: Math.max(0, Math.min(10, Number(row?.score) || 0)),
      reason: text(row?.reason).slice(0, 220),
    }))
    .filter((row) => row.id && row.score >= 5)
    .slice(0, 12);
  return { ok: true, hits, engine: 'gemini' };
}

export { friendlyGeminiError };
