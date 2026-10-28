/**
 * Avvikende leveranser (ISO-20, ISO 9001 8.7): disposisjon med hvem som besluttet, aksept fra kunden med
 * bevis, og ny kontroll etter retting før saken kan lukkes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { assessFinding, closeBlockers, confirmReverified, createFinding, setDisposition, triageFinding } from './findings.js';

const ANNE = { uid: 'u1', name: 'Anne Kvalitet' };
const now = new Date('2026-10-28T10:00:00Z');

function delivery(type = 'leveranse') {
  let f = createFinding({ type, title: 'Feil mål på trapp', description: 'Trappen er 3 cm for kort', assigneeName: 'Anne', assigneeUid: 'u1' }, { actor: ANNE, now }).finding;
  f = triageFinding(f, { severity: 'middels', assigneeName: 'Anne', assigneeUid: 'u1' }, { actor: ANNE, now }).finding;
  return assessFinding(f, { correctiveRequired: false, rationale: 'Engangsfeil, rettes på stedet.' }, { actor: ANNE, now }).finding;
}

test('ISO-20: leveranseavvik kan ikke lukkes uten disposisjon', () => {
  const f = delivery();
  assert.ok(closeBlockers(f).some((b) => /disposisjon/.test(b)));
  assert.equal(setDisposition(f, { id: 'x' }, { actor: ANNE, now }).ok, false);
  const res = setDisposition(f, { id: 'utskilt', note: 'Trappen er sperret' }, { actor: ANNE, now });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.finding.disposition.decidedByUid, 'u1');
  assert.ok(!closeBlockers(res.finding).some((b) => /disposisjon/.test(b)));
});

test('ISO-20: aksept fra kunden krever hvem og bevis', () => {
  const f = delivery('kundeklage');
  assert.equal(setDisposition(f, { id: 'akseptert', concessionBy: 'Byggherre AS' }, { actor: ANNE, now }).ok, false);
  const ok = setDisposition(f, { id: 'akseptert', concessionBy: 'Kari i Byggherre AS', concessionRef: 'E-post 27.10.2026' }, { actor: ANNE, now });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.finding.disposition.concessionRef, 'E-post 27.10.2026');
  assert.equal(setDisposition(createFinding({ type: 'prosess', title: 'x', description: 'y' }, { actor: ANNE, now }).finding, { id: 'utskilt' }, { actor: ANNE, now }).ok, false, 'bare leveranse og kundeklage');
});

test('ISO-20: korrigert leveranse må kontrolleres på nytt før lukking', () => {
  const f = setDisposition(delivery(), { id: 'korrigert', note: 'Ny trapp montert' }, { actor: ANNE, now }).finding;
  assert.ok(closeBlockers(f).some((b) => /på nytt etter rettingen/.test(b)));
  assert.equal(confirmReverified(f, 'kort', { actor: ANNE, now }).ok, false);
  const done = confirmReverified(f, 'Målt etter montering: innenfor toleranse', { actor: ANNE, now });
  assert.equal(done.ok, true, done.error);
  assert.equal(done.finding.disposition.reverifiedBy, 'Anne Kvalitet');
  assert.ok(!closeBlockers(done.finding).some((b) => /etter rettingen/.test(b)));
});
