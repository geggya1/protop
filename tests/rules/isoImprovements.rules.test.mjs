/**
 * Regeltester for forbedringene i ISO / K-HMS (runde 2), kjørt mot Firestore-emulatoren:
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/isoImprovements.rules.test.mjs"
 *
 * - Meldetilgang (ISO-04): innleide og eksterne uten ISO-tilgang kan melde RUH i eget navn og lese
 *   sine egne meldinger, men ikke andres. Anonym melding uten bruker-id.
 * - Hurtigmelding (ISO-03): saken og telleren skrives i én transaksjon som først ser etter dobbel sending.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp, collection, doc, getDoc, getDocs, query, runTransaction, setDoc, updateDoc, where,
} from 'firebase/firestore';

const A = 'companyA';
const FUTURE = Timestamp.fromMillis(Date.now() + 6 * 3600 * 1000);

// innleid: medlem av selskapet uten ISO-tilgang (accessAcl iso 0). ansatt: Lese. beh: saksbehandler.
const USERS = { own: { iso: 3 }, innleid: { iso: 0 }, ansatt: { iso: 1 }, beh: { iso: 2 } };

let env;

function as(uid) {
  return env.authenticatedContext(uid).firestore();
}

const report = (uid, over = {}) => ({
  number: 'AVV-2026-007', type: 'nestenulykke', title: 'Løs planke', description: 'Løs planke på stillaset', state: 'registrert',
  restricted: false, reportedByUid: uid, reportedBy: uid, reportedAt: '2026-10-28T09:00:00Z', triage: null, assessment: null,
  actions: [], history: [{ action: 'Registrert', uid }], rev: 1, updatedByUid: uid, involvedUids: [uid], quick: true, ...over,
});

const anonymous = (over = {}) => report('', {
  anonymous: true, reportedBy: 'Anonym melder', updatedByUid: '', involvedUids: [], history: [{ action: 'Registrert', uid: '' }], ...over,
});

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'families', A), {
      name: 'Bygg AS', type: 'company', ownerUid: 'own', adminUids: ['own'], members: Object.keys(USERS),
    });
    for (const [uid, u] of Object.entries(USERS)) {
      await setDoc(doc(db, 'families', A, 'accessAcl', uid), { uid, iso: u.iso, grants: {}, expiresAt: FUTURE });
    }
    await setDoc(doc(db, 'families', A, 'isoSystem', 'main'), { name: 'KS', standards: ['ISO45001'], rev: 1, approverUids: [] });
    await setDoc(doc(db, 'families', A, 'isoRestricted', 'main'), { uids: ['own'], people: [], rev: 1 });
    await setDoc(doc(db, 'families', A, 'isoCounters', 'AVV-2026'), { last: 6, updatedAt: '2026-10-27T10:00:00Z' });
    await setDoc(doc(db, 'families', A, 'isoFindings', 'OTHER'), report('ansatt', { number: 'AVV-2026-006' }));
    await setDoc(doc(db, 'families', A, 'isoFindings', 'MINE'), report('innleid', { number: 'AVV-2026-005' }));
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-protop',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(seed);

describe('meldetilgang for innleide og eksterne (ISO-04)', () => {
  test('innleid uten ISO-tilgang melder RUH i eget navn, åpen og skjermet', async () => {
    const db = as('innleid');
    await assertSucceeds(setDoc(doc(db, 'families', A, 'isoFindings', 'N1'), report('innleid')));
    await assertSucceeds(setDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'N2'), report('innleid', { type: 'hms', restricted: true })));
  });

  test('innleid kan ikke melde i andres navn, eller skrive en behandlet sak', async () => {
    const db = as('innleid');
    await assertFails(setDoc(doc(db, 'families', A, 'isoFindings', 'N1'), report('ansatt')));
    await assertFails(setDoc(doc(db, 'families', A, 'isoFindings', 'N2'), report('innleid', { state: 'triage' })));
    await assertFails(setDoc(doc(db, 'families', A, 'isoFindings', 'N3'), report('innleid', { triage: { severity: 'lav' } })));
    await assertFails(setDoc(doc(db, 'families', A, 'isoFindings', 'N4'), report('innleid', { actions: [{ id: 'a', state: 'apen' }] })));
    await assertFails(setDoc(doc(db, 'families', A, 'isoFindings', 'N5'), report('innleid', { restricted: true })), 'skjermet sak hører i skjermet samling');
  });

  test('innleid leser egne meldinger, ikke andres, og kan ikke endre dem', async () => {
    const db = as('innleid');
    await assertSucceeds(getDoc(doc(db, 'families', A, 'isoFindings', 'MINE')));
    await assertFails(getDoc(doc(db, 'families', A, 'isoFindings', 'OTHER')));
    await assertSucceeds(getDocs(query(collection(db, 'families', A, 'isoFindings'), where('reportedByUid', '==', 'innleid'))));
    await assertSucceeds(getDocs(query(collection(db, 'families', A, 'isoFindingsRestricted'), where('reportedByUid', '==', 'innleid'))));
    await assertFails(getDocs(collection(db, 'families', A, 'isoFindings')), 'ikke hele listen');
    await assertFails(updateDoc(doc(db, 'families', A, 'isoFindings', 'MINE'), { title: 'Endret', rev: 2 }));
  });

  test('anonym melding: ingen bruker-id på saken eller som sist endret', async () => {
    await assertSucceeds(setDoc(doc(as('innleid'), 'families', A, 'isoFindings', 'ANON1'), anonymous()));
    await assertSucceeds(setDoc(doc(as('ansatt'), 'families', A, 'isoFindings', 'ANON2'), anonymous()), 'også ansatte med lesetilgang');
    await assertFails(setDoc(doc(as('innleid'), 'families', A, 'isoFindings', 'ANON3'), anonymous({ updatedByUid: 'innleid' })));
    await assertFails(setDoc(doc(as('innleid'), 'families', A, 'isoFindings', 'ANON4'), anonymous({ anonymous: false })));
  });

  test('den som ikke er medlem av selskapet, kan ikke melde eller lese', async () => {
    const db = as('fremmed');
    await assertFails(setDoc(doc(db, 'families', A, 'isoFindings', 'X1'), report('fremmed')));
    await assertFails(getDoc(doc(db, 'families', A, 'isoFindings', 'MINE')));
    await assertFails(getDoc(doc(db, 'families', A, 'isoCounters', 'AVV-2026')));
  });

  test('saksbehandler leser fortsatt alle saker', async () => {
    await assertSucceeds(getDocs(collection(as('beh'), 'families', A, 'isoFindings')));
  });
});

describe('hurtigmelding: sak og teller i én transaksjon (ISO-03)', () => {
  async function quick(uid, id, data, last) {
    const db = as(uid);
    const ref = doc(db, 'families', A, data.restricted ? 'isoFindingsRestricted' : 'isoFindings', id);
    const counter = doc(db, 'families', A, 'isoCounters', 'AVV-2026');
    return runTransaction(db, async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists()) return 'finnes';
      await tx.get(counter);
      tx.set(counter, { last, updatedAt: '2026-10-28T09:00:00Z' });
      tx.set(ref, { ...data, number: `AVV-2026-${String(last).padStart(3, '0')}` });
      return 'lagret';
    });
  }

  test('innleid sender hurtigmelding: ser etter dobbel sending, teller ett steg opp', async () => {
    await assertSucceeds(quick('innleid', 'Q1', report('innleid'), 7));
    await assertSucceeds(quick('innleid', 'Q2', report('innleid', { type: 'hms', restricted: true }), 8));
  });

  test('innleid kan ikke hoppe i telleren', async () => {
    await assertFails(quick('innleid', 'Q3', report('innleid'), 20));
  });

  test('ansatt med lesetilgang kan fortsatt tildele nummer over telleren (det klienten ser)', async () => {
    await assertSucceeds(quick('ansatt', 'Q4', report('ansatt'), 12));
  });
});
