/** Hjelpere for robust parsing av norske skole-timeplaner fra AI-respons. */

const DAY_MAP = {
  mandag: 'mon', man: 'mon', monday: 'mon', mon: 'mon',
  tirsdag: 'tue', tir: 'tue', tuesday: 'tue', tue: 'tue',
  onsdag: 'wed', ons: 'wed', wednesday: 'wed', wed: 'wed',
  torsdag: 'thu', tor: 'thu', thursday: 'thu', thu: 'thu',
  fredag: 'fri', fre: 'fri', friday: 'fri', fri: 'fri',
  lørdag: 'sat', lor: 'sat', saturday: 'sat', sat: 'sat',
  søndag: 'sun', son: 'sun', sunday: 'sun', sun: 'sun',
};

const SKIP_ROW = /friminutt|spising|matpause|pause\b|lunsj/i;
const BREAK_LABEL_RE = /^(friminutt|spising|matpause|lunsj)$/i;
const DAY_HEADER_NAMES = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag'];
const WEEKDAY_COLS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const LABEL_X_MAX = 130;
const TABLE_X_MIN = 150;
const DAY_HEADER_RE = /^(mandag|tirsdag|onsdag|torsdag|fredag)$/i;
const SESSION_RE = /^(\d)\.?\s*økt$/i;
const TIME_RANGE_RE = /^(\d{1,2})[.:](\d{2})\s*[-–]\s*(\d{1,2})[.:](\d{2})$/;
const SKIP_TOKEN_RE = /^(friminutt|spising|matpause|pause|lunsj)$/i;

function splitTimetableCells(line) {
  const tabbed = line.split(/\t+/).map((c) => c.trim()).filter(Boolean);
  if (tabbed.length >= 2) return tabbed;

  const spaced = line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
  if (spaced.length >= 2) return spaced;

  const subjects = line.match(/[A-ZÆØÅ][A-ZÆØÅ0-9/&\s-]*(?:\([^)]+\))?/g);
  if (subjects && subjects.length >= 2) return subjects.map((s) => s.trim());

  return [line.trim()].filter(Boolean);
}

/** Normaliser klokkeslett til HH:MM (f.eks. 08.25 → 08:25). */
export function normalizeTimeString(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const colon = s.match(/^(\d{1,2}):(\d{2})$/);
  if (colon) {
    return `${String(Number(colon[1])).padStart(2, '0')}:${colon[2]}`;
  }
  const dot = s.match(/^(\d{1,2})\.(\d{2})$/);
  if (dot) {
    return `${String(Number(dot[1])).padStart(2, '0')}:${dot[2]}`;
  }
  const compact = s.match(/^(\d{1,2})(\d{2})$/);
  if (compact) {
    return `${String(Number(compact[1])).padStart(2, '0')}:${compact[2]}`;
  }
  return s.slice(0, 5);
}

export function normalizeDayKey(raw) {
  const day = String(raw || '').trim().toLowerCase();
  if (!day) return null;
  if (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(day)) return day;
  return DAY_MAP[day] || null;
}

/** Prøv å reparere avkuttet JSON fra Gemini (MAX_TOKENS). */
export function salvageTruncatedJson(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Tomt svar fra AI');

  try {
    return JSON.parse(raw);
  } catch {
    // fall through
  }

  // Behold komplette objekter i suggestions-array ved trunkering (MAX_TOKENS).
  const sugMatch = raw.match(/"suggestions"\s*:\s*\[/);
  if (sugMatch && sugMatch.index != null) {
    const arrayBody = raw.slice(sugMatch.index + sugMatch[0].length);
    const items = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escape = false;
    for (let i = 0; i < arrayBody.length; i += 1) {
      const c = arrayBody[i];
      if (inString) {
        if (escape) escape = false;
        else if (c === '\\') escape = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') { inString = true; continue; }
      if (c === '{') {
        if (depth === 0) start = i;
        depth += 1;
      } else if (c === '}') {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          try { items.push(JSON.parse(arrayBody.slice(start, i + 1))); } catch { /* skip */ }
          start = -1;
        }
        if (depth < 0) break;
      }
    }
    if (items.length) {
      let documentType = 'mixed';
      const typeMatch = raw.match(/"documentType"\s*:\s*"(weekly_info|homework|schedule|mixed)"/);
      if (typeMatch) documentType = typeMatch[1];
      let summary = 'Delvis analyse — noen forslag kunne hentes ut.';
      const sumMatch = raw.match(/"summary"\s*:\s*"((?:\\.|[^"\\])*)"/);
      if (sumMatch) {
        try { summary = JSON.parse(`"${sumMatch[1]}"`); } catch { summary = sumMatch[1]; }
      }
      return {
        documentType,
        weekNumber: null,
        period: null,
        summary,
        suggestions: items,
        partialParse: true,
      };
    }
  }

  // Fjern ufullstendig egenskap/objekt på slutten og lukk braces
  let attempt = raw
    .replace(/,\s*"[^"]*"\s*:\s*("[^"]*)?$/s, '')
    .replace(/,\s*\{[^}]*$/s, '')
    .replace(/,\s*$/s, '');

  const stack = [];
  for (const ch of attempt) {
    if (ch === '{' || ch === '[') stack.push(ch);
    if (ch === '}' && stack[stack.length - 1] === '{') stack.pop();
    if (ch === ']' && stack[stack.length - 1] === '[') stack.pop();
  }
  while (stack.length) {
    const open = stack.pop();
    attempt += open === '[' ? ']' : '}';
  }

  return JSON.parse(attempt);
}

function coerceSuggestion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const day = normalizeDayKey(raw.day || raw.weekday || raw.ukedag);
  const description = String(raw.description || raw.details || raw.instruks || '').trim();
  const subject = String(
    raw.subject || raw.title || raw.name || raw.fag || raw.course || raw.oppgave || raw.task || '',
  ).trim();
  const titleBase = subject || description;
  if (!titleBase) return null;
  const title = subject && description && subject !== description && !subject.includes(description)
    ? `${subject}: ${description}`.slice(0, 120)
    : titleBase.slice(0, 120);

  const time = normalizeTimeString(raw.time || raw.startTime || raw.start || raw.fra);
  const endTime = normalizeTimeString(raw.endTime || raw.end || raw.til || raw.slutt);

  const kind = raw.kind
    || (raw.category === 'lekser' || raw.category === 'lekse' || raw.type === 'once'
      || /lekse|oppgave|lesing|regning|skriving/i.test(`${raw.title || ''} ${raw.subject || ''}`)
      ? 'todo'
      : 'schedule_slot');

  return {
    kind,
    title,
    subject: subject || title,
    day,
    time,
    endTime,
    confidence: Number(raw.confidence ?? 0.85),
    type: raw.type || 'weekly',
    description: String(raw.description || '').slice(0, 200),
    category: raw.category || null,
    points: raw.points ?? null,
    dateHint: raw.dateHint || null,
    recurrenceWeeks: raw.recurrenceWeeks ?? null,
    prepTask: raw.prepTask === true,
    prepWhen: raw.prepWhen || null,
  };
}

/** Hent forslag fra ulike AI-responsformater. */
export function extractSuggestionsFromResponse(raw) {
  if (!raw || typeof raw !== 'object') return [];

  const candidates = [];
  const arrayKeys = [
    'suggestions', 'schedule_slots', 'slots', 'schedule', 'timetable',
    'todos', 'tasks', 'items', 'lekser', 'homework', 'oppgaver', 'assignments',
  ];
  arrayKeys.forEach((key) => {
    if (Array.isArray(raw[key])) candidates.push(...raw[key]);
  });
  if (Array.isArray(raw.homework?.items)) candidates.push(...raw.homework.items);
  if (Array.isArray(raw.homework?.suggestions)) candidates.push(...raw.homework.suggestions);

  if (raw.timetable && typeof raw.timetable === 'object' && !Array.isArray(raw.timetable)) {
    Object.entries(raw.timetable).forEach(([dayKey, slots]) => {
      const day = normalizeDayKey(dayKey);
      (Array.isArray(slots) ? slots : []).forEach((slot) => {
        candidates.push({ ...slot, day: day || slot?.day, kind: 'schedule_slot' });
      });
    });
  }

  return candidates.map(coerceSuggestion).filter(Boolean);
}

export const COMPACT_TIMETABLE_PROMPT = `Du leser en norsk skole-timeplan (ukeplan) fra bilde eller PDF.
Returner KUN gyldig JSON med denne strukturen:
{
  "documentType": "schedule",
  "summary": "kort norsk oppsummering",
  "period": { "kind": "semester", "weeks": 18, "label": "Ett semester" },
  "suggestions": [
    { "kind": "schedule_slot", "title": "NORSK (ET)", "subject": "NORSK (ET)", "day": "mon", "time": "08:25", "endTime": "09:55", "confidence": 0.9 }
  ]
}

Regler:
- Tabell med Mandag–Fredag og rader «1.økt», «2.økt» osv.: hver celle med fag → schedule_slot.
- Bruk klokkeslett fra radens intervall (08.25 → "08:25"). ALLTID sett time og endTime.
- Inkluder Friminutt og Spising som schedule_slot for alle ukedager (mon–fri) med riktig klokkeslett.
- Behold lærerinitialer: «NORSK (ET)», «GYM/SVØM (HE/ET)».
- day = mon|tue|wed|thu|fri (engelsk forkortelse).
- Tomme celler uten fag → ingen forslag for den dagen (ikke flytt fag fra nabokolonne).
- Lag ALLTID forslag når tabellen har fag — ikke returner tom liste.`;

/** Linjeformat-prompt når JSON feiler — én time per linje, lett å parse. */
export const LINE_TIMETABLE_PROMPT = `Les timeplanen i dokumentet og skriv ÉN time per linje i dette formatet:
dag|start|slutt|fag
der dag = mon,tue,wed,thu,fri (engelsk forkortelse).
Eksempel:
mon|08:25|09:55|NORSK (ET)
tue|08:25|09:55|MATTE (HE)
mon|09:55|10:10|Friminutt
tue|09:55|10:10|Friminutt
Inkluder Friminutt og Spising for hver ukedag (mon–fri) med klokkeslett. Tomme celler hoppes over.
Bruk klokkeslett fra tabellen (08.25 → 08:25).
Skriv KUN linjene, ingen annen tekst.`;

/** Parse linjeformat fra LINE_TIMETABLE_PROMPT. */
export function parseTimetableLines(text) {
  const suggestions = [];
  String(text || '').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim().replace(/^[-*]\s*/, '');
    const parts = trimmed.split('|').map((p) => p.trim());
    if (parts.length < 4) return;
    const day = normalizeDayKey(parts[0]);
    const time = normalizeTimeString(parts[1]);
    const endTime = normalizeTimeString(parts[2]);
    const subject = parts.slice(3).join('|').trim();
    if (!day || !subject || !time) return;
    suggestions.push({
      kind: 'schedule_slot',
      title: subject,
      subject,
      day,
      time,
      endTime,
      confidence: 0.86,
    });
  });
  return suggestions;
}

function capitalizeBreakLabel(label) {
  const s = String(label || '').trim();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function parseTimeRange(str) {
  const m = String(str || '').match(TIME_RANGE_RE);
  if (!m) return null;
  return {
    time: normalizeTimeString(`${m[1]}:${m[2]}`),
    endTime: normalizeTimeString(`${m[3]}:${m[4]}`),
  };
}

function isTableNoise(str) {
  const s = String(str || '').trim();
  if (!s) return true;
  if (DAY_HEADER_RE.test(s)) return true;
  if (TIME_RANGE_RE.test(s)) return true;
  if (SESSION_RE.test(s)) return true;
  if (/^ET\s*=|^HE\s*=|^KY\s*=|^KS\s*=|Tipple|Eltervåg|Ystaas|Soma/i.test(s)) return true;
  return false;
}

/**
 * Parse timeplan fra PDF-posisjoner (x/y) — korrekt kolonne ved tomme celler.
 */
export function parseTimetablePositions(rawItems) {
  const items = (rawItems || [])
    .map((it) => ({
      str: String(it?.str || '').trim(),
      x: Number(it?.x ?? 0),
      y: Number(it?.y ?? 0),
    }))
    .filter((it) => it.str);

  const headers = items.filter((it) => DAY_HEADER_NAMES.includes(it.str.toLowerCase()));
  if (headers.length < 3) return [];

  const columns = headers
    .sort((a, b) => a.x - b.x)
    .map((h) => ({
      day: WEEKDAY_COLS[DAY_HEADER_NAMES.indexOf(h.str.toLowerCase())],
      x: h.x,
    }))
    .filter((c) => c.day);

  if (columns.length < 3) return [];

  const gaps = [];
  for (let i = 1; i < columns.length; i += 1) {
    gaps.push(columns[i].x - columns[i - 1].x);
  }
  const colWidth = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 100;
  const maxColDist = colWidth * 0.48;

  function columnForX(x) {
    let best = columns[0];
    let bestDist = Math.abs(x - best.x);
    for (const col of columns) {
      const dist = Math.abs(x - col.x);
      if (dist < bestDist) {
        best = col;
        bestDist = dist;
      }
    }
    return bestDist <= maxColDist ? best.day : null;
  }

  const timeItems = items
    .map((it) => ({ ...it, range: parseTimeRange(it.str) }))
    .filter((it) => it.range);

  const rowLabels = items.filter(
    (it) => it.x <= LABEL_X_MAX && (SESSION_RE.test(it.str) || BREAK_LABEL_RE.test(it.str)),
  );

  function timeForLabel(labelY) {
    let best = null;
    let bestDist = Infinity;
    for (const t of timeItems) {
      const delta = labelY - t.y;
      if (delta < 5 || delta > 45) continue;
      const dist = Math.abs(delta - 18);
      if (dist < bestDist) {
        bestDist = dist;
        best = t.range;
      }
    }
    return best;
  }

  const suggestions = [];

  for (const label of rowLabels) {
    const times = timeForLabel(label.y);
    if (!times?.time) continue;

    if (BREAK_LABEL_RE.test(label.str)) {
      const title = capitalizeBreakLabel(label.str);
      WEEKDAY_COLS.forEach((day) => {
        suggestions.push({
          kind: 'schedule_slot',
          title,
          subject: title,
          day,
          time: times.time,
          endTime: times.endTime,
          confidence: 0.94,
        });
      });
      continue;
    }

    if (!SESSION_RE.test(label.str)) continue;

    const rowItems = items
      .filter((it) => Math.abs(it.y - label.y) <= 6 && it.x >= TABLE_X_MIN && !isTableNoise(it.str))
      .sort((a, b) => a.x - b.x);

    const merged = [];
    for (const it of rowItems) {
      if (/^\([^)]+\)$/.test(it.str) && merged.length) {
        merged[merged.length - 1].str = `${merged[merged.length - 1].str} ${it.str}`;
        merged[merged.length - 1].x = Math.min(merged[merged.length - 1].x, it.x);
      } else {
        merged.push({ ...it });
      }
    }

    for (const cell of merged) {
      const day = columnForX(cell.x);
      if (!day || BREAK_LABEL_RE.test(cell.str)) continue;
      suggestions.push({
        kind: 'schedule_slot',
        title: cell.str,
        subject: cell.str,
        day,
        time: times.time,
        endTime: times.endTime,
        confidence: 0.94,
      });
    }
  }

  return suggestions;
}

/**
 * Parse timeplan fra PDF/tekst-tokens (pdfjs gir ofte ett felt per celle).
 * Håndterer også «SAMFUNNSFAG» + «(KY)» som separate tokens.
 */
export function parseTimetableTokens(rawTokens) {
  const tokens = [];
  for (const raw of rawTokens || []) {
    const t = String(raw || '').trim();
    if (!t || t === ' ') continue;
    if (/^\([^)]+\)$/.test(t) && tokens.length) {
      tokens[tokens.length - 1] = `${tokens[tokens.length - 1]} ${t}`;
    } else {
      tokens.push(t);
    }
  }

  const dayCols = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const suggestions = [];
  let i = 0;
  while (i < tokens.length && !DAY_HEADER_RE.test(tokens[i])) i += 1;
  while (i < tokens.length && DAY_HEADER_RE.test(tokens[i])) i += 1;

  while (i < tokens.length) {
    const tok = tokens[i];
    if (SESSION_RE.test(tok)) {
      i += 1;
      const range = tokens[i] && String(tokens[i]).match(TIME_RANGE_RE);
      if (!range) continue;
      const time = normalizeTimeString(`${range[1]}:${range[2]}`);
      const endTime = normalizeTimeString(`${range[3]}:${range[4]}`);
      i += 1;
      const subjects = [];
      while (i < tokens.length && subjects.length < 5) {
        const s = tokens[i];
        if (
          SESSION_RE.test(s)
          || SKIP_TOKEN_RE.test(s)
          || TIME_RANGE_RE.test(s)
          || /^ET\s*=/i.test(s)
          || DAY_HEADER_RE.test(s)
        ) break;
        subjects.push(s);
        i += 1;
      }
      subjects.forEach((subject, idx) => {
        if (!subject || SKIP_ROW.test(subject)) return;
        suggestions.push({
          kind: 'schedule_slot',
          title: subject,
          subject,
          day: dayCols[idx],
          time,
          endTime,
          confidence: 0.92,
        });
      });
      continue;
    }
    if (SKIP_TOKEN_RE.test(tok)) {
      i += 1;
      if (tokens[i] && TIME_RANGE_RE.test(tokens[i])) i += 1;
      continue;
    }
    i += 1;
  }
  return suggestions;
}

/**
 * Forsøk å parse en ren tekst-representasjon av timeplan (f.eks. fra Word/PDF).
 * Returnerer rå forslag-objekter eller tom liste.
 */
export function parseTimetableText(text) {
  const raw = String(text || '');
  // PDF-ekstrakt kan ha hvert ord på egen linje — prøv token-parser først.
  const fromTokens = parseTimetableTokens(raw.split(/\s+/));
  if (fromTokens.length >= 3) return fromTokens;

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const suggestions = [];
  let currentTimes = null;

  const dayCols = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const dayHeader = lines.find((l) => /mandag/i.test(l) && /tirsdag/i.test(l))
    || (/mandag/i.test(raw) && /tirsdag/i.test(raw) ? 'ok' : null);
  if (!dayHeader) return [];

  // Slå sammen «1.økt» + «08.25 - 09.55» som ofte står på separate linjer.
  const normalizedLines = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (SESSION_RE.test(line) && lines[i + 1] && TIME_RANGE_RE.test(lines[i + 1])) {
      normalizedLines.push(`${line} (${lines[i + 1]})`);
      i += 1;
      continue;
    }
    normalizedLines.push(line);
  }

  normalizedLines.forEach((line) => {
    const breakLine = line.match(/^(friminutt|spising|matpause|lunsj)(?:\s*\(?\s*(\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2})\s*\)?)?$/i);
    if (breakLine) {
      let times = currentTimes;
      if (breakLine[2]) {
        const range = breakLine[2].match(TIME_RANGE_RE);
        if (range) {
          times = {
            time: normalizeTimeString(`${range[1]}:${range[2]}`),
            endTime: normalizeTimeString(`${range[3]}:${range[4]}`),
          };
        }
      }
      if (times?.time) {
        const title = capitalizeBreakLabel(breakLine[1]);
        WEEKDAY_COLS.forEach((day) => {
          suggestions.push({
            kind: 'schedule_slot',
            title,
            subject: title,
            day,
            time: times.time,
            endTime: times.endTime,
            confidence: 0.9,
          });
        });
      }
      currentTimes = null;
      return;
    }

    const session = line.match(/(\d)\.?\s*økt\s*\(?\s*(\d{1,2})[.:](\d{2})\s*[-–]\s*(\d{1,2})[.:](\d{2})\s*\)?/i);
    if (session) {
      if (SKIP_ROW.test(line)) {
        currentTimes = null;
        return;
      }
      currentTimes = {
        time: normalizeTimeString(`${session[2]}:${session[3]}`),
        endTime: normalizeTimeString(`${session[4]}:${session[5]}`),
      };
      return;
    }

    // Egen linje med kun tidsintervall etter økt-linje uten tid
    const onlyRange = line.match(TIME_RANGE_RE);
    if (onlyRange && !currentTimes) {
      currentTimes = {
        time: normalizeTimeString(`${onlyRange[1]}:${onlyRange[2]}`),
        endTime: normalizeTimeString(`${onlyRange[3]}:${onlyRange[4]}`),
      };
      return;
    }

    if (!currentTimes) return;

    let cells;
    if (line.includes('\t')) {
      cells = line.split('\t').map((c) => c.trim());
    } else {
      cells = splitTimetableCells(line);
    }
    if (!line.includes('\t') && cells.length < 2) return;

    cells.slice(0, 5).forEach((subject, idx) => {
      if (!subject || SKIP_ROW.test(subject)) return;
      if (/^(mandag|tirsdag|onsdag|torsdag|fredag)$/i.test(subject)) return;
      suggestions.push({
        kind: 'schedule_slot',
        title: subject,
        subject,
        day: dayCols[idx],
        time: currentTimes.time,
        endTime: currentTimes.endTime,
        confidence: 0.88,
      });
    });
  });

  return suggestions.length ? suggestions : fromTokens;
}
