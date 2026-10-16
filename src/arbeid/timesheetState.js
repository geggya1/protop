/**
 * Mutasjoner for lås, røde dager, saldojustering og fraværssaldo.
 * Ren state inn / state ut, så timelisten kan lagre via prosjektstate.
 */

import { norwegianHolidays } from './holidays.js';
import { isDateLocked, lockThroughDate } from './locks.js';

function text(value) {
  return String(value || '').trim();
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function stamp() {
  return new Date().toISOString();
}

function fail(state, error) {
  return { ok: false, state, error };
}

function ok(state) {
  return { ok: true, state, error: null };
}

function list(state, key) {
  return Array.isArray(state?.[key]) ? state[key] : [];
}

export function importHolidayYear(state, year) {
  const y = Number(year);
  if (!y) return fail(state, 'Velg et år.');
  const incoming = norwegianHolidays(y);
  const current = list(state, 'redDays');
  const byDate = new Map(current.map((row) => [row.date, row]));
  let added = 0;
  for (const row of incoming) {
    const prev = byDate.get(row.date);
    if (prev?.kind === 'holiday') continue;
    if (prev && prev.kind !== 'holiday') continue;
    byDate.set(row.date, {
      id: prev?.id || createId('rod'),
      date: row.date,
      name: row.name,
      kind: 'holiday',
      portion: 'full',
      year: y,
    });
    if (!prev) added += 1;
  }
  return ok({
    ...state,
    redDays: [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))),
  });
}

export function upsertRedDay(state, input = {}) {
  const date = text(input.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(state, 'Dato må være ÅÅÅÅ-MM-DD.');
  const portion = input.portion === 'half' ? 'half' : 'full';
  const kind = input.kind === 'holiday' ? 'holiday' : 'dayoff';
  const name = text(input.name) || (portion === 'half' ? 'Halv dag' : (kind === 'holiday' ? 'Rød dag' : 'Hel dag'));
  const current = list(state, 'redDays');
  const existing = current.find((row) => row.id === input.id) || current.find((row) => row.date === date);
  const row = {
    id: existing?.id || createId('rod'),
    date,
    name,
    kind,
    portion,
    year: Number(date.slice(0, 4)),
  };
  const redDays = existing
    ? current.map((item) => (item.id === existing.id ? row : item))
    : [...current, row];
  return ok({
    ...state,
    redDays: redDays.sort((a, b) => String(a.date).localeCompare(String(b.date))),
  });
}

export function deleteRedDay(state, id) {
  const current = list(state, 'redDays');
  if (!current.some((row) => row.id === id)) return fail(state, 'Dagen finnes ikke.');
  return ok({ ...state, redDays: current.filter((row) => row.id !== id) });
}

export function setFullDayHours(state, hours) {
  const value = Number(String(hours).replace(',', '.'));
  if (!(value > 0) || value > 24) return fail(state, 'Normaldag må være mellom 0 og 24 timer.');
  return ok({
    ...state,
    fullDayHours: Math.round(value * 100) / 100,
    fullDayHoursCustom: true,
  });
}

function applyLockStatus(state, employeeId, throughDate) {
  const now = stamp();
  const timeEntries = list(state, 'timeEntries').map((row) => {
    if (row.employeeId !== employeeId || row.invoiceId) return row;
    if (throughDate && isDateLocked(throughDate, row.date)) {
      return row.status === 'låst' ? row : { ...row, status: 'låst', updatedAt: now };
    }
    if (row.status === 'låst') return { ...row, status: 'registrert', updatedAt: now };
    return row;
  });
  const absences = list(state, 'absences').map((row) => {
    if (row.employeeId !== employeeId) return row;
    if (throughDate && isDateLocked(throughDate, row.date)) {
      return row.status === 'låst' ? row : { ...row, status: 'låst' };
    }
    if (row.status === 'låst') return { ...row, status: 'registrert' };
    return row;
  });
  return { timeEntries, absences };
}

/** Lås alle timer til og med dagen. Samme dag på nytt låser opp. */
export function toggleTimesheetLock(state, { employeeId, throughDate, lockedByUid } = {}) {
  const id = text(employeeId);
  const date = text(throughDate);
  if (!id) return fail(state, 'Velg medarbeider.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(state, 'Velg en dag å låse mot.');
  const current = list(state, 'timesheetLocks').filter((row) => row.employeeId !== id);
  const existing = lockThroughDate(state.timesheetLocks, id);
  if (existing === date) {
    const cleared = applyLockStatus(state, id, '');
    return ok({ ...state, ...cleared, timesheetLocks: current });
  }
  const row = {
    id: createId('las'),
    employeeId: id,
    throughDate: date,
    lockedAt: stamp(),
    lockedByUid: text(lockedByUid),
    readyForBilling: true,
    approvedAt: '',
  };
  const locked = applyLockStatus(state, id, date);
  return ok({ ...state, ...locked, timesheetLocks: [row, ...current] });
}

export function approveTimesheetLock(state, { employeeId, approvedByUid } = {}) {
  const id = text(employeeId);
  const through = lockThroughDate(state.timesheetLocks, id);
  if (!through) return fail(state, 'Timelisten er ikke låst.');
  const now = stamp();
  return ok({
    ...state,
    timesheetLocks: list(state, 'timesheetLocks').map((row) => (
      row.employeeId === id && row.throughDate === through
        ? { ...row, approvedAt: now, approvedByUid: text(approvedByUid) }
        : row
    )),
  });
}

export function setBalanceAdjustment(state, { employeeId, month, hours, note } = {}) {
  const id = text(employeeId);
  const key = text(month);
  if (!id) return fail(state, 'Velg medarbeider.');
  if (key !== 'opening' && !/^\d{4}-\d{2}$/.test(key)) return fail(state, 'Velg måned.');
  const value = Number(hours);
  if (!Number.isFinite(value)) return fail(state, 'Justering må være et timetall.');
  const current = list(state, 'balanceAdjustments');
  const existing = current.find((row) => row.employeeId === id && row.month === key);
  const row = {
    id: existing?.id || createId('sal'),
    employeeId: id,
    month: key,
    hours: Math.round(value * 100) / 100,
    note: text(note),
    updatedAt: stamp(),
  };
  const next = Math.abs(row.hours) < 0.001
    ? current.filter((item) => item.id !== row.id)
    : (existing
      ? current.map((item) => (item.id === existing.id ? row : item))
      : [row, ...current]);
  return ok({ ...state, balanceAdjustments: next });
}

export function setAbsenceAdjustment(state, input = {}) {
  const employeeId = text(input.employeeId);
  const typeId = text(input.typeId) || 'ferie';
  if (!employeeId) return fail(state, 'Velg medarbeider.');
  const days = Number(String(input.days ?? '').replace(',', '.'));
  if (!Number.isFinite(days)) return fail(state, 'Antall dager mangler.');
  const kind = input.kind === 'opening' ? 'opening' : 'adjustment';
  const current = list(state, 'absenceAdjustments');
  const existing = text(input.id)
    ? current.find((row) => row.id === input.id)
    : (kind === 'opening'
      ? current.find((row) => row.employeeId === employeeId && row.typeId === typeId && row.kind === 'opening')
      : null);
  const row = {
    id: existing?.id || createId('fav'),
    employeeId,
    typeId,
    kind,
    date: text(input.date),
    days: Math.round(days * 100) / 100,
    note: text(input.note),
    updatedAt: stamp(),
  };
  const next = existing
    ? current.map((item) => (item.id === existing.id ? row : item))
    : [row, ...current];
  return ok({ ...state, absenceAdjustments: next });
}

export function setAbsencePins(state, { employeeId, typeIds = [] } = {}) {
  const id = text(employeeId);
  if (!id) return fail(state, 'Velg medarbeider.');
  const wanted = [...new Set((typeIds || []).map((item) => text(item)).filter(Boolean))];
  const rest = list(state, 'timesheetPins').filter((row) => row.employeeId !== id);
  const pins = wanted.map((typeId) => ({
    id: `pin_${id}_${typeId}`,
    employeeId: id,
    typeId,
  }));
  return ok({ ...state, timesheetPins: [...pins, ...rest] });
}

export function hideTimesheetProject(state, { employeeId, projectId, hidden = true } = {}) {
  const employee = text(employeeId);
  const project = text(projectId);
  if (!employee || !project) return fail(state, 'Velg prosjekt.');
  const current = list(state, 'hiddenTimesheetProjects');
  const without = current.filter((row) => !(row.employeeId === employee && row.projectId === project));
  if (!hidden) return ok({ ...state, hiddenTimesheetProjects: without });
  return ok({
    ...state,
    hiddenTimesheetProjects: [
      { id: `hid_${employee}_${project}`, employeeId: employee, projectId: project },
      ...without,
    ],
  });
}

export { isDateLocked, lockThroughDate };
