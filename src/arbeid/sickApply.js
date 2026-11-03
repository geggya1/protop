/**
 * Fører en sykefraværssak inn i timelisten: én fraværsrad per dag med timer fra
 * arbeidsplanen, merket med caseId. Endres saken, flyttes dagene etter.
 */
import { addAbsence, deleteAbsences, setAbsenceStatuses } from '../project/engine.js';
import {
  SICK_KIND_TYPE,
  caseAbsenceDays,
  normalizeSickCase,
  sickKind,
} from './sickLeave.js';

function text(value) {
  return String(value ?? '').trim();
}

/** Egen sykdom (egenmelding, sykmelding, uten lønn) eller sykt barn. */
function sickGroup(kind) {
  return kind === 'child' ? 'child' : (kind ? 'own' : '');
}

export function applySickCaseToState(state, sickCase, { hoursForDate, catalog, createdByUid = '' } = {}) {
  const row = normalizeSickCase(sickCase);
  if (!row.id || !row.employeeId) return { ok: false, state, error: 'Saken mangler ansatt.', absenceIds: [] };
  const type = SICK_KIND_TYPE[row.kind];
  const days = row.status === 'avvist' ? [] : caseAbsenceDays(row, hoursForDate);
  const wanted = new Set(days.map((d) => d.date));
  const absences = Array.isArray(state.absences) ? state.absences : [];
  const mine = absences.filter((a) => text(a.employeeId) === row.employeeId);

  // Dager som ikke lenger hører til saken.
  const stale = mine
    .filter((a) => text(a.caseId) === row.id && !wanted.has(text(a.date)))
    .map((a) => a.id);
  let next = state;
  if (stale.length) {
    const removed = deleteAbsences(next, stale);
    if (removed.ok) next = removed.state;
  }

  const ids = [];
  const errors = [];
  for (const day of days) {
    // Samme dag: gjenbruk raden for saken, ellers en sykedag som er ført uten skjema. Først av
    // samme sort, så annen egen sykdom: en levert sykmelding kobles til dagen som står som
    // egenmelding eller sykdom, og typen endres, så dagen ikke føres to ganger.
    const free = (a) => text(a.date) === day.date && !text(a.caseId);
    const existing = mine.find((a) => text(a.date) === day.date && text(a.caseId) === row.id)
      || mine.find((a) => free(a) && sickKind(a.type, catalog) === row.kind)
      || mine.find((a) => free(a) && sickGroup(sickKind(a.type, catalog)) === sickGroup(row.kind));
    const result = addAbsence(next, {
      id: existing?.id || '',
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      date: day.date,
      hours: day.hours,
      type,
      description: existing?.description || '',
      percent: row.percent < 100 ? row.percent : null,
      caseId: row.id,
      createdByUid: createdByUid || row.createdByUid,
    });
    if (!result.ok) {
      errors.push(`${day.date}: ${result.error}`);
      continue;
    }
    next = result.state;
    const saved = (next.absences || []).find((a) => text(a.employeeId) === row.employeeId && text(a.date) === day.date && text(a.caseId) === row.id);
    if (saved) ids.push(saved.id);
  }

  if (ids.length) {
    const status = row.status === 'godkjent' ? 'godkjent' : 'registrert';
    const marked = setAbsenceStatuses(next, ids, status);
    if (marked.ok) next = marked.state;
  }
  if (!ids.length && days.length) {
    return { ok: false, state, error: errors[0] || 'Ingen dager kunne føres.', absenceIds: [] };
  }
  return { ok: true, state: next, error: errors.join(' '), absenceIds: ids };
}

/** Fjern dagene som hører til en sak (sletting eller avvisning). */
export function removeSickCaseFromState(state, caseId) {
  const id = text(caseId);
  const ids = (state.absences || []).filter((a) => text(a.caseId) === id).map((a) => a.id);
  if (!ids.length) return { ok: true, state };
  return deleteAbsences(state, ids);
}
