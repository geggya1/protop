/**
 * Møter, kjørt mot Firestore-emulatoren med de samme spørringene som appen gjør:
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/meetings.rules.test.mjs"
 *
 * Møter som bare er for deltakerne, ser bare memberUids og bedriftens administratorer.
 * Ferdigstilt referat er låst til det gjenåpnes med begrunnelse.
 * own = eier, del = deltaker, ans = ansatt som ikke er med, ext = bruker i et annet selskap.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, setDoc, updateDoc, where,
} from 'firebase/firestore';

const A = 'companyA';
let env;

function as(uid) {
  return env.authenticatedContext(uid).firestore();
}

const meeting = (over = {}) => ({
  title: 'Byggemøte', status: 'utkast', visibility: 'alle', memberUids: ['del'], createdBy: 'del',
  participants: [{ id: 'p1', uid: 'del', name: 'Deltaker', role: 'leder' }],
  chapters: [{ id: 'k1', title: 'Saker', items: [{ id: 'i1', title: 'Sak', notes: '' }] }],
  deliveries: [], log: [], archive: [], revision: 0, summary: '', updatedAt: '2026-10-28T08:00:00.000Z',
  ...over,
});

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'families', A), { name: 'Bygg AS', type: 'company', ownerUid: 'own', adminUids: ['own'], members: ['own', 'del', 'ans'] });
    await setDoc(doc(db, 'families', 'companyB'), { name: 'Annet AS', type: 'company', ownerUid: 'ext', members: ['ext'] });
    await setDoc(doc(db, 'families', A, 'meetings', 'open'), meeting());
    await setDoc(doc(db, 'families', A, 'meetings', 'closed'), meeting({ title: 'Styremøte', visibility: 'deltakere' }));
    await setDoc(doc(db, 'families', A, 'meetings', 'locked'), meeting({
      status: 'ferdigstilt', revision: 1, finalizedAt: '2026-10-28T10:00:00.000Z',
      archive: [{ revision: 1, name: 'Referat.pdf', storagePath: `families/${A}/meetings/locked/Referat.pdf` }],
      deliveries: [{ kind: 'innkalling', to: ['a@x.no'] }],
    }));
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

describe('lesing', () => {
  test('åpne møter leses av alle i bedriften, ikke av andre selskaper', async () => {
    await assertSucceeds(getDoc(doc(as('ans'), 'families', A, 'meetings', 'open')));
    await assertFails(getDoc(doc(as('ext'), 'families', A, 'meetings', 'open')));
  });

  test('møte for bare deltakerne: deltakeren og administrator leser, andre ansatte ikke', async () => {
    await assertSucceeds(getDoc(doc(as('del'), 'families', A, 'meetings', 'closed')));
    await assertSucceeds(getDoc(doc(as('own'), 'families', A, 'meetings', 'closed')));
    await assertFails(getDoc(doc(as('ans'), 'families', A, 'meetings', 'closed')));
  });

  test('appens spørringer: åpne møter og egne møter', async () => {
    const col = (uid) => collection(as(uid), 'families', A, 'meetings');
    const open = await assertSucceeds(getDocs(query(col('ans'), where('visibility', '==', 'alle'))));
    if (open.docs.some((d) => d.id === 'closed')) throw new Error('lukket møte i åpne');
    const mine = await assertSucceeds(getDocs(query(col('del'), where('memberUids', 'array-contains', 'del'))));
    if (!mine.docs.some((d) => d.id === 'closed')) throw new Error('mangler eget lukket møte');
    await assertSucceeds(getDocs(query(col('ans'), where('memberUids', 'array-contains', 'ans'))));
  });

  test('hele samlingen uten filter: bare administrator', async () => {
    await assertSucceeds(getDocs(collection(as('own'), 'families', A, 'meetings')));
    await assertFails(getDocs(collection(as('ans'), 'families', A, 'meetings')));
  });

  test('lagring i transaksjon kan lese et møte som ikke finnes ennå', async () => {
    const db = as('ans');
    await assertSucceeds(runTransaction(db, async (tx) => {
      const ref = doc(db, 'families', A, 'meetings', 'nytt');
      await tx.get(ref);
      tx.set(ref, meeting({ memberUids: ['ans'], createdBy: 'ans' }));
    }));
  });
});

describe('skriving', () => {
  test('ansatt utenfor et lukket møte kan ikke endre eller slette det', async () => {
    await assertFails(updateDoc(doc(as('ans'), 'families', A, 'meetings', 'closed'), { title: 'Endret' }));
    await assertFails(deleteDoc(doc(as('ans'), 'families', A, 'meetings', 'closed')));
  });

  test('ugyldig synlighet avvises', async () => {
    await assertFails(setDoc(doc(as('del'), 'families', A, 'meetings', 'x'), meeting({ visibility: 'hemmelig' })));
  });

  test('utkast uten utsending kan slettes, innkalt møte kan ikke', async () => {
    await assertSucceeds(deleteDoc(doc(as('del'), 'families', A, 'meetings', 'open')));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', A, 'meetings', 'invited'), meeting({ status: 'innkalt', deliveries: [{ kind: 'innkalling' }] }));
    });
    await assertFails(deleteDoc(doc(as('del'), 'families', A, 'meetings', 'invited')));
  });
});

describe('ferdigstilt referat', () => {
  const ref = () => doc(as('del'), 'families', A, 'meetings', 'locked');

  test('innholdet er låst', async () => {
    await assertFails(updateDoc(ref(), { summary: 'Endret i ettertid' }));
    await assertFails(updateDoc(ref(), { chapters: [] }));
    await assertFails(updateDoc(ref(), { revision: 5 }));
    await assertFails(deleteDoc(ref()));
  });

  test('sending registreres', async () => {
    await assertSucceeds(updateDoc(ref(), {
      status: 'sendt',
      deliveries: [{ kind: 'innkalling', to: ['a@x.no'] }, { kind: 'referat', to: ['a@x.no'], revision: 1 }],
      log: [{ text: 'Referat sendt' }],
      updatedAt: '2026-10-28T11:00:00.000Z',
    }));
  });

  test('arkivet kan bare vokse', async () => {
    await assertFails(updateDoc(ref(), { archive: [] }));
    await assertSucceeds(updateDoc(ref(), {
      archive: [
        { revision: 1, name: 'Referat.pdf', storagePath: `families/${A}/meetings/locked/Referat.pdf` },
        { revision: 1, name: 'Kopi.pdf', storagePath: `families/${A}/meetings/locked/Kopi.pdf` },
      ],
    }));
  });

  test('gjenåpning krever begrunnelse', async () => {
    await assertFails(updateDoc(ref(), { status: 'pagar', reopenReason: '' }));
    await assertFails(updateDoc(ref(), { status: 'utkast', reopenReason: 'Feil frist' }));
    await assertSucceeds(updateDoc(ref(), { status: 'pagar', reopenReason: 'Feil frist på 5.1', log: [{ text: 'Gjenåpnet' }] }));
    // Etter gjenåpning kan innholdet rettes.
    await assertSucceeds(updateDoc(ref(), { summary: 'Rettet sammendrag' }));
  });
});
