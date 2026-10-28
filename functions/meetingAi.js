/**
 * AI i Møter: dagsorden fra beskrivelse, sammendrag av gjennomført møte og
 * opprydding av stikkordsnotater for ett punkt. Svarer alltid JSON.
 * Appen har lokal reserve når nøkkel mangler eller Gemini feiler.
 */
import { callGeminiJson, getGeminiKey } from './aiShared.js';

const TYPES = ['byggemote', 'oppstart', 'prosjektering', 'hms', 'tavle', 'ledelse', 'styre', 'avdeling', 'kunde', 'overtakelse', 'evaluering', 'annet'];

const AGENDA = `Du setter opp dagsorden for møter i en norsk bedrift innen bygg, anlegg og rådgivning.
Svar kun med JSON:
{"title":"kort møtetittel","typeId":"${TYPES.join('|')}","purpose":"én til to setninger om formålet","chapters":[{"title":"Kapittel","items":[{"title":"Punkt","description":"kort veiledning til hva som skal opp","minutes":10}]}]}
Regler:
- Norsk bokmål. Korte, presise titler uten nummer.
- 3 til 8 kapitler, 1 til 6 punkter per kapittel.
- Summen av minutes skal være nær møtelengden som er oppgitt.
- Ta med åpning (godkjenning av dagsorden og forrige referat) og avslutning (eventuelt, neste møte) når møtet har referat.
- description er 1–2 setninger som hjelper møtelederen å forberede punktet. Tom streng når punktet er selvforklarende.
- Ikke dikt opp navn, datoer, beløp eller fakta som ikke står i beskrivelsen.`;

const SUMMARY = `Du skriver sammendrag av et gjennomført møte til referatet.
Svar kun med JSON: {"summary":"..."}
Regler:
- Norsk bokmål, saklig og nøytral tone, 3 til 6 setninger i ett avsnitt.
- Bruk bare det som står i notater, beslutninger og oppfølgingspunkter. Ikke dikt opp noe.
- Ta med de viktigste beslutningene og de viktigste åpne oppfølgingspunktene med ansvarlig.
- Ikke nevn e-post, telefon eller personlige forhold. Ikke punktliste.`;

const ITEM = `Du er referent og rydder stikkordsnotater fra ett punkt i et møte til ferdig referattekst.
Svar kun med JSON: {"notes":"ryddig referattekst","decisions":["..."],"actions":[{"text":"...","assignee":"navn eller tom","due":"YYYY-MM-DD eller tom"}]}
Regler:
- Norsk bokmål. Hele setninger. Bruk linjer som starter med "- " for opplisting når det passer.
- Behold alt faktisk innhold. Ikke legg til noe som ikke står i notatene.
- decisions: bare det som tydelig er besluttet eller vedtatt. Ta det ut av notes.
- actions: bare konkrete oppgaver noen skal gjøre. assignee må være et av deltakernavnene eller tom streng. due bare når en dato står i notatene.
- Ikke gjenta beslutninger og oppfølgingspunkter i notes.`;

function text(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function clamp(value, min, max, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function normalizeAgenda(raw) {
  const chapters = (Array.isArray(raw?.chapters) ? raw.chapters : []).slice(0, 10).map((chapter) => ({
    title: text(chapter?.title, 120),
    items: (Array.isArray(chapter?.items) ? chapter.items : []).slice(0, 8).map((item) => ({
      title: text(item?.title, 160),
      description: text(item?.description, 800),
      minutes: clamp(item?.minutes, 1, 120, 5),
    })).filter((item) => item.title),
  })).filter((chapter) => chapter.title && chapter.items.length);
  return {
    title: text(raw?.title, 120),
    typeId: TYPES.includes(raw?.typeId) ? raw.typeId : '',
    purpose: text(raw?.purpose, 600),
    chapters,
  };
}

async function agenda(key, data) {
  const ask = {
    beskrivelse: text(data?.description, 2000),
    tittel: text(data?.title, 120),
    type: text(data?.type, 80),
    prosjekt: text(data?.project, 120),
    moetelengdeMinutter: clamp(data?.minutes, 10, 480, 60),
  };
  if (!ask.beskrivelse && !ask.tittel && !ask.type) return { ok: false, error: 'Beskriv møtet først.' };
  const raw = await callGeminiJson(key, AGENDA, JSON.stringify(ask), { maxOutputTokens: 3072, maxModels: 2 });
  const result = normalizeAgenda(raw);
  if (!result.chapters.length) return { ok: false, error: 'AI ga ingen dagsorden.' };
  return { ok: true, agenda: result, engine: 'gemini' };
}

async function summary(key, data) {
  const meeting = data?.meeting || {};
  const items = (Array.isArray(meeting.items) ? meeting.items : []).slice(0, 60).map((item) => ({
    nr: text(item?.number, 10),
    tittel: text(item?.title, 160),
    notater: text(item?.notes, 1500),
    beslutninger: (Array.isArray(item?.decisions) ? item.decisions : []).slice(0, 10).map((d) => text(d, 400)),
    oppfolging: (Array.isArray(item?.actions) ? item.actions : []).slice(0, 15).map((a) => ({
      tekst: text(a?.text, 300), ansvarlig: text(a?.assignee, 80), frist: text(a?.due, 10), utfort: !!a?.done,
    })),
  }));
  const ask = {
    tittel: text(meeting.title, 120),
    type: text(meeting.type, 80),
    nummer: meeting.number || null,
    dato: text(meeting.date, 10),
    prosjekt: text(meeting.project, 120),
    formal: text(meeting.purpose, 600),
    tilStede: (Array.isArray(meeting.participants) ? meeting.participants : [])
      .filter((p) => p?.attendance === 'tilstede').map((p) => text(p?.name, 80)).slice(0, 40),
    saker: items,
  };
  const raw = await callGeminiJson(key, SUMMARY, JSON.stringify(ask), { maxOutputTokens: 1024, maxModels: 2 });
  const out = text(raw?.summary, 3000);
  if (!out) return { ok: false, error: 'AI ga ikke noe sammendrag.' };
  return { ok: true, summary: out, engine: 'gemini' };
}

async function item(key, data) {
  const names = (Array.isArray(data?.meeting?.participants) ? data.meeting.participants : []).map((n) => text(n, 80)).filter(Boolean).slice(0, 40);
  const ask = {
    moete: text(data?.meeting?.title, 120),
    type: text(data?.meeting?.type, 80),
    deltakere: names,
    punkt: text(data?.item?.title, 160),
    nummer: text(data?.item?.number, 10),
    bakgrunn: text(data?.item?.description, 800),
    notater: text(data?.item?.notes, 4000),
  };
  if (!ask.notater) return { ok: false, error: 'Punktet har ingen notater.' };
  const raw = await callGeminiJson(key, ITEM, JSON.stringify(ask), { maxOutputTokens: 2048, maxModels: 2 });
  const allowed = new Set(names);
  return {
    ok: true,
    notes: text(raw?.notes, 4000),
    decisions: (Array.isArray(raw?.decisions) ? raw.decisions : []).map((d) => text(d, 400)).filter(Boolean).slice(0, 8),
    actions: (Array.isArray(raw?.actions) ? raw.actions : []).map((a) => ({
      text: text(a?.text, 300),
      assignee: allowed.has(text(a?.assignee, 80)) ? text(a?.assignee, 80) : '',
      due: /^\d{4}-\d{2}-\d{2}$/.test(text(a?.due, 10)) ? text(a?.due, 10) : '',
    })).filter((a) => a.text).slice(0, 8),
    engine: 'gemini',
  };
}

export async function handleAiMeeting(data) {
  const key = getGeminiKey();
  if (!key) return { ok: false, error: 'AI er ikke satt opp på serveren.', engine: 'local' };
  const action = String(data?.action || '');
  if (action === 'agenda') return agenda(key, data);
  if (action === 'summary') return summary(key, data);
  if (action === 'item') return item(key, data);
  return { ok: false, error: 'Ukjent handling.' };
}
