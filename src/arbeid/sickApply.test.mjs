import assert from 'node:assert/strict';
import { emptyProjectState } from '../project/engine.js';
import { applySickCaseToState, removeSickCaseFromState } from './sickApply.js';

const hours = (iso) => ([0, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay()) ? 0 : 7.5);

{
  let state = emptyProjectState();
  // En sykedag ført i timelisten før skjemaet: gjenbrukes.
  state = { ...state, absences: [{ id: 'fra_old', employeeId: 'e1', date: '2026-03-06', hours: 7.5, type: 'egenmelding', status: 'registrert' }] };
  const sick = { id: 'syk_1', employeeId: 'e1', employeeName: 'Ola', kind: 'self', fromDate: '2026-03-06', toDate: '2026-03-08' };
  const res = applySickCaseToState(state, sick, { hoursForDate: hours });
  assert.equal(res.ok, true);
  assert.equal(res.absenceIds.length, 1);
  assert.equal(res.absenceIds[0], 'fra_old');
  assert.equal(res.state.absences[0].caseId, 'syk_1');

  // Saken endres til tre virkedager med 50 %.
  const moved = applySickCaseToState(res.state, { ...sick, fromDate: '2026-03-09', toDate: '2026-03-11', percent: 50 }, { hoursForDate: hours });
  assert.equal(moved.ok, true);
  const rows = moved.state.absences.filter((a) => a.caseId === 'syk_1');
  assert.deepEqual(rows.map((a) => a.date).sort(), ['2026-03-09', '2026-03-10', '2026-03-11']);
  assert.ok(rows.every((a) => a.hours === 3.75 && a.type === 'egenmelding'));

  // Godkjent sak gir godkjente dager.
  const approved = applySickCaseToState(moved.state, { ...sick, fromDate: '2026-03-09', toDate: '2026-03-11', status: 'godkjent' }, { hoursForDate: hours });
  assert.ok(approved.state.absences.filter((a) => a.caseId === 'syk_1').every((a) => a.status === 'godkjent'));

  // Avvist sak fjerner dagene.
  const rejected = applySickCaseToState(approved.state, { ...sick, status: 'avvist' }, { hoursForDate: hours });
  assert.equal(rejected.state.absences.filter((a) => a.caseId === 'syk_1').length, 0);

  const removed = removeSickCaseFromState(approved.state, 'syk_1');
  assert.equal(removed.state.absences.filter((a) => a.caseId === 'syk_1').length, 0);
}

console.log('sickApply ok');
