/**
 * Timer, godkjenning og timelistelåser (DRIFT-06, DRIFT-07), kjørt mot Firestore-emulatoren:
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/timesheet.rules.test.mjs"
 *
 * Godkjenningen som teller (fakturagrunnlaget, Til fakturering), er statusen på hver timeføring
 * (status 'godkjent'). Den settes og fjernes bare av den som godkjenner timer: eier, administrator,
 * Begrenset redigering på Andres timer (leder) eller den som fakturerer (Til fakturering/Faktura).
 * Låseraden i projects/state viser godkjenningen i timelisten, men gir ingen rett til å endre timer.
 *
 * Bedrift A: own = eier, adm = administrator, ldr = leder (Andres timer: Admin), avd = avdelingsleder
 * (Andres timer: Begrenset redigering), bill = Til fakturering, bob og eve = ansatte, noacl = uten speil,
 * hr = Lese på Andres timer, rep = Admin på Timerapport, hra = HR med Admin på Ansatte.
 *
 * Hvem som eier en føring, avgjøres av ansattposten i employeeId: posten er koblet til kontoen
 * (personUid). En vanlig ansatt fører, endrer og sletter bare egne timer (DRIFT-07).
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp, deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';

// RULES_FILE: en annen regelfil (f.eks. reglene før rettingen, for å se hva som var mulig).
const RULES = process.env.RULES_FILE || new URL('../../firestore.rules', import.meta.url);
const A = 'companyA';
const FUTURE = Timestamp.fromMillis(Date.now() + 6 * 3600 * 1000);
let env;

const as = (uid) => env.authenticatedContext(uid).firestore();
const te = (uid, id) => doc(as(uid), 'families', A, 'timeEntries', id);
const ansatt = { employees: 'see', hours: 'read', hoursApproval: 'read', absence: 'read', iso: 'see' };
const ACL = {
  adm: { levelId: 'administrator', grants: { ...ansatt, hoursOthers: 'write', economyBilling: 'write', economyInvoices: 'write' } },
  ldr: { levelId: 'leder', grants: { ...ansatt, hours: 'write', hoursOthers: 'write' } },
  avd: { levelId: 'avdelingsleder', grants: { ...ansatt, hoursOthers: 'read' } },
  bill: { levelId: 'ansatt', grants: { ...ansatt, economyBilling: 'read' } },
  bob: { levelId: 'ansatt', grants: ansatt },
  eve: { levelId: 'ansatt', grants: ansatt },
  hr: { levelId: 'ansatt', grants: { ...ansatt, hoursOthers: 'see' } },
  rep: { levelId: 'ansatt', grants: { ...ansatt, hoursReport: 'write' } },
  hra: { levelId: 'hr_ansvarlig', grants: { ...ansatt, employees: 'write', hoursOthers: 'see' } },
};
// Ansatte uten konto (leder fører for dem), til lagring av mange personers timer i én skriving.
const CREW = Array.from({ length: 24 }, (_, i) => `emp_x${String(i + 1).padStart(2, '0')}`);

const entry = (employeeId, date, over = {}) => ({
  projectId: 'p1', employeeId, date, hours: 7.5, billableHours: 7.5, description: 'Mur', status: 'registrert',
  invoiceId: null, ...over,
});

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const members = ['own', 'adm', 'ldr', 'avd', 'bill', 'bob', 'eve', 'hr', 'rep', 'hra', 'noacl'];
    await setDoc(doc(db, 'families', A), {
      name: 'Bygg AS', type: 'company', ownerUid: 'own', adminUids: ['own', 'adm'], members, activeUsers: members,
      company: { navn: 'Bygg AS' },
    });
    for (const uid of members) {
      await setDoc(doc(db, 'families', A, 'parents', uid), { uid, active: true });
      await setDoc(doc(db, 'families', A, 'employees', `emp_${uid}`), {
        personUid: uid, person: { firstName: uid }, company: { accessLevels: ['ansatt'], status: 'active' },
        invite: { status: 'accepted', acceptedUid: uid },
      });
    }
    for (const id of CREW) {
      await setDoc(doc(db, 'families', A, 'employees', id), {
        personUid: '', person: { firstName: id }, company: { accessLevels: ['ansatt'], status: 'active' },
      });
    }
    for (const [uid, row] of Object.entries(ACL)) {
      await setDoc(doc(db, 'families', A, 'accessAcl', uid), { uid, iso: 1, employeeId: `emp_${uid}`, ...row, expiresAt: FUTURE });
    }
    // Bobs timer: åpen, låst til kontroll, godkjent og fakturert. Eves: åpen og godkjent.
    await setDoc(doc(db, 'families', A, 'timeEntries', 'bob_open'), entry('emp_bob', '2026-10-27'));
    await setDoc(doc(db, 'families', A, 'timeEntries', 'bob_locked'), entry('emp_bob', '2026-10-24', { status: 'låst' }));
    await setDoc(doc(db, 'families', A, 'timeEntries', 'bob_ok'), entry('emp_bob', '2026-10-20', { status: 'godkjent' }));
    await setDoc(doc(db, 'families', A, 'timeEntries', 'bob_inv'), entry('emp_bob', '2026-10-13', { status: 'godkjent', invoiceId: 'F1' }));
    await setDoc(doc(db, 'families', A, 'timeEntries', 'eve_open'), entry('emp_eve', '2026-10-27'));
    await setDoc(doc(db, 'families', A, 'timeEntries', 'eve_ok'), entry('emp_eve', '2026-10-20', { status: 'godkjent' }));
    // Bobs timeliste er låst og godkjent til 20.10. Låsene ligger i prosjektdokumentet.
    await setDoc(doc(db, 'families', A, 'projects', 'state'), {
      timesheetLocks: [{
        id: 'las_bob', employeeId: 'emp_bob', throughDate: '2026-10-20', lockedAt: '2026-10-21T08:00:00.000Z',
        lockedByUid: 'bob', approvedAt: '2026-10-22T08:00:00.000Z', approvedByUid: 'ldr', readyForBilling: true,
        approvedThrough: '2026-10-20', periodFrom: '',
      }],
    });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-protop',
    firestore: { rules: readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(seed);

describe('DRIFT-06/07: godkjente og fakturerte timer', () => {
  test('den ansatte endrer ikke timer, dato, prosjekt eller status på egne godkjente timer, og sletter dem ikke', async () => {
    await assertFails(updateDoc(te('bob', 'bob_ok'), { hours: 10, billableHours: 10 }));
    await assertFails(updateDoc(te('bob', 'bob_ok'), { date: '2026-10-21' }));
    await assertFails(updateDoc(te('bob', 'bob_ok'), { projectId: 'p2' }));
    await assertFails(updateDoc(te('bob', 'bob_ok'), { status: 'registrert' }));
    await assertFails(updateDoc(te('bob', 'bob_ok'), { status: 'registrert', hours: 10 }));
    await assertFails(deleteDoc(te('bob', 'bob_ok')));
    // Teksten kan fortsatt rettes (som på låste og fakturerte timer).
    await assertSucceeds(updateDoc(te('bob', 'bob_ok'), { description: 'Mur, 2. etasje' }));
  });

  test('en kollega endrer eller sletter ikke andres godkjente timer', async () => {
    await assertFails(updateDoc(te('eve', 'bob_ok'), { hours: 1, billableHours: 1 }));
    await assertFails(updateDoc(te('eve', 'bob_ok'), { status: 'låst' }));
    await assertFails(deleteDoc(te('eve', 'bob_ok')));
    await assertFails(updateDoc(te('hr', 'eve_ok'), { hours: 1 }));
  });

  test('fakturerte timer: ingen ansatt endrer eller sletter dem (som før)', async () => {
    for (const uid of ['bob', 'eve']) {
      await assertFails(updateDoc(te(uid, 'bob_inv'), { hours: 1 }), uid);
      await assertFails(updateDoc(te(uid, 'bob_inv'), { invoiceId: null, status: 'registrert' }), uid);
      await assertFails(deleteDoc(te(uid, 'bob_inv')), uid);
    }
  });

  test('ingen ansatt godkjenner egne eller andres timer, heller ikke ved å lage en ny føring som godkjent', async () => {
    await assertFails(updateDoc(te('bob', 'bob_locked'), { status: 'godkjent' }));
    await assertFails(updateDoc(te('bob', 'bob_open'), { status: 'godkjent' }));
    await assertFails(updateDoc(te('eve', 'bob_locked'), { status: 'godkjent' }));
    await assertFails(setDoc(te('bob', 'bob_ny'), entry('emp_bob', '2026-10-28', { status: 'godkjent' })));
    // HR med bare Lese på Andres timer, og leder uten ferskt speil, godkjenner heller ikke.
    await assertFails(updateDoc(te('hr', 'bob_locked'), { status: 'godkjent' }));
    await assertFails(updateDoc(te('noacl', 'bob_locked'), { status: 'godkjent' }));
  });

  test('leder (Andres timer), Til fakturering, eier og administrator godkjenner og åpner igjen', async () => {
    await assertSucceeds(updateDoc(te('avd', 'bob_locked'), { status: 'godkjent' }));
    await assertSucceeds(updateDoc(te('ldr', 'bob_ok'), { status: 'registrert' }));
    await assertSucceeds(updateDoc(te('bill', 'eve_open'), { status: 'godkjent' }));
    await assertSucceeds(updateDoc(te('own', 'eve_ok'), { hours: 7 }));
    await assertSucceeds(deleteDoc(te('adm', 'eve_ok')));
    await assertSucceeds(setDoc(te('ldr', 'ldr_ny'), entry('emp_bob', '2026-10-28', { status: 'godkjent' })));
  });
});

describe('DRIFT-06/07: åpne timer og låsing som før', () => {
  test('den ansatte fører, endrer, låser, låser opp og sletter egne åpne timer', async () => {
    await assertSucceeds(setDoc(te('bob', 'bob_ny'), entry('emp_bob', '2026-10-28')));
    await assertSucceeds(updateDoc(te('bob', 'bob_open'), { hours: 8, billableHours: 8 }));
    await assertSucceeds(updateDoc(te('bob', 'bob_open'), { status: 'låst' }));
    await assertSucceeds(updateDoc(te('bob', 'bob_locked'), { status: 'registrert' }));
    await assertSucceeds(deleteDoc(te('bob', 'bob_ny')));
    // Eldre app: hele raden med merge, uten endring av en godkjent føring.
    await assertSucceeds(setDoc(te('bob', 'bob_ok'), entry('emp_bob', '2026-10-20', { status: 'godkjent' }), { merge: true }));
  });

  test('låseraden i prosjektdokumentet kan endres av den ansatte, men det åpner ikke godkjente timer', async () => {
    // Låsene ligger fortsatt i projects/state (flyttes ikke): en ansatt kan fjerne godkjenningen på
    // låseraden via REST. Det gir ingen rett til timene: de er godkjent på hver føring.
    await assertSucceeds(updateDoc(doc(as('bob'), 'families', A, 'projects', 'state'), { timesheetLocks: [] }));
    await assertFails(updateDoc(te('bob', 'bob_ok'), { hours: 10, billableHours: 10 }));
    await assertFails(updateDoc(te('bob', 'bob_ok'), { status: 'registrert' }));
    await assertFails(deleteDoc(te('bob', 'bob_ok')));
    const snap = await assertSucceeds(getDoc(te('bob', 'bob_ok')));
    if (snap.data().status !== 'godkjent') throw new Error('godkjenningen ble borte');
  });
});

describe('DRIFT-07: egne og andres åpne timer', () => {
  test('en kollega endrer, låser opp, tar over eller sletter ikke andres åpne eller låste timer', async () => {
    await assertFails(updateDoc(te('eve', 'bob_open'), { hours: 1, billableHours: 1 }));
    await assertFails(updateDoc(te('eve', 'bob_open'), { description: 'Feil' }));
    await assertFails(updateDoc(te('eve', 'bob_open'), { status: 'låst' }));
    await assertFails(updateDoc(te('eve', 'bob_locked'), { status: 'registrert' }));
    await assertFails(updateDoc(te('eve', 'bob_open'), { employeeId: 'emp_eve' }));
    await assertFails(deleteDoc(te('eve', 'bob_open')));
    // Eldre app: hele raden med merge.
    await assertFails(setDoc(te('eve', 'bob_open'), entry('emp_bob', '2026-10-27', { hours: 2 }), { merge: true }));
    // Lese på Andres timer og en uten speil gir heller ingen rett.
    await assertFails(updateDoc(te('hr', 'bob_open'), { hours: 2 }));
    await assertFails(deleteDoc(te('noacl', 'bob_open')));
  });

  test('en kollega fører ikke timer på en annen, og flytter ikke egne timer over til en annen', async () => {
    await assertFails(setDoc(te('eve', 'eve_paa_bob'), entry('emp_bob', '2026-10-28')));
    await assertFails(setDoc(te('eve', 'eve_paa_x'), entry('emp_x01', '2026-10-28')));
    await assertFails(setDoc(te('eve', 'eve_uten_post'), entry('emp_finnes_ikke', '2026-10-28')));
    await assertFails(updateDoc(te('eve', 'eve_open'), { employeeId: 'emp_bob' }));
  });

  test('den ansatte fører og endrer egne timer også uten speil', async () => {
    await assertSucceeds(setDoc(te('noacl', 'noacl_ny'), entry('emp_noacl', '2026-10-28')));
    await assertSucceeds(updateDoc(te('noacl', 'noacl_ny'), { hours: 6, billableHours: 6 }));
    await assertSucceeds(deleteDoc(te('noacl', 'noacl_ny')));
    await assertSucceeds(updateDoc(te('eve', 'eve_open'), { description: 'Forskaling' }));
    // En eldre ansettelse (avsluttet post, også koblet til Bob): speilet peker på den nye posten,
    // men timene på den gamle er fortsatt hans.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'families', A, 'employees', 'emp_bob_2024'), {
        personUid: 'bob', person: { firstName: 'bob' }, company: { accessLevels: ['ansatt'], status: 'inactive' },
      });
      await setDoc(doc(db, 'families', A, 'timeEntries', 'bob_2024'), entry('emp_bob_2024', '2024-06-03'));
    });
    await assertSucceeds(updateDoc(te('bob', 'bob_2024'), { description: 'Gammel føring rettet' }));
    await assertFails(updateDoc(te('eve', 'bob_2024'), { description: 'Feil' }));
  });

  test('leder, eier, administrator, Admin på Timerapport og Admin på Ansatte fører og endrer andres timer', async () => {
    await assertSucceeds(updateDoc(te('avd', 'bob_open'), { hours: 6, billableHours: 6 }));
    await assertSucceeds(updateDoc(te('ldr', 'bob_locked'), { status: 'registrert' }));
    await assertSucceeds(setDoc(te('ldr', 'ldr_for_x'), entry('emp_x01', '2026-10-28')));
    await assertSucceeds(updateDoc(te('own', 'eve_open'), { description: 'Rettet av eier' }));
    await assertSucceeds(updateDoc(te('rep', 'eve_open'), { hours: 7, billableHours: 7 }));
    await assertSucceeds(updateDoc(te('hra', 'eve_open'), { hours: 6.5, billableHours: 6.5 }));
    await assertSucceeds(deleteDoc(te('ldr', 'ldr_for_x')));
    await assertSucceeds(deleteDoc(te('adm', 'bob_open')));
    // Leder uten ferskt speil fører ikke for andre (som godkjenning).
    await assertFails(updateDoc(te('noacl', 'eve_open'), { hours: 1 }));
  });

  test('eldre app (86332db): leder lagrer timer for mange ansatte i én skriving, den ansatte mange egne', async () => {
    // Samme Firestore-instans for skrivingen og radene i den.
    const batchOf = (uid) => {
      const db = as(uid);
      return { batch: writeBatch(db), ref: (id) => doc(db, 'families', A, 'timeEntries', id) };
    };
    const lead = batchOf('ldr');
    CREW.forEach((id, i) => {
      lead.batch.set(lead.ref(`crew_${i}`), { id: `crew_${i}`, ...entry(id, '2026-10-26') }, { merge: true });
    });
    await assertSucceeds(lead.batch.commit());
    const own = batchOf('bob');
    for (let i = 0; i < 30; i += 1) {
      const id = `bob_batch_${i}`;
      own.batch.set(own.ref(id), { id, ...entry('emp_bob', `2026-09-${String(i + 1).padStart(2, '0')}`) }, { merge: true });
    }
    await assertSucceeds(own.batch.commit());
    // Den samme skrivingen fra en kollega avvises (én rad er nok til å stoppe den).
    const mixed = batchOf('eve');
    mixed.batch.set(mixed.ref('eve_batch_1'), entry('emp_eve', '2026-10-26'), { merge: true });
    mixed.batch.set(mixed.ref('crew_0'), { ...entry(CREW[0], '2026-10-26'), hours: 1 }, { merge: true });
    await assertFails(mixed.batch.commit());
  });
});
