/**
 * Medlemskap, administrator og selskapsdokumentet, kjørt mot Firestore-emulatoren.
 * Regresjon for sikkerhetsgjennomgangen (SEC-03, SEC-04, SEC-05, SEC-07, SEC-13, SEC-18,
 * FL-01 og FL-02): ingen vanlig ansatt kan heve seg selv, og reglene stoler ikke på felt
 * klienten skriver selv. Angrepene fra gjennomgangen avvises, og vanlig bruk i appen virker.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test tests/rules/membership.rules.test.mjs"
 *
 * Bedrift A (bruker ISO-speilet): own = eier, adm = administrator, kpf = egendefinert nivå med Admin
 * på Selskapsinnstillinger, Modulinnstillinger og Tilgangsstyring, ldr = Øverste leder,
 * hr = HR-ansvarlig, avd = avdelingsleder, bob = ansatt, eve = deaktivert ansatt.
 * Bedrift B har ikke speil. Familie F: mor (admin), far, barnet kid. mal = fremmed.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp, arrayRemove, arrayUnion, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';

const A = 'companyA';
const B = 'companyB';
const F = 'familyF';
const FUTURE = Timestamp.fromMillis(Date.now() + 6 * 3600 * 1000);

let env;

function as(uid) {
  return env.authenticatedContext(uid, { email: `${uid}@firma.no`, email_verified: true }).firestore();
}

const grants = (over) => ({
  accessControl: 'none', companyProfile: 'none', moduleSettings: 'none', employees: 'see', iso: 'see', ...over,
});

const ACL = {
  adm: { levelId: 'administrator', grants: grants({ accessControl: 'write', companyProfile: 'write', moduleSettings: 'write', employees: 'write' }) },
  kpf: { levelId: 'ansatt', grants: grants({ accessControl: 'write', companyProfile: 'write', moduleSettings: 'write' }) },
  ldr: { levelId: 'leder', grants: grants({ accessControl: 'read', companyProfile: 'see', moduleSettings: 'see', employees: 'write' }) },
  hr: { levelId: 'ansatt', grants: grants({ employees: 'write' }) },
  avd: { levelId: 'avdelingsleder', grants: grants({ employees: 'read' }) },
  bob: { levelId: 'ansatt', grants: grants({}) },
  eve: { levelId: '', grants: {} },
};

const emp = (personUid, levels, over = {}) => ({
  personUid,
  person: { firstName: personUid || 'Ny', email: `${personUid || 'ny'}@firma.no` },
  company: { accessLevels: levels, accessLevel: levels[levels.length - 1] || '', status: 'active', canLogin: true },
  invite: { status: personUid ? 'accepted' : 'none', email: '', acceptedUid: personUid },
  ...over,
});

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const members = ['own', 'adm', 'kpf', 'ldr', 'hr', 'avd', 'bob', 'eve', 'non'];
    await setDoc(doc(db, 'families', A), {
      name: 'Bygg AS', type: 'company', ownerUid: 'own', adminUids: ['own', 'adm'], members, activeUsers: members,
      orgnr: '999888777', invitedEmails: [],
      company: { navn: 'Bygg AS', organisasjonsnummer: '999888777', accessPolicy: { v: 1 }, modules: { disabled: [] } },
    });
    for (const uid of members) {
      await setDoc(doc(db, 'families', A, 'parents', uid), { uid, name: uid, active: true, placeholder: false, admin: uid === 'own' || uid === 'adm' });
    }
    for (const [uid, row] of Object.entries(ACL)) {
      await setDoc(doc(db, 'families', A, 'accessAcl', uid), { uid, iso: 1, ...row, expiresAt: FUTURE });
    }
    await setDoc(doc(db, 'families', A, 'employees', 'emp_own'), emp('own', ['administrator']));
    await setDoc(doc(db, 'families', A, 'employees', 'emp_adm'), emp('adm', ['administrator']));
    await setDoc(doc(db, 'families', A, 'employees', 'emp_ldr'), emp('ldr', ['leder']));
    await setDoc(doc(db, 'families', A, 'employees', 'emp_bob'), emp('bob', ['ansatt']));
    await setDoc(doc(db, 'families', A, 'employees', 'emp_eve'), emp('eve', ['ansatt'], {
      company: { accessLevels: ['ansatt'], accessLevel: 'ansatt', status: 'inactive', canLogin: false },
    }));
    // Administrator som er invitert, men ikke har svart ennå.
    await setDoc(doc(db, 'families', A, 'employees', 'emp_nyadm'), emp('', ['administrator'], {
      person: { firstName: 'Nina', email: 'nina@firma.no' },
      invite: { status: 'sent', email: 'nina@firma.no', acceptedUid: '' },
    }));
    // Ukoblet ansatt med samme e-post som non (Gjenopprett min profil).
    await setDoc(doc(db, 'families', A, 'employees', 'emp_free'), emp('', ['ansatt'], { person: { firstName: 'Non', email: 'non@firma.no' } }));

    await setDoc(doc(db, 'families', B), {
      name: 'Annet AS', type: 'company', ownerUid: 'ownB', adminUids: ['ownB'], members: ['ownB', 'carl'],
      company: { accessPolicy: { v: 1 } },
    });

    await setDoc(doc(db, 'families', F), {
      name: 'Familien', type: 'family', ownerUid: 'mor', adminUids: ['mor'], members: ['mor', 'kid'], activeUsers: ['mor', 'kid'],
    });
    await setDoc(doc(db, 'families', F, 'parents', 'mor'), { uid: 'mor', active: true, admin: true });
    // far har et aktivt medlemsdokument, men står ikke i medlemslistene ennå.
    await setDoc(doc(db, 'families', F, 'parents', 'far'), { uid: 'far', active: true, admin: false });
    await setDoc(doc(db, 'families', F, 'children', 'kid'), { uid: 'kid', familyId: F, active: true });
    await setDoc(doc(db, 'children', 'kid'), { uid: 'kid', familyId: F });

    for (const uid of ['own', 'mor', 'far', 'mal', 'bob']) {
      await setDoc(doc(db, 'users', uid), { uid, role: 'adult', email: `${uid}@firma.no` });
    }
    await setDoc(doc(db, 'users', 'kid'), { uid: 'kid', role: 'child', displayName: 'Kid' });
    // Voksen uten egen e-post (brukernavn-konto), og et eldre barn uten rolle på profilen.
    await setDoc(doc(db, 'users', 'besta'), { uid: 'besta', role: 'adult', email: 'besta@konto.protop.no' });
    await setDoc(doc(db, 'users', 'gammelkid'), { uid: 'gammelkid', email: 'gammelkid@konto.protop.no' });
    await setDoc(doc(db, 'joinCodes', 'TEAM1234'), { code: 'TEAM1234', familyId: B, type: 'team' });
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

describe('selskapsdokumentet (SEC-07, SEC-13, FL-02)', () => {
  test('ansatt kan ikke sette createdBy/adminUid eller legge fremmede inn i medlemslistene', async () => {
    const db = as('bob');
    await assertFails(updateDoc(doc(db, 'families', A), { createdBy: 'bob' }));
    await assertFails(updateDoc(doc(db, 'families', A), { adminUid: 'bob' }));
    await assertFails(updateDoc(doc(db, 'families', A), { members: arrayUnion('mal') }));
    await assertFails(updateDoc(doc(db, 'families', A), { activeUsers: arrayUnion('mal') }));
    await assertFails(updateDoc(doc(db, 'families', A), { memberIds: arrayUnion('mal') }));
    await assertFails(updateDoc(doc(db, 'families', A), { members: arrayRemove('ldr') }));
  });

  test('ansatt kan ikke endre kontonummer, orgnr eller moduler; heller ikke en deaktivert', async () => {
    for (const uid of ['bob', 'eve', 'ldr']) {
      const db = as(uid);
      await assertFails(updateDoc(doc(db, 'families', A), { 'company.bankAccount': '1234.56.78903' }), uid);
      await assertFails(updateDoc(doc(db, 'families', A), { 'company.iban': 'NO9386011117947' }), uid);
      await assertFails(updateDoc(doc(db, 'families', A), { 'company.organisasjonsnummer': '111222333' }), uid);
      await assertFails(updateDoc(doc(db, 'families', A), { orgnr: '111222333' }), uid);
      await assertFails(updateDoc(doc(db, 'families', A), { 'company.modules': { disabled: ['hr'] } }), uid);
    }
  });

  test('tilgangsmatrisen: bare eier, administrator eller Admin på Tilgangsstyring – også uten speil', async () => {
    await assertFails(updateDoc(doc(as('bob'), 'families', A), { 'company.accessPolicy': { hacked: true } }));
    await assertFails(updateDoc(doc(as('ldr'), 'families', A), { 'company.accessPolicy': { hacked: true } }));
    await assertFails(updateDoc(doc(as('carl'), 'families', B), { 'company.accessPolicy': { hacked: true } }));
    await assertSucceeds(updateDoc(doc(as('kpf'), 'families', A), { 'company.accessPolicy': { v: 2 } }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'families', A), { 'company.accessPolicy': { v: 3 } }));
    await assertSucceeds(updateDoc(doc(as('ownB'), 'families', B), { 'company.accessPolicy': { v: 2 } }));
  });

  test('Admin på Selskapsinnstillinger og Modulinnstillinger gir det samme som i appen', async () => {
    const db = as('kpf');
    await assertSucceeds(updateDoc(doc(db, 'families', A), { 'company.bankAccount': '1234.56.78903', 'company.iban': 'NO93' }));
    await assertSucceeds(updateDoc(doc(db, 'families', A), { orgnr: '999888776', 'company.organisasjonsnummer': '999888776' }));
    await assertSucceeds(updateDoc(doc(db, 'families', A), { 'company.modules': { disabled: ['hr'] } }));
    // Men ikke medlemslistene eller administratorlisten.
    await assertFails(updateDoc(doc(db, 'families', A), { members: arrayUnion('mal') }));
    await assertFails(updateDoc(doc(db, 'families', A), { adminUids: arrayUnion('kpf') }));
  });

  test('vanlige endringer virker som før: navn, telefon, anbud og invitasjon på e-post', async () => {
    const db = as('bob');
    await assertSucceeds(updateDoc(doc(db, 'families', A), { name: 'Bygg AS', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, 'families', A), { 'company.telefon': '22334455', 'company.navn': 'Bygg AS' }));
    await assertSucceeds(updateDoc(doc(db, 'families', A), { cpvCodes: [], tenderWatch: { nationwide: true } }));
    await assertSucceeds(updateDoc(doc(db, 'families', A), { invitedEmails: arrayUnion('ny@firma.no') }));
  });

  test('modulvelkomst: bare Admin på Modulinnstillinger slår moduler av og på for hele bedriften (MENY-01)', async () => {
    const write = { moduleAccessInitialized: true, 'moduleAccess.notes': { state: 'active' } };
    // En ansatt (og Øverste leder med Lese) lagrer sin egen visning i stedet (users/{uid}/modulePrefs).
    await assertFails(updateDoc(doc(as('bob'), 'families', A), write));
    await assertFails(updateDoc(doc(as('ldr'), 'families', A), write));
    await assertSucceeds(updateDoc(doc(as('kpf'), 'families', A), write));
    await assertSucceeds(updateDoc(doc(as('adm'), 'families', A), write));
    // I en familie som før.
    await assertSucceeds(updateDoc(doc(as('mor'), 'families', F), write));
  });

  test('en kan melde seg selv ut, og føre seg selv opp bare med et aktivt medlemsdokument', async () => {
    await assertSucceeds(updateDoc(doc(as('bob'), 'families', A), {
      members: arrayRemove('bob'), activeUsers: arrayRemove('bob'), memberIds: arrayRemove('bob'),
    }));
    // ensureListedOnFamily: far har aktivt medlemsdokument i familien.
    await assertSucceeds(updateDoc(doc(as('far'), 'families', F), { members: arrayUnion('far'), activeUsers: arrayUnion('far') }));
    await assertFails(updateDoc(doc(as('mal'), 'families', F), { members: arrayUnion('mal') }));
    // Deaktivert medlemsdokument, men fortsatt i members: kan ikke føre seg selv opp i flere lister.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', F, 'parents', 'far'), { active: false }, { merge: true });
      await updateDoc(doc(ctx.firestore(), 'families', F), { activeUsers: ['mor', 'kid'] });
    });
    await assertFails(updateDoc(doc(as('far'), 'families', F), { activeUsers: arrayUnion('far') }));
    await assertSucceeds(updateDoc(doc(as('far'), 'families', F), { members: arrayRemove('far') }));
  });

  test('eier og administratorer styrer medlemslistene', async () => {
    await assertSucceeds(updateDoc(doc(as('adm'), 'families', A), { members: arrayRemove('eve'), activeUsers: arrayRemove('eve') }));
    await assertSucceeds(updateDoc(doc(as('own'), 'families', A), { members: arrayUnion('ny'), adminUids: arrayUnion('ldr') }));
    await assertFails(updateDoc(doc(as('adm'), 'families', A), { ownerUid: 'adm' }));
  });
});

describe('medlemsdokumentene (SEC-03, SEC-04)', () => {
  test('ansatt kan ikke gjøre seg selv til administrator eller gi seg en rolle', async () => {
    const db = as('bob');
    await assertFails(updateDoc(doc(db, 'families', A, 'parents', 'bob'), { admin: true, superAdmin: true }));
    await assertFails(updateDoc(doc(db, 'families', A, 'parents', 'bob'), { admin: true }));
    await assertFails(updateDoc(doc(db, 'families', A, 'parents', 'bob'), { staffRole: 'teacher' }));
    await assertFails(updateDoc(doc(db, 'families', A, 'parents', 'bob'), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'parents', 'bob'), { name: 'Bob B', photoURL: 'x', updatedAt: serverTimestamp() }));
    // EditProfileScreen skriver uid og active på eget aktive dokument.
    await assertSucceeds(setDoc(doc(db, 'families', A, 'parents', 'bob'), { uid: 'bob', active: true, phone: '9' }, { merge: true }));
  });

  test('et deaktivert medlem kan ikke gi seg selv tilgang tilbake', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', A, 'parents', 'eve'), { active: false, archived: true }, { merge: true });
    });
    const db = as('eve');
    await assertFails(updateDoc(doc(db, 'families', A, 'parents', 'eve'), { active: true, archived: false }));
    await assertFails(updateDoc(doc(db, 'families', A, 'parents', 'eve'), { active: true, deleted: false, leftAt: null }));
  });

  test('invitasjon (plassholder) i eget navn, uten tilgang og uten administrator', async () => {
    const placeholder = {
      uid: 'ninafirmano', name: 'Nina', email: 'nina@firma.no', familyId: A, createdBy: 'ldr',
      inviteStatus: 'pending', clientSendsInvite: true, active: false, placeholder: true, admin: false, superAdmin: false,
    };
    const db = as('ldr');
    await assertSucceeds(setDoc(doc(db, 'families', A, 'parents', 'ninafirmano'), placeholder, { merge: true }));
    await assertFails(setDoc(doc(db, 'families', A, 'parents', 'n2'), { ...placeholder, admin: true }));
    await assertFails(setDoc(doc(db, 'families', A, 'parents', 'n3'), { ...placeholder, createdBy: 'own' }));
    // Et aktivt medlemsdokument for en annen ville gitt personen tilgang.
    await assertFails(setDoc(doc(as('bob'), 'families', A, 'parents', 'mal'), { uid: 'mal', active: true, placeholder: false }));
    // Leveringsstatus og send på nytt (src/utils/groups.js) på en ventende plassholder.
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'parents', 'ninafirmano'), {
      inviteStatus: 'pending', inviteEmailSentAt: serverTimestamp(), inviteEmailTo: 'nina@firma.no', inviteEmailError: null,
    }));
    await assertSucceeds(updateDoc(doc(as('bob'), 'families', A, 'parents', 'ninafirmano'), {
      invitedAt: serverTimestamp(), inviteStatus: 'pending', placeholder: true, active: false,
    }));
    // Men ingen kan bytte e-posten på en annens invitasjon, eller gjøre den til admin.
    await assertFails(updateDoc(doc(as('bob'), 'families', A, 'parents', 'ninafirmano'), { email: 'bob2@firma.no' }));
    await assertFails(updateDoc(doc(as('bob'), 'families', A, 'parents', 'ninafirmano'), { admin: true }));
    await assertFails(updateDoc(doc(as('bob'), 'families', A, 'parents', 'ninafirmano'), { createdBy: 'own' }));
  });

  test('ansatt kan ikke endre eller slette en annens aktive medlemsdokument', async () => {
    await assertFails(updateDoc(doc(as('bob'), 'families', A, 'parents', 'ldr'), { deleted: true, active: false }));
    await assertFails(updateDoc(doc(as('bob'), 'families', A, 'parents', 'ldr'), { name: 'x' }));
    await assertFails(deleteDoc(doc(as('bob'), 'families', A, 'parents', 'ldr')));
  });

  test('eier og administrator styrer medlemsdokumentene; en ny gruppe lager eierens eget', async () => {
    await assertSucceeds(updateDoc(doc(as('own'), 'families', A, 'parents', 'bob'), { admin: true }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'families', A, 'parents', 'eve'), { active: false, leftAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(as('own'), 'families', A, 'parents', 'eve')));
    const db = as('ny');
    const batch = writeBatch(db);
    batch.set(doc(db, 'families', 'nyG'), { name: 'Ny', type: 'family', ownerUid: 'ny', adminUids: ['ny'], members: ['ny'] });
    batch.set(doc(db, 'families', 'nyG', 'parents', 'ny'), { uid: 'ny', admin: true, superAdmin: true, active: true });
    await assertSucceeds(batch.commit());
  });

  test('fremmed i egen gruppe kan lage et medlemsdokument for offeret, men det gir ingenting i offerets selskap', async () => {
    // PoC: forutsetningen for setMemberPassword. Gruppen er angriperens egen, så skrivingen er lov;
    // serveren krever nå at alle grupper offeret er med i styres av den som bytter passord.
    const mal = as('mal');
    await assertSucceeds(setDoc(doc(mal, 'families', 'M'), {
      name: 'M', type: 'company', ownerUid: 'mal', adminUids: ['mal'], members: ['mal'], activeUsers: ['mal'], invitedEmails: [],
    }));
    await assertSucceeds(setDoc(doc(mal, 'families', 'M', 'parents', 'own'), { uid: 'own', active: true }));
    await assertFails(getDoc(doc(mal, 'families', A, 'employees', 'emp_own')));
  });
});

describe('invitasjoner (SEC-04)', () => {
  const invite = (over = {}) => ({
    status: 'pending', inviteKind: 'existing', inviteeUid: 'bob', inviteeEmail: 'bob@firma.no',
    invitedBy: 'bob', asAdmin: false, familyId: A, groupType: 'company', ...over,
  });

  test('ansatt kan ikke lage en administratorinvitasjon «fra eieren»', async () => {
    const db = as('bob');
    await assertFails(setDoc(doc(db, 'families', A, 'memberInvites', 'x1'), invite({ asAdmin: true, invitedBy: 'own' })));
    await assertFails(setDoc(doc(db, 'families', A, 'memberInvites', 'x2'), invite({ invitedBy: 'own' })));
    await assertFails(setDoc(doc(db, 'families', A, 'memberInvites', 'x3'), invite({ asAdmin: true })));
    await assertSucceeds(setDoc(doc(db, 'families', A, 'memberInvites', 'x4'), invite({ inviteeUid: 'eve2' })));
  });

  test('invitasjonen til en eksisterende bruker (inviteExistingAdult) virker for den som inviterer', async () => {
    for (const [uid, asAdmin] of [['ldr', false], ['own', true]]) {
      const db = as(uid);
      const id = `inv_${uid}`;
      const payload = invite({ inviteeUid: 'mal', inviteeEmail: 'mal@firma.no', invitedBy: uid, asAdmin });
      const batch = writeBatch(db);
      batch.set(doc(db, 'families', A, 'memberInvites', id), payload);
      batch.set(doc(db, 'families', A, 'parents', 'mal'), {
        uid: 'mal', familyId: A, createdBy: uid, inviteStatus: 'pending', inviteKind: 'existing', inviteId: id,
        active: false, placeholder: true, admin: asAdmin, superAdmin: false, deleted: false, archived: false,
      }, { merge: true });
      batch.set(doc(db, 'users', 'mal', 'familyInvites', id), { ...payload, inviteId: id }, { merge: true });
      await assertSucceeds(batch.commit(), uid);
    }
    await assertSucceeds(getDoc(doc(as('mal'), 'families', A, 'memberInvites', 'inv_ldr')));
  });

  test('REV-16: ny invitasjon til en tidligere ansatt (eksisterende bruker) fra HR, ikke administrator', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      // Medlemsdokumentet etter at ansettelsen ble avsluttet (removeMembership). Laget av eieren.
      await setDoc(doc(ctx.firestore(), 'families', A, 'parents', 'gammel'), {
        uid: 'gammel', email: 'gammel@firma.no', familyId: A, createdBy: 'own', active: false, admin: false,
        placeholder: false, inviteStatus: 'accepted', leftAt: '2026-09-01T10:00:00.000Z', leftReason: 'ended', endedBy: 'own',
      });
    });
    const db = as('hr');
    const id = 'inv_gammel';
    const payload = invite({ inviteeUid: 'gammel', inviteeEmail: 'gammel@firma.no', invitedBy: 'hr', matchedBy: 'email' });
    const batch = writeBatch(db);
    batch.set(doc(db, 'families', A, 'memberInvites', id), payload);
    // Det inviteExistingAdult skriver (src/utils/groups.js).
    batch.set(doc(db, 'families', A, 'parents', 'gammel'), {
      uid: 'gammel', name: 'Gammel', email: 'gammel@firma.no', phone: '', username: '', usernameLower: '',
      photoURL: '', avatarId: null, familyId: A, createdBy: 'hr', createdAt: serverTimestamp(), invitedAt: serverTimestamp(),
      inviteStatus: 'pending', inviteKind: 'existing', inviteId: id, active: false, emailVerified: true,
      placeholder: true, admin: false, superAdmin: false, deleted: false, archived: false, adultRole: 'parent', isGrandparent: false,
    }, { merge: true });
    batch.set(doc(db, 'users', 'gammel', 'familyInvites', id), { ...payload, inviteId: id }, { merge: true });
    await assertSucceeds(batch.commit());
  });

  test('REV-16: et medlem legger en plassholder en annen har laget, på nytt i eget navn', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore();
      await updateDoc(doc(fs, 'families', F), { members: ['mor', 'far', 'kid'], activeUsers: ['mor', 'far', 'kid'] });
      // Ventende plassholder for bestemor laget av mor (eldre, uten telefonfelt).
      await setDoc(doc(fs, 'families', F, 'parents', 'ph_bestemor'), {
        uid: 'ph_bestemor', email: 'bm@x.no', placeholder: true, inviteStatus: 'pending', active: false, createdBy: 'mor',
        admin: false, adultRole: 'grandparent', isGrandparent: true,
      });
    });
    const far = as('far');
    // inviteAdult med samme e-post (deterministisk nøkkel og merge).
    const again = {
      uid: 'ph_bestemor', name: 'Bestemor', email: 'bm@x.no', phone: '', familyId: F, createdBy: 'far',
      createdAt: serverTimestamp(), invitedAt: serverTimestamp(), inviteStatus: 'pending', clientSendsInvite: true,
      active: false, emailVerified: false, placeholder: true, admin: false, superAdmin: false,
      deleted: false, archived: false, adultRole: 'grandparent', isGrandparent: true,
    };
    await assertSucceeds(setDoc(doc(far, 'families', F, 'parents', 'ph_bestemor'), again, { merge: true }));
    // Men ikke som administrator, ikke i en annens navn, ikke med ny e-post og ikke med rolle.
    await assertFails(setDoc(doc(far, 'families', F, 'parents', 'ph_bestemor'), { ...again, admin: true, adultRole: 'parent', isGrandparent: false }, { merge: true }));
    await assertFails(setDoc(doc(far, 'families', F, 'parents', 'ph_bestemor'), { ...again, createdBy: 'mor2' }, { merge: true }));
    await assertFails(setDoc(doc(far, 'families', F, 'parents', 'ph_bestemor'), { ...again, email: 'annen@x.no' }, { merge: true }));
    await assertFails(setDoc(doc(far, 'families', F, 'parents', 'ph_bestemor'), { ...again, staffRole: 'teacher' }, { merge: true }));
    await assertFails(setDoc(doc(far, 'families', F, 'parents', 'ph_bestemor'), { ...again, superAdmin: true }, { merge: true }));
    // En administratorinvitasjon uten e-post (bare telefon) kan ikke få en e-post fra et medlem:
    // syncMyInvites kobler plassholderen på e-posten.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', F, 'parents', 'ph_onkel'), {
        uid: 'ph_onkel', email: '', phone: '+4799887766', placeholder: true, inviteStatus: 'pending', active: false,
        createdBy: 'mor', admin: true,
      });
    });
    await assertFails(updateDoc(doc(far, 'families', F, 'parents', 'ph_onkel'), { email: 'far2@x.no' }));
    // Et aktivt medlemsdokument kan ikke legges på nytt (det ville endret en annens medlemskap).
    await assertFails(setDoc(doc(far, 'families', F, 'parents', 'mor'), { createdBy: 'far', inviteStatus: 'pending', placeholder: true, active: false }, { merge: true }));
  });

  test('svaret skrives av serveren: ingen kan merke invitasjonen godtatt eller bytte avsender', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', A, 'memberInvites', 'i1'), invite({ inviteeUid: 'mal', invitedBy: 'ldr' }));
    });
    await assertFails(updateDoc(doc(as('ldr'), 'families', A, 'memberInvites', 'i1'), { status: 'accepted' }));
    await assertFails(updateDoc(doc(as('ldr'), 'families', A, 'memberInvites', 'i1'), { invitedBy: 'own' }));
    await assertFails(updateDoc(doc(as('ldr'), 'families', A, 'memberInvites', 'i1'), { asAdmin: true }));
    await assertFails(updateDoc(doc(as('bob'), 'families', A, 'memberInvites', 'i1'), { status: 'cancelled' }));
    await assertSucceeds(updateDoc(doc(as('ldr'), 'families', A, 'memberInvites', 'i1'), { status: 'cancelled' }));
  });
});

describe('ansatte (SEC-04, FL-01)', () => {
  test('ansatt lager ikke en post med administratornivå i invitasjonen eller med lederroller for andre', async () => {
    const db = as('bob');
    await assertFails(setDoc(doc(db, 'families', A, 'employees', 'emp_x'), {
      personUid: '', person: { email: 'bob@firma.no' }, company: { accessLevels: [], status: 'active' },
      invite: { status: 'sent', email: 'bob@firma.no', accessLevel: 'administrator' },
    }));
    await assertFails(setDoc(doc(db, 'families', A, 'employees', 'emp_y'), {
      personUid: 'bob2', company: { accessLevels: ['hr_ansvarlig', 'avdelingsleder', 'hms_ansvarlig'], status: 'active' },
    }));
    await assertFails(setDoc(doc(db, 'families', A, 'employees', 'emp_z'), {
      personUid: 'bob', company: { accessLevels: ['ansatt'] }, invite: { accessLevel: 'leder' },
    }));
    // En vanlig post kan alle medlemmer fortsatt lage.
    await assertSucceeds(setDoc(doc(db, 'families', A, 'employees', 'emp_v'), {
      personUid: '', person: { firstName: 'Vikar' }, company: { accessLevels: ['ansatt'], status: 'active' },
    }));
  });

  test('ansatt kaprer ikke administratorens post, verken med acceptedUid, personUid eller e-post', async () => {
    const db = as('bob');
    await assertFails(updateDoc(doc(db, 'families', A, 'employees', 'emp_own'), { 'invite.acceptedUid': 'bob' }));
    await assertFails(updateDoc(doc(db, 'families', A, 'employees', 'emp_own'), { personUid: 'bob' }));
    // Ventende administratorinvitasjon: e-posten styrer hvem som kobles når invitasjonen godtas.
    await assertFails(updateDoc(doc(db, 'families', A, 'employees', 'emp_nyadm'), { 'person.email': 'bob@firma.no' }));
    await assertFails(updateDoc(doc(db, 'families', A, 'employees', 'emp_nyadm'), { 'invite.email': 'bob@firma.no' }));
    // Øverste leder kan ikke røre en administratorpost; administrator kan.
    await assertFails(updateDoc(doc(as('ldr'), 'families', A, 'employees', 'emp_nyadm'), { 'invite.email': 'ldr@firma.no' }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'families', A, 'employees', 'emp_nyadm'), { 'invite.email': 'nina.b@firma.no' }));
  });

  test('sletting krever Admin på Ansatte, og en administratorpost bare administrator', async () => {
    await assertFails(deleteDoc(doc(as('bob'), 'families', A, 'employees', 'emp_own')));
    await assertFails(deleteDoc(doc(as('avd'), 'families', A, 'employees', 'emp_bob')));
    await assertFails(deleteDoc(doc(as('hr'), 'families', A, 'employees', 'emp_adm')));
    await assertSucceeds(deleteDoc(doc(as('hr'), 'families', A, 'employees', 'emp_bob')));
    await assertSucceeds(deleteDoc(doc(as('adm'), 'families', A, 'employees', 'emp_ldr')));
  });

  test('deaktivert ansatt kan ikke aktivere seg selv, og ingen kan løse seg fra egen post', async () => {
    const eve = as('eve');
    await assertFails(updateDoc(doc(eve, 'families', A, 'employees', 'emp_eve'), { 'company.status': 'active', 'company.canLogin': true }));
    await assertFails(updateDoc(doc(eve, 'families', A, 'employees', 'emp_eve'), { 'company.canLogin': true }));
    await assertFails(updateDoc(doc(eve, 'families', A, 'employees', 'emp_eve'), { personUid: '' }));
    await assertFails(updateDoc(doc(as('bob'), 'families', A, 'employees', 'emp_bob'), { 'invite.status': 'none' }));
    await assertFails(updateDoc(doc(as('bob'), 'families', A, 'employees', 'emp_bob'), { personUid: '' }));
    // Andre felt på egen post kan fortsatt redigeres.
    await assertSucceeds(updateDoc(doc(eve, 'families', A, 'employees', 'emp_eve'), { 'person.phone': '99887766' }));
    await assertSucceeds(updateDoc(doc(as('bob'), 'families', A, 'employees', 'emp_bob'), { 'person.firstName': 'Bob', 'company.accessLevels': ['ansatt'] }));
  });

  test('avslutte og ta opp igjen en ansettelse krever Admin på Ansatte eller Tilgangsstyring, som appen og serveren (REV-21)', async () => {
    const post = (uid, id) => doc(as(uid), 'families', A, 'employees', id);
    await assertFails(updateDoc(post('bob', 'emp_eve'), { 'company.status': 'active' }));
    await assertFails(updateDoc(post('bob', 'emp_ldr'), { 'company.status': 'inactive', 'company.canLogin': false }));
    // Begrenset redigering på Ansatte (avdelingsleder): ikke deaktivere, legge i papirkurven, aktivere
    // eller sette en sluttdato som er passert.
    await assertFails(updateDoc(post('avd', 'emp_bob'), { 'company.status': 'inactive', 'company.canLogin': false }));
    await assertFails(updateDoc(post('avd', 'emp_bob'), { 'company.status': 'deleted' }));
    await assertFails(updateDoc(post('avd', 'emp_eve'), { 'company.status': 'active', 'company.canLogin': true }));
    await assertFails(updateDoc(post('avd', 'emp_bob'), { 'company.periodTo': '2020-01-31' }));
    // Permisjon, innlogging og en sluttdato fram i tid som før (også i eldre apper).
    await assertSucceeds(updateDoc(post('avd', 'emp_bob'), { 'company.status': 'leave' }));
    await assertSucceeds(updateDoc(post('avd', 'emp_bob'), { 'company.periodTo': '2099-12-31' }));
    await assertSucceeds(updateDoc(post('avd', 'emp_bob'), { 'company.canLogin': false }));
    await assertSucceeds(updateDoc(post('avd', 'emp_bob'), { 'company.status': 'active', 'company.canLogin': true }));
    // Admin på Ansatte (HR, leder), Admin på Tilgangsstyring og administrator.
    await assertSucceeds(updateDoc(post('hr', 'emp_bob'), { 'company.status': 'inactive', 'company.canLogin': false }));
    await assertSucceeds(updateDoc(post('kpf', 'emp_bob'), { 'company.status': 'active' }));
    await assertSucceeds(updateDoc(post('ldr', 'emp_bob'), { 'company.periodTo': '2020-01-31' }));
    await assertFails(updateDoc(post('avd', 'emp_bob'), { 'company.periodTo': '' }));
    await assertSucceeds(updateDoc(post('adm', 'emp_eve'), { 'company.status': 'active', 'company.canLogin': true }));
  });

  test('invitasjon og ledernivå på andres post: leder kan opp til eget nivå, uten speil bare eier og administrator', async () => {
    const ldr = as('ldr');
    await assertSucceeds(updateDoc(doc(ldr, 'families', A, 'employees', 'emp_free'), {
      'invite.status': 'sent', 'invite.email': 'non@firma.no', 'invite.parentKey': 'nonfirmano',
    }));
    await assertSucceeds(setDoc(doc(ldr, 'families', A, 'employees', 'emp_ny_leder'), {
      personUid: '', person: { email: 'ny@firma.no' }, company: { accessLevels: ['leder'], status: 'active' },
      invite: { status: 'sent', email: 'ny@firma.no' },
    }));
    await assertFails(setDoc(doc(ldr, 'families', A, 'employees', 'emp_ny_adm'), {
      personUid: '', company: { accessLevels: ['administrator'], status: 'active' },
    }));
    // Selskap uten speil: et medlem kan ikke gi andre ledernivå (tidligere kunne alle).
    await assertFails(setDoc(doc(as('carl'), 'families', B, 'employees', 'e1'), {
      personUid: 'venn', company: { accessLevels: ['leder'], status: 'active' },
    }));
    await assertSucceeds(setDoc(doc(as('carl'), 'families', B, 'employees', 'e2'), {
      personUid: 'venn', company: { accessLevels: ['ansatt'], status: 'active' },
    }));
    await assertSucceeds(setDoc(doc(as('ownB'), 'families', B, 'employees', 'e3'), {
      personUid: 'carl', company: { accessLevels: ['leder'], status: 'active' },
    }));
  });

  test('Gjenopprett min profil: en ukoblet vanlig post kan knyttes til en selv, en lederpost ikke', async () => {
    const db = as('non');
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'employees', 'emp_free'), { personUid: 'non' }));
    await assertFails(updateDoc(doc(db, 'families', A, 'employees', 'emp_nyadm'), { personUid: 'non' }));
    await assertFails(updateDoc(doc(db, 'families', A, 'employees', 'emp_bob'), { personUid: 'non' }));
  });
});

describe('foresatte (SEC-05)', () => {
  test('fremmed blir ikke «foresatt» for en voksen og får ikke users/{voksen}', async () => {
    const mal = as('mal');
    await assertSucceeds(setDoc(doc(mal, 'families', 'M'), {
      name: 'M', type: 'family', ownerUid: 'mal', adminUids: ['mal'], members: ['mal'], activeUsers: ['mal'], invitedEmails: [],
    }));
    await assertSucceeds(setDoc(doc(mal, 'families', 'M', 'parents', 'mal'), { uid: 'mal', active: true }));
    await assertFails(setDoc(doc(mal, 'children', 'own'), { uid: 'own', familyId: 'M' }));
    await assertFails(getDoc(doc(mal, 'users', 'own')));
    await assertFails(updateDoc(doc(mal, 'users', 'own'), { email: 'mal@evil.example' }));
    // Også med et gammelt children-dokument: profilen er ikke et barn.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'children', 'own'), { uid: 'own', familyId: 'M' });
    });
    await assertFails(getDoc(doc(mal, 'users', 'own')));
    await assertFails(setDoc(doc(mal, 'users', 'own'), { notificationPrefs: { all: { email: true } } }, { merge: true }));
    await assertFails(getDoc(doc(mal, 'users', 'own', 'notifications', 'n1')));
  });

  test('foresatt lager og steller barnets profil som før (addChildMember)', async () => {
    const mor = as('mor');
    const child = { uid: 'kid2', name: 'Lille', familyId: F, role: 'child', active: true };
    await assertSucceeds(setDoc(doc(mor, 'families', F, 'children', 'kid2'), child, { merge: true }));
    await assertSucceeds(setDoc(doc(mor, 'children', 'kid2'), child, { merge: true }));
    await assertSucceeds(setDoc(doc(mor, 'users', 'kid2'), { uid: 'kid2', role: 'child', displayName: 'Lille' }, { merge: true }));
    await assertSucceeds(updateDoc(doc(mor, 'users', 'kid'), { notificationPrefs: { chores: true } }));
    await assertSucceeds(getDoc(doc(mor, 'users', 'kid')));
    // En voksen kan ikke legges inn som barn for å få profilen, heller ikke en voksen uten egen e-post.
    await assertFails(setDoc(doc(mor, 'children', 'far'), { uid: 'far', familyId: F }));
    await assertFails(setDoc(doc(mor, 'children', 'besta'), { uid: 'besta', familyId: F }));
    await assertFails(setDoc(doc(mor, 'users', 'mal'), { role: 'child' }, { merge: true }));
    // Et eldre barn med brukernavn-konto og uten rolle kan fortsatt få speilprofil.
    await assertSucceeds(setDoc(doc(mor, 'children', 'gammelkid'), { uid: 'gammelkid', familyId: F }));
    await assertSucceeds(getDoc(doc(mor, 'users', 'gammelkid')));
  });
});

describe('gruppekoder (SEC-18)', () => {
  test('en annen gruppes kode kan ikke kapres; egen kode kan lages og holdes i synk', async () => {
    const mal = as('mal');
    await assertSucceeds(setDoc(doc(mal, 'families', 'M'), {
      name: 'M', type: 'team', ownerUid: 'mal', adminUids: ['mal'], members: ['mal'], activeUsers: ['mal'], invitedEmails: [], joinCode: 'MALM1234',
    }));
    await assertFails(setDoc(doc(mal, 'joinCodes', 'TEAM1234'), { code: 'TEAM1234', familyId: 'M', type: 'team' }));
    await assertFails(setDoc(doc(mal, 'joinCodes', 'TEAM1234'), { familyId: 'M' }, { merge: true }));
    await assertFails(deleteDoc(doc(mal, 'joinCodes', 'TEAM1234')));
    await assertSucceeds(setDoc(doc(mal, 'joinCodes', 'MALM1234'), { code: 'MALM1234', familyId: 'M', type: 'team' }));
    await assertSucceeds(setDoc(doc(mal, 'joinCodes', 'MALM1234'), { code: 'MALM1234', familyId: 'M', type: 'team', updatedAt: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(mal, 'joinCodes', 'FEIL1234'), { code: 'ANNEN123', familyId: 'M', type: 'team' }));
    await assertSucceeds(deleteDoc(doc(as('carl'), 'joinCodes', 'TEAM1234')));
  });
});

describe('tilgangsspeilet er skrivebeskyttet for klienter', () => {
  test('bare eieren kan skrive speilet (reserve); medlemmer leser sitt eget', async () => {
    await assertFails(setDoc(doc(as('bob'), 'families', A, 'accessAcl', 'bob'), { levelId: 'administrator', grants: { accessControl: 'write' }, expiresAt: FUTURE }));
    await assertFails(updateDoc(doc(as('adm'), 'families', A, 'accessAcl', 'adm'), { iso: 3 }));
    await assertSucceeds(getDoc(doc(as('bob'), 'families', A, 'accessAcl', 'bob')));
    await assertSucceeds(setDoc(doc(as('own'), 'families', A, 'accessAcl', 'non'), { uid: 'non', iso: 1, expiresAt: FUTURE }));
  });
});
