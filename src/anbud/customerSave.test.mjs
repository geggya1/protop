/**
 * Kunderegisteret når to brukere lagrer samtidig (DS-04, DS-15), og anbudsdokumentet
 * som ikke lenger forkorter tekst brukeren har skrevet (DS-05).
 * Firestore er et lite minnelager med transaksjoner. Hver «enhet» har egen modulinstans.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const store = new Map();
globalThis.__anbudTestStore = store;
globalThis.__anbudTestLocal = new Map();

const MOCKS = {
  'firebase/firestore': `
    const store = globalThis.__anbudTestStore;
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
    export async function setDoc(ref, data, opts = {}) {
      store.set(ref.path, opts.merge ? deepMerge(store.get(ref.path), clone(data)) : clone(data));
    }
    export async function runTransaction(db, fn) {
      const writes = [];
      const tx = {
        get: async (ref) => getDoc(ref),
        set: (ref, data, opts) => { writes.push([ref, data, opts]); return tx; },
      };
      const result = await fn(tx);
      for (const [ref, data, opts] of writes) await setDoc(ref, data, opts);
      return result;
    }
  `,
  'firebase/auth': 'export function onAuthStateChanged() { return () => {}; }',
  firebase: 'export const db = {}; export const auth = { currentUser: { uid: "u1" } };',
  firestoreAccess: 'export async function waitForFirestoreAccess() { return true; }',
  asyncStorage: `
    const device = new URL(import.meta.url).searchParams.get('enhet') || 'felles';
    const all = globalThis.__anbudTestLocal;
    if (!all.has(device)) all.set(device, new Map());
    const mem = all.get(device);
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
    if (/(^|\/)firebase(\.js)?$/.test(specifier) && specifier.startsWith('.')) return { url: 'mock:firebase', shortCircuit: true };
    if (/firestoreAccess\.js$/.test(specifier)) return { url: 'mock:firestoreAccess', shortCircuit: true };
    if (specifier === '@react-native-async-storage/async-storage') {
      const device = new URL(context.parentURL || 'file:///').searchParams.get('enhet') || 'felles';
      return { url: `mock:asyncStorage?enhet=${device}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('mock:')) {
      const name = url.slice(5).split('?')[0];
      return { format: 'module', source: MOCKS[name], shortCircuit: true };
    }
    return next(url, context);
  },
});

const deviceA = await import('./storage.js?enhet=a');
const deviceB = await import('./storage.js?enhet=b');
const { emptyAnbudState, fitAnbudForCloud, mergeAnbudStates } = await import('./model.js');
const { upsertCustomer } = await import('./customers.js');

const CO = 'co-kunder';
const REGISTRY = `families/${CO}/anbud/customers`;
const STATE = `families/${CO}/anbud/state`;

function registry() {
  return store.get(REGISTRY)?.customers || [];
}

// Revisjonen, punkt 3: B har listen fra i morges og retter K2. K1 skal beholde A sin nye e-post.
{
  const fresh = [
    { id: 'K1', name: 'Kunde', email: 'ny@a.no', updatedAt: '2026-10-27T10:00:00Z' },
    { id: 'K2', name: 'Kunde2' },
  ];
  const stale = [
    { id: 'K1', name: 'Kunde', email: 'gammel@a.no', updatedAt: '2026-10-01T10:00:00Z' },
    { id: 'K2', name: 'Kunde2 endret av B' },
  ];
  const out = mergeAnbudStates({ customers: fresh }, { customers: stale }).customers;
  assert.equal(out.find((row) => row.id === 'K1').email, 'ny@a.no', 'nyeste kunde vinner');
  assert.equal(out.find((row) => row.id === 'K2').name, 'Kunde2 endret av B', 'uten tidsstempel vinner lagringen');
  const reverse = mergeAnbudStates({ customers: stale }, { customers: fresh }).customers;
  assert.equal(reverse.find((row) => row.id === 'K1').email, 'ny@a.no');
}

// Bare endrede kunder sendes, og et kundenummer to har tatt samtidig blir ikke dobbelt.
{
  const read = upsertCustomer({ customers: [] }, { name: 'Lest' }).customer;
  const base = new Map([[read.id, JSON.stringify(read)]]);
  const fresh = { id: 'K-ny', name: 'Ny' };
  assert.deepEqual(
    deviceA.changedCustomerRows(base, [read, fresh]).map((row) => row.id),
    ['K-ny'],
    'uendret kunde sendes ikke',
  );
  assert.equal(deviceA.changedCustomerRows(null, [read, fresh]).length, 2, 'uten utgangspunkt sendes alt');
  const merged = deviceA.mergeCustomerChanges(
    [{ id: 'K1', name: 'Eksisterende', customerNumber: '7', createdAt: '2026-01-01' }],
    [{ id: 'K9', name: 'Ny fra B', customerNumber: '7', createdAt: '2026-10-28' }],
  );
  assert.equal(merged.find((row) => row.id === 'K1').customerNumber, '7');
  assert.equal(merged.find((row) => row.id === 'K9').customerNumber, '8', 'neste ledige nummer');
}

// Mot skyen: to enheter med hver sin liste.
{
  store.set(REGISTRY, {
    customers: [
      { id: 'K1', name: 'Kunde', email: 'gammel@a.no', customerNumber: '1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-10-01T10:00:00Z' },
      { id: 'K2', name: 'Kunde2', customerNumber: '2', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-10-01T10:00:00Z' },
    ],
  });
  const morningB = (await deviceB.loadCustomerList(CO)).customers;
  const listA = (await deviceA.loadCustomerList(CO)).customers;

  // A retter e-posten til K1.
  const editedA = upsertCustomer({ customers: listA }, { id: 'K1', name: 'Kunde', email: 'ny@a.no' });
  assert.equal(editedA.ok, true);
  await deviceA.saveCustomers(CO, editedA.state.customers);
  assert.equal(registry().find((row) => row.id === 'K1').email, 'ny@a.no');

  // B retter K2 med listen fra i morges.
  const editedB = upsertCustomer({ customers: morningB }, { id: 'K2', name: 'Kunde2 AS' });
  const savedB = await deviceB.saveCustomers(CO, editedB.state.customers);
  assert.equal(registry().find((row) => row.id === 'K1').email, 'ny@a.no', 'A sin e-post står');
  assert.equal(registry().find((row) => row.id === 'K2').name, 'Kunde2 AS');
  assert.equal(savedB.find((row) => row.id === 'K1').email, 'ny@a.no', 'B får registeret tilbake');

  // Begge oppretter en ny kunde samtidig med neste nummer (3).
  const newA = upsertCustomer({ customers: registry() }, { name: 'Ny A' });
  const newB = upsertCustomer({ customers: registry() }, { name: 'Ny B' });
  assert.equal(newA.customer.customerNumber, '3');
  assert.equal(newB.customer.customerNumber, '3');
  await deviceA.saveCustomers(CO, newA.state.customers);
  const afterB = await deviceB.saveCustomers(CO, newB.state.customers);
  const numbers = registry().map((row) => row.customerNumber).sort();
  assert.deepEqual(numbers, ['1', '2', '3', '4'], 'ingen kundenummer to ganger');
  assert.equal(afterB.find((row) => row.id === newB.customer.id).customerNumber, '4');
}

// DS-05: tekst brukeren har skrevet, forkortes ikke. For stort dokument stopper med melding.
{
  // Tolket avtaletekst kan være opptil 20 000 tegn. Før ble den alltid kuttet til 8000.
  const longText = 'Avtaletekst'.repeat(1400);
  const contract = { id: 'kon_1', title: 'Rammeavtale', documents: [{ id: 'dok_1', name: 'Avtale.pdf', text: longText }] };
  const state = { ...emptyAnbudState(), contracts: [contract] };
  const cloud = fitAnbudForCloud(state);
  assert.equal(cloud.contracts[0].documents[0].text.length, longText.length, 'teksten er hel (over 8000 tegn)');

  // Mange kunngjøringstreff kan kortes ned. Avtalene står urørt.
  const crowded = {
    ...state,
    notices: Array.from({ length: 80 }, (_, index) => ({
      id: `2026-${index}`, title: `Treff ${index}`, decision: 'ubestemt', description: 'D'.repeat(6000),
    })),
  };
  const trimmed = fitAnbudForCloud(crowded, 120_000);
  assert.equal(trimmed.contracts[0].documents[0].text.length, longText.length);
  assert.ok(new TextEncoder().encode(JSON.stringify(trimmed)).length <= 120_000);

  assert.throws(() => fitAnbudForCloud(state, 10_000), (error) => error.code === 'anbud-too-large' && /forkortet/.test(error.message));

  store.set(STATE, { state: { ...emptyAnbudState(), contracts: [{ id: 'kon_0', title: 'Fra før' }] } });
  const huge = {
    ...emptyAnbudState(),
    contracts: Array.from({ length: 50 }, (_, index) => ({
      id: `kon_${index + 2}`,
      title: `Stor ${index}`,
      documents: [{ id: 'dok_1', name: 'Avtale.pdf', text: 'x'.repeat(19_000) }],
    })),
  };
  await assert.rejects(() => deviceA.persistAnbudState(huge, CO), /for store/);
  assert.deepEqual(store.get(STATE).state.contracts.map((row) => row.id), ['kon_0'], 'skyen er ikke skrevet med forkortet tekst');
}

console.log('customerSave.test.mjs: ok');
