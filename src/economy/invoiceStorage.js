/**
 * Lagring av fakturaer: Firestore families/{companyId}/invoices/{id}
 * + lett AsyncStorage-cache for liste (må tåle kvotebegrensning i nettleser).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  isInvoiceCacheQuotaError,
  normalizeInvoice,
  sortInvoices,
  text,
  toInvoiceCacheRow,
} from './invoices.js';

export { isInvoiceCacheQuotaError };

const LIST_KEY = 'protop.invoices.v1';
const BATCH_SIZE = 400;
/** Maks rader i lokal cache — full liste kommer fra Firestore. */
const CACHE_ROW_LIMITS = [2500, 800, 200, 0];

function listKey(companyId) {
  return `${LIST_KEY}.${companyId}`;
}

function invoiceRef(companyId, invoiceId) {
  return doc(db, 'families', companyId, 'invoices', invoiceId);
}

function invoicesCol(companyId) {
  return collection(db, 'families', companyId, 'invoices');
}

/** @deprecated bruk toInvoiceCacheRow — beholdt som alias for lesbarhet i storage. */
function toSummary(invoice) {
  return toInvoiceCacheRow(invoice);
}

function summarizeForCache(rows, limit) {
  const sorted = sortInvoices(rows).map(toSummary);
  if (!limit || sorted.length <= limit) return sorted;
  return sorted.slice(0, limit);
}

async function readLocal(companyId) {
  if (!companyId) return [];
  try {
    const raw = await AsyncStorage.getItem(listKey(companyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return sortInvoices((Array.isArray(parsed) ? parsed : []).map((row) => normalizeInvoice(row)));
  } catch {
    return [];
  }
}

/**
 * Skriver listesammendrag. Ved kvote: prøv færre rader, ellers dropp cache.
 * Feiler aldri hardt — Firestore er kilde til sannhet.
 */
async function writeLocal(companyId, rows) {
  if (!companyId) return;
  const key = listKey(companyId);
  let lastError = null;
  for (const limit of CACHE_ROW_LIMITS) {
    if (limit === 0) {
      try { await AsyncStorage.removeItem(key); } catch { /* ignore */ }
      return;
    }
    const payload = JSON.stringify(summarizeForCache(rows, limit));
    try {
      await AsyncStorage.setItem(key, payload);
      return;
    } catch (err) {
      lastError = err;
      if (!isInvoiceCacheQuotaError(err)) throw err;
      try { await AsyncStorage.removeItem(key); } catch { /* ignore */ }
      try {
        await AsyncStorage.setItem(key, payload);
        return;
      } catch (again) {
        lastError = again;
        if (!isInvoiceCacheQuotaError(again)) throw again;
      }
    }
  }
  void lastError;
}

export async function loadInvoices(companyId) {
  if (!companyId) return [];
  try {
    const snap = await getDocs(invoicesCol(companyId));
    const rows = sortInvoices(snap.docs.map((item) => normalizeInvoice({ ...item.data(), id: item.id })));
    await writeLocal(companyId, rows).catch(() => {});
    return rows;
  } catch {
    return readLocal(companyId);
  }
}

export function watchInvoices(companyId, onData, onError) {
  if (!companyId) {
    onData([]);
    return () => {};
  }
  let stop = false;
  readLocal(companyId).then((rows) => {
    if (!stop) onData(rows);
  }).catch(() => {});
  const unsub = onSnapshot(invoicesCol(companyId), (snap) => {
    const rows = sortInvoices(snap.docs.map((item) => normalizeInvoice({ ...item.data(), id: item.id })));
    writeLocal(companyId, rows).catch(() => {});
    onData(rows);
  }, (error) => {
    onError?.(error);
  });
  return () => {
    stop = true;
    unsub();
  };
}

export async function loadInvoice(companyId, invoiceId) {
  const id = text(invoiceId);
  if (!companyId || !id) return null;
  try {
    const snap = await getDoc(invoiceRef(companyId, id));
    if (snap.exists()) return normalizeInvoice({ ...snap.data(), id: snap.id });
  } catch {
    // fall through to local
  }
  const local = await readLocal(companyId);
  return local.find((row) => row.id === id) || null;
}

export async function saveInvoice(companyId, invoice) {
  const next = normalizeInvoice({
    ...invoice,
    id: invoice?.id || `inv_${text(invoice?.invoiceNumber) || Date.now().toString(36)}`,
    updatedAt: new Date().toISOString(),
    createdAt: invoice?.createdAt || new Date().toISOString(),
  });
  await writeBatchSet(companyId, [next]);
  const current = await readLocal(companyId);
  await writeLocal(companyId, [...current.filter((row) => row.id !== next.id), next]).catch(() => {});
  return next;
}

async function writeBatchSet(companyId, invoices, onProgress) {
  let batch = writeBatch(db);
  let n = 0;
  let done = 0;
  const total = invoices.length;
  for (const invoice of invoices) {
    const next = normalizeInvoice(invoice);
    batch.set(invoiceRef(companyId, next.id), next, { merge: true });
    n += 1;
    done += 1;
    if (n >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(db);
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
 * Lagrer valgte fakturaer. Oppdaterer eksisterende med samme fakturanummer.
 * onProgress(done, total) for UI.
 */
export async function saveInvoiceImport(companyId, invoices, { onProgress } = {}) {
  if (!companyId) throw new Error('Mangler selskap for fakturaimport.');
  const list = (Array.isArray(invoices) ? invoices : [])
    .map((row) => normalizeInvoice({
      ...row,
      id: row.id || `inv_${text(row.invoiceNumber)}`,
      updatedAt: new Date().toISOString(),
      createdAt: row.createdAt || new Date().toISOString(),
    }))
    .filter((row) => row.invoiceNumber);
  if (!list.length) throw new Error('Ingen fakturaer å lagre.');
  await writeBatchSet(companyId, list, onProgress);
  // Lokal cache er valgfri — masseimport må ikke feile på nettleserkvote.
  try {
    const current = await readLocal(companyId);
    const byId = new Map(current.map((row) => [row.id, row]));
    for (const row of list) byId.set(row.id, row);
    await writeLocal(companyId, [...byId.values()]);
  } catch {
    // Firestore er lagret; listen kommer via watchInvoices.
  }
  return { saved: list.length, invoices: list };
}

export async function removeInvoice(companyId, invoiceId) {
  const id = text(invoiceId);
  if (!companyId || !id) return;
  await deleteDoc(invoiceRef(companyId, id));
  try {
    const current = await readLocal(companyId);
    await writeLocal(companyId, current.filter((row) => row.id !== id));
  } catch {
    // ignore cache errors
  }
}
