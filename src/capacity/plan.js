/**
 * Kapasitetsplan under Arbeid.
 * Hver tildeling er en stillingsstørrelse (prosent av full uke, eller timer)
 * over et antall uker. Belegg måles mot den ansattes stillingsprosent.
 */
import { projectPhaseOf } from '../project/statusFilter.js';
import { kindOf } from '../employees/employmentFlags.js';
import { parseHours } from '../arbeid/hours.js';
import { scheduledHours } from '../arbeid/schedule.js';

export { kindOf };

export const FULL_WEEK_HOURS = 40;
export const STANDARD_DAY_HOURS = 8;
export const HORIZON_CHOICES = [16, 26, 52];
/** Uker bakover i ressursplanen, omtrent tre måneder. */
export const PLAN_HISTORY_WEEKS = 13;

export const BAR_COLORS = [
  '#2563eb', '#0ea5e9', '#7c3aed', '#db2777', '#ea580c', '#059669', '#b45309', '#0891b2',
];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

function text(value) {
  return String(value ?? '').trim();
}

export function round1(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

export function parseAmount(value) {
  const raw = text(value).replace('%', '').replace(/\s/g, '').replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function formatHours(value) {
  const n = round1(value);
  const textValue = Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  return textValue;
}

export function formatPercent(value) {
  const n = Math.round(Number(value) || 0);
  return `${n} %`;
}

function dateParts(input) {
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return [input.getFullYear(), input.getMonth() + 1, input.getDate()];
  }
  const raw = text(input);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function toDateKey(input) {
  const parts = dateParts(input);
  if (!parts) return '';
  const [y, m, d] = parts;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addDays(key, days) {
  const parts = dateParts(key);
  if (!parts) return '';
  const dt = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  dt.setDate(dt.getDate() + days);
  return toDateKey(dt);
}

/** Mandag for datoen, som ÅÅÅÅ-MM-DD. */
export function mondayKey(input) {
  const key = toDateKey(input);
  if (!key) return '';
  const parts = dateParts(key);
  const dt = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return toDateKey(dt);
}

export function weekKeys(startMonday, count) {
  const start = mondayKey(startMonday);
  const n = Math.max(1, Math.round(Number(count) || 1));
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(addDays(start, i * 7));
  return out;
}

export function isoWeekNumber(monday) {
  const parts = dateParts(mondayKey(monday));
  if (!parts) return 0;
  const date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  const tmp = new Date(date);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4, 12, 0, 0, 0);
  return 1 + Math.round(((tmp - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

export function weekMeta(monday) {
  const key = mondayKey(monday);
  const parts = dateParts(key);
  if (!parts) return { key: '', week: 0, short: '', date: '', month: '', monthIndex: 0 };
  return {
    key,
    week: isoWeekNumber(key),
    short: `U${isoWeekNumber(key)}`,
    date: `${String(parts[2]).padStart(2, '0')}.${String(parts[1]).padStart(2, '0')}`,
    month: MONTHS[parts[1] - 1],
    monthIndex: parts[1],
    year: parts[0],
  };
}

export function colorForKey(key) {
  const raw = text(key) || 'x';
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  return BAR_COLORS[hash % BAR_COLORS.length];
}

export function emptyPlan() {
  return {
    version: 1,
    updatedAt: '',
    weekHours: FULL_WEEK_HOURS,
    allocations: [],
  };
}

export function contractPercent(employee) {
  const raw = employee?.company?.workPercent;
  if (raw === '' || raw == null) return 100;
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 100;
  return Math.min(100, n);
}

export function employeeCapacityHours(employee, weekHours = FULL_WEEK_HOURS, monday = '') {
  const base = Number(weekHours) > 0 ? Number(weekHours) : FULL_WEEK_HOURS;
  const dayHours = base / 5;
  if (monday && (employee?.extras?.schedules || []).length) {
    let total = 0;
    for (let i = 0; i < 7; i += 1) total += scheduledHours(employee, addDays(monday, i), dayHours);
    return round1(total);
  }
  return round1((base * contractPercent(employee)) / 100);
}

function clampWeeks(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(104, n));
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return round1(Math.max(0, Math.min(250, n)));
}

export function sizeFromPercent(percent, weekHours = FULL_WEEK_HOURS) {
  const base = Number(weekHours) > 0 ? Number(weekHours) : FULL_WEEK_HOURS;
  const parsed = typeof percent === 'number' ? percent : parseAmount(percent);
  const pct = clampPercent(parsed);
  return { mode: 'percent', percent: pct, hoursPerWeek: round1((base * pct) / 100) };
}

export function sizeFromHours(hours, weekHours = FULL_WEEK_HOURS) {
  const base = Number(weekHours) > 0 ? Number(weekHours) : FULL_WEEK_HOURS;
  const parsed = typeof hours === 'number' ? hours : parseAmount(hours);
  const h = round1(Math.max(0, Math.min(base * 2.5, parsed || 0)));
  return { mode: 'hours', hoursPerWeek: h, percent: base ? round1((h / base) * 100) : 0 };
}

export function createId(prefix = 'cap') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeAllocation(raw, weekHours = FULL_WEEK_HOURS) {
  if (!raw || typeof raw !== 'object') return null;
  const employeeId = text(raw.employeeId);
  if (!employeeId) return null;
  const source = raw.source === 'dummy' ? 'dummy' : 'project';
  const projectId = source === 'project' ? text(raw.projectId) : '';
  const name = text(raw.name) || (source === 'dummy' ? 'Dummy' : 'Prosjekt');
  const start = mondayKey(raw.start);
  if (!start) return null;
  const weeks = clampWeeks(raw.weeks);
  const mode = raw.mode === 'hours' ? 'hours' : 'percent';
  const size = mode === 'hours'
    ? sizeFromHours(raw.hoursPerWeek, weekHours)
    : sizeFromPercent(raw.percent, weekHours);
  return {
    id: text(raw.id) || createId('allok'),
    employeeId,
    source,
    projectId,
    name,
    start,
    weeks,
    ...size,
    color: text(raw.color) || colorForKey(projectId || name),
  };
}

export function normalizePlan(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const weekHoursRaw = parseAmount(source.weekHours);
  const weekHours = weekHoursRaw && weekHoursRaw > 0
    ? round1(Math.min(80, weekHoursRaw))
    : FULL_WEEK_HOURS;
  const seen = new Set();
  const allocations = (Array.isArray(source.allocations) ? source.allocations : [])
    .map((row) => normalizeAllocation(row, weekHours))
    .filter((row) => {
      if (!row || seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  return {
    version: 1,
    updatedAt: text(source.updatedAt),
    weekHours,
    allocations,
  };
}

export function planHasData(plan) {
  return (plan?.allocations || []).length > 0;
}

export function rescaleWeekHours(plan, nextHours) {
  const current = normalizePlan(plan);
  const parsed = parseAmount(nextHours);
  const weekHours = parsed && parsed > 0 ? round1(Math.min(80, parsed)) : current.weekHours;
  return normalizePlan({
    ...current,
    weekHours,
    updatedAt: new Date().toISOString(),
    allocations: current.allocations.map((row) => (
      row.mode === 'hours'
        ? { ...row, ...sizeFromHours(row.hoursPerWeek, weekHours) }
        : { ...row, ...sizeFromPercent(row.percent, weekHours) }
    )),
  });
}

export function allocationEnd(alloc) {
  return addDays(alloc.start, alloc.weeks * 7);
}

/** Siste dag som inngår i tildelingen, søndag i siste uke. */
export function allocationInclusiveEnd(alloc) {
  if (!alloc?.start) return '';
  const weeks = Math.max(1, Math.round(Number(alloc.weeks) || 1));
  return addDays(alloc.start, weeks * 7 - 1);
}

/**
 * Hele uker fra mandagen i fra-datoen til og med uken som inneholder til-datoen.
 * Til-datoen er inkluderende. Ugyldig fra-dato gir null.
 */
export function spanFromDates(from, to) {
  const start = mondayKey(from);
  if (!start) return null;
  const endMonday = mondayKey(to || from);
  if (!endMonday || endMonday <= start) return { start, weeks: 1 };
  const a = dateParts(start);
  const b = dateParts(endMonday);
  const msA = new Date(a[0], a[1] - 1, a[2], 12);
  const msB = new Date(b[0], b[1] - 1, b[2], 12);
  const weeks = Math.round((msB - msA) / (7 * 86400000)) + 1;
  return { start, weeks: Math.max(1, Math.min(104, weeks)) };
}

export function allocationCovers(alloc, monday) {
  const key = mondayKey(monday);
  if (!alloc || !key) return false;
  return key >= alloc.start && key < allocationEnd(alloc);
}

export function placement(alloc, weeks) {
  if (!alloc || !weeks?.length) return null;
  const first = weeks[0];
  const end = allocationEnd(alloc);
  if (end <= first || alloc.start > weeks[weeks.length - 1]) return null;
  const visibleStart = alloc.start < first ? first : alloc.start;
  const startIndex = weeks.indexOf(visibleStart);
  if (startIndex < 0) return null;
  let endIndex = weeks.findIndex((key) => key >= end);
  if (endIndex < 0) endIndex = weeks.length;
  const span = endIndex - startIndex;
  if (span <= 0) return null;
  return { startIndex, span };
}

export function packLanes(allocations, weeks) {
  const placed = (allocations || [])
    .map((alloc) => ({ alloc, place: placement(alloc, weeks) }))
    .filter((row) => row.place);
  placed.sort((a, b) => (
    a.place.startIndex - b.place.startIndex || b.place.span - a.place.span
  ));
  const laneEnds = [];
  const items = [];
  for (const row of placed) {
    let lane = laneEnds.findIndex((end) => end <= row.place.startIndex);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = row.place.startIndex + row.place.span;
    items.push({ alloc: row.alloc, place: row.place, lane });
  }
  return { items, laneCount: Math.max(1, laneEnds.length) };
}

export function weekLoad(allocations, employeeId, monday) {
  const rows = (allocations || []).filter((row) => (
    row.employeeId === employeeId && allocationCovers(row, monday)
  ));
  const hours = round1(rows.reduce((sum, row) => sum + row.hoursPerWeek, 0));
  const percent = round1(rows.reduce((sum, row) => sum + row.percent, 0));
  return { hours, percent, rows };
}

export function occupancy(employee, allocations, monday, weekHours) {
  const capacity = employeeCapacityHours(employee, weekHours, monday);
  const load = weekLoad(allocations, employee?.id, monday);
  const ofContract = capacity > 0 ? round1((load.hours / capacity) * 100) : 0;
  const freeHours = round1(capacity - load.hours);
  return { ...load, capacity, ofContract, freeHours };
}

export function loadTone(ofContract) {
  const n = Number(ofContract) || 0;
  if (n > 100.5) return 'over';
  if (n >= 85) return 'full';
  if (n >= 40) return 'ok';
  return 'open';
}

export const TONE_COLOR = {
  over: '#e11d48',
  full: '#d97706',
  ok: '#0284c7',
  open: '#10b981',
};

export function firstSlackWeek(employee, allocations, weeks, weekHours) {
  for (const key of weeks || []) {
    const row = occupancy(employee, allocations, key, weekHours);
    if (row.freeHours > 0.05) {
      return {
        key,
        freeHours: row.freeHours,
        freePercent: row.capacity ? round1((row.freeHours / row.capacity) * 100) : 0,
        meta: weekMeta(key),
      };
    }
  }
  return null;
}

export function companyWeekLoad(people, allocations, monday, weekHours) {
  let capacity = 0;
  let hours = 0;
  for (const person of people || []) {
    const row = occupancy(person, allocations, monday, weekHours);
    capacity += row.capacity;
    hours += row.hours;
  }
  capacity = round1(capacity);
  hours = round1(hours);
  const ofContract = capacity > 0 ? round1((hours / capacity) * 100) : 0;
  return { capacity, hours, ofContract, freeHours: round1(capacity - hours) };
}

export function weekSeries(people, allocations, weeks, weekHours) {
  return (weeks || []).map((key) => ({
    key,
    meta: weekMeta(key),
    ...companyWeekLoad(people, allocations, key, weekHours),
  }));
}

export function activeEmployees(employees) {
  return (employees || []).filter((row) => {
    const status = text(row?.company?.status || 'active');
    return status === 'active' || status === 'current';
  });
}

export function kindLabel(kind) {
  if (kind === 'external') return 'Ekstern';
  if (kind === 'innleid') return 'Innleid';
  return 'Intern';
}

export function matchesKind(employee, filter) {
  if (!filter || filter === 'alle') return true;
  return kindOf(employee) === filter;
}

export function isActiveProject(project) {
  if (!project || project.status === 'arkivert') return false;
  return projectPhaseOf(project) !== 'avsluttet';
}

export function activeProjects(projects) {
  return (projects || []).filter(isActiveProject);
}

export function projectsForEmployee(projects, members, employeeId) {
  const id = text(employeeId);
  const memberIds = new Set(
    (members || [])
      .filter((row) => text(row.employeeId) === id && row.active !== false)
      .map((row) => text(row.projectId)),
  );
  return activeProjects(projects).filter((project) => memberIds.has(project.id));
}

export function projectLabel(project) {
  const number = text(project?.number);
  const name = text(project?.name) || 'Prosjekt';
  return number ? `${number} ${name}` : name;
}

export function suggestSpan(project, horizonStart, fallbackWeeks = 8) {
  const origin = mondayKey(horizonStart);
  const startRaw = mondayKey(project?.start);
  const endRaw = mondayKey(project?.end);
  const start = startRaw && startRaw >= origin ? startRaw : origin;
  if (endRaw && endRaw >= start) {
    const msStart = dateParts(start);
    const msEnd = dateParts(endRaw);
    const a = new Date(msStart[0], msStart[1] - 1, msStart[2], 12);
    const b = new Date(msEnd[0], msEnd[1] - 1, msEnd[2], 12);
    const weeks = Math.max(1, Math.round((b - a) / (7 * 86400000)) + 1);
    return { start, weeks: Math.min(52, weeks) };
  }
  return { start, weeks: fallbackWeeks };
}

export function makeAllocation({
  employeeId,
  project = null,
  name = '',
  start,
  weeks = 8,
  percent = 50,
  weekHours = FULL_WEEK_HOURS,
  source,
}) {
  const dummy = source === 'dummy' || !project;
  const label = text(name) || (dummy ? 'Dummy' : projectLabel(project));
  return normalizeAllocation({
    id: createId('allok'),
    employeeId,
    source: dummy ? 'dummy' : 'project',
    projectId: dummy ? '' : project.id,
    name: label,
    start: mondayKey(start),
    weeks,
    mode: 'percent',
    percent,
    color: colorForKey(dummy ? label : project.id),
  }, weekHours);
}

export function patchAllocation(plan, id, patch) {
  const current = normalizePlan(plan);
  return {
    ...current,
    updatedAt: new Date().toISOString(),
    allocations: current.allocations.map((row) => {
      if (row.id !== id) return row;
      const next = { ...row, ...patch };
      if (patch.percent != null && patch.hoursPerWeek == null) {
        Object.assign(next, sizeFromPercent(patch.percent, current.weekHours), { mode: 'percent' });
      } else if (patch.hoursPerWeek != null && patch.percent == null) {
        Object.assign(next, sizeFromHours(patch.hoursPerWeek, current.weekHours), { mode: 'hours' });
      }
      return normalizeAllocation(next, current.weekHours);
    }).filter(Boolean),
  };
}

export function removeAllocation(plan, id) {
  const current = normalizePlan(plan);
  return {
    ...current,
    updatedAt: new Date().toISOString(),
    allocations: current.allocations.filter((row) => row.id !== id),
  };
}

export function addAllocation(plan, input) {
  const current = normalizePlan(plan);
  const row = normalizeAllocation({ ...input, id: input.id || createId('allok') }, current.weekHours);
  if (!row) return current;
  return {
    ...current,
    updatedAt: new Date().toISOString(),
    allocations: [...current.allocations, row],
  };
}

export function shiftPreview(alloc, deltaWeeks, mode = 'move') {
  const delta = Math.round(Number(deltaWeeks) || 0);
  if (mode === 'resize') return { ...alloc, weeks: clampWeeks(alloc.weeks + delta) };
  return { ...alloc, start: addDays(alloc.start, delta * 7) };
}

/** Første dato som teller som «aktiv siste tre måneder». */
export function planActivityFrom(today = new Date()) {
  const base = today instanceof Date && !Number.isNaN(today.getTime()) ? today : new Date();
  const from = new Date(base.getFullYear(), base.getMonth() - 3, base.getDate(), 12, 0, 0, 0);
  return toDateKey(from);
}

/** Synlig tidsskala: historikk før ankeruken, deretter planleggingshorisonten. */
export function visibleWeekKeys(origin, horizon, historyWeeks = PLAN_HISTORY_WEEKS) {
  const anchor = mondayKey(origin);
  const back = Math.max(0, Math.round(Number(historyWeeks) || 0));
  const start = back ? addDays(anchor, -back * 7) : anchor;
  return weekKeys(start, back + Math.max(1, Math.round(Number(horizon) || 1)));
}

/**
 * Påløpte timer per prosjekt og uke (mandag-nøkkel).
 * Returnerer Map<projectId, Map<weekKey, hours>>.
 */
export function weeklyActualHours(entries, employeeId, weeks) {
  const wanted = new Set((weeks || []).map((key) => mondayKey(key)).filter(Boolean));
  const id = text(employeeId);
  const byProject = new Map();
  for (const row of entries || []) {
    if (text(row?.employeeId) !== id) continue;
    const hours = parseHours(row?.hours);
    if (hours <= 0) continue;
    const week = mondayKey(row?.date);
    if (!week || (wanted.size && !wanted.has(week))) continue;
    const projectId = text(row?.projectId);
    if (!projectId) continue;
    if (!byProject.has(projectId)) byProject.set(projectId, new Map());
    const bucket = byProject.get(projectId);
    bucket.set(week, round1((bucket.get(week) || 0) + hours));
  }
  return byProject;
}

export function actualHoursForWeek(entries, employeeId, monday) {
  const key = mondayKey(monday);
  const id = text(employeeId);
  if (!key || !id) return 0;
  let total = 0;
  for (const row of entries || []) {
    if (text(row?.employeeId) !== id) continue;
    if (mondayKey(row?.date) !== key) continue;
    const hours = parseHours(row?.hours);
    if (hours > 0) total += hours;
  }
  return round1(total);
}

function entryLabel(row) {
  return projectLabel({
    number: row?.projectNumber,
    name: text(row?.projectName) || 'Prosjekt',
  });
}

/**
 * Rader i ressursplanen: prosjekt med timer i aktivitetsvinduet,
 * pluss det som allerede ligger som plan eller dummy.
 * Medlemskap alene gir ingen rad.
 */
export function planningRows({
  projects = [],
  allocations = [],
  timeEntries = [],
  employeeId,
  activityFrom = '',
} = {}) {
  const id = text(employeeId);
  const projectById = new Map((projects || []).filter((row) => row?.id).map((row) => [row.id, row]));
  const recent = new Map();
  const fallbackName = new Map();
  for (const row of timeEntries || []) {
    if (text(row?.employeeId) !== id) continue;
    const date = text(row?.date);
    if (activityFrom && date && date < activityFrom) continue;
    const hours = parseHours(row?.hours);
    if (hours <= 0) continue;
    const projectId = text(row?.projectId);
    if (!projectId) continue;
    recent.set(projectId, round1((recent.get(projectId) || 0) + hours));
    if (!fallbackName.has(projectId)) fallbackName.set(projectId, entryLabel(row));
  }

  const rows = [];
  const seen = new Set();
  for (const alloc of allocations || []) {
    if (alloc?.employeeId !== id) continue;
    if (alloc.source === 'dummy' || !alloc.projectId) {
      rows.push({
        key: `alloc:${alloc.id}`,
        allocId: alloc.id,
        projectId: '',
        project: null,
        name: alloc.name || 'Dummy',
        source: 'dummy',
        recentHours: 0,
      });
      continue;
    }
    if (seen.has(alloc.projectId)) continue;
    seen.add(alloc.projectId);
    const project = projectById.get(alloc.projectId) || null;
    rows.push({
      key: `project:${alloc.projectId}`,
      allocId: '',
      projectId: alloc.projectId,
      project,
      name: project ? projectLabel(project) : (alloc.name || fallbackName.get(alloc.projectId) || 'Prosjekt'),
      source: 'project',
      recentHours: recent.get(alloc.projectId) || 0,
    });
  }
  for (const [projectId, hours] of recent) {
    if (seen.has(projectId)) continue;
    seen.add(projectId);
    const project = projectById.get(projectId) || null;
    rows.push({
      key: `project:${projectId}`,
      allocId: '',
      projectId,
      project,
      name: project ? projectLabel(project) : (fallbackName.get(projectId) || 'Prosjekt'),
      source: 'project',
      recentHours: hours,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  return rows;
}

export function spanBetween(weeks, indexA, indexB) {
  const list = weeks || [];
  if (!list.length) return null;
  const last = list.length - 1;
  const a = Math.max(0, Math.min(last, Math.round(Number(indexA) || 0)));
  const b = Math.max(0, Math.min(last, Math.round(Number(indexB) || 0)));
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  return { start: list[from], weeks: to - from + 1, from, to };
}

/** Vertikal dra: opp øker belastning i steg på 5 prosent. */
export function percentFromPointerDelta(basePercent, deltaY) {
  const base = clampPercent(basePercent);
  const steps = Math.round(-(Number(deltaY) || 0) / 14);
  return clampPercent(base + steps * 5);
}

/** Andel av den ansattes uke, i prosent. */
export function shareOfCapacity(hours, capacity) {
  const base = Number(capacity);
  if (!base || base <= 0) return 0;
  return round1(((Number(hours) || 0) / base) * 100);
}

/**
 * Tydelige fargesprang for belastning. Lys blå er lav, mørk blå er høy.
 * Over 100 % er nesten svart.
 */
export const INTENSITY_SCALE = [
  { id: 'none', max: 0, color: '#e8eef7', ink: '#8B95A6' },
  { id: 's1', max: 20, color: '#dbeafe', ink: '#1e3a8a' },
  { id: 's2', max: 40, color: '#93c5fd', ink: '#1e3a8a' },
  { id: 's3', max: 60, color: '#3b82f6', ink: '#ffffff' },
  { id: 's4', max: 80, color: '#1d4ed8', ink: '#ffffff' },
  { id: 's5', max: 100, color: '#1e3a8a', ink: '#ffffff' },
  { id: 's6', max: Infinity, color: '#172554', ink: '#ffffff' },
];

export function intensityOf(percent) {
  const n = Number(percent) || 0;
  if (n <= 0) return INTENSITY_SCALE[0];
  for (const step of INTENSITY_SCALE) {
    if (n <= step.max) return step;
  }
  return INTENSITY_SCALE[INTENSITY_SCALE.length - 1];
}

/**
 * Fravær per uke. fromDate begrenser til planlagt fravær fra og med den datoen.
 * Returnerer Map<weekKey, { hours, type }>.
 */
export function weeklyAbsenceHours(absences, employeeId, weeks, fromDate = '') {
  const wanted = new Set((weeks || []).map((key) => mondayKey(key)).filter(Boolean));
  const id = text(employeeId);
  const from = text(fromDate);
  const byWeek = new Map();
  for (const row of absences || []) {
    if (text(row?.employeeId) !== id) continue;
    const date = text(row?.date);
    if (!date || (from && date < from)) continue;
    const week = mondayKey(date);
    if (!week || (wanted.size && !wanted.has(week))) continue;
    let hours = parseHours(row?.hours);
    if (hours <= 0 && Number(row?.percent) > 0) {
      hours = round1((Number(row.percent) / 100) * (FULL_WEEK_HOURS / 5));
    }
    if (hours <= 0) continue;
    const current = byWeek.get(week) || { hours: 0, type: text(row?.type) || 'ferie' };
    current.hours = round1(current.hours + hours);
    if (!current.type) current.type = text(row?.type) || 'ferie';
    byWeek.set(week, current);
  }
  return byWeek;
}
