/**
 * Lagring av fakturaer: Firestore families/{companyId}/invoices/{id}
 * + lett AsyncStorage-cache for liste (må tåle kvotebegrensning i nettleser).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, runTransaction, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { rememberInvoicedStatement } from './invoicedStatementStorage.js';
import { withEvent } from './invoiceFlow.js';
import {
  counterJumpEntry, issueGapRecord, jumpReasonFor, seriesGapOnIssue,
} from './invoiceNumberSeries.js';
import {
  invoiceListSource,
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
    const rows = sortInvoices(snap.docs.map((item) => toInvoiceCacheRow(invoiceListSource(item.data(), item.id))));
    await writeLocal(companyId, rows).catch(() => {});
    rememberInvoicedStatement(companyId, rows);
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
    if (!stop) onData(rows, { source: 'cache' });
  }).catch(() => {});
  const unsub = onSnapshot(invoicesCol(companyId), (snap) => {
    const rows = sortInvoices(snap.docs.map((item) => toInvoiceCacheRow(invoiceListSource(item.data(), item.id))));
    writeLocal(companyId, rows).catch(() => {});
    rememberInvoicedStatement(companyId, rows);
    onData(rows, { source: 'remote' });
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
  // Listeraden fra cachen mangler linjer og mer. partial: ikke lagre den tilbake som en hel faktura.
  const local = await readLocal(companyId);
  const hit = local.find((row) => row.id === id);
  return hit ? { ...hit, partial: true } : null;
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

function seriesRef(companyId) {
  return doc(db, 'families', companyId, 'invoiceSeries', 'main');
}

/** Siste brukte fakturanummer i serien (0 når serien ikke er startet). */
export async function loadInvoiceSeries(companyId) {
  if (!companyId) return { last: 0 };
  try {
    const snap = await getDoc(seriesRef(companyId));
    return { last: Number(snap.exists() ? snap.data()?.last : 0) || 0 };
  } catch {
    return { last: 0 };
  }
}

/**
 * Til innstillingssiden: høyeste nummer i serien og i fakturalisten på denne enheten.
 * Selve nummeret settes ved ferdigstilling, mot hele listen og telleren.
 */
export async function peekInvoiceNumbers(companyId) {
  if (!companyId) return { last: 0, highest: 0 };
  const [series, rows] = await Promise.all([loadInvoiceSeries(companyId), readLocal(companyId)]);
  let highest = 0;
  for (const row of rows) {
    const value = text(row?.invoiceNumber);
    if (/^\d+$/.test(value)) highest = Math.max(highest, Number(value));
  }
  return { last: series.last, highest };
}

/**
 * Ferdigstiller med neste nummer i én transaksjon: telleren og fakturaen skrives
 * sammen, så to brukere aldri får samme nummer og et nummer aldri går tapt.
 * minimum er høyeste nummer i listen + 1, eller startnummeret fra innstillingene.
 * build(number, current) returnerer { ok, invoice, error } (se issueInvoice).
 * Hopper nummeret over ubrukte nummer, logges hullet med begrunnelse på telleren
 * (jumps) og i fakturaens hendelseslogg (bokføringsforskriften § 5-1-1 nr. 1).
 * Begrunnelsen er gapReason, eller hentes fra numberJumps (fakturastandardene).
 */
export async function issueInvoiceWithNumber(companyId, invoice, {
  minimum = 1,
  build,
  numberJumps = [],
  gapReason = '',
} = {}) {
  if (!companyId) throw new Error('Mangler selskap.');
  const id = text(invoice?.id);
  if (!id) throw new Error('Fakturaen mangler id.');
  const ref = invoiceRef(companyId, id);
  const counter = seriesRef(companyId);
  const listed = await peekInvoiceNumbers(companyId).catch(() => ({ highest: 0 }));
  const issued = await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counter);
    const invoiceSnap = await tx.get(ref);
    const current = invoiceSnap.exists() ? normalizeInvoice({ ...invoiceSnap.data(), id: invoiceSnap.id }) : null;
    if (current?.issuedAt) throw new Error(`Fakturaen er allerede ferdigstilt som nummer ${current.invoiceNumber}.`);
    const last = Number(counterSnap.exists() ? counterSnap.data()?.last : 0) || 0;
    const number = Math.max(last + 1, Math.floor(Number(minimum) || 1));
    const result = build(String(number), current);
    if (!result?.ok) throw new Error(result?.error || 'Kunne ikke ferdigstille fakturaen.');
    const stamp = new Date().toISOString();
    const gap = seriesGapOnIssue({ last, highest: listed.highest, number });
    const record = issueGapRecord(gap, {
      reason: text(gapReason) || jumpReasonFor(numberJumps, gap),
      invoiceId: id,
      actor: { byUid: result.invoice.issuedByUid, byName: result.invoice.issuedByName },
      at: stamp,
    });
    const built = record
      ? withEvent(result.invoice, { type: 'number', text: record.event, actor: { byUid: result.invoice.issuedByUid, byName: result.invoice.issuedByName }, at: stamp })
      : result.invoice;
    const next = normalizeInvoice({
      ...built,
      id,
      createdAt: result.invoice.createdAt || current?.createdAt || stamp,
      updatedAt: stamp,
    });
    const jumps = Array.isArray(counterSnap.exists() ? counterSnap.data()?.jumps : null) ? counterSnap.data().jumps : [];
    // Hopper telleren mer enn ett steg, må loggen få en begrunnet rad (firestore.rules, L-31).
    const jump = counterJumpEntry({
      last,
      number,
      record,
      invoiceId: id,
      actor: { byUid: result.invoice.issuedByUid, byName: result.invoice.issuedByName },
      at: stamp,
    });
    tx.set(counter, {
      last: number,
      updatedAt: stamp,
      ...(jump ? { jumps: [...jumps, jump].slice(-200) } : {}),
    }, { merge: true });
    tx.set(ref, next, { merge: true });
    return next;
  });
  const local = await readLocal(companyId);
  await writeLocal(companyId, [...local.filter((row) => row.id !== issued.id), issued]).catch(() => {});
  return issued;
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
  // Cache er valgfri. Ikke vent på omskriving av hele listen — det blokkerte «Sletter…».
  void (async () => {
    try {
      const current = await readLocal(companyId);
      await writeLocal(companyId, current.filter((row) => row.id !== id));
    } catch {
      // ignore cache errors
    }
  })();
}
