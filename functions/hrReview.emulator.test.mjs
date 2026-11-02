/**
 * Medarbeidersamtalen på serveren (hrReviewAction): bare den ansatte samtalen gjelder kan sende
 * forberedelse og signere, og bare i riktig steg. Signaturen ferdigstiller skjemaet, og kopien
 * sendes som PDF til begge.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test functions/hrReview.emulator.test.mjs"
 */
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

process.env.GCLOUD_PROJECT ||= 'demo-protop';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const { getFirestore } = await import('firebase-admin/firestore');
const { copyRecipients, employeeAction, employeeAddress, hrReviewAction, resendCopy } = await import('./hrReview.js');
const { libraryForm } = await import('../src/forms/ksLibrary.js');
const { newFilledDoc, setFilledValue } = await import('../src/forms/filledDocs.js');
const { invitationPrep, signAsLeader, signingPrep, employeeSignField, COMMENT_LABEL } = await import('../src/hr/reviewPrep.js');

const db = getFirestore();
const A = 'companyA';
const leader = { uid: 'leder', name: 'Lea Leder' };

function call(uid, data) {
  return hrReviewAction.run({
    data,
    auth: { uid, token: { email: `${uid}@firma.no`, email_verified: true } },
    rawRequest: { headers: {}, ip: '127.0.0.1' },
  });
}

function reviewDoc() {
  const form = { ...libraryForm('medarbeidersamtale'), id: 'tmpl', libraryKey: 'medarbeidersamtale' };
  let doc = newFilledDoc(form, { actor: leader, scope: 'hr', subject: { kind: 'employee', id: 'emp-ola', name: 'Ola Ansatt' } });
  for (const [label, value] of [['Medarbeider', 'Ola Ansatt'], ['Leder', 'Lea Leder'], ['Dato for samtalen', '2026-03-12']]) {
    const field = doc.fields.find((f) => f.label === label);
    doc = setFilledValue(doc, field.id, value, { actor: leader });
  }
  return doc;
}

let doc;
let sent;
const deps = {
  mailKey: 'test-key',
  authEmail: async (uid) => (uid === 'leder' ? 'lea@firma.no' : ''),
  sendMail: async (key, message) => { sent.push(message); return { ok: true }; },
};

beforeEach(async () => {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.ok(res.ok);
  sent = [];
  await db.doc(`families/${A}`).set({
    name: 'Bygg AS', type: 'organization', ownerUid: 'own', adminUids: ['own'],
    members: ['own', 'leder', 'ola', 'per'],
    company: { navn: 'Bygg AS' },
  });
  await db.doc(`families/${A}/employees/emp-ola`).set({ personUid: 'ola', person: { firstName: 'Ola', lastName: 'Ansatt', email: 'ola@privat.no' }, company: { email: 'ola@firma.no', status: 'active' } });
  await db.doc(`families/${A}/employees/emp-per`).set({ personUid: 'per', person: { firstName: 'Per' }, company: { status: 'active' } });
  doc = reviewDoc();
  await db.doc(`families/${A}/formDocs/${doc.id}`).set(JSON.parse(JSON.stringify(doc)));
  const prep = invitationPrep(doc, { employee: { id: 'emp-ola', personUid: 'ola', name: 'Ola Ansatt' }, leader, meetingDate: '2026-03-12', meetingTime: '10:00' });
  await db.doc(`families/${A}/hrReviewPrep/${doc.id}`).set(JSON.parse(JSON.stringify(prep)));
});

test('bare den ansatte samtalen gjelder kan sende inn', async () => {
  await assert.rejects(call('per', { familyId: A, docId: doc.id, action: 'submit', answers: {} }), (err) => err.code === 'permission-denied');
  await assert.rejects(call('leder', { familyId: A, docId: doc.id, action: 'sign' }), (err) => err.code === 'permission-denied');
  await assert.rejects(call('ola', { familyId: A, docId: doc.id, action: 'slett' }), (err) => err.code === 'invalid-argument');
  // Koblingen til ansattposten er fjernet: da hjelper det ikke at samtalen står på personen.
  await db.doc(`families/${A}/employees/emp-ola`).update({ personUid: 'annen' });
  await assert.rejects(call('ola', { familyId: A, docId: doc.id, action: 'save', answers: {} }), (err) => err.code === 'permission-denied');
});

test('utkast, innsending og varsel til lederen', async () => {
  const snap = await db.doc(`families/${A}/hrReviewPrep/${doc.id}`).get();
  const [t1, t2] = snap.data().topics;
  const draft = await call('ola', { familyId: A, docId: doc.id, action: 'save', answers: { [t1.id]: 'Kurs', ukjent: 'x' } });
  assert.equal(draft.prep.status, 'sent');
  assert.deepEqual(draft.prep.answers, { [t1.id]: 'Kurs' });
  const done = await call('ola', { familyId: A, docId: doc.id, action: 'submit', answers: { [t1.id]: 'Kurs', [t2.id]: 'Mål' } });
  assert.equal(done.prep.status, 'submitted');
  const stored = (await db.doc(`families/${A}/hrReviewPrep/${doc.id}`).get()).data();
  assert.equal(stored.status, 'submitted');
  assert.ok(stored.submittedAt);
  const notes = await db.collection('users/leder/notifications').get();
  assert.equal(notes.size, 1);
  assert.equal(notes.docs[0].data().eventType, 'hrReviewUpdate');
  assert.match(notes.docs[0].data().body, /2 av 6 tema/);
  // Signering før lederen har sendt skjemaet, nektes.
  await assert.rejects(call('ola', { familyId: A, docId: doc.id, action: 'sign' }), (err) => err.code === 'failed-precondition');
});

test('signering ferdigstiller skjemaet og sender PDF til begge', async () => {
  const ref = db.doc(`families/${A}/hrReviewPrep/${doc.id}`);
  const leaderSigned = signAsLeader(doc, { actor: leader });
  assert.ok(leaderSigned.ok);
  const prep = signingPrep((await ref.get()).data(), leaderSigned.doc, { actor: leader });
  await ref.set(JSON.parse(JSON.stringify(prep)));
  // Etter at skjemaet er sendt til signering, kan forberedelsen ikke endres.
  await assert.rejects(call('ola', { familyId: A, docId: doc.id, action: 'save', answers: {} }), (err) => err.code === 'failed-precondition');

  const res = await employeeAction(db, { familyId: A, docId: doc.id, uid: 'ola', action: 'sign', comment: 'Takk for en god samtale.', deps });
  assert.equal(res.prep.status, 'signed');
  assert.equal(res.prep.employeeSignature.name, 'Ola Ansatt');
  assert.deepEqual(res.prep.mail.to.sort(), ['lea@firma.no', 'ola@firma.no']);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].subject, 'Medarbeidersamtale 12.03.2026 – signert kopi');
  assert.equal(sent[0].attachments[0].contentType, 'application/pdf');
  assert.ok(Buffer.from(sent[0].attachments[0].content, 'base64').toString('latin1').startsWith('%PDF-'));
  assert.equal(sent.find((m) => m.to === 'ola@firma.no').replyTo, 'lea@firma.no');

  const form = (await db.doc(`families/${A}/formDocs/${doc.id}`).get()).data();
  assert.equal(form.status, 'ferdig');
  assert.equal(employeeSignField(form).value.uid, 'ola');
  assert.equal(form.fields.find((f) => f.label === COMMENT_LABEL).value, 'Takk for en god samtale.');
  const stored = (await ref.get()).data();
  assert.equal(stored.status, 'signed');
  assert.equal(stored.mail.to.length, 2);

  // Bare én gang.
  await assert.rejects(employeeAction(db, { familyId: A, docId: doc.id, uid: 'ola', action: 'sign', deps }), (err) => err.code === 'failed-precondition');

  // HR kan sende kopien på nytt.
  sent = [];
  const again = await resendCopy(db, { familyId: A, docId: doc.id, deps });
  assert.equal(again.prep.mail.to.length, 2);
  assert.equal(sent.length, 2);
  // Men ikke ansatte uten tilgang til HR → Oppfølging.
  await assert.rejects(call('per', { familyId: A, docId: doc.id, action: 'resend' }), (err) => err.code === 'permission-denied');
});

test('mottakere: jobb-e-post først, ingen dubletter', () => {
  assert.equal(employeeAddress({ company: { email: 'ugyldig' }, person: { email: 'P@privat.no' } }, 'konto@x.no'), 'p@privat.no');
  assert.equal(employeeAddress({}, 'konto@x.no'), 'konto@x.no');
  assert.deepEqual(copyRecipients({ employeeEmail: 'a@x.no', leaderEmail: 'A@x.no' }), ['a@x.no']);
  assert.deepEqual(copyRecipients({}), []);
});
