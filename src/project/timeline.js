/**
 * Prosjektfremdrift: én rad per prosjekt med to linjer.
 * Øverst planlagt periode fra prosjektet eller inngått avtale, nederst utført arbeid per uke.
 * Bare visning. Leser prosjekt, avtale og timer som allerede finnes.
 */
import { parseDate } from '../economy/invoices.js';
import { parseHours } from '../arbeid/hours.js';
import {
  addDays,
  intensityOf,
  isActiveProject,
  mondayKey,
  projectLabel,
  round1,
  toDateKey,
} from '../capacity/plan.js';
import { resolveProjectAgreement } from './projectCrossView.js';
import { projectNumberKey } from './projectFields.js';
import { PROJECT_STATUS_FILTERS, projectPhaseOf } from './statusFilter.js';

export const TIMELINE_ZOOMS = [
  { id: '1', label: '1 år', months: 12 },
  { id: '2', label: '2 år', months: 24 },
  { id: '3', label: '3 år', months: 36 },
];

/** Uker bakover som teller som «aktivitet nå». */
export const RECENT_WEEKS = 4;
/** Dager frem som teller som «slutter snart». */
export const ENDING_SOON_DAYS = 90;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** dd.mm.åååå eller åååå-mm-dd → åååå-mm-dd. Alt annet gir tom tekst. */
export function isoDay(value) {
  const raw = text(value);
  if (!raw) return '';
  const parsed = parseDate(raw);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(parsed);
  if (!match) return '';
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < 1970 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return '';
  return parsed;
}

export function formatDay(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(iso));
  if (!match) return '';
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function contractDates(contract) {
  const fields = contract?.fields && typeof contract.fields === 'object' ? contract.fields : {};
  return {
    start: isoDay(contract?.start) || isoDay(fields.startDate) || isoDay(fields.contractDate),
    end: isoDay(contract?.end) || isoDay(fields.endDate),
  };
}

/**
 * Planlagt periode. Prosjektets egne datoer vinner, ellers avtalens.
 * Opsjon er forlengelse fra avtalen (renewal.until) etter sluttdato.
 */
export function plannedSpan(project, contracts = []) {
  const { contract } = resolveProjectAgreement(project, contracts);
  const fromContract = contractDates(contract);
  const ownStart = isoDay(project?.start);
  const ownEnd = isoDay(project?.end);
  const start = ownStart || fromContract.start;
  let end = ownEnd || fromContract.end;
  if (start && end && end < start) end = '';
  const renewal = contract?.renewal && typeof contract.renewal === 'object' ? contract.renewal : {};
  const until = renewal.type && renewal.type !== 'ingen' ? isoDay(renewal.until) : '';
  const optionEnd = until && end && until > end ? until : '';
  const startFrom = ownStart ? 'prosjekt' : (fromContract.start ? 'avtale' : '');
  const endFrom = ownEnd ? 'prosjekt' : (fromContract.end ? 'avtale' : '');
  return {
    start,
    end,
    optionEnd,
    startFrom,
    endFrom,
    contractId: contract?.id || '',
    contractTitle: text(contract?.title),
  };
}

export function spanSourceLabel(span) {
  const from = new Set([span?.startFrom, span?.endFrom].filter(Boolean));
  if (!from.size) return '';
  if (from.size > 1) return 'Prosjekt og avtale';
  return from.has('avtale') ? 'Avtale' : 'Prosjekt';
}

export function phaseLabel(project) {
  const phase = projectPhaseOf(project);
  if (project?.status === 'arkivert') return 'Arkivert';
  return PROJECT_STATUS_FILTERS.find((row) => row.id === phase)?.label || 'Planlegging';
}

function monthIndex(year, month) {
  return year * 12 + (month - 1);
}

function partsOf(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(iso));
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Måneder i vinduet. anchor er en dato, back er antall måneder før ankermåneden.
 * Hver måned har nøkkel, etikett og kvartal.
 */
export function monthWindow(anchor, months = 12, back = null) {
  const parts = partsOf(toDateKey(anchor)) || partsOf(toDateKey(new Date()));
  const count = Math.max(1, Math.round(Number(months) || 12));
  const before = back == null ? Math.floor(count / 2) : Math.max(0, Math.round(Number(back) || 0));
  const first = monthIndex(parts[0], parts[1]) - before;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const idx = first + i;
    const year = Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    out.push({
      key: `${year}-${String(month).padStart(2, '0')}`,
      year,
      month,
      label: MONTHS[month - 1],
      quarter: Math.floor((month - 1) / 3) + 1,
      days: daysInMonth(year, month),
    });
  }
  return out;
}

export function windowRange(months) {
  if (!months?.length) return { from: '', to: '' };
  const first = months[0];
  const last = months[months.length - 1];
  return {
    from: `${first.key}-01`,
    to: `${last.key}-${String(last.days).padStart(2, '0')}`,
  };
}

/** Flytter ankeret et antall måneder. */
export function shiftAnchor(anchor, deltaMonths) {
  const parts = partsOf(toDateKey(anchor)) || partsOf(toDateKey(new Date()));
  const idx = monthIndex(parts[0], parts[1]) + Math.round(Number(deltaMonths) || 0);
  const year = Math.floor(idx / 12);
  const month = (idx % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/**
 * x-posisjon for starten av en dag. Månedene er like brede, dagen plasseres innenfor måneden.
 * Utenfor vinduet gir verdier under 0 eller over full bredde.
 */
export function xForDay(iso, months, monthW) {
  const parts = partsOf(iso);
  if (!parts || !months?.length) return 0;
  const offset = monthIndex(parts[0], parts[1]) - monthIndex(months[0].year, months[0].month);
  const days = daysInMonth(parts[0], parts[1]);
  return (offset + (parts[2] - 1) / days) * monthW;
}

/**
 * Stolpe fra og med start til og med slutt, klippet til vinduet.
 * Null når perioden ligger helt utenfor.
 */
export function spanPlacement(start, end, months, monthW) {
  const from = isoDay(start);
  const to = isoDay(end);
  if (!from || !to || to < from || !months?.length) return null;
  const total = months.length * monthW;
  const left = xForDay(from, months, monthW);
  const right = xForDay(addDays(to, 1), months, monthW);
  if (right <= 0 || left >= total) return null;
  const clippedLeft = Math.max(0, left);
  const clippedRight = Math.min(total, right);
  return {
    left: clippedLeft,
    width: Math.max(2, clippedRight - clippedLeft),
    openStart: left < 0,
    openEnd: right > total,
  };
}

/**
 * Timer per prosjekt og uke. Kobler på projectId, ellers prosjektnummer.
 * Returnerer Map<projectId, { weeks: Map<mandag, timer>, total, first, last }>.
 */
export function projectWeekHours(entries, projects, { from = '', to = '' } = {}) {
  const ids = new Set();
  const byNumber = new Map();
  for (const project of projects || []) {
    if (!project?.id) continue;
    ids.add(project.id);
    const key = projectNumberKey(project.number);
    if (key && !byNumber.has(key)) byNumber.set(key, project.id);
  }
  const out = new Map();
  for (const row of entries || []) {
    const date = isoDay(row?.date);
    if (!date) continue;
    if (from && date < from) continue;
    if (to && date > to) continue;
    const hours = parseHours(row?.hours);
    if (hours <= 0) continue;
    let projectId = text(row?.projectId);
    if (!ids.has(projectId)) projectId = byNumber.get(projectNumberKey(row?.projectNumber)) || '';
    if (!projectId) continue;
    if (!out.has(projectId)) out.set(projectId, { weeks: new Map(), total: 0, first: '', last: '' });
    const bucket = out.get(projectId);
    const week = mondayKey(date);
    bucket.weeks.set(week, round1((bucket.weeks.get(week) || 0) + hours));
    bucket.total = round1(bucket.total + hours);
    if (!bucket.first || date < bucket.first) bucket.first = date;
    if (!bucket.last || date > bucket.last) bucket.last = date;
  }
  return out;
}

/**
 * Utført arbeid som strek under stolpen. Uker med samme fargetrinn slås sammen.
 * Andelen er timer mot en full uke for én person, som i ressursplanen.
 */
export function activitySegments(weeks, months, monthW, { fullWeekHours = 40, today = '' } = {}) {
  if (!(weeks instanceof Map) || !weeks.size || !months?.length) return [];
  const total = months.length * monthW;
  const base = Number(fullWeekHours) > 0 ? Number(fullWeekHours) : 40;
  const limit = today ? mondayKey(today) : '';
  const rows = [...weeks.entries()]
    .filter(([key, hours]) => hours > 0 && (!limit || key <= limit))
    .sort((a, b) => a[0].localeCompare(b[0]));
  const segments = [];
  for (const [key, hours] of rows) {
    const left = xForDay(key, months, monthW);
    const right = xForDay(addDays(key, 7), months, monthW);
    if (right <= 0 || left >= total) continue;
    const pct = round1((hours / base) * 100);
    const tone = intensityOf(pct);
    const clippedLeft = Math.max(0, left);
    const clippedRight = Math.min(total, right);
    const prev = segments[segments.length - 1];
    if (prev && prev.tone.id === tone.id && Math.abs(prev.right - clippedLeft) < 0.5) {
      prev.right = clippedRight;
      prev.hours = round1(prev.hours + hours);
      prev.weeks += 1;
      prev.to = key;
      continue;
    }
    segments.push({ from: key, to: key, left: clippedLeft, right: clippedRight, hours, weeks: 1, tone });
  }
  // Biter som henger sammen tegnes som én strek, uten runde hjørner i skjøtene.
  return segments.map((row, index) => ({
    ...row,
    width: Math.max(1.5, row.right - row.left),
    joinLeft: index > 0 && Math.abs(segments[index - 1].right - row.left) < 0.5,
    joinRight: index < segments.length - 1 && Math.abs(segments[index + 1].left - row.right) < 0.5,
  }));
}

function matchesQuery(project, query) {
  const q = text(query).toLowerCase();
  if (!q) return true;
  const hay = [project?.number, project?.name, project?.client, project?.manager]
    .map((value) => text(value).toLowerCase())
    .join(' ');
  return q.split(' ').every((part) => hay.includes(part));
}

function sortKey(row) {
  return row.span.start || '9999-99-99';
}

/**
 * Rader for prosjektfremdrift, delt i aktive og avsluttede/arkiverte.
 * Sortert på planlagt start, prosjekter uten start til slutt.
 */
export function timelineRows({
  projects = [],
  contracts = [],
  timeEntries = [],
  query = '',
  today = toDateKey(new Date()),
  hoursFrom = '',
} = {}) {
  const list = (projects || []).filter((row) => row?.id && !row.deletedAt);
  const hours = projectWeekHours(timeEntries, list, { from: hoursFrom, to: today });
  const recentFrom = addDays(mondayKey(today), -7 * (RECENT_WEEKS - 1));
  const rows = list
    .filter((project) => matchesQuery(project, query))
    .map((project) => {
      const worked = hours.get(project.id) || { weeks: new Map(), total: 0, first: '', last: '' };
      let recentHours = 0;
      for (const [key, value] of worked.weeks) {
        if (key >= recentFrom && key <= today) recentHours += value;
      }
      return {
        id: project.id,
        project,
        label: projectLabel(project),
        client: text(project.client),
        phase: phaseLabel(project),
        active: isActiveProject(project),
        span: plannedSpan(project, contracts),
        weeks: worked.weeks,
        totalHours: worked.total,
        firstWorked: worked.first,
        lastWorked: worked.last,
        recentHours: round1(recentHours),
      };
    })
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.label.localeCompare(b.label, 'nb', { numeric: true }));
  return {
    active: rows.filter((row) => row.active),
    inactive: rows.filter((row) => !row.active),
  };
}

export function timelineStats(activeRows, today = toDateKey(new Date())) {
  const soon = addDays(today, ENDING_SOON_DAYS);
  let working = 0;
  let endingSoon = 0;
  let missing = 0;
  for (const row of activeRows || []) {
    if (row.recentHours > 0) working += 1;
    // Avtalt slutt, også når det finnes opsjon. Da må opsjonen tas stilling til.
    const end = row.span.end;
    if (end && end >= today && end <= soon) endingSoon += 1;
    if (!row.span.start || !row.span.end) missing += 1;
  }
  return { active: (activeRows || []).length, working, endingSoon, missing };
}

/** Kvartalsbånd for overskriften: Q1 2026 osv., klippet til vinduet. */
export function quarterBands(months) {
  const bands = [];
  (months || []).forEach((month, index) => {
    const key = `${month.year}-Q${month.quarter}`;
    const last = bands[bands.length - 1];
    if (last && last.key === key) {
      last.span += 1;
      return;
    }
    bands.push({ key, label: `Q${month.quarter} ${month.year}`, year: month.year, quarter: month.quarter, start: index, span: 1 });
  });
  return bands;
}

/** Timer som trengs for vinduet: fra vinduets start (og siste uker) til i dag. */
export function hoursRangeFor(months, today = toDateKey(new Date())) {
  const range = windowRange(months);
  const recent = addDays(mondayKey(today), -7 * RECENT_WEEKS);
  const from = range.from && range.from < recent ? range.from : recent;
  return { fromDate: from, toDate: today };
}
