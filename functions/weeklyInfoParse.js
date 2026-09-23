/** Parse småskole-/ukeinfo-planer uten klokkeslett (læringsmål + lekser + huskelapper). */

import { fridayOfIsoWeek, extractWeekNumberFromText } from './homeworkImport.js';
import { normalizeDayKey } from './timetableParse.js';

const DAY_HEADER_NAMES = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag'];
const WEEKDAY_COLS = ['mon', 'tue', 'wed', 'thu', 'fri'];

const SUBJECT_LABEL_RE = /^(norsk|matematikk|matte|engelsk|naturfag|samfunnsfag|kunst|musikk|kroppsøving|krle|mat og helse|fyfo|historie|geografi|tysk|spansk)$/i;
const SESSION_OR_TIME_RE = /^\d\.?\s*økt$|^\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2}$/i;
const PREP_RE = /husk\s+(svømme|gym|bade)|svømmetøy|gymtøy|gymsko|håndkle|badetøy/i;
const CONTACT_NOISE_RE = /@|http|telefon|e-post|hjemmeside|kontaktlærer|tlf:|^\d{2}\s*\d{2}\s*\d{2}/i;
const HEADER_NOISE_RE = /^(ukeplan|lekser|mål|fag|læringsmål|tema|informasjon|tirsdag|onsdag|torsdag|fredag|mandag)$/i;

function capitalize(s) {
  const t = String(s || '').trim();
  if (!t) return t;
  if (/^matte$/i.test(t)) return 'Matte';
  if (/^krle$/i.test(t)) return 'KRLE';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function dayFromHeader(str) {
  const key = normalizeDayKey(str);
  return WEEKDAY_COLS.includes(key) ? key : null;
}

function jsDayFromKey(day) {
  return { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 }[day] ?? null;
}

function dateHintForWeek(text, dayKey = null) {
  const week = extractWeekNumberFromText(text);
  const friday = week ? fridayOfIsoWeek(week) : null;
  if (!friday) return null;
  if (!dayKey || dayKey === 'fri') return friday;
  const [y, m, d] = friday.split('-').map(Number);
  const friDate = new Date(y, m - 1, d);
  const targetJs = jsDayFromKey(dayKey);
  const friJs = friDate.getDay();
  const delta = targetJs - friJs;
  const out = new Date(friDate);
  out.setDate(friDate.getDate() + delta);
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${out.getFullYear()}-${pad(out.getMonth() + 1)}-${pad(out.getDate())}`;
}

function mergeNearbyText(items) {
  return items
    .map((it) => String(it.str || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when document looks like småskole ukeinfo (lekser/mål) without timeplan-økter.
 */
export function looksLikeWeeklyInfoPlan(text, positionedItems = []) {
  const blob = String(text || '');
  const hasWeekPlan = /ukeplan|uke\s*\d{1,2}|læringsmål|lekser/i.test(blob);
  const hasDays = /(mandag|tirsdag|onsdag|torsdag|fredag)/i.test(blob);
  const hasSubjects = /(norsk|matte|matematikk|engelsk)/i.test(blob);
  const hasSessions = (positionedItems || []).some((it) => SESSION_OR_TIME_RE.test(String(it?.str || '').trim()))
    || /\d\.?\s*økt\b|\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2}/.test(blob);
  return hasWeekPlan && hasDays && hasSubjects && !hasSessions;
}

/**
 * Parse småskole-ukeplan fra PDF-posisjoner (kolonner Tirsdag–Fredag + fag-rader).
 * Returnerer rå forslag — ikke schedule_slot (ingen klokkeslett).
 */
export function parseWeeklyInfoPositions(rawItems, { sourceText = '' } = {}) {
  const items = (rawItems || [])
    .map((it) => ({
      str: String(it?.str || '').trim(),
      x: Number(it?.x ?? 0),
      y: Number(it?.y ?? 0),
      page: Number(it?.page ?? 1) || 1,
    }))
    .filter((it) => it.str);

  if (!items.length) return [];

  // Unngå å kapre ekte timeplaner.
  if (items.some((it) => SESSION_OR_TIME_RE.test(it.str))) return [];

  const headers = items
    .filter((it) => DAY_HEADER_NAMES.includes(it.str.toLowerCase()))
    .sort((a, b) => a.page - b.page || a.x - b.x);

  if (headers.length < 3) return [];

  // Velg siden med «Lekser» + ukedag-headers (småskole side 2).
  const pageScores = new Map();
  for (const it of items) {
    const key = it.page;
    let score = pageScores.get(key) || 0;
    if (/^lekser$/i.test(it.str)) score += 5;
    if (DAY_HEADER_NAMES.includes(it.str.toLowerCase())) score += 2;
    if (SUBJECT_LABEL_RE.test(it.str)) score += 1;
    pageScores.set(key, score);
  }
  let bestPage = headers[0].page;
  let bestScore = -1;
  for (const [page, score] of pageScores.entries()) {
    if (score > bestScore) {
      bestScore = score;
      bestPage = page;
    }
  }

  const pageItems = items.filter((it) => it.page === bestPage);
  const pageHeaders = headers.filter((h) => h.page === bestPage);
  if (pageHeaders.length < 3) return [];

  const headerYs = [...new Set(pageHeaders.map((h) => Math.round(h.y)))].sort((a, b) => b - a);
  const lekserHeaderY = headerYs[0];
  const dayHeaders = pageHeaders
    .filter((h) => Math.abs(h.y - lekserHeaderY) <= 8)
    .map((h) => ({ day: dayFromHeader(h.str), x: h.x, y: h.y }))
    .filter((h) => h.day);

  if (dayHeaders.length < 3) return [];

  const gaps = [];
  for (let i = 1; i < dayHeaders.length; i += 1) {
    gaps.push(dayHeaders[i].x - dayHeaders[i - 1].x);
  }
  const colWidth = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 100;
  const maxColDist = colWidth * 0.48;
  const leftColMax = Math.min(...dayHeaders.map((h) => h.x)) - 20;

  function columnForX(x) {
    let best = dayHeaders[0];
    let bestDist = Math.abs(x - best.x);
    for (const col of dayHeaders) {
      const dist = Math.abs(x - col.x);
      if (dist < bestDist) {
        best = col;
        bestDist = dist;
      }
    }
    return bestDist <= maxColDist ? best.day : null;
  }

  const subjectLabels = pageItems
    .filter((it) => it.x <= leftColMax + 10 && SUBJECT_LABEL_RE.test(it.str) && it.y < lekserHeaderY - 10)
    .sort((a, b) => b.y - a.y);

  const suggestions = [];
  const seen = new Set();
  const weekBlob = sourceText || items.map((i) => i.str).join(' ');
  const weekFriday = dateHintForWeek(weekBlob, 'fri');

  const push = (item) => {
    const title = String(item.title || '').trim().replace(/\s+/g, ' ');
    if (!title || title.length < 4) return;
    const key = `${item.kind}|${item.day || ''}|${title.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push({ ...item, title: title.slice(0, 160) });
  };

  // Fag-rader (lekser uten klokkeslett).
  for (let i = 0; i < subjectLabels.length; i += 1) {
    const label = subjectLabels[i];
    const subject = capitalize(label.str);
    const nextLabel = subjectLabels[i + 1];
    const minY = nextLabel ? nextLabel.y + 6 : label.y - 140;

    const blockItems = pageItems
      .filter((it) => (
        it.x >= leftColMax
        && it.y <= label.y + 4
        && it.y >= minY
        && !HEADER_NOISE_RE.test(it.str)
        && !SUBJECT_LABEL_RE.test(it.str)
        && !CONTACT_NOISE_RE.test(it.str)
        && !/^informasjon til/i.test(it.str)
      ))
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const body = mergeNearbyText(blockItems);
    if (!body || body.length < 6) continue;

    push({
      kind: 'homework',
      title: `${subject}: ${body}`.slice(0, 160),
      subject,
      type: 'once',
      category: 'lekser',
      confidence: 0.9,
      dateHint: weekFriday,
      description: body.slice(0, 400),
    });
  }

  // Dag-spesifikke huskelapper mellom header og første fag-rad.
  const firstSubjectY = subjectLabels.length
    ? Math.max(...subjectLabels.map((s) => s.y))
    : lekserHeaderY - 40;
  const dayNoteItems = pageItems.filter((it) => (
    it.y < lekserHeaderY - 6
    && it.y > firstSubjectY + 8
    && it.x >= leftColMax
    && !HEADER_NOISE_RE.test(it.str)
    && !SUBJECT_LABEL_RE.test(it.str)
    && !CONTACT_NOISE_RE.test(it.str)
  ));

  const byDay = new Map();
  for (const it of dayNoteItems) {
    const day = columnForX(it.x);
    if (!day) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(it);
  }

  for (const [day, dayItems] of byDay.entries()) {
    const text = mergeNearbyText(dayItems.sort((a, b) => b.y - a.y));
    if (!text || text.length < 4) continue;
    const dateHint = dateHintForWeek(weekBlob, day) || weekFriday;
    const isPrep = PREP_RE.test(text);

    // Del «4A - husk … 4b - husk …» i to forslag når begge finnes.
    const parts = text.split(/(?=\b\d[AB]\b)/i).map((p) => p.trim()).filter((p) => p.length >= 4);
    const chunks = parts.length > 1 ? parts : [text];
    chunks.forEach((chunk) => {
      const chunkPrep = PREP_RE.test(chunk);
      push({
        kind: 'todo',
        title: chunk.slice(0, 120),
        type: 'once',
        category: 'gjøremål',
        confidence: 0.88,
        dateHint,
        day,
        daysOfWeek: [jsDayFromKey(day)].filter((n) => n != null),
        prepTask: chunkPrep || isPrep,
        prepWhen: (chunkPrep || isPrep) ? 'morning' : null,
        description: chunk.slice(0, 400),
      });
    });
  }

  return suggestions;
}

/**
 * Enklere tekst-fallback når posisjoner mangler (f.eks. Word/ren tekst).
 */
export function parseWeeklyInfoText(text) {
  const raw = String(text || '');
  if (!looksLikeWeeklyInfoPlan(raw)) return [];

  const weekFriday = dateHintForWeek(raw, 'fri');
  const suggestions = [];
  const seen = new Set();

  const push = (item) => {
    const title = String(item.title || '').trim().replace(/\s+/g, ' ');
    if (!title || title.length < 4) return;
    const key = title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push({ ...item, title: title.slice(0, 160) });
  };

  // Fag + oppgave etter «Lekser»-seksjon.
  const lekserIdx = raw.search(/\blekser\b/i);
  const section = lekserIdx >= 0 ? raw.slice(lekserIdx) : raw;
  const subjectBlocks = section.split(
    /(?=\b(?:Norsk|Matte|Matematikk|Engelsk|Naturfag|Samfunnsfag|Musikk|KRLE)\b)/i,
  );

  subjectBlocks.forEach((block) => {
    const m = block.match(
      /^(Norsk|Matte|Matematikk|Engelsk|Naturfag|Samfunnsfag|Musikk|KRLE)\b[:\s]*(.+)$/is,
    );
    if (!m) return;
    const subject = capitalize(m[1]);
    let body = String(m[2] || '')
      .replace(/\b(Tirsdag|Onsdag|Torsdag|Fredag|Mandag|Fag|Lekser)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Stopp før neste «husk»/kontakt-blokk hvis den sneik seg inn.
    body = body.split(/\bInformasjon til|\bKontaktlærer|\bTelefon\b/i)[0].trim();
    if (body.length < 8) return;
    push({
      kind: 'homework',
      title: `${subject}: ${body}`.slice(0, 160),
      subject,
      type: 'once',
      category: 'lekser',
      confidence: 0.8,
      dateHint: weekFriday,
      description: body.slice(0, 400),
    });
  });

  const dayNoteRes = [
    [/tirsdag[:\s]+([^]+?)(?=onsdag|torsdag|fredag|norsk|matte|engelsk|$)/i, 'tue'],
    [/onsdag[:\s]+([^]+?)(?=torsdag|fredag|norsk|matte|engelsk|$)/i, 'wed'],
    [/torsdag[:\s]+([^]+?)(?=fredag|norsk|matte|engelsk|$)/i, 'thu'],
    [/fredag[:\s]+([^]+?)(?=norsk|matte|engelsk|$)/i, 'fri'],
  ];

  // I flat tekst er dagnoter ofte uten tydelig delimiter — fang typiske husk-fraser.
  const prepMatches = section.matchAll(
    /((?:\d[AB]\s*[-–]?\s*)?husk\s+(?:svømme|gym|bade|klær)[^.]+(?:\.|$)|vi går på tur[^.]*(?:\.|$)|levering av lekser[^.]*(?:\.|$))/gi,
  );
  for (const match of prepMatches) {
    const text = String(match[1] || '').trim();
    if (!text) continue;
    const isPrep = PREP_RE.test(text);
    push({
      kind: 'todo',
      title: text.slice(0, 120),
      type: 'once',
      category: 'gjøremål',
      confidence: 0.78,
      dateHint: weekFriday,
      prepTask: isPrep,
      prepWhen: isPrep ? 'morning' : null,
    });
  }

  void dayNoteRes;
  return suggestions;
}

export const COMPACT_WEEKLY_INFO_PROMPT = `Du leser en norsk småskole-ukeplan / «Lekser»-tabell til hjemme (uten klokkeslett).
Typisk: kolonner Fag + Tirsdag–Fredag. Fag-rader (Norsk/Matte/Engelsk) har ofte ÉN sammenslått celle over alle dagene = ÉN lekse. Rad «HUSK» har egen tekst per dag.
Returner KUN gyldig JSON:
{
  "documentType": "weekly_info",
  "weekNumber": number | null,
  "summary": "kort norsk oppsummering",
  "period": { "kind": "special", "weeks": 1, "label": "Uke N" },
  "suggestions": [
    { "kind": "homework", "title": "Norsk: Les 15 minutter …", "subject": "Norsk", "type": "once", "category": "lekser", "dateHint": "YYYY-MM-DD", "confidence": 0.9 },
    { "kind": "todo", "title": "Husk svømmetøy", "type": "once", "category": "gjøremål", "day": "wed", "prepTask": true, "prepWhen": "morning", "dateHint": "YYYY-MM-DD", "confidence": 0.9 }
  ]
}

Regler:
- Dette er IKKE timeplan. ALDRI kind "schedule_slot". Ikke finn på klokkeslett.
- Sammenslått fag-celle over flere dager → ÉN homework (ikke én per dag).
- Dagspesifikke huskelapper (svømmetøy, gymtøy, tur, levering) → todo/gjøremål med riktig day (mon..fri). prepTask true for gym/svøm.
- Hopp over tomme/uleselige celler — behold det som er tydelig.
- Kontaktinfo/e-post/telefon → kind "note", selected false.
- Lag ALLTID konkrete forslag når dokumentet har lekser eller huskelapper.`;
