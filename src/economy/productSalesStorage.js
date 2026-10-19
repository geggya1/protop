/**
 * Produktsalg i families/{companyId}/productSales/{id}.
 * Holdes utenfor prosjekt-monolitten — en Moment-eksport er flere tusen rader
 * og sprenger Firestore sitt 1 MiB-dokumenttak. Da ble importen stående i minnet
 * og forsvant ved refresh.
 */
import { normalizeSale } from './products.js';
import { text } from './invoices.js';

const BATCH_SIZE = 400;

export function isExternalSale(row) {
  return row?.externalStore === true || row?.storage === 'productSales';
}

export function withoutExternalSales(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((row) => !isExternalSale(row));
}

/** Legg til rader som mangler id. Eksisterende rader blir stående. */
export function mergeRowsById(existing = [], incoming = []) {
  const map = new Map();
  for (const row of Array.isArray(existing) ? existing : []) {
    if (row?.id) map.set(row.id, row);
  }
  for (const row of Array.isArray(incoming) ? incoming : []) {
    if (row?.id && !map.has(row.id)) map.set(row.id, row);
  }
  return [...map.values()];
}

export function productSalesToStore(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => normalizeSale({
      ...row,
      externalStore: true,
      storage: 'productSales',
    }))
    .filter((row) => row?.id && row.name);
}

export function mergeSaleLists(...lists) {
  const byId = new Map();
  const byFingerprint = new Map();
  for (const list of lists) {
    for (const raw of Array.isArray(list) ? list : []) {
      const row = normalizeSale({
        ...raw,
        externalStore: isExternalSale(raw) || raw?.externalStore === true,
        storage: isExternalSale(raw) ? 'productSales' : raw?.storage,
      });
      if (!row?.id || !row.name) continue;
      const fingerprint = text(row.importFingerprint);
      if (byId.has(row.id)) {
        byId.set(row.id, row);
        continue;
      }
      if (fingerprint && byFingerprint.has(fingerprint)) continue;
      byId.set(row.id, row);
      if (fingerprint) byFingerprint.set(fingerprint, row.id);
    }
  }
  return [...byId.values()];
}

async function firestoreBits() {
  const [{ collection, doc, getDocs, writeBatch }, { db }] = await Promise.all([
    import('firebase/firestore'),
    import('../../firebase.js'),
  ]);
  return { collection, doc, getDocs, writeBatch, db };
}

function entryRef(bits, companyId, id) {
  return bits.doc(bits.db, 'families', companyId, 'productSales', id);
}

function entriesCol(bits, companyId) {
  return bits.collection(bits.db, 'families', companyId, 'productSales');
}

function persistable(row) {
  const next = productSalesToStore([row])[0];
  return next ? JSON.parse(JSON.stringify(next)) : null;
}

export async function loadProductSales(companyId) {
  const id = text(companyId);
  if (!id) return [];
  const bits = await firestoreBits();
  const snap = await bits.getDocs(entriesCol(bits, id));
  return snap.docs
    .map((item) => normalizeSale({ ...item.data(), id: item.id, externalStore: true, storage: 'productSales' }))
    .filter((row) => row?.id && row.name);
}

export async function saveProductSales(companyId, rows, { onProgress } = {}) {
  const id = text(companyId);
  if (!id) throw new Error('Mangler selskap for produktsalg.');
  const list = productSalesToStore(rows)
    .map((row) => persistable(row))
    .filter(Boolean);
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
