/**
 * Rekkefølgen i internrevisjon og ledelsens gjennomgang (DRIFT-25 og funn fra testboten):
 * revisjonsrapport godkjennes bare fra «Rapport», med funn og konklusjon, og godkjent
 * gjennomgang kan lukkes når alle vedtak er fulgt opp.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REVIEW_INPUTS, addAuditFinding, addReviewDecision, attachReviewSnapshot, createRecord, markDecisionDone, nextStates, setRecordState, setReviewConclusion,
} from './registers.js';
import { isoCapabilities } from './access.js';

const ANNE = { uid: 'u1', name: 'Anne Kvalitet' };
const now = new Date('2026-10-28T10:00:00Z');
const APPROVER = isoCapabilities({ grants: { iso: 'read' }, uid: 'u1', approverUids: ['u1'] });

function audit(extra = {}) {
  return createRecord('revisjon', {
    title: 'Innkjøp', scope: 'P05', criteria: 'ISO 9001 8.4', auditorName: 'Kari Kvalitet', independence: true, plannedDate: '2026-10-01', ...extra,
  }, { actor: ANNE, now }).record;
}

test('DRIFT-25: revisjonsrapport kan ikke godkjennes rett fra «planlagt», heller ikke med konklusjon', () => {
  const a = audit({ conclusion: 'Innkjøpsprosessen er i samsvar med kravene.' });
  const res = setRecordState(a, 'godkjent', { actor: ANNE, caps: APPROVER, now });
  assert.equal(res.ok, false);
  assert.match(res.error, /fra «Rapport»/);
  assert.equal(setRecordState(a, 'rapport', { actor: ANNE, caps: APPROVER, now }).ok, false, 'rapport krever gjennomført revisjon');
  assert.deepEqual(nextStates(a), ['pagar', 'avlyst']);
});

test('DRIFT-25: rapport krever minst ett funn og konklusjon, og godkjenning skjer fra «Rapport»', () => {
  let a = setRecordState(audit(), 'pagar', { actor: ANNE, caps: APPROVER, now }).record;
  assert.match(setRecordState(a, 'rapport', { actor: ANNE, caps: APPROVER, now }).error, /minst ett funn/);
  a = addAuditFinding(a, { classification: 'samsvar', description: 'Leverandører vurderes årlig.' }, { actor: ANNE, now }).record;
  assert.match(setRecordState(a, 'rapport', { actor: ANNE, caps: APPROVER, now }).error, /konklusjonen/);
  a = { ...a, conclusion: 'Innkjøpsprosessen er i samsvar med kravene.' };
  a = setRecordState(a, 'rapport', { actor: ANNE, caps: APPROVER, now }).record;
  assert.deepEqual(nextStates(a), ['godkjent', 'pagar']);
  const ok = setRecordState(a, 'godkjent', { actor: ANNE, caps: APPROVER, now });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.record.locked, true);
  // Godkjent: videre til oppfølging eller lukket, og tilbake til rapport opphever godkjenningen.
  assert.deepEqual(nextStates(ok.record), ['oppfolging', 'lukket', 'rapport']);
  const follow = setRecordState(ok.record, 'oppfolging', { actor: ANNE, caps: APPROVER, now });
  assert.equal(follow.record.locked, true);
  assert.equal(setRecordState(follow.record, 'lukket', { actor: ANNE, caps: APPROVER, now }).record.state, 'lukket');
});

function approvedReview() {
  let r = createRecord('ledelse', { title: 'LGJ 2026', period: '2026', meetingDate: '2026-10-01', participants: 'Ledergruppen' }, { actor: ANNE, now }).record;
  r = addReviewDecision(r, { decision: 'Innfør ukentlig vernerunde', ownerName: ANNE.name, ownerUid: ANNE.uid, dueAt: '2026-11-15' }, { actor: ANNE, now }).record;
  r = attachReviewSnapshot(r, { sections: REVIEW_INPUTS.map((key) => ({ key, lines: [] })), restrictedIncluded: true }, { actor: ANNE, now }).record;
  r = setReviewConclusion(r, { assessment: 'Systemet er egnet og tilstrekkelig.', outputs: { endring: 'Ingen endringer trengs.', ressurs: 'Ressursene er nok.' } }, { actor: ANNE, now }).record;
  return setRecordState(r, 'godkjent', { actor: ANNE, caps: APPROVER, now }).record;
}

test('DRIFT-25: godkjent ledelsens gjennomgang lukkes når alle vedtak er fulgt opp', () => {
  const r = approvedReview();
  assert.equal(r.locked, true);
  assert.deepEqual(nextStates(r), ['lukket', 'gjennomfort']);
  const early = setRecordState(r, 'lukket', { actor: ANNE, caps: APPROVER, now });
  assert.equal(early.ok, false);
  assert.match(early.error, /1 vedtak er ikke gjennomført/);
  // Ferdig i Oppgaver teller også.
  const viaTasks = setRecordState(r, 'lukket', { actor: ANNE, caps: APPROVER, now, tasks: { [r.decisions[0].taskKey]: { done: true } } });
  assert.equal(viaTasks.ok, true, viaTasks.error);
  const done = markDecisionDone(r, r.decisions[0].id, { actor: ANNE, caps: APPROVER, now }).record;
  const closed = setRecordState(done, 'lukket', { actor: ANNE, caps: APPROVER, now });
  assert.equal(closed.ok, true, closed.error);
  assert.equal(closed.record.locked, true, 'lukket beholder låsen');
  assert.equal(setRecordState(r, 'lukket', { actor: ANNE, caps: isoCapabilities({ grants: { iso: 'read' }, uid: 'u2' }), now }).ok, false, 'bare godkjenner');
});
