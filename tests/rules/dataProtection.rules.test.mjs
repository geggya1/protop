/**
 * Personvern og regnskap i databasereglene, kjørt mot Firestore-emulatoren:
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/dataProtection.rules.test.mjs"
 *
 * HR (L-01, SEC-06, DS-10), fravær (L-02), personnummer og pårørende (L-03), notater (FL-13),
 * vennechat (FL-12), faktura, nummerserie, timer og utlegg (SEC-14, L-10, L-31, DS-11) og
 * personvernvalgene på selskapet. Rettighetene kommer fra speilet accessAcl/{uid}, som i appen.
 *
 * Bedrift A: own = eier, adm = administrator, hr = HR-ansvarlig, avd = avdelingsleder (HR Lese,
 * Andres timer Begrenset redigering), bob og eve = ansatte, okon = Faktura Begrenset redigering,
 * bill = Til fakturering Begrenset redigering, kpf = Admin på Selskapsinnstillinger, noacl = ansatt
 * uten speil. Barnehage D: mor og far. ext = bruker i et annet selskap.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp, collection, deleteDoc, doc, getDoc, getDocs, or, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';

const A = 'companyA';
const B = 'companyB';
const D = 'daycareD';
const FUTURE = Timestamp.fromMillis(Date.now() + 6 * 3600 * 1000);
const PAST = Timestamp.fromMillis(Date.now() - 3600 * 1000);

let env;

function as(uid) {
  return env.authenticatedContext(uid).firestore();
}

const hrSurface = (rank) => ({
  hr: rank, hrPeople: rank, hrAgreements: rank, hrPayroll: rank, hrFollowup: rank, hrCompliance: rank, hrRecruitment: rank,
});
const ansatt = { employees: 'see', absence: 'read', absenceReport: 'read', hours: 'read', hoursApproval: 'read', iso: 'see' };

const ACL = {
  adm: { levelId: 'administrator', employeeId: 'emp_adm', grants: { ...hrSurface('write'), employees: 'write', economyInvoices: 'write' } },
  hr: { levelId: 'ansatt', employeeId: 'emp_hr', grants: { ...ansatt, ...hrSurface('write'), employees: 'write', hoursOthers: 'see' } },
  avd: { levelId: 'avdelingsleder', employeeId: 'emp_avd', grants: { ...ansatt, ...hrSurface('see'), employees: 'read', hoursOthers: 'read' } },
  bob: { levelId: 'ansatt', employeeId: 'emp_bob', grants: ansatt },
  eve: { levelId: 'ansatt', employeeId: 'emp_eve', grants: ansatt },
  okon: { levelId: 'regnskap', employeeId: 'emp_okon', grants: { ...ansatt, economyInvoices: 'read', economyBilling: 'read' } },
  bill: { levelId: 'ansatt', employeeId: 'emp_bill', grants: { ...ansatt, economyBilling: 'read' } },
  kpf: { levelId: 'ansatt', employeeId: 'emp_kpf', grants: { ...ansatt, companyProfile: 'write', moduleSettings: 'write' } },
  gml: { levelId: 'ansatt', employeeId: 'emp_gml', grants: { ...ansatt, ...hrSurface('write') }, expired: true },
};

const lines = [{ id: 'l1', description: 'Arbeid', quantity: 1, unit: 'stk', unitPrice: 1000, amountExVat: 1000, vatCode: 'HIGH' }];
const invoice = (over = {}) => ({
  kind: 'invoice', status: 'draft', invoiceNumber: '', issuedAt: '', invoiceDate: '2026-10-27', dueDate: '2026-11-24',
  customerId: 'c1', customerName: 'Sola kommune', orgnr: '948243113', lines, amountExVat: 1000, vat: 250,
  amountInclVat: 1250, currency: 'NOK', archive: {}, events: [], payments: [], ...over,
});

const emp = (personUid, over = {}) => ({
  personUid,
  person: { firstName: personUid, email: `${personUid}@firma.no` },
  company: { accessLevels: ['ansatt'], accessLevel: 'ansatt', status: 'active', canLogin: true },
  invite: { status: 'accepted', email: '', acceptedUid: personUid },
  ...over,
});

const absence = (employeeId, over = {}) => ({
  employeeId, employeeName: employeeId, date: '2026-10-20', hours: 7.5, type: 'egenmelding', description: 'Syk', status: 'registrert', ...over,
});

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const members = ['own', 'adm', 'hr', 'avd', 'bob', 'eve', 'okon', 'bill', 'kpf', 'noacl', 'gml'];
    await setDoc(doc(db, 'families', A), {
      name: 'Bygg AS', type: 'company', ownerUid: 'own', adminUids: ['own', 'adm'], members, activeUsers: members,
      company: { navn: 'Bygg AS', accessPolicy: { v: 1 }, privacy: { usageLog: true, ai: true } },
    });
    for (const uid of members) {
      await setDoc(doc(db, 'families', A, 'parents', uid), { uid, active: true });
      await setDoc(doc(db, 'families', A, 'employees', `emp_${uid}`), emp(uid));
    }
    for (const [uid, row] of Object.entries(ACL)) {
      const { expired, ...rest } = row;
      await setDoc(doc(db, 'families', A, 'accessAcl', uid), { uid, iso: 1, ...rest, expiresAt: expired ? PAST : FUTURE });
    }
    await setDoc(doc(db, 'families', B), { name: 'Annet AS', type: 'company', ownerUid: 'ext', members: ['ext'] });

    // HR og utsnittene
    await setDoc(doc(db, 'families', A, 'hr', 'state'), { salaries: [{ id: 's1', employeeId: 'emp_eve', amount: 650000 }], cases: [] });
    await setDoc(doc(db, 'families', A, 'hrSelf', 'emp_bob'), { employeeId: 'emp_bob', tasks: [{ id: 't1', title: 'Signer' }] });
    await setDoc(doc(db, 'families', A, 'hrSelf', 'emp_eve'), { employeeId: 'emp_eve', salaries: [{ id: 's1', amount: 650000 }] });
    await setDoc(doc(db, 'families', A, 'hrSelf', 'emp_noacl'), { employeeId: 'emp_noacl', tasks: [] });

    // Fravær
    await setDoc(doc(db, 'families', A, 'absences', 'a_bob'), absence('emp_bob'));
    await setDoc(doc(db, 'families', A, 'absences', 'a_eve'), absence('emp_eve'));
    await setDoc(doc(db, 'families', A, 'absences', 'a_noacl'), absence('emp_noacl'));
    await setDoc(doc(db, 'families', D), { name: 'Barnehagen', type: 'daycare', ownerUid: 'mor', members: ['mor', 'far'] });
    await setDoc(doc(db, 'families', D, 'absences', 'b1'), { childId: 'k1', childName: 'Kari', dateKey: '2026-10-20', reason: 'Syk', authorUid: 'mor' });

    // Personnummer og pårørende
    await setDoc(doc(db, 'families', A, 'employeesPrivate', 'emp_bob'), { employeeId: 'emp_bob', person: { nationalId: '01019012345', kinName: 'Mor' } });
    await setDoc(doc(db, 'families', A, 'employeesPrivate', 'emp_eve'), { employeeId: 'emp_eve', person: { nationalId: '02029012345' } });
    // Eldre post med personnummer på selve posten.
    await setDoc(doc(db, 'families', A, 'employees', 'emp_old'), emp('', {
      person: { firstName: 'Gammel', nationalId: '03039012345', kinName: 'Far', kinPhone: '+4790000000' },
      company: { accessLevels: ['ansatt'], accessLevel: 'ansatt', status: 'active', comment: 'Internt' },
      invite: { status: 'none', email: '', acceptedUid: '' },
    }));
    await setDoc(doc(db, 'families', A, 'employees', 'emp_bob', 'usage', 'u1'), { type: 'login', ip: '203.0.113.8' });
    await setDoc(doc(db, 'families', A, 'employees', 'emp_bob', 'prefs', 'timesheet'), { view: 'week' });

    // Notater
    await setDoc(doc(db, 'families', A, 'notes', 'n_priv'), { title: 'Lønnssamtale', createdBy: 'own', memberIds: ['own'], visibility: 'private' });
    await setDoc(doc(db, 'families', A, 'notes', 'n_shared'), { title: 'Felles', createdBy: 'own', memberIds: ['own', 'bob'], visibility: 'shared' });

    // Kalender: felles, bare utvalgte (privat) og en eldre hendelse uten audience.
    await setDoc(doc(db, 'families', A, 'events', 'ev_all'), { title: 'Julebord', audience: 'family', memberIds: [], createdBy: 'own' });
    await setDoc(doc(db, 'families', A, 'events', 'ev_priv'), { title: 'Lønnssamtale Kim', audience: 'selected', memberIds: ['own', 'eve'], createdBy: 'own' });
    await setDoc(doc(db, 'families', A, 'events', 'ev_old'), { title: 'Gammel', memberIds: [], createdBy: 'eve' });
    await setDoc(doc(db, 'families', D, 'events', 'ev_d'), { title: 'Foreldremøte', audience: 'selected', memberIds: ['mor'], createdBy: 'mor' });

    // Venner
    await setDoc(doc(db, 'users', 'mor', 'friends', 'ola'), { uid: 'ola', status: 'active' });
    await setDoc(doc(db, 'users', 'ola', 'friends', 'mor'), { uid: 'mor', status: 'active' });
    await setDoc(doc(db, 'friendChats', 'dm_mor_ola'), { type: 'dm', memberIds: ['mor', 'ola'] });

    // Faktura og nummerserie
    await setDoc(doc(db, 'families', A, 'invoiceSeries', 'main'), { last: 100, jumps: [] });
    await setDoc(doc(db, 'families', A, 'invoices', 'D1'), invoice());
    await setDoc(doc(db, 'families', A, 'invoices', 'I1'), invoice({
      status: 'sent', invoiceNumber: '100', issuedAt: '2026-10-27T10:00:00Z', kid: '1000027',
      periodStart: '2026-10-01', periodEnd: '2026-10-31', invoiceText: 'Arbeid i oktober', ourReference: 'Ola',
      events: [{ id: 'ev1', at: '2026-10-27', type: 'issued', text: 'ferdigstilt', byUid: 'okon', byName: '' }],
    }));
    await setDoc(doc(db, 'families', A, 'invoices', 'M1'), invoice({ status: 'sent', invoiceNumber: '55' }));

    // Timer og prosjektutlegg
    const te = (over) => ({ projectId: 'p1', employeeId: 'emp_bob', date: '2026-10-20', hours: 7.5, billableHours: 7.5, description: 'Mur', timeType: 'ordinary', invoiceId: null, status: 'registrert', ...over });
    await setDoc(doc(db, 'families', A, 'timeEntries', 'te_free'), te({}));
    await setDoc(doc(db, 'families', A, 'timeEntries', 'te_locked'), te({ status: 'låst' }));
    await setDoc(doc(db, 'families', A, 'timeEntries', 'te_inv'), te({ status: 'låst', invoiceId: 'D1' }));
    const pe = (over) => ({ projectId: 'p1', employeeId: 'emp_bob', date: '2026-10-20', amountExVat: 400, amountInclVat: 500, vatCode: 'HIGH', markupPercent: 0, billable: true, status: 'approved', invoiceId: '', notes: '', ...over });
    await setDoc(doc(db, 'families', A, 'projectExpenses', 'pe_free'), pe({}));
    await setDoc(doc(db, 'families', A, 'projectExpenses', 'pe_inv'), pe({ status: 'invoiced', invoiceId: 'D1' }));
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

describe('HR (L-01, SEC-06, DS-10)', () => {
  test('en vanlig ansatt leser, lister og skriver ikke HR-dokumentet', async () => {
    for (const uid of ['bob', 'noacl', 'okon', 'gml', 'ext']) {
      await assertFails(getDoc(doc(as(uid), 'families', A, 'hr', 'state')), uid);
      await assertFails(getDocs(collection(as(uid), 'families', A, 'hr')), uid);
      await assertFails(setDoc(doc(as(uid), 'families', A, 'hr', 'state'), { salaries: [] }, { merge: true }), uid);
    }
    await assertFails(deleteDoc(doc(as('bob'), 'families', A, 'hr', 'state')));
  });

  test('HR leser og skriver; Lese på HR leser, men lagrer ikke; eier og administrator alltid', async () => {
    await assertSucceeds(getDoc(doc(as('hr'), 'families', A, 'hr', 'state')));
    await assertSucceeds(setDoc(doc(as('hr'), 'families', A, 'hr', 'state'), { cases: [{ id: 'c1' }] }, { merge: true }));
    await assertSucceeds(getDoc(doc(as('avd'), 'families', A, 'hr', 'state')));
    await assertFails(setDoc(doc(as('avd'), 'families', A, 'hr', 'state'), { cases: [] }, { merge: true }));
    for (const uid of ['own', 'adm']) {
      await assertSucceeds(getDoc(doc(as(uid), 'families', A, 'hr', 'state')), uid);
      await assertSucceeds(setDoc(doc(as(uid), 'families', A, 'hr', 'state'), { updatedAt: uid }, { merge: true }), uid);
    }
  });

  test('Min side: den ansatte leser bare sitt eget utsnitt, også uten speil', async () => {
    await assertSucceeds(getDoc(doc(as('bob'), 'families', A, 'hrSelf', 'emp_bob')));
    // Utsnittet finnes ikke ennå: den ansatte kan likevel spørre etter sitt eget.
    await assertSucceeds(getDoc(doc(as('kpf'), 'families', A, 'hrSelf', 'emp_kpf')));
    await assertFails(getDoc(doc(as('bob'), 'families', A, 'hrSelf', 'emp_ingen')));
    await assertFails(getDoc(doc(as('bob'), 'families', A, 'hrSelf', 'emp_eve')));
    await assertFails(getDocs(collection(as('bob'), 'families', A, 'hrSelf')));
    await assertFails(setDoc(doc(as('bob'), 'families', A, 'hrSelf', 'emp_bob'), { salaries: [{ amount: 9e6 }] }, { merge: true }));
    await assertSucceeds(getDoc(doc(as('noacl'), 'families', A, 'hrSelf', 'emp_noacl')));
    await assertFails(getDoc(doc(as('ext'), 'families', A, 'hrSelf', 'emp_bob')));
  });

  test('HR skriver og lister utsnittene', async () => {
    await assertSucceeds(getDocs(collection(as('hr'), 'families', A, 'hrSelf')));
    await assertSucceeds(setDoc(doc(as('hr'), 'families', A, 'hrSelf', 'emp_bob'), { employeeId: 'emp_bob', tasks: [] }));
    await assertSucceeds(deleteDoc(doc(as('hr'), 'families', A, 'hrSelf', 'emp_eve')));
    await assertFails(setDoc(doc(as('avd'), 'families', A, 'hrSelf', 'emp_bob'), { tasks: [] }));
  });
});

describe('fravær (L-02)', () => {
  test('ansatt ser og fører bare sitt eget fravær', async () => {
    const db = as('bob');
    await assertSucceeds(getDocs(query(collection(db, 'families', A, 'absences'), where('employeeId', '==', 'emp_bob'))));
    await assertSucceeds(getDocs(query(collection(db, 'families', A, 'absences'), where('employeeId', '==', 'emp_bob'), where('date', '>=', '2026-01-01'))));
    await assertFails(getDocs(collection(db, 'families', A, 'absences')));
    await assertFails(getDocs(query(collection(db, 'families', A, 'absences'), where('employeeId', '==', 'emp_eve'))));
    await assertSucceeds(getDoc(doc(db, 'families', A, 'absences', 'a_bob')));
    await assertFails(getDoc(doc(db, 'families', A, 'absences', 'a_eve')));

    await assertSucceeds(setDoc(doc(db, 'families', A, 'absences', 'a_bob2'), absence('emp_bob', { type: 'ferie' })));
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'absences', 'a_bob'), { hours: 4 }));
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'absences', 'a_bob'), { status: 'låst' }));
    await assertFails(updateDoc(doc(db, 'families', A, 'absences', 'a_bob'), { status: 'godkjent' }));
    await assertFails(setDoc(doc(db, 'families', A, 'absences', 'a_bob3'), absence('emp_bob', { status: 'godkjent' })));
    await assertFails(updateDoc(doc(db, 'families', A, 'absences', 'a_bob'), { employeeId: 'emp_eve' }));
    await assertFails(setDoc(doc(db, 'families', A, 'absences', 'x_eve'), absence('emp_eve')));
    await assertFails(updateDoc(doc(db, 'families', A, 'absences', 'a_eve'), { hours: 1 }));
    await assertFails(deleteDoc(doc(db, 'families', A, 'absences', 'a_eve')));
    await assertSucceeds(deleteDoc(doc(db, 'families', A, 'absences', 'a_bob')));
  });

  test('uten speil: egen rad som enkeltdokument, men ingen lister og ingen andres', async () => {
    const db = as('noacl');
    await assertSucceeds(getDoc(doc(db, 'families', A, 'absences', 'a_noacl')));
    await assertSucceeds(setDoc(doc(db, 'families', A, 'absences', 'a_noacl2'), absence('emp_noacl')));
    await assertFails(getDocs(collection(db, 'families', A, 'absences')));
    await assertFails(getDoc(doc(db, 'families', A, 'absences', 'a_bob')));
    await assertFails(getDoc(doc(as('gml'), 'families', A, 'absences', 'a_bob')));
  });

  test('HR, leder med Andres timer, eier og administrator ser og fører alle', async () => {
    for (const uid of ['hr', 'avd', 'own', 'adm']) {
      await assertSucceeds(getDocs(collection(as(uid), 'families', A, 'absences')), uid);
      await assertSucceeds(getDoc(doc(as(uid), 'families', A, 'absences', 'a_eve')), uid);
    }
    await assertSucceeds(updateDoc(doc(as('avd'), 'families', A, 'absences', 'a_eve'), { status: 'godkjent' }));
    await assertSucceeds(setDoc(doc(as('hr'), 'families', A, 'absences', 'h1'), absence('emp_eve')));
    await assertFails(getDocs(collection(as('ext'), 'families', A, 'absences')));
  });

  test('barnehage: fravær for barna som før', async () => {
    await assertSucceeds(getDocs(collection(as('far'), 'families', D, 'absences')));
    await assertSucceeds(setDoc(doc(as('far'), 'families', D, 'absences', 'b2'), { childId: 'k2', dateKey: '2026-10-21', authorUid: 'far' }));
    await assertFails(getDocs(collection(as('ext'), 'families', D, 'absences')));
  });
});

describe('personnummer, pårørende og bruksdata (L-03)', () => {
  test('den ansatte leser og skriver sin egen skjermede post, ikke andres', async () => {
    const db = as('bob');
    await assertSucceeds(getDoc(doc(db, 'families', A, 'employeesPrivate', 'emp_bob')));
    await assertSucceeds(setDoc(doc(db, 'families', A, 'employeesPrivate', 'emp_bob'), { person: { kinPhone: '+4791111111' } }, { merge: true }));
    await assertFails(getDoc(doc(db, 'families', A, 'employeesPrivate', 'emp_eve')));
    await assertFails(getDocs(collection(db, 'families', A, 'employeesPrivate')));
    await assertFails(setDoc(doc(db, 'families', A, 'employeesPrivate', 'emp_eve'), { person: { nationalId: '1' } }, { merge: true }));
    await assertFails(getDoc(doc(as('ext'), 'families', A, 'employeesPrivate', 'emp_bob')));
  });

  test('eier, administrator og HR (Personell) leser alle; Begrenset redigering på Ansatte kan bare skrive', async () => {
    for (const uid of ['own', 'adm', 'hr']) {
      await assertSucceeds(getDocs(collection(as(uid), 'families', A, 'employeesPrivate')), uid);
    }
    await assertFails(getDoc(doc(as('avd'), 'families', A, 'employeesPrivate', 'emp_eve')));
    await assertSucceeds(setDoc(doc(as('avd'), 'families', A, 'employeesPrivate', 'emp_eve'), { person: { kinName: 'Søster' } }, { merge: true }));
    await assertFails(setDoc(doc(as('okon'), 'families', A, 'employeesPrivate', 'emp_eve'), { person: { kinName: 'x' } }, { merge: true }));
  });

  test('nye verdier skrives ikke på selve ansattposten; gamle kan stå eller tømmes', async () => {
    await assertFails(updateDoc(doc(as('bob'), 'families', A, 'employees', 'emp_bob'), { 'person.nationalId': '01019012345' }));
    await assertFails(updateDoc(doc(as('bob'), 'families', A, 'employees', 'emp_bob'), { 'person.kinName': 'Mor' }));
    await assertFails(updateDoc(doc(as('own'), 'families', A, 'employees', 'emp_eve'), { 'company.comment': 'Notat' }));
    await assertFails(setDoc(doc(as('own'), 'families', A, 'employees', 'emp_ny'), emp('', { person: { firstName: 'Ny', nationalId: '04049012345' } })));
    await assertSucceeds(setDoc(doc(as('own'), 'families', A, 'employees', 'emp_ny'), emp('', { person: { firstName: 'Ny', nationalId: '' } })));
    await assertSucceeds(updateDoc(doc(as('bob'), 'families', A, 'employees', 'emp_bob'), { 'person.phone': '+4792222222' }));
    // Eldre post: andre felt kan endres, og de skjermede kan tømmes når de flyttes.
    const old = doc(as('own'), 'families', A, 'employees', 'emp_old');
    await assertSucceeds(updateDoc(old, { 'person.phone': '+4793333333' }));
    await assertFails(updateDoc(old, { 'person.nationalId': '05059012345' }));
    await assertSucceeds(updateDoc(old, { 'person.nationalId': '', 'person.kinName': '', 'person.kinPhone': '', 'company.comment': '' }));
  });

  test('bruksloggen med IP-adresser: bare den ansatte selv og administratorer leser, ingen skriver', async () => {
    await assertSucceeds(getDocs(collection(as('bob'), 'families', A, 'employees', 'emp_bob', 'usage')));
    await assertSucceeds(getDocs(collection(as('adm'), 'families', A, 'employees', 'emp_bob', 'usage')));
    await assertFails(getDocs(collection(as('eve'), 'families', A, 'employees', 'emp_bob', 'usage')));
    await assertFails(getDoc(doc(as('hr'), 'families', A, 'employees', 'emp_bob', 'usage', 'u1')));
    await assertFails(setDoc(doc(as('bob'), 'families', A, 'employees', 'emp_bob', 'usage', 'u2'), { ip: '1.2.3.4' }));
    // Andre underlag (timelisteinnstillinger) som før.
    await assertSucceeds(getDoc(doc(as('eve'), 'families', A, 'employees', 'emp_bob', 'prefs', 'timesheet')));
    await assertSucceeds(setDoc(doc(as('bob'), 'families', A, 'employees', 'emp_bob', 'prefs', 'timesheet'), { view: 'month' }));
  });
});

describe('notater (FL-13)', () => {
  test('bare de i memberIds leser; listen må filtrere på eget medlemskap', async () => {
    const db = as('bob');
    await assertSucceeds(getDocs(query(collection(db, 'families', A, 'notes'), where('memberIds', 'array-contains', 'bob'))));
    await assertFails(getDocs(collection(db, 'families', A, 'notes')));
    await assertFails(getDoc(doc(db, 'families', A, 'notes', 'n_priv')));
    await assertSucceeds(getDoc(doc(db, 'families', A, 'notes', 'n_shared')));
    await assertFails(getDoc(doc(as('adm'), 'families', A, 'notes', 'n_priv')));
  });

  test('medlemmer redigerer innholdet; bare den som laget notatet endrer hvem det er delt med', async () => {
    const db = as('bob');
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'notes', 'n_shared'), { title: 'Ny tittel' }));
    await assertFails(updateDoc(doc(db, 'families', A, 'notes', 'n_shared'), { memberIds: ['own', 'bob', 'eve'] }));
    await assertFails(updateDoc(doc(db, 'families', A, 'notes', 'n_shared'), { createdBy: 'bob' }));
    await assertFails(updateDoc(doc(db, 'families', A, 'notes', 'n_priv'), { title: 'x' }));
    await assertFails(deleteDoc(doc(db, 'families', A, 'notes', 'n_shared')));
    await assertSucceeds(updateDoc(doc(as('own'), 'families', A, 'notes', 'n_shared'), { memberIds: ['own'], visibility: 'private' }));
  });

  test('permanent slettet notat (eldre klient) kan ikke leses; sletting fjerner dokumentet (SOS-09)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', A, 'notes', 'n_gone'), {
        title: 'Hemmelig', body: 'Kim får 5 % tillegg', createdBy: 'own', memberIds: ['own', 'bob'], permanentlyDeleted: true, deleted: true,
      });
    });
    await assertFails(getDoc(doc(as('bob'), 'families', A, 'notes', 'n_gone')));
    await assertFails(getDoc(doc(as('own'), 'families', A, 'notes', 'n_gone')));
    await assertFails(getDocs(collection(as('eve'), 'families', A, 'notes')));
    await assertFails(deleteDoc(doc(as('bob'), 'families', A, 'notes', 'n_gone')));
    await assertSucceeds(deleteDoc(doc(as('own'), 'families', A, 'notes', 'n_gone')));
  });

  test('nytt notat: i eget navn og med en selv blant medlemmene', async () => {
    const db = as('bob');
    await assertSucceeds(setDoc(doc(db, 'families', A, 'notes', 'nb1'), { title: 'Mitt', createdBy: 'bob', memberIds: ['bob'] }));
    await assertFails(setDoc(doc(db, 'families', A, 'notes', 'nb2'), { title: 'Falsk', createdBy: 'own', memberIds: ['own', 'bob'] }));
    await assertFails(setDoc(doc(db, 'families', A, 'notes', 'nb3'), { title: 'Til andre', createdBy: 'bob', memberIds: ['eve'] }));
    await assertSucceeds(deleteDoc(doc(db, 'families', A, 'notes', 'nb1')));
  });
});

describe('kalender: private hendelser (SOS-08)', () => {
  test('en hendelse for utvalgte leses bare av den som laget den og de inviterte', async () => {
    await assertFails(getDoc(doc(as('bob'), 'families', A, 'events', 'ev_priv')));
    await assertFails(getDoc(doc(as('adm'), 'families', A, 'events', 'ev_priv')));
    await assertSucceeds(getDoc(doc(as('eve'), 'families', A, 'events', 'ev_priv')));
    await assertSucceeds(getDoc(doc(as('own'), 'families', A, 'events', 'ev_priv')));
    await assertFails(updateDoc(doc(as('bob'), 'families', A, 'events', 'ev_priv'), { title: 'x' }));
    await assertFails(deleteDoc(doc(as('bob'), 'families', A, 'events', 'ev_priv')));
    // Felles og eldre hendelser som før.
    await assertSucceeds(getDoc(doc(as('bob'), 'families', A, 'events', 'ev_all')));
    await assertSucceeds(getDoc(doc(as('bob'), 'families', A, 'events', 'ev_old')));
    await assertSucceeds(updateDoc(doc(as('bob'), 'families', A, 'events', 'ev_all'), { place: 'Kantina' }));
  });

  test('lister: hele samlingen avvises, appens tre spørringer godtas', async () => {
    const col = collection(as('bob'), 'families', A, 'events');
    await assertFails(getDocs(col));
    await assertSucceeds(getDocs(query(col, where('audience', '==', 'family'))));
    await assertSucceeds(getDocs(query(col, where('memberIds', 'array-contains', 'bob'))));
    await assertSucceeds(getDocs(query(col, where('createdBy', '==', 'bob'))));
    await assertSucceeds(getDocs(query(col, or(where('audience', '==', 'family'), where('memberIds', 'array-contains', 'bob')))));
    // Den som laget en eldre hendelse, kan merke den som felles.
    await assertSucceeds(updateDoc(doc(as('eve'), 'families', A, 'events', 'ev_old'), { audience: 'family' }));
    await assertSucceeds(setDoc(doc(as('bob'), 'families', A, 'events', 'ev_bob'), { title: 'Tannlege', audience: 'selected', memberIds: ['bob'], createdBy: 'bob' }));
  });

  test('andre grupper (familie, barnehage) som før', async () => {
    await assertSucceeds(getDocs(collection(as('far'), 'families', D, 'events')));
    await assertSucceeds(getDoc(doc(as('far'), 'families', D, 'events', 'ev_d')));
  });
});

describe('vennechat (FL-12)', () => {
  test('venner sender; en fjernet venn kan ikke skrive i den gamle tråden', async () => {
    const msg = (senderId) => ({ text: 'Hei', senderId });
    await assertSucceeds(setDoc(doc(as('ola'), 'friendChats', 'dm_mor_ola', 'messages', 'm1'), msg('ola')));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), 'users', 'ola', 'friends', 'mor'));
      await setDoc(doc(ctx.firestore(), 'users', 'mor', 'friends', 'ola'), { uid: 'ola', status: 'removed' });
    });
    await assertFails(setDoc(doc(as('ola'), 'friendChats', 'dm_mor_ola', 'messages', 'm2'), msg('ola')));
    await assertFails(setDoc(doc(as('mor'), 'friendChats', 'dm_mor_ola', 'messages', 'm3'), msg('mor')));
    // Gamle meldinger kan fortsatt leses.
    await assertSucceeds(getDocs(collection(as('ola'), 'friendChats', 'dm_mor_ola', 'messages')));
  });

  test('ny tråd, melding og varsel krever vennskap begge veier (SOS-04)', async () => {
    const msg = { text: 'Hei', senderId: 'kari' };
    await assertFails(setDoc(doc(as('kari'), 'friendChats', 'dm_kari_ulf'), { type: 'dm', memberIds: ['kari', 'ulf'] }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'friendChats', 'dm_kari_ulf'), { type: 'dm', memberIds: ['kari', 'ulf'] });
      // Bare den ene veien (f.eks. en forespørsel som ikke er godtatt).
      await setDoc(doc(ctx.firestore(), 'users', 'kari', 'friends', 'ulf'), { uid: 'ulf', status: 'active' });
    });
    await assertFails(setDoc(doc(as('kari'), 'friendChats', 'dm_kari_ulf', 'messages', 'm1'), msg));
    await assertFails(setDoc(doc(as('kari'), 'users', 'ulf', 'notifications', 'friendChat_dm_kari_ulf_m1'),
      { eventType: 'messageReceived', title: 'Kari', body: 'Hei', friendChat: true, friendUid: 'kari', createdBy: 'kari' }));
    // Samme bedrift gir ikke rett til varsel om vennechat.
    await assertFails(setDoc(doc(as('bob'), 'users', 'eve', 'notifications', 'friendChat_x'),
      { eventType: 'messageReceived', title: 'Bob', familyId: A, friendChat: true, friendUid: 'bob', createdBy: 'bob' }));
    await assertSucceeds(setDoc(doc(as('mor'), 'friendChats', 'dm_mor_ola2'), { type: 'dm', memberIds: ['mor', 'ola'] }));
    await assertSucceeds(setDoc(doc(as('mor'), 'users', 'ola', 'notifications', 'friendChat_dm_mor_ola_m9'),
      { eventType: 'messageReceived', title: 'Mor', body: 'Hei', friendChat: true, friendUid: 'mor', createdBy: 'mor' }));
    // Lesekvittering i en tråd uten vennskap er fortsatt lov (ingen nye medlemmer).
    await assertSucceeds(updateDoc(doc(as('kari'), 'friendChats', 'dm_kari_ulf'), { 'unreadCounts.kari': 0 }));
    await assertFails(updateDoc(doc(as('kari'), 'friendChats', 'dm_kari_ulf'), { memberIds: ['kari', 'mal'] }));
  });
});

describe('faktura, nummerserie og betaling (SEC-14, L-10, L-31)', () => {
  const issue = (db, number, seriesPatch) => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'families', A, 'invoiceSeries', 'main'), { last: number, ...seriesPatch }, { merge: true });
    batch.set(doc(db, 'families', A, 'invoices', 'D1'), { status: 'issued', invoiceNumber: String(number), issuedAt: '2026-10-28T09:00:00Z' }, { merge: true });
    return batch.commit();
  };

  test('utkast lages av alle medlemmer, men bare økonomi ferdigstiller', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'families', A, 'invoices', 'D2'), invoice()));
    await assertSucceeds(updateDoc(doc(as('bill'), 'families', A, 'invoices', 'D1'), { customerName: 'Sandnes kommune' }));
    await assertFails(issue(as('bob'), 101));
    await assertFails(issue(as('bill'), 101));
    await assertFails(issue(as('gml'), 101));
    await assertSucceeds(issue(as('okon'), 101));
  });

  test('nummerserien: bare økonomi, ett steg, eller et begrunnet hopp i loggen', async () => {
    const ref = (uid) => doc(as(uid), 'families', A, 'invoiceSeries', 'main');
    await assertFails(updateDoc(ref('bob'), { last: 101 }));
    await assertFails(updateDoc(ref('okon'), { last: 120 }));
    await assertFails(updateDoc(ref('okon'), { last: 120, jumps: [{ from: 101, to: 119, next: 120, reason: 'kort' }] }));
    await assertFails(updateDoc(ref('okon'), { last: 120, jumps: [{ from: 101, to: 119, next: 121, reason: 'Nummer brukt i gammelt system' }] }));
    await assertSucceeds(updateDoc(ref('okon'), { last: 120, jumps: [{ from: 101, to: 119, next: 120, reason: 'Nummer brukt i gammelt system' }] }));
    // Loggen bare vokser.
    await assertFails(updateDoc(ref('okon'), { last: 130, jumps: [{ from: 121, to: 129, next: 130, reason: 'Nummer brukt i gammelt system' }] }));
    await assertSucceeds(updateDoc(ref('okon'), { last: 121 }));
    await assertFails(updateDoc(ref('own'), { last: 121 }));
    await assertFails(updateDoc(ref('own'), { last: 122, note: 'x' }));
  });

  test('ferdigstilling med hopp i nummeret logger hoppet', async () => {
    await assertFails(issue(as('okon'), 105));
    await assertSucceeds(issue(as('okon'), 105, { jumps: [{ from: 101, to: 104, next: 105, reason: 'Nummer 101–104 er brukt i fakturalisten (import).' }] }));
  });

  test('betaling og status på utstedt og importert faktura krever økonomi', async () => {
    const paid = { status: 'paid', payments: [{ id: 'p1', date: '2026-11-01', amount: 1250 }], outstandingAmount: 0 };
    await assertFails(updateDoc(doc(as('bob'), 'families', A, 'invoices', 'I1'), paid));
    await assertFails(updateDoc(doc(as('bill'), 'families', A, 'invoices', 'I1'), { notes: 'Ringt kunden' }));
    await assertSucceeds(updateDoc(doc(as('okon'), 'families', A, 'invoices', 'I1'), paid));
    await assertFails(updateDoc(doc(as('bob'), 'families', A, 'invoices', 'M1'), { status: 'paid' }));
    await assertFails(updateDoc(doc(as('bob'), 'families', A, 'invoices', 'M1'), { payments: [{ id: 'p1', amount: 1 }] }));
    await assertSucceeds(updateDoc(doc(as('okon'), 'families', A, 'invoices', 'M1'), { status: 'paid' }));
  });

  test('leveringsperiode, tekst og referanser er låst; hendelsesloggen kan bare utvides', async () => {
    const ref = doc(as('okon'), 'families', A, 'invoices', 'I1');
    await assertFails(updateDoc(ref, { periodStart: '2026-09-01' }));
    await assertFails(updateDoc(ref, { periodEnd: '' }));
    await assertFails(updateDoc(ref, { invoiceText: 'Annen tekst' }));
    await assertFails(updateDoc(ref, { ourReference: 'Kari' }));
    await assertFails(updateDoc(ref, { language: 'en' }));
    await assertSucceeds(updateDoc(ref, { language: 'nb', addressLineAbove: '' }));
    await assertFails(updateDoc(ref, { events: [] }));
    await assertFails(updateDoc(ref, { events: [{ id: 'ev1', at: '2026-10-27', type: 'issued', text: 'endret', byUid: 'okon', byName: '' }] }));
    await assertSucceeds(updateDoc(ref, {
      events: [
        { id: 'ev1', at: '2026-10-27', type: 'issued', text: 'ferdigstilt', byUid: 'okon', byName: '' },
        { id: 'ev2', at: '2026-10-28', type: 'sent', text: 'sendt', byUid: 'okon', byName: '' },
      ],
    }));
  });
});

describe('timer og prosjektutlegg med faktura eller lås (DS-11)', () => {
  const te = (uid, id) => doc(as(uid), 'families', A, 'timeEntries', id);
  const pe = (uid, id) => doc(as(uid), 'families', A, 'projectExpenses', id);

  test('åpne timer endres og slettes som før', async () => {
    await assertSucceeds(updateDoc(te('bob', 'te_free'), { hours: 8, billableHours: 8 }));
    await assertSucceeds(setDoc(te('eve', 'te_new'), { projectId: 'p1', employeeId: 'emp_eve', date: '2026-10-21', hours: 2 }));
    await assertSucceeds(deleteDoc(te('bob', 'te_free')));
  });

  test('låst rad: timer, dato og prosjekt står fast, teksten kan rettes, og den slettes ikke', async () => {
    await assertFails(updateDoc(te('bob', 'te_locked'), { hours: 10 }));
    await assertFails(updateDoc(te('own', 'te_locked'), { date: '2026-10-21' }));
    await assertFails(updateDoc(te('bob', 'te_locked'), { billableHours: 1 }));
    await assertSucceeds(updateDoc(te('bob', 'te_locked'), { description: 'Mur, rettet' }));
    await assertFails(deleteDoc(te('bob', 'te_locked')));
    await assertSucceeds(updateDoc(te('own', 'te_locked'), { status: 'godkjent' }));
  });

  test('fakturakoblingen settes og fjernes bare av den som fakturerer', async () => {
    await assertFails(updateDoc(te('bob', 'te_free'), { invoiceId: 'D1', status: 'låst' }));
    await assertSucceeds(updateDoc(te('bill', 'te_free'), { invoiceId: 'D1', status: 'låst' }));
    await assertFails(updateDoc(te('bob', 'te_inv'), { invoiceId: null }));
    await assertFails(updateDoc(te('bob', 'te_inv'), { status: 'registrert' }));
    await assertFails(updateDoc(te('bill', 'te_inv'), { hours: 1 }));
    await assertFails(deleteDoc(te('bill', 'te_inv')));
    await assertSucceeds(updateDoc(te('okon', 'te_inv'), { invoiceId: '', status: 'godkjent' }));
  });

  test('fakturert utlegg: beløp og prosjekt står fast, og det slettes ikke', async () => {
    await assertSucceeds(updateDoc(pe('bob', 'pe_free'), { amountExVat: 450 }));
    await assertFails(updateDoc(pe('bob', 'pe_inv'), { amountExVat: 1 }));
    await assertFails(updateDoc(pe('bill', 'pe_inv'), { projectId: 'p2' }));
    await assertSucceeds(updateDoc(pe('bob', 'pe_inv'), { notes: 'Kvittering lagt ved' }));
    await assertFails(updateDoc(pe('bob', 'pe_inv'), { invoiceId: '', status: 'approved' }));
    await assertFails(deleteDoc(pe('bob', 'pe_inv')));
    await assertSucceeds(updateDoc(pe('bill', 'pe_inv'), { invoiceId: '', status: 'approved' }));
  });
});

describe('personvernvalg og databehandleravtale på selskapet', () => {
  test('bare eier og administratorer endrer company.privacy og company.dpaAcceptance', async () => {
    for (const uid of ['bob', 'kpf', 'hr']) {
      await assertFails(updateDoc(doc(as(uid), 'families', A), { 'company.privacy.ai': false }), uid);
      await assertFails(updateDoc(doc(as(uid), 'families', A), { 'company.dpaAcceptance': { version: '1.0.0', acceptedByUid: uid } }), uid);
    }
    // Andre selskapsfelt som før.
    await assertSucceeds(updateDoc(doc(as('kpf'), 'families', A), { 'company.telefon': '51000000' }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'families', A), { 'company.privacy.ai': false }));
    await assertSucceeds(updateDoc(doc(as('own'), 'families', A), { 'company.dpaAcceptance': { version: '1.0.0', acceptedByUid: 'own' } }));
  });
});
