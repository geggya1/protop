/**
 * Startpakken satte eieren som revisor på alle revisjonene og krysset av for uavhengighet.
 * Nå velges en revisor som ikke eier eller aktiverer systemet, og uavhengigheten bekreftes
 * på revisjonen før den kan starte (9.2.2 c).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { starterAuditor } from './integrations.js';
import { addAuditFinding, auditReadyError, createRecord, setRecordState } from './registers.js';
import { isoCapabilities } from './access.js';

const OWNER = { uid: 'u-eier', name: 'Iso Leder' };
const now = new Date('2026-10-28T10:00:00Z');
const APPROVER = isoCapabilities({ grants: { iso: 'read' }, uid: OWNER.uid, approverUids: [OWNER.uid] });

test('startpakken: eieren blir ikke revisor; kvalitetsleder eller internrevisor velges', () => {
  const allOwner = { ownerUid: OWNER.uid, ownerName: OWNER.name, roleMap: { quality_manager: { ...OWNER }, hse_manager: { ...OWNER } } };
  assert.equal(starterAuditor(allOwner, OWNER), null, 'lite firma der eieren har alle rollene: revisor velges senere');
  const withQm = { ...allOwner, roleMap: { quality_manager: { name: 'Kari Kvalitet', uid: 'u-kari' } } };
  assert.deepEqual(starterAuditor(withQm, OWNER), { name: 'Kari Kvalitet', uid: 'u-kari' });
  const sameName = { ...allOwner, roleMap: { quality_manager: { name: ' iso leder ', uid: '' }, hse_manager: { name: 'Hilde HMS', uid: 'u-h' } } };
  assert.equal(starterAuditor(sameName, OWNER).name, 'Hilde HMS', 'samme navn uten uid regnes som eieren');
  const auditorRole = { ...allOwner, roleMap: { internal_auditor: { name: 'Ekstern revisor AS' } } };
  assert.equal(starterAuditor(auditorRole, OWNER).name, 'Ekstern revisor AS');
});

test('startpakken: revisjon uten revisor er et utkast som ikke kan starte før revisor og uavhengighet er satt', () => {
  const base = { title: 'Internrevisjon ISO 9001', scope: 'Hele systemet', criteria: 'ISO 9001', plannedDate: '2026-12-27', auditorName: '', independence: false };
  assert.equal(createRecord('revisjon', base, { actor: OWNER, now }).ok, false, 'vanlig registrering krever revisor');
  const draft = createRecord('revisjon', base, { actor: OWNER, now, draft: true });
  assert.equal(draft.ok, true, draft.error);
  assert.equal(draft.record.independence, false);
  assert.match(auditReadyError(draft.record), /Velg revisor/);
  assert.match(setRecordState(draft.record, 'pagar', { actor: OWNER, caps: APPROVER, now }).error, /Velg revisor/);
  assert.equal(addAuditFinding(draft.record, { classification: 'samsvar', description: 'OK' }, { actor: OWNER, now }).ok, false);
  const named = { ...draft.record, auditorName: 'Kari Kvalitet' };
  assert.match(auditReadyError(named), /ikke reviderer eget arbeid/);
  const ready = { ...named, independence: true };
  assert.equal(auditReadyError(ready), '');
  assert.equal(setRecordState(ready, 'pagar', { actor: OWNER, caps: APPROVER, now }).ok, true);
  assert.equal(createRecord('revisjon', { ...base, plannedDate: '27.12' }, { actor: OWNER, now, draft: true }).ok, false, 'feil format stoppes også i utkast');
});
