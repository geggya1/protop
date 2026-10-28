/**
 * Automatikk uten at noen åpner ISO (ISO-02): årshjulet tar igjen passerte måneder, oppgaver uten
 * mottaker går til rolleeier eller ISO-ansvarlig (ikke til den som kjørte automatikken), og nye
 * oppgaver gir «oppgave tildelt»-varsel, samlet per mottaker.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { annualTaskEffects } from './planning.js';
import { assignmentNotices, autoTaskEffects, rolesWithoutLogin, taskRecipient } from './integrations.js';
import { emptyIsoState } from './state.js';

const now = new Date('2026-10-05T09:00:00');

function wheel(over = {}, system = {}) {
  const state = emptyIsoState();
  state.system = { ...state.system, setupAt: '2026-01-10T10:00:00Z', roleMap: { quality_manager: { uid: 'q1', name: 'Kari' } }, ...system };
  state.records.aarshjul = [{ id: 'a1', title: 'Vernerunde', months: ['Mars', 'Juni', 'September', 'Oktober'], createTasks: true, state: 'aktiv', createdAt: '2026-02-01T10:00:00Z', ...over }];
  return state;
}

test('ISO-02: årshjulet lager oppgaver for passerte måneder som mangler, ikke bare inneværende', () => {
  const effects = annualTaskEffects(wheel(), { now });
  assert.deepEqual(effects.map((e) => e.key), ['isoauto_ahj_a1_2026_03', 'isoauto_ahj_a1_2026_06', 'isoauto_ahj_a1_2026_09', 'isoauto_ahj_a1_2026_10']);
  assert.match(effects[0].title, /mars \(innhentet\)/);
  assert.equal(effects[0].deadline, '2026-03-31');
  assert.doesNotMatch(effects[3].title, /innhentet/, 'inneværende måned');
  assert.ok(autoTaskEffects(wheel(), { now }).some((e) => e.key === 'isoauto_ahj_a1_2026_06'), 'med i den daglige automatikken');
});

test('ISO-02: innhenting starter ikke før aktiviteten ble lagt inn eller systemet ble satt opp', () => {
  assert.deepEqual(annualTaskEffects(wheel({ createdAt: '2026-07-15T10:00:00Z' }), { now }).map((e) => e.key), ['isoauto_ahj_a1_2026_09', 'isoauto_ahj_a1_2026_10']);
  assert.deepEqual(annualTaskEffects(wheel({}, { setupAt: '2026-09-20T10:00:00Z' }), { now }).map((e) => e.key), ['isoauto_ahj_a1_2026_09', 'isoauto_ahj_a1_2026_10']);
  assert.equal(annualTaskEffects(wheel({ createdAt: '2025-03-01T10:00:00Z' }), { now }).length, 4, 'fra januar når aktiviteten er fra i fjor');
  assert.equal(annualTaskEffects(wheel(), { now, all: true }).length, 1, 'knappen på siden: bare inneværende måned');
});

test('ISO-02: mottaker er valgt person, ellers rolleeier, ellers ISO-ansvarlig – aldri den som kjørte automatikken', () => {
  const system = { ownerUid: 'own', roleMap: { system_owner: { uid: 'so', name: 'Siri' }, hse_manager: { uid: 'h1', name: 'Hilde' }, quality_manager: { name: 'Kari (uten bruker)' } } };
  assert.deepEqual(taskRecipient({ assigneeUid: 'x1' }, system), { uid: 'x1', via: 'valgt' });
  assert.deepEqual(taskRecipient({ roleKey: 'hse_manager' }, system), { uid: 'h1', via: 'rolle' });
  assert.deepEqual(taskRecipient({ roleKey: 'quality_manager' }, system), { uid: 'so', via: 'ansvarlig' });
  assert.deepEqual(taskRecipient({}, { ownerUid: 'own', roleMap: {} }), { uid: 'own', via: 'ansvarlig' });
  assert.deepEqual(taskRecipient({}, { roleMap: {} }), { uid: '', via: 'ingen' });
  assert.deepEqual(rolesWithoutLogin(system), [{ role: 'quality_manager', name: 'Kari (uten bruker)' }]);
});

test('ISO-02: nye ISO-oppgaver gir «oppgave tildelt», samlet per mottaker', () => {
  const notices = assignmentNotices([
    { uid: 'q1', title: 'Evaluer leverandør Rør AS' },
    { uid: 'q1', title: 'Revurder risiko RIS-001' },
    { uid: 'h1', title: 'Gjennomfør beredskapsøvelse' },
    { uid: '', title: 'Uten mottaker' },
  ]);
  assert.deepEqual(notices, [
    { uid: 'q1', title: '2 nye oppgaver fra ISO', body: 'Evaluer leverandør Rør AS · Revurder risiko RIS-001' },
    { uid: 'h1', title: 'Ny oppgave fra ISO', body: 'Gjennomfør beredskapsøvelse' },
  ]);
});
