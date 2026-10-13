/**
 * Tall til fraværsoversikten: feriesaldo, hvem som er borte i dag,
 * månedsfordeling og sammenhengende fraværsperioder.
 */

import { absenceTypeById } from './absenceCatalog.js';
import { hoursToDays, buildAbsenceOverview } from './balance.js';

export const STATUTORY_VACATION_DAYS = 25;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];

const SICK = new Set(['syk_melding', 'egenmelding', 'sykdom', 'syk_uten']);

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
  absences = [],
  adjustments = [],
  fullDayHours = 7.5,
  today = '',
  names = {},
} = {}) {
  const people = activeEmployees(employees);
  const selected = employeeId ? people.filter((row) => row.id === employeeId) : people;
  const selectedIds = new Set(selected.map((row) => row.id));
  const balanceType = !typeId || typeId === 'ferie' ? 'ferie' : typeId;
  const dayHours = Number(fullDayHours) > 0 ? Number(fullDayHours) : 7.5;

  let used = 0;
  let earned = 0;
  let planned = 0;
  let opening = 0;
  let allowance = 0;
  for (const person of selected) {
    const overview = buildAbsenceOverview({
      employeeId: person.id,
      typeId: balanceType,
      absences,
      adjustments,
      fullDayHours: dayHours,
      today,
    });
    const summary = overview.summary;
    used = round2(used + summary.used);
    earned = round2(earned + summary.earned);
    planned = round2(planned + summary.planned);
    opening = round2(opening + summary.opening);
    if (balanceType === 'ferie') {
      allowance = round2(allowance + (summary.earned > 0 ? summary.earned : STATUTORY_VACATION_DAYS));
    }
  }
  if (!selected.length && balanceType === 'ferie') allowance = STATUTORY_VACATION_DAYS;
  if (balanceType !== 'ferie') allowance = round2(Math.max(earned, used));

  const remaining = round2(earned - used);
  const unplanned = round2(remaining - planned);
  const summary = { used, remaining, planned, unplanned, earned, opening };

  const scoped = (absences || []).filter((row) => selectedIds.has(row.employeeId));
  const filtered = typeId ? scoped.filter((row) => (row.type || 'ferie') === typeId) : scoped;
  const balanceRows = scoped.filter((row) => (row.type || 'ferie') === balanceType);

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
  return {
    balanceType,
    balanceTitle: balanceTypeMeta.label,
    allowance,
    summary,
    headcount: people.length,
    onVacation: countPeople((row) => (row.type || 'ferie') === 'ferie'),
    sickNow: countPeople((row) => SICK.has(row.type)),
    otherNow: countPeople((row) => (row.type || 'ferie') !== 'ferie' && !SICK.has(row.type)),
    months: visibleMonths,
    chartHasData,
    periods,
    hasBalanceRows: balanceRows.length > 0,
    hasRows: filtered.length > 0,
  };
}
