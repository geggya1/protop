/**
 * Kobling av ansattposter (personUid) og det koblingen bygger på (e-post og invitasjon), kjørt mot
 * Firestore-emulatoren (SEC-26).
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/employeeLink.rules.test.mjs"
 *
 * Den som er koblet til en post, leser personnummeret i employeesPrivate og fører timene på posten.
 * Et vanlig medlem kobler derfor ikke en kollegas post til seg selv eller en annen konto, og endrer ikke
 * e-posten eller invitasjonen (invite.parentKey) som appen og serveren kobler på.
 *
 * Bedrift A: own = eier, adm = administrator, hr = Admin på Ansatte, avd = Begrenset redigering på
 * Ansatte, eve og bob = ansatte (koblet), non, mia, kim, lise og nina = medlemmer med en ukoblet post
 * (nina er invitert som administrator).
 * Alle har bekreftet e-post <uid>@firma.no, om ikke annet står.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

// RULES_FILE: en annen regelfil (f.eks. reglene før rettingen, for å se at testene fanger feilen).
const RULES = process.env.RULES_FILE || new URL('../../firestore.rules', import.meta.url);
const A = 'companyA';
const FUTURE = Timestamp.fromMillis(Date.now() + 6 * 3600 * 1000);
let env;

function as(uid, verified = true) {
  return env.authenticatedContext(uid, { email: `${uid}@firma.no`, email_verified: verified }).firestore();
}

const grants = (over) => ({ employees: 'see', hours: 'read', absence: 'read', iso: 'see', ...over });

const ACL = {
  hr: { levelId: 'ansatt', employeeId: '', grants: grants({ employees: 'write' }) },
  avd: { levelId: 'avdelingsleder', employeeId: '', grants: grants({ employees: 'read' }) },
  eve: { levelId: 'ansatt', employeeId: 'emp_eve', grants: grants({}) },
  bob: { levelId: 'ansatt', employeeId: 'emp_bob', grants: grants({}) },
};

const post = (personUid, over = {}) => ({
  personUid,
  person: { firstName: personUid || 'Ny', email: personUid ? `${personUid}@firma.no` : '' },
  company: { accessLevels: ['ansatt'], accessLevel: 'ansatt', status: 'active', canLogin: !!personUid, email: '' },
  invite: personUid
    ? { status: 'accepted', email: `${personUid}@firma.no`, acceptedUid: personUid, parentKey: '' }
    : { status: 'none', email: '', acceptedUid: '', parentKey: '' },
  ...over,
});

const OLA = post('', { person: { firstName: 'Ola', lastName: 'Nordmann', email: 'ola@firma.no' } });
const BOB = post('bob');
// E-posten står med store bokstaver på posten; innloggingen har non@firma.no.
const NON = post('', { person: { firstName: 'Non', email: 'Non@Firma.no' } });
const MIA = post('', {
  person: { firstName: 'Mia', email: '' },
  company: { accessLevels: ['ansatt'], accessLevel: 'ansatt', status: 'active', canLogin: false, email: 'mia@firma.no' },
});
// Invitert, har godtatt medlemskapet, men posten er ikke koblet ennå.
const KIM = post('', {
  person: { firstName: 'Kim', email: '' },
  invite: { status: 'sent', email: 'kim@firma.no', acceptedUid: '', parentKey: '' },
});
// Bare samme navn som innloggingen (eldre app kobler på navn).
const LISE = post('', { person: { firstName: 'Lise', lastName: 'Berg', email: '' } });
// Administrator som er invitert, men ikke har svart.
const NYADM = post('', {
  person: { firstName: 'Nina', email: 'nina@firma.no' },
  company: { accessLevels: ['administrator'], accessLevel: 'administrator', status: 'active', canLogin: false, email: '' },
  invite: { status: 'sent', email: 'nina@firma.no', accessLevel: 'administrator', acceptedUid: '', parentKey: '' },
});

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const members = ['own', 'adm', 'hr', 'avd', 'eve', 'bob', 'non', 'mia', 'kim', 'lise', 'nina'];
    await setDoc(doc(db, 'families', A), {
      name: 'Bygg AS', type: 'company', ownerUid: 'own', adminUids: ['own', 'adm'], members, activeUsers: members,
      company: { navn: 'Bygg AS' },
    });
    for (const uid of members) {
      await setDoc(doc(db, 'families', A, 'parents', uid), { uid, name: uid, active: true });
    }
    for (const [uid, row] of Object.entries(ACL)) {
      await setDoc(doc(db, 'families', A, 'accessAcl', uid), { uid, iso: 1, ...row, expiresAt: FUTURE });
    }
    const posts = {
      emp_eve: post('eve'), emp_bob: BOB, emp_ola: OLA, emp_non: NON, emp_mia: MIA, emp_kim: KIM,
      emp_lise: LISE, emp_nyadm: NYADM,
    };
    for (const [id, row] of Object.entries(posts)) {
      await setDoc(doc(db, 'families', A, 'employees', id), row);
    }
    for (const id of ['emp_ola', 'emp_non']) {
      await setDoc(doc(db, 'families', A, 'employeesPrivate', id), {
        employeeId: id, person: { nationalId: '01017012345', kinName: 'Pårørende' },
      });
    }
    await setDoc(doc(db, 'families', A, 'timeEntries', 'te_ola'), {
      projectId: 'p1', employeeId: 'emp_ola', date: '2026-10-26', hours: 7.5, status: 'registrert', invoiceId: null,
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

const employee = (db, id) => doc(db, 'families', A, 'employees', id);

describe('SEC-26: et medlem kobler ikke en kollegas post til seg selv', () => {
  test('ukoblet post med en annens e-post: ingen kobling, og verken personnummer eller timer', async () => {
    const eve = as('eve');
    await assertFails(updateDoc(employee(eve, 'emp_ola'), { personUid: 'eve' }));
    // Som saveEmployee i appen: hele posten i én skriving.
    await assertFails(setDoc(employee(eve, 'emp_ola'), { ...OLA, personUid: 'eve' }));
    await assertFails(getDoc(doc(eve, 'families', A, 'employeesPrivate', 'emp_ola')));
    await assertFails(updateDoc(doc(eve, 'families', A, 'timeEntries', 'te_ola'), { hours: 1 }));
  });

  test('heller ikke i to steg: e-post, invitasjon eller acceptedUid først, eller koblet til en annen konto', async () => {
    const eve = as('eve');
    await assertFails(updateDoc(employee(eve, 'emp_ola'), { 'person.email': 'eve@firma.no' }));
    await assertFails(updateDoc(employee(eve, 'emp_ola'), { 'company.email': 'eve@firma.no' }));
    await assertFails(updateDoc(employee(eve, 'emp_ola'), { 'invite.status': 'sent', 'invite.email': 'eve@firma.no' }));
    await assertFails(updateDoc(employee(eve, 'emp_ola'), { 'invite.acceptedUid': 'eve' }));
    await assertFails(updateDoc(employee(eve, 'emp_ola'), { personUid: 'eve', 'person.email': 'eve@firma.no' }));
    // Til en annen konto (et medlem til), og en kollega løses ikke fra sin egen post.
    await assertFails(updateDoc(employee(eve, 'emp_ola'), { personUid: 'lise' }));
    await assertFails(updateDoc(employee(eve, 'emp_bob'), { personUid: '' }));
    await assertFails(setDoc(employee(eve, 'emp_bob'), { ...BOB, personUid: 'eve' }));
  });

  test('heller ikke ved å sette sin egen uid som invitasjonens nøkkel (invite.parentKey), som serveren kobler på', async () => {
    const eve = as('eve');
    await assertFails(updateDoc(employee(eve, 'emp_kim'), { 'invite.parentKey': 'eve' }));
    await assertFails(updateDoc(employee(eve, 'emp_ola'), { 'invite.status': 'queued', 'invite.parentKey': 'eve' }));
    // En ventende administratorinvitasjon: serveren ville gitt administrator ved neste innlogging.
    await assertFails(updateDoc(employee(eve, 'emp_nyadm'), { 'invite.parentKey': 'eve' }));
  });

  test('ubekreftet e-post, eller bare samme navn (eldre app), gir ingen kobling', async () => {
    await assertFails(updateDoc(employee(as('non', false), 'emp_non'), { personUid: 'non' }));
    await assertFails(updateDoc(employee(as('lise'), 'emp_lise'), { personUid: 'lise' }));
    await assertFails(setDoc(employee(as('lise'), 'emp_lise'), { ...LISE, personUid: 'lise' }));
    // En lederpost kobles ikke på e-post fra klienten (serveren gjør det når invitasjonen godtas).
    await assertFails(updateDoc(employee(as('nina'), 'emp_nyadm'), { personUid: 'nina' }));
  });
});

describe('SEC-26: det som skal virke som før', () => {
  test('Gjenopprett min profil: bekreftet e-post på posten (person, firma eller invitasjon) kobler, og gir eget personnummer og egne timer', async () => {
    const non = as('non');
    await assertSucceeds(updateDoc(employee(non, 'emp_non'), { personUid: 'non' }));
    await assertSucceeds(getDoc(doc(non, 'families', A, 'employeesPrivate', 'emp_non')));
    await assertSucceeds(setDoc(doc(non, 'families', A, 'timeEntries', 'te_non'), {
      projectId: 'p1', employeeId: 'emp_non', date: '2026-10-27', hours: 7.5, status: 'registrert', invoiceId: null,
    }));
    await assertSucceeds(updateDoc(employee(as('mia'), 'emp_mia'), { personUid: 'mia' }));
    // Eldre app (saveEmployee): hele posten.
    await assertSucceeds(setDoc(employee(as('kim'), 'emp_kim'), { ...KIM, personUid: 'kim' }));
  });

  test('egen post som allerede er koblet, lagres som før, også uten bekreftet e-post', async () => {
    const bob = as('bob', false);
    await assertSucceeds(setDoc(employee(bob, 'emp_bob'), { ...BOB, person: { ...BOB.person, phone: '99887766' } }));
    await assertSucceeds(updateDoc(employee(bob, 'emp_bob'), { personUid: 'bob', 'person.email': 'bob.b@firma.no' }));
  });

  test('andre felt på en kollegas post lagres som før', async () => {
    const eve = as('eve');
    await assertSucceeds(updateDoc(employee(eve, 'emp_ola'), { 'person.phone': '99887766', 'company.title': 'Tømrer' }));
    await assertSucceeds(setDoc(employee(eve, 'emp_bob'), { ...BOB, company: { ...BOB.company, title: 'Snekker' } }));
    // Store bokstaver i e-posten regnes som samme adresse (appen normaliserer).
    await assertSucceeds(updateDoc(employee(eve, 'emp_ola'), { 'person.email': 'Ola@Firma.no' }));
  });

  test('den som administrerer ansatte, kobler, inviterer og retter e-post; Begrenset redigering gjør det ikke', async () => {
    const hr = as('hr');
    await assertSucceeds(updateDoc(employee(hr, 'emp_ola'), {
      'person.email': 'ola.n@firma.no', 'invite.status': 'sent', 'invite.email': 'ola.n@firma.no', 'invite.parentKey': 'olanfirmano',
    }));
    await assertSucceeds(updateDoc(employee(hr, 'emp_lise'), { personUid: 'lise' }));
    await assertSucceeds(updateDoc(employee(hr, 'emp_bob'), { personUid: '' }));
    // Også seg selv, uten at e-posten står på posten.
    await assertSucceeds(updateDoc(employee(hr, 'emp_mia'), { personUid: 'hr' }));
    await assertSucceeds(updateDoc(employee(as('adm'), 'emp_kim'), { personUid: 'adm' }));
    await assertSucceeds(updateDoc(employee(as('adm'), 'emp_nyadm'), { 'invite.parentKey': 'nina' }));
    await assertSucceeds(updateDoc(employee(as('own'), 'emp_non'), { personUid: 'non' }));
    const avd = as('avd');
    await assertFails(updateDoc(employee(avd, 'emp_ola'), { personUid: 'lise' }));
    await assertFails(updateDoc(employee(avd, 'emp_ola'), { 'person.email': 'avd@firma.no' }));
    await assertFails(updateDoc(employee(avd, 'emp_lise'), { personUid: 'avd' }));
  });
});
