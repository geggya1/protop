/**
 * Krasjrapporter (crashReports): innloggede kan bare opprette en gyldig rapport om seg selv.
 * Ingen kan lese, endre eller slette fra appen (helpdesken leser via serveren).
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/crashReports.rules.test.mjs"
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc,
} from 'firebase/firestore';
import { buildCrashReport } from '../../src/helpdesk/crashReport.js';

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();

function report(uid, extra = {}) {
  return { ...buildCrashReport(new Error('Boom 42'), { kind: 'render', platform: 'web', buildId: 'b1', nowMs: Date.now() }), uid, ...extra };
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-protop',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
beforeEach(async () => { await env.clearFirestore(); });
after(async () => { await env?.cleanup(); });

describe('crashReports', () => {
  test('innlogget bruker kan opprette en gyldig rapport om seg selv', async () => {
    await assertSucceeds(addDoc(collection(as('u1'), 'crashReports'), report('u1')));
  });

  test('ikke innlogget, eller rapport på en annens navn, avvises', async () => {
    await assertFails(addDoc(collection(env.unauthenticatedContext().firestore(), 'crashReports'), report('u1')));
    await assertFails(addDoc(collection(as('u1'), 'crashReports'), report('u2')));
  });

  test('ukjente felt, feil type og for lange felt avvises', async () => {
    const db = as('u1');
    await assertFails(addDoc(collection(db, 'crashReports'), report('u1', { admin: true })));
    await assertFails(addDoc(collection(db, 'crashReports'), report('u1', { kind: 'hack' })));
    await assertFails(addDoc(collection(db, 'crashReports'), report('u1', { message: 'x'.repeat(1001) })));
    await assertFails(addDoc(collection(db, 'crashReports'), report('u1', { stack: 'y'.repeat(6001) })));
    await assertFails(addDoc(collection(db, 'crashReports'), report('u1', { count: 1000 })));
  });

  test('ingen kan lese, endre eller slette rapporter fra appen', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'crashReports', 'r1'), report('u1'));
    });
    const db = as('u1');
    await assertFails(getDoc(doc(db, 'crashReports', 'r1')));
    await assertFails(getDocs(collection(db, 'crashReports')));
    await assertFails(updateDoc(doc(db, 'crashReports', 'r1'), { message: 'endret' }));
    await assertFails(deleteDoc(doc(db, 'crashReports', 'r1')));
  });
});
