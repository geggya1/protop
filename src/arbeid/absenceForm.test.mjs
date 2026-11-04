import assert from 'node:assert/strict';
import { emptyProjectState, normalizeAbsenceRow } from '../project/engine.js';
import {
  absenceFormFromRows,
  applyAbsenceForm,
  missingAbsenceForms,
  needsAbsenceForm,
  validateAbsenceForm,
} from './absenceForm.js';

const hours = (iso) => ([0, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay()) ? 0 : 7.5);

// Hvilke typer som skal ha skjema.
assert.equal(needsAbsenceForm('annet_med'), true);
assert.equal(needsAbsenceForm('annet_uten'), true);
assert.equal(needsAbsenceForm('lege_med'), true);
assert.equal(needsAbsenceForm('foreldre'), true);
assert.equal(needsAbsenceForm('seminar_med'), true);
assert.equal(needsAbsenceForm('ferie'), false);
assert.equal(needsAbsenceForm('avspasering'), false);
assert.equal(needsAbsenceForm('egenmelding'), false);
assert.equal(needsAbsenceForm('sykt_barn'), false);
assert.equal(needsAbsenceForm('intern_admin'), false);
assert.equal(needsAbsenceForm('reise_uten_lonn'), false);
assert.equal(needsAbsenceForm('permittert'), false);
assert.equal(needsAbsenceForm('fravaersbeskjed'), false);
// Egen type i bedriften.
const catalog = [{ id: 'velferd', label: 'Velferdspermisjon', category: 'Permisjon', paid: true }];
assert.equal(needsAbsenceForm('velferd', catalog), true);

// Feltene følger med når raden normaliseres (lagres).
{
  const row = normalizeAbsenceRow({ id: 'a', employeeId: 'e1', date: '2026-11-04', hours: 8, type: 'annet_med', formId: 'fsk_1', formReason: 'Begravelse', formAt: '2026-11-04T10:00:00.000Z' });
  assert.equal(row.formId, 'fsk_1');
  assert.equal(row.formReason, 'Begravelse');
  const plain = normalizeAbsenceRow({ id: 'b', employeeId: 'e1', date: '2026-11-04', hours: 8, type: 'annet_med' });
  assert.equal('formId' in plain, false);
}

// Validering.
assert.deepEqual(validateAbsenceForm({ type: 'annet_med', fromDate: '2026-11-04', toDate: '2026-11-04', reason: 'x' }), []);
assert.ok(validateAbsenceForm({ type: 'annet_med', fromDate: '2026-11-04', toDate: '2026-11-03', reason: 'x' }).length);
assert.ok(validateAbsenceForm({ type: 'annet_med', fromDate: '2026-11-04', reason: '' }).length);

// Påminnelse og kobling.
{
  let state = emptyProjectState();
  state = {
    ...state,
    absences: [
      // Ført i timelisten fra den enkle dialogen, uten skjema (fredag + mandag = én periode).
      { id: 'f1', employeeId: 'e1', date: '2026-11-06', hours: 4, type: 'annet_med', status: 'registrert' },
      { id: 'f2', employeeId: 'e1', date: '2026-11-09', hours: 7.5, type: 'annet_med', status: 'registrert' },
      // Ikke sammenhengende (onsdag): egen periode.
      { id: 'f3', employeeId: 'e1', date: '2026-11-11', hours: 7.5, type: 'annet_med', status: 'registrert' },
      // Før skjemaet fantes: ingen påminnelse.
      { id: 'old', employeeId: 'e1', date: '2026-10-01', hours: 7.5, type: 'annet_med', status: 'registrert' },
      // Ferie og annen ansatt teller ikke.
      { id: 'fe', employeeId: 'e1', date: '2026-11-12', hours: 7.5, type: 'ferie', status: 'registrert' },
      { id: 'x', employeeId: 'e2', date: '2026-11-12', hours: 7.5, type: 'annet_med', status: 'registrert' },
    ].map(normalizeAbsenceRow),
  };
  const missing = missingAbsenceForms(state.absences, 'e1', { today: '2026-11-20' });
  assert.equal(missing.length, 2);
  assert.deepEqual(missing.map((m) => [m.fromDate, m.toDate]), [['2026-11-11', '2026-11-11'], ['2026-11-06', '2026-11-09']]);

  // Skjemaet for fredag–mandag: timene som er ført, beholdes; helgen føres ikke.
  const res = applyAbsenceForm(state, {
    employeeId: 'e1', type: 'annet_med', fromDate: '2026-11-06', toDate: '2026-11-09', reason: 'Flytting',
  }, { hoursForDate: hours, now: new Date('2026-11-09T08:00:00Z') });
  assert.equal(res.ok, true);
  assert.deepEqual(res.absenceIds.sort(), ['f1', 'f2']);
  const f1 = res.state.absences.find((a) => a.id === 'f1');
  assert.equal(f1.hours, 4);
  assert.equal(f1.formReason, 'Flytting');
  assert.equal(f1.formId, res.formId);
  assert.equal(missingAbsenceForms(res.state.absences, 'e1', { today: '2026-11-20' }).length, 1);

  // Utvid perioden til tirsdag: ny dag føres med timer fra arbeidsplanen.
  const form = absenceFormFromRows(res.state.absences, res.formId);
  assert.equal(form.fromDate, '2026-11-06');
  assert.equal(form.reason, 'Flytting');
  const wider = applyAbsenceForm(res.state, { ...form, toDate: '2026-11-10' }, { hoursForDate: hours });
  assert.equal(wider.ok, true);
  assert.equal(wider.absenceIds.length, 3);
  assert.equal(wider.state.absences.find((a) => a.date === '2026-11-10' && a.employeeId === 'e1').hours, 7.5);

  // Krymp: dagene utenfor fjernes.
  const narrow = applyAbsenceForm(wider.state, { ...form, fromDate: '2026-11-09', toDate: '2026-11-09' }, { hoursForDate: hours });
  assert.equal(narrow.ok, true);
  assert.equal(narrow.state.absences.filter((a) => a.formId === res.formId).length, 1);
  assert.equal(narrow.state.absences.some((a) => a.id === 'f1'), false);

  // Bare helg: ingen dager.
  const weekend = applyAbsenceForm(state, { employeeId: 'e1', type: 'annet_med', fromDate: '2026-11-07', toDate: '2026-11-08', reason: 'x' }, { hoursForDate: hours });
  assert.equal(weekend.ok, false);
}

console.log('absenceForm ok');
