/** Server helpers for lekseplan-import (AI-read, not timetable). */

const SUBJECT_NAMES = [
  'norsk', 'matematikk', 'matte', 'regning', 'engelsk', 'naturfag', 'samfunnsfag',
  'kunst og håndverk', 'kunst', 'musikk', 'kroppsøving', 'krle', 'mat og helse',
  'morgensamling', 'lesing', 'skriving', 'lese', 'historie', 'geografi', 'tysk', 'spansk',
  'programmering', 'fyfo', 'fysikk', 'religion', 'dans', 'drama', 'k&h',
];

/** Radetiketter i typiske LEKSEPLAN-tabeller (ofte uten kolon). */
const LEKSEPLAN_ROW_LABELS = [
  'lesing', 'regning', 'skriving', 'lese', 'norsk', 'matte', 'matematikk', 'engelsk',
  'naturfag', 'samfunnsfag', 'musikk', 'krle',
];

const SUBJECT_LINE_RE = new RegExp(
  `^(${SUBJECT_NAMES.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*[:\\-–—|]?\\s*(.+)$`,
  'i',
);

/**
 * Radetikett øverst på linje. HUSK krever «!» eller «:» / tom rest —
 * ellers matcher «Husk å følg kriterielisten» (fortsettelse av REGNING) feilaktig.
 */
const LEKSEPLAN_ROW_RE = new RegExp(
  `^((?:${LEKSEPLAN_ROW_LABELS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})|husk!)\\s*[:\\-–—|]?\\s*(.*)$`
  + `|^husk\\s*:\\s*(.+)$`
  + `|^husk\\s*$`,
  'i',
);

/** «Husk å …» midt i oppgavetekst — ikke HUSK-rad. */
const HUSK_CONTINUATION_RE = /^husk\s+å\b/i;

const HOMEWORK_HINT_RE = /oppgave|les\s+(teksten|side|kap|\d+\s*min)|skriv|øv(e)?\b|gåte|gloser|glosene|arbeidsark|læringsmål|lese\s+ord|alfabet|formel|øving|mønster|tekst\b|stave|regne|tall|figur|lever|innlever|forbered|repeter|øvingsark|hjemme(arbeid)?|kapittel|glose|staveord|multiplikasjon|divisjon|brøk|gjør arket|gjør oppgavene|ukas grej|nivåene|rektors?\s+quiz|classroom|leksebok|kriterielisten|hel setning|valgfri/i;

const TIMETABLE_NOISE_RE = /^\d\.?\s*økt|^\d{1,2}[.:]\d{2}\s*[-–]|^(mandag|tirsdag|onsdag|torsdag|fredag)(\s|$)|friminutt|spising|matpause|skole(start|slutt)|lunsj\b|^1\.?\s*(økt|time)|^ET\s*=|^HE\s*=|^KY\s*=|tipple|eltervåg|ystaas|soma/i;

const SECTION_START_RE = /^(lekser?|lekseplan|læringsmål|oppgaver|hjemme(arbeid|oppgaver)?|ukens\s+lekser|arbeidsark|forberede|til\s+neste\s+time)/i;

function pad(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function dateKeyFromDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Mandag i uken som inneholder dateKey (eller i dag). */
function mondayOfWeekContaining(ref = new Date()) {
  const d = new Date(ref);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  return dateKeyFromDate(addDays(d, diff));
}

/** Fredag i samme uke (typisk leksefrist). */
export function fridayOfWeekContaining(ref = new Date()) {
  const mon = mondayOfWeekContaining(ref);
  const [y, m, day] = mon.split('-').map(Number);
  return dateKeyFromDate(addDays(new Date(y, m - 1, day), 4));
}

/** Fredag i ISO-ukenummer for inneværende år (fallback når dokument kun sier «uke 34»). */
export function fridayOfIsoWeek(weekNumber, refYear = new Date().getFullYear()) {
  const week = Math.min(53, Math.max(1, Number(weekNumber) || 1));
  const jan4 = new Date(refYear, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const week1Monday = addDays(jan4, 1 - dayOfWeek);
  const targetMonday = addDays(week1Monday, (week - 1) * 7);
  return dateKeyFromDate(addDays(targetMonday, 4));
}

export function extractWeekNumberFromText(text) {
  const m = String(text || '').match(/\buke\s*(\d{1,2})\b/i);
  return m ? Number(m[1]) : null;
}

/** Årstall fra «uke 36 2026» / «uke 36, 2026» / dokumentår. */
export function extractYearFromHomeworkText(text) {
  const s = String(text || '');
  const withWeek = s.match(/\buke\s*\d{1,2}\s*[,.\-]?\s*(20\d{2})\b/i);
  if (withWeek) return Number(withWeek[1]);
  const anyYear = s.match(/\b(20\d{2})\b/);
  return anyYear ? Number(anyYear[1]) : new Date().getFullYear();
}

export function resolveHomeworkDueDate(text) {
  const weekNumber = extractWeekNumberFromText(text);
  const year = extractYearFromHomeworkText(text);
  if (weekNumber) return fridayOfIsoWeek(weekNumber, year);
  return fridayOfWeekContaining();
}

/**
 * Torsdag (eller angitt ukedag) i ISO-uke – for «ferdig til torsdag» i lekseplan.
 */
export function weekdayOfIsoWeek(weekNumber, weekdayIndex, refYear = new Date().getFullYear()) {
  // weekdayIndex: 0=man … 4=fre
  const week = Math.min(53, Math.max(1, Number(weekNumber) || 1));
  const dayOffset = Math.min(4, Math.max(0, Number(weekdayIndex) || 4));
  const jan4 = new Date(refYear, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const week1Monday = addDays(jan4, 1 - dayOfWeek);
  const targetMonday = addDays(week1Monday, (week - 1) * 7);
  return dateKeyFromDate(addDays(targetMonday, dayOffset));
}

/** Map radetiketter / alias til fag som brukes i app. */
function normalizeSubjectAlias(name) {
  const s = String(name || '').trim().toLowerCase();
  if (!s) return s;
  if (/^(matte|regning|matematikk)$/.test(s)) return 'Matematikk';
  if (/^(lesing|lese|skriving)$/.test(s)) return 'Norsk';
  if (/^krle$/.test(s)) return 'KRLE';
  if (/^k&h$/.test(s)) return 'Kunst og håndverk';
  if (/^husk!?$/.test(s)) return 'Annet';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function capitalizeSubject(name) {
  return normalizeSubjectAlias(name);
}

function guessSubjectFromTitle(title) {
  const lower = String(title || '').toLowerCase();
  for (const name of SUBJECT_NAMES) {
    if (lower.startsWith(name) || lower.includes(`${name}:`)) {
      return capitalizeSubject(name);
    }
  }
  return null;
}

function isMeaningfulHomeworkTask(task) {
  const t = String(task || '').trim();
  if (!t || t.length < 4) return false;
  if (TIMETABLE_NOISE_RE.test(t)) return false;
  // Unngå rene fag-rader i timeplan («NORSK MATTE ENGELSK»)
  if (/^(norsk|matte|matematikk|regning|engelsk|naturfag|samfunnsfag|musikk|krle|lesing|skriving)(\s+(norsk|matte|matematikk|regning|engelsk|naturfag|samfunnsfag|musikk|krle|lesing|skriving))*$/i.test(t)) {
    return false;
  }
  if (HOMEWORK_HINT_RE.test(t)) return true;
  return t.split(/\s+/).length >= 3 || t.length >= 18;
}

function looksLikeHomeworkLine(line) {
  const s = String(line || '').trim();
  if (!s || s.length < 4) return false;
  if (TIMETABLE_NOISE_RE.test(s)) return false;
  if (SUBJECT_LINE_RE.test(s)) {
    const m = s.match(SUBJECT_LINE_RE);
    const rest = m ? s.slice(m[0].length).trim() : '';
    if (rest && !isMeaningfulHomeworkTask(rest) && !HOMEWORK_HINT_RE.test(s)) return false;
    return true;
  }
  if (LEKSEPLAN_ROW_RE.test(s) && !/^husk/i.test(s)) {
    const m = s.match(LEKSEPLAN_ROW_RE);
    return isMeaningfulHomeworkTask(m?.[2] || '');
  }
  if (HOMEWORK_HINT_RE.test(s)) return true;
  return false;
}

/** Gjenkjenn lekse-lignende AI-forslag (også feilklassifisert timeplan). */
export function isHomeworkLikeSuggestion(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.kind === 'homework') return true;
  if (String(raw.category || '').toLowerCase() === 'lekser') return true;
  if (raw.kind === 'todo' && raw.type === 'once') return true;
  const title = String(raw.title || raw.subject || '').trim();
  const desc = String(raw.description || '').trim();
  const blob = `${title} ${desc}`;
  if (SUBJECT_LINE_RE.test(title)) return true;
  if (HOMEWORK_HINT_RE.test(blob)) return true;
  return false;
}

/**
 * OCR limer ofte hele tabellen til én/få linjer. Sett radetiketter på egen linje
 * så lokal parse finner LESING/REGNING/SKRIVING/HUSK!.
 */
export function normalizeLekseplanOcrText(text) {
  let s = String(text || '').replace(/\r\n/g, '\n');
  if (!s.trim()) return '';

  // Fag-rader midt i tekstblokk
  s = s.replace(/\b(LESING|REGNING|SKRIVING)\b/gi, '\n$1');
  // HUSK! (radetikett) — ikke «Husk å …» / «Husk: Gymtøy» midt i setning uten !
  s = s.replace(/\bHUSK!/gi, '\nHUSK!');
  // Dag-headere (ALL CAPS kolonner) pakket sammen — ikke «til torsdag» midt i setning
  s = s.replace(
    /(?!\n)(?<=\S)\s+(MANDAG|TIRSDAG|ONSDAG|TORSDAG|FREDAG)(?=\s|$)/g,
    '\n$1',
  );

  return s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

/** Del HUSK-tekst på klasseblokker uten å knekke «7A og 7B:». */
export function splitHuskClassBlocks(huskText) {
  const raw = String(huskText || '').trim();
  if (!raw) return [];
  const re = /\b(\d[A-C]{1,3}(?:\s*(?:,|og)\s*\d[A-C]{1,3})*)\s*:/gi;
  const matches = [...raw.matchAll(re)];
  if (matches.length <= 1) return [raw];
  const parts = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length;
    const chunk = raw.slice(start, end).trim();
    if (chunk.length >= 6) parts.push(chunk);
  }
  return parts.length ? parts : [raw];
}

function matchLekseplanRow(line) {
  const s = String(line || '').trim();
  if (!s || HUSK_CONTINUATION_RE.test(s)) return null;

  const m = s.match(LEKSEPLAN_ROW_RE);
  if (!m) return null;

  // Alt 1: fag-rad eller HUSK! → groups 1–2. Alt 2: Husk: … → group 3. Alt 3: HUSK alene.
  if (m[1] != null) {
    return {
      label: String(m[1]).toLowerCase().replace(/!$/, ''),
      rest: String(m[2] || '').trim(),
    };
  }
  if (m[3] != null) {
    return { label: 'husk', rest: String(m[3] || '').trim() };
  }
  if (/^husk\s*$/i.test(s)) {
    return { label: 'husk', rest: '' };
  }
  return null;
}

/**
 * Parse LEKSEPLAN-tabeller (LESING/REGNING/SKRIVING + HUSK) med sammenslåtte ukeceller.
 * Typisk Sande/barneskole: fag-rad over Mandag–Torsdag uten klokkeslett.
 */
export function parseLekseplanTableText(text) {
  const raw = normalizeLekseplanOcrText(text);
  if (!raw.trim()) return [];

  const weekNumber = extractWeekNumberFromText(raw);
  const year = extractYearFromHomeworkText(raw);
  const defaultDue = weekNumber
    ? fridayOfIsoWeek(weekNumber, year)
    : fridayOfWeekContaining();

  // Frist «til torsdag» → torsdag i uken; ellers fredag.
  const dueForTask = (taskText) => {
    const t = String(taskText || '');
    if (/til\s+torsdag|før\s+torsdag|ferdig\s+.*torsdag/i.test(t) && weekNumber) {
      return weekdayOfIsoWeek(weekNumber, 3, year);
    }
    return defaultDue;
  };

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const suggestions = [];
  const seen = new Set();

  const pushHw = (label, task) => {
    const subjectLabel = capitalizeSubject(label);
    const body = String(task || '').trim().replace(/\s+/g, ' ');
    if (!isMeaningfulHomeworkTask(body)) return;
    const title = `${subjectLabel}: ${body}`.slice(0, 120);
    const key = title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push({
      kind: 'homework',
      title,
      description: body.slice(0, 400),
      subject: resolveHomeworkSubjectId(subjectLabel, title),
      type: 'once',
      category: 'lekser',
      confidence: 0.88,
      dateHint: dueForTask(body),
    });
  };

  const pushHusk = (chunk) => {
    const body = String(chunk || '').trim().replace(/\s+/g, ' ');
    if (!body || body.length < 6) return;
    // Hopp over ren sticky-note «Husk!» uten innhold
    if (/^husk!?\.?$/i.test(body)) return;
    const key = `husk:${body.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    let day = null;
    if (/tirsdag|\btir\b/i.test(body)) day = 'tue';
    else if (/onsdag|\bons\b/i.test(body)) day = 'wed';
    else if (/torsdag|\btor\b/i.test(body)) day = 'thu';
    else if (/fredag|\bfre\b/i.test(body)) day = 'fri';
    else if (/mandag|\bman\b/i.test(body)) day = 'mon';
    const dayIdx = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4 }[day];
    const dateHint = (weekNumber != null && dayIdx != null)
      ? weekdayOfIsoWeek(weekNumber, dayIdx, year)
      : defaultDue;
    const isPrep = /gym|svøm|badetøy|gymtøy|håndkle|badehette/i.test(body);
    suggestions.push({
      kind: 'todo',
      title: body.slice(0, 120),
      description: body.slice(0, 400),
      type: 'once',
      category: 'gjøremål',
      day,
      dateHint,
      confidence: 0.86,
      prepTask: isPrep,
      prepWhen: isPrep ? 'morning' : null,
    });
  };

  // Samle tekst under hver radetikett (støtter både «LESING Tekst…» og «LESING\nTekst…»).
  let currentLabel = null;
  let currentBuf = [];
  let inHusk = false;
  let huskBuf = [];

  const flushRow = () => {
    if (inHusk) {
      const huskText = huskBuf.join(' ').trim();
      if (huskText) {
        const parts = splitHuskClassBlocks(huskText);
        if (parts.length > 1) parts.forEach(pushHusk);
        else pushHusk(huskText);
      }
      huskBuf = [];
      inHusk = false;
      return;
    }
    if (currentLabel && currentBuf.length) {
      pushHw(currentLabel, currentBuf.join(' '));
    }
    currentLabel = null;
    currentBuf = [];
  };

  for (const line of lines) {
    if (/^(mandag|tirsdag|onsdag|torsdag|fredag)(\s|$)/i.test(line)
      && !HOMEWORK_HINT_RE.test(line)
      && line.split(/\s+/).length <= 6) {
      continue; // dag-header
    }
    if (/^navn\s*:/i.test(line) || /^respekt$/i.test(line)) continue;
    // RESPEKT-boks / verditekst øverst — ikke lekse
    if (/^det er når vi viser hensyn/i.test(line)) continue;

    const row = matchLekseplanRow(line);
    if (row) {
      // «Husk å følg …» mens vi er midt i fag-rad → fortsettelse, ikke ny HUSK-rad
      if (row.label === 'husk' && currentLabel && HUSK_CONTINUATION_RE.test(line)) {
        currentBuf.push(line);
        continue;
      }
      flushRow();
      if (row.label === 'husk') {
        inHusk = true;
        if (row.rest) huskBuf.push(row.rest);
      } else {
        currentLabel = row.label;
        if (row.rest) currentBuf.push(row.rest);
      }
      continue;
    }

    // Fortsettelse: «Husk å følg kriterielisten» under REGNING
    if (currentLabel && HUSK_CONTINUATION_RE.test(line)) {
      currentBuf.push(line);
      continue;
    }

    // Fortsettelse av forrige rad (OCR-linjeskift midt i celletekst)
    if (inHusk) {
      if (!TIMETABLE_NOISE_RE.test(line) || HOMEWORK_HINT_RE.test(line) || /gym|svøm|husk|badetøy/i.test(line)) {
        huskBuf.push(line);
      }
      continue;
    }
    if (currentLabel) {
      if (SECTION_START_RE.test(line) && !matchLekseplanRow(line)) {
        flushRow();
        continue;
      }
      if (TIMETABLE_NOISE_RE.test(line) && !HOMEWORK_HINT_RE.test(line)) {
        flushRow();
        continue;
      }
      if (!/^\d{1,2}[.:]\d{2}/.test(line)) {
        currentBuf.push(line);
      }
    }
  }
  flushRow();

  return suggestions;
}

/**
 * Parse lekser fra ren tekst (PDF/Word/tekst) — samme idé som parseTimetableText for ukeplan.
 */
export function parseHomeworkText(text) {
  const raw = String(text || '');
  if (!raw.trim()) return [];

  // LEKSEPLAN-tabell først (LESING/REGNING/SKRIVING + HUSK).
  const tableHits = parseLekseplanTableText(raw);
  if (tableHits.length >= 2) return tableHits;

  const dateHint = resolveHomeworkDueDate(raw);
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const suggestions = [];
  const seen = new Set();
  let inSection = false;

  const pushSuggestion = (title, subject = null) => {
    const clean = String(title || '').trim().replace(/\s+/g, ' ');
    if (!clean || clean.length < 4) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push({
      kind: 'homework',
      title: clean.slice(0, 120),
      subject: resolveHomeworkSubjectId(subject, clean),
      type: 'once',
      category: 'lekser',
      confidence: 0.82,
      dateHint,
    });
  };

  for (const line of lines) {
    if (TIMETABLE_NOISE_RE.test(line)) {
      inSection = false;
      continue;
    }

    if (SECTION_START_RE.test(line)) {
      inSection = true;
      const afterHeader = line.split(/[:–—]/).slice(1).join(':').trim();
      if (afterHeader && looksLikeHomeworkLine(afterHeader)) {
        pushSuggestion(afterHeader);
      }
      continue;
    }

    const subjectMatch = line.match(SUBJECT_LINE_RE);
    if (subjectMatch) {
      const subject = capitalizeSubject(subjectMatch[1]);
      const task = subjectMatch[2].trim();
      if (isMeaningfulHomeworkTask(task)) {
        pushSuggestion(`${subject}: ${task}`, subject);
      }
      continue;
    }

    // Radetikett uten kolon (LESING / REGNING) — rest av linjen er oppgaven
    const rowMatch = line.match(LEKSEPLAN_ROW_RE);
    if (rowMatch && !/^husk/.test(String(rowMatch[1] || '').toLowerCase())) {
      const subject = capitalizeSubject(rowMatch[1]);
      const task = String(rowMatch[2] || '').trim();
      if (isMeaningfulHomeworkTask(task)) {
        pushSuggestion(`${subject}: ${task}`, subject);
      }
      continue;
    }

    const bullet = line
      .replace(/^\d+[\.)]\s*/, '')
      .replace(/^[-•*]\s*/, '')
      .trim();

    if ((inSection || HOMEWORK_HINT_RE.test(bullet)) && looksLikeHomeworkLine(bullet)) {
      pushSuggestion(bullet);
    }
  }

  // Bland inn tabelltreff hvis linjeparser fant lite
  if (suggestions.length < 2 && tableHits.length) {
    return tableHits;
  }
  if (tableHits.length && suggestions.length) {
    const merged = [...tableHits];
    const keys = new Set(merged.map((s) => String(s.title || '').toLowerCase()));
    for (const s of suggestions) {
      const k = String(s.title || '').toLowerCase();
      if (!keys.has(k)) merged.push(s);
    }
    return merged;
  }

  return suggestions;
}

export const COMPACT_HOMEWORK_PROMPT = `Du leser en norsk LEKSEPLAN / «Lekser»-tabell / arbeidsark fra bilde/PDF.
Vanlige formater:
A) Fag-kolonne + Tirsdag–Fredag
B) LEKSEPLAN med LESING / REGNING / SKRIVING (+ HUSK!) over Mandag–Torsdag — ofte ÉN sammenslått celle for hele uken, uten klokkeslett og uten fredag-kolonne.
Én sammenslått celle = ÉN lekse (ikke én per dag). Ingen klokkeslett.
Returner KUN gyldig JSON:
{
  "documentType": "homework",
  "weekNumber": number | null,
  "summary": "kort norsk oppsummering",
  "period": { "kind": "special", "weeks": 1, "label": "Ukens lekser" },
  "suggestions": [
    { "kind": "homework", "title": "Norsk: Les teksten Elgen", "subject": "Norsk", "type": "once", "category": "lekser", "dateHint": "YYYY-MM-DD", "confidence": 0.9, "description": "kort utdrag" },
    { "kind": "homework", "title": "Matematikk: Gjør oppgavene på ark", "subject": "Matematikk", "type": "once", "category": "lekser", "dateHint": "YYYY-MM-DD", "confidence": 0.9 },
    { "kind": "todo", "title": "Gym tirsdag – husk gymtøy", "type": "once", "category": "gjøremål", "day": "tue", "prepTask": true, "prepWhen": "morning", "dateHint": "YYYY-MM-DD", "confidence": 0.85 }
  ]
}

Regler:
- ALDRI schedule_slot. ALDRI finn på klokkeslett.
- LESING / SKRIVING → subject Norsk. REGNING → Matematikk.
- Fag-rader med sammenslått tekst → kind "homework", type "once", category "lekser". Én per rad.
- «ferdig til torsdag» / «til torsdag» → dateHint = torsdag i uken (bruk uke N + år fra header, f.eks. uke 36 2026). Ellers fredag i uken.
- Rad HUSK! → kind "todo", category "gjøremål", sett day (tue/wed/thu). prepTask true for gym/svøm/badetøy.
- Hopp over tomme/uleselige celler — behold det som er tydelig. Partial OK.
- Lag ALLTID forslag når dokumentet har lekser eller huskelapper.`;

/** Linjeformat når JSON feiler — én lekse per linje, lett å parse. */
export const LINE_HOMEWORK_PROMPT = `Les LEKSEPLAN / «Lekser»-tabellen i dokumentet (ofte LESING/REGNING/SKRIVING + HUSK over Mandag–Torsdag).
Skriv ÉN linje per lekse eller huskelapp i formatet:
kind|title|subject|day|dateHint
kind = homework eller todo. day = mon/tue/wed/thu/fri eller tom. dateHint = YYYY-MM-DD.
Sammenslått celle = ÉN homework-linje. LESING/SKRIVING→Norsk, REGNING→Matematikk.
Eksempel:
homework|Norsk: Les teksten Elgen|Norsk||2026-09-04
homework|Matematikk: Gjør oppgavene på ark|Matematikk||2026-09-04
homework|Norsk: Rektors quiz|Norsk||2026-09-03
todo|Gym tirsdag – husk gymtøy||tue|2026-09-01
Ignorer timeplan med økter/klokkeslett. Hopp over uleselig tekst.
Skriv KUN linjene, ingen annen tekst.`;

/**
 * Ren OCR av lekseplan-bilde — lokal parseHomeworkText er mer pålitelig enn JSON-vision.
 */
export const OCR_LEKSEPLAN_PROMPT = `Du ser et bilde eller skann av en norsk LEKSEPLAN / leksetabell (ofte LESING, REGNING, SKRIVING, HUSK!).
Skriv ut ALL lesbar tekst nøyaktig.
VIKTIG: Start NY linje for hver radetikett: LESING, REGNING, SKRIVING, HUSK!
Behold uketekst («uke 37 2026»), skolenavn og hele oppgavetekster.
«Husk å følg …» midt i en oppgave er IKKE en ny rad — behold den under REGNING/faget.
Ikke oppsummer. Ikke lag JSON. Ikke oversett. Kun ren tekst med linjeskift.`;

/** Parse linjeformat fra LINE_HOMEWORK_PROMPT. */
export function parseHomeworkLines(text) {
  const suggestions = [];
  String(text || '').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim().replace(/^[-*]\s*/, '');
    const parts = trimmed.split('|').map((p) => p.trim());
    if (parts.length < 1) return;

    // Bakoverkompatibelt: title|subject|dateHint
    let kind = 'homework';
    let title;
    let subject;
    let day = null;
    let dateHint = null;
    if (parts[0] === 'homework' || parts[0] === 'todo') {
      kind = parts[0];
      title = parts[1];
      subject = parts[2] || guessSubjectFromTitle(title);
      day = parts[3] || null;
      dateHint = parts[4] && /^\d{4}-\d{2}-\d{2}$/.test(parts[4]) ? parts[4] : null;
    } else {
      title = parts[0];
      subject = parts[1] || guessSubjectFromTitle(title);
      dateHint = parts[2] && /^\d{4}-\d{2}-\d{2}$/.test(parts[2]) ? parts[2] : null;
    }
    if (!title || title.length < 4 || TIMETABLE_NOISE_RE.test(title)) return;
    const isTodo = kind === 'todo' || /husk|svømmetøy|gymtøy|levering|går på tur/i.test(title);
    suggestions.push({
      kind: isTodo ? 'todo' : 'homework',
      title: title.slice(0, 120),
      subject: isTodo ? null : resolveHomeworkSubjectId(subject, title),
      type: 'once',
      category: isTodo ? 'gjøremål' : 'lekser',
      day: day || null,
      dateHint,
      confidence: 0.85,
      prepTask: /svømme|gymtøy|gymsko|badetøy/i.test(title),
      prepWhen: /svømme|gymtøy|gymsko|badetøy/i.test(title) ? 'morning' : null,
    });
  });
  return suggestions;
}

export function isHomeworkFocusMode(value) {
  return String(value || '').trim().toLowerCase() === 'homework';
}

export function homeworkIntroText(childName) {
  return `Analyser denne LEKSEPLANEN / «Lekser»-tabellen for barnet "${childName || 'barn'}". `
    + 'Ofte: LESING, REGNING, SKRIVING (sammenslått Mandag–Torsdag) + HUSK! uten klokkeslett. '
    + 'LESING/SKRIVING → Norsk, REGNING → Matematikk. Én lekse (kind "homework") per fag-rad. '
    + 'dateHint = innleveringsfrist (til torsdag → torsdag; ellers fredag i uken — bruk uke+år fra header). '
    + 'HUSK → kind "todo"/gjøremål med riktig day; prepTask for gym/svøm. '
    + 'ALDRI schedule_slot og ALDRI finn på klokkeslett. Partial OK. '
    + 'Returner strukturert JSON for foreldregodkjenning.';
}

export const HOMEWORK_IMPORT_PROMPT = `Du er ekspert på norske lekseplaner, arbeidsark og ukeinfo til hjemme.
Les dokumentet (bilde, PDF eller tekst) nøye og returner KUN gyldig JSON med denne strukturen:
{
  "documentType": "homework",
  "weekNumber": number | null,
  "period": {
    "kind": "special",
    "weeks": 1,
    "startDate": "YYYY-MM-DD" | null,
    "endDate": "YYYY-MM-DD" | null,
    "label": "Ukens lekser" | null
  },
  "summary": "kort oppsummering på norsk",
  "suggestions": [
    {
      "kind": "homework",
      "title": "kort tittel (fag + oppgave)",
      "description": "valgfri detalj fra arket",
      "confidence": 0.0-1.0,
      "type": "once",
      "daysOfWeek": [],
      "day": null,
      "time": null,
      "endTime": null,
      "subject": "fag"|null,
      "dateHint": "YYYY-MM-DD"|null,
      "recurrenceWeeks": null,
      "category": "lekser",
      "prepTask": false
    }
  ]
}

Regler (strengt):
1) Dette er LEKSER / ukeinfo — ikke timeplan. ALDRI kind "schedule_slot". ALDRI finn på klokkeslett.
2) Tabell «Lekser» med Fag + Tirsdag–Fredag ELLER LEKSEPLAN med LESING/REGNING/SKRIVING over Mandag–Torsdag: sammenslått celle → ÉN homework for faget.
3) LESING / SKRIVING → subject "Norsk". REGNING → "Matematikk".
4) Hver lekse/fag-rad → kind "homework", type "once", category "lekser".
5) Rad «HUSK!» / huskelapper (svømmetøy, gymtøy) → kind "todo", category "gjøremål", sett day. prepTask true for gym/svøm.
6) dateHint = innleveringsfrist. «til torsdag» → torsdag i uken. Bare ukenummer (+år) → fredag i den uken.
7) ALDRI type weekly/daily for lekser.
8) Ikke «løs» leksene — registrer hva barnet skal gjøre.
9) Ignorer timeplan-tabeller med økter og klokkeslett. Ignorer friminutt, lunsj, kontaktinfo.
10) Behold fagnavn i title, f.eks. "Norsk: Les teksten…", "Matematikk: Gjør oppgavene…".
11) Hopp over uleselige celler — behold det som lot seg tolke. Tom liste kun hvis dokumentet virkelig ikke har lekser.
12) documentType skal være "homework".
13) Maks 40 forslag.`;

/**
 * Keep homework items and huskelapper; drop timetable slots and timed events.
 * Lekser are homework documents — huskelapper forblir gjøremål (todo), ikke lekser.
 */
export function applyHomeworkFocusToSuggestions(suggestions = []) {
  const out = [];
  (suggestions || []).forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;

    const kind = raw.kind;
    const hasTime = !!(raw.time || raw.endTime);
    const title = String(raw.title || raw.subject || '').trim();
    const homeworkLike = isHomeworkLikeSuggestion(raw);
    const isHusk = raw.prepTask
      || raw.prepWhen
      || String(raw.category || '').toLowerCase() === 'gjøremål'
      || /husk|svømmetøy|gymtøy|gymsko|levering|postmappe|går på tur|klær etter vær/i.test(
        `${title} ${raw.description || ''}`,
      );

    if (kind === 'schedule_slot' && hasTime && !homeworkLike) return;
    if (kind === 'event' && hasTime && !homeworkLike) return;
    if (kind === 'note') {
      out.push({ ...raw, selected: false });
      return;
    }

    if (!title) return;

    // Huskelapper (HUSK-rad) beholdes som gjøremål — ikke droppes, ikke konverteres til lekser.
    // (todo+once matcher ellers isHomeworkLikeSuggestion.)
    if (isHusk && !SUBJECT_LINE_RE.test(title) && !/^(norsk|matte|matematikk|regning|lesing|skriving|engelsk)\s*:/i.test(title)) {
      out.push({
        ...raw,
        kind: 'todo',
        title,
        type: 'once',
        category: 'gjøremål',
        time: null,
        endTime: null,
        recurrenceWeeks: null,
        prepTask: raw.prepTask === true || /svømme|gymtøy|gymsko|badetøy/i.test(title),
        prepWhen: raw.prepWhen || (/svømme|gymtøy|gymsko|badetøy/i.test(title) ? 'morning' : null),
        selected: raw.selected !== false,
        points: raw.points || 5,
      });
      return;
    }

    out.push({
      ...raw,
      kind: 'homework',
      title,
      subject: resolveHomeworkSubjectId(raw.subject, title),
      type: 'once',
      category: 'lekser',
      daysOfWeek: [],
      time: null,
      endTime: null,
      day: null,
      recurrenceWeeks: null,
      prepTask: false,
      prepWhen: null,
      selected: raw.selected !== false,
      points: null,
    });
  });
  return out;
}

export function inferHomeworkSubjectId(text) {
  const s = String(text || '').toLowerCase();
  if (/regning|matt|matematikk/.test(s)) return 'matematikk';
  if (/lesing|\blese\b|skriving|norsk/.test(s)) return 'norsk';
  if (/engelsk/.test(s)) return 'engelsk';
  if (/natur/.test(s)) return 'naturfag';
  if (/samfunn/.test(s)) return 'samfunnsfag';
  if (/krle|\brle\b|religion/.test(s)) return 'rle';
  if (/kroppsøving|kroppsoving|\bgym\b|idrett|svøm/.test(s)) return 'kroppsoving';
  if (/kunst|håndverk|handverk/.test(s)) return 'kunst';
  if (/musikk/.test(s)) return 'musikk';
  return 'annet';
}

const CANONICAL_SUBJECT_IDS = new Set([
  'matematikk', 'norsk', 'engelsk', 'naturfag', 'samfunnsfag',
  'rle', 'kroppsoving', 'kunst', 'musikk', 'annet',
]);

export function resolveHomeworkSubjectId(subject, title) {
  const sid = String(subject || '').trim().toLowerCase();
  if (CANONICAL_SUBJECT_IDS.has(sid)) return sid;
  return inferHomeworkSubjectId(`${subject || ''} ${title || ''}`);
}

export function isHomeworkItem(item, homeworkFocus = false) {
  if (!item) return false;
  if (item.kind === 'homework') return true;
  if (String(item.category || '').toLowerCase() === 'lekser') return true;
  if (homeworkFocus && item.kind === 'todo') return true;
  return false;
}
