/**
 * Melderen av en RUH vises bare for saksbehandlere og melderen selv (DRIFT-20, meldekultur).
 * Andre ansatte ser saken, men ikke hvem som meldte, heller ikke i historikken.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { HIDDEN_REPORTER, displayFinding, isoCapabilities, reporterVisible } from './access.js';
import { createFinding, triageFinding } from './findings.js';

const now = new Date('2026-10-28T09:00:00Z');
const PER = { uid: 'u-per', name: 'Per Montør' };
const BOSS = { uid: 'u-boss', name: 'Siri Leder' };

function ruh() {
  let f = createFinding({ type: 'nestenulykke', title: 'Løs planke', description: 'Planke lå løst i 3. etasje' }, { actor: PER, now }).finding;
  f = triageFinding(f, { severity: 'middels', assigneeName: BOSS.name, assigneeUid: BOSS.uid }, { actor: BOSS, now }).finding;
  return f;
}

test('DRIFT-20: vanlig ansatt ser saken, men ikke hvem som meldte', () => {
  const f = ruh();
  const staff = isoCapabilities({ grants: { iso: 'see' }, uid: 'u-ola' });
  assert.equal(reporterVisible(staff, f), false);
  const shown = displayFinding(staff, f);
  assert.equal(shown.reportedBy, HIDDEN_REPORTER);
  assert.ok(shown.history.every((h) => h.by !== PER.name), 'navnet er borte også fra historikken');
  assert.ok(shown.history.some((h) => h.by === BOSS.name), 'saksbehandlerens navn står');
  assert.equal(f.reportedBy, PER.name, 'originalen endres ikke (den lagres videre med melderen)');
});

test('DRIFT-20: saksbehandler og melderen selv ser navnet', () => {
  const f = ruh();
  const manager = isoCapabilities({ grants: { iso: 'read' }, uid: 'u-kari' });
  const reporter = isoCapabilities({ grants: { iso: 'see' }, uid: PER.uid });
  assert.equal(displayFinding(manager, f).reportedBy, PER.name);
  assert.equal(displayFinding(reporter, f).reportedBy, PER.name);
  assert.equal(reporterVisible(isoCapabilities({ bypass: true, uid: 'u-eier' }), f), true);
});

test('DRIFT-20: anonym melding er uendret, og manglende sak gir ingenting', () => {
  const anon = createFinding({ type: 'nestenulykke', title: 'Anonym', description: 'Noe', anonymous: true }, { actor: { uid: '', name: 'Anonym melder' }, now }).finding;
  const staff = isoCapabilities({ grants: { iso: 'see' }, uid: 'u-ola' });
  assert.equal(displayFinding(staff, anon).reportedBy, anon.reportedBy);
  assert.equal(displayFinding(staff, null), null);
});
