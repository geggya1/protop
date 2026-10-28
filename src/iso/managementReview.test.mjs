/**
 * Ledelsens gjennomgang (ISO-07): grunnlaget dekker alle punktene i 9.3.2 for perioden,
 * og referatet kan ikke godkjennes uten konklusjon og output (9.3.3).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { managementReviewSnapshot, reviewPeriod } from './analytics.js';
import {
  REVIEW_INPUTS, addReviewDecision, attachReviewSnapshot, createRecord, missingReviewInputs, reviewApprovalBlockers, setRecordState, setReviewConclusion,
} from './registers.js';
import { emptyIsoState } from './state.js';
import { isoCapabilities } from './access.js';

const ANNE = { uid: 'u1', name: 'Anne Kvalitet' };
const now = new Date('2026-11-15T10:00:00Z');
const APPROVER = isoCapabilities({ grants: { iso: 'read' }, uid: 'u1', approverUids: ['u1'] });
const LISTED = isoCapabilities({ grants: { iso: 'read' }, uid: 'u1', approverUids: ['u1'], restricted: { uids: ['u1'] } });

function state() {
  const s = emptyIsoState();
  s.system = { ...s.system, standards: ['ISO9001', 'ISO14001', 'ISO45001'], setupAt: '2026-01-01', climate: { relevant: true, rationale: 'Ekstremvær stopper arbeid ute', assessedAt: '2026-02-01' } };
  s.findings = [
    { id: 'f1', type: 'nestenulykke', state: 'lukket', reportedAt: '2026-03-02T10:00:00Z', closedAt: '2026-03-20', dueAt: '2026-03-30', title: 'Løs planke', actions: [] },
    { id: 'f2', type: 'hms', state: 'triage', restricted: true, reportedAt: '2026-05-10T10:00:00Z', title: 'Kutt', actions: [], reportedByUid: 'x' },
    { id: 'f3', type: 'kundeklage', state: 'lukket', reportedAt: '2024-01-02T10:00:00Z', closedAt: '2024-02-01', title: 'Gammel klage', actions: [] },
  ];
  s.records.revisjon = [
    { id: 'r1', number: 'REV-2026-001', title: 'ISO 9001', state: 'godkjent', plannedDate: '2026-04-01', findings: [{ classification: 'avvik' }, { classification: 'forbedring' }] },
    { id: 'r2', number: 'REV-2023-001', title: 'Gammel', state: 'lukket', plannedDate: '2023-04-01', updatedAt: '2023-05-01', findings: [] },
  ];
  s.records.kontekst = [{ id: 'k1', register: 'kontekst', title: 'Mangel på fagarbeidere', state: 'aktiv', createdAt: '2026-02-01' }];
  s.records.medvirkning = [{ id: 'm1', register: 'medvirkning', title: 'Støy', createdAt: '2026-06-01' }];
  return s;
}

const review = () => createRecord('ledelse', { title: 'LGJ 2026', period: '2026', meetingDate: '2026-11-10', participants: 'Ledergruppen' }, { actor: ANNE, now }).record;

test('ISO-07: grunnlaget har alle punktene i 9.3.2 og tilleggene i 14001 og 45001', () => {
  const snap = managementReviewSnapshot(state(), APPROVER, { now, record: review() });
  assert.deepEqual(missingReviewInputs(snap), []);
  const keys = snap.sections.map((x) => x.key);
  for (const k of REVIEW_INPUTS) assert.ok(keys.includes(k), k);
  assert.ok(keys.includes('environment') && keys.includes('participation') && keys.includes('incidents'));
  const text = (key) => snap.sections.find((x) => x.key === key).lines.join(' | ');
  assert.match(text('context'), /Klimaendringer: relevant/);
  assert.match(text('context'), /Mangel på fagarbeidere/);
  assert.match(text('participation'), /1 medvirkningssaker/);
});

test('ISO-07: perioden styrer utvalget; gamle revisjoner og saker er ikke med', () => {
  assert.deepEqual(reviewPeriod({ period: '2026' }), { from: '2026-01-01', to: '2026-12-31', label: '2026' });
  assert.equal(reviewPeriod({ period: '2026-H2' }).from, '2026-07-01');
  assert.equal(reviewPeriod({ period: 'Q', meetingDate: '2026-11-10' }).from, '2025-11-10');
  const snap = managementReviewSnapshot(state(), APPROVER, { now, record: review() });
  assert.deepEqual(snap.audits.map((a) => a.number), ['REV-2026-001']);
  assert.doesNotMatch(snap.sections.find((x) => x.key === 'satisfaction').lines.join(' '), /1 kundeklager/);
});

test('ISO-07: skjermede saker telles bare med særskilt tilgang, og grunnlaget sier fra når de mangler', () => {
  const without = managementReviewSnapshot(state(), APPROVER, { now, record: review() });
  assert.equal(without.restrictedIncluded, false);
  assert.match(without.restrictedNote, /Skjermede HMS-saker er ikke med/);
  assert.match(without.sections.find((x) => x.key === 'incidents').lines[0], /1 personskader og nestenulykker .*uten skjermede/);
  const withIt = managementReviewSnapshot(state(), LISTED, { now, record: review() });
  assert.equal(withIt.restrictedIncluded, true);
  assert.match(withIt.sections.find((x) => x.key === 'incidents').lines[0], /^2 personskader/);
});

test('ISO-07: godkjenning krever grunnlag, konklusjon og vedtak eller begrunnet «ingen» per output', () => {
  let r = review();
  assert.equal(setRecordState(r, 'godkjent', { actor: ANNE, caps: APPROVER, now }).ok, false, 'uten grunnlag');
  r = attachReviewSnapshot(r, managementReviewSnapshot(state(), LISTED, { now, record: r }), { actor: ANNE, now }).record;
  const blockers = reviewApprovalBlockers(r);
  assert.ok(blockers.some((b) => /konklusjonen/.test(b)));
  assert.equal(blockers.filter((b) => /legg inn vedtak/.test(b)).length, 3, 'forbedring, endring og ressurser');
  r = addReviewDecision(r, { decision: 'Innfør ukentlig vernerunde', kind: 'forbedring', ownerName: 'Anne', ownerUid: 'u1', dueAt: '2026-12-01' }, { actor: ANNE, now }).record;
  r = setReviewConclusion(r, { assessment: 'Systemet er egnet og tilstrekkelig, men avvik lukkes for sent.', outputs: { endring: 'Ingen endringer i systemet.' } }, { actor: ANNE, now }).record;
  assert.deepEqual(reviewApprovalBlockers(r), ['Behov for ressurser: legg inn vedtak, eller begrunn at det ikke trengs.']);
  r = setReviewConclusion(r, { outputs: { endring: 'Ingen endringer i systemet.', ressurs: 'Bemanningen holder.' } }, { actor: ANNE, now }).record;
  assert.deepEqual(reviewApprovalBlockers(r), []);
  const ok = setRecordState(r, 'godkjent', { actor: ANNE, caps: APPROVER, now });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.record.locked, true);
  assert.equal(setReviewConclusion(ok.record, { assessment: 'Endret etterpå' }, { actor: ANNE, now }).ok, false, 'låst etter godkjenning');
});

test('ISO-07: grunnlag hentet uten skjermede saker krever bekreftelse; eldre grunnlag må hentes på nytt', () => {
  let r = review();
  r = attachReviewSnapshot(r, managementReviewSnapshot(state(), APPROVER, { now, record: r }), { actor: ANNE, now }).record;
  r = setReviewConclusion(r, { assessment: 'Systemet er egnet og tilstrekkelig.', outputs: { forbedring: 'Ingen nye.', endring: 'Ingen.', ressurs: 'Holder.' } }, { actor: ANNE, now }).record;
  assert.ok(reviewApprovalBlockers(r).some((b) => /uten skjermede HMS-saker/.test(b)));
  r = setReviewConclusion(r, { restrictedConfirmed: true }, { actor: ANNE, now }).record;
  assert.deepEqual(reviewApprovalBlockers(r), []);
  const old = { ...r, snapshot: { kpis: [], takenAt: '2025-01-01' } };
  assert.ok(reviewApprovalBlockers(old).some((b) => /eldre versjon/.test(b)));
});
