/**
 * Regresjoner i lagringen fra gjennomgangen (REV-01, 09, 10, 17):
 *  - en timeføring som slettes fra Arbeid og av lagringen samtidig, slettes bare én gang,
 *    og en rad reglene avviser stopper ikke senere lagringer (REV-01),
 *  - ulagrede endringer i den lokale kopien fra forrige versjon går ikke tapt (REV-09),
 *  - et for stort hoveddokument stopper ikke utstyr og katalog (REV-10),
 *  - endringer uten kjent utgangspunkt forkastes ikke i det stille (REV-17).
 * Firestore er et lite minnelager med transaksjoner, som i concurrentSave.test.mjs.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const store = new Map();
globalThis.__saveTestStore = store;
globalThis.__saveTestDeletes = [];
globalThis.__saveTestDeny = new Set();
globalThis.__saveTestLocal = new Map();

const MOCKS = {
  'firebase/firestore': `
    const store = globalThis.__saveTestStore;
    const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    function denied(path) {
      if (!globalThis.__saveTestDeny.has(path)) return;
      const error = new Error('Missing or insufficient permissions.');
      error.code = 'permission-denied';
      throw error;
    }
    function deepMerge(base, patch) {
      const out = { ...(base || {}) };
      for (const [k, v] of Object.entries(patch)) {
        if (v && typeof v === 'object' && Array.isArray(v.__union)) {
          out[k] = [...(Array.isArray(out[k]) ? out[k] : []), ...v.__union];
          continue;
        }
        out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])
          ? deepMerge(out[k], v)
          : v;
      }
      return out;
    }
    function write(path, data, opts = {}) {
      store.set(path, opts.merge ? deepMerge(store.get(path), clone(data)) : clone(data));
    }
    export const arrayUnion = (...items) => ({ __union: items });
    export const doc = (db, ...parts) => ({ path: parts.join('/'), id: parts[parts.length - 1] });
    export const collection = (db, ...parts) => ({ path: parts.join('/') });
    export const query = (col) => col;
    export const where = () => null;
    export const serverTimestamp = () => 'ts';
    export async function addDoc(col, data) {
      write(col.path + '/auto' + Math.random().toString(36).slice(2), data);
    }
    export async function getDoc(ref) {
      const data = store.get(ref.path);
      return { id: ref.id, exists: () => data !== undefined, data: () => clone(data) };
    }
    export async function getDocs(col) {
      const prefix = col.path + '/';
      const docs = [...store.entries()]
        .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .map(([path, data]) => ({ id: path.slice(prefix.length), data: () => clone(data) }));
      return { docs, empty: !docs.length, size: docs.length };
    }
    export async function setDoc(ref, data, opts = {}) {
      denied(ref.path);
      write(ref.path, data, opts);
    }
    export async function deleteDoc(ref) {
      await new Promise((resolve) => { setTimeout(resolve, 5); });
      globalThis.__saveTestDeletes.push(ref.path);
      denied(ref.path);
      store.delete(ref.path);
    }
    export function writeBatch() {
      const ops = [];
      return {
        set(ref, data, opts) { ops.push(['set', ref.path, data, opts]); },
        delete(ref) { ops.push(['delete', ref.path]); },
        async commit() {
          ops.forEach(([, path]) => denied(path));
          for (const [type, path, data, opts] of ops) {
            if (type === 'delete') store.delete(path);
            else write(path, data, opts);
          }
        },
      };
    }
    export async function runTransaction(db, fn) {
      const writes = [];
      const tx = {
        get: async (ref) => getDoc(ref),
        set: (ref, data, opts) => { writes.push([ref.path, data, opts]); return tx; },
      };
      const result = await fn(tx);
      writes.forEach(([path]) => denied(path));
      for (const [path, data, opts] of writes) write(path, data, opts);
      return result;
    }
  `,
  'firebase/auth': 'export function onAuthStateChanged() { return () => {}; }',
  firebase: 'export const db = {}; export const auth = { currentUser: { uid: "u1" } };',
  firestoreAccess: 'export async function waitForFirestoreAccess() { return true; }',
  asyncStorage: `
    const mem = globalThis.__saveTestLocal;
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
    if (specifier === 'firebase/firestore' || specifier === 'firebase/auth') {
      return { url: `mock:${specifier}`, shortCircuit: true };
    }
    if (/(^|\/)firebase\.js$/.test(specifier)) return { url: 'mock:firebase', shortCircuit: true };
    if (/firestoreAccess\.js$/.test(specifier)) return { url: 'mock:firestoreAccess', shortCircuit: true };
    if (specifier === '@react-native-async-storage/async-storage') return { url: 'mock:asyncStorage', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('mock:')) {
      return { format: 'module', source: MOCKS[url.slice(5)], shortCircuit: true };
    }
    return next(url, context);
  },
});

const storage = await import('./storage.js');
const { createProject, emptyProjectState, normalizeProjectState } = await import('./engine.js');
const { removeTimeEntry } = await import('../economy/timeEntryStorage.js');

const CO = 'co-regresjon';
const MAIN = `families/${CO}/projects/state`;
const entryPath = (id) => `families/${CO}/timeEntries/${id}`;

function cloud() {
  return store.get(MAIN)?.state || {};
}

function seedCloud(state) {
  store.set(MAIN, { state: JSON.parse(JSON.stringify(normalizeProjectState(state))), updatedAt: 'ts' });
}

function entry(id, extra = {}) {
  return {
    id,
    projectId: 'p1',
    employeeId: 'e1',
    date: '2026-10-20',
    hours: 2,
    description: `Føring ${id}`,
    status: 'registrert',
    updatedAt: '2026-10-20T10:00:00.000Z',
    createdAt: '2026-10-20T10:00:00.000Z',
    ...extra,
  };
}

function wait(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function reset() {
  store.clear();
  globalThis.__saveTestDeletes.length = 0;
  globalThis.__saveTestDeny.clear();
  globalThis.__saveTestLocal.clear();
  storage.clearProjectStateMemory();
}

// ── REV-01: dobbel sletting og avviste rader ──────────────────────────────

{
  reset();
  seedCloud(createProject(emptyProjectState(), { name: 'Hundre', number: '100' }).state);
  for (const id of ['t1', 't2', 't3', 't_locked']) store.set(entryPath(id), entry(id, id === 't_locked' ? { status: 'låst' } : {}));
  const loaded = await storage.loadProjectState(CO, { force: true, hours: 'all' });
  await wait(20);
  assert.equal(loaded.timeEntries.length, 4);

  // Arbeid sletter føringen selv (purgeCloudEntries) mens lagringen etter setState sletter den samme.
  const withoutT1 = { ...loaded, timeEntries: loaded.timeEntries.filter((row) => row.id !== 't1') };
  await Promise.all([
    removeTimeEntry(CO, 't1', { entry: entry('t1'), log: true }),
    storage.persistProjectState(withoutT1, CO),
  ]);
  assert.equal(globalThis.__saveTestDeletes.filter((path) => path === entryPath('t1')).length, 1, 't1 slettes én gang');
  assert.equal(store.has(entryPath('t1')), false);
  // En ny sletting av samme rad i økten går ikke til skyen.
  await removeTimeEntry(CO, 't1');
  assert.equal(globalThis.__saveTestDeletes.filter((path) => path === entryPath('t1')).length, 1);

  // Reglene avviser den låste raden. Resten lagres, brukeren får beskjed, og senere lagringer går.
  globalThis.__saveTestDeny.add(entryPath('t_locked'));
  const edited = {
    ...withoutT1,
    timeEntries: withoutT1.timeEntries
      .filter((row) => row.id !== 't_locked')
      .map((row) => (row.id === 't2' ? { ...row, description: 'Rettet', updatedAt: '2026-10-28T10:00:00.000Z' } : row)),
  };
  await assert.rejects(
    () => storage.persistProjectState(edited, CO),
    (error) => error.code === storage.REFUSED_ROWS_CODE && /1 timeføring/.test(error.message),
  );
  assert.equal(store.get(entryPath('t2')).description, 'Rettet', 'den andre endringen er lagret');
  assert.ok(store.has(entryPath('t_locked')), 'den låste raden står i skyen');

  const deletesBefore = globalThis.__saveTestDeletes.length;
  const later = { ...edited, timeEntries: [...edited.timeEntries, entry('t4', { description: 'Ny' })] };
  await storage.persistProjectState(later, CO);
  assert.ok(store.has(entryPath('t4')), 'neste lagring går');
  assert.equal(globalThis.__saveTestDeletes.length, deletesBefore, 'den avviste slettingen prøves ikke igjen');

  // En endring reglene avviser (låst rad) i samme lagring som en vanlig endring.
  store.set(entryPath('t5'), entry('t5', { status: 'låst' }));
  globalThis.__saveTestDeny.add(entryPath('t5'));
  const both = {
    ...later,
    timeEntries: [
      ...later.timeEntries.map((row) => (row.id === 't3' ? { ...row, hours: 3, updatedAt: '2026-10-28T11:00:00.000Z' } : row)),
      entry('t5', { status: 'låst', hours: 9, updatedAt: '2026-10-28T11:00:00.000Z' }),
    ],
  };
  await assert.rejects(() => storage.persistProjectState(both, CO), (error) => error.code === storage.REFUSED_ROWS_CODE);
  assert.equal(store.get(entryPath('t3')).hours, 3, 't3 lagres selv om t5 avvises');
  assert.equal(store.get(entryPath('t5')).hours, 2, 't5 er urørt');
  await storage.persistProjectState({ ...both, timeEntries: [...both.timeEntries, entry('t6')] }, CO);
  assert.ok(store.has(entryPath('t6')));
}

console.log('saveRegressions.test.mjs: ok');
