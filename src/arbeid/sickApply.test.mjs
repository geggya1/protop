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

// Levert sykmelding kobles til dagene som allerede er ført som sykefravær uten skjema.
{
  let state = emptyProjectState();
  state = {
    ...state,
    absences: [
      { id: 'fra_a', employeeId: 'e1', date: '2027-02-01', hours: 7.5, type: 'egenmelding', status: 'registrert' },
      { id: 'fra_b', employeeId: 'e1', date: '2027-02-02', hours: 7.5, type: 'sykdom', status: 'registrert' },
      { id: 'fra_c', employeeId: 'e1', date: '2027-02-03', hours: 7.5, type: 'sykt_barn', status: 'registrert' },
      { id: 'fra_d', employeeId: 'e2', date: '2027-02-01', hours: 7.5, type: 'egenmelding', status: 'registrert' },
    ],
  };
  const doc = { id: 'syk_2', employeeId: 'e1', kind: 'doctor', fromDate: '2027-02-01', toDate: '2027-02-03' };
  const res = applySickCaseToState(state, doc, { hoursForDate: hours });
  assert.equal(res.ok, true);
  assert.deepEqual(res.absenceIds.slice(0, 2), ['fra_a', 'fra_b']);
  assert.equal(res.absenceIds.length, 3);
  const mine = res.state.absences.filter((a) => a.employeeId === 'e1');
  // Ingen dobbeltføring av egen sykdom, og alle dagene peker på saken.
  assert.equal(mine.filter((a) => a.date === '2027-02-01').length, 1);
  assert.equal(mine.filter((a) => a.date === '2027-02-02').length, 1);
  assert.ok(mine.filter((a) => a.caseId === 'syk_2').every((a) => a.type === 'syk_melding'));
  // Sykt barn er en annen sort og står urørt.
  assert.equal(mine.find((a) => a.id === 'fra_c').caseId || '', '');
  // Andre ansatte berøres ikke.
  assert.equal(res.state.absences.find((a) => a.id === 'fra_d').caseId || '', '');
}

console.log('sickApply ok');
