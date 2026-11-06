/**
 * Lagring ved hvert tastetrykk i anbudsarbeidet (svar, notat, skjemafelt): kunderegisteret leses
 * ikke på nytt for hvert tegn, og lagringene skjer i rekkefølge, så siste tekst vinner.
 * Firestore, Auth og AsyncStorage er små minnelagre.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const fake = { reads: [], writes: [], docs: new Map(), delays: [] };
globalThis.__anbudSaveTest = fake;

const MOCKS = {
  'firebase/firestore': `
    const fake = globalThis.__anbudSaveTest;
    const wait = () => new Promise((r) => setTimeout(r, fake.delays.shift() || 0));
    export const doc = (db, ...parts) => ({ path: parts.join('/') });
    export const serverTimestamp = () => 'ts';
    export async function getDoc(ref) {
      fake.reads.push(ref.path);
      await wait();
      const data = fake.docs.get(ref.path);
      return { exists: () => !!data, data: () => data };
    }
    export async function setDoc(ref, data) { fake.writes.push(ref.path); fake.docs.set(ref.path, data); }
    export async function runTransaction(db, fn) {
      return fn({
        get: async (ref) => { const data = fake.docs.get(ref.path); return { exists: () => !!data, data: () => data }; },
        set: (ref, data) => { fake.writes.push(ref.path); fake.docs.set(ref.path, data); },
      });
    }
  `,
  'firebase/auth': 'export function onAuthStateChanged() { return () => {}; }',
  firebase: 'export const db = {}; export const auth = { currentUser: { uid: "u1" } };',
  firestoreAccess: 'export async function waitForFirestoreAccess() { return true; }',
  asyncStorage: `
    const map = new Map();
    export default {
      async getItem(key) { return map.has(key) ? map.get(key) : null; },
      async setItem(key, value) { map.set(key, String(value)); },
      async removeItem(key) { map.delete(key); },
      async getAllKeys() { return [...map.keys()]; },
      async multiRemove(keys) { keys.forEach((k) => map.delete(k)); },
    };
  `,
  saveToast: 'export function showSaveError() {}',
};

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'firebase/firestore') return { url: 'mock:firebase/firestore', shortCircuit: true };
    if (specifier === 'firebase/auth') return { url: 'mock:firebase/auth', shortCircuit: true };
    if (specifier === '@react-native-async-storage/async-storage') return { url: 'mock:asyncStorage', shortCircuit: true };
    if (/^\.\.\/\.\.\/firebase(\.js)?$/.test(specifier)) return { url: 'mock:firebase', shortCircuit: true };
    if (/firestoreAccess(\.js)?$/.test(specifier)) return { url: 'mock:firestoreAccess', shortCircuit: true };
    if (/saveToast(\.js)?$/.test(specifier)) return { url: 'mock:saveToast', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('mock:')) return { format: 'module', source: MOCKS[url.slice(5)], shortCircuit: true };
    return next(url, context);
  },
});

const { saveAnbudState, persistAnbudState, flushAnbudState } = await import('./storage.js');
const REGISTRY = 'families/co1/anbud/customers';
const registryReads = () => fake.reads.filter((path) => path === REGISTRY).length;

// Ti tastetrykk rett etter hverandre: registeret leses én gang.
for (let i = 1; i <= 10; i += 1) {
  await saveAnbudState({ bids: [{ id: 'b1', title: 'Svar'.slice(0, 1) + i }] }, 'co1');
}
assert.equal(registryReads(), 1, 'registeret skal ikke leses ved hvert tastetrykk');

// «Lagre» leser registeret på nytt.
await persistAnbudState({ bids: [{ id: 'b1', title: 'Lagret' }] }, 'co1');
assert.equal(registryReads(), 2);

// Lagringer som ikke ventes på hver for seg, blir likevel gjort i rekkefølge: siste tekst vinner.
const pending = [];
for (const title of ['a', 'ab', 'abc']) pending.push(saveAnbudState({ bids: [{ id: 'b2', title }] }, 'co2'));
const results = await Promise.all(pending);
assert.equal(results.at(-1).bids.find((bid) => bid.id === 'b2')?.title, 'abc');
await flushAnbudState('co2');
const saved = fake.docs.get('families/co2/anbud/state')?.state;
assert.equal(saved?.bids?.find((bid) => bid.id === 'b2')?.title, 'abc');

console.log('storageSaveQueue.test.mjs: ok');
