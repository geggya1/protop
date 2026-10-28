/**
 * REV-11: private hendelser i bedriftskalenderen. Bedriften merkes (privateEvents) først når den
 * har en privat hendelse, og eldre hendelser uten audience får feltet før det, så kolleger og
 * eldre apper ikke mister kalenderen. Reglene er testet i tests/rules/regressions.rules.test.mjs.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const store = new Map();
const writes = [];
globalThis.__sealTest = { store, writes, listeners: [] };

const MOCKS = {
  'firebase/firestore': `
    const { store, writes, listeners } = globalThis.__sealTest;
    const clone = (v) => JSON.parse(JSON.stringify(v));
    export const doc = (db, ...parts) => ({ path: parts.join('/'), id: parts[parts.length - 1] });
    export const collection = (db, ...parts) => ({ path: parts.join('/') });
    export const query = (col) => col;
    export const where = () => null;
    export async function getDoc(ref) {
      const data = store.get(ref.path);
      return { exists: () => data !== undefined, data: () => clone(data) };
    }
    function docsUnder(path) {
      const prefix = path + '/';
      return [...store.entries()]
        .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
        .map(([key, data]) => ({ id: key.slice(prefix.length), data: () => clone(data) }));
    }
    export async function getDocs(col) { return { docs: docsUnder(col.path) }; }
    export async function updateDoc(ref, patch) {
      writes.push([ref.path, patch]);
      store.set(ref.path, { ...(store.get(ref.path) || {}), ...patch });
    }
    export function writeBatch() {
      const ops = [];
      return {
        update(ref, patch) { ops.push([ref, patch]); },
        async commit() { for (const [ref, patch] of ops) await updateDoc(ref, patch); },
      };
    }
    export function onSnapshot(ref, next) {
      listeners.push(ref.path);
      setTimeout(() => next({ docs: docsUnder(ref.path), size: 0, empty: false }), 1);
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

const seal = await import('./calendarSeal.js');
const { subscribeFamilyCollection, resetSharedCollectionListeners } = await import('./sharedCollectionListeners.js');
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Eldre hendelser: uten mottakere = hele gruppen, med mottakere = bare utvalgte.
assert.deepEqual(seal.legacyAudiencePatches([
  { id: 'a', memberIds: [] },
  { id: 'b', memberIds: ['u2'] },
  { id: 'c', audience: 'family' },
  { id: 'd' },
]), [{ id: 'a', audience: 'family' }, { id: 'b', audience: 'selected' }, { id: 'd', audience: 'family' }]);
assert.equal(seal.hasPrivateEvents([{ audience: 'family' }, {}]), false);
assert.equal(seal.hasPrivateEvents([{ audience: 'selected' }]), true);

function seedCompany(id, type = 'company', extra = {}) {
  store.set(`families/${id}`, { type, ...extra });
  store.set(`families/${id}/events/old`, { title: 'Sommerfest', memberIds: [], createdBy: 'u2' });
  store.set(`families/${id}/events/old2`, { title: 'Møte', memberIds: ['u2'], createdBy: 'u2' });
  store.set(`families/${id}/events/all`, { title: 'Julebord', audience: 'family', memberIds: [] });
}

// En bedrift uten private hendelser merkes ikke, og hele kalenderen kan fortsatt listes.
{
  seal.resetCalendarSeal();
  resetSharedCollectionListeners();
  seedCompany('A');
  const stop = subscribeFamilyCollection('A', 'events', (snap) => snap.docs.map((d) => d.id), () => {});
  await wait(20);
  assert.equal(store.get('families/A').privateEvents, undefined);
  assert.equal(store.get('families/A/events/old').audience, undefined);
  stop();
}

// Lytteren ser en privat hendelse (laget før reglene eller av en eldre app): eldre hendelser får
// audience, og så merkes bedriften. Én gang.
{
  seal.resetCalendarSeal();
  resetSharedCollectionListeners();
  writes.length = 0;
  seedCompany('B');
  store.set('families/B/events/priv', { title: 'Lønnssamtale', audience: 'selected', memberIds: ['u1'], createdBy: 'u1' });
  const stop = subscribeFamilyCollection('B', 'events', (snap) => snap.docs.map((d) => d.id), () => {});
  await wait(30);
  assert.equal(store.get('families/B/events/old').audience, 'family');
  assert.equal(store.get('families/B/events/old2').audience, 'selected');
  assert.equal(store.get('families/B').privateEvents, true);
  const familyWrite = writes.findIndex(([path]) => path === 'families/B');
  assert.equal(familyWrite, writes.length - 1, 'bedriften merkes etter de eldre hendelsene');
  const before = writes.length;
  assert.equal(await seal.sealCompanyCalendar('B'), false, 'bare én gang');
  assert.equal(writes.length, before);
  stop();
}

// Ny privat hendelse fra appen (EventFormScreen): bedriften merkes før hendelsen lagres.
{
  seal.resetCalendarSeal();
  seedCompany('C');
  assert.equal(await seal.sealCompanyCalendar('C'), true);
  assert.equal(store.get('families/C').privateEvents, true);
  assert.equal(store.get('families/C/events/old').audience, 'family');
  // Allerede merket, eller ikke en bedrift: ingenting skjer.
  seal.resetCalendarSeal();
  assert.equal(await seal.sealCompanyCalendar('C'), false);
  seedCompany('F', 'family');
  assert.equal(await seal.sealCompanyCalendar('F'), false);
  assert.equal(store.get('families/F').privateEvents, undefined);
}

// Lagringen ser at EventFormScreen merker før den lagrer en privat hendelse.
{
  const { readFileSync } = await import('node:fs');
  const screen = readFileSync(new URL('../../screens/v2/EventFormScreen.jsx', import.meta.url), 'utf8');
  const sealAt = screen.indexOf('if (!wholeFamily) await sealCompanyCalendar(familyId)');
  assert.ok(sealAt > 0);
  assert.ok(sealAt < screen.indexOf("addDoc(collection(db, 'families', familyId, 'events')"));
}

console.log('calendarSeal.test.mjs: ok');
