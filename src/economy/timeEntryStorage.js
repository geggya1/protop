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
  const [{ collection, deleteDoc, doc, getDocs, query, where, writeBatch }, { db }] = await Promise.all([
    import('firebase/firestore'),
    import('../../firebase.js'),
  ]);
  return { collection, deleteDoc, doc, getDocs, query, where, writeBatch, db };
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
  try {
    await AsyncStorage.setItem(
      windowKey(companyId, fromDate, toDate, employeeId),
      JSON.stringify(list),
    );
  } catch {
    // best-effort
  }
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

async function queryTimeEntries(bits, companyId, { fromDate = '', toDate = '', employeeId = '' } = {}) {
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
    .map((item) => normalizeTimeEntryRow({ ...item.data(), id: item.id }))
    .filter(Boolean);
}

/**
 * @param {string} companyId
 * @param {{ fromDate?: string, toDate?: string, employeeId?: string, all?: boolean }} [opts]
 */
export async function loadTimeEntries(companyId, opts = {}) {
  if (!companyId) return [];
  const all = opts.all === true
    || (!text(opts.fromDate) && !text(opts.toDate) && !text(opts.employeeId) && opts.all !== false);
  // Explicit all:false without range → empty (caller must pass window).
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
        .map((item) => normalizeTimeEntryRow({ ...item.data(), id: item.id }))
        .filter(Boolean);
      await writeLocal(companyId, rows);
      return rows;
    }
    try {
      const rows = await queryTimeEntries(bits, companyId, range);
      await writeLocalWindow(companyId, rows, range);
      return rows;
    } catch {
      // Mangler indeks / eldre data: last alt og filtrer (siste utvei).
      const snap = await bits.getDocs(entriesCol(bits, companyId));
      const rows = filterTimeEntriesByRange(
        snap.docs.map((item) => normalizeTimeEntryRow({ ...item.data(), id: item.id })).filter(Boolean),
        range,
      );
      await writeLocalWindow(companyId, rows, range);
      return rows;
    }
  } catch {
    return all ? readLocal(companyId) : readLocalWindow(companyId, range);
  }
}

async function writeBatchSet(companyId, entries, onProgress) {
  const bits = await firestoreBits();
  let batch = bits.writeBatch(bits.db);
  let n = 0;
  let done = 0;
  const total = entries.length;
  for (const entry of entries) {
    const next = normalizeTimeEntryRow(entry);
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

/**
 * Lagrer timeføringer til egen subcollection. Kaster ved feil —
 * UI skal ikke vise «lagret» hvis skyen avviser.
 */
export async function saveTimeEntries(companyId, entries, { onProgress } = {}) {
  if (!companyId) throw new Error('Mangler selskap for timelagring.');
  const list = (Array.isArray(entries) ? entries : [])
    .map((row) => normalizeTimeEntryRow({
      ...row,
      updatedAt: text(row?.updatedAt) || new Date().toISOString(),
      createdAt: text(row?.createdAt) || new Date().toISOString(),
    }))
    .filter(Boolean);
  if (!list.length) return { saved: 0, entries: [] };
  await writeBatchSet(companyId, list, onProgress);
  const current = await readLocal(companyId);
  await writeLocal(companyId, mergeEntryLists(current, list));
  return { saved: list.length, entries: list };
}

export async function saveTimeEntryImport(companyId, entries, { onProgress } = {}) {
  if (!companyId) throw new Error('Mangler selskap for timeimport.');
  const list = (Array.isArray(entries) ? entries : []).map((row) => normalizeTimeEntryRow(row)).filter(Boolean);
  if (!list.length) throw new Error('Ingen timer å lagre.');
  return saveTimeEntries(companyId, list, { onProgress });
}

export async function removeTimeEntry(companyId, entryId) {
  const id = text(entryId);
  if (!companyId || !id) return;
  const bits = await firestoreBits();
  await bits.deleteDoc(entryRef(bits, companyId, id));
  const current = await readLocal(companyId);
  await writeLocal(companyId, current.filter((row) => row.id !== id));
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

  const legacyInRange = opts.all
    ? legacy
    : filterTimeEntriesByRange(legacy, opts);
  const merged = mergeEntryLists(remote, legacyInRange);
  const remoteIds = new Set(remote.map((row) => row.id));
  const missing = legacyInRange
    .map((row) => normalizeTimeEntryRow(row))
    .filter((row) => row?.id && !remoteIds.has(row.id));

  if (missing.length) {
    try {
      await saveTimeEntries(companyId, missing);
    } catch {
      // Lesing kan fungere lokalt selv om migrering feiler midlertidig.
    }
  }

  return { ...base, timeEntries: merged };
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

export { mergeEntryLists };
