/**
 * Lagring av timeføringer: Firestore families/{companyId}/timeEntries/{id}
 * + lett AsyncStorage-cache for liste.
 *
 * Holdes utenfor prosjekt-monolitten (families/.../projects/state) fordi
 * ~30k føringer sprenger Firestore sitt 1 MiB-dokumenttak — da feiler lagring
 * stille og timer forsvinner etter refresh.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeTimeEntryRow } from '../project/engine.js';
import { text } from './invoices.js';

const LIST_KEY = 'protop.timeEntries.v1';
const BATCH_SIZE = 400;

function listKey(companyId) {
  return `${LIST_KEY}.${companyId}`;
}

async function firestoreBits() {
  const [{ collection, deleteDoc, doc, getDocs, writeBatch }, { db }] = await Promise.all([
    import('firebase/firestore'),
    import('../../firebase.js'),
  ]);
  return { collection, deleteDoc, doc, getDocs, writeBatch, db };
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

async function writeLocal(companyId, rows) {
  if (!companyId) return;
  const list = (Array.isArray(rows) ? rows : []).map(toCacheRow).filter(Boolean);
  try {
    await AsyncStorage.setItem(listKey(companyId), JSON.stringify(list));
  } catch {
    // Cache er best-effort — Firestore er fasit.
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

export async function loadTimeEntries(companyId) {
  if (!companyId) return [];
  try {
    const bits = await firestoreBits();
    const snap = await bits.getDocs(entriesCol(bits, companyId));
    const rows = snap.docs
      .map((item) => normalizeTimeEntryRow({ ...item.data(), id: item.id }))
      .filter(Boolean);
    await writeLocal(companyId, rows);
    return rows;
  } catch {
    return readLocal(companyId);
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
 * Returnerer state med samlet timeEntries-liste.
 */
export async function attachTimeEntriesToState(companyId, state) {
  const base = state && typeof state === 'object' ? state : {};
  const legacy = Array.isArray(base.timeEntries) ? base.timeEntries : [];
  if (!companyId) {
    return { ...base, timeEntries: legacy.map((row) => normalizeTimeEntryRow(row)).filter(Boolean) };
  }

  let remote = [];
  try {
    remote = await loadTimeEntries(companyId);
  } catch {
    remote = await readLocal(companyId);
  }

  const merged = mergeEntryLists(remote, legacy);
  const remoteIds = new Set(remote.map((row) => row.id));
  const missing = legacy
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
