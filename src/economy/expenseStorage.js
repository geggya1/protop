/**
 * Prosjektutlegg i families/{companyId}/projectExpenses/{id}.
 * Holdes utenfor prosjekt-monolitten — en Moment-eksport er flere tusen rader
 * og sprenger Firestore sitt 1 MiB-dokumenttak.
 */
import { normalizeExpense } from './expenses.js';
import { text } from './invoices.js';

const BATCH_SIZE = 400;

export function isExternalExpense(row) {
  return row?.externalStore === true || row?.storage === 'projectExpenses';
}

export function withoutExternalExpenses(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((row) => !isExternalExpense(row));
}

export function mergeExpenseLists(...lists) {
  const byId = new Map();
  const byFingerprint = new Map();
  for (const list of lists) {
    for (const raw of Array.isArray(list) ? list : []) {
      const row = normalizeExpense(raw);
      if (!row) continue;
      const fingerprint = text(row.importFingerprint);
      if (row.id && byId.has(row.id)) {
        byId.set(row.id, row);
        continue;
      }
      if (fingerprint && byFingerprint.has(fingerprint)) continue;
      const id = row.id || fingerprint;
      if (!id) continue;
      const stored = row.id ? row : { ...row, id };
      byId.set(stored.id, stored);
      if (fingerprint) byFingerprint.set(fingerprint, stored.id);
    }
  }
  return [...byId.values()];
}

async function firestoreBits() {
  const [{ collection, deleteDoc, doc, getDoc, getDocs, writeBatch }, { db }] = await Promise.all([
    import('firebase/firestore'),
    import('../../firebase.js'),
  ]);
  return { collection, deleteDoc, doc, getDoc, getDocs, writeBatch, db };
}

function entryRef(bits, companyId, id) {
  return bits.doc(bits.db, 'families', companyId, 'projectExpenses', id);
}

function entriesCol(bits, companyId) {
  return bits.collection(bits.db, 'families', companyId, 'projectExpenses');
}

function persistable(row) {
  const next = normalizeExpense({
    ...row,
    externalStore: true,
    storage: 'projectExpenses',
  });
  return JSON.parse(JSON.stringify(next));
}

export async function loadProjectExpenses(companyId) {
  const id = text(companyId);
  if (!id) return [];
  const bits = await firestoreBits();
  const snap = await bits.getDocs(entriesCol(bits, id));
  return snap.docs
    .map((item) => normalizeExpense({ ...item.data(), id: item.id, externalStore: true }))
    .filter((row) => row?.id);
}

export async function saveProjectExpenses(companyId, rows, { onProgress } = {}) {
  const id = text(companyId);
  if (!id) throw new Error('Mangler selskap for utleggslagring.');
  const list = (Array.isArray(rows) ? rows : [])
    .map((row) => persistable(row))
    .filter((row) => row?.id);
  if (!list.length) return { saved: 0 };
  const bits = await firestoreBits();
  let batch = bits.writeBatch(bits.db);
  let n = 0;
  let done = 0;
  for (const row of list) {
    batch.set(entryRef(bits, id, row.id), row, { merge: true });
    n += 1;
    done += 1;
    if (n >= BATCH_SIZE) {
      await batch.commit();
      batch = bits.writeBatch(bits.db);
      n = 0;
      onProgress?.(done, list.length);
    }
  }
  if (n) {
    await batch.commit();
    onProgress?.(done, list.length);
  }
  return { saved: list.length };
}

function invoicedRow(row) {
  return row?.status === 'invoiced' || !!text(row?.invoiceId);
}

/** Slett ett importert utlegg fra samlingen. Fakturert utlegg slettes ikke. */
export async function deleteProjectExpense(companyId, expense) {
  const id = text(companyId);
  const expenseId = text(expense?.id);
  if (!id || !expenseId) throw new Error('Mangler utlegg.');
  if (invoicedRow(expense)) throw new Error('Fakturert utlegg kan ikke slettes.');
  const bits = await firestoreBits();
  const ref = entryRef(bits, id, expenseId);
  const snap = await bits.getDoc(ref);
  if (snap.exists() && invoicedRow(snap.data())) throw new Error('Fakturert utlegg kan ikke slettes.');
  await bits.deleteDoc(ref);
}
