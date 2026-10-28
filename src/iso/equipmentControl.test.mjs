/**
 * Kalibrering og sakkyndig kontroll på utstyr (ISO-05, ISO 9001 7.1.5): kontrollfelt med frist,
 * påminnelse, sperret reservasjon når fristen er passert, og avvik koblet til utstyret.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addMonthsKey, controlBlocking, controlState, gearControls, linkControlFinding, normalizeEquipment, recordControl,
} from '../equipment/model.js';
import { recordEquipmentControl, upsertBooking } from '../equipment/state.js';
import { employeeMayBook } from '../equipment/calendars.js';
import { autoTaskEffects, equipmentControlEffects, equipmentStatus } from './integrations.js';
import { buildQuickFinding } from './quickReport.js';
import { emptyIsoState } from './state.js';

const LASER = {
  id: 'g1', name: 'Rotasjonslaser', serial: 'RL-55', status: 'available', scope: 'company', measuring: true,
  controls: [{ id: 'k1', kind: 'kalibrering', intervalMonths: 12, last: '2025-10-01', certificate: 'CAL-2025-118' }],
};
const SYSTEM = { roleMap: { quality_manager: { uid: 'q1', name: 'Kari' }, hse_manager: { uid: 'h1', name: 'Hilde' } } };
const EMP = { id: 'e1', company: { status: 'active' } };

test('ISO-05: kontrollen får neste frist fra sist kontrollert og intervall', () => {
  const gear = normalizeEquipment(LASER);
  assert.equal(gear.measuring, true);
  assert.equal(gear.controls[0].next, '2026-10-01');
  assert.equal(gear.controls[0].certificate, 'CAL-2025-118');
  assert.equal(addMonthsKey('2026-01-31', 1), '2026-02-28');
  assert.equal(controlState(gear.controls[0], '2026-09-20'), 'snart');
  assert.equal(controlState(gear.controls[0], '2026-10-02'), 'forfalt');
  assert.equal(controlState(gear.controls[0], '2026-06-01'), 'ok');
  assert.equal(normalizeEquipment(LASER).controls[0].id, 'k1', 'fast id');
  assert.equal(normalizeEquipment({ ...LASER, controls: [{ kind: 'sakkyndig', next: '2027-01-01' }] }).controls[0].id, 'sakkyndig_1');
});

test('ISO-05: reservasjon sperres når fristen er passert, også for administrator', () => {
  const state = { equipment: [LASER], equipmentBookings: [] };
  const before = upsertBooking(state, { equipmentId: 'g1', employeeId: 'e1', date: '2026-09-30' });
  assert.equal(before.ok, true, before.error);
  const after = upsertBooking(state, { equipmentId: 'g1', employeeId: 'e1', date: '2026-10-05' });
  assert.equal(after.ok, false);
  assert.match(after.error, /kalibrering forfalt 2026-10-01/);
  assert.ok(controlBlocking(LASER, '2026-10-05'));
  assert.equal(employeeMayBook(LASER, EMP, '2026-10-05'), false);
  assert.equal(employeeMayBook(LASER, EMP, '2026-09-30'), true);
  // Service sperrer ikke.
  const serviceOnly = { ...LASER, controls: [{ id: 's1', kind: 'service', next: '2026-01-01' }] };
  assert.equal(controlBlocking(serviceOnly, '2026-10-05'), null);
});

test('ISO-05: registrert kontroll gir ny frist og opphever sperren; avvik krever beskrivelse og kobles til sak', () => {
  const state = { equipment: [LASER], equipmentBookings: [] };
  assert.equal(recordControl(LASER, 'k1', { date: '2026-10-03', result: 'avvik' }).ok, false, 'avvik uten beskrivelse');
  const done = recordEquipmentControl(state, 'g1', 'k1', { date: '2026-10-03', result: 'godkjent', certificate: 'CAL-2026-201', by: 'Måleteknikk AS' });
  assert.equal(done.ok, true, done.error);
  const gear = done.state.equipment[0];
  assert.equal(gear.controls[0].last, '2026-10-03');
  assert.equal(gear.controls[0].next, '2027-10-03');
  assert.equal(gear.controls[0].certificate, 'CAL-2026-201');
  assert.equal(gear.controls[0].log.length, 1);
  assert.equal(upsertBooking(done.state, { equipmentId: 'g1', employeeId: 'e1', date: '2026-10-05' }).ok, true, 'sperren er opphevet');
  const bad = recordControl(LASER, 'k1', { date: '2026-10-03', result: 'avvik', note: '4 mm feil på 50 m', findingId: 'avv_1', findingNumber: 'AVV-2026-014' });
  assert.equal(bad.deviation, true);
  assert.equal(bad.control.log.at(-1).findingNumber, 'AVV-2026-014');
  assert.equal(linkControlFinding(bad.equipment, 'k1', { id: 'avv_2', number: 'AVV-2026-015' }).controls[0].log.at(-1).findingId, 'avv_2');
});

test('ISO-05: avviket blir en sak koblet til utstyret', () => {
  const res = buildQuickFinding({ type: 'prosess', text: 'Kalibrering av Rotasjonslaser viste avvik', equipmentId: 'g1', equipmentName: 'Rotasjonslaser' }, { actor: { uid: 'u1', name: 'Kari' }, system: SYSTEM });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.finding.links.equipmentId, 'g1');
  assert.equal(res.finding.links.equipmentName, 'Rotasjonslaser');
});

test('ISO-05: påminnelse 30 dager før fristen og når den er passert, til riktig rolle', () => {
  const lift = { id: 'g2', name: 'Sakselift', status: 'available', scope: 'company', controls: [{ id: 'k2', kind: 'sakkyndig', next: '2026-12-01' }] };
  const soon = equipmentControlEffects([LASER, lift], SYSTEM, new Date('2026-09-15T10:00:00'));
  assert.deepEqual(soon.map((e) => e.key), ['isoauto_ctl_g1_k1_2026-10-01']);
  assert.equal(soon[0].assigneeUid, 'q1', 'kalibrering til kvalitetsleder');
  const late = equipmentControlEffects([LASER, lift], SYSTEM, new Date('2026-11-20T10:00:00'));
  assert.equal(late.find((e) => e.key.includes('g1')).title, 'Kalibrering forfalt: Rotasjonslaser (01.10.2026)');
  assert.equal(late.find((e) => e.key.includes('g2')).assigneeUid, 'h1', 'sakkyndig kontroll til HMS-leder');
  const state = emptyIsoState();
  state.system = { ...state.system, ...SYSTEM };
  assert.ok(autoTaskEffects(state, { now: new Date('2026-11-20T10:00:00'), equipment: [LASER] }).some((e) => e.key.startsWith('isoauto_ctl_g1')));
});

test('ISO-05: ISO leser status fra Utstyr; måleutstyr uten kontroll vises', () => {
  const status = equipmentStatus([LASER, { id: 'g3', name: 'Fuktmåler', measuring: true, status: 'available' }], new Date('2026-11-20T10:00:00'));
  assert.equal(status.controlsOverdue.length, 1);
  assert.deepEqual(status.measuringWithoutControl.map((e) => e.id), ['g3']);
  assert.equal(gearControls(LASER, '2026-11-20')[0].label, 'Kalibrering');
});
