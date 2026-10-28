/**
 * Aktiverte moduler i en bedrift (MENY-01): en vanlig ansatt kan ikke slå av Kalender og andre
 * moduler for hele bedriften (families/{id}.moduleAccess), heller ikke med egne kall mot REST-API-et.
 * Det krever samme tilgang som Modulinnstillinger: eier, administrator eller Admin på
 * Modulinnstillinger i speilet. Den ansatte lagrer sin egen visning under users/{uid}/modulePrefs.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/companyModules.rules.test.mjs"
 *
 * Bedrift A: own = eier, adm = administrator, kpf = Admin på Modulinnstillinger, ldr = Øverste leder
 * (Lese på Modulinnstillinger), bob = ansatt. Familie F: mor (eier) og far (voksen, ikke administrator).
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp, doc, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';

const PROJECT = 'demo-protop';
const HOST = '127.0.0.1:8080';
const A = 'companyA';
const F = 'familyF';
const FUTURE = Timestamp.fromMillis(Date.now() + 6 * 3600 * 1000);

let env;

function as(uid) {
  return env.authenticatedContext(uid, { email: `${uid}@firma.no`, email_verified: true }).firestore();
}

const grants = (over) => ({ moduleSettings: 'none', companyProfile: 'none', accessControl: 'none', ...over });
const ACL = {
  adm: { levelId: 'administrator', grants: grants({ moduleSettings: 'write' }) },
  kpf: { levelId: 'ansatt', grants: grants({ moduleSettings: 'write' }) },
  ldr: { levelId: 'leder', grants: grants({ moduleSettings: 'see' }) },
  bob: { levelId: 'ansatt', grants: grants({}) },
};

/** Det appen (også 86332db) skriver når en modul slås av: buildModuleAccessWrite + updatedAt. */
function turnOff(moduleId) {
  return {
    moduleAccessInitialized: true,
    [`moduleAccess.${moduleId}`]: {
      moduleId, activated: false, activatedAt: null, activatedAtMs: null, entitlement: 'included',
      entitlementExpiresAt: null, current: null,
      history: [{ moduleId, activatedAt: '2026-01-01T00:00:00.000Z', deactivatedAt: '2026-10-28T08:00:00.000Z' }],
    },
    updatedAt: serverTimestamp(),
  };
}

const ACTIVE = { moduleId: 'plan', activated: true, activatedAt: '2026-01-01T00:00:00.000Z', entitlement: 'included' };

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const members = ['own', 'adm', 'kpf', 'ldr', 'bob'];
    await setDoc(doc(db, 'families', A), {
      name: 'Bygg AS', type: 'company', ownerUid: 'own', adminUids: ['own', 'adm'], members, activeUsers: members,
      moduleAccessInitialized: true, moduleAccess: { plan: ACTIVE, notes: { ...ACTIVE, moduleId: 'notes' } },
      company: { navn: 'Bygg AS', accessPolicy: { v: 1 } },
    });
    for (const uid of members) {
      await setDoc(doc(db, 'families', A, 'parents', uid), { uid, name: uid, active: true, admin: uid === 'own' || uid === 'adm' });
    }
    for (const [uid, row] of Object.entries(ACL)) {
      await setDoc(doc(db, 'families', A, 'accessAcl', uid), { uid, iso: 1, ...row, expiresAt: FUTURE });
    }
    await setDoc(doc(db, 'families', F), {
      name: 'Familien', type: 'family', ownerUid: 'mor', adminUids: ['mor'], members: ['mor', 'far'], activeUsers: ['mor', 'far'],
      moduleAccessInitialized: true, moduleAccess: { plan: ACTIVE },
    });
    await setDoc(doc(db, 'families', F, 'parents', 'mor'), { uid: 'mor', active: true, admin: true });
    await setDoc(doc(db, 'families', F, 'parents', 'far'), { uid: 'far', active: true, admin: false });
  });
}

/** Usignert ID-token: emulatoren sjekker ikke signaturen, men reglene ser request.auth.uid. */
function idToken(uid) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, auth_time: now, iat: now, exp: now + 3600,
    sub: uid, user_id: uid, email: `${uid}@firma.no`, email_verified: true, firebase: { sign_in_provider: 'password' },
  })}.`;
}

/** Direkte PATCH mot REST-API-et, slik et eget skript ville gjort det. */
function restTurnOff(uid, familyId, moduleId) {
  const url = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents/families/${familyId}`
    + `?updateMask.fieldPaths=moduleAccess.${moduleId}`;
  return fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken(uid)}` },
    body: JSON.stringify({
      fields: {
        moduleAccess: {
          mapValue: {
            fields: {
              [moduleId]: { mapValue: { fields: { moduleId: { stringValue: moduleId }, activated: { booleanValue: false } } } },
            },
          },
        },
      },
    }),
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(seed);

describe('Aktiverte moduler i en bedrift (MENY-01)', () => {
  test('en vanlig ansatt kan ikke slå av Kalender for hele bedriften, heller ikke Øverste leder uten Admin', async () => {
    await assertFails(updateDoc(doc(as('bob'), 'families', A), turnOff('plan')));
    await assertFails(updateDoc(doc(as('ldr'), 'families', A), turnOff('plan')));
    // Heller ikke slå på (aktivere for alle) eller nullstille hele kartet.
    await assertFails(updateDoc(doc(as('bob'), 'families', A), { 'moduleAccess.mail': { ...ACTIVE, moduleId: 'mail' } }));
    await assertFails(updateDoc(doc(as('bob'), 'families', A), { moduleAccess: {} }));
    await assertFails(updateDoc(doc(as('bob'), 'families', A), { moduleAccessInitialized: false }));
  });

  test('via REST-API-et: ansatt avvises, Admin på Modulinnstillinger slipper til', async () => {
    const denied = await restTurnOff('bob', A, 'plan');
    assert.equal(denied.status, 403, `ansatt: ${denied.status} ${await denied.text()}`);
    const allowed = await restTurnOff('kpf', A, 'plan');
    assert.equal(allowed.status, 200, `kpf: ${allowed.status} ${await allowed.text()}`);
  });

  test('eier, administrator og Admin på Modulinnstillinger endrer for hele bedriften, som i Modulinnstillinger', async () => {
    await assertSucceeds(updateDoc(doc(as('own'), 'families', A), turnOff('plan')));
    await assertSucceeds(updateDoc(doc(as('adm'), 'families', A), turnOff('notes')));
    await assertSucceeds(updateDoc(doc(as('kpf'), 'families', A), { 'moduleAccess.mail': { ...ACTIVE, moduleId: 'mail' } }));
  });

  test('den ansatte lagrer sin egen visning, ikke andres', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'users', 'bob', 'modulePrefs', A), { modules: { plan: 'off' }, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(as('bob'), 'users', 'ldr', 'modulePrefs', A), { modules: { plan: 'off' } }));
  });

  test('andre endringer på bedriften virker som før for en ansatt', async () => {
    await assertSucceeds(updateDoc(doc(as('bob'), 'families', A), { name: 'Bygg AS', updatedAt: serverTimestamp() }));
  });

  test('familier og lag: valget gjelder gruppen, som før (ingen endring for eldre apper)', async () => {
    await assertSucceeds(updateDoc(doc(as('far'), 'families', F), turnOff('plan')));
    await assertSucceeds(updateDoc(doc(as('mor'), 'families', F), { 'moduleAccess.plan': ACTIVE }));
  });
});
