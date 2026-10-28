/**
 * REV-08 og REV-15: HR-lesing venter på tilgangsspeilet, og ulagrede HR-endringer på enheten
 * slettes aldri fordi en lesing ble avvist eller brukeren logget ut. De vises bare for den som
 * gjorde dem, og sendes neste gang hen laster HR.
 * Firestore er et lite minnelager: hr/state avvises for den som ikke har et ferskt speil.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const env = {
  store: new Map(), local: new Map(), acl: new Set(), hrUsers: new Set(['hr1']), user: { uid: 'hr1' }, syncs: 0,
};
globalThis.__hrTest = env;

function denied() {
  const error = new Error('Missing or insufficient permissions.');
  error.code = 'permission-denied';
  return error;
}
globalThis.__hrDenied = denied;

const MOCKS = {
  'firebase/firestore': `
    const env = globalThis.__hrTest;
    const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    // hr/state: bare HR med ferskt speil. accessAcl: alle leser sitt eget.
    function allowed(path) {
      if (!path.includes('/hr/')) return true;
      const uid = env.user?.uid;
      return env.hrUsers.has(uid) && env.acl.has(uid);
    }
    export const doc = (db, ...parts) => ({ path: parts.join('/'), id: parts[parts.length - 1] });
    export const collection = (db, ...parts) => ({ path: parts.join('/') });
    export async function getDoc(ref) {
      if (!allowed(ref.path)) throw globalThis.__hrDenied();
      if (ref.path.includes('/accessAcl/')) {
        const uid = ref.path.split('/').pop();
        const fresh = env.acl.has(uid);
        return { exists: () => fresh, data: () => ({ expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString() }) };
      }
      const data = env.store.get(ref.path);
      return { id: ref.id, exists: () => data !== undefined, data: () => clone(data) };
    }
    export async function setDoc(ref, data) {
      if (!allowed(ref.path) || env.offline) throw globalThis.__hrDenied();
      env.store.set(ref.path, { ...(env.store.get(ref.path) || {}), ...clone(data) });
    }
    export async function getDocs() { return { docs: [] }; }
    export function writeBatch() { return { set() {}, async commit() {} }; }
  `,
  'firebase/auth': 'export function onAuthStateChanged() { return () => {}; }',
  'firebase/functions': `
    const env = globalThis.__hrTest;
    export function httpsCallable() {
      return async () => {
        env.syncs += 1;
        env.acl.add(env.user.uid);
        return { data: { ok: true, expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString() } };
      };
    }
  `,
  firebase: `
    const env = globalThis.__hrTest;
    export const db = {};
    export const functions = {};
    export const auth = { get currentUser() { return env.user; } };
  `,
  firestoreAccess: `
    export function isFirestorePermissionError(err) { return String(err?.code || '').includes('permission-denied'); }
    export async function waitForFirestoreAccess() { return true; }
  `,
  asyncStorage: `
    const mem = globalThis.__hrTest.local;
    export default {
      async getItem(k) { return mem.has(k) ? mem.get(k) : null; },
      async setItem(k, v) { mem.set(k, String(v)); },
      async removeItem(k) { mem.delete(k); },
      async multiRemove(keys) { keys.forEach((k) => mem.delete(k)); },
      async getAllKeys() { return [...mem.keys()]; },
    };
  `,
};

registerHooks({
  resolve(specifier, context, next) {
    if (['firebase/firestore', 'firebase/auth', 'firebase/functions'].includes(specifier)) {
      return { url: `mock:${specifier}`, shortCircuit: true };
    }
    if (/(^|\/)firebase(\.js)?$/.test(specifier) && specifier.startsWith('.')) return { url: 'mock:firebase', shortCircuit: true };
    if (/firestoreAccess(\.js)?$/.test(specifier)) return { url: 'mock:firestoreAccess', shortCircuit: true };
    if (specifier === '@react-native-async-storage/async-storage') return { url: 'mock:asyncStorage', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('mock:')) return { format: 'module', source: MOCKS[url.slice(5)], shortCircuit: true };
    return next(url, context);
  },
});

const hr = await import('./storage.js');
const { clearPersonalCaches } = await import('../utils/localCache.js');
const { resetAccessSyncState } = await import('../access/accessMirror.js');
const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');

const CO = 'co-hr';
const HR_PATH = `families/${CO}/hr/state`;
const memo = (id, title, updatedAt) => ({ id, employeeId: 'e1', title, text: 'Notat', updatedAt });

function newSession(uid) {
  hr.clearHrMemory();
  resetAccessSyncState();
  env.user = { uid };
}

// Første innlogging: speilet finnes ikke ennå. HR leses etter at det er laget, ikke som tomt.
{
  env.store.set(HR_PATH, { memos: [memo('m1', 'Fra skyen', '2026-10-01T10:00:00.000Z')], updatedAt: '2026-10-01T10:00:00.000Z' });
  newSession('hr1');
  const state = await hr.loadHrState(CO);
  assert.equal(env.syncs, 1, 'speilet ble bedt om');
  assert.deepEqual(state.memos.map((row) => row.title), ['Fra skyen']);
  assert.equal(hr.hrLoadMeta(CO), 'ok');
}

// Skyen avviser lagringen (f.eks. speilet har gått ut): endringen ligger i køen på enheten.
{
  env.acl.delete('hr1');
  const loaded = hr.peekHrState(CO);
  const edited = { ...loaded, memos: [...loaded.memos, memo('m2', 'Ulagret', '2026-10-28T09:00:00.000Z')], updatedAt: '2026-10-28T09:00:00.000Z' };
  await assert.rejects(() => hr.saveHrState(edited, CO), (error) => error.code === 'hr/permission');
  assert.deepEqual(await hr.pendingHrCompanies('hr1'), [CO]);

  // Ny økt, speilet mangler fortsatt og synken svarer ikke: lesingen avvises. Ingenting slettes.
  newSession('hr1');
  env.hrUsers.delete('hr1');
  const denied = await hr.loadHrState(CO);
  assert.deepEqual(denied.memos.map((row) => row.title), ['Fra skyen', 'Ulagret'], 'egne ulagrede endringer vises');
  assert.equal(hr.hrLoadMeta(CO), 'error');
  assert.deepEqual(await hr.pendingHrCompanies('hr1'), [CO], 'køen står');
  env.hrUsers.add('hr1');
}

// Utlogging: den lokale kopien ryddes, men køen med egne endringer står.
{
  await clearPersonalCaches(AsyncStorage);
  assert.equal(env.local.has(`protop.hr.v1.${CO}`), false);
  assert.ok(env.local.has(`protop.hrPending.v1.${CO}`));

  // En annen bruker uten HR-tilgang logger inn på samme PC: ser ingenting av det.
  newSession('ansatt2');
  const other = await hr.loadHrState(CO);
  assert.deepEqual(other.memos, []);
  assert.deepEqual(await hr.pendingHrCompanies('ansatt2'), []);
  assert.ok(env.local.has(`protop.hrPending.v1.${CO}`), 'køen til den andre brukeren står');
}

// Samme bruker logger inn igjen med tilgang: endringen sendes, og køen tømmes.
{
  newSession('hr1');
  const back = await hr.loadHrState(CO);
  assert.deepEqual(back.memos.map((row) => row.title), ['Fra skyen', 'Ulagret']);
  await new Promise((resolve) => { setTimeout(resolve, 20); });
  assert.deepEqual(env.store.get(HR_PATH).memos.map((row) => row.title), ['Fra skyen', 'Ulagret'], 'sendt til skyen');
  assert.deepEqual(await hr.pendingHrCompanies('hr1'), []);
}

// REV-15: utlogging sender ulagrede endringer først, og sier fra om noe blir liggende igjen.
{
  const { prepareSignOut, signOutKeepingWork, PENDING_SIGN_OUT_TEXT } = await import('../utils/localCache.js');
  const { subscribeSaveToast, resetSaveToastForTests } = await import('../ui/saveToast.js');
  const loaded = hr.peekHrState(CO);

  // Uten nett ved lagring: endringen er i køen. Nettet er tilbake når brukeren logger ut.
  env.offline = true;
  const offline = { ...loaded, memos: [...loaded.memos, memo('m3', 'Uten nett', '2026-10-28T10:00:00.000Z')], updatedAt: '2026-10-28T10:00:00.000Z' };
  await assert.rejects(() => hr.saveHrState(offline, CO));
  env.offline = false;
  assert.deepEqual(await prepareSignOut(), { pendingHr: 0 }, 'sendt før utlogging');
  assert.deepEqual(env.store.get(HR_PATH).memos.map((row) => row.title), ['Fra skyen', 'Ulagret', 'Uten nett']);

  // Skyen avviser fortsatt: brukeren får beskjed, og køen står etter utloggingen.
  const toasts = [];
  resetSaveToastForTests();
  const stop = subscribeSaveToast((toast) => toasts.push(toast));
  env.acl.delete('hr1');
  const again = hr.peekHrState(CO);
  const stuck = { ...again, memos: [...again.memos, memo('m4', 'Avvist', '2026-10-28T11:00:00.000Z')], updatedAt: '2026-10-28T11:00:00.000Z' };
  await assert.rejects(() => hr.saveHrState(stuck, CO));
  env.hrUsers.delete('hr1');
  let signedOut = false;
  await signOutKeepingWork(async () => { signedOut = true; });
  assert.equal(signedOut, true);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].kind, 'error');
  assert.equal(toasts[0].detail, PENDING_SIGN_OUT_TEXT);
  await clearPersonalCaches(AsyncStorage);
  assert.ok(env.local.has(`protop.hrPending.v1.${CO}`), 'køen står etter utlogging');
  stop();
  env.hrUsers.add('hr1');
}

console.log('hrPending.test.mjs: ok');
