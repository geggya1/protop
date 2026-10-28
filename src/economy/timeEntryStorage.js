/**
 * Lagring av timeføringer: Firestore families/{companyId}/timeEntries/{id}
 * + lett AsyncStorage-cache for liste.
 *
 * Holdes utenfor prosjekt-monolitten (families/.../projects/state) fordi
 * ~30k føringer sprenger Firestore sitt 1 MiB-dokumenttak — da feiler lagring
 * stille og timer forsvinner etter refresh.
 *
 * Lesing er vindusbasert (dato / ansatt) — full getDocs av hele selskapet
 * brukes bare når eksplisitt bedt om (`all: true`).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeTimeEntryRow } from '../project/engine.js';
import { projectLookupNumbers } from '../project/projectFields.js';
import { aliasSourceIds } from '../project/companyAlias.js';
import { changedByOther, deletedTimeEntryRecord, withTimeEntryHistory } from '../arbeid/timeEntryHistory.js';
import { text } from './invoices.js';

const LIST_KEY = 'protop.timeEntries.v1';
const WINDOW_KEY = 'protop.timeEntries.window.v1';
const BATCH_SIZE = 400;

function listKey(companyId) {
  return `${LIST_KEY}.${companyId}`;
}

function windowKey(companyId, fromDate, toDate, employeeId) {
  return `${WINDOW_KEY}.${companyId}.${fromDate || ''}_${toDate || ''}_${employeeId || ''}`;
}

async function firestoreBits() {
  const [{
    addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, where, writeBatch,
  }, { auth, db }] = await Promise.all([
    import('firebase/firestore'),
    import('../../firebase.js'),
  ]);
  return {
    addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, where, writeBatch, db, auth,
  };
}

/** Den innloggede, til endringshistorikken. */
function currentActor(bits) {
  const user = bits?.auth?.currentUser;
  if (!user?.uid) return null;
  return { uid: user.uid, name: text(user.displayName) || text(user.email) };
}

/**
 * Datovindu. Ved manglende sammensatt indeks: hent bare den ansatte og filtrer
 * lokalt. Hele selskapets timehistorikk lastes ikke som reserve.
 */
function missingQueryIndex(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code.includes('failed-precondition') || /index/i.test(message);
}

async function loadWindowEntries(bits, companyId, range) {
  try {
    return await queryTimeEntries(bits, companyId, range);
  } catch (error) {
    const emp = text(range.employeeId);
    if (!missingQueryIndex(error) || !emp || !(text(range.fromDate) || text(range.toDate))) throw error;
    const byEmployee = await queryTimeEntries(bits, companyId, { employeeId: emp });
    return filterTimeEntriesByRange(byEmployee, range);
  }
}

function entryRef(bits, companyId, entryId) {
  return bits.doc(bits.db, 'families', companyId, 'timeEntries', entryId);
}

function entriesCol(bits, companyId) {
  return bits.collection(bits.db, 'families', companyId, 'timeEntries');
}

function toCacheRow(row) {
  return normalizeTimeEntryRow(row);
}

export function filterTimeEntriesByRange(rows, { fromDate = '', toDate = '', employeeId = '' } = {}) {
  const from = text(fromDate);
  const to = text(toDate);
  const emp = text(employeeId);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!row) return false;
    if (emp && text(row.employeeId) !== emp) return false;
    const date = text(row.date);
    if (from && date && date < from) return false;
    if (to && date && date > to) return false;
    return true;
  });
}

async function readLocal(companyId) {
  if (!companyId) return [];
  try {
    const raw = await AsyncStorage.getItem(listKey(companyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return (Array.isArray(parsed) ? parsed : []).map((row) => normalizeTimeEntryRow(row)).filter(Boolean);
  } catch {
    return [];
  }
}

async function readLocalWindow(companyId, opts = {}) {
  if (!companyId) return [];
  const fromDate = text(opts.fromDate);
  const toDate = text(opts.toDate);
  const employeeId = text(opts.employeeId);
  if (!fromDate && !toDate && !employeeId) return readLocal(companyId);
  try {
    const raw = await AsyncStorage.getItem(windowKey(companyId, fromDate, toDate, employeeId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return (Array.isArray(parsed) ? parsed : []).map((row) => normalizeTimeEntryRow(row)).filter(Boolean);
    }
  } catch {
    // fall through
  }
  // Eldre full-cache: filtrer lokalt (kan være tom / for stor).
  return filterTimeEntriesByRange(await readLocal(companyId), opts);
}

async function writeLocal(companyId, rows) {
  if (!companyId) return;
  const list = (Array.isArray(rows) ? rows : []).map(toCacheRow).filter(Boolean);
  // Unngå å sprenge AsyncStorage med titusenvis av rader.
  if (list.length > 4000) return;
  try {
    await AsyncStorage.setItem(listKey(companyId), JSON.stringify(list));
  } catch {
    // Cache er best-effort — Firestore er fasit.
  }
}

async function writeLocalWindow(companyId, rows, opts = {}) {
  if (!companyId) return;
  const fromDate = text(opts.fromDate);
  const toDate = text(opts.toDate);
  const employeeId = text(opts.employeeId);
  if (!fromDate && !toDate && !employeeId) {
    await writeLocal(companyId, rows);
    return;
  }
  const list = (Array.isArray(rows) ? rows : []).map(toCacheRow).filter(Boolean);
  // Samme tak som full-cachen — en kjempestor JSON-skriving låser tråden.
  if (list.length > 4000) return;
  try {
    await AsyncStorage.setItem(
      windowKey(companyId, fromDate, toDate, employeeId),
      JSON.stringify(list),
    );
  } catch {
    // best-effort
  }
}

/** Lokal vinduscache, uten nett. Brukes til å tegne timelisten før Firestore svarer. */
export async function readCachedTimeEntries(companyId, opts = {}) {
  if (!companyId) return [];
  await hydrateDeletedTimeEntries(companyId);
  const range = {
    fromDate: text(opts.fromDate),
    toDate: text(opts.toDate),
    employeeId: text(opts.employeeId),
  };
  const exact = await readLocalWindow(companyId, range);
  if (exact.length || !range.employeeId) return withoutDeletedTimeEntries(companyId, exact);
  const wider = await readLocalWindow(companyId, { fromDate: range.fromDate, toDate: range.toDate });
  return withoutDeletedTimeEntries(companyId, filterTimeEntriesByRange(wider, range));
}

function mergeEntryLists(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const row of Array.isArray(list) ? list : []) {
      const next = normalizeTimeEntryRow(row);
      if (!next?.id) continue;
      const prev = byId.get(next.id);
      if (!prev) {
        byId.set(next.id, next);
        continue;
      }
      const tNext = Date.parse(next.updatedAt || next.createdAt || '') || 0;
      const tPrev = Date.parse(prev.updatedAt || prev.createdAt || '') || 0;
      byId.set(next.id, tNext >= tPrev ? { ...prev, ...next } : { ...next, ...prev });
    }
  }
  return [...byId.values()];
}

/**
 * Timene til et prosjekt: på prosjekt-id og på prosjektnummer. Id-en finner timene også
 * etter at prosjektet har fått nytt nummer; nummeret finner importerte timer uten id.
 */
export function projectHoursQuery(project) {
  const projectId = text(project?.id);
  return { projectId, projectNumbers: projectLookupNumbers(project) };
}

function projectNumberList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => text(item)).filter(Boolean))].slice(0, 10);
}

function rowsFromDocs(docs) {
  const byId = new Map();
  for (const item of docs || []) {
    const row = normalizeTimeEntryRow({ ...item.data(), id: item.id });
    if (row?.id) byId.set(row.id, row);
  }
  return [...byId.values()];
}

async function docsForProjectNumbers(bits, col, numbers) {
  if (!numbers.length) return [];
  try {
    const q = numbers.length === 1
      ? bits.query(col, bits.where('projectNumber', '==', numbers[0]))
      : bits.query(col, bits.where('projectNumber', 'in', numbers));
    const snap = await bits.getDocs(q);
    return snap.docs;
  } catch {
    const docs = [];
    for (const number of numbers) {
      const snap = await bits.getDocs(bits.query(col, bits.where('projectNumber', '==', number)));
      docs.push(...snap.docs);
    }
    return docs;
  }
}

async function queryTimeEntries(bits, companyId, {
  fromDate = '',
  toDate = '',
  employeeId = '',
  projectId = '',
  projectNumbers = [],
} = {}) {
  const col = entriesCol(bits, companyId);
  const from = text(fromDate);
  const to = text(toDate);
  const emp = text(employeeId);
  const project = text(projectId);
  const numbers = projectNumberList(projectNumbers);
  // Ett felt om gangen. projectId+dato krever sammensatt indeks vi ikke har,
  // og et prosjekt skal uansett vise timer eldre enn uke-vinduet.
  if (project || numbers.length) {
    const jobs = [];
    if (project) jobs.push(bits.getDocs(bits.query(col, bits.where('projectId', '==', project))));
    if (numbers.length) jobs.push(docsForProjectNumbers(bits, col, numbers).then((docs) => ({ docs })));
    const snaps = await Promise.all(jobs);
    const docs = snaps.flatMap((snap) => snap.docs || []);
    return filterTimeEntriesByRange(rowsFromDocs(docs), { fromDate: from, toDate: to, employeeId: emp });
  }
  const clauses = [];
  if (emp) clauses.push(bits.where('employeeId', '==', emp));
  if (from) clauses.push(bits.where('date', '>=', from));
  if (to) clauses.push(bits.where('date', '<=', to));
  const q = clauses.length ? bits.query(col, ...clauses) : col;
  const snap = await bits.getDocs(q);
  return snap.docs
    .map((item) => normalizeTimeEntryRow({ ...item.data(), id: item.id }))
    .filter(Boolean);
}

/**
 * @param {string} companyId
 * @param {{ fromDate?: string, toDate?: string, employeeId?: string, projectId?: string, projectNumbers?: string[], all?: boolean }} [opts]
 */
export async function loadTimeEntries(companyId, opts = {}) {
  if (!companyId) return [];
  await hydrateDeletedTimeEntries(companyId);
  const projectId = text(opts.projectId);
  const projectNumbers = projectNumberList(opts.projectNumbers);
  const projectScoped = !!(projectId || projectNumbers.length);
  const all = opts.all === true
    || (!projectScoped && !text(opts.fromDate) && !text(opts.toDate) && !text(opts.employeeId) && opts.all !== false);
  // Explicit all:false without range → empty (caller must pass window).
  if (!all && !projectScoped && !text(opts.fromDate) && !text(opts.toDate) && !text(opts.employeeId)) {
    return [];
  }

  const range = {
    fromDate: text(opts.fromDate),
    toDate: text(opts.toDate),
    employeeId: text(opts.employeeId),
    projectId,
    projectNumbers,
  };

  try {
    const bits = await firestoreBits();
    if (all) {
      const snap = await bits.getDocs(entriesCol(bits, companyId));
      const rows = snap.docs
        .map((item) => normalizeTimeEntryRow({ ...item.data(), id: item.id }))
        .filter(Boolean);
      return finishLoadedEntries(companyId, rows, (clean) => writeLocal(companyId, clean));
    }
    try {
      const rows = await loadWindowEntries(bits, companyId, range);
      // Prosjektutvalg skal ikke overskrive uke-cachen med bare disse radene.
      const persist = projectScoped
        ? () => {}
        : (clean) => writeLocalWindow(companyId, clean, range);
      return finishLoadedEntries(companyId, rows, persist);
    } catch {
      // Ikke last hele samlingen når vindus-spørringen feiler — det låser appen.
      const cached = await readLocalWindow(companyId, range);
      return withoutDeletedTimeEntries(companyId, cached);
    }
  } catch {
    const cached = all ? await readLocal(companyId) : await readLocalWindow(companyId, range);
    return withoutDeletedTimeEntries(companyId, cached);
  }
}

/** Feltene som alltid skrives, så dokumentet er en gyldig føring selv om bare én ting er endret. */
const ENTRY_IDENTITY_KEYS = ['id', 'projectId', 'employeeId', 'date'];

/**
 * Bare feltene som er endret siden raden ble lest (pluss id, prosjekt, ansatt og dato).
 * En eldre kopi skal ikke nullstille invoiceId, status eller låsing som andre har satt,
 * eller overskrive felt den ikke har rørt. Uten forrige versjon skrives hele raden.
 */
export function timeEntryWrite(previous, next) {
  const row = normalizeTimeEntryRow(next);
  if (!row?.id) return null;
  const prev = previous ? normalizeTimeEntryRow(previous) : null;
  if (!prev || prev.id !== row.id) return row;
  const patch = {};
  for (const [key, value] of Object.entries(row)) {
    if (ENTRY_IDENTITY_KEYS.includes(key) || JSON.stringify(prev[key] ?? null) !== JSON.stringify(value ?? null)) {
      patch[key] = value;
    }
  }
  return Object.keys(patch).length > ENTRY_IDENTITY_KEYS.length ? patch : null;
}

function withoutHistory(row) {
  if (!row || typeof row !== 'object') return row;
  const { history: _history, ...rest } = row;
  return rest;
}

/**
 * Hva som skrives for én føring (L-13): de endrede feltene (timeEntryWrite) og én ny rad
 * i endringshistorikken. history skrives aldri som hel liste fra klienten, bare som én ny
 * rad (arrayUnion hos kalleren), så en eldre kopi ikke kan fjerne andres rader.
 * known = forrige versjon er kjent (previous ble sendt med): en føring som ikke fantes
 * der, er ny. Uten kjent forrige versjon skrives ingen historikk.
 * notifyUid: den som førte timen, når en annen endrer den.
 */
export function timeEntryWritePlan(previous, next, { known = false, actor = null, at = '', reason = '' } = {}) {
  const write = timeEntryWrite(previous, next);
  if (!write?.id) return null;
  const patch = withoutHistory(write);
  let historyRow = null;
  if (previous || known) {
    // Sammenlign normaliserte rader, så standardverdier (status, timetype) ikke ser ut som endringer.
    const before = previous ? withoutHistory(normalizeTimeEntryRow(previous)) : null;
    const after = withoutHistory(normalizeTimeEntryRow(next));
    const tracked = withTimeEntryHistory(before, after, { actor, at, reason });
    historyRow = Array.isArray(tracked?.history) ? tracked.history[tracked.history.length - 1] || null : null;
    // Fakturerbare timer som bare følger timene, er ikke en egen endring.
    if (historyRow?.changes && before && Number(before.billableHours) === Number(before.hours)
      && Number(after.billableHours) === Number(after.hours)) {
      const changes = historyRow.changes.filter((change) => change.field !== 'billableHours');
      historyRow = changes.length ? { ...historyRow, changes } : null;
    }
  }
  const notifyUid = historyRow && previous && changedByOther(previous, actor?.uid) ? text(previous.createdByUid) : '';
  return { id: patch.id, patch, historyRow, notifyUid };
}

/** Én beskjed per person når en annen har endret timene deres. Feiler stille. */
async function notifyChangedEntries(companyId, plans, actor) {
  const byUid = new Map();
  for (const plan of plans) {
    if (!plan.notifyUid) continue;
    byUid.set(plan.notifyUid, (byUid.get(plan.notifyUid) || 0) + 1);
  }
  if (!byUid.size) return;
  try {
    const { notifyUsers } = await import('../utils/notifications.js');
    const who = text(actor?.name) || 'En leder';
    await Promise.all([...byUid.entries()].map(([uid, count]) => notifyUsers([uid], {
      eventType: 'timeEntryChanged',
      title: 'Timene dine er endret',
      body: `${who} har endret ${count === 1 ? 'en timeføring' : `${count} timeføringer`} du førte. Se endringene på timen.`,
      familyId: companyId,
      createdBy: actor?.uid || null,
    })));
  } catch {
    // Beskjeden er et tillegg. Historikken står på timen uansett.
  }
}

async function writeBatchSet(companyId, entries, onProgress, previous = null, { reason = '' } = {}) {
  const bits = await firestoreBits();
  const list = withoutDeletedTimeEntries(companyId, entries);
  const known = Array.isArray(previous);
  const before = new Map(
    (known ? previous : [])
      .filter((row) => row?.id)
      .map((row) => [text(row.id), row]),
  );
  const actor = currentActor(bits);
  const at = new Date().toISOString();
  const plans = [];
  let batch = bits.writeBatch(bits.db);
  let n = 0;
  let done = 0;
  const total = list.length;
  for (const entry of list) {
    const plan = timeEntryWritePlan(before.get(text(entry?.id)), entry, { known, actor, at, reason });
    if (!plan) continue;
    plans.push(plan);
    const next = plan.historyRow ? { ...plan.patch, history: bits.arrayUnion(plan.historyRow) } : plan.patch;
    batch.set(entryRef(bits, companyId, next.id), next, { merge: true });
    n += 1;
    done += 1;
    if (n >= BATCH_SIZE) {
      await batch.commit();
      batch = bits.writeBatch(bits.db);
      n = 0;
      onProgress?.(done, total);
    }
  }
  if (n) {
    await batch.commit();
    onProgress?.(done, total);
  }
  notifyChangedEntries(companyId, plans, actor);
}

/**
 * Lagrer timeføringer til egen subcollection. Kaster ved feil —
 * UI skal ikke vise «lagret» hvis skyen avviser.
 * previous: radene slik de ble lest. Da skrives bare feltene som er endret.
 */
export async function saveTimeEntries(companyId, entries, { onProgress, previous = null, reason = '' } = {}) {
  if (!companyId) throw new Error('Mangler selskap for timelagring.');
  await hydrateDeletedTimeEntries(companyId);
  const list = withoutDeletedTimeEntries(companyId, (Array.isArray(entries) ? entries : [])
    .map((row) => normalizeTimeEntryRow({
      ...row,
      updatedAt: text(row?.updatedAt) || new Date().toISOString(),
      createdAt: text(row?.createdAt) || new Date().toISOString(),
    }))
    .filter(Boolean));
  if (!list.length) return { saved: 0, entries: [] };
  await writeBatchSet(companyId, list, onProgress, previous, { reason });
  const current = await readLocal(companyId);
  await writeLocal(companyId, mergeEntryLists(current, list));
  return { saved: list.length, entries: list };
}

export async function saveTimeEntryImport(companyId, entries, { onProgress } = {}) {
  if (!companyId) throw new Error('Mangler selskap for timeimport.');
  const list = (Array.isArray(entries) ? entries : []).map((row) => normalizeTimeEntryRow(row)).filter(Boolean);
  if (!list.length) throw new Error('Ingen timer å lagre.');
  // Importerte føringer er nye: historikken viser at de kom fra importen.
  return saveTimeEntries(companyId, list, { onProgress, previous: [], reason: 'Import' });
}

/**
 * Frigjør konkrete timeposter knyttet til en slettet faktura.
 * Henter bare disse id-ene — ikke hele timehistorikken.
 */
export async function releaseTimeEntriesFromInvoice(companyId, invoiceId, entryIds = []) {
  const id = text(companyId);
  const invoice = text(invoiceId);
  const ids = [...new Set((entryIds || []).map((row) => text(row)).filter(Boolean))];
  if (!id || !invoice || !ids.length) return { released: 0 };
  const bits = await firestoreBits();
  const stamp = new Date().toISOString();
  const updates = [];
  const previous = [];
  for (const entryId of ids) {
    const snap = await bits.getDoc(entryRef(bits, id, entryId));
    if (!snap.exists()) continue;
    const row = snap.data() || {};
    previous.push({ ...row, id: snap.id });
    const linked = text(row.invoiceId);
    if (linked && linked !== invoice) continue;
    updates.push({
      ...row,
      id: snap.id,
      invoiceId: '',
      status: row.status === 'låst' ? 'godkjent' : row.status,
      updatedAt: stamp,
    });
  }
  if (!updates.length) return { released: 0 };
  await saveTimeEntries(id, updates, { previous, reason: 'Fakturaen er slettet' });
  return { released: updates.length };
}

/** Henter konkrete timeføringer, én og én. Ukjente id-er hoppes over. */
export async function loadTimeEntriesByIds(companyId, entryIds = []) {
  const id = text(companyId);
  const ids = [...new Set((entryIds || []).map((row) => text(row)).filter(Boolean))];
  if (!id || !ids.length) return [];
  const bits = await firestoreBits();
  const rows = [];
  for (const entryId of ids) {
    const snap = await bits.getDoc(entryRef(bits, id, entryId));
    if (!snap.exists()) continue;
    const row = normalizeTimeEntryRow({ ...snap.data(), id: snap.id });
    if (row) rows.push(row);
  }
  return rows;
}

/** Timeføringer som peker på en faktura (eller er avskrevet fra den). */
export async function loadTimeEntriesByInvoice(companyId, invoiceId) {
  const id = text(companyId);
  const invoice = text(invoiceId);
  if (!id || !invoice) return [];
  const bits = await firestoreBits();
  const snap = await bits.getDocs(bits.query(entriesCol(bits, id), bits.where('invoiceId', '==', invoice)));
  return snap.docs.map((item) => normalizeTimeEntryRow({ ...item.data(), id: item.id })).filter(Boolean);
}

/**
 * Timer som står i kjeden mellom føring og faktura: låste (venter på kontroll) og
 * godkjente som ikke er lagt på en faktura. Bare likhetsfiltre, så ingen ny indeks trengs.
 */
export async function loadOpenChainEntries(companyId) {
  const id = text(companyId);
  if (!id) return [];
  await hydrateDeletedTimeEntries(id);
  const bits = await firestoreBits();
  const col = entriesCol(bits, id);
  const [locked, approved] = await Promise.all([
    bits.getDocs(bits.query(col, bits.where('status', '==', 'låst'))),
    bits.getDocs(bits.query(col, bits.where('status', '==', 'godkjent'), bits.where('invoiceId', '==', null))),
  ]);
  return withoutDeletedTimeEntries(id, rowsFromDocs([...locked.docs, ...approved.docs]));
}

/** Om bedriften har ført minst én time (for «Kom i gang»). Leser bare ett dokument. */
export async function hasTimeEntries(companyId) {
  const id = text(companyId);
  if (!id) return false;
  const [{ limit }, bits] = await Promise.all([import('firebase/firestore'), firestoreBits()]);
  const snap = await bits.getDocs(bits.query(entriesCol(bits, id), limit(1)));
  return !snap.empty;
}

/**
 * Slett en føring. log: true (eller entry) legger en rad i families/{id}/timeEntryDeletions,
 * så slettingen kan spores (L-13). Opprydding av rader som allerede er slettet, logges ikke.
 */
export async function removeTimeEntry(companyId, entryId, { entry = null, log = !!entry, reason = '' } = {}) {
  const id = text(entryId);
  if (!companyId || !id) return;
  // Merk før nettverket, så en parallell lagring ikke skriver raden tilbake.
  const already = deletedTimeEntryIds(companyId).has(id);
  rememberDeletedTimeEntries(companyId, [id]);
  let bits = null;
  try {
    bits = await firestoreBits();
    await bits.deleteDoc(entryRef(bits, companyId, id));
  } catch (error) {
    if (!already) forgetDeletedTimeEntries(companyId, [id]);
    throw error;
  }
  if (log && !already) {
    const record = deletedTimeEntryRecord({ ...(entry || {}), id }, { actor: currentActor(bits), reason });
    Promise.resolve()
      .then(() => bits.addDoc(bits.collection(bits.db, 'families', companyId, 'timeEntryDeletions'), record))
      .catch(() => {});
  }
  const current = await readLocal(companyId);
  await writeLocal(companyId, withoutDeletedTimeEntries(companyId, current));
}

/**
 * Koble timeEntries fra subcollection (+ migrer legacy-array fra prosjektstate).
 * @param {string} companyId
 * @param {object} state
 * @param {{ fromDate?: string, toDate?: string, employeeId?: string, all?: boolean, hours?: false }} [opts]
 */
export async function attachTimeEntriesToState(companyId, state, opts = {}) {
  const base = state && typeof state === 'object' ? state : {};
  const legacy = Array.isArray(base.timeEntries) ? base.timeEntries : [];
  if (opts.hours === false) {
    return { ...base, timeEntries: [] };
  }
  if (companyId) await hydrateDeletedTimeEntries(companyId);
  if (!companyId) {
    const rows = legacy.map((row) => normalizeTimeEntryRow(row)).filter(Boolean);
    return {
      ...base,
      timeEntries: opts.all ? rows : filterTimeEntriesByRange(rows, opts),
    };
  }

  let remote = [];
  try {
    remote = await loadTimeEntries(companyId, opts);
  } catch {
    remote = opts.all
      ? await readLocal(companyId)
      : await readLocalWindow(companyId, opts);
  }

  const legacyInRange = withoutDeletedTimeEntries(companyId, opts.all
    ? legacy
    : filterTimeEntriesByRange(legacy, opts));
  const remoteClean = withoutDeletedTimeEntries(companyId, remote);
  const merged = mergeEntryLists(remoteClean, legacyInRange);
  const remoteIds = new Set(remoteClean.map((row) => row.id));
  const missing = legacyRowsToMigrate(legacyInRange, remoteIds, deletedTimeEntryIds(companyId));

  if (missing.length) {
    // Migrering skal ikke holde timelisten stengt.
    saveTimeEntries(companyId, missing).catch(() => {});
  }

  const withAlias = await appendAliasTimeEntries(companyId, merged, opts);
  return { ...base, timeEntries: withAlias };
}

/**
 * Timer fra skjulte alias-org.nr. Hovedlisten vinner ved lik id.
 * Alias-rader merkes med sourceCompanyId så lagring ikke flytter dem ved et uhell.
 */
export async function appendAliasTimeEntries(companyId, rows = [], opts = {}) {
  const tagged = (Array.isArray(rows) ? rows : []).map((row) => (
    row?.sourceCompanyId ? row : { ...row, sourceCompanyId: companyId }
  ));
  const aliasIds = aliasSourceIds(companyId);
  if (!aliasIds.length) return tagged;
  const extras = await Promise.all(aliasIds.map(async (aliasId) => {
    try {
      const extra = await loadTimeEntries(aliasId, opts);
      return (extra || []).map((row) => ({ ...row, sourceCompanyId: row.sourceCompanyId || aliasId }));
    } catch {
      // Alias som ikke kan leses skal ikke tømme hovedlisten.
      return [];
    }
  }));
  return extras.reduce((merged, marked) => mergeEntryLists(merged, marked), tagged);
}

/** Diff mot forrige liste — nye/endrede og slettede id-er. */
export function diffTimeEntries(previous = [], next = []) {
  const prevById = new Map(
    (Array.isArray(previous) ? previous : [])
      .map((row) => normalizeTimeEntryRow(row))
      .filter(Boolean)
      .map((row) => [row.id, row]),
  );
  const nextList = (Array.isArray(next) ? next : [])
    .map((row) => normalizeTimeEntryRow(row))
    .filter(Boolean);
  const nextIds = new Set(nextList.map((row) => row.id));
  const changed = [];
  for (const row of nextList) {
    const old = prevById.get(row.id);
    if (
      !old
      || old.updatedAt !== row.updatedAt
      || old.hours !== row.hours
      || old.billableHours !== row.billableHours
      || old.description !== row.description
      || old.projectId !== row.projectId
      || old.employeeId !== row.employeeId
      || old.date !== row.date
      || old.status !== row.status
    ) {
      changed.push(row);
    }
  }
  const removed = [...prevById.keys()].filter((id) => !nextIds.has(id));
  return { changed, removed };
}

const TOMB_KEY = 'protop.timeEntries.deleted.v1';
const TOMBSTONES = new Map();
const TOMB_CAP = 5000;

function tombKey(companyId) {
  return `${TOMB_KEY}.${companyId}`;
}

function tombSet(companyId) {
  const key = text(companyId);
  if (!key) return null;
  if (!TOMBSTONES.has(key)) TOMBSTONES.set(key, new Set());
  return TOMBSTONES.get(key);
}

function persistTombstones(companyId) {
  const key = text(companyId);
  if (!key) return;
  const ids = [...(TOMBSTONES.get(key) || [])];
  try {
    const write = AsyncStorage.setItem(tombKey(key), JSON.stringify(ids));
    if (write && typeof write.catch === 'function') write.catch(() => {});
  } catch {
    // Disk er best-effort. Minnet holder slettingen i økten.
  }
}

/** Id-er brukeren har slettet. Skal ikke skrives tilbake fra cache, legacy eller et senere sync. */
export function rememberDeletedTimeEntries(companyId, ids = []) {
  const set = tombSet(companyId);
  if (!set) return;
  for (const id of ids) {
    const next = text(id);
    if (next) set.add(next);
  }
  if (set.size > TOMB_CAP) {
    const kept = [...set].slice(set.size - TOMB_CAP);
    set.clear();
    kept.forEach((id) => set.add(id));
  }
  persistTombstones(companyId);
}

export function forgetDeletedTimeEntries(companyId, ids = []) {
  const set = TOMBSTONES.get(text(companyId));
  if (!set) return;
  for (const id of ids) set.delete(text(id));
  persistTombstones(companyId);
}

export function deletedTimeEntryIds(companyId) {
  return new Set(TOMBSTONES.get(text(companyId)) || []);
}

export function withoutDeletedTimeEntries(companyId, rows = []) {
  const gone = TOMBSTONES.get(text(companyId));
  if (!gone?.size) return Array.isArray(rows) ? rows : [];
  return (Array.isArray(rows) ? rows : []).filter((row) => !gone.has(text(row?.id)));
}

export async function hydrateDeletedTimeEntries(companyId) {
  const key = text(companyId);
  if (!key) return deletedTimeEntryIds(key);
  try {
    const raw = await AsyncStorage.getItem(tombKey(key));
    if (raw) {
      const parsed = JSON.parse(raw);
      rememberDeletedTimeEntries(key, Array.isArray(parsed) ? parsed : []);
    }
  } catch {
    // Minnet gjelder for økten selv om disken feiler.
  }
  return deletedTimeEntryIds(key);
}

export function clearDeletedTimeEntries(companyId) {
  if (companyId !== undefined) {
    const key = text(companyId);
    TOMBSTONES.delete(key);
    try {
      const remove = AsyncStorage.removeItem(tombKey(key));
      if (remove && typeof remove.catch === 'function') remove.catch(() => {});
    } catch {
      // Minnet er allerede tømt.
    }
    return;
  }
  TOMBSTONES.clear();
}

/**
 * Delvis vindu og full historikk kan slette. Uten vindu, eller før timer er lastet, slettes ingenting.
 */
export function allowTimeEntryRemovals(mode, window) {
  if (mode !== 'all' && mode !== 'partial') return false;
  if (!window) return false;
  if (window.all === true) return true;
  return !!(text(window.fromDate) || text(window.toDate) || text(window.employeeId));
}

/** Id-er et lagret utvalg faktisk skal slette i Firestore. */
export function planTimeEntryRemovals(previous, next, window, { allowRemovals = true } = {}) {
  const { removed } = diffTimeEntries(previous, next);
  if (!allowRemovals) return [];
  return filterRemovalsToLoadedWindow(previous, removed, window);
}

/** Legacy-rader som mangler i subcollection, unntatt dem brukeren har slettet. */
export function legacyRowsToMigrate(legacyRows = [], remoteIds = new Set(), deletedIds = new Set()) {
  const remote = remoteIds instanceof Set ? remoteIds : new Set(remoteIds);
  const gone = deletedIds instanceof Set ? deletedIds : new Set(deletedIds);
  return (Array.isArray(legacyRows) ? legacyRows : [])
    .map((row) => normalizeTimeEntryRow(row))
    .filter((row) => row?.id && !remote.has(row.id) && !gone.has(row.id));
}

async function finishLoadedEntries(companyId, rows, writeCache) {
  const clean = withoutDeletedTimeEntries(companyId, rows);
  const revived = (Array.isArray(rows) ? rows : []).filter((row) => (
    row?.id && deletedTimeEntryIds(companyId).has(row.id)
  ));
  try {
    const write = writeCache?.(clean);
    if (write && typeof write.catch === 'function') write.catch(() => {});
  } catch {
    // Cache er best-effort. Timene skal vises selv om disken er treg.
  }
  for (const row of revived) {
    removeTimeEntry(companyId, row.id).catch(() => {});
  }
  return clean;
}

/**
 * Id-er som kan slettes i Firestore uten å ta med timer utenfor vinduet som er lastet.
 * Uten vindu slettes ingenting. full historikk (`all`) kan slette det som mangler i neste liste.
 * Et delvis vindu sletter bare rader som faktisk ligger i det vinduet.
 */
export function filterRemovalsToLoadedWindow(previous = [], removedIds = [], window = null) {
  const removed = (Array.isArray(removedIds) ? removedIds : []).map((id) => text(id)).filter(Boolean);
  if (!window || !removed.length) return [];
  if (window.all === true) return removed;
  const fromDate = text(window.fromDate);
  const toDate = text(window.toDate);
  const employeeId = text(window.employeeId);
  if (!fromDate && !toDate && !employeeId) return [];
  const byId = new Map(
    (Array.isArray(previous) ? previous : [])
      .map((row) => normalizeTimeEntryRow(row))
      .filter(Boolean)
      .map((row) => [row.id, row]),
  );
  return removed.filter((id) => {
    const row = byId.get(id);
    if (!row) return false;
    if (employeeId && text(row.employeeId) !== employeeId) return false;
    const date = text(row.date);
    if (!date) return false;
    if (fromDate && date < fromDate) return false;
    if (toDate && date > toDate) return false;
    return true;
  });
}

export { mergeEntryLists };
