/**
 * Lagring av fakturaer: Firestore families/{companyId}/invoices/{id}
 * + lett AsyncStorage-cache for liste.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { normalizeInvoice, sortInvoices, text, toInvoiceCacheRow } from './invoices.js';

const LIST_KEY = 'protop.invoices.v1';
const BATCH_SIZE = 400;

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

async function writeLocal(companyId, rows) {
  if (!companyId) return;
  const summaries = sortInvoices(rows).map(toSummary);
  await AsyncStorage.setItem(listKey(companyId), JSON.stringify(summaries));
}

export async function loadInvoices(companyId) {
  if (!companyId) return [];
  try {
    const snap = await getDocs(invoicesCol(companyId));
    const rows = sortInvoices(snap.docs.map((item) => normalizeInvoice({ ...item.data(), id: item.id })));
    await writeLocal(companyId, rows);
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
  await writeLocal(companyId, [...current.filter((row) => row.id !== next.id), next]);
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
  const current = await readLocal(companyId);
  const byId = new Map(current.map((row) => [row.id, row]));
  for (const row of list) byId.set(row.id, row);
  await writeLocal(companyId, [...byId.values()]);
  return { saved: list.length, invoices: list };
}

export async function removeInvoice(companyId, invoiceId) {
  const id = text(invoiceId);
  if (!companyId || !id) return;
  await deleteDoc(invoiceRef(companyId, id));
  const current = await readLocal(companyId);
  await writeLocal(companyId, current.filter((row) => row.id !== id));
}
