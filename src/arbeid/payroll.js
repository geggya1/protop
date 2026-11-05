/**
 * Mertid til utbetaling og lønnsoppsummering per måned.
 *
 * Mertid står i timebanken som pluss. Når den ansatte låser timelisten ut måneden, kan hen
 * be om å få noe av den utbetalt som overtid (krever «Kan få mertid utbetalt» på den ansatte).
 * Uttaket lagres som en egen rad i balanceAdjustments (kind 'payout', negative timer), så
 * saldoen går ned med en gang og alle saldoberegninger tar det med uten mer kode.
 *
 * Lønnsoppsummeringen (HR › Lønn) samler måneden per ansatt: overtid, uttak fra timebanken,
 * sykdom og kjøring. Leder godkjenner, og oppsummeringen sendes til regnskapsfører.
 */

import { parseHours, roundHours } from './hours.js';
import { buildMonthGrid } from './calendar.js';
import { employmentRange } from './balance.js';
import { timeSettingsOf } from './schedule.js';
import { employeeDisplayName } from './roles.js';
import { isHiredPersonnel } from '../employees/model.js';

export const PAYOUT_RATES = [
  { id: 'overtime_50', label: 'Overtid 50 %' },
  { id: 'overtime_100', label: 'Overtid 100 %' },
];

const RATE_IDS = new Set(PAYOUT_RATES.map((row) => row.id));

/** Fravær som skal stå i oppsummeringen, i den rekkefølgen regnskapsfører er vant med. */
export const PAYROLL_ABSENCES = [
  { id: 'egenmelding', label: 'Sykdom med egenmelding' },
  { id: 'syk_melding', label: 'Sykdom med sykemelding' },
  { id: 'sykt_barn', label: 'Sykt barn' },
];

const MONTH_NAMES = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

function text(value) {
  return String(value ?? '').trim();
}

function list(state, key) {
  return Array.isArray(state?.[key]) ? state[key] : [];
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function fail(state, error) {
  return { ok: false, state, error };
}

function ok(state) {
  return { ok: true, state, error: null };
}

export function isMonthKey(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text(value));
}

export function monthOf(dateKey) {
  const key = text(dateKey).slice(0, 7);
  return isMonthKey(key) ? key : '';
}

export function monthName(month) {
  if (!isMonthKey(month)) return '';
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function monthBounds(month) {
  if (!isMonthKey(month)) return { from: '', to: '' };
  const [y, m] = month.split('-').map(Number);
  const grid = buildMonthGrid(y, m - 1);
  return { from: grid.days[0]?.key || '', to: grid.days[grid.days.length - 1]?.key || '' };
}

export function isMonthEnd(dateKey) {
  const month = monthOf(dateKey);
  return !!month && monthBounds(month).to === text(dateKey);
}

/**
 * Siste månedsslutt som en ny lås dekker og den forrige ikke gjorde, ellers ''.
 * Låser hen 31. oktober, eller 3. november uten at oktober var låst ut, gjelder det oktober.
 */
export function newlyClosedMonthEnd(previousThrough, nextThrough) {
  const next = text(nextThrough);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return '';
  const prev = text(previousThrough);
  if (prev && prev >= next) return '';
  const candidate = isMonthEnd(next) ? next : (() => {
    const [y, m] = next.split('-').map(Number);
    const back = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    return monthBounds(back).to;
  })();
  if (!candidate || candidate > next) return '';
  if (prev && candidate <= prev) return '';
  return candidate;
}

/** Ansatte som kan få mertid utbetalt (innstilling på den ansatte, ikke fastlønn med overtid inkludert). */
export function canRequestPayout(employee) {
  const settings = timeSettingsOf(employee);
  return settings.bankPayout && !settings.overtimeInSalary && !isHiredPersonnel(employee);
}

export function isPayoutRow(row) {
  return row?.kind === 'payout';
}

export function payoutRowsFor(adjustments, { employeeId = '', month = '' } = {}) {
  return (adjustments || []).filter((row) => (
    isPayoutRow(row)
    && (!employeeId || row.employeeId === employeeId)
    && (!month || row.month === month)
  ));
}

/** Timer tatt ut av timebanken (positivt tall) for én ansatt og måned. */
export function payoutHours(adjustments, employeeId, month) {
  return roundHours(payoutRowsFor(adjustments, { employeeId, month })
    .reduce((sum, row) => sum - parseHours(row.hours), 0));
}

/**
 * Den ansatte ber om å få timer fra timebanken utbetalt som overtid.
 * available: saldoen ved månedsslutt uten uttak for måneden. Én rad per ansatt og måned; en ny
 * forespørsel erstatter den forrige så lenge lønnen ikke er godkjent.
 */
export function requestOvertimePayout(state, {
  employeeId, month, hours, rate = 'overtime_50', available = null, byUid = '', note = '',
} = {}) {
  const id = text(employeeId);
  const key = text(month);
  if (!id) return fail(state, 'Velg medarbeider.');
  if (!isMonthKey(key)) return fail(state, 'Velg måned.');
  const value = roundHours(hours);
  if (!(value > 0)) return fail(state, 'Skriv hvor mange timer som skal utbetales.');
  const rateId = RATE_IDS.has(rate) ? rate : 'overtime_50';
  const current = list(state, 'balanceAdjustments');
  const existing = payoutRowsFor(current, { employeeId: id, month: key })[0] || null;
  if (existing && existing.status === 'approved') {
    return fail(state, 'Lønnen for måneden er godkjent. Be leder endre uttaket.');
  }
  if (available != null) {
    // available: saldoen ved månedsslutt uten dette uttaket (et tidligere uttak er lagt tilbake).
    const before = roundHours(Number(available));
    if (value > before + 0.001) {
      return fail(state, `Du har ${String(before).replace('.', ',')} timer i timebanken. Du kan ikke ta ut mer enn det.`);
    }
  }
  const now = new Date().toISOString();
  const row = {
    id: existing?.id || createId('utb'),
    employeeId: id,
    month: key,
    kind: 'payout',
    hours: -value,
    rate: rateId,
    status: 'requested',
    requestedAt: existing?.requestedAt || now,
    requestedByUid: text(byUid) || existing?.requestedByUid || '',
    note: text(note) || 'Mertid utbetalt som overtid',
    updatedAt: now,
  };
  const next = existing
    ? current.map((item) => (item.id === existing.id ? row : item))
    : [row, ...current];
  return ok({ ...state, balanceAdjustments: next });
}

/** Trekk tilbake et uttak som ikke er godkjent (eller leder fjerner det). Saldoen går opp igjen. */
export function cancelOvertimePayout(state, { id, force = false } = {}) {
  const current = list(state, 'balanceAdjustments');
  const row = current.find((item) => item.id === text(id) && isPayoutRow(item));
  if (!row) return fail(state, 'Uttaket finnes ikke.');
  if (row.status === 'approved' && !force) return fail(state, 'Uttaket er godkjent i lønnen.');
  return ok({ ...state, balanceAdjustments: current.filter((item) => item.id !== row.id) });
}

/** Lønnen er godkjent: uttakene i måneden står som godkjent og kan ikke endres av den ansatte. */
export function approveMonthPayouts(state, { month, byUid = '' } = {}) {
  const key = text(month);
  const now = new Date().toISOString();
  let changed = 0;
  const next = list(state, 'balanceAdjustments').map((row) => {
    if (!isPayoutRow(row) || row.month !== key || row.status === 'approved') return row;
    changed += 1;
    return { ...row, status: 'approved', approvedAt: now, approvedByUid: text(byUid), updatedAt: now };
  });
  return changed ? ok({ ...state, balanceAdjustments: next }) : ok(state);
}

function employedInMonth(employee, from, to) {
  const range = employmentRange(employee);
  if (range.from && range.from > to) return false;
  if (range.to && range.to < from) return false;
  return true;
}

/** Ansatte som skal stå i lønnsoppsummeringen: aktive, egne (ikke innleide/eksterne), ansatt i måneden. */
export function payrollEmployees(employees, month) {
  const { from, to } = monthBounds(month);
  return (employees || [])
    .filter((employee) => {
      if (!employee?.id) return false;
      // Innleide og eksterne har en annen arbeidsgiver og lønnes ikke herfra.
      if (isHiredPersonnel(employee)) return false;
      if (!employedInMonth(employee, from, to)) return false;
      const status = employee?.company?.status;
      // Sluttet i måneden: med. Sluttet før: ute (employedInMonth over), uten dato: aktiv.
      if ((status === 'former' || status === 'inactive') && !employmentRange(employee).to) return false;
      return true;
    })
    .sort((a, b) => employeeDisplayName(a).localeCompare(employeeDisplayName(b), 'nb'));
}

function inMonth(date, from, to) {
  const key = text(date);
  return !!key && key >= from && key <= to;
}

const SKIP_ABSENCE_STATUS = new Set(['avvist', 'rejected', 'slettet']);

function absenceDays(absences, employeeId, typeId, from, to) {
  const dates = new Set();
  for (const row of absences || []) {
    if (row?.employeeId !== employeeId || (row.type || '') !== typeId) continue;
    if (SKIP_ABSENCE_STATUS.has(text(row.status))) continue;
    if (!inMonth(row.date, from, to)) continue;
    if (parseHours(row.hours) <= 0 && row.hours != null && row.hours !== '') continue;
    dates.add(row.date);
  }
  return dates.size;
}

function overtimeHours(entries, employeeId, timeType, from, to) {
  let total = 0;
  for (const row of entries || []) {
    if (row?.employeeId !== employeeId || row.timeType !== timeType) continue;
    if (!inMonth(row.date, from, to)) continue;
    total += parseHours(row.hours);
  }
  return roundHours(total);
}

function mileageFor(trips, employeeId, from, to) {
  let km = 0;
  let amount = 0;
  for (const row of trips || []) {
    if (row?.employeeId !== employeeId || !inMonth(row.date, from, to)) continue;
    if (text(row.status) === 'draft' || text(row.status) === '') continue;
    if (row.vehicleKind === 'company' || row.reimbursable === false) continue;
    const distance = Number(row.km) || 0;
    km += distance;
    const allowance = Number(row.allowance);
    amount += Number.isFinite(allowance) ? allowance : distance * (Number(row.rate) || 0);
  }
  return { km: Math.round(km * 10) / 10, amount: Math.round(amount * 100) / 100 };
}

function normalizeLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((row) => ({ label: text(row?.label).slice(0, 80), value: text(row?.value).slice(0, 80) }))
    .filter((row) => row.label);
}

/**
 * Én rad per ansatt for måneden. recurring: { [employeeId]: [{ label, value }] } (faste linjer
 * som «Ekstra månedlig skattetrekk»), extra: det samme for denne måneden alene.
 */
export function buildPayrollSummary({
  month, employees = [], state = {}, recurring = {}, extra = {}, notes = {},
} = {}) {
  const { from, to } = monthBounds(month);
  if (!from) return [];
  const entries = list(state, 'timeEntries');
  const absences = list(state, 'absences');
  const trips = list(state, 'mileageTrips');
  const adjustments = list(state, 'balanceAdjustments');
  return payrollEmployees(employees, month).map((employee) => {
    const id = employee.id;
    const settings = timeSettingsOf(employee);
    const payouts = payoutRowsFor(adjustments, { employeeId: id, month });
    const bank = { overtime_50: 0, overtime_100: 0 };
    for (const row of payouts) {
      const rate = RATE_IDS.has(row.rate) ? row.rate : 'overtime_50';
      bank[rate] = roundHours(bank[rate] - parseHours(row.hours));
    }
    const logged50 = overtimeHours(entries, id, 'overtime_50', from, to);
    const logged100 = overtimeHours(entries, id, 'overtime_100', from, to);
    const absence = {};
    for (const type of PAYROLL_ABSENCES) absence[type.id] = absenceDays(absences, id, type.id, from, to);
    const mileage = mileageFor(trips, id, from, to);
    return {
      employeeId: id,
      name: employeeDisplayName(employee),
      firstName: text(employee?.person?.firstName) || employeeDisplayName(employee),
      fixedSalary: !!settings.overtimeInSalary,
      overtime50: roundHours(logged50 + bank.overtime_50),
      overtime100: roundHours(logged100 + bank.overtime_100),
      bank50: bank.overtime_50,
      bank100: bank.overtime_100,
      payoutPending: payouts.some((row) => row.status !== 'approved'),
      absence,
      km: mileage.km,
      mileageAmount: mileage.amount,
      lines: [...normalizeLines(recurring?.[id]), ...normalizeLines(extra?.[id])],
      note: text(notes?.[id]).slice(0, 300),
    };
  });
}
