/**
 * REV-08: tilgangsspeilet (accessAcl) trengs nå for HR, fravær, faktura og ansatte, men varer
 * bare i 12 timer. Det fornyes før det går ut, lesing venter på det, og lyttere som ble avvist
 * før speilet fantes, kobler til på nytt når det er skrevet.
 * Firestore er et lite minnelager. Lyttere avvises til speilet finnes.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const state = { acl: false, listens: [], denied: 0 };
globalThis.__mirrorTest = state;

const MOCKS = {
  'firebase/firestore': `
    const state = globalThis.__mirrorTest;
    export const collection = (db, ...parts) => ({ path: parts.join('/') });
    export const doc = (db, ...parts) => ({ path: parts.join('/') });
    export const query = (col) => col;
    export const where = () => null;
    export async function updateDoc() {}
    export async function getDoc() { return { exists: () => false, data: () => ({}) }; }
    export async function getDocs() { return { docs: [] }; }
    export function writeBatch() { return { update() {}, async commit() {} }; }
    export function onSnapshot(ref, next, fail) {
      state.listens.push(ref.path);
      setTimeout(() => {
        if (!state.acl) {
          state.denied += 1;
          const error = new Error('Missing or insufficient permissions.');
          error.code = 'permission-denied';
          fail(error);
          return;
        }
        next({ docs: [{ id: 'a1', data: () => ({ employeeId: 'e1' }) }], size: 1, empty: false });
      }, 1);
      return () => {};
    }
  `,
  firebase: 'export const db = {}; export const auth = { currentUser: { uid: "u1" } };',
  costGuards: 'export function trackListenerOpen() {} export function releaseListener() {}',
};

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'firebase/firestore') return { url: 'mock:firebase/firestore', shortCircuit: true };
    if (/(^|\/)firebase(\.js)?$/.test(specifier) && specifier.startsWith('.')) return { url: 'mock:firebase', shortCircuit: true };
    if (/costGuards(\.js)?$/.test(specifier)) return { url: 'mock:costGuards', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('mock:')) return { format: 'module', source: MOCKS[url.slice(5)], shortCircuit: true };
    return next(url, context);
  },
});

const mirror = await import('./accessMirror.js');
const { subscribeFamilyCollection, resetSharedCollectionListeners } = await import('../utils/sharedCollectionListeners.js');

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const HOUR = 3600 * 1000;

// Speilet mangler (første innlogging): lesingen ber om synk og venter på den.
{
  mirror.resetAccessSyncState();
  const calls = [];
  const call = async (id) => {
    calls.push(id);
    return { data: { ok: true, expiresAt: new Date(Date.now() + 12 * HOUR).toISOString() } };
  };
  const ok = await mirror.ensureFreshAccessMirror('A', 'u1', { call, read: async () => 0 });
  assert.equal(ok, true);
  assert.deepEqual(calls, ['A']);
  // Kjent ferskt: ingen ny lesing eller synk.
  assert.equal(await mirror.ensureFreshAccessMirror('A', 'u1', { call, read: async () => { throw new Error('leses ikke'); } }), true);
  assert.deepEqual(calls, ['A']);
}

// Speilet går ut om en time (fane som har stått åpen): fornyes. Ferskt nok: ingen synk.
{
  mirror.resetAccessSyncState();
  const calls = [];
  const call = async (id) => {
    calls.push(id);
    return { data: { ok: true, expiresAt: new Date(Date.now() + 12 * HOUR).toISOString() } };
  };
  assert.equal(await mirror.ensureFreshAccessMirror('B', 'u1', { call, read: async () => Date.now() + HOUR }), true);
  assert.deepEqual(calls, ['B'], 'går ut snart: synk');
  mirror.resetAccessSyncState();
  assert.equal(await mirror.ensureFreshAccessMirror('C', 'u1', { call, read: async () => Date.now() + 10 * HOUR }), true);
  assert.deepEqual(calls, ['B'], 'ti timer igjen: ingen synk');
}

// Avvist lesing (force) synker selv om speilet er kjent ferskt, men ikke oftere enn hvert minutt.
{
  mirror.resetAccessSyncState();
  const calls = [];
  const call = async (id) => {
    calls.push(id);
    return { data: { ok: true, expiresAt: new Date(Date.now() + 12 * HOUR).toISOString() } };
  };
  await mirror.ensureFreshAccessMirror('D', 'u1', { call, read: async () => 0 });
  await mirror.ensureFreshAccessMirror('D', 'u1', { call, force: true });
  assert.deepEqual(calls, ['D'], 'nettopp synket: ikke på nytt med en gang');
}

// Skallet holder speilet ferskt: sjekk med jevne mellomrom og når appen blir aktiv igjen.
{
  mirror.resetAccessSyncState();
  const reads = [];
  const read = async (id) => { reads.push(id); return Date.now() + 10 * HOUR; };
  let resume = null;
  let resumeStopped = 0;
  const onResume = (fn) => { resume = fn; return () => { resumeStopped += 1; }; };
  const stopA = mirror.keepAccessMirrorFresh('E', 'u1', { onResume, everyMs: 15, read, call: async () => ({}) });
  const stopB = mirror.keepAccessMirrorFresh('E', 'u1', { onResume, everyMs: 15, read, call: async () => ({}) });
  await wait(40);
  assert.ok(reads.length >= 1, 'sjekket med jevne mellomrom');
  assert.equal(typeof resume, 'function');
  stopA();
  assert.equal(resumeStopped, 0, 'en skjerm til bruker sjekken');
  stopB();
  assert.equal(resumeStopped, 1);
}

// Lytteren på fravær ble avvist før speilet fantes: den kobler til igjen når speilet er skrevet.
{
  mirror.resetAccessSyncState();
  resetSharedCollectionListeners();
  state.acl = false;
  state.listens.length = 0;
  const seen = [];
  const stop = subscribeFamilyCollection('F', 'absences', (snap) => snap.docs.map((d) => d.id), (rows) => seen.push(rows));
  await wait(3500);
  assert.ok(state.denied >= 1);
  assert.deepEqual(seen.at(-1), [], 'avvist: tom liste');
  const before = state.listens.length;
  state.acl = true;
  await mirror.ensureFreshAccessMirror('F', 'u1', {
    call: async () => ({ data: { ok: true, expiresAt: new Date(Date.now() + 12 * HOUR).toISOString() } }),
    read: async () => 0,
  });
  await wait(20);
  assert.ok(state.listens.length > before, 'koblet til på nytt');
  assert.deepEqual(seen.at(-1), ['a1'], 'fraværet vises');
  stop();
}

console.log('mirrorRefresh.test.mjs: ok');
