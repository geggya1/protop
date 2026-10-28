/**
 * Hjelpeassistenten (GRUNN-01): spørsmål og svar lagres uten uid, og eldre rader med uid
 * anonymiseres neste gang assistenten brukes. Rader eldre enn ett år slettes.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test functions/helpKnowledge.emulator.test.mjs"
 */
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

process.env.GCLOUD_PROJECT ||= 'demo-protop';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
// Lokal svarmotor: ingen kall til Gemini i testen.
delete process.env.PROTOP_GEMINI_KEY;
delete process.env.GEMINI_API_KEY;

const { getApps, initializeApp } = await import('firebase-admin/app');
if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const { getFirestore } = await import('firebase-admin/firestore');
const { handleAiSupportChat } = await import('./aiSupport.js');

const db = getFirestore();
const DAY = 24 * 60 * 60 * 1000;

async function rows() {
  const snap = await db.collection('helpKnowledgeCandidates').get();
  return snap.docs.map((row) => ({ id: row.id, ...row.data() }));
}

beforeEach(async () => {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.ok(res.ok);
});

test('nye spørsmål lagres uten uid og med telefon og e-post maskert', async () => {
  const res = await handleAiSupportChat(
    { message: 'Hvordan fører jeg timer? Ring meg på 912 34 567 eller kari@firma.no', audience: 'parent', device: 'desktop', lang: 'nb' },
    { uid: 'kari' },
  );
  assert.ok(res.reply);
  const [row, ...rest] = await rows();
  assert.equal(rest.length, 0);
  assert.equal('uid' in row, false, 'uid skal ikke lagres');
  assert.doesNotMatch(JSON.stringify(row), /kari/);
  assert.match(row.question, /\[telefon\] eller \[e-post\]/);
});

test('eldre rader med uid anonymiseres, og rader over lagringstiden slettes', async () => {
  const now = Date.now();
  await db.doc('helpKnowledgeCandidates/gammel-med-uid').set({
    uid: 'per', question: 'Hvor er faktura? per@firma.no', answer: 'Under Økonomi.', createdAtMs: now - 10 * DAY, reviewed: false,
  });
  await db.doc('helpKnowledgeCandidates/over-ett-aar').set({
    uid: 'ola', question: 'Gammelt spørsmål', answer: 'Svar', createdAtMs: now - 400 * DAY, reviewed: false,
  });
  await db.doc('helpKnowledgeCandidates/uten-uid').set({
    question: 'Hvor er ISO?', answer: 'Under ISO.', createdAtMs: now - 5 * DAY, reviewed: true,
  });
  await handleAiSupportChat({ message: 'Hei', audience: 'parent', device: 'phone', lang: 'nb' }, { uid: 'kari' });

  const all = await rows();
  const byId = Object.fromEntries(all.map((row) => [row.id, row]));
  assert.equal(byId['over-ett-aar'], undefined, 'rad eldre enn ett år er slettet');
  assert.equal('uid' in byId['gammel-med-uid'], false);
  assert.equal(byId['gammel-med-uid'].question, 'Hvor er faktura? [e-post]');
  assert.equal(byId['gammel-med-uid'].answer, 'Under Økonomi.');
  assert.equal(byId['uten-uid'].reviewed, true, 'rader uten uid røres ikke');
  assert.equal(all.length, 3);
  assert.ok(all.every((row) => !('uid' in row)));
});
