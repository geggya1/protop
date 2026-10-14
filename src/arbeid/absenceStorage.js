/**
 * Lagring av fravær: Firestore families/{companyId}/absences/{id}
 * + lett AsyncStorage-cache.
 *
 * Holdes utenfor prosjekt-monolitten fordi Moment-eksporter kan ha flere
 * tusen dagsrader og sprenge Firestore sitt 1 MiB-dokumenttak.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeAbsenceRow } from '../project/engine.js';
import { aliasSourceIds } from '../project/companyAlias.js';
import { text } from '../economy/invoices.js';

const LIST_KEY = 'protop.absences.v1';
const WINDOW_KEY = 'protop.absences.window.v1';
const BATCH_SIZE = 400;

function listKey(companyId) {
  return `${LIST_KEY}.${companyId}`;
}

function windowKey(companyId, fromDate, toDate, employeeId) {
  return `${WINDOW_KEY}.${companyId}.${fromDate || ''}_${toDate || ''}_${employeeId || ''}`;
}

async function firestoreBits() {
  const [{ collection, deleteDoc, doc, getDocs, query, where, writeBatch }, { db }] = await Promise.all([
    import('firebase/firestore'),
    import('../../firebase.js'),
  ]);
  return { collection, deleteDoc, doc, getDocs, query, where, writeBatch, db };
}

function entryRef(bits, companyId, entryId) {
  return bits.doc(bits.db, 'families', companyId, 'absences', entryId);
}

function entriesCol(bits, companyId) {
  return bits.collection(bits.db, 'families', companyId, 'absences');
}

export function filterAbsencesByRange(rows, { fromDate = '', toDate = '', employeeId = '' } = {}) {
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
    return (Array.isArray(parsed) ? parsed : []).map((row) => normalizeAbsenceRow(row)).filter(Boolean);
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
      return (Array.isArray(parsed) ? parsed : []).map((row) => normalizeAbsenceRow(row)).filter(Boolean);
    }
  } catch {
    // fall through
  }
  return filterAbsencesByRange(await readLocal(companyId), opts);
}

async function writeLocal(companyId, rows) {
  if (!companyId) return;
  const list = (Array.isArray(rows) ? rows : []).map((row) => normalizeAbsenceRow(row)).filter(Boolean);
  if (list.length > 8000) return;
  try {
    await AsyncStorage.setItem(listKey(companyId), JSON.stringify(list));
  } catch {
    // Cache er best-effort.
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
  const list = (Array.isArray(rows) ? rows : []).map((row) => normalizeAbsenceRow(row)).filter(Boolean);
  try {
    await AsyncStorage.setItem(
      windowKey(companyId, fromDate, toDate, employeeId),
      JSON.stringify(list),
    );
  } catch {
    // best-effort
  }
}

export function mergeAbsenceLists(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const row of Array.isArray(list) ? list : []) {
      const next = normalizeAbsenceRow(row);
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

async function queryAbsences(bits, companyId, { fromDate = '', toDate = '', employeeId = '' } = {}) {
  const col = entriesCol(bits, companyId);
  const from = text(fromDate);
  const to = text(toDate);
  const emp = text(employeeId);
  const clauses = [];
  if (emp) clauses.push(bits.where('employeeId', '==', emp));
  if (from) clauses.push(bits.where('date', '>=', from));
  if (to) clauses.push(bits.where('date', '<=', to));
  const q = clauses.length ? bits.query(col, ...clauses) : col;
  const snap = await bits.getDocs(q);
  return snap.docs
    .map((item) => normalizeAbsenceRow({ ...item.data(), id: item.id }))
    .filter(Boolean);
}

/**
 * @param {string} companyId
 * @param {{ fromDate?: string, toDate?: string, employeeId?: string, all?: boolean }} [opts]
 */
export async function loadAbsences(companyId, opts = {}) {
  if (!companyId) return [];
  await hydrateDeletedAbsences(companyId);
  const all = opts.all === true
    || (!text(opts.fromDate) && !text(opts.toDate) && !text(opts.employeeId) && opts.all !== false);
  if (!all && !text(opts.fromDate) && !text(opts.toDate) && !text(opts.employeeId)) {
    return [];
  }

  const range = {
    fromDate: text(opts.fromDate),
    toDate: text(opts.toDate),
    employeeId: text(opts.employeeId),
  };

  try {
    const bits = await firestoreBits();
    if (all) {
      const snap = await bits.getDocs(entriesCol(bits, companyId));
      const rows = snap.docs
        .map((item) => normalizeAbsenceRow({ ...item.data(), id: item.id }))
        .filter(Boolean);
      return finishLoaded(companyId, rows, (clean) => writeLocal(companyId, clean));
    }
    try {
      const rows = await queryAbsences(bits, companyId, range);
      return finishLoaded(companyId, rows, (clean) => writeLocalWindow(companyId, clean, range));
    } catch {
      const snap = await bits.getDocs(entriesCol(bits, companyId));
      const rows = filterAbsencesByRange(
        snap.docs.map((item) => normalizeAbsenceRow({ ...item.data(), id: item.id })).filter(Boolean),
        range,
      );
      return finishLoaded(companyId, rows, (clean) => writeLocalWindow(companyId, clean, range));
    }
  } catch {
    const cached = all ? await readLocal(companyId) : await readLocalWindow(companyId, range);
    return withoutDeletedAbsences(companyId, cached);
  }
}

async function writeBatchSet(companyId, entries, onProgress) {
  const bits = await firestoreBits();
  const list = withoutDeletedAbsences(companyId, entries);
  let batch = bits.writeBatch(bits.db);
  let n = 0;
  let done = 0;
  const total = list.length;
  for (const entry of list) {
    const next = normalizeAbsenceRow(entry);
    if (!next?.id) continue;
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
}

export async function saveAbsences(companyId, entries, { onProgress } = {}) {
  if (!companyId) throw new Error('Mangler selskap for fraværslagring.');
  await hydrateDeletedAbsences(companyId);
  const list = withoutDeletedAbsences(companyId, (Array.isArray(entries) ? entries : [])
    .map((row) => normalizeAbsenceRow({
      ...row,
      updatedAt: text(row?.updatedAt) || new Date().toISOString(),
      createdAt: text(row?.createdAt) || new Date().toISOString(),
    }))
    .filter(Boolean));
  if (!list.length) return { saved: 0, entries: [] };
  await writeBatchSet(companyId, list, onProgress);
  const current = await readLocal(companyId);
  await writeLocal(companyId, mergeAbsenceLists(current, list));
  return { saved: list.length, entries: list };
}

export async function saveAbsenceImport(companyId, entries, { onProgress } = {}) {
  if (!companyId) throw new Error('Mangler selskap for fraværsimport.');
  const list = (Array.isArray(entries) ? entries : []).map((row) => normalizeAbsenceRow(row)).filter(Boolean);
  if (!list.length) throw new Error('Ingen fravær å lagre.');
  return saveAbsences(companyId, list, { onProgress });
}

export async function removeAbsence(companyId, absenceId) {
  const id = text(absenceId);
  if (!companyId || !id) return;
  const already = deletedAbsenceIds(companyId).has(id);
  rememberDeletedAbsences(companyId, [id]);
  try {
    const bits = await firestoreBits();
    await bits.deleteDoc(entryRef(bits, companyId, id));
  } catch (error) {
    if (!already) forgetDeletedAbsences(companyId, [id]);
    throw error;
  }
  const current = await readLocal(companyId);
  await writeLocal(companyId, withoutDeletedAbsences(companyId, current));
}

export async function attachAbsencesToState(companyId, state, opts = {}) {
  const base = state && typeof state === 'object' ? state : {};
  const legacy = Array.isArray(base.absences) ? base.absences : [];
  if (opts.absences === false) {
    return { ...base, absences: legacy };
  }
  if (companyId) await hydrateDeletedAbsences(companyId);
  if (!companyId) {
    const rows = legacy.map((row) => normalizeAbsenceRow(row)).filter(Boolean);
    return {
      ...base,
      absences: opts.all ? rows : filterAbsencesByRange(rows, opts),
    };
  }

  let remote = [];
  try {
    remote = await loadAbsences(companyId, opts);
  } catch {
    remote = opts.all
      ? await readLocal(companyId)
      : await readLocalWindow(companyId, opts);
  }

  const legacyInRange = withoutDeletedAbsences(companyId, opts.all
    ? legacy
    : filterAbsencesByRange(legacy, opts));
  const remoteClean = withoutDeletedAbsences(companyId, remote);
  const merged = mergeAbsenceLists(remoteClean, legacyInRange);
  const remoteIds = new Set(remoteClean.map((row) => row.id));
  const missing = (legacyInRange || [])
    .map((row) => normalizeAbsenceRow(row))
    .filter((row) => row?.id && !remoteIds.has(row.id) && !deletedAbsenceIds(companyId).has(row.id));

  if (missing.length) {
    try {
      await saveAbsences(companyId, missing);
    } catch {
      // Lesing kan fungere lokalt selv om migrering feiler.
    }
  }

  const withAlias = await appendAliasAbsences(companyId, merged, opts);
  return { ...base, absences: withAlias };
}

async function appendAliasAbsences(companyId, rows = [], opts = {}) {
  const tagged = (Array.isArray(rows) ? rows : []).map((row) => (
    row?.sourceCompanyId ? row : { ...row, sourceCompanyId: companyId }
  ));
  let merged = tagged;
  for (const aliasId of aliasSourceIds(companyId)) {
    try {
      const extra = await loadAbsences(aliasId, opts);
      const marked = (extra || []).map((row) => ({ ...row, sourceCompanyId: row.sourceCompanyId || aliasId }));
      merged = mergeAbsenceLists(merged, marked);
    } catch {
      // Alias som ikke kan leses skal ikke tømme hovedlisten.
    }
  }
  return merged;
}

export function diffAbsences(previous = [], next = []) {
  const prevById = new Map(
    (Array.isArray(previous) ? previous : [])
      .map((row) => normalizeAbsenceRow(row))
      .filter(Boolean)
      .map((row) => [row.id, row]),
  );
  const nextList = (Array.isArray(next) ? next : [])
    .map((row) => normalizeAbsenceRow(row))
    .filter(Boolean);
  const nextIds = new Set(nextList.map((row) => row.id));
  const changed = [];
  for (const row of nextList) {
    const old = prevById.get(row.id);
    if (
      !old
      || old.updatedAt !== row.updatedAt
      || old.hours !== row.hours
      || old.description !== row.description
      || old.employeeId !== row.employeeId
      || old.date !== row.date
      || old.type !== row.type
      || old.status !== row.status
    ) {
      changed.push(row);
    }
  }
  const removed = [...prevById.keys()].filter((id) => !nextIds.has(id));
  return { changed, removed };
}

const TOMB_KEY = 'protop.absences.deleted.v1';
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
  const set = tombSet(key);
  if (!set) return;
  const list = [...set].slice(-TOMB_CAP);
  AsyncStorage.setItem(tombKey(key), JSON.stringify(list)).catch(() => {});
}

export async function hydrateDeletedAbsences(companyId) {
  const key = text(companyId);
  if (!key || TOMBSTONES.has(key)) return;
  try {
    const raw = await AsyncStorage.getItem(tombKey(key));
    const list = raw ? JSON.parse(raw) : [];
    TOMBSTONES.set(key, new Set(Array.isArray(list) ? list.map(text).filter(Boolean) : []));
  } catch {
    TOMBSTONES.set(key, new Set());
  }
}

export function deletedAbsenceIds(companyId) {
  return tombSet(companyId) || new Set();
}

export function rememberDeletedAbsences(companyId, ids = []) {
  const set = tombSet(companyId);
  if (!set) return;
  for (const id of ids) {
    const next = text(id);
    if (next) set.add(next);
  }
  persistTombstones(companyId);
}

export function forgetDeletedAbsences(companyId, ids = []) {
  const set = tombSet(companyId);
  if (!set) return;
  for (const id of ids) set.delete(text(id));
  persistTombstones(companyId);
}

export function withoutDeletedAbsences(companyId, rows = []) {
  const gone = deletedAbsenceIds(companyId);
  if (!gone.size) return Array.isArray(rows) ? rows : [];
  return (Array.isArray(rows) ? rows : []).filter((row) => row?.id && !gone.has(row.id));
}

async function finishLoaded(companyId, rows, writeCache) {
  const clean = withoutDeletedAbsences(companyId, rows);
  const revived = (Array.isArray(rows) ? rows : []).filter((row) => (
    row?.id && deletedAbsenceIds(companyId).has(row.id)
  ));
  await writeCache?.(clean);
  for (const row of revived) {
    removeAbsence(companyId, row.id).catch(() => {});
  }
  return clean;
}
