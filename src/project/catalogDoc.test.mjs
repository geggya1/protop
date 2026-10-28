/**
 * Produktkatalogen i eget dokument (projects/catalog).
 * Arkivering og sletting av produkter skal virke selv om hoveddokumentet
 * (projects/state) er over Firestores grense på 1 MiB.
 * Firestore er erstattet med et lite minnelager som avviser for store dokumenter.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const store = new Map();
globalThis.__catalogTestStore = store;
// Største tillatte størrelse per dokumentsti. Mangler stien, er det ingen grense.
globalThis.__catalogTestLimits = {};

const MOCKS = {
  'firebase/firestore': `
    const store = globalThis.__catalogTestStore;
    const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    function deepMerge(base, patch) {
      const out = { ...(base || {}) };
      for (const [k, v] of Object.entries(patch)) {
        out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])
          ? deepMerge(out[k], v)
          : v;
      }
      return out;
    }
    export const doc = (db, ...parts) => ({ path: parts.join('/') });
    export const serverTimestamp = () => 'ts';
    export async function getDoc(ref) {
      const data = store.get(ref.path);
      return { exists: () => data !== undefined, data: () => clone(data) };
    }
    function nextFor(ref, data, opts = {}) {
      const next = opts.merge ? deepMerge(store.get(ref.path), clone(data)) : clone(data);
      const size = JSON.stringify(next).length;
      if (size > (globalThis.__catalogTestLimits[ref.path] ?? Infinity)) {
        throw new Error('Document ' + ref.path + ' cannot be written because its size (' + size + ' bytes) exceeds the maximum allowed size');
      }
      return next;
    }
    export async function setDoc(ref, data, opts = {}) {
      store.set(ref.path, nextFor(ref, data, opts));
    }
    // Transaksjon: alt eller ingenting. Et for stort dokument stopper hele skrivingen.
    export async function runTransaction(db, fn) {
      const writes = [];
      const tx = {
        get: async (ref) => getDoc(ref),
        set: (ref, data, opts) => { writes.push([ref, data, opts]); return tx; },
      };
      const result = await fn(tx);
      const staged = writes.map(([ref, data, opts]) => [ref.path, nextFor(ref, data, opts)]);
      for (const [path, next] of staged) store.set(path, next);
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

const {
  applyCatalogDoc,
  clearProjectStateMemory,
  loadProjectState,
  mergeCatalogDoc,
  patchProjectOperations,
  persistProjectState,
} = await import('./storage.js');
const { emptyProduct } = await import('../economy/products.js');
const { deleteProduct, setProductArchived, upsertProduct } = await import('../economy/opsState.js');
const { patchRowsById } = await import('../equipment/state.js');
const { createProject, normalizeProjectState } = await import('./engine.js');

const CO = 'co-catalog';
const MAIN = `families/${CO}/projects/state`;
const CATALOG = `families/${CO}/projects/catalog`;

// Rene hjelpere.
{
  const merged = mergeCatalogDoc(
    { products: [{ id: 'a', name: 'A', updatedAt: '2026-10-02T00:00:00Z' }, { id: 'b', name: 'B' }], deletedProducts: [] },
    { products: [{ id: 'a', name: 'Gammel A', updatedAt: '2026-10-01T00:00:00Z' }, { id: 'c', name: 'C' }], deletedProducts: [{ id: 'b', deletedAt: '2026-10-03T00:00:00Z' }] },
  );
  assert.equal(merged.products.find((row) => row.id === 'a').name, 'A', 'nyeste produkt vinner');
  assert.deepEqual(merged.products.map((row) => row.id).sort(), ['a', 'c'], 'slettet produkt holdes ute');
  assert.deepEqual(merged.deletedProducts.map((row) => row.id), ['b']);

  const main = { products: [{ id: 'old' }], projects: [{ id: 'p' }] };
  assert.equal(applyCatalogDoc(main, null), main);
  assert.deepEqual(applyCatalogDoc(main, { products: [{ id: 'new' }] }).products, [{ id: 'new' }]);
  assert.deepEqual(applyCatalogDoc(main, { products: [{ id: 'new' }] }).deletedProducts, []);
}

// Hoveddokumentet har produktene fra før, og ingen katalog er lagret ennå.
let seed = { products: [], sales: [], projects: [{ id: 'p1', number: '1', name: 'Prosjekt', status: 'aktiv' }] };
for (const [id, name] of [['v1', 'Fremleie'], ['v2', 'Ubrukt']]) {
  const made = upsertProduct(seed, emptyProduct({ id, name, priceExVat: 100 }));
  seed = made.state;
}
store.set(MAIN, { state: JSON.parse(JSON.stringify(normalizeProjectState(seed))), updatedAt: 'ts' });

clearProjectStateMemory(CO);
const loaded = await loadProjectState(CO, { force: true });
assert.deepEqual(loaded.products.map((row) => row.name).sort(), ['Fremleie', 'Ubrukt'], 'leses fra hoveddokumentet før katalogen finnes');

// Hoveddokumentet kan ikke skrives (over 1 MiB). Arkivering skal likevel lagres.
globalThis.__catalogTestLimits[MAIN] = 100;
const mainBefore = JSON.stringify(store.get(MAIN));

function patchFor(before, after) {
  return (base) => {
    const patch = {};
    for (const key of ['products', 'sales', 'deletedProducts']) {
      if (before[key] !== after[key]) patch[key] = patchRowsById(base[key], before[key], after[key]);
    }
    return patch;
  };
}

const archived = setProductArchived(loaded, 'v1', true);
const saved = await patchProjectOperations(CO, patchFor(loaded, archived.state));
assert.equal(saved.ok, true, `arkivering lagres uten å skrive hoveddokumentet: ${saved.error?.message || ''}`);
assert.equal(JSON.stringify(store.get(MAIN)), mainBefore, 'hoveddokumentet er ikke rørt');
const catalogDoc = store.get(CATALOG);
assert.ok(catalogDoc, 'katalogdokumentet er opprettet');
assert.equal(catalogDoc.products.find((row) => row.id === 'v1').archived, true);
assert.equal(catalogDoc.products.length, 2);

// Sletting av ubrukt produkt går også utenom hoveddokumentet.
const removed = deleteProduct(archived.state, 'v2', { usedCount: 0 });
const deleted = await patchProjectOperations(CO, patchFor(archived.state, removed.state));
assert.equal(deleted.ok, true);
assert.deepEqual(store.get(CATALOG).products.map((row) => row.id), ['v1']);
assert.deepEqual(store.get(CATALOG).deletedProducts.map((row) => row.id), ['v2']);

// En ny lasting leser katalogen fra eget dokument. Hoveddokumentets gamle liste overstyres.
clearProjectStateMemory(CO);
const reloaded = await loadProjectState(CO, { force: true });
assert.deepEqual(reloaded.products.map((row) => row.id), ['v1']);
assert.equal(reloaded.products[0].archived, true);

// Et salg (hoveddokumentet) feiler fortsatt ærlig når dokumentet er for stort.
const sold = await patchProjectOperations(CO, () => ({ sales: [{ id: 's1', name: 'Fremleie', quantity: 1 }] }));
assert.equal(sold.ok, false);
assert.match(String(sold.error?.message || ''), /exceeds the maximum allowed size/);

// Når hoveddokumentet skrives igjen, får det samme katalog som katalogdokumentet
// (eldre klienter leser derfra). En skjerm som lastet før arkivering og sletting, legger
// til et prosjekt: den gamle kopien av produktene blir ikke med, og v2 kommer ikke tilbake.
delete globalThis.__catalogTestLimits[MAIN];
const stale = createProject(loaded, { name: 'Nytt', number: '2' }).state;
await persistProjectState(stale, CO);
assert.deepEqual(store.get(MAIN).state.projects.map((row) => row.number).sort(), ['1', '2']);
assert.deepEqual(store.get(MAIN).state.products.map((row) => row.id), ['v1']);
assert.equal(store.get(MAIN).state.products[0].archived, true);
assert.deepEqual(store.get(CATALOG).products.map((row) => row.id), ['v1']);
assert.equal(store.get(CATALOG).products[0].archived, true);

console.log('catalogDoc.test.mjs: ok');
