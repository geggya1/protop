/**
 * Produktsalg i families/{companyId}/productSales/{id}.
 * Holdes utenfor prosjekt-monolitten — en Moment-eksport er flere tusen rader
 * og sprenger Firestore sitt 1 MiB-dokumenttak. Da ble importen stående i minnet
 * og forsvant ved refresh.
 */
import { normalizeSale } from './products.js';
import { text } from './invoices.js';

const BATCH_SIZE = 400;

// Siste kjente liste per selskap. Siden tegnes fra den med en gang, mens
// en fersk lesing går i bakgrunnen. Lyttere får beskjed når listen endres.
const CACHE = new Map();
const LOADED_AT = new Map();
const LISTENERS = new Set();
const inflight = new Map();

function signature(rows) {
  return rows.map((row) => `${row.id}:${row.updatedAt}:${row.status}:${row.invoiceId}`).join('|');
}

function remember(companyId, rows) {
  const before = CACHE.get(companyId);
  // Uendret liste beholder samme referanse, så skjermene slipper å regne om.
  if (before && before.length === rows.length && signature(before) === signature(rows)) return before;
  CACHE.set(companyId, rows);
  LISTENERS.forEach((fn) => {
    try { fn(companyId, rows); } catch { /* en lytter skal ikke stoppe de andre */ }
  });
  return rows;
}

/** Siste kjente liste, eller null når selskapet ikke er lest ennå. */
export function peekProductSales(companyId) {
  return CACHE.get(text(companyId)) || null;
}

/** Millisekunder siden siste lesing fra skyen. Infinity når den ikke er lest. */
export function productSalesAge(companyId, now = Date.now()) {
  const at = LOADED_AT.get(text(companyId));
  return at ? Math.max(0, now - at) : Infinity;
}

/** fn(companyId, rows) kalles når listen er lest eller endret. */
export function subscribeProductSales(fn) {
  LISTENERS.add(fn);
  return () => LISTENERS.delete(fn);
}

/** Test/hjelper: tøm minnet. */
export function clearProductSalesCache() {
  CACHE.clear();
  LOADED_AT.clear();
  inflight.clear();
}

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
  const [{ collection, deleteDoc, doc, getDoc, getDocs, setDoc, writeBatch }, { db }] = await Promise.all([
    import('firebase/firestore'),
    import('../../firebase.js'),
  ]);
  return { collection, deleteDoc, doc, getDoc, getDocs, setDoc, writeBatch, db };
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

/** Fersk lesing fra skyen. Samtidige kall for samme selskap deler svaret. */
export async function loadProductSales(companyId) {
  const id = text(companyId);
  if (!id) return [];
  if (inflight.has(id)) return inflight.get(id);
  const pending = (async () => {
    const bits = await firestoreBits();
    const snap = await bits.getDocs(entriesCol(bits, id));
    const rows = snap.docs
      .map((item) => normalizeSale({ ...item.data(), id: item.id, externalStore: true, storage: 'productSales' }))
      .filter((row) => row?.id && row.name);
    LOADED_AT.set(id, Date.now());
    return remember(id, rows);
  })();
  inflight.set(id, pending);
  try {
    return await pending;
  } finally {
    if (inflight.get(id) === pending) inflight.delete(id);
  }
}

function invoicedRow(row) {
  return row?.status === 'invoiced' || !!text(row?.invoiceId);
}

/** Les salget fra skyen og stopp hvis det er fakturert i mellomtiden. */
async function assertOpen(bits, companyId, saleId, message) {
  const snap = await bits.getDoc(entryRef(bits, companyId, saleId));
  if (snap.exists() && invoicedRow(snap.data())) throw new Error(message);
}

/** Lagre én endret rad. Fakturert salg (lokalt eller i skyen) endres ikke. */
export async function saveProductSaleEdit(companyId, sale) {
  const id = text(companyId);
  const row = persistable(sale);
  if (!id || !row) throw new Error('Mangler salg.');
  if (invoicedRow(row)) throw new Error('Salget er fakturert og kan ikke endres.');
  const bits = await firestoreBits();
  await assertOpen(bits, id, row.id, 'Salget er fakturert og kan ikke endres.');
  await bits.setDoc(entryRef(bits, id, row.id), row, { merge: true });
  const cached = CACHE.get(id);
  if (cached) remember(id, mergeSaleLists(cached, [row]));
  return row;
}

/** Slett ett salg fra samlingen. Fakturert salg slettes ikke. */
export async function deleteProductSale(companyId, sale) {
  const id = text(companyId);
  const saleId = text(sale?.id);
  if (!id || !saleId) throw new Error('Mangler salg.');
  if (invoicedRow(sale)) throw new Error('Fakturert salg kan ikke slettes.');
  const bits = await firestoreBits();
  await assertOpen(bits, id, saleId, 'Fakturert salg kan ikke slettes.');
  await bits.deleteDoc(entryRef(bits, id, saleId));
  const cached = CACHE.get(id);
  if (cached) remember(id, cached.filter((row) => row.id !== saleId));
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
  const cached = CACHE.get(id);
  if (cached) remember(id, mergeSaleLists(cached, list));
  return { saved: list.length };
}
