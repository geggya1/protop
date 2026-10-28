/**
 * DS-13: utlegg og produktsalg ligger to steder (prosjektdokumentet og egen samling).
 * expenseSave.js og productSaleSave.js er stedene som vet det: lesing slår sammen med samme
 * regel overalt, og lagring og sletting går dit raden ligger. Firestore er et lite minnelager.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const store = new Map();
globalThis.__opsTestStore = store;

const MOCKS = {
  'firebase/firestore': `
    const store = globalThis.__opsTestStore;
    const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    function deepMerge(base, patch) {
      const out = { ...(base || {}) };
      for (const [k, v] of Object.entries(patch)) {
        out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])
          ? deepMerge(out[k], v) : v;
      }
      return out;
    }
    const write = (path, data, opts = {}) => store.set(path, opts.merge ? deepMerge(store.get(path), clone(data)) : clone(data));
    export const doc = (db, ...parts) => ({ path: parts.join('/'), id: parts[parts.length - 1] });
    export const collection = (db, ...parts) => ({ path: parts.join('/') });
    export const serverTimestamp = () => 'ts';
    export async function getDoc(ref) {
      const data = store.get(ref.path);
      return { id: ref.id, exists: () => data !== undefined, data: () => clone(data) };
    }
    export async function getDocs(col) {
      const prefix = col.path + '/';
      const docs = [...store.entries()]
        .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .map(([path, data]) => ({ id: path.slice(prefix.length), data: () => clone(data) }));
      return { docs };
    }
    export async function setDoc(ref, data, opts = {}) { write(ref.path, data, opts); }
    export async function deleteDoc(ref) { store.delete(ref.path); }
    export function writeBatch() {
      const ops = [];
      return {
        set(ref, data, opts) { ops.push([ref.path, data, opts]); },
        async commit() { for (const [path, data, opts] of ops) write(path, data, opts); },
      };
    }
    export async function runTransaction(db, fn) {
      const writes = [];
      const tx = {
        get: async (ref) => getDoc(ref),
        set: (ref, data, opts) => { writes.push([ref.path, data, opts]); return tx; },
      };
      const result = await fn(tx);
      for (const [path, data, opts] of writes) write(path, data, opts);
      return result;
    }
  `,
  'firebase/auth': 'export function onAuthStateChanged() { return () => {}; }',
  firebase: 'export const db = {}; export const auth = { currentUser: { uid: "u1" } };',
  firestoreAccess: 'export async function waitForFirestoreAccess() { return true; }',
  asyncStorage: `
    const mem = new Map();
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
    if (specifier === 'firebase/firestore' || specifier === 'firebase/auth') return { url: `mock:${specifier}`, shortCircuit: true };
    if (/(^|\/)firebase(\.js)?$/.test(specifier) && specifier.startsWith('.')) return { url: 'mock:firebase', shortCircuit: true };
    if (/firestoreAccess\.js$/.test(specifier)) return { url: 'mock:firestoreAccess', shortCircuit: true };
    if (specifier === '@react-native-async-storage/async-storage') return { url: 'mock:asyncStorage', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('mock:')) return { format: 'module', source: MOCKS[url.slice(5)], shortCircuit: true };
    return next(url, context);
  },
});

const { combineExpenses, loadAllExpenses, removeExpenseRow, saveExpenseChange } = await import('./expenseSave.js');
const { combineSales, loadAllSales } = await import('./productSaleSave.js');
const { normalizeProjectState } = await import('../project/engine.js');

const CO = 'co-ops';
const MAIN = `families/${CO}/projects/state`;
const expense = (id, extra = {}) => ({
  id, projectId: 'p1', date: '2026-10-01', description: `Utlegg ${id}`, amountExVat: 100, category: 'other',
  createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z', ...extra,
});

// Samme regel overalt: samlingen er fasit for importerte rader, kopien i prosjektdokumentet telles ikke.
{
  const inApp = expense('E-app');
  const imported = expense('E-imp', { externalStore: true, description: 'Fra samlingen' });
  const staleCopy = { ...imported, description: 'Gammel kopi i prosjektdokumentet' };
  const rows = combineExpenses([inApp, staleCopy], [imported]);
  assert.deepEqual(rows.map((row) => row.id).sort(), ['E-app', 'E-imp']);
  assert.equal(rows.find((row) => row.id === 'E-imp').description, 'Fra samlingen');

  const sale = { id: 'S1', name: 'Skruer', quantity: 2, unitPrice: 10, projectId: 'p1' };
  const importedSale = { id: 'S2', name: 'Plater', quantity: 1, unitPrice: 99, externalStore: true };
  const sales = combineSales([sale, { ...importedSale, name: 'Gammel kopi' }], [importedSale]);
  assert.deepEqual(sales.map((row) => `${row.id}:${row.name}`).sort(), ['S1:Skruer', 'S2:Plater']);
}

// Lagring og sletting går dit raden ligger.
{
  store.set(MAIN, { state: JSON.parse(JSON.stringify(normalizeProjectState({ projects: [{ id: 'p1', number: '100', name: 'Skole' }], expenses: [expense('E-app')] }))) });
  store.set(`families/${CO}/projectExpenses/E-imp`, expense('E-imp', { externalStore: true, storage: 'projectExpenses' }));

  let all = await loadAllExpenses(CO);
  assert.deepEqual(all.map((row) => row.id).sort(), ['E-app', 'E-imp']);

  const savedImported = await saveExpenseChange(CO, { ...all.find((row) => row.id === 'E-imp'), description: 'Rettet import' });
  assert.equal(savedImported.ok, true);
  assert.equal(store.get(`families/${CO}/projectExpenses/E-imp`).description, 'Rettet import', 'importert rad i samlingen');
  assert.equal((store.get(MAIN).state.expenses || []).some((row) => row.id === 'E-imp'), false, 'ikke kopiert inn i prosjektdokumentet');

  const savedApp = await saveExpenseChange(CO, { ...all.find((row) => row.id === 'E-app'), description: 'Rettet i appen' });
  assert.equal(savedApp.ok, true);
  assert.equal(store.get(MAIN).state.expenses.find((row) => row.id === 'E-app').description, 'Rettet i appen', 'appens rad i prosjektdokumentet');

  assert.equal((await removeExpenseRow(CO, { ...expense('E-x'), status: 'invoiced' })).ok, false, 'fakturert slettes ikke');
  assert.equal((await removeExpenseRow(CO, all.find((row) => row.id === 'E-imp'))).ok, true);
  assert.equal(store.has(`families/${CO}/projectExpenses/E-imp`), false);
  assert.equal((await removeExpenseRow(CO, all.find((row) => row.id === 'E-app'))).ok, true);
  const cloud = store.get(MAIN).state;
  assert.equal(cloud.expenses.some((row) => row.id === 'E-app'), false);
  assert.ok((cloud.deletedRows || []).some((row) => row.key === 'expenses' && row.id === 'E-app'), 'slettemarkering');

  all = await loadAllExpenses(CO);
  assert.deepEqual(all, []);
  assert.deepEqual(await loadAllSales(CO), []);
}

console.log('operationStores.test.mjs: ok');
