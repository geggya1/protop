/**
 * Registrene: låsen på godkjent internrevisjon og ledelsens gjennomgang, og oppfølging av vedtak (ISO-08),
 * kompetansebevis og CV-treff (ISO-13), måloppnåelse (ISO-14), risikometode (ISO-16) og øvelser (ISO-22).
 * Hver test gjenskaper feilen fra revisjonen.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addAuditFinding, addExercise, addMeasurement, addReviewDecision, competenceMatrix, createRecord, cvEvidence, decisionCompleted, markDecisionDone,
  objectiveProgress, periodSortKey, riskSummary, setRecordState, updateRecord, attachReviewSnapshot, setReviewConclusion, REVIEW_INPUTS,
} from './registers.js';
import { DEFAULT_RISK_METHOD, riskMatrixLevels } from './catalog.js';
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
  const audit = createRecord('revisjon', { title: 'Prosjektstyring', scope: 'Prosjekt', criteria: 'ISO 9001 kap 8', auditorName: 'Revisor', independence: true, plannedDate: '2026-10-01', conclusion: 'Prosessen er i hovedsak i samsvar.' }, { actor: ANNE, now }).record;
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
  // Godkjenning krever fullt grunnlag (9.3.2), konklusjon og output (ISO-07).
  review = attachReviewSnapshot(review, { sections: REVIEW_INPUTS.map((key) => ({ key, lines: [] })), restrictedIncluded: true }, { actor: ANNE, now }).record;
  review = setReviewConclusion(review, { assessment: 'Systemet er egnet og tilstrekkelig.', outputs: { endring: 'Ingen endringer trengs.', ressurs: 'Ressursene er nok.' } }, { actor: ANNE, now }).record;
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

test('ISO-13: nyeste gyldige kompetansebevis vinner over et eldre udatert bevis', () => {
  const req = { id: 'k1', title: 'Fallsikring', role: 'Alle ansatte', validityMonths: 12, state: 'aktiv' };
  const recs = [
    { id: 'a', requirementId: 'k1', personUid: 'p1', validFrom: '2024-01-01', state: 'gyldig' },
    { id: 'b', requirementId: 'k1', personUid: 'p1', validFrom: '2026-06-01', validTo: '2027-06-01', state: 'gyldig' },
  ];
  const cell = competenceMatrix([{ id: 'e1', uid: 'p1', name: 'Kari' }], [req], recs, now)[0].cells[0];
  assert.equal(cell.status, 'gyldig', 'ga «utløpt» før rettingen');
  assert.equal(cell.record.id, 'b');
  // Blant to gyldige vinner det som varer lengst (også når sluttdatoen er regnet fra «gyldig fra»).
  const two = [
    { id: 'c', requirementId: 'k1', personUid: 'p1', validFrom: '2026-01-01', state: 'gyldig' },
    { id: 'd', requirementId: 'k1', personUid: 'p1', validFrom: '2026-09-01', state: 'gyldig' },
  ];
  assert.equal(competenceMatrix([{ id: 'e1', uid: 'p1', name: 'Kari' }], [req], two, now)[0].cells[0].record.id, 'd');
});

test('ISO-13: CV-treff gjelder hele ord, ikke delord', () => {
  const cv = (title) => ({ cv: { courses: [{ title }] } });
  assert.equal(cvEvidence(cv('HMS'), { title: 'HMS-introduksjon' }), null, '«HMS» oppfylte «HMS-introduksjon» før rettingen');
  assert.equal(cvEvidence(cv('Fallsikringskurs'), { title: 'Fallsikring' }), null);
  assert.equal(cvEvidence(cv('HMS-introduksjon for nyansatte'), { title: 'HMS-introduksjon' })?.kind, 'Kurs');
  assert.equal(cvEvidence(cv('Kurs i varme arbeider'), { title: 'Varme arbeider' })?.kind, 'Kurs');
  assert.equal(cvEvidence(cv('Fallsikring'), { title: 'fallsikring' })?.kind, 'Kurs');
});

test('ISO-14: uten utgangsverdi vises ingen prosent, og årsmåling sorteres etter månedsmåling', () => {
  const goal = { register: 'mal', direction: 'Redusere', target: 5, baseline: null, measurements: [{ period: '2026-09', value: 8 }] };
  const p = objectiveProgress(goal);
  assert.equal(p.status, 'underveis');
  assert.equal(p.pct, null, 'viste «100 % av veien» før rettingen');
  assert.equal(objectiveProgress({ ...goal, baseline: '' }).pct, null);
  assert.equal(objectiveProgress({ ...goal, baseline: 10 }).pct, 40);
  assert.equal(objectiveProgress({ ...goal, baseline: 0, direction: 'Øke', target: 10 }).pct, 80, 'utgangsverdi 0 er en verdi');
  const m = addMeasurement({ register: 'mal', measurements: [{ period: '2026-05', value: 1 }] }, { period: '2026', value: 99 }, { actor: ANNE, now });
  assert.equal(m.record.measurements.at(-1).period, '2026', 'siste måling var 2026-05 før rettingen');
  assert.ok(periodSortKey('2026-Q2') > periodSortKey('2026-06') && periodSortKey('2026-Q2') < periodSortKey('2026-07'));
  // Usorterte målinger (f.eks. import): siste periode brukes likevel.
  assert.equal(objectiveProgress({ ...goal, measurements: [{ period: '2026', value: 4 }, { period: '2026-03', value: 9 }] }).value, 4);
});

test('ISO-16: risikomatrisen bruker virksomhetens terskler', () => {
  const strict = { ...DEFAULT_RISK_METHOD, version: '1.1', thresholds: { medium: 3, high: 6, critical: 12 } };
  const levels = riskMatrixLevels(strict);
  assert.equal(levels[0][2], 'middels', 'sannsynlighet 1 × konsekvens 3 = 3');
  assert.equal(levels[1][2], 'hoy', '2 × 3 = 6');
  assert.equal(levels[2][3], 'kritisk', '3 × 4 = 12');
  assert.equal(riskMatrixLevels()[2][3], 'hoy', 'standardmetoden: 12 er høy');
});

test('ISO-16: gamle vurderinger beholder metoden de ble gjort etter', () => {
  const r = createRecord('risiko', { kind: 'Risiko', title: 'Fall', category: 'arbeidsmiljo', inherentL: 2, inherentC: 3, ownerName: 'A' }, { actor: ANNE, now }).record;
  assert.deepEqual(r.methodThresholds, DEFAULT_RISK_METHOD.thresholds);
  const strict = { ...DEFAULT_RISK_METHOD, version: '1.1', thresholds: { medium: 3, high: 6, critical: 12 }, history: [{ version: '1.0', name: DEFAULT_RISK_METHOD.name, thresholds: DEFAULT_RISK_METHOD.thresholds }] };
  assert.equal(riskSummary(r, strict).inherent.id, 'middels', 'ble klassifisert om til «høy» før rettingen');
  // Eldre post uten lagrede terskler: versjonen slås opp i metodehistorikken.
  const legacy = { ...r, methodThresholds: undefined };
  assert.equal(riskSummary(legacy, strict).inherent.id, 'middels');
  // Ny vurdering (endret tall) gjøres etter gjeldende metode.
  const re = updateRecord(r, { inherentL: 2, inherentC: 4 }, { actor: ANNE, now, riskMethod: strict }).record;
  assert.equal(re.methodVersion, '1.1');
  assert.equal(riskSummary(re, strict).inherent.id, 'hoy');
  // Endring av annen tekst beholder metoden.
  assert.equal(updateRecord(r, { title: 'Fall fra stige' }, { actor: ANNE, now, riskMethod: strict }).record.methodVersion, '1.0');
});

test('ISO-22: registrert beredskapsøvelse flytter neste øvelsesdato', () => {
  const ber = { id: 'b1', register: 'beredskap', title: 'Brann', nextExercise: '2026-09-01', state: 'aktiv' };
  const ex = addExercise(ber, { date: '2026-10-20', evaluation: 'Gikk greit' }, { actor: ANNE, now });
  assert.equal(ex.record.nextExercise, '2027-10-20', 'sto fortsatt på 01.09.2026 før rettingen');
  assert.equal(addExercise(ber, { date: '2026-10-20', evaluation: 'ok', nextExercise: '2027-04-01' }, { actor: ANNE, now }).record.nextExercise, '2027-04-01');
  assert.equal(addExercise(ber, { date: '2026-10-20', evaluation: 'ok', nextExercise: '2026-10-01' }, { actor: ANNE, now }).ok, false);
  // En senere planlagt øvelse beholdes.
  assert.equal(addExercise({ ...ber, nextExercise: '2028-01-01' }, { date: '2026-10-20', evaluation: 'ok' }, { actor: ANNE, now }).record.nextExercise, '2028-01-01');
  // Påminnelsen forsvinner når neste øvelse er flyttet.
  const state = emptyIsoState();
  state.records = { ...state.records, beredskap: [ex.record] };
  assert.equal(autoTaskEffects(state, { now }).some((e) => e.title.startsWith('Gjennomfør beredskapsøvelse')), false);
});
