/**
 * Regeltester for låser og oppfølging i ISO / K-HMS, kjørt mot Firestore-emulatoren:
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/isoLocks.rules.test.mjs"
 *
 * - Tiltakseier kan bare melde sitt eget tiltak utført, ikke skrive om tiltakslisten (ISO-15).
 * - Den som skal varsle myndighet, kan bekrefte varslingen (ISO-01).
 * - Vedtak i en godkjent ledelsens gjennomgang kan merkes utført av ansvarlig uten å åpne referatet (ISO-08).
 * - Saksnummer fra teller, og ny skjermet sak kan lagres i en transaksjon (ISO-23).
 * - Lesebekreftelse virker også etter 2000 kvitteringer (ISO-12).
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp, deleteDoc, doc, getDoc, runTransaction, setDoc, updateDoc,
} from 'firebase/firestore';

const A = 'companyA';
const FUTURE = Timestamp.fromMillis(Date.now() + 6 * 3600 * 1000);

const USERS = {
  own: { iso: 3 }, // eier
  les: { iso: 1 }, // ansatt, kun lese
  mel: { iso: 1 }, // melder og tiltakseier
  beh: { iso: 2 }, // saksbehandler uten godkjennerrolle
  kv: { iso: 2 }, // kvalitetsleder: begrenset redigering + godkjennerrolle
};

let env;

function as(uid) {
  return env.authenticatedContext(uid).firestore();
}

const action = (id, ownerUid, over = {}) => ({
  id, title: `Tiltak ${id}`, ownerUid, ownerName: ownerUid, dueAt: '2026-11-01', state: 'apen', evidence: [], ...over,
});

const finding = (over = {}) => ({
  number: 'AVV-2026-001', type: 'prosess', title: 'Feil', description: 'x', state: 'tiltak', restricted: false,
  reportedByUid: 'mel', reportedAt: '2026-10-22T10:00:00Z', history: [], rev: 3, involvedUids: ['mel', 'beh2'],
  actions: [action('a0', 'mel'), action('a1', 'beh2')], ...over,
});

const decision = (id, ownerUid, over = {}) => ({
  id, decision: `Vedtak ${id}`, kind: 'forbedring', ownerUid, ownerName: ownerUid, dueAt: '2026-11-01', done: false, taskKey: `iso_L1_${id}`, ...over,
});

const review = (over = {}) => ({
  register: 'ledelse', title: 'LGJ 2026', state: 'godkjent', locked: true, rev: 4, history: [],
  decisions: [decision('d0', 'les'), decision('d1', 'mel')], ...over,
});

/**
 * Slik appen melder et tiltak utført: hele saken skrives, bare tiltaket og historikken er endret.
 * hint = indeksen appen oppgir (doneActionIndex). Eldre versjoner av appen oppgir den ikke.
 */
function completed(f, index, uid, over = {}, hint = null) {
  const actions = f.actions.map((a, i) => (i === index ? {
    ...a, state: 'til_verifisering', completedAt: '2026-10-27T10:00:00Z', completedBy: uid, completedByUid: uid, completionNote: 'Gjort', evidence: [{ label: 'Foto' }], ...over,
  } : a));
  return {
    ...f, actions, rev: f.rev + 1, updatedAt: '2026-10-27T10:00:00Z', updatedBy: uid, updatedByUid: uid, history: [{ action: 'Tiltak meldt utført' }], savedAt: '2026-10-27T10:00:00Z',
    ...(hint == null ? {} : { doneActionIndex: hint }),
  };
}

function doneDecision(r, index, uid, over = {}, hint = index) {
  const decisions = r.decisions.map((d, i) => (i === index ? { ...d, done: true, doneAt: '2026-10-27T10:00:00Z', doneBy: uid, doneByUid: uid, ...over } : d));
  return { ...r, decisions, doneDecisionIndex: hint, rev: r.rev + 1, updatedAt: '2026-10-27T10:00:00Z', updatedBy: uid, updatedByUid: uid, history: [{ action: 'Beslutning gjennomført' }], savedAt: '2026-10-27T10:00:00Z' };
}

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
    await setDoc(doc(db, 'families', A, 'isoSystem', 'main'), { name: 'KS', standards: ['ISO9001'], rev: 1, approverUids: ['kv'] });
    await setDoc(doc(db, 'families', A, 'isoRestricted', 'main'), { uids: ['own'], people: [], rev: 1 });
    await setDoc(doc(db, 'families', A, 'isoFindings', 'F1'), finding());
    await setDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R1'), finding({ number: 'AVV-2026-002', type: 'hms', restricted: true }));
    await setDoc(doc(db, 'families', A, 'isoFindings', 'N1'), finding({
      number: 'AVV-2026-003', type: 'hms', state: 'triage', actions: [], authorityNotificationRequired: true,
      notificationAssignee: 'Les', notificationAssigneeUid: 'les', notificationDone: false, involvedUids: ['mel', 'les'],
    }));
    await setDoc(doc(db, 'families', A, 'isoRecords', 'L1'), review());
    await setDoc(doc(db, 'families', A, 'isoRecords', 'REV1'), { register: 'revisjon', title: 'Revisjon', state: 'godkjent', locked: true, rev: 1, decisions: [decision('d0', 'les')] });
  });
}

async function current(...path) {
  let out;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(doc(ctx.firestore(), ...path));
    out = snap.exists() ? snap.data() : undefined;
  });
  return out;
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-protop',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(seed);

describe('tiltak: tiltakseier kan bare melde eget tiltak utført (ISO-15)', () => {
  test('eier av tiltaket melder det utført (også fra eldre app uten indeks)', async () => {
    const f = await current('families', A, 'isoFindings', 'F1');
    await assertSucceeds(setDoc(doc(as('mel'), 'families', A, 'isoFindings', 'F1'), completed(f, 0, 'mel', {}, 0)));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', A, 'isoFindings', 'F1'), finding({ actions: [action('a0', 'beh2'), action('a1', 'mel')] }));
    });
    const old = await current('families', A, 'isoFindings', 'F1');
    await assertSucceeds(setDoc(doc(as('mel'), 'families', A, 'isoFindings', 'F1'), completed(old, 1, 'mel')));
  });

  test('også i en skjermet sak', async () => {
    const f = await current('families', A, 'isoFindingsRestricted', 'R1');
    await assertSucceeds(setDoc(doc(as('mel'), 'families', A, 'isoFindingsRestricted', 'R1'), completed(f, 0, 'mel')));
  });

  test('kan ikke verifisere eget tiltak eller endre tittel og frist', async () => {
    const f = await current('families', A, 'isoFindings', 'F1');
    const ref = doc(as('mel'), 'families', A, 'isoFindings', 'F1');
    await assertFails(setDoc(ref, completed(f, 0, 'mel', { state: 'verifisert', verifiedBy: 'mel' })));
    await assertFails(setDoc(ref, completed(f, 0, 'mel', { dueAt: '2027-12-31' })));
    await assertFails(setDoc(ref, completed(f, 0, 'mel', { title: 'Noe annet' })));
  });

  test('kan ikke endre andres tiltak, fjerne tiltak eller legge til nye', async () => {
    const f = await current('families', A, 'isoFindings', 'F1');
    const ref = doc(as('mel'), 'families', A, 'isoFindings', 'F1');
    await assertFails(setDoc(ref, completed(f, 1, 'mel')));
    await assertFails(setDoc(ref, completed(f, 1, 'mel', {}, 1)));
    await assertFails(setDoc(ref, completed(f, 1, 'mel', {}, 0)));
    await assertFails(setDoc(ref, { ...f, actions: [f.actions[0]], rev: 4 }));
    await assertFails(setDoc(ref, { ...f, actions: [...f.actions, action('a2', 'mel')], rev: 4 }));
    await assertFails(setDoc(ref, { ...f, actions: [f.actions[0], { ...f.actions[1], state: 'kansellert' }], rev: 4 }));
  });

  test('saksbehandler kan fortsatt kontrollere og endre tiltak', async () => {
    const f = await current('families', A, 'isoFindings', 'F1');
    const done = completed(f, 0, 'mel');
    await assertSucceeds(setDoc(doc(as('beh'), 'families', A, 'isoFindings', 'F1'), {
      ...done, actions: done.actions.map((a, i) => (i === 0 ? { ...a, state: 'verifisert', verifiedBy: 'beh' } : a)),
    }));
  });

  test('det tjuende tiltaket kan også meldes utført', async () => {
    const many = Array.from({ length: 20 }, (_, i) => action(`t${i}`, i === 19 ? 'mel' : 'beh2'));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', A, 'isoFindings', 'F20'), finding({ actions: many }));
    });
    const f = await current('families', A, 'isoFindings', 'F20');
    await assertSucceeds(setDoc(doc(as('mel'), 'families', A, 'isoFindings', 'F20'), completed(f, 19, 'mel', {}, 19)));
  });

  test('virkelig store saker: 200 historikkrader og 20 utfylte tiltak', async () => {
    const history = Array.from({ length: 200 }, (_, i) => ({ at: '2026-10-01T10:00:00Z', action: `Hendelse ${i}`, by: 'Kari Nordmann', uid: 'beh2', note: 'Lang merknad om hva som ble gjort og hvorfor. '.repeat(3) }));
    const full = (i, ownerUid) => action(`t${i}`, ownerUid, {
      description: 'Beskrivelse av tiltaket med nok tekst til å ligne en ekte sak. '.repeat(4), type: 'korrigerende', requiredEvidence: 'Foto og sjekkliste',
      createdAt: '2026-10-01T10:00:00Z', taskKey: `iso_F_${i}`, taskId: `iso_F_${i}`, returnNote: '', evidence: [{ label: 'Bilde', url: 'https://example.com/a.jpg', ref: '' }],
    });
    const many = Array.from({ length: 20 }, (_, i) => full(i, i === 19 ? 'mel' : 'beh2'));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', A, 'isoFindingsRestricted', 'BIG'), finding({ type: 'hms', restricted: true, actions: many, history, personalDetails: 'x'.repeat(2000) }));
    });
    const f = await current('families', A, 'isoFindingsRestricted', 'BIG');
    await assertSucceeds(setDoc(doc(as('mel'), 'families', A, 'isoFindingsRestricted', 'BIG'), { ...completed(f, 19, 'mel', {}, 19), history: [...history.slice(1), { action: 'Tiltak meldt utført' }] }));
    // Eldre app uten indeks: de fem første tiltakene finnes uten hjelp.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', A, 'isoFindingsRestricted', 'BIG'), finding({ type: 'hms', restricted: true, actions: many.map((a, i) => ({ ...a, ownerUid: i === 4 ? 'mel' : 'beh2' })), history }));
    });
    const old = await current('families', A, 'isoFindingsRestricted', 'BIG');
    await assertSucceeds(setDoc(doc(as('mel'), 'families', A, 'isoFindingsRestricted', 'BIG'), completed(old, 4, 'mel')));
  });

  test('uendret tiltaksliste: involverte kan fortsatt lagre historikk', async () => {
    const f = await current('families', A, 'isoFindings', 'F1');
    await assertSucceeds(setDoc(doc(as('mel'), 'families', A, 'isoFindings', 'F1'), { ...f, rev: 4, history: [{ action: 'x' }] }));
  });
});

describe('meldeplikt: den som varsler myndighet (ISO-01)', () => {
  test('kan bekrefte varslingen', async () => {
    await assertSucceeds(updateDoc(doc(as('les'), 'families', A, 'isoFindings', 'N1'), {
      notificationDone: true, notificationNote: 'Arbeidstilsynet varslet 27.10 kl 10', notificationAt: '2026-10-27T10:00:00Z', rev: 4, history: [{ action: 'Varsling til myndighet bekreftet' }],
    }));
  });

  test('kan ikke endre noe annet, og andre kan ikke bekrefte', async () => {
    await assertFails(updateDoc(doc(as('les'), 'families', A, 'isoFindings', 'N1'), { notificationDone: true, state: 'lukket', rev: 4 }));
    await assertFails(updateDoc(doc(as('les'), 'families', A, 'isoFindings', 'N1'), { notificationDone: false, notificationNote: 'x', rev: 4 }));
    await assertFails(updateDoc(doc(as('mel'), 'families', A, 'isoFindings', 'N1'), { notificationDone: true, notificationNote: 'x', rev: 4 }));
  });
});

describe('vedtak i godkjent ledelsens gjennomgang (ISO-08)', () => {
  test('ansvarlig merker sitt vedtak utført uten å åpne referatet', async () => {
    const r = await current('families', A, 'isoRecords', 'L1');
    await assertSucceeds(setDoc(doc(as('les'), 'families', A, 'isoRecords', 'L1'), doneDecision(r, 0, 'les')));
    const after = await current('families', A, 'isoRecords', 'L1');
    if (after.locked !== true) throw new Error('referatet skal fortsatt være låst');
  });

  test('ikke andres vedtak, ikke andre felt, ikke tilbake til åpent', async () => {
    const r = await current('families', A, 'isoRecords', 'L1');
    const ref = doc(as('les'), 'families', A, 'isoRecords', 'L1');
    await assertFails(setDoc(ref, doneDecision(r, 1, 'les')));
    await assertFails(setDoc(ref, doneDecision(r, 1, 'les', {}, 0)));
    await assertFails(setDoc(ref, doneDecision(r, 0, 'les', {}, 1)));
    await assertFails(setDoc(ref, doneDecision(r, 0, 'les', { decision: 'Endret vedtak' })));
    await assertFails(setDoc(ref, { ...doneDecision(r, 0, 'les'), title: 'Endret' }));
    await assertFails(setDoc(ref, { ...doneDecision(r, 0, 'les'), locked: false }));
    await assertFails(setDoc(ref, { ...r, decisions: [r.decisions[0]], rev: 5 }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', A, 'isoRecords', 'L1'), doneDecision(r, 0, 'les'));
    });
    const done = await current('families', A, 'isoRecords', 'L1');
    await assertFails(setDoc(ref, { ...done, decisions: done.decisions.map((d, i) => (i === 0 ? { ...d, done: false } : d)), rev: 6 }));
  });

  test('saksbehandler uten godkjennerrolle kan merke vedtak utført, men ikke endre referatet', async () => {
    const r = await current('families', A, 'isoRecords', 'L1');
    const ref = doc(as('beh'), 'families', A, 'isoRecords', 'L1');
    await assertFails(setDoc(ref, { ...r, title: 'Endret', rev: 5 }));
    await assertSucceeds(setDoc(ref, doneDecision(r, 1, 'beh')));
  });

  test('virkelig stort referat: grunnlag, 20 vedtak og 200 historikkrader', async () => {
    const history = Array.from({ length: 200 }, (_, i) => ({ at: '2026-10-01T10:00:00Z', action: `Hendelse ${i}`, by: 'Kari Nordmann', uid: 'beh', note: 'Merknad. '.repeat(10) }));
    const snapshot = {
      kpis: Array.from({ length: 12 }, (_, i) => ({ key: `k${i}`, label: `KPI ${i}`, value: i })),
      findings: { open: 4, closed: 30, closedWithinDeadline: { pct: 80, n: 30 } },
      audits: Array.from({ length: 10 }, (_, i) => ({ number: `REV-${i}`, nonconformities: i })),
      objectives: Array.from({ length: 10 }, (_, i) => ({ title: `Mål ${i}`, last: i, target: 10, unit: 'stk' })),
      takenAt: '2026-10-01', takenBy: 'Kari',
    };
    const decisions = Array.from({ length: 20 }, (_, i) => decision(`d${i}`, i === 18 ? 'les' : 'mel', { decision: 'Vedtak med en del tekst. '.repeat(5) }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', A, 'isoRecords', 'BIG'), review({ decisions, history, snapshot }));
    });
    const r = await current('families', A, 'isoRecords', 'BIG');
    await assertSucceeds(setDoc(doc(as('les'), 'families', A, 'isoRecords', 'BIG'), { ...doneDecision(r, 18, 'les'), history: [...history.slice(1), { action: 'Beslutning gjennomført' }] }));
  });

  test('gjelder bare ledelsens gjennomgang', async () => {
    const r = await current('families', A, 'isoRecords', 'REV1');
    await assertFails(setDoc(doc(as('les'), 'families', A, 'isoRecords', 'REV1'), doneDecision(r, 0, 'les')));
  });

  test('godkjenner kan fortsatt endre låst post', async () => {
    await assertSucceeds(updateDoc(doc(as('kv'), 'families', A, 'isoRecords', 'L1'), { state: 'godkjent', rev: 5 }));
  });
});

describe('saksnummer fra teller (ISO-23)', () => {
  test('melder får nummer fra telleren i samme transaksjon som saken lagres', async () => {
    const db = as('mel');
    await assertSucceeds(runTransaction(db, async (tx) => {
      const counter = await tx.get(doc(db, 'families', A, 'isoCounters', 'AVV-2026'));
      await tx.get(doc(db, 'families', A, 'isoFindings', 'NEW1'));
      const last = counter.exists() ? counter.data().last : 0;
      tx.set(doc(db, 'families', A, 'isoCounters', 'AVV-2026'), { last: Math.max(last + 1, 4), updatedAt: '2026-10-27' });
      tx.set(doc(db, 'families', A, 'isoFindings', 'NEW1'), finding({ number: 'AVV-2026-004', state: 'registrert', actions: [] }));
    }));
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'isoCounters', 'AVV-2026'), { last: 5 }));
  });

  test('ny skjermet sak kan lagres i transaksjon av melder (leser et dokument som ikke finnes)', async () => {
    const db = as('mel');
    await assertSucceeds(runTransaction(db, async (tx) => {
      await tx.get(doc(db, 'families', A, 'isoCounters', 'AVV-2026'));
      await tx.get(doc(db, 'families', A, 'isoFindingsRestricted', 'NEW2'));
      tx.set(doc(db, 'families', A, 'isoCounters', 'AVV-2026'), { last: 4, updatedAt: '2026-10-27' });
      tx.set(doc(db, 'families', A, 'isoFindingsRestricted', 'NEW2'), finding({ number: 'AVV-2026-004', type: 'hms', restricted: true, state: 'registrert', actions: [] }));
    }));
    // Andres skjermede saker er fortsatt stengt.
    await assertFails(getDoc(doc(as('les'), 'families', A, 'isoFindingsRestricted', 'R1')));
  });

  test('telleren går bare oppover og kan ikke slettes', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', A, 'isoCounters', 'AVV-2026'), { last: 7, updatedAt: '2026-10-27' });
    });
    const ref = doc(as('mel'), 'families', A, 'isoCounters', 'AVV-2026');
    await assertSucceeds(getDoc(ref));
    await assertFails(updateDoc(ref, { last: 7 }));
    await assertFails(updateDoc(ref, { last: 3 }));
    await assertFails(updateDoc(ref, { last: 8, extra: 'x' }));
    await assertFails(updateDoc(ref, { last: '9' }));
    await assertFails(deleteDoc(ref));
    await assertFails(setDoc(doc(env.authenticatedContext('ext').firestore(), 'families', A, 'isoCounters', 'AVV-2027'), { last: 1 }));
  });
});

describe('lesebekreftelse (ISO-12)', () => {
  test('ny kvittering etter 2000, uten å endre dokumentets revisjon', async () => {
    const acks = Array.from({ length: 2000 }, (_, i) => ({ revision: 1, uid: `x${i}`, name: `X${i}`, at: '2026-10-01' }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', A, 'isoDocuments', 'D1'), {
        code: 'DOK-1', title: 'Håndbok', publishedRevision: 1, archived: false, rev: 9, readAcks: acks,
        revisions: [{ revision: 1, state: 'publisert' }],
      });
    });
    const db = as('les');
    await assertSucceeds(runTransaction(db, async (tx) => {
      const ref = doc(db, 'families', A, 'isoDocuments', 'D1');
      const snap = await tx.get(ref);
      tx.update(ref, { readAcks: [...snap.data().readAcks, { revision: 1, uid: 'les', name: 'Les', at: '2026-10-27' }] });
    }));
    const after = await current('families', A, 'isoDocuments', 'D1');
    if (after.readAcks.length !== 2001 || after.rev !== 9) throw new Error('kvitteringen skal legges til uten ny revisjon');
  });
});
