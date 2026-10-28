/**
 * Avviksflyten: meldeplikt og triage (ISO-01), effektkontroll, årsak og egenkontroll (ISO-10)
 * og saksnummer fra teller (ISO-23). Hver test gjenskaper feilen fra revisjonen.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addAction, assessFinding, closeBlockers, closeFinding, completeAction, completedBySelf, createFinding, needsNewActions,
  notificationTaskKey, recordRootCause, triageFinding, verifyAction, verifyEffect, withInvolved,
} from './findings.js';
import { newFindingEffects, notificationTaskEffects } from './integrations.js';
import { numberFromCounter, numberParts } from './core.js';
import { isoCapabilities } from './access.js';

const ANNE = { uid: 'u1', name: 'Anne Kvalitet' };
const PER = { uid: 'u2', name: 'Per Tiltak' };
const BOSS = { uid: 'u3', name: 'Siri Leder' };
const ADMIN = isoCapabilities({ bypass: true, uid: 'u3', restricted: { uids: ['u3'] } });
const day1 = new Date('2026-10-22T10:00:00Z');
const day2 = new Date('2026-10-23T10:00:00Z');
const day3 = new Date('2026-10-24T10:00:00Z');
const SYSTEM = { roleMap: { hse_manager: { name: 'Hilde HMS', uid: 'h1' }, top_management: { name: 'Siri Leder', uid: 'u3' }, quality_manager: { name: 'Anne Kvalitet', uid: 'u1' } } };

const hms = (input = {}) => createFinding({
  type: 'hms', title: 'Fall fra stillas', description: 'Montør falt to meter.', assigneeName: 'Hilde HMS', assigneeUid: 'h1', ...input,
}, { actor: PER, now: day1 });

test('ISO-01: mulig meldeplikt gir triagefrist samme dag, ikke om tre dager', () => {
  const plain = hms();
  assert.equal(plain.finding.triageDue, '2026-10-25', 'vanlig sak: tre dager');
  const notifiable = hms({ authorityNotificationRequired: true, notificationAssignee: 'Siri Leder', notificationAssigneeUid: 'u3' });
  assert.equal(notifiable.ok, true, notifiable.error);
  assert.equal(notifiable.finding.triageDue, '2026-10-22');
  assert.equal(notifiable.finding.notificationDue, '2026-10-22', 'varslingsfrist samme dag');
});

test('ISO-01: melder kan angi alvorlighet og skadeklasse, alvorlig skade gir triage samme dag', () => {
  const serious = hms({ injuryClass: 'alvorlig' });
  assert.equal(serious.finding.injuryClass, 'alvorlig');
  assert.equal(serious.finding.triageDue, '2026-10-22');
  const critical = hms({ severity: 'kritisk' });
  assert.equal(critical.finding.severity, 'kritisk');
  assert.equal(critical.finding.triageDue, '2026-10-22');
  assert.equal(hms({ injuryClass: 'forstehjelp' }).finding.triageDue, '2026-10-25');
  assert.equal(hms({ injuryClass: 'tull' }).finding.injuryClass, '');
});

test('ISO-01: den som varsler myndighet får oppgave med frist samme dag, og ser den skjermede saken', () => {
  const f = hms({ authorityNotificationRequired: true, notificationAssignee: 'Siri Leder', notificationAssigneeUid: 'u3' }).finding;
  assert.equal(f.notificationAssigneeUid, 'u3');
  const effects = newFindingEffects(f, SYSTEM);
  const notify = effects.find((e) => e.key === notificationTaskKey(f));
  assert.ok(notify, 'oppgave til varslingsansvarlig');
  assert.equal(notify.assigneeUid, 'u3');
  assert.equal(notify.deadline, '2026-10-22');
  assert.equal(notify.push, true);
  const triage = effects.find((e) => e.key === `iso_${f.id}_triage`);
  assert.equal(triage.deadline, '2026-10-22');
  assert.equal(triage.push, true, 'behandler varsles straks');
  // HMS-leder er behandler og øverste ledelse varsler, så ingen får dobbelt varsel.
  assert.equal(effects.some((e) => e.type === 'push'), false);
  assert.ok(withInvolved(f).involvedUids.includes('u3'), 'varslingsansvarlig er involvert (reglene gir lesetilgang)');
});

test('ISO-01: alvorlig skade uten valgt varsler gir varsel til HMS-leder og øverste ledelse', () => {
  const f = createFinding({ type: 'hms', title: 'Kuttskade', description: 'Dyp kuttskade', injuryClass: 'alvorlig' }, { actor: PER, now: day1 }).finding;
  const effects = newFindingEffects(f, SYSTEM);
  const push = effects.find((e) => e.type === 'push');
  assert.deepEqual(push.uids.sort(), ['h1', 'u3']);
  assert.deepEqual(notificationTaskEffects(f), [], 'ingen meldeplikt valgt: ingen varslingsoppgave');
  // Vanlig sak: ingen varsler, bare triage-oppgaven (som før).
  const normal = createFinding({ type: 'prosess', title: 'Feil', description: 'x', assigneeUid: 'u1', assigneeName: 'Anne' }, { actor: PER, now: day1 }).finding;
  const fx = newFindingEffects(normal, SYSTEM);
  assert.equal(fx.length, 1);
  assert.equal(fx[0].push, undefined);
});

test('ISO-01: ny varslingsansvarlig i triage får egen oppgave', () => {
  const f = hms({ authorityNotificationRequired: true, notificationAssignee: 'Siri Leder', notificationAssigneeUid: 'u3' }).finding;
  const t = triageFinding(f, { severity: 'hoy', assigneeName: 'Hilde HMS', notifiable: true, notificationAssignee: 'Anne Kvalitet', notificationAssigneeUid: 'u1' }, { actor: BOSS, now: day1 });
  assert.equal(t.ok, true, t.error);
  assert.equal(t.finding.notificationAssigneeUid, 'u1');
  assert.notEqual(notificationTaskKey(t.finding), notificationTaskKey(f));
  // Samme navn som før: uid beholdes.
  const same = triageFinding(f, { severity: 'hoy', assigneeName: 'Hilde HMS', notifiable: true, notificationAssignee: 'Siri Leder' }, { actor: BOSS, now: day1 });
  assert.equal(same.finding.notificationAssigneeUid, 'u3');
});

function toEffectCheck({ type = 'prosess' } = {}) {
  let f = createFinding({ type, title: 't', description: 'd' }, { actor: ANNE, now: day1 }).finding;
  f = triageFinding(f, { severity: 'lav', assigneeName: ANNE.name }, { actor: ANNE, now: day1 }).finding;
  f = assessFinding(f, { correctiveRequired: true }, { actor: ANNE, now: day1 }).finding;
  const r = addAction(f, { title: 'a', ownerName: PER.name, ownerUid: PER.uid, dueAt: '2026-11-01' }, { actor: ANNE, now: day1 });
  f = completeAction(r.finding, r.action.id, { note: 'gjort' }, { actor: PER, now: day1 }).finding;
  return verifyAction(f, r.action.id, { approved: true }, { actor: ANNE, now: day1 }).finding;
}

test('ISO-10: «ikke verifisert» kan ikke følges av ny verifisering uten nye tiltak', () => {
  let f = toEffectCheck();
  f = verifyEffect(f, { outcome: 'ikke_verifisert', method: 'm', note: 'Gjentok seg' }, { actor: BOSS, now: day2 }).finding;
  assert.equal(f.state, 'vurdert');
  assert.equal(needsNewActions(f), true);
  const again = verifyEffect(f, { outcome: 'verifisert', method: 'm', note: 'n' }, { actor: BOSS, now: day2 });
  assert.equal(again.ok, false, 'saken ble lukket uten nye tiltak før rettingen');
  assert.match(again.error, /nye tiltak/);
  // Nytt tiltak etter kontrollen: da kan effekten kontrolleres igjen.
  const r = addAction(f, { title: 'Nytt tiltak', ownerName: PER.name, ownerUid: PER.uid, dueAt: '2026-11-10' }, { actor: ANNE, now: day3 });
  f = completeAction(r.finding, r.action.id, { note: 'gjort' }, { actor: PER, now: day3 }).finding;
  f = verifyAction(f, r.action.id, { approved: true }, { actor: ANNE, now: day3 }).finding;
  assert.equal(f.state, 'effektkontroll');
  const ok = verifyEffect(f, { outcome: 'verifisert', method: 'm', note: 'Virker' }, { actor: BOSS, now: day3 });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(closeFinding(ok.finding, { note: 'ok' }, { actor: BOSS, caps: ADMIN, now: day3 }).ok, true);
});

test('ISO-10: HMS-hendelse krever årsaksanalyse også når det besluttes «ingen tiltak»', () => {
  let f = createFinding({ type: 'hms', title: 'Fall', description: 'Fall fra stige' }, { actor: ANNE, now: day1 }).finding;
  f = triageFinding(f, { severity: 'kritisk', assigneeName: BOSS.name }, { actor: BOSS, now: day1 }).finding;
  f = assessFinding(f, { correctiveRequired: false, rationale: 'Engangshendelse, stige kassert og erstattet.' }, { actor: BOSS, now: day1 }).finding;
  assert.ok(closeBlockers(f).includes('Årsaksvurdering mangler.'));
  assert.equal(closeFinding(f, { note: 'ok' }, { actor: BOSS, caps: ADMIN, now: day1 }).ok, false);
  f = recordRootCause(f, { systemCause: 'Stigen var ikke kontrollert før bruk.' }, { actor: BOSS, now: day1 }).finding;
  assert.equal(closeFinding(f, { note: 'ok' }, { actor: BOSS, caps: ADMIN, now: day1 }).ok, true);
  // Kvalitetsavvik med lav alvorlighet og «ingen tiltak»: som før, ingen årsak kreves.
  let q = createFinding({ type: 'forbedring', title: 'Idé', description: 'x' }, { actor: ANNE, now: day1 }).finding;
  q = triageFinding(q, { severity: 'lav', assigneeName: ANNE.name }, { actor: ANNE, now: day1 }).finding;
  q = assessFinding(q, { correctiveRequired: false, rationale: 'Notert, ingen risiko for kunde.' }, { actor: ANNE, now: day1 }).finding;
  assert.deepEqual(closeBlockers(q), []);
});

test('ISO-10: egenkontroll sjekkes på bruker-id, ikke navn', () => {
  let f = createFinding({ type: 'prosess', title: 't', description: 'd' }, { actor: ANNE, now: day1 }).finding;
  f = triageFinding(f, { severity: 'lav', assigneeName: ANNE.name }, { actor: ANNE, now: day1 }).finding;
  f = assessFinding(f, { correctiveRequired: true }, { actor: ANNE, now: day1 }).finding;
  const r = addAction(f, { title: 'a', ownerName: 'Ola Hansen', ownerUid: 'o1', dueAt: '2026-11-01' }, { actor: ANNE, now: day1 });
  f = completeAction(r.finding, r.action.id, { note: 'gjort' }, { actor: { uid: 'o1', name: 'Ola Hansen' }, now: day1 }).finding;
  const action = f.actions[0];
  assert.equal(action.completedByUid, 'o1');
  // En annen ansatt med samme navn kan kontrollere.
  assert.equal(completedBySelf(action, { uid: 'o2', name: 'Ola Hansen' }), false);
  assert.equal(verifyAction(f, action.id, { approved: true }, { actor: { uid: 'o2', name: 'Ola Hansen' }, now: day1 }).ok, true);
  // Samme person med nytt visningsnavn er fortsatt egenkontroll.
  assert.equal(verifyAction(f, action.id, { approved: true }, { actor: { uid: 'o1', name: 'Ola H.' }, now: day1 }).ok, false);
  // Eldre tiltak uten uid: navnet brukes.
  assert.equal(completedBySelf({ completedBy: 'Ola Hansen' }, { uid: 'x', name: 'Ola Hansen' }), true);
});

test('ISO-15: tiltak meldt utført oppgir indeksen reglene sjekker', () => {
  let f = createFinding({ type: 'prosess', title: 't', description: 'd' }, { actor: ANNE, now: day1 }).finding;
  f = triageFinding(f, { severity: 'lav', assigneeName: ANNE.name }, { actor: ANNE, now: day1 }).finding;
  f = addAction(f, { title: 'a', ownerName: 'X', dueAt: '2026-11-01' }, { actor: ANNE, now: day1 }).finding;
  const r = addAction(f, { title: 'b', ownerName: PER.name, ownerUid: PER.uid, dueAt: '2026-11-01' }, { actor: ANNE, now: day1 });
  const done = completeAction(r.finding, r.action.id, { note: 'gjort' }, { actor: PER, now: day1 }).finding;
  assert.equal(done.doneActionIndex, 1);
});

test('ISO-23: saksnummer tildeles mot telleren, ikke bare ut fra sakene brukeren ser', () => {
  assert.deepEqual(numberParts('AVV-2026-007'), { series: 'AVV-2026', n: 7 });
  assert.equal(numberParts('DOK-1'), null);
  // Brukeren ser AVV-2026-001, men en skjermet AVV-2026-002 finnes: telleren står på 2.
  const seen = createFinding({ type: 'prosess', title: 't', description: 'd' }, { actor: ANNE, existing: [{ number: 'AVV-2026-001' }], now: day1 }).finding;
  assert.equal(seen.number, 'AVV-2026-002', 'klienten alene ville gitt et nummer som finnes');
  assert.deepEqual(numberFromCounter(seen.number, 2), { number: 'AVV-2026-003', series: 'AVV-2026', last: 3 });
  // To samtidige meldinger: den andre transaksjonen leser telleren den første skrev.
  assert.equal(numberFromCounter('AVV-2026-003', 3).number, 'AVV-2026-004');
  // Ny teller (første sak etter utrulling): klientens forslag brukes og telleren starter der.
  assert.deepEqual(numberFromCounter('AVV-2026-012', 0), { number: 'AVV-2026-012', series: 'AVV-2026', last: 12 });
});
