/**
 * AI-tolkning av konkurransegrunnlag + Q&A til sjekkliste, kvalifikasjonskrav og tildelingskriterier.
 */
import { callGeminiJson, friendlyGeminiError, getGeminiKey } from './aiShared.js';
import { touchGeminiEnv } from './geminiEnv.js';
import { interpretationFromGemini } from './anbud/bidInterpretation.js';

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

const PROMPT = `Du er en norsk anbudsrådgiver. Du leser konkurransegrunnlag, kunngjøring og spørsmål/svar.
Returner KUN gyldig JSON:
{
  "summary": "ryddig oppsummering på 3-8 setninger om hva tilbudet krever",
  "checklist": [
    { "title": "kort kontrollpunkt", "detail": "hva som må sjekkes eller leveres" }
  ],
  "qualification": [
    { "title": "kvalifikasjonskrav", "summary": "én setning", "detail": "utdypende oppsummering" }
  ],
  "awardCriteria": [
    { "title": "tildelingskriterium", "weight": "vekt hvis kjent, ellers tom streng", "summary": "én setning", "detail": "utdypende oppsummering" }
  ]
}
Regler:
- Skriv på norsk.
- checklist: 5-15 konkrete kontrollpunkter for tilbudsarbeidet.
- qualification og awardCriteria: hent det som står i kilden. Hvis uklart, si det i summary/detail.
- Ikke finn opp frister, vekter eller krav som ikke støttes av teksten.
- Maks 15 checklist, 10 qualification, 10 awardCriteria.`;

export { interpretationFromGemini };

export async function interpretBid(input = {}) {
  touchGeminiEnv();
  const key = getGeminiKey();
  if (!key) {
    const err = new Error('AI er ikke tilgjengelig akkurat nå.');
    err.status = 503;
    throw err;
  }
  const source = text(input.source);
  if (source.length < 40) {
    const err = new Error('For lite tekst å tolke. Hent konkurransegrunnlaget først.');
    err.status = 422;
    throw err;
  }
  const parsed = await callGeminiJson(key, PROMPT, [{
    text: [
      `Tilbud: ${text(input.title) || 'Ukjent'}`,
      input.buyer ? `Oppdragsgiver: ${text(input.buyer)}` : '',
      input.companyName ? `Leverandør: ${text(input.companyName)}` : '',
      'Kilde:',
      source.slice(0, 100000),
    ].filter(Boolean).join('\n'),
  }], { maxOutputTokens: 4096, perModelTimeoutMs: 55000 });
  const interpretation = interpretationFromGemini(parsed);
  if (!interpretation.summary && !interpretation.checklist.length) {
    const err = new Error('AI-tolkningen ga tomt resultat.');
    err.status = 502;
    throw err;
  }
  return { ok: true, interpretation, engine: 'gemini' };
}

export { friendlyGeminiError };
