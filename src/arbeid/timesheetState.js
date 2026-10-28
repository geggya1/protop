/**
 * Mutasjoner for lås, røde dager, saldojustering og fraværssaldo.
 * Ren state inn / state ut, så timelisten kan lagre via prosjektstate.
 */

import { norwegianHolidays, resolveRedDays } from './holidays.js';
import { isDateLocked, lockRowFor, lockThroughDate } from './locks.js';

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
  const current = list(state, 'redDays').filter((row) => {
    if (row?.suppressed && String(row.date || '').startsWith(`${y}-`)) return false;
    return true;
  });
  const byDate = new Map(current.map((row) => [row.date, row]));
  for (const row of incoming) {
    const prev = byDate.get(row.date);
    if (prev?.edited) continue;
    if (prev && prev.kind !== 'holiday' && prev.source === 'company') continue;
    byDate.set(row.date, {
      id: prev?.id && !prev.suppressed ? prev.id : `holiday_${row.date}`,
      date: row.date,
      name: row.name,
      kind: 'holiday',
      portion: 'full',
      source: 'system',
      year: y,
      updatedAt: stamp(),
    });
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
  const year = Number(date.slice(0, 4));
  const visible = resolveRedDays(state, [year]);
  const existing = visible.find((row) => row.id === input.id) || visible.find((row) => row.date === date);
  const name = text(input.name) || existing?.name || (portion === 'half' ? 'Halv dag' : 'Fridag');
  const source = existing?.source === 'system' && existing.date === date ? 'system' : 'company';
  const row = {
    id: source === 'system' ? (existing.id || `holiday_${date}`) : (existing?.source === 'company' ? existing.id : createId('rod')),
    date,
    name,
    kind: source === 'system' ? 'holiday' : 'dayoff',
    portion,
    source,
    edited: true,
    year,
    updatedAt: stamp(),
  };
  const current = list(state, 'redDays').filter((item) => (
    item.date !== date && item.date !== existing?.date && item.id !== row.id && item.id !== existing?.id
  ));
  if (existing?.source === 'system' && existing.date !== date) {
    current.push({
      id: existing.id || `holiday_${existing.date}`,
      date: existing.date,
      name: existing.name,
      kind: 'holiday',
      portion: 'full',
      source: 'system',
      suppressed: true,
      year: Number(String(existing.date).slice(0, 4)),
      updatedAt: stamp(),
    });
  }
  return ok({
    ...state,
    redDays: [...current, row].sort((a, b) => String(a.date).localeCompare(String(b.date))),
  });
}

export function deleteRedDay(state, id) {
  const key = text(id);
  const years = [Number(String(key).slice(0, 4)), Number(String(key).replace('holiday_', '').slice(0, 4)), new Date().getFullYear()];
  const visible = resolveRedDays(state, years.filter((year) => year > 1900));
  const row = visible.find((item) => item.id === key || item.date === key);
  if (!row) return fail(state, 'Dagen finnes ikke.');
  const current = list(state, 'redDays').filter((item) => item.date !== row.date && item.id !== row.id);
  if (row.source === 'system') {
    current.push({
      id: row.id || `holiday_${row.date}`,
      date: row.date,
      name: row.name,
      kind: 'holiday',
      portion: row.portion || 'full',
      source: 'system',
      suppressed: true,
      year: Number(String(row.date).slice(0, 4)),
      updatedAt: stamp(),
    });
  }
  return ok({
    ...state,
    redDays: current.sort((a, b) => String(a.date).localeCompare(String(b.date))),
  });
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
    if (row.employeeId !== employeeId || row.invoiceId || row.status === 'godkjent') return row;
    if (throughDate && isDateLocked(throughDate, row.date)) {
      return row.status === 'låst' ? row : { ...row, status: 'låst', updatedAt: now };
    }
    if (row.status === 'låst') return { ...row, status: 'registrert', updatedAt: now };
    return row;
  });
  const absences = list(state, 'absences').map((row) => {
    if (row.employeeId !== employeeId || row.status === 'godkjent') return row;
    if (throughDate && isDateLocked(throughDate, row.date)) {
      return row.status === 'låst' ? row : { ...row, status: 'låst' };
    }
    if (row.status === 'låst') return { ...row, status: 'registrert' };
    return row;
  });
  return { timeEntries, absences };
}

/**
 * Leder åpner timer igjen (canReopen): godkjente føringer etter after og til og med through som ikke
 * er fakturert, blir registrert igjen, så den ansatte kan rette dem og neste godkjenning tar dem med.
 * Reglene lar bare den som godkjenner timer endre en godkjent føring (DRIFT-06).
 */
function reopenApprovedEntries(timeEntries, employeeId, { after = '', through = '' } = {}) {
  const now = stamp();
  let count = 0;
  const rows = timeEntries.map((row) => {
    if (row.employeeId !== employeeId || row.invoiceId || row.status !== 'godkjent') return row;
    const date = text(row.date);
    if (!date || (after && date <= after) || (through && date > through)) return row;
    count += 1;
    return { ...row, status: 'registrert', updatedAt: now };
  });
  return { timeEntries: rows, count };
}

function reopenedNotice(count, base) {
  if (!count) return null;
  return `${base} Godkjenningen er tatt bort på ${count} ${count === 1 ? 'føring' : 'føringer'}, så de kan rettes og godkjennes på nytt.`;
}

function archiveLock(state, row, extra = {}) {
  if (!row) return list(state, 'timesheetLockArchive');
  const entry = {
    id: row.id || createId('laslog'),
    employeeId: row.employeeId,
    throughDate: row.throughDate || '',
    lockedAt: row.lockedAt || '',
    approvedAt: row.approvedAt || '',
    approvedThrough: row.approvedAt ? row.throughDate : (row.approvedThrough || ''),
    unlockedAt: extra.unlockedAt || '',
  };
  return [entry, ...list(state, 'timesheetLockArchive')].slice(0, 400);
}

/** Datoen timene er godkjent til: låsen selv, eller forrige godkjenning når listen er låst videre. */
export function approvedThroughDate(row) {
  if (!row) return '';
  return text(row.approvedAt ? row.throughDate : row.approvedThrough);
}

/**
 * Hvorfor låsen ikke kan flyttes til target ('' = låse opp helt), eller ''.
 * Bare den som styrer andres timer (canReopen) kan åpne godkjente eller fakturerte timer igjen.
 * state bør ha fersk status fra skyen (låsen og timene), ikke en kopi fra før godkjenningen.
 */
export function timesheetReopenBlock(state, { employeeId, target = '', canReopen = true } = {}) {
  if (canReopen) return '';
  const id = text(employeeId);
  const row = lockRowFor(state?.timesheetLocks, id);
  if (!row) return '';
  const through = text(row.throughDate);
  const goal = text(target);
  const invoiced = list(state, 'timeEntries').some((entry) => (
    entry.employeeId === id && entry.invoiceId
    && text(entry.date) <= through && (!goal || text(entry.date) > goal)
  ));
  if (invoiced) {
    return 'Timer i perioden er fakturert og kan ikke låses opp. Be økonomi om en kreditnota hvis noe må rettes.';
  }
  const approved = approvedThroughDate(row);
  if (approved && (!goal || goal < approved)) {
    return `Timene til ${approved} er godkjent og kan ikke låses opp. Be leder åpne timelisten hvis noe må rettes.`;
  }
  return '';
}

/**
 * Lås alle timer til og med dagen. Samme dag på nytt låser opp.
 * canReopen: false for den som bare fører egne timer. Da kan godkjente eller fakturerte timer
 * ikke låses opp, og en lås forlenget etter en godkjenning låses bare opp til godkjenningen.
 */
export function toggleTimesheetLock(state, {
  employeeId, throughDate, lockedByUid, canReopen = true,
} = {}) {
  const id = text(employeeId);
  const date = text(throughDate);
  if (!id) return fail(state, 'Velg medarbeider.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(state, 'Velg en dag å låse mot.');
  const current = list(state, 'timesheetLocks').filter((row) => row.employeeId !== id);
  const existingRow = lockRowFor(state.timesheetLocks, id);
  const existing = existingRow?.throughDate || '';
  const approved = approvedThroughDate(existingRow);
  if (existing === date && !canReopen && approved && !existingRow.approvedAt && approved < date) {
    // Låst videre etter en godkjenning: bare det nye låses opp, det godkjente står låst.
    const back = toggleTimesheetLock(state, { employeeId: id, throughDate: approved, lockedByUid, canReopen });
    return back.ok ? { ...back, notice: `Timelisten er låst opp etter ${approved}. Godkjente timer står låst.` } : back;
  }
  const blocked = timesheetReopenBlock(state, {
    employeeId: id,
    target: existing === date ? '' : date,
    canReopen,
  });
  if (blocked && (existing === date || date < existing)) return fail(state, blocked);
  // Leder som låser opp eller flytter låsen bakover, åpner også godkjente timer i perioden.
  const reopen = canReopen && existing && (existing === date || date < existing);
  if (existing === date) {
    const cleared = applyLockStatus(state, id, '');
    const reopened = reopen ? reopenApprovedEntries(cleared.timeEntries, id, { through: existing }) : null;
    const result = ok({
      ...state,
      ...cleared,
      ...(reopened ? { timeEntries: reopened.timeEntries } : {}),
      timesheetLocks: current,
      timesheetLockArchive: archiveLock(state, existingRow, { unlockedAt: stamp() }),
    });
    const notice = reopenedNotice(reopened?.count || 0, 'Timelisten er låst opp.');
    return notice ? { ...result, notice } : result;
  }
  let approvedThrough = existingRow?.approvedAt
    ? existingRow.throughDate
    : (existingRow?.approvedThrough || '');
  // Det som er åpnet igjen, er ikke godkjent lenger: neste godkjenning tar det med.
  if (reopen && approvedThrough && date < approvedThrough) approvedThrough = date;
  const row = {
    id: existingRow?.id || createId('las'),
    employeeId: id,
    throughDate: date,
    lockedAt: stamp(),
    lockedByUid: text(lockedByUid),
    readyForBilling: false,
    approvedAt: '',
    approvedByUid: '',
    approvedThrough,
    dismissedFindingIds: [],
  };
  const locked = applyLockStatus(state, id, date);
  const reopened = reopen ? reopenApprovedEntries(locked.timeEntries, id, { after: date, through: existing }) : null;
  const result = ok({
    ...state,
    ...locked,
    ...(reopened ? { timeEntries: reopened.timeEntries } : {}),
    timesheetLocks: [row, ...current],
    timesheetLockArchive: existingRow ? archiveLock(state, existingRow) : list(state, 'timesheetLockArchive'),
  });
  const notice = reopenedNotice(reopened?.count || 0, `Timelisten er låst til ${date}.`);
  return notice ? { ...result, notice } : result;
}

function inOpenControl(row, lock) {
  const date = text(row?.date);
  const through = text(lock?.throughDate);
  const since = text(lock?.approvedThrough);
  if (!date || !through || date > through) return false;
  if (since && date <= since) return false;
  return true;
}

/** Kontroll er ferdig: timene i den åpne perioden blir godkjent og klare for fakturering. */
export function approveTimesheetLock(state, { employeeId, approvedByUid } = {}) {
  const id = text(employeeId);
  const lock = lockRowFor(state.timesheetLocks, id);
  if (!lock?.throughDate) return fail(state, 'Timelisten er ikke låst.');
  if (lock.approvedAt) return fail(state, 'Timelisten er allerede godkjent.');
  const now = stamp();
  const timeEntries = list(state, 'timeEntries').map((row) => {
    if (row.employeeId !== id || row.invoiceId || row.status !== 'låst') return row;
    if (!inOpenControl(row, lock)) return row;
    return { ...row, status: 'godkjent', updatedAt: now };
  });
  const absences = list(state, 'absences').map((row) => {
    if (row.employeeId !== id || row.status !== 'låst') return row;
    if (!inOpenControl(row, lock)) return row;
    return { ...row, status: 'godkjent' };
  });
  return ok({
    ...state,
    timeEntries,
    absences,
    timesheetLocks: list(state, 'timesheetLocks').map((row) => (
      row.employeeId === id && row.throughDate === lock.throughDate
        ? {
          ...row,
          approvedAt: now,
          approvedByUid: text(approvedByUid),
          readyForBilling: true,
          periodFrom: text(lock.approvedThrough),
          approvedThrough: lock.throughDate,
        }
        : row
    )),
  });
}

/** Rett tekst på en låst føring mens listen venter på godkjenning. */
export function reviseLockedEntry(state, { entryId, description } = {}) {
  const id = text(entryId);
  const entry = list(state, 'timeEntries').find((row) => row.id === id);
  if (!entry) return fail(state, 'Føringen finnes ikke.');
  if (entry.invoiceId) return fail(state, 'Føringen er fakturert og kan ikke endres.');
  const lock = lockRowFor(state.timesheetLocks, entry.employeeId);
  if (!lock || lock.approvedAt) return fail(state, 'Listen er ikke åpen for kontroll.');
  if (!inOpenControl(entry, lock) || entry.status !== 'låst') {
    return fail(state, 'Føringen ligger utenfor perioden som kontrolleres.');
  }
  const next = text(description);
  const now = stamp();
  return ok({
    ...state,
    timeEntries: list(state, 'timeEntries').map((row) => (
      row.id === id ? { ...row, description: next, updatedAt: now } : row
    )),
  });
}

export function dismissTimesheetFinding(state, { employeeId, findingId } = {}) {
  const id = text(employeeId);
  const finding = text(findingId);
  const lock = lockRowFor(state.timesheetLocks, id);
  if (!lock) return fail(state, 'Timelisten er ikke låst.');
  if (!finding) return fail(state, 'Mangler funn.');
  const current = Array.isArray(lock.dismissedFindingIds) ? lock.dismissedFindingIds : [];
  if (current.includes(finding)) return ok(state);
  return ok({
    ...state,
    timesheetLocks: list(state, 'timesheetLocks').map((row) => (
      row.id === lock.id ? { ...row, dismissedFindingIds: [...current, finding] } : row
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
  const openingYear = text(input.date).slice(0, 4);
  const existing = text(input.id)
    ? current.find((row) => row.id === input.id)
    : (kind === 'opening'
      ? current.find((row) => (
        row.employeeId === employeeId
        && row.typeId === typeId
        && row.kind === 'opening'
        && String(row.date || '').slice(0, 4) === openingYear
      ))
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

/*
 * Personlige valg i timelisten: stjerne på prosjekt, skjulte prosjekter og faste
 * fraværskategorier. De ligger på den ansatte (employees/{id}/prefs/timesheet, se
 * timesheetPrefsStorage.js). Før lå de i prosjektdokumentet, og hver stjerne skrev
 * projects/state med en kopi som kunne være eldre enn det andre hadde lagret.
 * Det som fortsatt ligger i prosjektdokumentet, brukes til personen har valgt selv.
 */

function flagMap(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, flag] of Object.entries(value)) {
    if (text(key) && typeof flag === 'boolean') out[text(key)] = flag;
  }
  return out;
}

export function normalizeTimesheetPrefs(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    starred: flagMap(src.starred),
    hidden: flagMap(src.hidden),
    absencePins: Array.isArray(src.absencePins)
      ? [...new Set(src.absencePins.map((item) => text(item)).filter(Boolean))]
      : null,
  };
}

/** Legg en endring (samme form som det som lagres) på valgene. */
export function applyTimesheetPrefsPatch(prefs, patch = {}) {
  const current = normalizeTimesheetPrefs(prefs);
  const next = normalizeTimesheetPrefs(patch);
  return {
    starred: { ...current.starred, ...next.starred },
    hidden: { ...current.hidden, ...next.hidden },
    absencePins: Array.isArray(patch?.absencePins) ? next.absencePins : current.absencePins,
  };
}

/** Stjernemerkede og skjulte prosjekter og faste fraværstyper for én ansatt. */
export function resolveTimesheetPrefs(state, employeeId, prefs) {
  const id = text(employeeId);
  const own = normalizeTimesheetPrefs(prefs);
  const starred = new Set(list(state, 'members')
    .filter((row) => row.employeeId === id && row.active !== false && row.starred)
    .map((row) => row.projectId));
  for (const [projectId, on] of Object.entries(own.starred)) {
    if (on) starred.add(projectId);
    else starred.delete(projectId);
  }
  const hidden = new Set(list(state, 'hiddenTimesheetProjects')
    .filter((row) => row.employeeId === id)
    .map((row) => row.projectId));
  for (const [projectId, on] of Object.entries(own.hidden)) {
    if (on) hidden.add(projectId);
    else hidden.delete(projectId);
  }
  const pins = own.absencePins || list(state, 'timesheetPins')
    .filter((row) => row.employeeId === id)
    .map((row) => row.typeId);
  return { starred, hidden, pins };
}

/** Valget som lagres når en stjerne, et skjult prosjekt eller fraværskategoriene endres. */
export function timesheetPrefsPatch(kind, projectId, on) {
  const id = text(projectId);
  if (!id || (kind !== 'starred' && kind !== 'hidden')) return null;
  return { [kind]: { [id]: !!on } };
}

export { isDateLocked, lockThroughDate };
