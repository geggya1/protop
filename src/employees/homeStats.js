/**
 * Tall til hovedsiden for én ansatt.
 *
 * Mulig tid per dag er stillingsprosenten (eller tidsplanen) av normaldagen,
 * uten helg og røde dager, innenfor ansettelsesperioden. Det er samme regnestykke
 * som Fakturerbar tid i HR (src/hr/billable.js), bare per dag, uke og måned.
 * Fakturerbart er fakturerbare timer på kundeprosjekt. Interntid, tid på eget
 * selskap og fravær er ikke fakturerbart.
 */
import { absenceTypeById } from '../arbeid/absenceCatalog.js';
import { isoWeek, pad2, parseDateKey, toDateKey } from '../arbeid/calendar.js';
import { agreedHoursForDate, resolveRedDays } from '../arbeid/holidays.js';
import { parseHours } from '../arbeid/hours.js';
import { STANDARD_DAY_HOURS, scheduledHours } from '../arbeid/schedule.js';
import { isInternalAbsenceType } from '../hr/billable.js';
import { entryProductivity } from '../hr/productivity.js';

const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const DAY_SHORT = ['Sø', 'Ma', 'Ti', 'On', 'To', 'Fr', 'Lø'];

function text(value) {
  return String(value ?? '').trim();
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function isoDay(value) {
  const raw = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function mondayOf(date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

/** Dagene fra og med til og med, som YYYY-MM-DD. */
export function dayKeys(fromDate, toDate) {
  const from = parseDateKey(fromDate);
  const to = parseDateKey(toDate);
  if (!from || !to || from > to) return [];
  const keys = [];
  for (let d = from; d <= to; d = addDays(d, 1)) keys.push(toDateKey(d));
  return keys;
}

/** Datovinduet hovedsiden henter: 13 hele måneder bakover til og med uken vi er i. */
export function homeLoadWindow(today = new Date()) {
  const from = new Date(today.getFullYear(), today.getMonth() - 12, 1);
  const to = addDays(mondayOf(today), 6);
  return { fromDate: toDateKey(from), toDate: toDateKey(to) };
}

export const PERIOD_MODES = [
  { id: 'week', label: 'Uke' },
  { id: 'month', label: 'Måned' },
  { id: 'weeks12', label: 'Siste 12 uker' },
  { id: 'year', label: 'År' },
];

/**
 * Søylene i grafen for valgt periode.
 * week: dagene i uken. month: ukene i måneden. weeks12: siste 12 uker. year: siste 12 måneder.
 * previous er perioden like før, til sammenligning.
 */
export function periodBuckets(mode, today = new Date()) {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (mode === 'week') {
    const monday = mondayOf(day);
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i);
      const key = toDateKey(d);
      return { key, label: DAY_SHORT[d.getDay()], from: key, to: key };
    });
    const prevMonday = addDays(monday, -7);
    return {
      title: `Uke ${isoWeek(day)}`,
      buckets,
      previous: { from: toDateKey(prevMonday), to: toDateKey(addDays(prevMonday, 6)) },
    };
  }
  if (mode === 'month') {
    const first = new Date(day.getFullYear(), day.getMonth(), 1);
    const last = new Date(day.getFullYear(), day.getMonth() + 1, 0);
    const buckets = [];
    for (let monday = mondayOf(first); monday <= last; monday = addDays(monday, 7)) {
      const from = monday < first ? first : monday;
      const sunday = addDays(monday, 6);
      const to = sunday > last ? last : sunday;
      buckets.push({ key: toDateKey(from), label: `U${isoWeek(monday)}`, from: toDateKey(from), to: toDateKey(to) });
    }
    const prevFirst = new Date(day.getFullYear(), day.getMonth() - 1, 1);
    const prevLast = new Date(day.getFullYear(), day.getMonth(), 0);
    const name = MONTH_SHORT[day.getMonth()];
    return {
      title: `${name.charAt(0).toUpperCase()}${name.slice(1)} ${day.getFullYear()}`,
      buckets,
      previous: { from: toDateKey(prevFirst), to: toDateKey(prevLast) },
    };
  }
  if (mode === 'year') {
    const buckets = [];
    for (let i = 11; i >= 0; i -= 1) {
      const first = new Date(day.getFullYear(), day.getMonth() - i, 1);
      const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
      buckets.push({
        key: `${first.getFullYear()}-${pad2(first.getMonth() + 1)}`,
        label: MONTH_SHORT[first.getMonth()],
        from: toDateKey(first),
        to: toDateKey(last),
      });
    }
    return { title: 'Siste 12 måneder', buckets, previous: null };
  }
  // weeks12
  const monday = mondayOf(day);
  const buckets = [];
  for (let i = 11; i >= 0; i -= 1) {
    const start = addDays(monday, -7 * i);
    buckets.push({ key: toDateKey(start), label: `U${isoWeek(start)}`, from: toDateKey(start), to: toDateKey(addDays(start, 6)) });
  }
  const prevStart = addDays(monday, -7 * 24);
  return {
    title: 'Siste 12 uker',
    buckets,
    previous: { from: toDateKey(prevStart), to: toDateKey(addDays(prevStart, 7 * 12 - 1)) },
  };
}

function employmentRange(employee) {
  return { from: isoDay(employee?.company?.periodFrom), to: isoDay(employee?.company?.periodTo) };
}

/**
 * Dag for dag: avtalt (mulig) tid, fakturerbart, øvrig arbeid og fravær.
 * @returns {Map<string, { agreed: number, billable: number, other: number, absence: number }>}
 */
export function dailyLedger({
  employee,
  entries = [],
  absences = [],
  fromDate,
  toDate,
  redDays = [],
  fullDayHours = STANDARD_DAY_HOURS,
  absenceTypes,
  isOwnCompany = () => false,
} = {}) {
  const ledger = new Map();
  const keys = dayKeys(fromDate, toDate);
  if (!employee || !keys.length) return ledger;
  const dayHours = Number(fullDayHours) > 0 ? Number(fullDayHours) : STANDARD_DAY_HOURS;
  const years = [...new Set(keys.map((key) => Number(key.slice(0, 4))))];
  const red = resolveRedDays({ redDays: Array.isArray(redDays) ? redDays : [] }, years);
  const range = employmentRange(employee);
  for (const key of keys) {
    let agreed = 0;
    if (!(range.from && key < range.from) && !(range.to && key > range.to)) {
      const date = parseDateKey(key);
      agreed = agreedHoursForDate(date, {
        fullDayHours: dayHours,
        redDays: red,
        scheduleHours: scheduledHours(employee, date, dayHours),
      }).hours || 0;
    }
    ledger.set(key, { agreed, billable: 0, other: 0, absence: 0 });
  }
  const id = text(employee.id);

  for (const row of absences || []) {
    if (text(row?.employeeId) !== id) continue;
    const day = ledger.get(isoDay(row?.date));
    if (!day) continue;
    let hours = parseHours(row.hours);
    if (!(hours > 0) && Number(row.percent) > 0) hours = (day.agreed * Number(row.percent)) / 100;
    if (!(hours > 0)) continue;
    if (isInternalAbsenceType(absenceTypeById(row.type, absenceTypes))) day.other += hours;
    else day.absence += hours;
  }

  for (const row of entries || []) {
    if (text(row?.employeeId) !== id) continue;
    const day = ledger.get(isoDay(row?.date));
    if (!day) continue;
    const { total, billable } = entryProductivity(row);
    if (!(total > 0)) continue;
    const counted = isOwnCompany(row) || row.timeType === 'internal' ? 0 : billable;
    day.billable += counted;
    day.other += total - counted;
  }
  return ledger;
}

/**
 * Summen for et datovindu. Mulig tid regnes til og med i dag, så en uke som
 * pågår ikke ser dårlig ut fordi resten av uken ikke er ført ennå.
 */
export function sumLedger(ledger, from, to, { through = '' } = {}) {
  let capacity = 0;
  let planned = 0;
  let billable = 0;
  let other = 0;
  let absence = 0;
  for (const [key, day] of ledger) {
    if (key < from || key > to) continue;
    const absent = Math.min(day.absence, day.agreed);
    planned += day.agreed;
    if (!through || key <= through) {
      capacity += day.agreed;
      absence += absent;
    }
    billable += day.billable;
    other += day.other;
  }
  return {
    capacity: round1(capacity),
    planned: round1(planned),
    billable: round1(billable),
    other: round1(other),
    worked: round1(billable + other),
    absence: round1(absence),
    pct: capacity > 0 ? Math.round((billable / capacity) * 100) : null,
  };
}

/** Grafen og nøkkeltallene for valgt periode. */
export function productivitySeries(ledger, mode, { today = new Date() } = {}) {
  const todayKey = toDateKey(today);
  const plan = periodBuckets(mode, today);
  const bars = plan.buckets.map((bucket) => ({
    ...bucket,
    future: bucket.from > todayKey,
    ...sumLedger(ledger, bucket.from, bucket.to, { through: todayKey }),
  }));
  const first = plan.buckets[0]?.from || todayKey;
  const last = plan.buckets[plan.buckets.length - 1]?.to || todayKey;
  const total = sumLedger(ledger, first, last, { through: todayKey });
  let previous = null;
  if (plan.previous) {
    const prev = sumLedger(ledger, plan.previous.from, plan.previous.to, { through: todayKey });
    if (prev.capacity > 0) previous = prev;
  }
  return {
    mode,
    title: plan.title,
    bars,
    total,
    previous,
    deltaPp: previous && total.pct != null && previous.pct != null ? total.pct - previous.pct : null,
  };
}

/** Uken vi er i: registrert arbeid mot planlagt tid (avtalt tid minus fravær). */
const WEEK_DAY_LABELS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

export function weekWork(ledger, today = new Date()) {
  const monday = mondayOf(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const from = toDateKey(monday);
  const to = toDateKey(addDays(monday, 6));
  let planned = 0;
  let worked = 0;
  for (const [key, day] of ledger) {
    if (key < from || key > to) continue;
    planned += Math.max(0, day.agreed - day.absence);
    worked += day.billable + day.other;
  }
  // Dag for dag (man–søn), til stolpene på Min side. Hver dag kan åpnes i timelisten.
  const todayKey = toDateKey(today);
  const days = WEEK_DAY_LABELS.map((label, index) => {
    const key = toDateKey(addDays(monday, index));
    const day = ledger.get(key);
    return {
      key,
      label,
      planned: round1(day ? Math.max(0, day.agreed - day.absence) : 0),
      worked: round1(day ? day.billable + day.other : 0),
      absence: round1(day ? day.absence : 0),
      today: key === todayKey,
      future: key > todayKey,
    };
  });
  return {
    week: isoWeek(monday),
    planned: round1(planned),
    worked: round1(worked),
    pct: planned > 0 ? Math.round((worked / planned) * 100) : null,
    days,
  };
}

const ABSENCE_GROUPS = [
  { id: 'ferie', label: 'Ferie', match: (type) => type.category === 'Ferie' },
  { id: 'egenmelding', label: 'Egenmelding', match: (type) => type.id === 'egenmelding' },
  { id: 'syk', label: 'Sykdom', match: (type) => type.category === 'Sykdom' },
  { id: 'annet', label: 'Annet fravær', match: () => true },
];

/** Fravær i år i dager, delt på ferie, egenmelding, sykdom og annet. Interntid er ikke fravær. */
export function absenceYear({
  employee, absences = [], absenceTypes, ledger, today = new Date(), fullDayHours = STANDARD_DAY_HOURS,
} = {}) {
  const id = text(employee?.id);
  const year = String(today.getFullYear());
  const todayKey = toDateKey(today);
  const dayHours = Number(fullDayHours) > 0 ? Number(fullDayHours) : STANDARD_DAY_HOURS;
  const sums = new Map(ABSENCE_GROUPS.map((group) => [group.id, 0]));
  for (const row of absences || []) {
    if (text(row?.employeeId) !== id) continue;
    const date = isoDay(row?.date);
    if (!date.startsWith(year) || date > todayKey) continue;
    const type = absenceTypeById(row.type, absenceTypes) || { id: text(row.type), category: 'Annet fravær' };
    if (isInternalAbsenceType(type)) continue;
    const agreed = ledger?.get(date)?.agreed || 0;
    const base = agreed > 0 ? agreed : dayHours;
    let share = 1;
    const hours = parseHours(row.hours);
    if (hours > 0) share = Math.min(1, hours / base);
    else if (Number(row.percent) > 0) share = Math.min(1, Number(row.percent) / 100);
    const group = ABSENCE_GROUPS.find((g) => g.match(type));
    sums.set(group.id, sums.get(group.id) + share);
  }
  const groups = ABSENCE_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    days: Math.round(sums.get(group.id) * 2) / 2,
  }));
  const total = Math.round(groups.reduce((acc, g) => acc + g.days, 0) * 2) / 2;
  return { year: Number(year), total, groups };
}

/** Prosjektene med flest timer siden datoen, med timer og siste dato. */
export function recentProjects({ employeeId, entries = [], projects = [], since = '' } = {}) {
  const id = text(employeeId);
  const byId = new Map((projects || []).map((p) => [text(p.id), p]));
  const hours = new Map();
  for (const row of entries || []) {
    if (text(row?.employeeId) !== id) continue;
    const date = isoDay(row?.date);
    if (since && date && date < since) continue;
    const projectId = text(row.projectId);
    if (!projectId) continue;
    const h = parseHours(row.hours);
    if (!(h > 0)) continue;
    const prev = hours.get(projectId) || { hours: 0, lastDate: '', name: text(row.projectName), number: text(row.projectNumber), client: text(row.customerName) };
    prev.hours += h;
    if (date > prev.lastDate) prev.lastDate = date;
    hours.set(projectId, prev);
  }
  return [...hours.entries()]
    .map(([projectId, meta]) => {
      const project = byId.get(projectId);
      if (project?.status === 'arkivert') return null;
      return {
        id: projectId,
        project: project || null,
        number: text(project?.number) || meta.number,
        name: text(project?.name || project?.title) || meta.name || 'Prosjekt',
        client: text(project?.client) || meta.client,
        hours: round1(meta.hours),
        lastDate: meta.lastDate,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.hours - a.hours || b.lastDate.localeCompare(a.lastDate));
}

/** «160 t», «7,5 t». */
export function formatHoursShort(value) {
  const n = round1(value);
  return `${String(n).replace('.', ',')} t`;
}
