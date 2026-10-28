/**
 * Regresjoner i lagringen fra gjennomgangen (REV-01, 09, 10, 17):
 *  - en timeføring som slettes fra Arbeid og av lagringen samtidig, slettes bare én gang,
 *    og en rad reglene avviser stopper ikke senere lagringer (REV-01),
 *  - ulagrede endringer i den lokale kopien fra forrige versjon går ikke tapt (REV-09),
 *  - et for stort hoveddokument stopper ikke utstyr og katalog (REV-10),
 *  - endringer uten kjent utgangspunkt forkastes ikke i det stille (REV-17),
 *  - standardverdier på prosjektene skrives ikke, så 500 prosjekt får plass under 1 MiB.
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

// ── REV-09: ulagrede endringer i den lokale kopien fra forrige versjon ───────

{
  reset();
  const seeded = createProject(emptyProjectState(), { name: 'Hundre', number: '100' }).state;
  const projectId = seeded.projects[0].id;
  const row = (id, at, extra = {}) => ({
    id, projectId, date: '2026-10-01', description: `Utlegg ${id}`, amountExVat: 100, category: 'other',
    updatedAt: at, createdAt: at, ...extra,
  });
  const T0 = '2026-10-20T08:00:00.000Z';
  const T1 = '2026-10-21T08:00:00.000Z';
  seedCloud({ ...seeded, syncedAt: T0, fullDayHours: 7.5, expenses: [row('E1', T0), row('E3', T0)] });
  // Den eldre versjonen lagret uten nett: E1 rettet, E2 ny og eget dagsnormtall. E_gammel er en
  // rad fra før skyen sist ble lagret (slettet av en annen), og skal ikke komme tilbake.
  globalThis.__saveTestLocal.set(`protop.projectPlatform.v2.${CO}`, JSON.stringify(normalizeProjectState({
    ...seeded,
    syncedAt: T1,
    fullDayHours: 7,
    expenses: [
      row('E1', T1, { description: 'Rettet uten nett' }),
      row('E2', T1, { description: 'Ny uten nett' }),
      row('E3', T0),
      row('E_gammel', '2026-10-01T08:00:00.000Z'),
    ],
  })));
  const loaded = await storage.loadProjectState(CO, { force: true });
  assert.deepEqual(loaded.expenses.map((e) => e.id).sort(), ['E1', 'E2', 'E3']);
  assert.equal(loaded.expenses.find((e) => e.id === 'E1').description, 'Rettet uten nett');
  assert.equal(loaded.fullDayHours, 7);
  await wait(30);
  assert.deepEqual(cloud().expenses.map((e) => e.id).sort(), ['E1', 'E2', 'E3'], 'sendt til skyen, ingenting gjenopplivet');
  assert.equal(cloud().expenses.find((e) => e.id === 'E1').description, 'Rettet uten nett');
  assert.equal(cloud().fullDayHours, 7);
  assert.equal((await storage.pendingProjectChanges(CO)).length, 0);

  // Bare én gang: en kollega retter E1 etterpå, og neste lasting skriver ikke den gamle kopien tilbake.
  store.get(MAIN).state.expenses = cloud().expenses.map((e) => (e.id === 'E1' ? { ...e, description: 'Kollega', updatedAt: '2026-10-22T08:00:00.000Z' } : e));
  storage.clearProjectStateMemory(CO);
  const again = await storage.loadProjectState(CO, { force: true });
  assert.equal(again.expenses.find((e) => e.id === 'E1').description, 'Kollega');
  assert.equal((await storage.pendingProjectChanges(CO)).length, 0);
}

// ── REV-10: for stort hoveddokument stopper ikke utstyr og katalog ─────────

{
  reset();
  const seeded = createProject(emptyProjectState(), { name: 'Hundre', number: '100' }).state;
  const projectId = seeded.projects[0].id;
  seedCloud({ ...seeded, documents: [{ id: 'd1', projectId, title: 'Stor', text: 'x'.repeat(1_000_000) }] });
  const SIDE = `families/${CO}/projects/equipment`;
  store.set(SIDE, { equipment: [], equipmentBookings: [], personalVehicles: [] });
  const loaded = await storage.loadProjectState(CO, { force: true });
  const now = new Date().toISOString();
  const edited = {
    ...loaded,
    equipment: [{ id: 'eq1', name: 'Gravemaskin', updatedAt: now, createdAt: now }],
    board: [{ id: 'b1', projectId, title: 'Tavle', text: 'Husk', updatedAt: now, createdAt: now }],
    documents: [...loaded.documents, { id: 'd2', projectId, title: 'Mer', text: 'y'.repeat(60_000), updatedAt: now }],
  };
  await assert.rejects(() => storage.persistProjectState(edited, CO), /for store[\s\S]*Utstyr og produkter er lagret/);
  assert.deepEqual(store.get(SIDE).equipment.map((row) => row.id), ['eq1'], 'utstyret er lagret');
  assert.equal(cloud().board.length, 0, 'hoveddokumentet er urørt');
  const pending = await storage.pendingProjectChanges(CO);
  assert.equal(pending.length, 1);
  assert.deepEqual(Object.keys(pending[0].lists).sort(), ['board', 'documents'], 'bare hoveddokumentets del venter');

  // Brukeren fjerner det store vedlegget igjen: resten går gjennom.
  const smaller = { ...edited, documents: loaded.documents };
  await storage.persistProjectState(smaller, CO);
  assert.deepEqual(cloud().board.map((row) => row.id), ['b1']);
  assert.equal((await storage.pendingProjectChanges(CO)).length, 0);
}

// ── Standardverdier på prosjektene skrives ikke: 500 prosjekt får plass ─────

{
  // En prosjektimport skrev alle standardfeltene på hvert prosjekt (70 tomme fakturafelt),
  // og dokumentet ble 1761 kB. Lagringen ble avvist som for stor.
  reset();
  seedCloud(emptyProjectState());
  const loaded = await storage.loadProjectState(CO, { force: true });
  let next = loaded;
  for (let i = 0; i < 520; i += 1) {
    next = createProject(next, {
      name: `Prosjekt ${i} - rehabilitering av fasade og tak`,
      number: String(10000 + i),
      customerId: 'c1',
      client: 'Stavanger Kommune Bymiljø Og Utbygging',
      manager: 'Torbjørn Øgreid Coll',
      pricingModel: 'hourly',
      pricingSettings: i === 0 ? { hourlyRate: 1088, probability: 50 } : { hourlyRate: 1050 },
      invoiceSettings: i === 0 ? { creditDays: 30, showPeriod: false, theirReference: 'Ref 7' } : {},
      workSettings: i === 0 ? { showInAllTimesheets: true, requireDescription: false } : {},
    }).state;
  }
  assert.ok(JSON.stringify(normalizeProjectState(next).projects).length > 1_040_000, 'med alle standardfelt er det over grensen');
  await storage.persistProjectState(next, CO);
  const bytes = Buffer.byteLength(JSON.stringify(cloud()));
  assert.ok(bytes < 600_000, `prosjektdokumentet er ${bytes} byte`);
  assert.deepEqual(
    normalizeProjectState(cloud()).projects,
    normalizeProjectState(next).projects,
    'det som leses tilbake er det samme som ble lagret',
  );
  const first = normalizeProjectState(cloud()).projects.find((row) => row.number === '10000');
  assert.equal(first.invoiceSettings.creditDays, 30);
  assert.equal(first.invoiceSettings.showPeriod, false);
  assert.equal(first.invoiceSettings.markupHourly, null, 'tomt felt arver fortsatt fra selskapet');
  assert.equal(first.pricingSettings.probability, 50);
  assert.equal(first.workSettings.requireDescription, false);
  const stored = cloud().projects.find((row) => row.number === '10001');
  assert.deepEqual(stored.pricingSettings, { hourlyRate: 1050 }, 'bare det som avviker fra standard ligger i skyen');
  assert.equal(stored.invoiceSettings, undefined);
  assert.equal(stored.workSettings, undefined);
}

// ── REV-17: endringer uten kjent utgangspunkt forkastes ikke i det stille ───

{
  // Skyen mangler prosjektdokumentet: egen dagsnorm og prosedyrer lastes opp, ikke bare tomme felt.
  reset();
  const seeded = createProject(emptyProjectState(), { name: 'Hundre', number: '100' }).state;
  globalThis.__saveTestLocal.set(`protop.projectPlatform.v2.${CO}`, JSON.stringify(normalizeProjectState({
    ...seeded, fullDayHours: 7, fullDayHoursCustom: true, procedures: [{ id: 'pr1', title: 'Egen prosedyre' }],
  })));
  await storage.loadProjectState(CO, { force: true });
  await wait(30);
  assert.equal(cloud().fullDayHours, 7, 'dagsnormen er lastet opp');
  assert.equal(cloud().fullDayHoursCustom, true);
  assert.deepEqual(cloud().procedures.map((row) => row.id), ['pr1']);
  assert.equal(cloud().projects.length, 1);
}

{
  // En skjerm lagrer før den har lastet (ingen baseRev): skyen har noe annet. Brukeren får beskjed.
  reset();
  const { subscribeSaveToast, resetSaveToastForTests } = await import('../ui/saveToast.js');
  resetSaveToastForTests();
  const toasts = [];
  const stop = subscribeSaveToast((toast) => toasts.push(toast));
  seedCloud({ ...createProject(emptyProjectState(), { name: 'Hundre', number: '100' }).state, fullDayHours: 7, fullDayHoursCustom: true });
  await storage.persistProjectState({ ...emptyProjectState(), fullDayHours: 6, fullDayHoursCustom: true }, CO);
  assert.equal(cloud().fullDayHours, 7, 'skyen er ikke overskrevet uten kjent utgangspunkt');
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].kind, 'error');
  assert.equal(toasts[0].detail, storage.SKIPPED_CHANGES_TEXT);
  // Med kjent utgangspunkt går samme endring gjennom uten feil.
  const loaded = await storage.loadProjectState(CO, { force: true });
  await storage.persistProjectState({ ...loaded, fullDayHours: 6, fullDayHoursCustom: true }, CO);
  assert.equal(cloud().fullDayHours, 6);
  assert.equal(toasts.length, 1);
  stop();
  resetSaveToastForTests();
}

console.log('saveRegressions.test.mjs: ok');
