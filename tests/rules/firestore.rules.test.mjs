/**
 * Sikkerhetstester for Firestore-reglene, kjørt direkte mot Firestore-emulatoren
 * (ikke gjennom appen). Kjøres i CI:
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test tests/rules/"
 *
 * Brukertyper (krav B): kun lesetilgang, melder av eget avvik, saksbehandler med begrenset
 * redigering, ISO-administrator uten særskilt HMS-tilgang, autorisert behandler av skjermede
 * saker, bruker i et annet selskap, bruker uten gyldig tilgang (mangler/utløpt speil, ikke
 * innlogget) – i tillegg eier, tilbaketrekking og regresjon for eksisterende moduler.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';

const A = 'companyA';
const B = 'companyB';
const FUTURE = Timestamp.fromMillis(Date.now() + 6 * 3600 * 1000);
const PAST = Timestamp.fromMillis(Date.now() - 3600 * 1000);

const USERS = {
  own: { iso: 3, grants: { iso: 'delete', accessControl: 'delete' } }, // eier
  les: { iso: 1, grants: { iso: 'see', accessControl: 'none' } }, // ansatt, kun lese
  mel: { iso: 1, grants: { iso: 'see', accessControl: 'none' } }, // melder eget avvik
  beh: { iso: 2, grants: { iso: 'read', accessControl: 'none' } }, // saksbehandler
  adm: { iso: 3, grants: { iso: 'write', accessControl: 'write' }, levelId: 'administrator' }, // ISO-admin, ikke HMS-tilgang
  kv: { iso: 2, grants: { iso: 'read', accessControl: 'none' } }, // kvalitetsleder: begrenset redigering + godkjennerrolle
  ldr: { iso: 3, grants: { iso: 'write', accessControl: 'read', companyProfile: 'see' }, levelId: 'leder' }, // øverste leder
  hms: { iso: 3, grants: { iso: 'write', accessControl: 'none' } }, // autorisert for skjermede saker
  exp: { iso: 3, grants: { iso: 'write' }, expired: true }, // utløpt speil
};

let env;

function as(uid) {
  return env.authenticatedContext(uid).firestore();
}

function anon() {
  return env.unauthenticatedContext().firestore();
}

const finding = (over = {}) => ({
  number: 'AVV-1', type: 'prosess', title: 'Feil', description: 'x', state: 'registrert', restricted: false,
  reportedByUid: 'mel', reportedAt: '2026-10-22T10:00:00Z', actions: [], history: [], rev: 1, involvedUids: ['mel'], ...over,
});

/** Leser et dokument uten regler (withSecurityRulesDisabled returnerer ikke verdier). */
async function adminRead(...path) {
  let out;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(doc(ctx.firestore(), ...path));
    out = snap.exists() ? snap.data() : undefined;
  });
  return out;
}

const closable = (over = {}) => ({
  state: 'lukket', triage: { severity: 'lav' }, assessment: { correctiveRequired: false, rationale: 'Engangshendelse uten risiko.' },
  closeNote: 'Lukket etter vurdering', closedByUid: 'adm', closedAt: '2026-10-22', effect: { required: false }, rev: 2, ...over,
});

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'families', A), {
      name: 'Rådgiver AS', type: 'company', ownerUid: 'own', adminUids: ['own'],
      members: ['own', 'les', 'mel', 'beh', 'adm', 'hms', 'non', 'exp', 'kv', 'ldr'],
      company: { navn: 'Rådgiver AS', accessPolicy: { v: 1 } },
    });
    await setDoc(doc(db, 'families', B), { name: 'Annet AS', type: 'company', ownerUid: 'ext', members: ['ext'] });
    for (const [uid, u] of Object.entries(USERS)) {
      await setDoc(doc(db, 'families', A, 'accessAcl', uid), { uid, iso: u.iso, grants: u.grants, levelId: u.levelId || '', expiresAt: u.expired ? PAST : FUTURE });
    }
    await setDoc(doc(db, 'families', B, 'accessAcl', 'ext'), { uid: 'ext', iso: 3, grants: { iso: 'delete' }, expiresAt: FUTURE });
    await setDoc(doc(db, 'families', A, 'isoRestricted', 'main'), { uids: ['hms'], people: [{ uid: 'hms', name: 'HMS-leder' }], rev: 1 });
    await setDoc(doc(db, 'families', A, 'isoSystem', 'main'), { name: 'KS', standards: ['ISO9001'], rev: 1, approverUids: ['kv'] });
    await setDoc(doc(db, 'families', A, 'isoFindings', 'F1'), finding());
    await setDoc(doc(db, 'families', A, 'isoFindings', 'F2'), finding({ number: 'AVV-2', state: 'triage', triage: { severity: 'lav' } }));
    await setDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R1'), finding({ number: 'HMS-1', type: 'hms', restricted: true, personalDetails: 'Ola, kutt i hånd' }));
    await setDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R2'), finding({ number: 'HMS-2', type: 'hms', restricted: true, reportedByUid: 'beh2', involvedUids: ['beh2'] }));
    await setDoc(doc(db, 'families', A, 'isoProcesses', 'P1'), {
      title: 'Avvik', publishedVersion: 1, archived: false, rev: 3,
      versions: [{ version: 1, state: 'publisert', diagram: { nodes: [1] } }, { version: 2, state: 'utkast', diagram: { nodes: [1, 2] } }],
    });
    await setDoc(doc(db, 'families', A, 'isoDocuments', 'D1'), {
      code: 'DOK-1', title: 'Policy', publishedRevision: 1, archived: false, rev: 2, readAcks: [],
      revisions: [{ revision: 1, state: 'publisert', body: 'Tekst' }],
    });
    await setDoc(doc(db, 'families', A, 'isoForms', 'FR1'), { templateId: 'iso_sf12_sja', publishedVersion: 1, versions: [{ version: 1 }], rev: 1 });
    await setDoc(doc(db, 'families', A, 'isoSubmissions', 'S1'), {
      formId: 'FR1', formVersion: 1, formHash: 'h', templateId: 'iso_sf12_sja', submittedAt: '2026-10-22', submittedBy: 'Mel',
      submittedByUid: 'mel', locked: true, answers: { a: 'x' }, corrections: [],
    });
    await setDoc(doc(db, 'families', A, 'isoRecords', 'REC1'), { register: 'revisjon', title: 'Revisjon', locked: true, state: 'godkjent', rev: 1 });
    await setDoc(doc(db, 'families', A, 'isoRecords', 'REC2'), { register: 'risiko', title: 'Risiko', locked: false, state: 'aktiv', rev: 1 });
    await setDoc(doc(db, 'families', A, 'isoAudit', 'E1'), { actorUid: 'adm', entityId: 'F1', action: 'iso.finding.created' });
    await setDoc(doc(db, 'families', A, 'isoAuditRestricted', 'E2'), { actorUid: 'hms', entityId: 'R1', action: 'iso.finding.created' });
    await setDoc(doc(db, 'families', A, 'isoAssessments', 'V1'), { requirementId: 'r1', status: 'ikke_vurdert', rev: 1 });
    await setDoc(doc(db, 'families', A, 'isoAssessments', 'V2'), { requirementId: 'r2', status: 'oppfylt', rev: 1 });
    // Eksisterende moduler
    await setDoc(doc(db, 'families', A, 'parentTodos', 'T1'), { title: 'Oppgave', done: false });
    await setDoc(doc(db, 'families', A, 'projects', 'PR1'), { name: 'Skole' });
    await setDoc(doc(db, 'families', A, 'hr', 'main'), { contracts: [] });
    await setDoc(doc(db, 'families', A, 'employees', 'EMP1'), { personUid: 'les', company: { accessLevel: 'ansatt' } });
    await setDoc(doc(db, 'families', A, 'employees', 'EMP2'), { personUid: 'mel', company: { accessLevel: 'ansatt', accessLevels: ['ansatt'], accessOverrides: {} } });
    await setDoc(doc(db, 'families', A, 'employees', 'EMPADM'), { personUid: 'adm', company: { accessLevel: 'administrator', accessLevels: ['administrator'], accessOverrides: {} } });
    await setDoc(doc(db, 'families', A, 'employees', 'EMPLDR'), { personUid: 'ldr', company: { accessLevel: 'leder', accessLevels: ['leder'], accessOverrides: {} } });
    await setDoc(doc(db, 'families', A, 'employees', 'EMPFREE'), { personUid: '', company: { accessLevel: 'leder', accessLevels: ['leder'], accessOverrides: {} } });
    await setDoc(doc(db, 'families', A, 'shoppingLists', 'L1'), { memberIds: ['les'], items: [] });
    await setDoc(doc(db, 'families', B, 'isoFindings', 'FB'), finding({ reportedByUid: 'ext' }));
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

describe('selskapsisolasjon og ugyldig tilgang', () => {
  test('bruker i et annet selskap får verken lese eller skrive ISO-data', async () => {
    const db = as('ext');
    await assertFails(getDoc(doc(db, 'families', A, 'isoFindings', 'F1')));
    await assertFails(getDocs(collection(db, 'families', A, 'isoFindings')));
    await assertFails(setDoc(doc(db, 'families', A, 'isoFindings', 'X'), finding({ reportedByUid: 'ext' })));
    await assertFails(getDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R1')));
    await assertFails(getDoc(doc(db, 'families', A, 'hr', 'main')));
    await assertSucceeds(getDoc(doc(db, 'families', B, 'isoFindings', 'FB')));
  });

  test('ikke innlogget: ingen tilgang', async () => {
    const db = anon();
    await assertFails(getDoc(doc(db, 'families', A, 'isoFindings', 'F1')));
    await assertFails(getDoc(doc(db, 'families', A)));
    await assertFails(getDoc(doc(db, 'families', A, 'parentTodos', 'T1')));
  });

  test('medlem uten speilet tilgang får ingen ISO-tilgang (fail-closed), men andre moduler virker som før', async () => {
    const db = as('non');
    await assertFails(getDoc(doc(db, 'families', A, 'isoFindings', 'F1')));
    await assertFails(getDoc(doc(db, 'families', A, 'isoSystem', 'main')));
    // Meldetilgang (ISO-04): alle i selskapet kan melde en ny sak i eget navn, men ikke mer.
    await assertSucceeds(setDoc(doc(db, 'families', A, 'isoFindings', 'N1'), finding({ reportedByUid: 'non', state: 'registrert', triage: null, assessment: null, actions: [] })));
    await assertFails(setDoc(doc(db, 'families', A, 'isoFindings', 'N2'), finding({ reportedByUid: 'non', state: 'triage' })));
    await assertFails(getDoc(doc(db, 'families', A, 'isoFindings', 'F1')), 'ikke andres saker');
    await assertSucceeds(getDoc(doc(db, 'families', A, 'parentTodos', 'T1')));
    await assertSucceeds(setDoc(doc(db, 'families', A, 'projects', 'PR2'), { name: 'Nytt' }));
  });

  test('utløpt speil gir ingen tilgang', async () => {
    const db = as('exp');
    await assertFails(getDoc(doc(db, 'families', A, 'isoFindings', 'F1')));
    await assertFails(getDocs(collection(db, 'families', A, 'isoProcesses')));
  });

  test('ingen kan skrive tilgangsspeilet eller lese andres, bortsett fra eier', async () => {
    await assertFails(setDoc(doc(as('les'), 'families', A, 'accessAcl', 'les'), { iso: 3, expiresAt: FUTURE }));
    await assertFails(updateDoc(doc(as('adm'), 'families', A, 'accessAcl', 'adm'), { iso: 3 }));
    await assertFails(setDoc(doc(as('non'), 'families', A, 'accessAcl', 'non'), { iso: 3, expiresAt: FUTURE }));
    await assertFails(getDoc(doc(as('les'), 'families', A, 'accessAcl', 'adm')));
    await assertSucceeds(getDoc(doc(as('les'), 'families', A, 'accessAcl', 'les')));
    await assertFails(getDocs(collection(as('adm'), 'families', A, 'accessAcl')));
    await assertSucceeds(setDoc(doc(as('own'), 'families', A, 'accessAcl', 'non'), { uid: 'non', iso: 1, expiresAt: FUTURE }));
    await assertSucceeds(getDocs(collection(as('own'), 'families', A, 'accessAcl')));
  });

  test('ukjente iso-samlinger er stengt også for medlemmer', async () => {
    await assertFails(setDoc(doc(as('adm'), 'families', A, 'isoSomethingNew', 'x'), { a: 1 }));
    await assertFails(getDoc(doc(as('adm'), 'families', A, 'isoSomethingNew', 'x')));
  });
});

describe('ansatt med kun lesetilgang', () => {
  test('leser åpne data, kan ikke endre styrende innhold', async () => {
    const db = as('les');
    await assertSucceeds(getDoc(doc(db, 'families', A, 'isoFindings', 'F1')));
    await assertSucceeds(getDocs(collection(db, 'families', A, 'isoProcesses')));
    await assertSucceeds(getDoc(doc(db, 'families', A, 'isoSystem', 'main')));
    await assertFails(updateDoc(doc(db, 'families', A, 'isoProcesses', 'P1'), { title: 'Endret' }));
    await assertFails(setDoc(doc(db, 'families', A, 'isoSystem', 'main'), { name: 'X' }));
    await assertFails(setDoc(doc(db, 'families', A, 'isoRecords', 'NEW'), { register: 'risiko', title: 'x' }));
    await assertFails(updateDoc(doc(db, 'families', A, 'isoFindings', 'F1'), { state: 'triage', rev: 2 }));
    await assertFails(setDoc(doc(db, 'families', A, 'isoRestricted', 'main'), { uids: ['les'] }));
  });

  test('ser ikke skjermede saker, verken enkeltvis eller i lister', async () => {
    const db = as('les');
    await assertFails(getDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R1')));
    await assertFails(getDocs(collection(db, 'families', A, 'isoFindingsRestricted')));
    await assertFails(getDocs(collection(db, 'families', A, 'isoAuditRestricted')));
    await assertSucceeds(getDocs(query(collection(db, 'families', A, 'isoFindingsRestricted'), where('reportedByUid', '==', 'les'))));
  });

  test('kan kvittere for lesing av eget dokument, ikke på vegne av andre', async () => {
    const db = as('les');
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'isoDocuments', 'D1'), { readAcks: [{ uid: 'les', revision: 1 }], rev: 3 }));
    await assertFails(updateDoc(doc(db, 'families', A, 'isoDocuments', 'D1'), { readAcks: [{ uid: 'les', revision: 1 }, { uid: 'adm', revision: 1 }], rev: 4 }));
  });
});

describe('ansatt som melder eget avvik', () => {
  test('kan melde åpen og skjermet sak i eget navn, ikke i andres eller som lukket', async () => {
    const db = as('mel');
    await assertSucceeds(setDoc(doc(db, 'families', A, 'isoFindings', 'M1'), finding({ number: 'AVV-9' })));
    await assertFails(setDoc(doc(db, 'families', A, 'isoFindings', 'M2'), finding({ reportedByUid: 'beh' })));
    await assertFails(setDoc(doc(db, 'families', A, 'isoFindings', 'M3'), finding({ state: 'lukket' })));
    await assertFails(setDoc(doc(db, 'families', A, 'isoFindings', 'M4'), finding({ restricted: true })));
    await assertSucceeds(setDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'M5'), finding({ restricted: true, type: 'hms' })));
  });

  test('ser egen skjermet sak og kan oppdatere tiltak, men ikke status eller lukke', async () => {
    const db = as('mel');
    await assertSucceeds(getDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R1')));
    await assertFails(getDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R2')));
    await assertSucceeds(getDocs(query(collection(db, 'families', A, 'isoFindingsRestricted'), where('reportedByUid', '==', 'mel'))));
    await assertSucceeds(getDocs(query(collection(db, 'families', A, 'isoFindingsRestricted'), where('involvedUids', 'array-contains', 'mel'))));
    await assertFails(getDocs(collection(db, 'families', A, 'isoFindingsRestricted')));
    // Involverte kan ikke legge til eller skrive om tiltak, bare melde eget tiltak utført (tests/rules/isoLocks.rules.test.mjs).
    await assertFails(updateDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R1'), { actions: [{ id: 'a1', state: 'til_verifisering' }], rev: 2 }));
    await assertFails(updateDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R1'), { state: 'triage', rev: 2 }));
    await assertFails(updateDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R1'), { personalDetails: 'endret', rev: 2 }));
    await assertFails(updateDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R1'), closable({ closedByUid: 'mel' })));
    await assertFails(updateDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R1'), { restricted: false, rev: 2 }));
  });

  test('kan sende inn låst skjema i eget navn', async () => {
    const db = as('mel');
    const sub = { formId: 'FR1', formVersion: 1, formHash: 'h', templateId: 'iso_sf12_sja', submittedByUid: 'mel', locked: true, answers: {} };
    await assertSucceeds(setDoc(doc(db, 'families', A, 'isoSubmissions', 'S2'), sub));
    await assertFails(setDoc(doc(db, 'families', A, 'isoSubmissions', 'S3'), { ...sub, submittedByUid: 'beh' }));
    await assertFails(setDoc(doc(db, 'families', A, 'isoSubmissions', 'S4'), { ...sub, locked: false }));
    await assertFails(updateDoc(doc(db, 'families', A, 'isoSubmissions', 'S1'), { answers: { a: 'jukset' } }));
  });

  test('revisjonsspor: bare egne nye hendelser', async () => {
    const db = as('mel');
    await assertSucceeds(setDoc(doc(db, 'families', A, 'isoAudit', 'E9'), { actorUid: 'mel', entityId: 'F1', action: 'x' }));
    await assertFails(setDoc(doc(db, 'families', A, 'isoAudit', 'E10'), { actorUid: 'adm', entityId: 'F1', action: 'x' }));
  });
});

describe('saksbehandler med begrenset redigering', () => {
  test('behandler åpne saker, men kan ikke lukke eller kansellere', async () => {
    const db = as('beh');
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'isoFindings', 'F1'), { state: 'triage', triage: { severity: 'lav' }, rev: 2 }));
    await assertFails(updateDoc(doc(db, 'families', A, 'isoFindings', 'F2'), closable({ closedByUid: 'beh' })));
    await assertFails(updateDoc(doc(db, 'families', A, 'isoFindings', 'F2'), { state: 'kansellert', rev: 2 }));
    await assertFails(updateDoc(doc(db, 'families', A, 'isoFindings', 'F1'), { reportedByUid: 'beh', rev: 2 }));
    await assertFails(deleteDoc(doc(db, 'families', A, 'isoFindings', 'F1')));
  });

  test('ser ikke skjermede saker uten tildeling', async () => {
    const db = as('beh');
    await assertFails(getDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R1')));
    await assertFails(getDocs(collection(db, 'families', A, 'isoFindingsRestricted')));
  });

  test('flytting åpen → skjermet skjer atomisk; sletting alene avvises', async () => {
    const db = as('beh');
    await assertFails(deleteDoc(doc(db, 'families', A, 'isoFindings', 'F2')));
    const batch = writeBatch(db);
    batch.set(doc(db, 'families', A, 'isoFindingsRestricted', 'F2'), finding({ number: 'AVV-2', state: 'triage', restricted: true }));
    batch.delete(doc(db, 'families', A, 'isoFindings', 'F2'));
    await assertSucceeds(batch.commit());
    // Den gamle åpne kopien er borte for alle.
    await assertFails(getDoc(doc(as('les'), 'families', A, 'isoFindingsRestricted', 'F2')));
    assert.equal(await adminRead('families', A, 'isoFindings', 'F2'), undefined, 'åpen kopi er slettet');
    assert.equal((await adminRead('families', A, 'isoFindingsRestricted', 'F2')).restricted, true);
  });

  test('kan ikke lage skjermet kopi uten å slette den åpne', async () => {
    const db = as('beh');
    await assertFails(setDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'F1'), finding({ restricted: true, state: 'triage' })));
  });

  test('prosess: utkast kan endres, publisert versjon og publisering er låst', async () => {
    const db = as('beh');
    const base = await adminRead('families', A, 'isoProcesses', 'P1');
    const draftEdit = { ...base, versions: [base.versions[0], { ...base.versions[1], diagram: { nodes: [1, 2, 3] } }], rev: 4 };
    await assertSucceeds(setDoc(doc(db, 'families', A, 'isoProcesses', 'P1'), draftEdit));
    const fresh = await adminRead('families', A, 'isoProcesses', 'P1');
    await assertFails(setDoc(doc(db, 'families', A, 'isoProcesses', 'P1'), { ...fresh, versions: [{ ...fresh.versions[0], diagram: { nodes: [] } }, fresh.versions[1]], rev: 5 }));
    await assertFails(setDoc(doc(db, 'families', A, 'isoProcesses', 'P1'), { ...fresh, publishedVersion: 2, rev: 5 }));
    await assertFails(setDoc(doc(db, 'families', A, 'isoProcesses', 'P2'), { title: 'Ny', publishedVersion: 1, versions: [{ version: 1, state: 'publisert' }] }));
    await assertSucceeds(setDoc(doc(db, 'families', A, 'isoProcesses', 'P3'), { title: 'Ny', publishedVersion: 0, versions: [{ version: 1, state: 'utkast' }] }));
    await assertFails(deleteDoc(doc(db, 'families', A, 'isoProcesses', 'P1')));
  });

  test('dokument: publisert revisjon er låst', async () => {
    const db = as('beh');
    await assertFails(updateDoc(doc(db, 'families', A, 'isoDocuments', 'D1'), { revisions: [{ revision: 1, state: 'publisert', body: 'Endret i hemmelighet' }], rev: 3 }));
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'isoDocuments', 'D1'), { revisions: [{ revision: 1, state: 'publisert', body: 'Tekst' }, { revision: 2, state: 'utkast', body: 'Ny' }], rev: 3 }));
    await assertFails(updateDoc(doc(db, 'families', A, 'isoDocuments', 'D1'), { publishedRevision: 2, rev: 4 }));
  });

  test('styrte skjema og låste registre krever admin', async () => {
    const db = as('beh');
    await assertFails(updateDoc(doc(db, 'families', A, 'isoForms', 'FR1'), { publishedVersion: 2 }));
    await assertFails(updateDoc(doc(db, 'families', A, 'isoRecords', 'REC1'), { title: 'Endret', rev: 2 }));
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'isoRecords', 'REC2'), { title: 'Endret', rev: 2 }));
    await assertFails(updateDoc(doc(db, 'families', A, 'isoRecords', 'REC2'), { locked: true, rev: 3 }));
    await assertSucceeds(setDoc(doc(db, 'families', A, 'isoRecords', 'REC3'), { register: 'risiko', title: 'Ny', locked: false }));
    await assertFails(deleteDoc(doc(db, 'families', A, 'isoRecords', 'REC2')));
  });

  test('bevis i batch (30 dokumenter) går gjennom reglene', async () => {
    const db = as('beh');
    const batch = writeBatch(db);
    for (let i = 0; i < 15; i += 1) {
      batch.set(doc(db, 'families', A, 'isoEvidence', `B${i}`), { type: 'skjema', objectId: `o${i}`, hash: `h${i}` });
      batch.set(doc(db, 'families', A, 'isoEvidenceLinks', `L${i}`), { evidenceId: `B${i}`, requirementId: 'r1', reviewState: 'til_vurdering' });
    }
    await assertSucceeds(batch.commit());
  });
});

describe('ISO-administrator uten særskilt HMS-tilgang', () => {
  test('får ikke tilgang til skjermede saker eller kan gi seg selv tilgang', async () => {
    const db = as('adm');
    await assertFails(getDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R1')));
    await assertFails(getDocs(collection(db, 'families', A, 'isoFindingsRestricted')));
    await assertFails(setDoc(doc(db, 'families', A, 'isoRestricted', 'main'), { uids: ['hms', 'adm'] }));
    await assertFails(getDocs(collection(db, 'families', A, 'isoAuditRestricted')));
  });

  test('lukking krever triage, beslutning, begrunnelse, verifisert effekt og meldeplikt – også direkte mot databasen', async () => {
    const db = as('adm');
    const ref = doc(db, 'families', A, 'isoFindings', 'F2');
    await assertFails(updateDoc(ref, closable({ closeNote: '' })));
    await assertFails(updateDoc(ref, closable({ assessment: null })));
    await assertFails(updateDoc(ref, closable({ closedByUid: 'beh' })));
    await assertFails(updateDoc(ref, closable({ effect: { required: true, outcome: '' } })));
    await assertFails(updateDoc(ref, closable({ authorityNotificationRequired: true, notificationDone: false })));
    await assertSucceeds(updateDoc(ref, closable({ effect: { required: true, outcome: 'verifisert' } })));
  });

  test('kan publisere prosess og godkjenne skjema', async () => {
    const db = as('adm');
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'isoProcesses', 'P1'), { publishedVersion: 2, rev: 4 }));
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'isoForms', 'FR1'), { publishedVersion: 2 }));
  });

  test('revisjonsspor kan ikke endres eller slettes, heller ikke av admin', async () => {
    const db = as('adm');
    await assertFails(updateDoc(doc(db, 'families', A, 'isoAudit', 'E1'), { action: 'skjult' }));
    await assertFails(deleteDoc(doc(db, 'families', A, 'isoAudit', 'E1')));
    await assertFails(deleteDoc(doc(as('own'), 'families', A, 'isoAudit', 'E1')));
    await assertFails(deleteDoc(doc(as('hms'), 'families', A, 'isoAuditRestricted', 'E2')));
  });

  test('retting av låst registrering bevarer kjernen og legger til rettelse', async () => {
    const db = as('adm');
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'isoSubmissions', 'S1'), { answers: { a: 'rettet' }, corrections: [{ reason: 'skrivefeil' }] }));
    await assertFails(updateDoc(doc(db, 'families', A, 'isoSubmissions', 'S1'), { formHash: 'annen', corrections: [{}, {}] }));
    await assertFails(updateDoc(doc(db, 'families', A, 'isoSubmissions', 'S1'), { answers: { a: 'uten spor' } }));
    await assertFails(deleteDoc(doc(db, 'families', A, 'isoSubmissions', 'S1')));
  });

  test('vurdering: lesetilgang kan bare sette uvurdert krav til «dokumentert»', async () => {
    await assertSucceeds(updateDoc(doc(as('mel'), 'families', A, 'isoAssessments', 'V1'), { status: 'dokumentert', rev: 2 }));
    await assertFails(updateDoc(doc(as('mel'), 'families', A, 'isoAssessments', 'V2'), { status: 'dokumentert', rev: 2 }));
    await assertFails(setDoc(doc(as('mel'), 'families', A, 'isoAssessments', 'V3'), { requirementId: 'r3', status: 'oppfylt' }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'families', A, 'isoAssessments', 'V2'), { status: 'delvis', rev: 2 }));
  });
});

describe('autorisert behandler av skjermede saker', () => {
  test('ser og behandler alle skjermede saker, og kan lukke dem', async () => {
    const db = as('hms');
    await assertSucceeds(getDocs(collection(db, 'families', A, 'isoFindingsRestricted')));
    await assertSucceeds(getDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R2')));
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R2'), { state: 'triage', triage: { severity: 'hoy' }, rev: 2 }));
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R1'), closable({ closedByUid: 'hms' })));
    await assertSucceeds(getDocs(collection(db, 'families', A, 'isoAuditRestricted')));
  });

  test('flytter sak tilbake til åpen samling atomisk', async () => {
    const db = as('hms');
    const batch = writeBatch(db);
    batch.set(doc(db, 'families', A, 'isoFindings', 'R2'), finding({ number: 'HMS-2', reportedByUid: 'beh2', state: 'triage', restricted: false }));
    batch.delete(doc(db, 'families', A, 'isoFindingsRestricted', 'R2'));
    await assertSucceeds(batch.commit());
  });

  test('kan endre tilgangslisten når hen også er ISO-admin', async () => {
    await assertSucceeds(setDoc(doc(as('hms'), 'families', A, 'isoRestricted', 'main'), { uids: ['hms', 'beh'], people: [] }));
  });
});

describe('eier', () => {
  test('har ISO-admin, men ikke automatisk tilgang til skjermede saker; kan tildele uttrykkelig', async () => {
    const db = as('own');
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'isoSystem', 'main'), { name: 'Endret' }));
    await assertFails(getDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R2')));
    await assertSucceeds(setDoc(doc(db, 'families', A, 'isoRestricted', 'main'), { uids: ['hms', 'own'], people: [] }));
    await assertSucceeds(getDoc(doc(db, 'families', A, 'isoFindingsRestricted', 'R2')));
  });
});

describe('tilbaketrekking og brukerbytte', () => {
  test('nedgradert speil og fjernet medlemskap stenger tilgangen straks', async () => {
    await assertSucceeds(getDoc(doc(as('beh'), 'families', A, 'isoFindings', 'F1')));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', A, 'accessAcl', 'beh'), { uid: 'beh', iso: 0, grants: {}, expiresAt: FUTURE });
    });
    await assertFails(getDoc(doc(as('beh'), 'families', A, 'isoFindings', 'F1')));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', A, 'accessAcl', 'beh'), { uid: 'beh', iso: 2, grants: {}, expiresAt: FUTURE });
      await updateDoc(doc(ctx.firestore(), 'families', A), { members: ['own', 'les', 'mel', 'adm', 'hms'] });
    });
    await assertFails(getDoc(doc(as('beh'), 'families', A, 'isoFindings', 'F1')));
    await assertFails(getDoc(doc(as('beh'), 'families', A, 'parentTodos', 'T1')));
  });

  test('fjernet fra listen over særskilt tilgang mister skjermede saker', async () => {
    await assertSucceeds(getDoc(doc(as('hms'), 'families', A, 'isoFindingsRestricted', 'R2')));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', A, 'isoRestricted', 'main'), { uids: [] });
    });
    await assertFails(getDoc(doc(as('hms'), 'families', A, 'isoFindingsRestricted', 'R2')));
  });

  test('brukerbytte på samme klient: rettighetene følger innloggingen', async () => {
    await assertSucceeds(getDoc(doc(as('hms'), 'families', A, 'isoFindingsRestricted', 'R1')));
    await assertFails(getDoc(doc(as('les'), 'families', A, 'isoFindingsRestricted', 'R1')));
    await assertSucceeds(updateDoc(doc(as('adm'), 'families', A, 'isoProcesses', 'P1'), { publishedVersion: 2, rev: 9 }));
    await assertFails(updateDoc(doc(as('les'), 'families', A, 'isoProcesses', 'P1'), { publishedVersion: 1, rev: 10 }));
  });
});

describe('selskapsdokumentet (gjelder alle moduler)', () => {
  test('vanlig medlem kan ikke ta over eierskap, bli admin eller endre tilgangsmatrisen', async () => {
    const db = as('les');
    await assertFails(updateDoc(doc(db, 'families', A), { ownerUid: 'les' }));
    await assertFails(updateDoc(doc(db, 'families', A), { adminUids: ['own', 'les'] }));
    await assertFails(updateDoc(doc(db, 'families', A), { 'company.accessPolicy': { v: 2 } }));
    await assertFails(deleteDoc(doc(db, 'families', A)));
    await assertSucceeds(updateDoc(doc(db, 'families', A), { name: 'Nytt navn' }));
  });

  test('tilgangsadministrator og eier kan endre tilgangsmatrisen; eier kan overføre eierskap', async () => {
    await assertSucceeds(updateDoc(doc(as('adm'), 'families', A), { 'company.accessPolicy': { v: 3 } }));
    await assertSucceeds(updateDoc(doc(as('own'), 'families', A), { adminUids: ['own', 'adm'] }));
    await assertSucceeds(updateDoc(doc(as('own'), 'families', A), { ownerUid: 'adm' }));
  });

  // Tidligere slapp alle medlemmer til i selskaper uten speil (FL-02/SEC-13). Nå ber appen om
  // speilet når skallet åpnes, og uten det kan bare eier og administratorer endre matrisen.
  test('selskap uten speil: bare eier og administratorer kan endre tilgangsmatrisen', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', 'companyC'), {
        ownerUid: 'c1', adminUids: ['c1', 'c3'], members: ['c1', 'c2', 'c3'], company: { accessPolicy: {} },
      });
    });
    await assertFails(updateDoc(doc(as('c2'), 'families', 'companyC'), { 'company.accessPolicy': { v: 1 } }));
    await assertFails(updateDoc(doc(as('c2'), 'families', 'companyC'), { ownerUid: 'c2' }));
    await assertSucceeds(updateDoc(doc(as('c3'), 'families', 'companyC'), { 'company.accessPolicy': { v: 2 } }));
    await assertSucceeds(updateDoc(doc(as('c1'), 'families', 'companyC'), { 'company.accessPolicy': { v: 3 } }));
  });
});

describe('regresjon: eksisterende moduler', () => {
  test('medlemmer leser og skriver som før i Oppgaver, Prosjekt og Ansatte; HR bare med HR-tilgang', async () => {
    const db = as('les');
    await assertSucceeds(getDoc(doc(db, 'families', A, 'parentTodos', 'T1')));
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'parentTodos', 'T1'), { done: true }));
    await assertSucceeds(setDoc(doc(db, 'families', A, 'parentTodos', 'iso_x'), { title: 'Fra ISO', source: 'iso' }));
    await assertSucceeds(getDocs(collection(db, 'families', A, 'projects')));
    // Tidligere kunne alle medlemmer lese HR (lønn, saker, memo). Nå krever det HR-tilgang (L-01).
    await assertFails(getDoc(doc(db, 'families', A, 'hr', 'main')));
    await assertSucceeds(getDoc(doc(as('own'), 'families', A, 'hr', 'main')));
    await assertSucceeds(getDocs(collection(db, 'families', A, 'employees')));
    await assertSucceeds(setDoc(doc(db, 'families', A, 'parentTodos', 'T1', 'log', 'l1'), { text: 'x' }));
    await assertSucceeds(getDoc(doc(db, 'families', A)));
  });

  test('handlelister: uendret oppførsel (den generelle regelen gir alle medlemmer tilgang, se sikkerhetsnotat)', async () => {
    await assertSucceeds(getDoc(doc(as('les'), 'families', A, 'shoppingLists', 'L1')));
    await assertSucceeds(getDoc(doc(as('adm'), 'families', A, 'shoppingLists', 'L1')));
    await assertFails(getDoc(doc(as('ext'), 'families', A, 'shoppingLists', 'L1')));
  });

  test('ikke-medlem får ingenting fra andre moduler', async () => {
    await assertFails(getDoc(doc(as('ext'), 'families', A, 'parentTodos', 'T1')));
    await assertFails(setDoc(doc(as('ext'), 'families', A, 'projects', 'PRX'), { name: 'x' }));
  });

  test('egne profildokumenter og SSB-indeks som før', async () => {
    await assertSucceeds(setDoc(doc(as('les'), 'parents', 'les'), { name: 'Les' }));
    await assertFails(setDoc(doc(as('les'), 'parents', 'adm'), { name: 'x' }));
    await assertSucceeds(getDoc(doc(as('les'), 'system', 'indeksSsb')));
    await assertFails(setDoc(doc(as('own'), 'system', 'indeksSsb'), { x: 1 }));
  });
});

describe('ISO: godkjenning uten Admin', () => {
  test('kvalitetsleder med Begrenset redigering og godkjennerrolle kan publisere, lukke og godkjenne skjema', async () => {
    const db = as('kv');
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'isoProcesses', 'P1'), { publishedVersion: 2, rev: 4 }));
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'isoForms', 'FR1'), { publishedVersion: 2 }));
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'isoFindings', 'F2'), closable({ closedByUid: 'kv' })));
  });

  test('saksbehandler uten godkjennerrolle kan ikke publisere eller lukke', async () => {
    const db = as('beh');
    await assertFails(updateDoc(doc(db, 'families', A, 'isoProcesses', 'P1'), { publishedVersion: 2, rev: 4 }));
    await assertFails(updateDoc(doc(db, 'families', A, 'isoFindings', 'F2'), closable({ closedByUid: 'beh' })));
  });

  test('godkjenner kan ikke endre innstillingene eller gi seg selv rollen', async () => {
    await assertFails(updateDoc(doc(as('kv'), 'families', A, 'isoSystem', 'main'), { name: 'Endret' }));
    await assertFails(updateDoc(doc(as('beh'), 'families', A, 'isoSystem', 'main'), { approverUids: ['kv', 'beh'] }));
  });
});

describe('tilgang på ansatte: ingen selvoppgradering, tak = eget nivå', () => {
  test('ingen kan oppgradere seg selv', async () => {
    await assertFails(updateDoc(doc(as('les'), 'families', A, 'employees', 'EMP1'), { 'company.accessLevel': 'administrator' }));
    await assertFails(updateDoc(doc(as('les'), 'families', A, 'employees', 'EMP1'), { 'company.accessOverrides': { iso: 'write' } }));
    await assertFails(updateDoc(doc(as('ldr'), 'families', A, 'employees', 'EMPLDR'), { 'company.accessLevels': ['leder', 'administrator'] }));
    await assertFails(updateDoc(doc(as('adm'), 'families', A, 'employees', 'EMPADM'), { 'company.accessOverrides': { iso: 'write' } }));
  });

  test('egen profil kan fortsatt redigeres, også når appen normaliserer eldre nivåfelt', async () => {
    await assertSucceeds(updateDoc(doc(as('les'), 'families', A, 'employees', 'EMP1'), { name: 'Les', 'company.accessLevels': ['ansatt'] }));
  });

  test('kan ikke koble seg selv til en post med ledernivå', async () => {
    await assertFails(updateDoc(doc(as('les'), 'families', A, 'employees', 'EMPFREE'), { personUid: 'les' }));
    await assertFails(setDoc(doc(as('les'), 'families', A, 'employees', 'NEWSELF'), { personUid: 'les', company: { accessLevel: 'administrator' } }));
    // Fagansvar (HR, kvalitet, HMS) er like beskyttet som ledernivåene.
    await assertFails(setDoc(doc(as('les'), 'families', A, 'employees', 'NEWHR'), { personUid: 'les', company: { accessLevel: 'ansatt', accessLevels: ['hr_ansvarlig', 'ansatt'] } }));
    await assertFails(setDoc(doc(as('les'), 'families', A, 'employees', 'NEWISO'), { personUid: 'les', company: { accessLevel: 'ansatt', accessLevels: ['iso_rolle', 'ansatt'] } }));
    await assertSucceeds(setDoc(doc(as('non'), 'families', A, 'employees', 'NEWNON'), { personUid: 'non', company: { accessLevel: 'ansatt', accessRole: 'Ansatt' } }));
  });

  test('øverste leder kan endre medlemmer opp til eget nivå, men ikke gi administrator', async () => {
    const db = as('ldr');
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'employees', 'EMP2'), { 'company.accessLevel': 'leder', 'company.accessLevels': ['leder'] }));
    await assertFails(updateDoc(doc(db, 'families', A, 'employees', 'EMP1'), { 'company.accessLevel': 'administrator' }));
    await assertFails(updateDoc(doc(db, 'families', A, 'employees', 'EMP1'), { 'company.accessOverrides': { companyProfile: 'write' } }));
    await assertFails(updateDoc(doc(db, 'families', A, 'employees', 'EMPADM'), { 'company.accessLevels': ['ansatt'], 'company.accessLevel': 'ansatt' }));
  });

  test('ansatt uten Tilgangsstyring kan ikke endre andres nivå', async () => {
    await assertFails(updateDoc(doc(as('beh'), 'families', A, 'employees', 'EMP2'), { 'company.accessLevel': 'leder', 'company.accessLevels': ['leder'] }));
  });

  test('administrator og eier kan gi administrator', async () => {
    await assertSucceeds(updateDoc(doc(as('adm'), 'families', A, 'employees', 'EMP2'), { 'company.accessLevel': 'administrator', 'company.accessLevels': ['administrator'] }));
    await assertSucceeds(updateDoc(doc(as('own'), 'families', A, 'employees', 'EMP1'), { 'company.accessLevel': 'administrator' }));
  });
});

describe('dokumentstyring: merknader og innstillinger', () => {
  async function seedDocs() {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'families', A, 'docControlSettings', 'main'), {
        approverUids: ['kv'], commentReaderUids: ['ldr'], approvers: [{ uid: 'kv', name: 'Kvalitet' }], employeesCanComment: true,
      });
      await setDoc(doc(db, 'families', A, 'docComments', 'C1'), {
        id: 'C1', docKey: 'handbook', note: 'Gjelder deltid?', authorUid: 'les', readerUids: ['beh'], status: 'apen',
      });
      await setDoc(doc(db, 'families', A, 'docComments', 'C2'), {
        id: 'C2', docKey: 'handbook', note: 'Feil telefonnummer', authorUid: 'mel', readerUids: [], status: 'apen',
      });
      await setDoc(doc(db, 'families', A, 'docControl', 'handbook'), { id: 'handbook', title: 'Personalhåndbok', revisions: [] });
    });
  }

  test('ansatt ser bare egne merknader, også i lister', async () => {
    await seedDocs();
    const db = as('les');
    await assertSucceeds(getDoc(doc(db, 'families', A, 'docComments', 'C1')));
    await assertFails(getDoc(doc(db, 'families', A, 'docComments', 'C2')));
    await assertSucceeds(getDocs(query(collection(db, 'families', A, 'docComments'), where('authorUid', '==', 'les'))));
    await assertFails(getDocs(collection(db, 'families', A, 'docComments')));
  });

  test('dokumentets eier (readerUids), godkjenner, utpekt leser og eier av selskapet ser merknadene', async () => {
    await seedDocs();
    await assertSucceeds(getDoc(doc(as('beh'), 'families', A, 'docComments', 'C1')));
    await assertFails(getDoc(doc(as('beh'), 'families', A, 'docComments', 'C2')));
    await assertSucceeds(getDocs(query(collection(as('beh'), 'families', A, 'docComments'), where('readerUids', 'array-contains', 'beh'))));
    for (const uid of ['kv', 'ldr', 'own']) {
      await assertSucceeds(getDocs(collection(as(uid), 'families', A, 'docComments')));
    }
    await assertFails(getDocs(collection(as('adm'), 'families', A, 'docComments')));
    await assertFails(getDoc(doc(as('ext'), 'families', A, 'docComments', 'C1')));
  });

  test('merknad skrives i eget navn; bare lesere med full tilgang kan behandle den', async () => {
    await seedDocs();
    const les = as('les');
    await assertSucceeds(setDoc(doc(les, 'families', A, 'docComments', 'C3'), { id: 'C3', docKey: 'handbook', note: 'Ny', authorUid: 'les', status: 'apen' }));
    await assertFails(setDoc(doc(les, 'families', A, 'docComments', 'C4'), { id: 'C4', docKey: 'handbook', note: 'Falsk', authorUid: 'mel', status: 'apen' }));
    await assertSucceeds(updateDoc(doc(les, 'families', A, 'docComments', 'C1'), { note: 'Gjelder det deltid også?' }));
    await assertFails(updateDoc(doc(les, 'families', A, 'docComments', 'C1'), { status: 'tatt_inn' }));
    await assertFails(updateDoc(doc(les, 'families', A, 'docComments', 'C1'), { authorUid: 'mel' }));
    await assertSucceeds(updateDoc(doc(as('kv'), 'families', A, 'docComments', 'C1'), { status: 'tatt_inn', resolution: 'Presisert i rev. 2' }));
    await assertFails(updateDoc(doc(les, 'families', A, 'docComments', 'C1'), { note: 'Endret etter behandling' }));
    await assertFails(deleteDoc(doc(as('mel'), 'families', A, 'docComments', 'C1')));
    await assertSucceeds(deleteDoc(doc(as('ldr'), 'families', A, 'docComments', 'C2')));
  });

  test('dokumentets eier og godkjenner (readerUids) kan behandle merknaden, men ikke dele den med flere', async () => {
    await seedDocs();
    const ref = (uid) => doc(as(uid), 'families', A, 'docComments', 'C1');
    await assertFails(updateDoc(ref('les'), { readerUids: ['beh', 'mel'] }), 'forfatteren kan ikke legge til lesere');
    await assertFails(updateDoc(ref('beh'), { readerUids: ['beh', 'mel'] }));
    await assertSucceeds(updateDoc(ref('beh'), { status: 'avvist', resolution: 'Står allerede i kapittel 4' }));
    await assertFails(updateDoc(doc(as('mel'), 'families', A, 'docComments', 'C2'), { status: 'tatt_inn' }), 'forfatteren kan ikke behandle egen merknad');
  });

  test('innstillingene leses av alle medlemmer, men endres bare av eier og administratorer', async () => {
    await seedDocs();
    await assertSucceeds(getDoc(doc(as('les'), 'families', A, 'docControlSettings', 'main')));
    await assertFails(setDoc(doc(as('les'), 'families', A, 'docControlSettings', 'main'), { approverUids: ['les'] }));
    await assertFails(updateDoc(doc(as('kv'), 'families', A, 'docControlSettings', 'main'), { commentReaderUids: ['kv', 'les'] }));
    await assertSucceeds(updateDoc(doc(as('own'), 'families', A, 'docControlSettings', 'main'), { commentReaderUids: ['ldr', 'beh'] }));
    await assertFails(getDoc(doc(as('ext'), 'families', A, 'docControlSettings', 'main')));
  });

  test('lesebekreftelse bare i eget navn; utfylte skjema følger de vanlige reglene', async () => {
    await seedDocs();
    const db = as('les');
    await assertSucceeds(setDoc(doc(db, 'families', A, 'docAcks', 'handbook__les'), { docKey: 'handbook', revision: 1, uid: 'les' }));
    await assertFails(setDoc(doc(db, 'families', A, 'docAcks', 'handbook__mel'), { docKey: 'handbook', revision: 1, uid: 'mel' }));
    await assertSucceeds(getDocs(collection(as('mel'), 'families', A, 'docAcks')));
    await assertSucceeds(setDoc(doc(db, 'families', A, 'formDocs', 'dok1'), { id: 'dok1', title: 'SJA' }));
    await assertFails(getDocs(collection(as('ext'), 'families', A, 'docControl')));
  });

  test('bare godkjenner kan publisere, endre godkjent revisjon eller bytte godkjenner', async () => {
    await seedDocs();
    const published = {
      id: 'tpl_ks_sja', title: 'SJA', publishedRevision: 1, approver: { uid: '', name: '' },
      revisions: [{ revision: 1, state: 'publisert', approvedBy: 'Kvalitet' }, { revision: 2, state: 'til_gjennomgang', submittedByUid: 'les' }],
    };
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', A, 'docControl', 'tpl_ks_sja'), published);
    });
    const ref = (uid) => doc(as(uid), 'families', A, 'docControl', 'tpl_ks_sja');
    const approve = { publishedRevision: 2, revisions: [{ ...published.revisions[0], state: 'erstattet' }, { ...published.revisions[1], state: 'publisert', approvedBy: 'X' }] };
    await assertFails(updateDoc(ref('les'), approve));
    await assertFails(updateDoc(ref('les'), { revisions: [{ revision: 1, state: 'publisert', approvedBy: 'Forfalsket' }, published.revisions[1]] }));
    await assertFails(updateDoc(ref('les'), { approver: { uid: 'les', name: 'Les' } }));
    await assertSucceeds(updateDoc(ref('les'), { revisions: [...published.revisions.slice(0, 1), { revision: 2, state: 'utkast' }] }));
    await assertSucceeds(updateDoc(ref('kv'), approve));
    await assertFails(setDoc(doc(as('les'), 'families', A, 'docControl', 'ny'), { id: 'ny', title: 'Ny', publishedRevision: 1, revisions: [] }));
    await assertSucceeds(setDoc(doc(as('les'), 'families', A, 'docControl', 'ny'), { id: 'ny', title: 'Ny', publishedRevision: 0, revisions: [] }));
    await assertFails(deleteDoc(ref('les')));
  });
});
