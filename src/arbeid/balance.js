/**
 * Timesaldo: avtalte timer, faktiske timer, fravær, lønnsgrunnlag og manuell justering.
 * Saldo er timebank. Justering ned brukes når overtid tas ut i lønn.
 */

import { parseHours, roundHours } from './hours.js';
import { isOvertime } from './overtime.js';
import { absenceTypeById } from './absenceCatalog.js';
import { buildMonthGrid, monthLabel } from './calendar.js';

const MONTH_NAMES = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

function inRange(date, from, to) {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function sumWhere(rows, from, to, pick) {
  let total = 0;
  for (const row of rows || []) {
    if (!inRange(row?.date, from, to)) continue;
    if (pick && !pick(row)) continue;
    total += parseHours(row.hours);
  }
  return roundHours(total);
}

export function adjustmentHours(adjustments, employeeId, month) {
  const id = String(employeeId || '');
  const key = String(month || '');
  let total = 0;
  for (const row of adjustments || []) {
    if (row?.employeeId !== id) continue;
    if (String(row.month || '') !== key) continue;
    total += parseHours(row.hours);
  }
  return roundHours(total);
}

/**
 * @param agreedForDate (dateKey) => hours
 */
export function buildTimesaldo({
  year,
  throughDate,
  employeeId,
  entries = [],
  absences = [],
  adjustments = [],
  agreedForDate,
  flexCountsAsPay = true,
} = {}) {
  const y = Number(year);
  const end = String(throughDate || `${y}-12-31`);
  const endYear = Number(end.slice(0, 4)) || y;
  const endMonth = Number(end.slice(5, 7)) - 1;
  const opening = adjustmentHours(adjustments, employeeId, 'opening');
  const mineEntries = (entries || []).filter((row) => row.employeeId === employeeId);
  const mineAbsences = (absences || []).filter((row) => row.employeeId === employeeId);
  const rows = [{
    id: 'opening',
    kind: 'opening',
    label: 'Startsaldo',
    month: 'opening',
    adjustment: opening,
    saldo: opening,
  }];
  let saldo = opening;
  const totals = {
    agreed: 0,
    agreedFull: 0,
    actual: 0,
    paidAbsence: 0,
    unpaidAbsence: 0,
    payrollIncl: 0,
    payrollExcl: 0,
    flex: 0,
    adjustment: opening,
  };
  const lastMonth = endYear > y ? 11 : (endYear < y ? -1 : endMonth);
  for (let month = 0; month <= lastMonth; month += 1) {
    const grid = buildMonthGrid(y, month);
    const from = grid.days[0]?.key || '';
    const monthEnd = grid.days[grid.days.length - 1]?.key || '';
    const to = monthEnd < end ? monthEnd : end;
    const partial = to < monthEnd;
    let agreed = 0;
    let agreedFull = 0;
    for (const day of grid.days) {
      const hours = agreedForDate ? Number(agreedForDate(day.key)) || 0 : 0;
      agreedFull = roundHours(agreedFull + hours);
      if (day.key <= to) agreed = roundHours(agreed + hours);
    }
    const actual = sumWhere(mineEntries, from, to);
    const paidAbsence = sumWhere(mineAbsences, from, to, (row) => {
      const type = absenceTypeById(row.type);
      return type.paid && !type.flex;
    });
    const unpaidAbsence = sumWhere(mineAbsences, from, to, (row) => !absenceTypeById(row.type).paid && !absenceTypeById(row.type).flex);
    const overtime = sumWhere(mineEntries, from, to, (row) => isOvertime(row.timeType));
    const payrollWork = flexCountsAsPay ? actual : roundHours(actual - overtime);
    const payrollIncl = roundHours(payrollWork + paidAbsence);
    const payrollExcl = roundHours(payrollIncl - (flexCountsAsPay ? overtime : 0));
    const flex = roundHours(actual - agreed);
    const adjustment = adjustmentHours(adjustments, employeeId, `${y}-${String(month + 1).padStart(2, '0')}`);
    saldo = roundHours(saldo + flex + adjustment);
    totals.agreed = roundHours(totals.agreed + agreed);
    totals.agreedFull = roundHours(totals.agreedFull + agreedFull);
    totals.actual = roundHours(totals.actual + actual);
    totals.paidAbsence = roundHours(totals.paidAbsence + paidAbsence);
    totals.unpaidAbsence = roundHours(totals.unpaidAbsence + unpaidAbsence);
    totals.payrollIncl = roundHours(totals.payrollIncl + payrollIncl);
    totals.payrollExcl = roundHours(totals.payrollExcl + payrollExcl);
    totals.flex = roundHours(totals.flex + flex);
    totals.adjustment = roundHours(totals.adjustment + adjustment);
    rows.push({
      id: `${y}-${String(month + 1).padStart(2, '0')}`,
      kind: 'month',
      label: partial ? `${MONTH_NAMES[month]} til og med ${to}` : MONTH_NAMES[month],
      monthLabel: monthLabel(y, month),
      month: `${y}-${String(month + 1).padStart(2, '0')}`,
      from,
      to,
      partial,
      agreed,
      agreedFull,
      actual,
      paidAbsence,
      unpaidAbsence,
      payrollIncl,
      payrollExcl,
      flex,
      adjustment,
      saldo,
    });
  }
  totals.saldo = saldo;
  return { rows, totals, opening };
}

function addRegisteredHours(map, seen, prefix, rows, employeeId, allow) {
  const id = String(employeeId || '');
  for (const row of rows || []) {
    if (!row || String(row.employeeId || '') !== id || !row.date) continue;
    if (allow && !allow(row)) continue;
    const stamp = row.id ? `${prefix}:${row.id}` : '';
    if (stamp) {
      if (seen.has(stamp)) continue;
      seen.add(stamp);
    }
    map.set(row.date, roundHours((map.get(row.date) || 0) + parseHours(row.hours)));
  }
}

/**
 * Timebalanse i timelisten.
 * Hver dag er avviket registrert − avtalt. Fravær dekker avtalen, unntatt
 * avspasering som tas ut av timebanken. Inngående er saldo ved månedsskifte
 * (startsaldo + tidligere måneder i året). Utgående bæres til neste måned.
 */
export function monthTimebank({
  year,
  monthIndex,
  employeeId,
  entries = [],
  absences = [],
  adjustments = [],
  agreedForDate,
} = {}) {
  const y = Number(year);
  const month = Number(monthIndex);
  const registered = new Map();
  const seen = new Set();
  addRegisteredHours(registered, seen, 'e', entries, employeeId);
  addRegisteredHours(registered, seen, 'a', absences, employeeId, (row) => !absenceTypeById(row.type).flex);

  let incoming = adjustmentHours(adjustments, employeeId, 'opening');
  for (let index = 0; index < month; index += 1) {
    const grid = buildMonthGrid(y, index);
    let flex = 0;
    for (const day of grid.days) {
      const agreed = agreedForDate ? Number(agreedForDate(day.key)) || 0 : 0;
      flex += (registered.get(day.key) || 0) - agreed;
    }
    const key = `${y}-${String(index + 1).padStart(2, '0')}`;
    incoming = roundHours(incoming + flex + adjustmentHours(adjustments, employeeId, key));
  }

  const grid = buildMonthGrid(y, month);
  const byDate = new Map();
  let monthFlex = 0;
  for (const day of grid.days) {
    const agreed = agreedForDate ? Number(agreedForDate(day.key)) || 0 : 0;
    const delta = roundHours((registered.get(day.key) || 0) - agreed);
    byDate.set(day.key, delta);
    monthFlex += delta;
  }
  const monthKey = `${y}-${String(month + 1).padStart(2, '0')}`;
  const adjustment = adjustmentHours(adjustments, employeeId, monthKey);
  const outgoing = roundHours(incoming + monthFlex + adjustment);
  return { byDate, incoming, outgoing, adjustment };
}

export function payrollHoursOnDate({
  entries = [],
  absences = [],
  employeeId,
  date,
  flexCountsAsPay = true,
} = {}) {
  let work = 0;
  let overtime = 0;
  for (const row of entries) {
    if (row.employeeId !== employeeId || row.date !== date) continue;
    const hours = parseHours(row.hours);
    work += hours;
    if (isOvertime(row.timeType)) overtime += hours;
  }
  let paidLeave = 0;
  for (const row of absences) {
    if (row.employeeId !== employeeId || row.date !== date) continue;
    const type = absenceTypeById(row.type);
    if (!type.salary) continue;
    paidLeave += parseHours(row.hours);
  }
  const countedWork = flexCountsAsPay ? work : work - overtime;
  return roundHours(countedWork + paidLeave);
}

export function hoursToDays(hours, fullDayHours = 7.5) {
  const day = Number(fullDayHours) > 0 ? Number(fullDayHours) : 7.5;
  return Math.round((parseHours(hours) / day) * 100) / 100;
}

function consecutivePeriods(rows) {
  const sorted = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const periods = [];
  for (const row of sorted) {
    const last = periods[periods.length - 1];
    const prev = last?.end;
    const nextDay = prev
      ? (() => {
        const [yy, mm, dd] = prev.split('-').map(Number);
        const d = new Date(yy, mm - 1, dd + 1);
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      })()
      : '';
    if (last && row.date === nextDay) {
      last.end = row.date;
      last.hours = roundHours(last.hours + parseHours(row.hours));
      last.ids.push(row.id);
    } else {
      periods.push({
        start: row.date,
        end: row.date,
        hours: roundHours(parseHours(row.hours)),
        ids: [row.id],
      });
    }
  }
  return periods;
}

export function buildAbsenceOverview({
  employeeId,
  typeId = 'ferie',
  absences = [],
  adjustments = [],
  fullDayHours = 7.5,
  today = '',
  year: yearInput = '',
} = {}) {
  const type = absenceTypeById(typeId);
  const mine = (absences || []).filter((row) => row.employeeId === employeeId && (row.type || 'ferie') === typeId);
  const adjust = (adjustments || []).filter((row) => row.employeeId === employeeId && (row.typeId || 'ferie') === typeId);
  const balanceYear = String(yearInput || today || '').slice(0, 4);
  const openingRows = adjust.filter((row) => {
    if (row.kind !== 'opening') return false;
    const rowYear = String(row.date || '').slice(0, 4);
    if (!balanceYear || !rowYear) return true;
    return rowYear === balanceYear;
  });
  const opening = openingRows.reduce((sum, row) => sum + (Number(row.days) || 0), 0);
  const manual = adjust
    .filter((row) => row.kind !== 'opening')
    .reduce((sum, row) => sum + (Number(row.days) || 0), 0);
  const periods = consecutivePeriods(mine);
  let running = Math.round((opening + manual) * 100) / 100;
  const rows = [];
  const openingDate = openingRows.find((row) => row.date)?.date || '';
  if (opening || openingDate) {
    rows.push({
      id: 'opening',
      kind: 'opening',
      label: openingDate || 'Startsaldo',
      start: openingDate,
      end: openingDate,
      days: 0,
      used: 0,
      balance: Math.round(opening * 100) / 100,
      adjustment: Math.round(opening * 100) / 100,
    });
    running = Math.round(opening * 100) / 100;
  }
  const orderedAdjust = adjust
    .filter((row) => row.kind !== 'opening')
    .map((row) => ({ ...row, sort: row.date || '9999-99-99', kind: 'adjustment' }));
  const orderedPeriods = periods.map((row) => ({ ...row, sort: row.start, kind: 'absence' }));
  const merged = [...orderedAdjust, ...orderedPeriods].sort((a, b) => String(a.sort).localeCompare(String(b.sort)));
  let used = 0;
  let planned = 0;
  for (const row of merged) {
    if (row.kind === 'adjustment') {
      const days = Math.round((Number(row.days) || 0) * 100) / 100;
      running = Math.round((running + days) * 100) / 100;
      rows.push({
        id: row.id,
        kind: 'adjustment',
        label: row.date || 'Justering',
        start: row.date || '',
        end: row.date || '',
        days,
        used: 0,
        balance: running,
        note: row.note || '',
        adjustment: days,
      });
      continue;
    }
    const days = hoursToDays(row.hours, fullDayHours);
    used = Math.round((used + days) * 100) / 100;
    running = Math.round((running - days) * 100) / 100;
    const future = today && row.start > today;
    if (future) planned = Math.round((planned + days) * 100) / 100;
    rows.push({
      id: row.ids?.[0] || row.start,
      kind: 'absence',
      label: row.start === row.end ? row.start : `${row.start} – ${row.end}`,
      start: row.start,
      end: row.end,
      hours: row.hours,
      days,
      used,
      balance: running,
      planned: !!future,
    });
  }
  const earned = Math.round((opening + manual) * 100) / 100;
  const remaining = Math.round((earned - used) * 100) / 100;
  // used inkluderer allerede planlagte dager frem i tid. Ikke trekk dem fra en gang til.
  const unplanned = remaining;
  return {
    type,
    rows,
    summary: {
      used,
      remaining,
      planned,
      unplanned,
      earned,
      opening: Math.round(opening * 100) / 100,
    },
  };
}
