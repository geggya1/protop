/**
 * Tall til fraværsoversikten: feriesaldo, hvem som er borte i dag,
 * månedsfordeling og sammenhengende fraværsperioder.
 */

import { ABSENCE_TYPES, absenceTypeById } from './absenceCatalog.js';
import { hoursToDays, buildAbsenceOverview } from './balance.js';

export const STATUTORY_VACATION_DAYS = 25;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];

const SICK = new Set(['syk_melding', 'egenmelding', 'sykdom', 'syk_uten']);
const LEAVE = new Set(['foreldre', 'permisjon']);

const CATEGORY_TITLE = {
  ferie: 'Ferie',
  sykdom: 'Sykdom',
  permisjon: 'Permisjon',
  annet: 'Annet fravær',
};

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

export function parseIsoDate(iso) {
  const [year, month, day] = String(iso || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function formatIsoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatNbDate(iso) {
  const date = parseIsoDate(iso);
  if (!date) return '';
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function formatShortDate(iso) {
  const date = parseIsoDate(iso);
  if (!date) return '';
  return `${date.getDate()}.${date.getMonth() + 1}`;
}

export function absenceBucket(typeId) {
  const id = String(typeId || 'ferie');
  if (id === 'ferie') return 'ferie';
  if (SICK.has(id)) return 'sykdom';
  return 'annet';
}

/** Ferie, sykdom og permisjon er egne valg. Alt annet samles som annet. */
export function absenceCategory(typeId) {
  const id = String(typeId || 'ferie');
  if (id === 'ferie') return 'ferie';
  if (SICK.has(id)) return 'sykdom';
  if (LEAVE.has(id)) return 'permisjon';
  return 'annet';
}

export function matchesCategory(typeId, category) {
  if (!category) return true;
  if (category === 'ferie' || category === 'sykdom' || category === 'permisjon' || category === 'annet') {
    return absenceCategory(typeId) === category;
  }
  return String(typeId || 'ferie') === String(category);
}

export function recentMonthSlots(today, count = 6) {
  const base = parseIsoDate(today) || new Date();
  const slots = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(base.getFullYear(), base.getMonth() - offset, 1);
    slots.push({
      key: `${date.getFullYear()}-${pad(date.getMonth() + 1)}`,
      label: MONTHS[date.getMonth()],
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      ferie: 0,
      sykdom: 0,
      annet: 0,
    });
  }
  return slots;
}

function balanceTypeIds(category, scoped, adjustments, selectedIds) {
  if (category === 'ferie') return ['ferie'];
  if (category === 'sykdom') return [...SICK];
  if (category === 'permisjon') return [...LEAVE];
  if (category === 'annet') {
    const ids = new Set(
      ABSENCE_TYPES.filter((row) => absenceCategory(row.id) === 'annet').map((row) => row.id),
    );
    for (const row of scoped) {
      if (selectedIds.has(row.employeeId) && absenceCategory(row.type) === 'annet') ids.add(row.type || 'annet');
    }
    for (const row of adjustments || []) {
      if (selectedIds.has(row.employeeId) && absenceCategory(row.typeId) === 'annet') ids.add(row.typeId || 'annet');
    }
    return [...ids];
  }
  return [category];
}

export function eachWeekday(from, to) {
  if (!parseIsoDate(from) || !parseIsoDate(to) || to < from) return [];
  const out = [];
  const cursor = parseIsoDate(from);
  const end = to;
  let guard = 0;
  while (formatIsoDate(cursor) <= end && guard < 400) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) out.push(formatIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return out;
}

function dayGap(prev, next) {
  const a = parseIsoDate(prev);
  const b = parseIsoDate(next);
  if (!a || !b) return 99;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Helg mellom to virkedager regnes som samme fraværsperiode. */
function continuesPeriod(prev, next) {
  const gap = dayGap(prev, next);
  if (gap <= 1) return gap === 1;
  if (gap > 3) return false;
  const cursor = parseIsoDate(prev);
  for (let step = 1; step < gap; step += 1) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) return false;
  }
  return true;
}

function periodStatus(start, end, today) {
  if (today && start > today) return 'planlagt';
  if (today && end < today) return 'avsluttet';
  if (today && start <= today && end >= today) return 'pagar';
  return 'registrert';
}

export function groupAbsencePeriods(rows = [], today = '') {
  const sorted = [...rows].sort((a, b) => (
    String(a.employeeId).localeCompare(String(b.employeeId))
    || String(a.type || 'ferie').localeCompare(String(b.type || 'ferie'))
    || String(a.date).localeCompare(String(b.date))
  ));
  const periods = [];
  for (const row of sorted) {
    const type = row.type || 'ferie';
    const last = periods[periods.length - 1];
    if (
      last
      && last.employeeId === row.employeeId
      && last.type === type
      && continuesPeriod(last.end, row.date)
    ) {
      last.end = row.date;
      last.hours = round2(last.hours + (Number(row.hours) || 0));
      last.ids.push(row.id);
      continue;
    }
    periods.push({
      id: row.id || `${row.employeeId}-${row.date}-${type}`,
      employeeId: row.employeeId,
      type,
      start: row.date,
      end: row.date,
      hours: round2(Number(row.hours) || 0),
      ids: [row.id].filter(Boolean),
    });
  }
  return periods.map((period) => ({
    ...period,
    status: periodStatus(period.start, period.end, today),
  })).sort((a, b) => String(b.start).localeCompare(String(a.start)));
}

function activeEmployees(employees) {
  return (employees || []).filter((row) => {
    const status = row?.company?.status;
    return status !== 'former' && status !== 'deleted';
  });
}

/**
 * @param {object} input
 * @param {Array} input.employees
 * @param {string} input.employeeId tom streng = alle
 * @param {string} input.typeId tom streng = alle typer
 */
export function buildAbsenceDashboard({
  employees = [],
  employeeId = '',
  typeId = '',
  category = '',
  absences = [],
  adjustments = [],
  fullDayHours = 7.5,
  today = '',
  names = {},
} = {}) {
  const people = activeEmployees(employees);
  const selected = employeeId ? people.filter((row) => row.id === employeeId) : people;
  const selectedIds = new Set(selected.map((row) => row.id));
  const categoryOn = !!category;
  const balanceType = categoryOn
    ? category
    : (!typeId || typeId === 'ferie' ? 'ferie' : typeId);
  const ferieBalance = categoryOn ? category === 'ferie' : balanceType === 'ferie';
  const dayHours = Number(fullDayHours) > 0 ? Number(fullDayHours) : 7.5;
  const scoped = (absences || []).filter((row) => selectedIds.has(row.employeeId));
  const typeIds = categoryOn
    ? balanceTypeIds(category, scoped, adjustments, selectedIds)
    : [balanceType];

  let used = 0;
  let earned = 0;
  let planned = 0;
  let opening = 0;
  let allowance = 0;
  for (const person of selected) {
    let personEarned = 0;
    for (const type of typeIds) {
      const overview = buildAbsenceOverview({
        employeeId: person.id,
        typeId: type,
        absences,
        adjustments,
        fullDayHours: dayHours,
        today,
      });
      const summary = overview.summary;
      used = round2(used + summary.used);
      earned = round2(earned + summary.earned);
      personEarned = round2(personEarned + summary.earned);
      planned = round2(planned + summary.planned);
      opening = round2(opening + summary.opening);
    }
    if (ferieBalance) {
      allowance = round2(allowance + (personEarned > 0 ? personEarned : STATUTORY_VACATION_DAYS));
    }
  }
  if (!selected.length && ferieBalance) allowance = STATUTORY_VACATION_DAYS;
  if (!ferieBalance) allowance = round2(Math.max(earned, used));

  const remaining = round2(earned - used);
  const unplanned = round2(remaining - planned);
  const summary = { used, remaining, planned, unplanned, earned, opening };
  const hasQuota = ferieBalance || earned > 0;

  const filtered = categoryOn
    ? scoped.filter((row) => matchesCategory(row.type, category))
    : (typeId ? scoped.filter((row) => (row.type || 'ferie') === typeId) : scoped);
  const balanceRows = categoryOn
    ? filtered
    : scoped.filter((row) => (row.type || 'ferie') === balanceType);

  const year = String(today || '').slice(0, 4) || String(new Date().getFullYear());
  const months = MONTHS.map((label, index) => ({
    label,
    month: index + 1,
    ferie: 0,
    sykdom: 0,
    annet: 0,
  }));
  for (const row of filtered) {
    if (!String(row.date || '').startsWith(year)) continue;
    const month = Number(String(row.date).slice(5, 7));
    if (month < 1 || month > 12) continue;
    const bucket = absenceBucket(row.type || 'ferie');
    const days = hoursToDays(row.hours, dayHours);
    months[month - 1][bucket] = round2(months[month - 1][bucket] + days);
  }
  const chartHasData = months.some((month) => month.ferie || month.sykdom || month.annet);
  const currentMonth = Math.max(6, Number(String(today || '').slice(5, 7)) || 6);
  let lastMonth = currentMonth;
  months.forEach((month, index) => {
    if (month.ferie || month.sykdom || month.annet) lastMonth = Math.max(lastMonth, index + 1);
  });
  const visibleMonths = months.slice(0, Math.min(12, lastMonth));

  const recentMonths = recentMonthSlots(today, 6);
  const recentByKey = new Map(recentMonths.map((slot) => [slot.key, slot]));
  for (const row of scoped) {
    const slot = recentByKey.get(String(row.date || '').slice(0, 7));
    if (!slot) continue;
    const bucket = absenceBucket(row.type || 'ferie');
    const days = hoursToDays(row.hours, dayHours);
    slot[bucket] = round2(slot[bucket] + days);
  }
  const recentChartHasData = recentMonths.some((month) => month.ferie || month.sykdom || month.annet);

  const todayRows = scoped.filter((row) => row.date === today);
  const countPeople = (pick) => new Set(todayRows.filter(pick).map((row) => row.employeeId)).size;

  const periods = groupAbsencePeriods(filtered, today).map((period) => {
    const days = hoursToDays(period.hours, dayHours);
    const sameDay = period.start === period.end;
    return {
      ...period,
      days,
      employeeName: names[period.employeeId] || 'Ansatt',
      typeLabel: absenceTypeById(period.type).label,
      bucket: absenceBucket(period.type),
      dateLabel: formatNbDate(period.start),
      rangeLabel: sameDay ? 'Heldag' : `${formatShortDate(period.start)} – ${formatShortDate(period.end)}`,
    };
  });

  const balanceTypeMeta = absenceTypeById(balanceType);
  const focusTitle = categoryOn
    ? (CATEGORY_TITLE[category] || absenceTypeById(category).label)
    : balanceTypeMeta.label;
  return {
    balanceType,
    balanceTitle: categoryOn ? focusTitle : balanceTypeMeta.label,
    focusTitle,
    category: categoryOn ? category : (ferieBalance ? 'ferie' : balanceType),
    year,
    allowance,
    hasQuota,
    summary,
    headcount: people.length,
    onVacation: countPeople((row) => (row.type || 'ferie') === 'ferie'),
    sickNow: countPeople((row) => SICK.has(row.type)),
    otherNow: countPeople((row) => absenceCategory(row.type) === 'annet'),
    months: visibleMonths,
    chartHasData,
    recentMonths,
    recentChartHasData,
    periods,
    hasBalanceRows: balanceRows.length > 0,
    hasRows: filtered.length > 0,
  };
}

/**
 * Rader til skrivebordets fraværsoversikt. Tallene er startsaldo, justeringer
 * og registrerte fraværsdager, uten et antatt ferietak.
 */
export function buildCompanyAbsenceLedger({
  employees = [],
  employeeId = '',
  typeId = 'ferie',
  absences = [],
  adjustments = [],
  fullDayHours = 7.5,
  today = '',
  names = {},
} = {}) {
  const people = activeEmployees(employees).filter((row) => !employeeId || row.id === employeeId);
  const summary = { used: 0, remaining: 0, planned: 0, unplanned: 0, earned: 0, opening: 0 };
  const rows = [];
  for (const person of people) {
    const overview = buildAbsenceOverview({
      employeeId: person.id,
      typeId,
      absences,
      adjustments,
      fullDayHours,
      today,
    });
    for (const key of Object.keys(summary)) {
      summary[key] = round2(summary[key] + (Number(overview.summary[key]) || 0));
    }
    const employeeName = names[person.id] || person.name || 'Ansatt';
    for (const row of overview.rows) {
      rows.push({
        ...row,
        id: `${person.id}:${row.id}`,
        employeeId: person.id,
        employeeName,
      });
    }
  }
  rows.sort((a, b) => (
    String(b.start || '').localeCompare(String(a.start || ''))
    || String(a.employeeName).localeCompare(String(b.employeeName))
  ));
  return { rows, summary, typeId };
}

const YEAR_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];

/**
 * Underlag til web: feriesaldo, månedsfordeling per ansatt og perioder.
 * Tallene kommer fra registrert fravær og lagret startsaldo.
 */
export function buildAbsenceWebBoard({
  employees = [],
  employeeId = '',
  absences = [],
  adjustments = [],
  fullDayHours = 7.5,
  today = '',
  names = {},
} = {}) {
  const dash = buildAbsenceDashboard({
    employees,
    employeeId,
    category: 'ferie',
    absences,
    adjustments,
    fullDayHours,
    today,
    names,
  });
  const people = activeEmployees(employees).filter((row) => !employeeId || row.id === employeeId);
  const selectedIds = new Set(people.map((row) => row.id));
  const dayHours = Number(fullDayHours) > 0 ? Number(fullDayHours) : 7.5;
  const year = dash.year;
  const byPerson = new Map();
  for (const person of people) {
    byPerson.set(person.id, {
      id: person.id,
      name: names[person.id] || person.name || 'Ansatt',
      months: YEAR_MONTHS.map((label, index) => ({
        label,
        month: index + 1,
        ferie: 0,
        sykdom: 0,
        annet: 0,
      })),
    });
  }
  for (const row of absences || []) {
    if (!selectedIds.has(row.employeeId)) continue;
    if (!String(row.date || '').startsWith(year)) continue;
    const month = Number(String(row.date).slice(5, 7));
    if (month < 1 || month > 12) continue;
    const person = byPerson.get(row.employeeId);
    if (!person) continue;
    const bucket = absenceBucket(row.type || 'ferie');
    const days = hoursToDays(row.hours, dayHours);
    person.months[month - 1][bucket] = round2(person.months[month - 1][bucket] + days);
  }
  const staff = [];
  for (const person of people) {
    const grid = byPerson.get(person.id);
    const overview = buildAbsenceOverview({
      employeeId: person.id,
      typeId: 'ferie',
      absences,
      adjustments,
      fullDayHours: dayHours,
      today,
    });
    const hasMonths = grid.months.some((month) => month.ferie || month.sykdom || month.annet);
    if (!hasMonths && !overview.summary.earned && !overview.summary.used) continue;
    const absenceDays = round2(grid.months.reduce((sum, month) => (
      sum + month.ferie + month.sykdom + month.annet
    ), 0));
    staff.push({
      ...grid,
      absenceDays,
      vacationUsed: round2(grid.months.reduce((sum, month) => sum + month.ferie, 0)),
      earned: overview.summary.earned,
      remaining: overview.summary.remaining,
      planned: overview.summary.planned,
    });
  }
  staff.sort((a, b) => b.absenceDays - a.absenceDays || a.name.localeCompare(b.name, 'nb'));
  const present = (periods) => periods.map((period) => ({
    ...period,
    days: hoursToDays(period.hours, dayHours),
    employeeName: names[period.employeeId] || 'Ansatt',
    typeLabel: absenceTypeById(period.type).label,
    bucket: absenceBucket(period.type),
    category: absenceCategory(period.type),
  }));
  const lines = present(groupAbsencePeriods(
    (absences || []).filter((row) => selectedIds.has(row.employeeId) && String(row.date || '').startsWith(year)),
    today,
  ));
  const planned = present(groupAbsencePeriods(
    (absences || []).filter((row) => selectedIds.has(row.employeeId)),
    today,
  )).filter((row) => row.status === 'planlagt')
    .sort((a, b) => String(a.start).localeCompare(String(b.start)) || String(a.employeeName).localeCompare(String(b.employeeName), 'nb'));
  return { dash, staff, lines, planned, year, months: YEAR_MONTHS };
}
