/**
 * Dokumentstyring: uavhengig godkjenning og valgt godkjenner (ISO-11), lesebekreftelse i stor skala
 * og hvem som mangler (ISO-12). Hver test gjenskaper feilen fra revisjonen.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acknowledgeRead, approvalBlocker, approveAndPublishDocument, createDocument, publishedRevisionOf, readAckStatus, saveDocumentDraft, submitDocument,
} from './documents.js';
import { isoCapabilities } from './access.js';

const ANNE = { uid: 'u1', name: 'Anne Kvalitet' };
const BOSS = { uid: 'u3', name: 'Siri Leder' };
const OLA = { uid: 'u4', name: 'Ola Godkjenner' };
const now = new Date('2026-10-27T10:00:00Z');
const APPROVE = isoCapabilities({ bypass: true, uid: 'u3' });

function submitted(input = {}, actor = ANNE) {
  const created = createDocument({ title: 'Policy', docType: 'policy', content: 'Vi skal …', ...input }, { actor, existing: [], now });
  assert.equal(created.ok, true, created.error);
  const sub = submitDocument(created.document, { actor, caps: { manage: true }, now });
  assert.equal(sub.ok, true, sub.error);
  return sub.document;
}

test('ISO-11: den som sendte inn, kan ikke godkjenne selv', () => {
  const doc = submitted({}, BOSS);
  assert.equal(doc.revisions[0].submittedByUid, BOSS.uid);
  const own = approveAndPublishDocument(doc, { actor: BOSS, caps: APPROVE, now });
  assert.equal(own.ok, false, 'egengodkjenning ble godtatt før rettingen');
  assert.match(own.error, /annen godkjenner/);
  assert.equal(approveAndPublishDocument(doc, { actor: OLA, caps: APPROVE, now }).ok, true);
});

test('ISO-11: eneste godkjenner kan godkjenne egen innsending bare med begrunnelse, og det logges', () => {
  const doc = submitted({}, BOSS);
  assert.equal(approveAndPublishDocument(doc, { actor: BOSS, caps: APPROVE, now, otherApprovers: false }).ok, false, 'mangler begrunnelse');
  const res = approveAndPublishDocument(doc, { actor: BOSS, caps: APPROVE, now, otherApprovers: false, selfApprovalReason: 'Eneste leder i firmaet.' });
  assert.equal(res.ok, true, res.error);
  const pub = publishedRevisionOf(res.document);
  assert.equal(pub.selfApproved, true);
  assert.match(res.document.history.at(-1).action, /egengodkjenning/);
});

test('ISO-11: valgt godkjenner respekteres', () => {
  const doc = submitted({ approverName: OLA.name, approverUid: OLA.uid });
  assert.equal(doc.approverUid, OLA.uid);
  assert.match(approvalBlocker(doc, BOSS, { caps: APPROVE }), /Ola Godkjenner/);
  assert.equal(approveAndPublishDocument(doc, { actor: BOSS, caps: APPROVE, now }).ok, false, 'annen godkjenner ble godtatt før rettingen');
  assert.equal(approveAndPublishDocument(doc, { actor: OLA, caps: APPROVE, now }).ok, true);
  // Bytte godkjenner i utkastet: uid følger navnet.
  const created = createDocument({ title: 'Rutine', docType: 'prosedyre', content: 'x', approverName: OLA.name, approverUid: OLA.uid }, { actor: ANNE, existing: [], now }).document;
  const changed = saveDocumentDraft(created, { approverName: 'Kari Uten Innlogging' }, { actor: ANNE, now }).document;
  assert.equal(changed.approverUid, '');
});

function published(acks = []) {
  const doc = submitted({ readAckRequired: true });
  return { ...approveAndPublishDocument(doc, { actor: BOSS, caps: APPROVE, now }).document, readAcks: acks };
}

test('ISO-12: lesebekreftelse virker etter 2000 kvitteringer og endrer ikke dokumentets revisjon', () => {
  const many = Array.from({ length: 2000 }, (_, i) => ({ revision: 1, uid: `x${i}`, name: `X${i}`, at: '2026-10-01' }));
  const doc = published(many);
  const res = acknowledgeRead(doc, { actor: OLA, now });
  assert.equal(res.ok, true);
  assert.equal(res.document.readAcks.length, 2001, 'listen ble kuttet til 2000 før rettingen, og reglene krever +1');
  assert.deepEqual(res.document.readAcks.at(-1), res.ack);
  assert.equal(res.document.rev, doc.rev, 'kvitteringen gir ikke ny revisjon (kolliderer ikke med redigering)');
  assert.equal(res.document.updatedBy, doc.updatedBy, 'den som leste, blir ikke «sist endret av»');
  assert.equal(acknowledgeRead(res.document, { actor: OLA, now }).already, true);
});

test('ISO-12: viser hvem av egne ansatte med innlogging som mangler', () => {
  const doc = published([{ revision: 1, uid: 'u1', name: 'Anne' }, { revision: 0, uid: 'u5', name: 'Gammel' }]);
  const people = [
    { uid: 'u1', name: 'Anne Kvalitet', own: true },
    { uid: 'u5', name: 'Per Gammel', own: true },
    { uid: '', name: 'Uten innlogging', own: true },
    { uid: 'e1', name: 'Innleid', own: false },
    { uid: 'u6', name: 'Bjørn', own: true },
  ];
  const status = readAckStatus(doc, people);
  assert.equal(status.acked.length, 1);
  assert.deepEqual(status.missing.map((p) => p.name), ['Bjørn', 'Per Gammel']);
});
