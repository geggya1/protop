/**
 * Registrene: låsen på godkjent internrevisjon og ledelsens gjennomgang, og oppfølging av vedtak (ISO-08).
 * Hver test gjenskaper feilen fra revisjonen.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addAuditFinding, addReviewDecision, createRecord, decisionCompleted, markDecisionDone, setRecordState,
} from './registers.js';
import { autoTaskEffects } from './integrations.js';
import { isoCapabilities } from './access.js';
import { emptyIsoState } from './state.js';

const ANNE = { uid: 'u1', name: 'Anne Kvalitet' };
const LES = { uid: 'u9', name: 'Lars Ansatt' };
const now = new Date('2026-10-27T10:00:00Z');
const APPROVER = isoCapabilities({ grants: { iso: 'read' }, uid: 'u1', approverUids: ['u1'] });
const MANAGER = isoCapabilities({ grants: { iso: 'read' }, uid: 'u2' });
const READER = isoCapabilities({ grants: { iso: 'see' }, uid: 'u9' });

function approvedAudit() {
  const audit = createRecord('revisjon', { title: 'Prosjektstyring', scope: 'Prosjekt', criteria: 'ISO 9001 kap 8', auditorName: 'Revisor', independence: true, plannedDate: '2026-10-01' }, { actor: ANNE, now }).record;
  const res = setRecordState(audit, 'godkjent', { actor: ANNE, caps: APPROVER, now });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.record.locked, true);
  return res.record;
}

test('ISO-08: godkjent internrevisjon som settes til «oppfølging» forblir låst', () => {
  const audit = approvedAudit();
  const follow = setRecordState(audit, 'oppfolging', { actor: ANNE, caps: APPROVER, now });
  assert.equal(follow.ok, true, follow.error);
  assert.equal(follow.record.locked, true, 'rapporten ble låst opp før rettingen');
  const closed = setRecordState(follow.record, 'lukket', { actor: ANNE, caps: APPROVER, now });
  assert.equal(closed.record.locked, true);
  assert.equal(addAuditFinding(follow.record, { classification: 'avvik', description: 'Nytt funn', evidence: 'x' }, { actor: ANNE, now }).ok, false, 'låst rapport får ikke nye funn');
});

test('ISO-08: bare godkjenner kan endre status på låst post, og å gå tilbake krever begrunnelse', () => {
  const audit = approvedAudit();
  assert.equal(setRecordState(audit, 'oppfolging', { actor: ANNE, caps: MANAGER, now }).ok, false, 'behandler uten godkjennerrolle');
  assert.equal(setRecordState(audit, 'planlagt', { actor: ANNE, caps: APPROVER, now }).ok, false, 'mangler begrunnelse');
  const revoked = setRecordState(audit, 'planlagt', { actor: ANNE, caps: APPROVER, now, note: 'Feil omfang, må revideres på nytt' });
  assert.equal(revoked.ok, true, revoked.error);
  assert.equal(revoked.record.locked, false, 'godkjenningen er opphevet');
  assert.match(revoked.record.history.at(-1).action, /Godkjenning opphevet/);
});

function approvedReview() {
  let review = createRecord('ledelse', { title: 'LGJ 2026', period: '2026', meetingDate: '2026-10-01', participants: 'Ledergruppen' }, { actor: ANNE, now }).record;
  review = addReviewDecision(review, { decision: 'Innfør ukentlig vernerunde', ownerName: LES.name, ownerUid: LES.uid, dueAt: '2026-10-15' }, { actor: ANNE, now }).record;
  review = addReviewDecision(review, { decision: 'Ny leverandørrutine', ownerName: ANNE.name, ownerUid: ANNE.uid, dueAt: '2026-10-20' }, { actor: ANNE, now }).record;
  return setRecordState(review, 'godkjent', { actor: ANNE, caps: APPROVER, now }).record;
}

test('ISO-08: vedtak i godkjent gjennomgang kan merkes utført av ansvarlig uten å åpne referatet', () => {
  const review = approvedReview();
  const [mine, other] = review.decisions;
  const done = markDecisionDone(review, mine.id, { actor: LES, caps: READER, now });
  assert.equal(done.ok, true, done.error);
  assert.equal(done.record.locked, true, 'referatet er fortsatt låst');
  assert.equal(done.record.decisions[0].done, true);
  assert.equal(done.record.decisions[0].doneByUid, LES.uid);
  assert.equal(done.record.doneDecisionIndex, 0, 'reglene får vite hvilket vedtak som er endret');
  assert.deepEqual(done.record.decisions[1], other, 'andre vedtak er uendret');
  assert.equal(markDecisionDone(review, other.id, { actor: LES, caps: READER, now }).ok, false, 'ikke andres vedtak');
  assert.equal(markDecisionDone(done.record, mine.id, { actor: LES, caps: READER, now }).ok, false, 'allerede utført');
  assert.equal(markDecisionDone(review, other.id, { actor: LES, caps: MANAGER, now }).ok, true, 'saksbehandler kan følge opp');
});

test('ISO-08: vedtak som er ferdig i Oppgaver gir ikke påminnelse om forfalt vedtak', () => {
  const review = approvedReview();
  const state = emptyIsoState();
  state.records = { ...state.records, ledelse: [review] };
  const titles = (tasks) => autoTaskEffects(state, { now, tasks }).filter((e) => e.title.startsWith('Forfalt vedtak')).map((e) => e.title);
  assert.equal(titles(null).length, 2);
  const key = review.decisions[0].taskKey.replace(/[^A-Za-z0-9_-]/g, '_');
  assert.equal(decisionCompleted(review.decisions[0], { [key]: { done: true } }), true);
  assert.deepEqual(titles({ [key]: { done: true } }), ['Forfalt vedtak: Ny leverandørrutine']);
});
