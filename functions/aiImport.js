import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  AI_LIMITS,
  getGeminiKey,
  assertFamilyAdult,
  assertUsageAllowed,
  incrementUsage,
  downloadImageBase64,
  deleteStorageObject,
  callGeminiJson,
  callGeminiText,
  friendlyGeminiError,
} from './aiShared.js';
import { classifyPlanMime, decodePlainText, extractDocxText, extractPdfText } from './documentText.js';
import { ensureStorageCors } from './storageCors.js';
import {
  COMPACT_TIMETABLE_PROMPT,
  LINE_TIMETABLE_PROMPT,
  extractSuggestionsFromResponse,
  normalizeTimeString,
  parseTimetableLines,
  parseTimetableText,
  parseTimetableTokens,
  parseTimetablePositions,
} from './timetableParse.js';
import {
  HOMEWORK_IMPORT_PROMPT,
  COMPACT_HOMEWORK_PROMPT,
  LINE_HOMEWORK_PROMPT,
  OCR_LEKSEPLAN_PROMPT,
  homeworkIntroText,
  applyHomeworkFocusToSuggestions,
  isHomeworkFocusMode,
  isHomeworkLikeSuggestion,
  isHomeworkItem,
  resolveHomeworkSubjectId,
  parseHomeworkText,
  parseHomeworkLines,
  extractWeekNumberFromText,
} from './homeworkImport.js';
import {
  COMPACT_WEEKLY_INFO_PROMPT,
  looksLikeWeeklyInfoPlan,
  parseWeeklyInfoPositions,
  parseWeeklyInfoText,
} from './weeklyInfoParse.js';

const DAY_MAP = {
  mandag: 'mon', man: 'mon', monday: 'mon', mon: 'mon',
  tirsdag: 'tue', tir: 'tue', tuesday: 'tue', tue: 'tue',
  onsdag: 'wed', ons: 'wed', wednesday: 'wed', wed: 'wed',
  torsdag: 'thu', tor: 'thu', thursday: 'thu', thu: 'thu',
  fredag: 'fri', fre: 'fri', friday: 'fri', fri: 'fri',
  lørdag: 'sat', lor: 'sat', saturday: 'sat', sat: 'sat',
  søndag: 'sun', son: 'sun', sunday: 'sun', sun: 'sun',
};

/** JS getDay(): 0=søn, 1=man … 6=lør */
const DAY_JS = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };

/** Utkast uten createdAt regnes som eldste (typisk etter krasj før felt ble satt). */
function draftCreatedAtMs(data) {
  const ts = data?.createdAt;
  if (ts?.toMillis) return ts.toMillis();
  if (ts?.seconds) return ts.seconds * 1000;
  return 0;
}

/** Utkast eldre enn dette kastes automatisk ved ny import (typisk etter krasj/hvit skjerm). */
const STALE_PENDING_DRAFT_MS = 30 * 60 * 1000;

async function discardPendingDraftDoc(docRef, reason) {
  await docRef.set({
    status: 'discarded',
    discardedAt: FieldValue.serverTimestamp(),
    discardedReason: reason,
  }, { merge: true });
}

/** Standard norsk skole-semester når dokumentet ikke sier noe annet. */
export const DEFAULT_SCHEDULE_PERIOD_WEEKS = 18;

const IMPORT_PROMPT = `Du er ekspert på norske skoledokumenter: ukeplaner, lekseplaner, arbeidsark og info til hjemme.
Les dokumentet (bilde, PDF eller tekst) nøye og returner KUN gyldig JSON med denne strukturen:
{
  "documentType": "weekly_info" | "homework" | "schedule" | "mixed",
  "weekNumber": number | null,
  "period": {
    "kind": "semester" | "school_year" | "special" | "weeks",
    "weeks": number | null,
    "startDate": "YYYY-MM-DD" | null,
    "endDate": "YYYY-MM-DD" | null,
    "label": "kort norsk beskrivelse" | null
  },
  "summary": "kort oppsummering på norsk",
  "suggestions": [
    {
      "kind": "todo" | "schedule_slot" | "event" | "note",
      "title": "kort tittel",
      "description": "valgfri detalj",
      "confidence": 0.0-1.0,
      "type": "daily" | "weekly" | "once",
      "daysOfWeek": [0-6],
      "day": "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"|null,
      "time": "HH:MM"|null,
      "endTime": "HH:MM"|null,
      "subject": "fag"|null,
      "dateHint": "YYYY-MM-DD"|null,
      "recurrenceWeeks": number|null,
      "category": "lekser"|"gjøremål"|"huskelapp"|null,
      "points": number|null,
      "prepTask": false
    }
  ]
}

Viktig: Lag ALLTID konkrete forslag når dokumentet har nyttig info — ikke returner tom liste.

Kind-regler (strengt):
- "schedule_slot" = fag/økter i ukeplanen med ukedag + klokkeslett (f.eks. mandag 09:00–09:45 Norsk). Disse skal KUN inn i barnets ukeplan — IKKE som kalenderhendelse.
- "event" = andre timed hendelser utenom vanlig timeplan: skolestart/-slutt, foreldremøte, tur
- "todo" = lekser, huskelapper, øvingsmål (Oppgaver) — ALDRI kalender. Sett category "lekser" og points 5–10
- "note" = kontaktinfo/nettside (ikke auto-valgt)
- ALDRI lag både todo og event for samme lekse
- Lekseark uten klokkeslett → kun "todo" med category "lekser"

A) Ukeplan / timeplan (viktig):
1) Tabellformat med kolonner Mandag–Fredag og rader med «1.økt», «2.økt» osv.:
   - Hver celle med fag → schedule_slot. Bruk klokkeslett fra radens tidsintervall (f.eks. rad «1.økt 08.25 - 09.55» → time "08:25", endTime "09:55").
   - Inkluder Friminutt og Spising som schedule_slot for alle ukedager (mon–fri) med riktig klokkeslett.
   - Lærerinitialer i parentes (f.eks. «NORSK (ET)», «GYM/SVØM (HE/ET)») legges i subject/title — behold dem.
   - Kombinerte fag med skråstrek (MUSIKK/NORSK) beholdes som ett fagnavn.
   - Tomme celler uten fag → ikke forslag for den dagen (ikke flytt fag fra nabokolonne).
2) Hver time/fag med dag+klokkeslett → schedule_slot (day mon..fri, time "HH:MM" FRA, endTime "HH:MM" TIL, subject/title = fagnavn). ALLTID sett både time og endTime. Hvis sluttid mangler, anslå 45 minutter.
3) «Skolen starter kl. 08:25» → event weekly, time "08:25", daysOfWeek [1,2,3,4,5]
4) «Skoleslutt mandag 12:15, øvrige dager 13:30» → TO eventer
5) Gym / kroppsøving / svømming med dag+tid → schedule_slot (ikke kalender). I TILLEGG: valgfrie todos (prepTask true, selected implicit false i UI) «Husk gymtøy» / «Husk svømmetøy» kvelden FØR (type weekly, daysOfWeek = dagen før) og «Pakk gymtøy» / «Pakk svømmetøy» om MORGENEN samme dag. category "gjøremål", dateHint = neste aktuelle dato.
6) «Svømming neste onsdag i 7 uker» → schedule_slot + recurrenceWeeks 7 + prep-todos for svømmetøy
7) Læringsmål / lekser i ukeplanen → todo type "once", category "lekser", points 5, dateHint = frist (fredag eller oppgitt dato). IKKE weekly/daily.
8) Kontaktinfo/nettside → note

B) Lekseark / arbeidsark (f.eks. «14 Lange ord», «Lekse uke 34»):
1) Hver lekse/fag → egen homework type "once", category "lekser", points 5–10
2) Sett dateHint til innleveringsfrist (ofte fredag). Bruk start av uken som arbeidsperiode — ALDRI type weekly/daily for lekser (da gjentas de hele året)
3) Deloppgaver → egne homework med category "lekser"
4) Ikke «løs» gåtene — foreslå gjøremål

C) Småskole-ukeplan / ukeinfo UTEN klokkeslett (viktig — vanlig for 1.–4. trinn):
Eksempel: «UKEPLAN FOR 4. TRINN UKE 36» med læringsmål, «Informasjon til de hjemme», og leksetabell Fag × Tirsdag–Fredag (Norsk/Matte/Engelsk) + dagshuskelapper.
1) Dette er IKKE timeplan. ALDRI kind "schedule_slot". Ikke finn på økter eller klokkeslett.
2) documentType = "weekly_info". period = { kind: "special", weeks: 1, label: "Uke N" } når ukenummer står.
3) Hver fag-lekse (Norsk/Matte/Engelsk …) → kind "homework", category "lekser", type "once", dateHint = fredag i uken.
4) Dagspesifikke huskelapper («husk svømmetøy», «husk gymtøy», «vi går på tur», «levering av lekser») → todo category "gjøremål" med riktig day (tue/wed/thu/fri). prepTask true for gym/svøm.
5) Læringsmål kan bli korte homework/todos per fag — ikke lim inn hele avsnitt.
6) Kontaktinfo/e-post/telefon/nettside → note (ikke auto-valgt).

D) Gyldighetsperiode (period) — viktig for timeplan:
1) Vanlig ukeplan/timeplan uten sluttdato → kind "semester", weeks ${DEFAULT_SCHEDULE_PERIOD_WEEKS}, label f.eks. "Ett semester"
2) Hele skoleåret nevnt → kind "school_year", weeks 40
3) Spesiell periode (prosjektuke, «kun uke 34», «uke 34–38», «i 7 uker», innsatsperiode) ELLER småskole-ukeinfo for én uke → kind "special", sett weeks og/eller startDate/endDate, label som beskriver perioden
4) Enkelt aktiviteter med egen varighet (f.eks. svømming 7 uker) beholder recurrenceWeeks på forslaget; period beskriver hovedplanen
5) Ikke gjett årstall — bruk kun datoer som står i dokumentet

Regler:
- Ekskluder e-post, telefon og nettside med mindre det er en aktivitet.
- daysOfWeek: 0=søndag … 6=lørdag.
- confidence 0.7–0.95 for tydelig tekst.
- Maks ${AI_LIMITS.maxSuggestions} forslag (ukeplaner kan ha mange timer).
- Prioriter: timeplan time-for-time med fra/til når den finnes; ellers lekser/huskelapper fra ukeinfo.
- For schedule_slot: utelat description, points og dateHint — kun kind, title, subject, day, time, endTime, confidence.`;

function normalizePeriod(raw) {
  const kind = ['semester', 'school_year', 'special', 'weeks', 'until_date'].includes(raw?.kind)
    ? raw.kind
    : 'semester';

  let weeks = raw?.weeks != null && Number.isFinite(Number(raw.weeks))
    ? Math.min(52, Math.max(1, Math.round(Number(raw.weeks))))
    : null;

  if (kind === 'semester' && !weeks) weeks = DEFAULT_SCHEDULE_PERIOD_WEEKS;
  if (kind === 'school_year' && !weeks) weeks = 40;

  const startDate = raw?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(String(raw.startDate))
    ? String(raw.startDate)
    : null;
  const endDate = raw?.endDate && /^\d{4}-\d{2}-\d{2}$/.test(String(raw.endDate))
    ? String(raw.endDate)
    : null;

  let label = String(raw?.label || '').trim().slice(0, 80) || null;
  if (!label) {
    if (kind === 'semester') label = 'Ett semester';
    else if (kind === 'school_year') label = 'Skoleår';
    else if (weeks) label = `${weeks} uker`;
  }

  return {
    kind,
    weeks,
    startDate,
    endDate,
    label,
    fromAi: !!(raw && (raw.kind || raw.weeks || raw.endDate || raw.label)),
  };
}

function defaultPeriod() {
  return normalizePeriod({ kind: 'semester', weeks: DEFAULT_SCHEDULE_PERIOD_WEEKS, label: 'Ett semester' });
}

function looksLikeHomework(raw) {
  const blob = `${raw?.title || ''} ${raw?.subject || ''} ${raw?.description || ''} ${raw?.name || ''} ${raw?.category || ''}`.toLowerCase();
  return /lekse|arbeidsark|øving|øve\b|lese ord|skriv|gåte|alfabet|læringsmål|husk (badetøy|gymtøy)|huskelapp|les side|les kap|kapittel|gloser|oppgave|innlever|forbered|øvingsark|hjemme(arbeid)?/.test(blob)
    || isHomeworkLikeSuggestion(raw);
}

function looksLikeCalendarEvent(raw) {
  const blob = `${raw?.title || ''} ${raw?.subject || ''} ${raw?.description || ''}`.toLowerCase();
  return /skole(start|slutt)|svøm|gym|idrett|trening|fri\.?dag|ferie|møte|foreldremøte|tur\b|kamp\b/.test(blob);
}

function looksLikeLesson(raw) {
  const blob = `${raw?.title || ''} ${raw?.subject || ''} ${raw?.name || ''}`.toLowerCase();
  return /norsk|matematikk|matte\b|engelsk|naturfag|samfunnsfag|kunst|musikk|kroppsøving|krle|mat og helse|morgensamling|utelek|matpause|friminutt|lesing|skriving|fyfo|fysikk|gym\b|svøm|k&h|te\b|spansk|tysk|religion|geografi|historie|programmering|dans\b|drama/.test(blob);
}

function normalizeSuggestion(raw, idx, opts = {}) {
  const homeworkFocus = !!opts.homeworkFocus;
  let kind = ['todo', 'homework', 'schedule_slot', 'event', 'note'].includes(raw?.kind)
    ? raw.kind : 'note';

  const hasTime = !!raw?.time;
  const hasDay = !!(raw?.day || (Array.isArray(raw?.daysOfWeek) && raw.daysOfWeek.length));

  // Timeplan-fag med dag+tid skal være schedule_slot (ikke todo) — unntak lekseplan-modus.
  if (!homeworkFocus && (kind === 'todo' || kind === 'event' || kind === 'note') && hasTime && hasDay && (looksLikeLesson(raw) || raw?.kind === 'schedule_slot')) {
    kind = 'schedule_slot';
  }

  // Lekseplan: behold huskelapper som todo; øvrige todo → homework.
  if (homeworkFocus && kind === 'schedule_slot' && isHomeworkLikeSuggestion(raw)) {
    kind = 'homework';
  }
  const looksLikeHusk = !!(raw?.prepTask || raw?.prepWhen
    || String(raw?.category || '').toLowerCase() === 'gjøremål'
    || /husk|svømmetøy|gymtøy|gymsko|badetøy|badehette/i.test(`${raw?.title || ''} ${raw?.description || ''}`));
  if (homeworkFocus && kind === 'todo' && !looksLikeHusk) {
    kind = 'homework';
  }

  // Lekser uten klokkeslett → homework (ikke kalender / gjøremål).
  if ((kind === 'event' || kind === 'schedule_slot') && looksLikeHomework(raw) && !hasTime) {
    kind = homeworkFocus ? 'homework' : 'todo';
  }
  if (kind === 'event' && !hasTime && !looksLikeCalendarEvent(raw) && !looksLikeLesson(raw)) {
    kind = 'todo';
  }

  let day = raw?.day ? String(raw.day).toLowerCase() : null;
  if (day && DAY_MAP[day]) day = DAY_MAP[day];
  if (day && !['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(day)) day = null;

  let daysOfWeek = Array.isArray(raw?.daysOfWeek)
    ? raw.daysOfWeek.map(Number).filter((n) => n >= 0 && n <= 6)
    : [];
  if (!daysOfWeek.length && day && DAY_JS[day] != null) {
    daysOfWeek = [DAY_JS[day]];
  }

  const recurrenceWeeks = raw?.recurrenceWeeks != null
    ? Math.min(52, Math.max(1, Number(raw.recurrenceWeeks)))
    : null;

  let category = String(raw?.category || '').trim().toLowerCase() || null;
  if ((kind === 'todo' || kind === 'homework') && !category) {
    category = (homeworkFocus || looksLikeHomework(raw) || kind === 'homework') ? 'lekser' : 'gjøremål';
  }
  if (homeworkFocus && kind === 'homework') {
    category = 'lekser';
  }
  if (homeworkFocus && kind === 'todo' && looksLikeHusk) {
    category = 'gjøremål';
  }
  if (category === 'lekse') category = 'lekser';

  const pointsRaw = Number(raw?.points);
  const points = kind === 'todo'
    ? (Number.isFinite(pointsRaw) && pointsRaw > 0 ? Math.min(50, Math.round(pointsRaw)) : 5)
    : null;

  // Lekser = engangslekser med frist — aldri ubegrenset weekly/daily
  let type = ['daily', 'weekly', 'once'].includes(raw?.type) ? raw.type : 'weekly';
  if (kind === 'homework' || (kind === 'todo' && (category === 'lekser' || homeworkFocus))) {
    type = 'once';
  }

  const time = (kind === 'todo' || kind === 'homework') ? null : normalizeTimeString(raw?.time);
  let endTime = (kind === 'todo' || kind === 'homework') ? null : normalizeTimeString(raw?.endTime);
  if (kind === 'schedule_slot' && time && !endTime) {
    const [hh, mm] = time.split(':').map(Number);
    if (Number.isFinite(hh)) {
      const total = hh * 60 + (mm || 0) + 45;
      endTime = `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    }
  }

  const prepTask = raw?.prepTask === true
    || /husk (gym|svøm|bade)|pakk (gym|svøm)/i.test(String(raw?.title || ''));

  return {
    id: `s${idx + 1}`,
    selected: prepTask ? false : (kind !== 'note' && Number(raw?.confidence ?? 0.7) >= 0.55),
    kind,
    title: String(
      raw?.title
      || raw?.subject
      || raw?.name
      || raw?.task
      || raw?.heading
      || 'Gjøremål',
    ).slice(0, 120),
    description: String(raw?.description || '').slice(0, 400),
    confidence: Math.min(1, Math.max(0, Number(raw?.confidence ?? 0.7))),
    type,
    daysOfWeek: type === 'once' ? [] : daysOfWeek,
    day,
    time,
    endTime,
    subject: kind === 'homework'
      ? resolveHomeworkSubjectId(raw?.subject, raw?.title)
      : (raw?.subject ? String(raw.subject).slice(0, 80) : null),
    dateHint: raw?.dateHint ? String(raw.dateHint).slice(0, 10) : null,
    recurrenceWeeks: (kind === 'todo' || kind === 'homework') ? null : recurrenceWeeks,
    category,
    points,
    prepTask,
    prepWhen: raw?.prepWhen === 'evening' || raw?.prepWhen === 'morning' ? raw.prepWhen : null,
  };
}

function pad(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function dateKeyFromDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateKey(k) {
  const [y, m, d] = String(k || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Mandag i uken som inneholder dateKey (eller i dag). */
function mondayOfWeekContaining(keyOrDate) {
  const d = typeof keyOrDate === 'string' ? parseDateKey(keyOrDate) : new Date(keyOrDate || Date.now());
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  return dateKeyFromDate(addDays(d, diff));
}

/** Fredag i samme uke (typisk leksefrist). */
function fridayOfWeekContaining(keyOrDate) {
  const mon = mondayOfWeekContaining(keyOrDate);
  return dateKeyFromDate(addDays(parseDateKey(mon), 4));
}

function resolveEventDateKey(item) {
  if (item.dateHint && /^\d{4}-\d{2}-\d{2}$/.test(item.dateHint)) {
    return item.dateHint;
  }
  const from = new Date();
  if (item.day && DAY_JS[item.day] != null) {
    for (let i = 0; i < 8; i += 1) {
      const d = addDays(from, i);
      if (d.getDay() === DAY_JS[item.day]) return dateKeyFromDate(d);
    }
  }
  if (item.daysOfWeek?.length) {
    for (let i = 0; i < 8; i += 1) {
      const d = addDays(from, i);
      if (item.daysOfWeek.includes(d.getDay())) return dateKeyFromDate(d);
    }
  }
  return dateKeyFromDate(from);
}

function resolveRecurrenceUntilKey(startKey, item, period = null) {
  if (item?.recurrenceUntilKey && /^\d{4}-\d{2}-\d{2}$/.test(item.recurrenceUntilKey)) {
    return item.recurrenceUntilKey;
  }
  if (period?.endDate && /^\d{4}-\d{2}-\d{2}$/.test(period.endDate)) {
    return period.endDate;
  }
  const weeks = item?.recurrenceWeeks
    || period?.weeks
    || null;
  if (!weeks || !startKey) return null;
  const end = addDays(parseDateKey(startKey), weeks * 7 - 1);
  return dateKeyFromDate(end);
}

function buildEventPayload(item, draftId, childId, parentUid, addToParentCalendar, period = null) {
  const dateKey = resolveEventDateKey(item);
  const isRecurring = item.type === 'weekly' || item.type === 'daily';
  const recurrenceByDays = item.daysOfWeek?.length
    ? item.daysOfWeek
    : (item.day && DAY_JS[item.day] != null ? [DAY_JS[item.day]] : []);

  const memberIds = [childId];
  if (addToParentCalendar && parentUid && !memberIds.includes(parentUid)) {
    memberIds.push(parentUid);
  }

  const base = {
    title: item.title,
    description: item.description || '',
    dateKey,
    startTime: item.time || null,
    endTime: item.endTime || null,
    allDay: !item.time,
    memberIds,
    childIds: [childId],
    color: '#0b74d1',
    source: 'ai_import',
    aiDraftId: draftId,
    createdAt: FieldValue.serverTimestamp(),
  };

  if (!isRecurring || item.type === 'once') {
    return { ...base, recurring: false };
  }

  const recurrenceUntilKey = resolveRecurrenceUntilKey(dateKey, item, period);
  if (item.type === 'daily') {
    return {
      ...base,
      recurring: true,
      recurrenceType: 'daily',
      recurrenceInterval: 1,
      recurrenceByDays: [],
      recurrenceUntilKey,
    };
  }

  return {
    ...base,
    recurring: true,
    recurrenceType: 'weekly',
    recurrenceInterval: 1,
    recurrenceByDays: recurrenceByDays.length ? recurrenceByDays : [parseDateKey(dateKey).getDay()],
    recurrenceUntilKey,
  };
}

function localImportFallback(manualOnly = false) {
  return {
    documentType: 'mixed',
    weekNumber: null,
    period: defaultPeriod(),
    summary: manualOnly
      ? 'Automatisk dokumentlesing er ikke aktivert. Legg til gjøremål manuelt nedenfor.'
      : 'AI fant ingen konkrete forslag i dette dokumentet. Legg til manuelt, eller prøv et skarpere bilde/PDF.',
    suggestions: [],
    usedFallback: true,
    manualOnly,
    parseError: false,
  };
}

async function analyzePlanWithGemini({
  apiKey,
  userParts,
  systemPrompt,
  fileKind,
  homeworkFocus = false,
}) {
  // Hold under Cloud Function-timeout (180s): PDF sendes som tekst, ikke binær fil.
  // Lekseplan (spesielt bilder): kompakt prompt + 1 modell + kortere timeout unngår 500/deadline.
  const isPdf = fileKind === 'pdf';
  const raw = await callGeminiJson(apiKey, systemPrompt, userParts, {
    maxOutputTokens: homeworkFocus ? 8192 : 16384,
    maxModels: homeworkFocus ? 1 : (isPdf ? 1 : 2),
    perModelTimeoutMs: homeworkFocus
      ? (isPdf || fileKind === 'text' ? 40000 : 55000)
      : (isPdf ? 45000 : 70000),
  });

  const extracted = extractSuggestionsFromResponse(raw);
  const suggestions = (extracted.length ? extracted : (Array.isArray(raw?.suggestions) ? raw.suggestions : []))
    .slice(0, AI_LIMITS.maxSuggestions)
    .map((item, idx) => normalizeSuggestion(item, idx, { homeworkFocus }))
    .filter((s) => String(s?.title || '').trim().length > 0);

  return { raw, suggestions };
}

async function analyzePlanWithGeminiLines({
  apiKey,
  userParts,
  fileKind,
}) {
  const isPdf = fileKind === 'pdf';
  const text = await callGeminiText(apiKey, LINE_TIMETABLE_PROMPT, userParts, {
    maxOutputTokens: 8192,
    maxModels: isPdf ? 1 : 2,
    perModelTimeoutMs: isPdf ? 45000 : 70000,
  });
  const suggestions = parseTimetableLines(text)
    .slice(0, AI_LIMITS.maxSuggestions)
    .map(normalizeSuggestion)
    .filter((s) => String(s?.title || '').trim().length > 0);
  return {
    raw: { documentType: 'schedule', summary: 'Timeplan lest fra dokumentet.' },
    suggestions,
  };
}

async function analyzePlanWithGeminiHomeworkLines({
  apiKey,
  userParts,
  fileKind,
}) {
  const isPdf = fileKind === 'pdf';
  const text = await callGeminiText(apiKey, LINE_HOMEWORK_PROMPT, userParts, {
    maxOutputTokens: 4096,
    maxModels: 1,
    perModelTimeoutMs: isPdf || fileKind === 'text' ? 35000 : 45000,
  });
  const suggestions = parseHomeworkLines(text)
    .slice(0, AI_LIMITS.maxSuggestions)
    .map((item, idx) => normalizeSuggestion(item, idx, { homeworkFocus: true }))
    .filter((s) => String(s?.title || '').trim().length > 0);
  return {
    raw: { documentType: 'homework', summary: 'Lekser lest fra dokumentet.' },
    suggestions,
  };
}

/** OCR bilde → ren tekst for lokal LEKSEPLAN-parser (LESING/REGNING/SKRIVING). */
async function ocrHomeworkDocumentText({ apiKey, userParts, fileKind }) {
  const isPdf = fileKind === 'pdf';
  const text = await callGeminiText(apiKey, OCR_LEKSEPLAN_PROMPT, userParts, {
    maxOutputTokens: 4096,
    maxModels: 1,
    perModelTimeoutMs: isPdf || fileKind === 'text' ? 35000 : 50000,
  });
  return String(text || '').trim();
}

function homeworkSuggestionsFromText(documentText) {
  if (!documentText?.trim()) return [];
  return dedupeSuggestions(
    parseHomeworkText(documentText).map((item, idx) => normalizeSuggestion(item, idx, { homeworkFocus: true })),
  );
}

async function resolveEmptyHomeworkImport({
  apiKey,
  userParts,
  userPartsForFallback,
  fileKind,
  pdfSentAsText,
  documentText,
  homeworkTextFallback,
  weeklyInfoFallback = [],
}) {
  if (homeworkTextFallback?.length || weeklyInfoFallback?.length) {
    return buildImportResult(
      {
        documentType: weeklyInfoFallback?.length >= 2 ? 'weekly_info' : 'homework',
        summary: 'Lekser og huskelapper lest fra dokumenttekst.',
      },
      dedupeSuggestions([...(homeworkTextFallback || []), ...(weeklyInfoFallback || [])]),
    );
  }

  // Primær var allerede kompakt — prøv OCR→lokal parse, deretter linjeformat/full prompt.
  if (!documentText?.trim() && userPartsForFallback?.length) {
    try {
      console.warn('[aiImportPlan] homework empty, trying late OCR');
      const ocrText = await ocrHomeworkDocumentText({
        apiKey,
        userParts: userPartsForFallback,
        fileKind: pdfSentAsText ? 'text' : fileKind,
      });
      if (ocrText.length >= 20) {
        const localFromOcr = homeworkSuggestionsFromText(ocrText);
        const weeklyFromOcr = normalizeWeeklyInfoSuggestions(parseWeeklyInfoText(ocrText));
        const merged = dedupeSuggestions([...localFromOcr, ...weeklyFromOcr]);
        if (merged.length) {
          return buildImportResult(
            { documentType: 'homework', summary: 'Lekser lest fra bilde-OCR.' },
            merged,
          );
        }
      }
    } catch (ocrErr) {
      console.warn('[aiImportPlan] late homework OCR failed', ocrErr?.message);
    }
  }

  console.warn('[aiImportPlan] homework empty after compact, trying line-format');
  try {
    const lineResult = await analyzePlanWithGeminiHomeworkLines({
      apiKey,
      userParts: userPartsForFallback,
      fileKind: pdfSentAsText ? 'text' : fileKind,
    });
    if (lineResult.suggestions.length) {
      return buildImportResult(lineResult.raw, lineResult.suggestions);
    }
  } catch (lineErr) {
    console.warn('[aiImportPlan] homework line fallback failed', lineErr?.message);
  }

  console.warn('[aiImportPlan] homework empty, trying full homework prompt');
  try {
    const full = await analyzePlanWithGemini({
      apiKey,
      userParts,
      systemPrompt: HOMEWORK_IMPORT_PROMPT,
      fileKind: pdfSentAsText ? 'text' : fileKind,
      homeworkFocus: true,
    });
    if (full.suggestions.length) {
      return buildImportResult(
        { ...full.raw, documentType: 'homework' },
        full.suggestions,
      );
    }
  } catch (fullErr) {
    console.warn('[aiImportPlan] full homework prompt failed', fullErr?.message);
  }

  console.warn('[aiImportPlan] homework empty, trying weekly-info compact');
  try {
    const weeklyRetry = await analyzePlanWithGemini({
      apiKey,
      userParts,
      systemPrompt: COMPACT_WEEKLY_INFO_PROMPT,
      fileKind: pdfSentAsText ? 'text' : fileKind,
      homeworkFocus: false,
    });
    if (weeklyRetry.suggestions.length) {
      return buildImportResult(
        { ...weeklyRetry.raw, documentType: 'weekly_info' },
        weeklyRetry.suggestions,
      );
    }
  } catch (weeklyErr) {
    console.warn('[aiImportPlan] weekly-info retry failed', weeklyErr?.message);
  }

  if (documentText?.trim()) {
    const localHomework = homeworkSuggestionsFromText(documentText);
    const localWeekly = normalizeWeeklyInfoSuggestions(parseWeeklyInfoText(documentText));
    const merged = dedupeSuggestions([...localHomework, ...localWeekly]);
    if (merged.length) {
      return buildImportResult(
        { documentType: 'homework', summary: 'Lekser lest fra dokumenttekst.' },
        merged,
      );
    }
  }

  return buildImportResult({ documentType: 'homework' }, []);
}

function dedupeSuggestions(list) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const key = [
      item?.kind || '',
      item?.day || '',
      item?.time || '',
      item?.endTime || '',
      String(item?.title || item?.subject || '').trim().toLowerCase(),
    ].join('|');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function buildWeeklyInfoResult(suggestions, text = '') {
  const weekNumber = extractWeekNumberFromText(text);
  return buildImportResult(
    {
      documentType: 'weekly_info',
      weekNumber,
      summary: weekNumber
        ? `Ukeinfo for uke ${weekNumber} lest fra dokumentet.`
        : 'Ukeinfo / småskole-ukeplan lest fra dokumentet.',
      period: {
        kind: 'special',
        weeks: 1,
        label: weekNumber ? `Uke ${weekNumber}` : 'Ukens plan',
      },
    },
    suggestions,
  );
}

function normalizeWeeklyInfoSuggestions(rawList) {
  return dedupeSuggestions(
    (rawList || []).map((item, idx) => normalizeSuggestion(item, idx, { homeworkFocus: false })),
  );
}

function buildImportResult(raw, suggestions) {
  if (!suggestions.length) {
    return {
      documentType: raw?.documentType || 'mixed',
      weekNumber: raw?.weekNumber ?? null,
      period: normalizePeriod(raw?.period),
      summary: friendlyGeminiError(new Error('AI returnerte ingen konkrete forslag fra dokumentet.')),
      suggestions: [],
      usedFallback: false,
      manualOnly: false,
      parseError: false,
    };
  }

  return {
    documentType: raw?.documentType || 'mixed',
    weekNumber: raw?.weekNumber ?? null,
    period: normalizePeriod(raw?.period),
    summary: String(raw?.summary || '').slice(0, 500),
    suggestions,
    usedFallback: false,
    manualOnly: false,
    parseError: false,
  };
}

export async function handleAiImportPlan(data, auth) {
  const uid = auth?.uid;
  const familyId = String(data?.familyId || '').trim();
  const childId = String(data?.childId || '').trim();
  const storagePath = String(data?.storagePath || '').trim();
  const imageBase64 = String(data?.imageBase64 || '').trim();
  const childName = String(data?.childName || '').trim();
  const fileName = String(data?.fileName || '').trim();
  const rawMime = String(data?.mimeType || '').trim();
  const kind = classifyPlanMime(rawMime, fileName);
  const mimeType = rawMime
    || (kind === 'pdf' ? 'application/pdf' : kind === 'text' ? 'text/plain' : 'image/jpeg');
  const homeworkFocus = isHomeworkFocusMode(data?.focusMode);

  if (!uid || !familyId || !childId || (!storagePath && !imageBase64)) {
    throw new Error('Mangler familie, barn eller dokument.');
  }
  if (storagePath && !storagePath.startsWith(`families/${familyId}/ai-temp/`)) {
    throw new Error('Ugyldig filsti.');
  }

  const maxBytes = kind === 'image' ? AI_LIMITS.maxImageBytes : AI_LIMITS.maxDocumentBytes;
  if (imageBase64) {
    const bytes = Buffer.from(imageBase64.replace(/^data:[^;]+;base64,/, ''), 'base64').length;
    if (bytes > maxBytes) {
      throw new Error(kind === 'image'
        ? 'Bildet er for stort. Prøv et mindre bilde eller ta nærmere foto.'
        : 'Filen er for stor (maks 4 MB). Lagre som PDF eller ta et bilde.');
    }
  }
  if (kind === 'doc') {
    throw new Error('Gammelt .doc-format støttes ikke. Lagre som PDF eller .docx og prøv igjen.');
  }
  if (kind === 'unknown' && !imageBase64) {
    throw new Error('Filtypen støttes ikke. Bruk bilde, PDF eller Word/tekst.');
  }

  const db = getFirestore();
  await assertFamilyAdult(db, uid, familyId);
  ensureStorageCors().catch(() => {});

  const pendingSnap = await db.collection('families').doc(familyId)
    .collection('children').doc(childId)
    .collection('aiDrafts')
    .where('status', '==', 'pending')
    .limit(AI_LIMITS.maxPendingDraftsPerChild + 5)
    .get();

  // Rydd automatisk bort tomme/mislykkede utkast som bare blokkerer nye importer.
  let blockingPending = 0;
  const blockingDocs = [];
  for (const doc of pendingSnap.docs) {
    const d = doc.data() || {};
    const suggestions = Array.isArray(d.suggestions) ? d.suggestions : [];
    const isEmptyFail = !!d.parseError || suggestions.length === 0 || !!d.usedFallback;
    if (isEmptyFail) {
      await discardPendingDraftDoc(doc.ref, 'auto-empty');
    } else {
      blockingPending += 1;
      blockingDocs.push(doc);
    }
  }

  const now = Date.now();
  for (const doc of blockingDocs.slice()) {
    const ageMs = now - draftCreatedAtMs(doc.data());
    if (ageMs < STALE_PENDING_DRAFT_MS) continue;
    await discardPendingDraftDoc(doc.ref, 'auto-stale');
    blockingPending -= 1;
    const idx = blockingDocs.indexOf(doc);
    if (idx >= 0) blockingDocs.splice(idx, 1);
  }

  // Ny import = bruker vil videre — kast eldste ventende utkast til det er plass.
  if (blockingPending >= AI_LIMITS.maxPendingDraftsPerChild) {
    blockingDocs.sort((a, b) => draftCreatedAtMs(a.data()) - draftCreatedAtMs(b.data()));
    while (blockingPending >= AI_LIMITS.maxPendingDraftsPerChild && blockingDocs.length) {
      const oldest = blockingDocs.shift();
      await discardPendingDraftDoc(oldest.ref, 'auto-superseded');
      blockingPending -= 1;
      console.warn('[aiImportPlan] auto-discarded oldest pending draft', oldest.id);
    }
  }

  await assertUsageAllowed(db, familyId, uid, 'import', AI_LIMITS.importsPerFamilyPerDay);

  const apiKey = getGeminiKey();
  let parsed = localImportFallback(!apiKey);
  let engine = apiKey ? 'gemini' : 'local';
  let documentText = '';
  // Ikke log selve nøkkelen — kun om den finnes (kan ellers forklare at vi alltid havner i fallback).
  console.warn('[aiImportPlan] gemini config', { hasGeminiKey: !!apiKey, engine });

  if (apiKey) {
    let userPartsForFallback = null;
    let fileKindForFallback = kind;
    try {
      let base64;
      let mime = mimeType || 'image/jpeg';
      if (imageBase64) {
        const dataUrl = imageBase64.match(/^data:([^;]+);base64,(.+)$/i);
        if (dataUrl) {
          mime = dataUrl[1] || mime;
          base64 = dataUrl[2];
        } else {
          base64 = imageBase64;
        }
      } else {
        const downloaded = await downloadImageBase64(storagePath);
        base64 = downloaded.base64;
        mime = downloaded.mime || mime;
      }
      const fileKind = classifyPlanMime(mime, fileName);
      fileKindForFallback = fileKind;
      if (fileKind === 'doc') {
        throw new Error('Gammelt .doc-format støttes ikke. Lagre som PDF eller .docx og prøv igjen.');
      }

      const intro = homeworkFocus
        ? homeworkIntroText(childName)
        : `Analyser dette skoledokumentet for barnet "${childName || 'barn'}". `
          + 'Det kan være timeplan med klokkeslett, småskole-ukeinfo uten klokkeslett, lekseark eller arbeidsark. '
          + 'Lag konkrete forslag. Timeplan-fag med dag+tid → schedule_slot. '
          + 'Småskole-ukeplan uten tider → homework/lekser + huskelapper (ikke finn på klokkeslett). '
          + 'Returner strukturert JSON for foreldregodkjenning.';

      const userParts = [{ text: intro }];
      let textFallbackSuggestions = [];
      let homeworkTextFallback = [];
      let weeklyInfoFallback = [];
      let pdfSentAsText = false;
      let positionedItems = [];

      if (fileKind === 'text') {
        const text = decodePlainText(base64);
        if (!text || text.length < 8) throw new Error('Dokumentet mangler eller er for lite til å leses.');
        documentText = text;
        if (homeworkFocus) {
          homeworkTextFallback = dedupeSuggestions(
            parseHomeworkText(text).map((item, idx) => normalizeSuggestion(item, idx, { homeworkFocus: true })),
          );
          weeklyInfoFallback = normalizeWeeklyInfoSuggestions(parseWeeklyInfoText(text));
        } else {
          textFallbackSuggestions = dedupeSuggestions(
            parseTimetableText(text).map(normalizeSuggestion),
          );
          weeklyInfoFallback = normalizeWeeklyInfoSuggestions(parseWeeklyInfoText(text));
        }
        userParts.push({ text: `Innhold:\n${text.slice(0, 20000)}` });
      } else if (fileKind === 'docx') {
        const text = extractDocxText(Buffer.from(base64, 'base64'));
        documentText = text;
        if (homeworkFocus) {
          homeworkTextFallback = dedupeSuggestions(
            parseHomeworkText(text).map((item, idx) => normalizeSuggestion(item, idx, { homeworkFocus: true })),
          );
          weeklyInfoFallback = normalizeWeeklyInfoSuggestions(parseWeeklyInfoText(text));
        } else {
          textFallbackSuggestions = dedupeSuggestions(
            parseTimetableText(text).map(normalizeSuggestion),
          );
          weeklyInfoFallback = normalizeWeeklyInfoSuggestions(parseWeeklyInfoText(text));
        }
        userParts.push({ text: `Innhold fra Word-dokument:\n${text.slice(0, 20000)}` });
      } else if (fileKind === 'pdf') {
        if (!base64 || base64.length < 100) {
          throw new Error('Dokumentet mangler eller er for lite til å leses.');
        }
        const pdfBuf = Buffer.from(base64, 'base64');
        let extracted = null;
        try {
          extracted = await extractPdfText(pdfBuf);
          documentText = extracted.text || '';
          positionedItems = extracted.positionedItems || [];
          if (homeworkFocus) {
            homeworkTextFallback = dedupeSuggestions(
              parseHomeworkText(documentText).map((item, idx) => normalizeSuggestion(item, idx, { homeworkFocus: true })),
            );
            const fromWeeklyPos = parseWeeklyInfoPositions(positionedItems, { sourceText: documentText });
            const fromWeeklyText = parseWeeklyInfoText(documentText);
            weeklyInfoFallback = normalizeWeeklyInfoSuggestions(
              fromWeeklyPos.length >= 2 ? fromWeeklyPos : [...fromWeeklyPos, ...fromWeeklyText],
            );
          } else {
            const fromPositions = parseTimetablePositions(extracted.positionedItems || [])
              .map(normalizeSuggestion);
            const fromTokens = parseTimetableTokens(extracted.tokens).map(normalizeSuggestion);
            const fromText = parseTimetableText(extracted.text).map(normalizeSuggestion);
            textFallbackSuggestions = dedupeSuggestions(
              fromPositions.length >= 3
                ? [...fromPositions, ...fromText]
                : [...fromPositions, ...fromTokens, ...fromText],
            );
            const fromWeeklyPos = parseWeeklyInfoPositions(positionedItems, { sourceText: documentText });
            const fromWeeklyText = parseWeeklyInfoText(documentText);
            weeklyInfoFallback = normalizeWeeklyInfoSuggestions(
              fromWeeklyPos.length >= 2 ? fromWeeklyPos : [...fromWeeklyPos, ...fromWeeklyText],
            );
          }
          // Tekstbasert PDF → send tekst til Gemini (raskere/mer stabilt enn binær PDF).
          if (extracted.text.length >= 8) {
            userParts.push({ text: `Innhold fra PDF:\n${extracted.text.slice(0, 20000)}` });
            pdfSentAsText = true;
          }
        } catch (pdfErr) {
          console.warn('[aiImportPlan] pdf text extract failed', pdfErr?.message);
        }
        // Aldri send binær PDF til Gemini — det timeout-er ofte og gir INTERNAL 500.
        if (!pdfSentAsText
          && textFallbackSuggestions.length === 0
          && homeworkTextFallback.length === 0
          && weeklyInfoFallback.length === 0) {
          throw new Error(
            homeworkFocus
              ? 'Kunne ikke lese PDF-en. Prøv bilde/screenshot av lekseplanen, eller lagre som Word.'
              : 'Kunne ikke lese PDF-en. Prøv bilde/screenshot av ukeplanen, eller lagre som Word.',
          );
        }
      } else {
        if (!base64 || base64.length < 100) {
          throw new Error('Dokumentet mangler eller er for lite til å leses.');
        }
        const inlineMime = mime.startsWith('image/') ? mime : 'image/jpeg';
        userParts.push({ inline_data: { mime_type: inlineMime, data: base64 } });

        // Lekseplan-bilde: OCR → lokal LESING/REGNING/SKRIVING-parser (unngår tom JSON-vision).
        if (homeworkFocus && apiKey) {
          try {
            console.warn('[aiImportPlan] homework image OCR start');
            const ocrText = await ocrHomeworkDocumentText({
              apiKey,
              userParts,
              fileKind,
            });
            if (ocrText.length >= 20) {
              documentText = ocrText;
              homeworkTextFallback = homeworkSuggestionsFromText(ocrText);
              weeklyInfoFallback = normalizeWeeklyInfoSuggestions(parseWeeklyInfoText(ocrText));
              // Gi også OCR-tekst til senere Gemini-kall (billigere/mer stabilt).
              userParts.push({ text: `OCR-tekst fra dokumentet:\n${ocrText.slice(0, 12000)}` });
              console.warn('[aiImportPlan] homework OCR hits', {
                textLen: ocrText.length,
                homework: homeworkTextFallback.length,
                weekly: weeklyInfoFallback.length,
              });
            }
          } catch (ocrErr) {
            console.warn('[aiImportPlan] homework OCR failed', ocrErr?.message);
          }
        }
      }

      userPartsForFallback = userParts;

      const systemPrompt = homeworkFocus ? COMPACT_HOMEWORK_PROMPT : IMPORT_PROMPT;
      const weeklyInfoDoc = looksLikeWeeklyInfoPlan(documentText, positionedItems)
        || weeklyInfoFallback.length >= 2;
      // Bilder uten OCR-tekst: anta ukeinfo/leksetabell når filnavn/hint tyder på det,
      // eller når vi ikke allerede har timeplan-treff — prøves i compact-retry.
      const imageLikelyWeeklyInfo = !documentText
        && (fileKind === 'image' || String(fileName || '').match(/lekse|ukeinfo|husk/i));

      // Tydelig timeplan/lekseplan/ukeinfo i PDF/Word: stol på lokal parse (unngår Gemini-timeout → 500).
      if (homeworkFocus && (homeworkTextFallback.length >= 1 || weeklyInfoFallback.length >= 2)) {
        const merged = dedupeSuggestions([
          ...homeworkTextFallback,
          ...weeklyInfoFallback,
        ]).slice(0, AI_LIMITS.maxSuggestions);
        parsed = buildImportResult(
          {
            documentType: weeklyInfoFallback.length >= 2 ? 'weekly_info' : 'homework',
            summary: 'Lekser og huskelapper lest fra dokumentet.',
          },
          merged,
        );
        engine = 'local';
      } else if (!homeworkFocus && textFallbackSuggestions.length >= 3) {
        parsed = buildImportResult(
          { documentType: 'schedule', summary: 'Timeplan lest fra dokumentet.' },
          textFallbackSuggestions.slice(0, AI_LIMITS.maxSuggestions),
        );
        engine = 'local';
      } else if (!homeworkFocus && weeklyInfoFallback.length >= 2) {
        parsed = buildWeeklyInfoResult(
          weeklyInfoFallback.slice(0, AI_LIMITS.maxSuggestions),
          documentText,
        );
        engine = 'local';
      } else {
        let result;
        try {
          // Lekseplan: start med kompakt prompt (raskere) — full prompt kun som fallback.
          result = await analyzePlanWithGemini({
            apiKey,
            userParts,
            systemPrompt,
            fileKind: pdfSentAsText ? 'text' : fileKind,
            homeworkFocus,
          });
        } catch (firstErr) {
          console.warn('[aiImportPlan] primary vision failed, retrying', firstErr?.message);
          if (homeworkFocus) {
            try {
              result = await analyzePlanWithGeminiHomeworkLines({
                apiKey,
                userParts: userPartsForFallback,
                fileKind: pdfSentAsText ? 'text' : fileKind,
              });
            } catch (lineErr) {
              console.warn('[aiImportPlan] homework line retry failed', lineErr?.message);
              result = await analyzePlanWithGemini({
                apiKey,
                userParts,
                systemPrompt: HOMEWORK_IMPORT_PROMPT,
                fileKind: pdfSentAsText ? 'text' : fileKind,
                homeworkFocus: true,
              });
            }
          } else {
            result = await analyzePlanWithGemini({
              apiKey,
              userParts,
              systemPrompt: (weeklyInfoDoc || imageLikelyWeeklyInfo
                ? COMPACT_WEEKLY_INFO_PROMPT
                : COMPACT_TIMETABLE_PROMPT),
              fileKind: pdfSentAsText ? 'text' : fileKind,
              homeworkFocus,
            });
          }
        }

        if (!result.suggestions.length && homeworkFocus) {
          parsed = await resolveEmptyHomeworkImport({
            apiKey,
            userParts,
            userPartsForFallback,
            fileKind,
            pdfSentAsText,
            documentText,
            homeworkTextFallback,
            weeklyInfoFallback,
          });
        } else if (!result.suggestions.length && !homeworkFocus && textFallbackSuggestions.length) {
          parsed = buildImportResult(
            { documentType: 'schedule', summary: 'Timeplan lest fra dokumenttekst.' },
            textFallbackSuggestions,
          );
        } else if (!result.suggestions.length && !homeworkFocus && weeklyInfoFallback.length) {
          parsed = buildWeeklyInfoResult(weeklyInfoFallback, documentText);
        } else if (!result.suggestions.length && !homeworkFocus) {
          console.warn('[aiImportPlan] empty suggestions, retrying compact prompt');
          const retryPrompt = (weeklyInfoDoc || imageLikelyWeeklyInfo)
            ? COMPACT_WEEKLY_INFO_PROMPT
            : COMPACT_TIMETABLE_PROMPT;
          const retry = await analyzePlanWithGemini({
            apiKey,
            userParts,
            systemPrompt: retryPrompt,
            fileKind: pdfSentAsText ? 'text' : fileKind,
          });
          if (retry.suggestions.length) {
            parsed = buildImportResult(
              (weeklyInfoDoc || imageLikelyWeeklyInfo || retry.raw?.documentType === 'weekly_info')
                ? { ...retry.raw, documentType: 'weekly_info' }
                : retry.raw,
              retry.suggestions,
            );
          } else if (!weeklyInfoDoc && !imageLikelyWeeklyInfo) {
            // Timeplan tom → prøv lekse-/ukeinfo-prompt før vi gir opp (f.eks. screenshot av «Lekser»).
            console.warn('[aiImportPlan] timetable empty, trying weekly-info compact');
            const weeklyRetry = await analyzePlanWithGemini({
              apiKey,
              userParts,
              systemPrompt: COMPACT_WEEKLY_INFO_PROMPT,
              fileKind: pdfSentAsText ? 'text' : fileKind,
            });
            if (weeklyRetry.suggestions.length) {
              parsed = buildImportResult(
                { ...weeklyRetry.raw, documentType: 'weekly_info' },
                weeklyRetry.suggestions,
              );
            } else {
              console.warn('[aiImportPlan] JSON empty, trying line-format fallback');
              const lineResult = await analyzePlanWithGeminiLines({
                apiKey,
                userParts: userPartsForFallback,
                fileKind: pdfSentAsText ? 'text' : fileKind,
              });
              parsed = buildImportResult(lineResult.raw, lineResult.suggestions);
            }
          } else if (weeklyInfoDoc || imageLikelyWeeklyInfo) {
            console.warn('[aiImportPlan] weekly info JSON empty');
            parsed = buildImportResult({ documentType: 'weekly_info' }, []);
          } else {
            console.warn('[aiImportPlan] JSON empty, trying line-format fallback');
            const lineResult = await analyzePlanWithGeminiLines({
              apiKey,
              userParts: userPartsForFallback,
              fileKind: pdfSentAsText ? 'text' : fileKind,
            });
            parsed = buildImportResult(lineResult.raw, lineResult.suggestions);
          }
        } else {
          parsed = buildImportResult(
            homeworkFocus ? { ...result.raw, documentType: 'homework' } : result.raw,
            result.suggestions,
          );
        }
        engine = 'gemini';
      }
    } catch (e) {
      console.warn('[aiImportPlan] vision failed', e?.message);
      if (apiKey && homeworkFocus) {
        try {
          const lineResult = await analyzePlanWithGeminiHomeworkLines({
            apiKey,
            userParts: userPartsForFallback || [{ text: 'Les lekseplanen i dokumentet.' }],
            fileKind: fileKindForFallback,
          });
          if (lineResult.suggestions.length) {
            parsed = buildImportResult(lineResult.raw, lineResult.suggestions);
            engine = 'gemini';
          } else if (documentText?.trim()) {
            const localHomework = dedupeSuggestions(
              parseHomeworkText(documentText).map((item, idx) => normalizeSuggestion(item, idx, { homeworkFocus: true })),
            );
            if (localHomework.length) {
              parsed = buildImportResult(
                { documentType: 'homework', summary: 'Lekser lest fra dokumenttekst.' },
                localHomework,
              );
              engine = 'local';
            } else {
              throw e;
            }
          } else {
            throw e;
          }
        } catch (lineErr) {
          console.warn('[aiImportPlan] homework line fallback failed', lineErr?.message);
          parsed = {
            ...localImportFallback(false),
            summary: friendlyGeminiError(e),
            parseError: true,
          };
          engine = 'fallback';
        }
      } else if (apiKey && !homeworkFocus) {
        try {
          const localWeekly = normalizeWeeklyInfoSuggestions([
            ...parseWeeklyInfoText(documentText),
          ]);
          if (localWeekly.length >= 2) {
            parsed = buildWeeklyInfoResult(localWeekly, documentText);
            engine = 'local';
          } else {
            const lineResult = await analyzePlanWithGeminiLines({
              apiKey,
              userParts: userPartsForFallback || [{ text: 'Les timeplanen i dokumentet.' }],
              fileKind: fileKindForFallback,
            });
            if (lineResult.suggestions.length) {
              parsed = buildImportResult(lineResult.raw, lineResult.suggestions);
              engine = 'gemini';
            } else {
              throw e;
            }
          }
        } catch (lineErr) {
          console.warn('[aiImportPlan] line fallback failed', lineErr?.message);
          const localWeekly = normalizeWeeklyInfoSuggestions(parseWeeklyInfoText(documentText));
          if (localWeekly.length) {
            parsed = buildWeeklyInfoResult(localWeekly, documentText);
            engine = 'local';
          } else {
            parsed = {
              ...localImportFallback(false),
              summary: friendlyGeminiError(e),
              parseError: true,
            };
            engine = 'fallback';
          }
        }
      } else {
        parsed = {
          ...localImportFallback(false),
          summary: friendlyGeminiError(e),
          parseError: true,
        };
        engine = 'fallback';
      }
    }
  }

  if (homeworkFocus && Array.isArray(parsed?.suggestions)) {
    const rawSuggestions = parsed.suggestions;
    let shaped = applyHomeworkFocusToSuggestions(rawSuggestions);
    if (!shaped.length && rawSuggestions.length > 0) {
      const salvaged = applyHomeworkFocusToSuggestions(
        rawSuggestions.filter((item) => isHomeworkLikeSuggestion(item)),
      );
      if (salvaged.length) {
        shaped = salvaged;
        parsed = { ...parsed, summary: 'Lekser hentet fra dokumentet.' };
      } else if (documentText.trim()) {
        const localHomework = dedupeSuggestions(
          parseHomeworkText(documentText).map((item, idx) => normalizeSuggestion(item, idx, { homeworkFocus: true })),
        );
        if (localHomework.length) {
          shaped = localHomework;
          parsed = { ...parsed, summary: 'Lekser lest fra dokumenttekst.' };
        }
      }
    }
    parsed = buildImportResult(
      { ...parsed, documentType: 'homework' },
      shaped,
    );
  }

  // Tell kun når vi faktisk fullførte en analyse-runde (ikke ved hard throw før dette).
  // Mislykket Gemini (fallback) teller heller ikke — ellers brennes dagsgrensen på modellfeil.
  if (engine === 'gemini' || engine === 'local') {
    await incrementUsage(db, familyId, uid, 'import');
  }

  const draftRef = db.collection('families').doc(familyId)
    .collection('children').doc(childId)
    .collection('aiDrafts').doc();

  const expiresAt = new Date(Date.now() + AI_LIMITS.draftTtlMs);

  await draftRef.set({
    type: parsed.documentType,
    status: 'pending',
    weekNumber: parsed.weekNumber,
    period: parsed.period || defaultPeriod(),
    summary: parsed.summary,
    suggestions: parsed.suggestions,
    storagePath: storagePath || null,
    imageInline: !!imageBase64,
    childName: childName || null,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    usedFallback: !!parsed.usedFallback,
    engine,
    parseError: !!parsed.parseError,
    focusMode: homeworkFocus ? 'homework' : null,
  });

  return {
    draftId: draftRef.id,
    ...parsed,
    engine,
    expiresAt: expiresAt.toISOString(),
    limits: {
      importsRemainingHint: AI_LIMITS.importsPerFamilyPerDay,
    },
  };
}

const DEFAULT_SLOTS = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00',
];

function emptyTimetable() {
  const t = {};
  ['mon', 'tue', 'wed', 'thu', 'fri'].forEach((d) => {
    t[d] = DEFAULT_SLOTS.map((time) => ({ time, subject: '' }));
  });
  return t;
}

export async function handleApplyAiImport(data, auth) {
  const uid = auth?.uid;
  const familyId = String(data?.familyId || '').trim();
  const childId = String(data?.childId || '').trim();
  const draftId = String(data?.draftId || '').trim();
  const selectedIds = Array.isArray(data?.selectedIds) ? data.selectedIds : null;
  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : null;
  const addToParentCalendar = data?.addToParentCalendar === true;
  const period = normalizePeriod(data?.period);

  if (!uid || !familyId || !childId || !draftId) {
    throw new Error('Mangler utkast.');
  }

  const db = getFirestore();
  await assertFamilyAdult(db, uid, familyId);

  const draftRef = db.doc(`families/${familyId}/children/${childId}/aiDrafts/${draftId}`);
  const draftSnap = await draftRef.get();
  if (!draftSnap.exists) throw new Error('Utkastet finnes ikke lenger.');
  const draft = draftSnap.data();
  const isHomeworkDraft = isHomeworkFocusMode(draft.focusMode)
    || draft.type === 'homework'
    || draft.type === 'weekly_info';
  if (draft.status !== 'pending') throw new Error('Utkastet er allerede behandlet.');
  const expiresAt = draft.expiresAt?.toDate?.() || (draft.expiresAt ? new Date(draft.expiresAt) : null);
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    await deleteStorageObject(draft.storagePath);
    await draftRef.update({ status: 'expired', expiredAt: FieldValue.serverTimestamp() });
    throw new Error('Utkastet har utløpt. Ta et nytt bilde og prøv igjen.');
  }

  const items = (suggestions || draft.suggestions || []).filter((s) => {
    if (selectedIds) return selectedIds.includes(s.id) && s.selected !== false;
    return s.selected !== false;
  });

  let todosCreated = 0;
  let eventsCreated = 0;
  let scheduleUpdated = false;

  const scheduleRef = db.doc(`families/${familyId}/children/${childId}/meta/schedule`);
  const existingSchedule = await scheduleRef.get();
  const existingTimetable = existingSchedule.exists ? (existingSchedule.data()?.timetable || null) : null;
  const timetable = existingTimetable && typeof existingTimetable === 'object'
    ? JSON.parse(JSON.stringify(existingTimetable))
    : emptyTimetable();
  // Sørg for at ukedager finnes
  ['mon', 'tue', 'wed', 'thu', 'fri'].forEach((d) => {
    if (!Array.isArray(timetable[d])) timetable[d] = DEFAULT_SLOTS.map((time) => ({ time, subject: '' }));
  });
  let hasScheduleSlots = false;

  for (const item of items) {
    let kind = item.kind;
    if (kind === 'event' && looksLikeHomework(item) && !item.time) {
      kind = isHomeworkDraft ? 'homework' : 'todo';
    }
    if (kind === 'event' && !item.time && !looksLikeCalendarEvent(item) && !looksLikeLesson(item)) {
      kind = isHomeworkDraft ? 'homework' : 'todo';
    }
    if (isHomeworkItem(item, isHomeworkDraft)) kind = 'homework';

    if (kind === 'homework') {
      const due = item.dateHint && /^\d{4}-\d{2}-\d{2}$/.test(String(item.dateHint))
        ? String(item.dateHint)
        : fridayOfWeekContaining(new Date());
      const start = mondayOfWeekContaining(due);
      const homeworkDoc = {
        title: item.title,
        description: item.description || '',
        subject: resolveHomeworkSubjectId(item.subject, item.title),
        dueDate: due,
        startKey: start,
        assignedTo: childId,
        attachments: [],
        done: false,
        completedDates: [],
        active: true,
        deleted: false,
        source: 'ai_import',
        aiDraftId: draftId,
        childId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      await db.collection('families').doc(familyId)
        .collection('children').doc(childId)
        .collection('homework').add(homeworkDoc);
      todosCreated += 1;
    } else if (kind === 'todo') {
      const category = item.category === 'lekse'
        ? 'lekser'
        : (item.category || (looksLikeHomework(item) ? 'lekser' : 'gjøremål'));
      const points = Math.min(50, Math.max(0, Number(item.points) || 5));

      let type = ['once', 'daily', 'weekly'].includes(item.type) ? item.type : 'weekly';
      const days = item.daysOfWeek?.length
        ? item.daysOfWeek
        : (item.day && DAY_JS[item.day] != null ? [DAY_JS[item.day]] : (type === 'weekly' ? [1, 2, 3, 4, 5] : []));

      const todoDoc = {
        title: item.title,
        description: item.description || '',
        type,
        rewardType: 'points',
        points,
        value: points,
        moneyValue: 0,
        category,
        completedDates: [],
        attestedDates: {},
        active: true,
        daysOfWeek: days,
        iconFile: 'read-book.png',
        order: Date.now(),
        source: 'ai_import',
        aiDraftId: draftId,
        createdAt: FieldValue.serverTimestamp(),
      };

      if (item.dateHint && /^\d{4}-\d{2}-\d{2}$/.test(String(item.dateHint))) {
        todoDoc.dueDate = String(item.dateHint);
      }

      await db.collection('families').doc(familyId)
        .collection('children').doc(childId)
        .collection('todos').add(todoDoc);
      todosCreated += 1;
    } else if (kind === 'event') {
      const withPeriod = {
        ...item,
        recurrenceWeeks: item.recurrenceWeeks || period.weeks || DEFAULT_SCHEDULE_PERIOD_WEEKS,
      };
      const payload = buildEventPayload(withPeriod, draftId, childId, uid, addToParentCalendar, period);
      await db.collection('families').doc(familyId).collection('events').add(payload);
      eventsCreated += 1;
    } else if (kind === 'schedule_slot' && item.day && (item.subject || item.title)) {
      // Lekseplan/ukeinfo uten klokkeslett skal aldri overskrive eksisterende timeplan.
      if (isHomeworkDraft) continue;
      hasScheduleSlots = true;
      const day = item.day;
      const subject = item.subject || item.title;
      const time = item.time || '08:00';
      const endTime = item.endTime || null;
      if (!timetable[day]) timetable[day] = [];
      const existing = timetable[day].find((s) => s.time === time);
      if (existing) {
        existing.subject = subject;
        if (endTime) existing.endTime = endTime;
      } else {
        timetable[day].push({ time, endTime, subject });
        timetable[day].sort((a, b) => a.time.localeCompare(b.time));
      }
      // Timeplan ligger i ukeplanen — speiles ikke inn i familiekalenderen.
    }
  }

  if (hasScheduleSlots) {
    const startKey = period.startDate || dateKeyFromDate(new Date());
    const untilKey = resolveRecurrenceUntilKey(startKey, {
      recurrenceWeeks: period.weeks || DEFAULT_SCHEDULE_PERIOD_WEEKS,
    }, period);
    const appliedPeriod = {
      kind: period.kind,
      weeks: period.weeks || DEFAULT_SCHEDULE_PERIOD_WEEKS,
      startDate: startKey,
      endDate: period.endDate || untilKey,
      label: period.label || (period.weeks === 1 ? '1 uke' : 'Ett semester'),
    };

    // Behold historikk: tidligere planer utenfor den nye perioden forblir synlige ved uke-blaing.
    const existing = existingSchedule.exists ? (existingSchedule.data() || {}) : {};
    const prevPlans = Array.isArray(existing.plans) ? existing.plans : [];
    const legacyPlan = (!prevPlans.length && existing.timetable)
      ? [{
        id: 'legacy',
        timetable: existing.timetable,
        period: existing.period || null,
        source: existing.lastAiImport ? 'ai_import' : 'manual',
      }]
      : [];
    const basePlans = prevPlans.length ? prevPlans : legacyPlan;
    const nextPlan = {
      id: `ai_${draftId}`,
      timetable,
      period: appliedPeriod,
      source: 'ai_import',
      label: appliedPeriod.label,
    };
    const kept = basePlans.filter((p) => {
      if (!p?.period?.startDate || !appliedPeriod.startDate) return p?.id !== nextPlan.id;
      const a0 = appliedPeriod.startDate;
      const a1 = appliedPeriod.endDate || a0;
      const b0 = p.period.startDate;
      const b1 = p.period.endDate || b0;
      return !(a0 <= b1 && b0 <= a1);
    });

    await scheduleRef.set({
      mode: 'manual',
      timetable,
      period: appliedPeriod,
      plans: [...kept, nextPlan],
      updatedAt: FieldValue.serverTimestamp(),
      lastAiImport: draftId,
    }, { merge: true });
    scheduleUpdated = true;
  }

  await draftRef.update({
    status: 'approved',
    approvedBy: uid,
    approvedAt: FieldValue.serverTimestamp(),
    appliedPeriod: period,
    applied: { todosCreated, eventsCreated, scheduleUpdated, addToParentCalendar },
  });

  await deleteStorageObject(draft.storagePath);

  return {
    ok: true,
    todosCreated,
    eventsCreated,
    scheduleUpdated,
    addToParentCalendar,
  };
}

export async function handleDiscardAiImport(data, auth) {
  const uid = auth?.uid;
  const familyId = String(data?.familyId || '').trim();
  const childId = String(data?.childId || '').trim();
  const draftId = String(data?.draftId || '').trim();

  if (!uid || !familyId || !childId || !draftId) {
    throw new Error('Mangler utkast.');
  }

  const db = getFirestore();
  await assertFamilyAdult(db, uid, familyId);

  const draftRef = db.doc(`families/${familyId}/children/${childId}/aiDrafts/${draftId}`);
  const draftSnap = await draftRef.get();
  if (!draftSnap.exists) return { ok: true };
  const draft = draftSnap.data();

  await deleteStorageObject(draft.storagePath);
  await draftRef.update({
    status: 'rejected',
    rejectedBy: uid,
    rejectedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
}
