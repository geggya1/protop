/**
 * Fakturerbar tid per måned for egne ansatte.
 *
 * Mulig tid er stillingsprosenten (eller tidsplanen) ganget med arbeidsdagene
 * i måneden, uten helg og helligdager, innenfor ansettelsesperioden.
 * Fravær, ikke-fakturerbar tid og tid ført på eget selskap trekker ned.
 * Andelen er fakturerbare timer delt på mulig tid.
 */
import { absenceTypeById } from '../arbeid/absenceCatalog.js';
import { buildMonthGrid, monthLabel, pad2 } from '../arbeid/calendar.js';
import { agreedHoursForDate, resolveRedDays } from '../arbeid/holidays.js';
import { parseHours } from '../arbeid/hours.js';
import { STANDARD_DAY_HOURS, scheduledHours } from '../arbeid/schedule.js';
import { displayName } from '../employees/model.js';
import { localIsoDate, normalizeIsoDate } from './model.js';
import { entryProductivity } from './productivity.js';

function text(value) {
  return String(value ?? '').trim();
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

/** ÅÅÅÅ-MM for datoen. */
export function monthKeyOf(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function parseMonthKey(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(text(key));
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(match[1]), monthIndex: month - 1 };
}

export function shiftMonthKey(key, delta) {
  const parts = parseMonthKey(key) || parseMonthKey(monthKeyOf());
  return monthKeyOf(new Date(parts.year, parts.monthIndex + (Number(delta) || 0), 1));
}

/**
 * Datovindu for måneden. Inneværende måned regnes til og med i dag,
 * en framtidig måned har ingen dager ennå.
 */
export function monthWindow(key, today = new Date()) {
  const current = monthKeyOf(today);
  const parts = parseMonthKey(key) || parseMonthKey(current);
  const month = `${parts.year}-${pad2(parts.monthIndex + 1)}`;
  const lastDay = new Date(parts.year, parts.monthIndex + 1, 0).getDate();
  const fromDate = `${month}-01`;
  const toDate = `${month}-${pad2(lastDay)}`;
  const todayKey = localIsoDate(today);
  let throughDate = toDate;
  if (month === current) throughDate = todayKey;
  else if (month > current) throughDate = '';
  return {
    key: month,
    year: parts.year,
    monthIndex: parts.monthIndex,
    fromDate,
    toDate,
    throughDate,
    current: month === current,
    future: month > current,
    label: monthLabel(parts.year, parts.monthIndex),
  };
}

/** Navn uten selskapsform og tegn, så «Consult1 AS» og «CONSULT1» er like. */
export function companyNameKey(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9æøåäöü]+/g, ' ')
    .replace(/\b(as|asa|ans|da|sa|ba|enk|nuf)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function orgnrKey(value) {
  return text(value).replace(/\D/g, '');
}

/**
 * Er timeføringen ført på eget selskap? Prosjekt med selskapets orgnr
 * eller oppdragsgivernavn, eller kunde med samme navn som selskapet.
 */
export function ownCompanyMatcher({ name = '', orgnr = '', projects = [] } = {}) {
  const wantName = companyNameKey(name);
  const wantOrg = orgnrKey(orgnr);
  const ownProjects = new Set();
  for (const project of projects || []) {
    if (!project?.id) continue;
    const byOrg = wantOrg && orgnrKey(project.orgnr) === wantOrg;
    const byName = wantName && companyNameKey(project.client) === wantName;
    if (byOrg || byName) ownProjects.add(text(project.id));
  }
  return (entry) => {
    if (!entry) return false;
    if (ownProjects.has(text(entry.projectId))) return true;
    return !!wantName && companyNameKey(entry.customerName) === wantName;
  };
}

/** Interntid registrert som fraværstype er arbeid, bare ikke fakturerbart. */
export function isInternalAbsenceType(type) {
  return /^intern/i.test(text(type?.id)) || /^interntid/i.test(text(type?.label));
}

function employmentRange(employee) {
  return {
    from: normalizeIsoDate(employee?.company?.periodFrom),
    to: normalizeIsoDate(employee?.company?.periodTo),
  };
}

function workPercent(employee) {
  const raw = text(employee?.company?.workPercent).replace('%', '').replace(',', '.');
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 ? Math.min(100, n) : 100;
}

function personSummary(person) {
  const absence = [...person.absenceByDay.entries()]
    .reduce((sum, [day, hours]) => sum + Math.min(hours, person.agreedByDay.get(day) || 0), 0);
  const nonBillable = person.nonBillable + person.internal;
  const spent = absence + person.billable + nonBillable;
  const unlogged = Math.max(0, person.capacity - spent);
  const over = Math.max(0, spent - person.capacity);
  return {
    id: person.id,
    employee: person.employee,
    name: displayName(person.employee),
    workPercent: workPercent(person.employee),
    capacity: round1(person.capacity),
    absence: round1(absence),
    billable: round1(person.billable),
    nonBillable: round1(nonBillable),
    ownCompany: round1(person.ownCompany),
    unlogged: round1(unlogged),
    over: round1(over),
    pct: person.capacity > 0 ? round1((person.billable / person.capacity) * 100) : null,
  };
}

/**
 * @param {object} input
 * @param {Array} input.staff egne ansatte (uten eksterne og innleide)
 * @param {Array} input.entries timeføringer for måneden
 * @param {Array} input.absences fravær for måneden
 * @param {string} input.month ÅÅÅÅ-MM
 * @param {Array} [input.redDays] lagrede røde dager fra Arbeid. Norske helligdager ligger alltid inne.
 * @param {number} [input.fullDayHours] normaldag for selskapet
 * @param {Array} [input.absenceTypes] selskapets fraværstyper
 * @param {(entry: object) => boolean} [input.isOwnCompany]
 */
export function billableMonth({
  staff = [],
  entries = [],
  absences = [],
  month = '',
  today = new Date(),
  redDays = [],
  fullDayHours = STANDARD_DAY_HOURS,
  absenceTypes,
  isOwnCompany = () => false,
} = {}) {
  const win = monthWindow(month || monthKeyOf(today), today);
  const dayHours = Number(fullDayHours) > 0 ? Number(fullDayHours) : STANDARD_DAY_HOURS;
  const red = resolveRedDays({ redDays: Array.isArray(redDays) ? redDays : [] }, [win.year]);
  const days = win.throughDate
    ? buildMonthGrid(win.year, win.monthIndex).days.filter((day) => day.key <= win.throughDate)
    : [];
  const inWindow = (date) => !!win.throughDate && date >= win.fromDate && date <= win.throughDate;

  const people = new Map();
  for (const employee of staff || []) {
    if (!employee?.id) continue;
    const range = employmentRange(employee);
    const agreedByDay = new Map();
    let capacity = 0;
    for (const day of days) {
      if (range.from && day.key < range.from) continue;
      if (range.to && day.key > range.to) continue;
      const { hours } = agreedHoursForDate(day.date, {
        fullDayHours: dayHours,
        redDays: red,
        scheduleHours: scheduledHours(employee, day.date, dayHours),
      });
      if (hours > 0) {
        agreedByDay.set(day.key, hours);
        capacity += hours;
      }
    }
    people.set(text(employee.id), {
      id: text(employee.id),
      employee,
      agreedByDay,
      capacity,
      absenceByDay: new Map(),
      internal: 0,
      billable: 0,
      nonBillable: 0,
      ownCompany: 0,
    });
  }

  for (const row of absences || []) {
    const person = people.get(text(row?.employeeId));
    const date = text(row?.date);
    if (!person || !inWindow(date)) continue;
    const agreed = person.agreedByDay.get(date) || 0;
    let hours = parseHours(row.hours);
    if (!(hours > 0) && Number(row.percent) > 0) hours = (agreed * Number(row.percent)) / 100;
    if (!(hours > 0)) continue;
    if (isInternalAbsenceType(absenceTypeById(row.type, absenceTypes))) {
      person.internal += hours;
      continue;
    }
    person.absenceByDay.set(date, (person.absenceByDay.get(date) || 0) + hours);
  }

  for (const row of entries || []) {
    const person = people.get(text(row?.employeeId));
    if (!person || !inWindow(text(row?.date))) continue;
    const { total, billable } = entryProductivity(row);
    if (!(total > 0)) continue;
    const own = isOwnCompany(row);
    const counted = own || row.timeType === 'internal' ? 0 : billable;
    person.billable += counted;
    person.nonBillable += total - counted;
    if (own) person.ownCompany += total;
  }

  const rows = [...people.values()]
    .map(personSummary)
    .filter((row) => row.capacity > 0 || row.billable > 0 || row.nonBillable > 0)
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.name.localeCompare(b.name, 'nb'));
  const sum = (key) => round1(rows.reduce((acc, row) => acc + row[key], 0));
  const capacity = sum('capacity');
  const absence = sum('absence');
  const billable = sum('billable');
  const nonBillable = sum('nonBillable');
  const over = sum('over');
  // Fra summene, så regnestykket mulig − fravær − ikke fakturerbart − ikke ført + over = fakturerbart går opp.
  const unlogged = Math.max(0, round1(capacity - absence - billable - nonBillable + over));
  return {
    ...win,
    rows,
    capacity,
    absence,
    billable,
    nonBillable,
    ownCompany: sum('ownCompany'),
    unlogged,
    over,
    pct: capacity > 0 ? round1((billable / capacity) * 100) : null,
  };
}

/** «1 240,5 t». */
export function formatTimer(value) {
  const n = round1(value);
  const [whole, decimals] = Math.abs(n).toFixed(1).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '−' : ''}${grouped}${decimals === '0' ? '' : `,${decimals}`} t`;
}
