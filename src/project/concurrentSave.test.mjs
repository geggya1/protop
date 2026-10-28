/**
 * To brukere (eller to skjermer) som lagrer prosjektdokumentet samtidig.
 * Gjenskaper funnene fra revisjonen (DS-01, DS-02, DS-03, DS-11):
 *  - et slettet utlegg kommer tilbake fra en eldre kopi,
 *  - et prosjekt forsvinner når en eldre kopi lagres,
 *  - en eldre kopi av en time nullstiller faktura og status.
 * Firestore er et lite minnelager med transaksjoner. Hver «enhet» har egen modulinstans
 * og egen lokal lagring, men deler skyen.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const store = new Map();
globalThis.__projectTestStore = store;
globalThis.__projectTestOffline = false;
globalThis.__projectTestWrites = [];
globalThis.__projectTestLocal = new Map();

const MOCKS = {
  'firebase/firestore': `
    const store = globalThis.__projectTestStore;
    const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    function offline() {
      if (globalThis.__projectTestOffline) {
        const error = new Error('Failed to get document because the client is offline.');
        error.code = 'unavailable';
        throw error;
      }
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
    export const arrayUnion = (...items) => ({ __union: items });
    export async function addDoc(col, data) {
      offline();
      write(col.path + '/auto' + Math.random().toString(36).slice(2), data);
    }
    function write(path, data, opts = {}) {
      const next = opts.merge ? deepMerge(store.get(path), clone(data)) : clone(data);
      store.set(path, next);
      globalThis.__projectTestWrites.push(path);
    }
    export const doc = (db, ...parts) => ({ path: parts.join('/'), id: parts[parts.length - 1] });
    export const collection = (db, ...parts) => ({ path: parts.join('/') });
    export const serverTimestamp = () => 'ts';
    export async function getDoc(ref) {
      offline();
      const data = store.get(ref.path);
      return { id: ref.id, exists: () => data !== undefined, data: () => clone(data) };
    }
    export async function setDoc(ref, data, opts = {}) {
      offline();
      write(ref.path, data, opts);
    }
    export async function deleteDoc(ref) {
      offline();
      store.delete(ref.path);
    }
    export function writeBatch() {
      const ops = [];
      return {
        set(ref, data, opts) { ops.push([ref.path, data, opts]); },
        async commit() {
          offline();
          for (const [path, data, opts] of ops) write(path, data, opts);
        },
      };
    }
    export async function runTransaction(db, fn) {
      offline();
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
    const device = new URL(import.meta.url).searchParams.get('enhet') || 'felles';
    const all = globalThis.__projectTestLocal;
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
    if (/(^|\/)firebase\.js$/.test(specifier)) return { url: 'mock:firebase', shortCircuit: true };
    if (/firestoreAccess\.js$/.test(specifier)) return { url: 'mock:firestoreAccess', shortCircuit: true };
    if (specifier === '@react-native-async-storage/async-storage') {
      // Hver enhet har sin egen lokale lagring (storage.js?enhet=a osv.).
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
const deviceC = await import('./storage.js?enhet=c');
const {
  addBoardNote,
  createProject,
  emptyProjectState,
  mergeProjectStates,
  normalizeProjectState,
  removeRecord,
} = await import('./engine.js');
const { deleteExpense, upsertExpense } = await import('../economy/opsState.js');
const { applyProjectDiff, diffProjectStates } = await import('./stateDiff.js');
const { resetSaveToastForTests, subscribeSaveToast } = await import('../ui/saveToast.js');
const { timeEntryWrite } = await import('../economy/timeEntryStorage.js');

const CO = 'co-samtidig';
const MAIN = `families/${CO}/projects/state`;

function cloud() {
  return store.get(MAIN)?.state || {};
}

function seedCloud(state) {
  store.set(MAIN, { state: JSON.parse(JSON.stringify(normalizeProjectState(state))), updatedAt: 'ts' });
}

function expense(id, projectId, extra = {}) {
  return {
    id,
    projectId,
    date: '2026-10-01',
    description: `Utlegg ${id}`,
    amountExVat: 100,
    category: 'other',
    updatedAt: '2026-10-01T10:00:00.000Z',
    createdAt: '2026-10-01T10:00:00.000Z',
    ...extra,
  };
}

function wait(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function reset() {
  store.clear();
  globalThis.__projectTestWrites.length = 0;
  globalThis.__projectTestOffline = false;
  for (const device of [deviceA, deviceB, deviceC]) device.clearProjectStateMemory();
  globalThis.__projectTestLocal.clear();
}

// ── Rene hjelpere ──────────────────────────────────────────────────────────

// Revisjonen, punkt 1: et slettet utlegg kom tilbake når den lokale kopien ble slått sammen.
{
  const base = createProject(emptyProjectState(), { name: 'P', number: '100', customerId: 'k1' });
  const project = base.state.projects[0];
  const local = { ...base.state, expenses: [expense('E1', project.id)], syncedAt: '2026-10-01T10:00:00Z' };
  const removed = deleteExpense(local, 'E1');
  assert.equal(removed.ok, true);
  assert.deepEqual(removed.state.deletedRows.map((row) => `${row.key}:${row.id}`), ['expenses:E1']);
  const merged = mergeProjectStates(local, { ...removed.state, syncedAt: '2026-10-27T10:00:00Z' });
  assert.deepEqual(merged.expenses.map((row) => row.id), [], 'slettet utlegg skal ikke komme tilbake');
  const mergedOtherWay = mergeProjectStates({ ...removed.state, syncedAt: '2026-10-27T10:00:00Z' }, local);
  assert.deepEqual(mergedOtherWay.expenses.map((row) => row.id), [], 'uavhengig av rekkefølge');

  // removeRecord merker også slettingen.
  const note = addBoardNote(base.state, { projectId: project.id, title: 'Tavle', text: 'Husk' });
  const noteId = note.state.board[0]?.id;
  assert.ok(noteId, 'tavlenotat opprettet');
  const gone = removeRecord(note.state, 'board', noteId);
  assert.deepEqual(mergeProjectStates(note.state, gone.state).board, []);

  // Endret etter slettingen (nyere updatedAt): raden blir stående.
  const edited = { ...local, expenses: [expense('E1', project.id, { updatedAt: '2099-01-01T00:00:00.000Z' })] };
  assert.equal(mergeProjectStates(removed.state, edited).expenses.length, 1);
}

// Endringer regnes mot versjonen skjermen lastet, og legges på ferske data.
{
  const base = normalizeProjectState(createProject(emptyProjectState(), { name: 'P', number: '100' }).state);
  const mine = normalizeProjectState({ ...base, expenses: [expense('E2', base.projects[0].id)] });
  const diff = diffProjectStates(base, mine);
  assert.deepEqual(Object.keys(diff.lists), ['expenses']);
  assert.deepEqual(Object.keys(diff.fields), []);
  // Skyen har fått et prosjekt fra en annen bruker. Det skal stå igjen.
  const fresh = normalizeProjectState(createProject(base, { name: 'P2', number: '200' }).state);
  const applied = normalizeProjectState(applyProjectDiff(fresh, diff));
  assert.deepEqual(applied.projects.map((row) => row.number).sort(), ['100', '200']);
  assert.deepEqual(applied.expenses.map((row) => row.id), ['E2']);
  // Ingen endring: ingenting å skrive.
  const none = diffProjectStates(base, normalizeProjectState(base));
  assert.deepEqual([Object.keys(none.lists), Object.keys(none.fields), none.deletedRows], [[], [], []]);
}

// ── Lagring mot skyen ─────────────────────────────────────────────────────

// Revisjonen, punkt 2: B har listen fra kl. 08. A legger til prosjekt 200. B lagrer: 200 skal stå.
{
  reset();
  seedCloud(createProject(emptyProjectState(), { name: 'Hundre', number: '100' }).state);
  const atEight = await deviceB.loadProjectState(CO, { force: true });
  assert.deepEqual(atEight.projects.map((row) => row.number), ['100']);

  const a = await deviceA.loadProjectState(CO, { force: true });
  await deviceA.persistProjectState(createProject(a, { name: 'To hundre', number: '200' }).state, CO);
  assert.deepEqual(cloud().projects.map((row) => row.number).sort(), ['100', '200']);

  // B fører et utlegg fra timelisten (sideskjemaet) med den gamle kopien.
  const withExpense = upsertExpense(atEight, { ...expense('E-B', atEight.projects[0].id), id: '' });
  assert.equal(withExpense.ok, true, withExpense.error);
  await deviceB.persistProjectState(withExpense.state, CO);
  assert.deepEqual(cloud().projects.map((row) => row.number).sort(), ['100', '200'], 'prosjekt 200 er ikke borte');
  assert.equal(cloud().expenses.length, 1);

  // B fører bare timer: prosjektdokumentet skrives ikke i det hele tatt.
  const writesBefore = globalThis.__projectTestWrites.filter((path) => path === MAIN).length;
  const hoursOnly = {
    ...withExpense.state,
    timeEntries: [{
      id: 't-b',
      projectId: atEight.projects[0].id,
      employeeId: 'e1',
      date: '2026-10-27',
      hours: 7.5,
      updatedAt: '2026-10-27T11:00:00.000Z',
    }],
  };
  await deviceB.persistProjectState(hoursOnly, CO);
  assert.equal(globalThis.__projectTestWrites.filter((path) => path === MAIN).length, writesBefore,
    'en ren timeføring skal ikke skrive projects/state');
  assert.ok(store.get(`families/${CO}/timeEntries/t-b`), 'timen ligger i egen samling');
}

// Revisjonen, punkt 1 mot skyen: A sletter utlegget, B (eldre kopi) lagrer noe annet.
{
  reset();
  const seeded = createProject(emptyProjectState(), { name: 'Hundre', number: '100' }).state;
  seedCloud({ ...seeded, expenses: [expense('E1', seeded.projects[0].id)] });
  const stale = await deviceB.loadProjectState(CO, { force: true });
  assert.equal(stale.expenses.length, 1);

  const a = await deviceA.loadProjectState(CO, { force: true });
  await deviceA.persistProjectState(deleteExpense(a, 'E1').state, CO);
  assert.equal(cloud().expenses.length, 0);
  assert.ok(cloud().deletedRows.some((row) => row.key === 'expenses' && row.id === 'E1'));

  const note = addBoardNote(stale, { projectId: stale.projects[0].id, title: 'Fra B', text: 'Notat' });
  await deviceB.persistProjectState(note.state, CO);
  assert.deepEqual(cloud().expenses.map((row) => row.id), [], 'slettet utlegg kommer ikke tilbake');
  assert.equal(cloud().board.length, 1);

  // En eldre klient (før rettingen) skriver hele listen med utlegget tilbake.
  // Slettemarkeringen blir liggende (merge), og nye klienter holder utlegget ute.
  store.get(MAIN).state.expenses = [expense('E1', seeded.projects[0].id)];
  deviceC.clearProjectStateMemory(CO);
  const fresh = await deviceC.loadProjectState(CO, { force: true });
  assert.deepEqual(fresh.expenses.map((row) => row.id), []);
}

// To skjermer på samme enhet: den gamle skjermen lagrer etter at den nye har lagt til et utlegg.
{
  reset();
  seedCloud(createProject(emptyProjectState(), { name: 'Hundre', number: '100' }).state);
  const projectScreen = await deviceA.loadProjectState(CO, { force: true });
  const opsScreen = await deviceA.loadProjectState(CO);
  const added = upsertExpense(opsScreen, { ...expense('E-ops', opsScreen.projects[0].id), id: '' });
  await deviceA.persistProjectState(added.state, CO);
  const note = addBoardNote(projectScreen, { projectId: projectScreen.projects[0].id, title: 'Tavle', text: 'Gammel skjerm' });
  await deviceA.persistProjectState(note.state, CO);
  assert.equal(cloud().expenses.length, 1, 'utlegget fra den andre skjermen står');
  assert.equal(cloud().board.length, 1);

  // Neste endring på samme skjerm sender bare det nye.
  const second = addBoardNote(note.state, { projectId: projectScreen.projects[0].id, title: 'To', text: 'Andre' });
  await deviceA.persistProjectState(second.state, CO);
  assert.equal(cloud().board.length, 2);
  assert.equal(cloud().expenses.length, 1);
}

// Lagring rett etter lasting skriver ingenting (DS-02).
{
  reset();
  seedCloud(createProject(emptyProjectState(), { name: 'Hundre', number: '100' }).state);
  const loaded = await deviceA.loadProjectState(CO, { force: true });
  const before = JSON.stringify(store.get(MAIN));
  const writes = globalThis.__projectTestWrites.length;
  await deviceA.persistProjectState(loaded, CO);
  assert.equal(globalThis.__projectTestWrites.length, writes);
  assert.equal(JSON.stringify(store.get(MAIN)), before);
}

// Uten nett: endringen ligger i køen på enheten, feilen vises, og den sendes ved neste lasting.
{
  reset();
  resetSaveToastForTests();
  const toasts = [];
  const stop = subscribeSaveToast((toast) => toasts.push(toast));
  seedCloud(createProject(emptyProjectState(), { name: 'Hundre', number: '100' }).state);
  const loaded = await deviceC.loadProjectState(CO, { force: true });
  globalThis.__projectTestOffline = true;
  const added = upsertExpense(loaded, { ...expense('E-offline', loaded.projects[0].id), id: '' });
  await deviceC.saveProjectState(added.state, CO);
  await wait(600);
  assert.equal(toasts.length, 1, 'feilen vises én gang');
  assert.equal(toasts[0].kind, 'error');
  assert.match(toasts[0].detail, /denne enheten/);
  assert.equal((await deviceC.pendingProjectChanges(CO)).length, 1);
  assert.equal(cloud().expenses.length, 0);

  // Appen startes på nytt uten nett: den lokale kopien er reserve.
  deviceC.clearProjectStateMemory(CO);
  const offlineLoad = await deviceC.loadProjectState(CO, { force: true });
  assert.equal(deviceC.projectLoadMeta(CO), 'error');
  assert.deepEqual(offlineLoad.expenses.map((row) => row.description), ['Utlegg E-offline']);

  // Nettet er tilbake. En annen bruker har lagt til et prosjekt i mellomtiden.
  globalThis.__projectTestOffline = false;
  const other = await deviceA.loadProjectState(CO, { force: true });
  await deviceA.persistProjectState(createProject(other, { name: 'To hundre', number: '200' }).state, CO);
  deviceC.clearProjectStateMemory(CO);
  const online = await deviceC.loadProjectState(CO, { force: true });
  assert.equal(online.expenses.length, 1, 'ventende endring vises med en gang');
  await wait(50);
  assert.equal(cloud().expenses.length, 1, 'ventende endring er sendt');
  assert.deepEqual(cloud().projects.map((row) => row.number).sort(), ['100', '200']);
  assert.equal((await deviceC.pendingProjectChanges(CO)).length, 0);
  stop();
  resetSaveToastForTests();
}

// Dokumentstørrelsen logges, og et for stort dokument stopper med tydelig feil.
{
  reset();
  seedCloud(createProject(emptyProjectState(), { name: 'Hundre', number: '100' }).state);
  const loaded = await deviceA.loadProjectState(CO, { force: true });
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const big = { ...loaded, documents: [{ id: 'd1', projectId: loaded.projects[0].id, title: 'Stor', text: 'x'.repeat(750_000) }] };
    await deviceA.persistProjectState(big, CO);
    assert.ok(deviceA.projectDocSize(CO) > 700_000);
    assert.ok(warnings.some((line) => /kB/.test(line)), 'varsel over 700 kB');
    const huge = { ...big, documents: [...big.documents, { id: 'd2', projectId: loaded.projects[0].id, title: 'Enda større', text: 'y'.repeat(400_000) }] };
    await assert.rejects(() => deviceA.persistProjectState(huge, CO), /for store/);
    assert.equal(cloud().documents.length, 1, 'skyen er urørt');
    assert.equal((await deviceA.pendingProjectChanges(CO)).length, 1, 'endringen ligger i køen');
  } finally {
    console.warn = warn;
  }
}

// patchProjectOperations regner på skyens ferske kopi i transaksjonen.
{
  reset();
  const seeded = createProject(emptyProjectState(), { name: 'Hundre', number: '100' }).state;
  seedCloud({ ...seeded, expenses: [expense('E1', seeded.projects[0].id)] });
  await deviceA.loadProjectState(CO, { force: true });
  const b = await deviceB.loadProjectState(CO, { force: true });
  await deviceB.persistProjectState(upsertExpense(b, { ...expense('E2', b.projects[0].id), id: '' }).state, CO);
  const patched = await deviceA.patchProjectOperations(CO, (fresh) => ({
    expenses: fresh.expenses.map((row) => (row.id === 'E1' ? { ...row, status: 'approved', updatedAt: new Date().toISOString() } : row)),
  }));
  assert.equal(patched.ok, true);
  assert.equal(cloud().expenses.length, 2, 'utlegget fra B står');
  assert.equal(cloud().expenses.find((row) => row.id === 'E1').status, 'approved');
  assert.equal(deviceA.peekProjectState(CO).expenses.length, 2, 'minnet får skyens liste');
}

// DS-11: en eldre kopi av en time nullstiller ikke faktura og status.
{
  const read = {
    id: 't1', projectId: 'p1', employeeId: 'e1', date: '2026-10-01', hours: 4, description: 'Før', updatedAt: '2026-10-01T10:00:00Z',
  };
  const edited = { ...read, description: 'Rettet', updatedAt: '2026-10-28T10:00:00Z' };
  const patch = timeEntryWrite(read, edited);
  assert.deepEqual(Object.keys(patch).sort(), ['date', 'description', 'employeeId', 'id', 'projectId', 'updatedAt']);
  assert.equal(timeEntryWrite(read, read), null, 'uendret rad skrives ikke');
  assert.equal(timeEntryWrite(null, edited).invoiceId, null, 'ny rad skrives hel');

  reset();
  const ref = `families/${CO}/timeEntries/t1`;
  store.set(ref, { ...read, invoiceId: 'F-17', status: 'godkjent' });
  const { saveTimeEntries } = await import('../economy/timeEntryStorage.js');
  await saveTimeEntries(CO, [edited], { previous: [{ ...read, invoiceId: null, status: 'registrert' }] });
  assert.equal(store.get(ref).description, 'Rettet');
  assert.equal(store.get(ref).invoiceId, 'F-17', 'fakturakoblingen står');
  assert.equal(store.get(ref).status, 'godkjent', 'godkjenningen står');
}

// L-13: endringshistorikken legges til som én ny rad. En eldre kopi fjerner ikke andres rader.
{
  reset();
  const ref = `families/${CO}/timeEntries/t2`;
  const otherRow = { at: '2026-10-27T08:00:00Z', kind: 'changed', byUid: 'u-annen', byName: 'Annen', changes: [{ field: 'hours', from: '6', to: '7' }] };
  const read = { id: 't2', projectId: 'p1', employeeId: 'e1', date: '2026-10-01', hours: 7, description: 'Før', createdByUid: 'u1' };
  // Skyen har fått en rad fra en annen bruker etter at kopien ble lest.
  store.set(ref, { ...read, history: [otherRow] });
  const { saveTimeEntries } = await import('../economy/timeEntryStorage.js');
  await saveTimeEntries(CO, [{ ...read, hours: 8 }], { previous: [read] });
  const history = store.get(ref).history;
  assert.equal(history.length, 2, 'raden fra den andre står');
  assert.deepEqual(history[0], otherRow);
  assert.equal(history[1].kind, 'changed');
  assert.equal(history[1].byUid, 'u1');
  assert.deepEqual(history[1].changes, [{ field: 'hours', from: '7', to: '8' }]);
  // Uten endring i sporede felt: ingen ny rad.
  await saveTimeEntries(CO, [{ ...read, hours: 8, internalNote: 'notat' }], { previous: [{ ...read, hours: 8 }] });
  assert.equal(store.get(ref).history.length, 2);
  // Ny føring (ikke i previous): «Ført».
  await saveTimeEntries(CO, [{ ...read, id: 't3' }], { previous: [read] });
  assert.equal(store.get(`families/${CO}/timeEntries/t3`).history[0].kind, 'created');
  // Uten kjent forrige versjon skrives ingen historikk, og serverens historikk står.
  await saveTimeEntries(CO, [{ ...read, hours: 9 }]);
  assert.equal(store.get(ref).history.length, 2);
  assert.equal(store.get(ref).hours, 9);
  // Sletting spores i timeEntryDeletions.
  const { removeTimeEntry } = await import('../economy/timeEntryStorage.js');
  await removeTimeEntry(CO, 't3', { entry: { ...read, id: 't3' } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const deletions = [...store.entries()].filter(([path]) => path.startsWith(`families/${CO}/timeEntryDeletions/`));
  assert.equal(deletions.length, 1);
  assert.equal(deletions[0][1].entryId, 't3');
  assert.equal(deletions[0][1].kind, 'deleted');
  assert.equal(deletions[0][1].byUid, 'u1');
  assert.equal(store.has(`families/${CO}/timeEntries/t3`), false);
}

console.log('concurrentSave.test.mjs: ok');
