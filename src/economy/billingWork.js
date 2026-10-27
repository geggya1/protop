/**
 * Status på grunnlaget (timer, utlegg, kjøring og salg) når utkast lages,
 * slettes, krediteres eller avskrives.
 *
 * Timer ligger i families/{id}/timeEntries. Utlegg, kjøring og salg ligger i
 * prosjektstate, og importerte utlegg og salg i egne samlinger. Bare postene
 * som endres skrives, så resten av historikken ikke lastes eller overskrives.
 */
import { text } from './invoices.js';
import { lineSources } from './invoiceLines.js';
import { WRITE_OFF_ID } from './invoiceFlow.js';
import { normalizeExpense } from './expenses.js';
import { normalizeTrip } from './mileage.js';
import { normalizeSale } from './products.js';
import {
  loadTimeEntriesByIds,
  loadTimeEntriesByInvoice,
  saveTimeEntries,
} from './timeEntryStorage.js';
import { patchProjectOperations } from '../project/storage.js';
import { isExternalExpense, loadProjectExpenses, saveProjectExpenses } from './expenseStorage.js';
import { isExternalSale, loadProductSales, saveProductSales } from './productSalesStorage.js';

function stamp() {
  return new Date().toISOString();
}

function idSet(list) {
  return new Set((list || []).map((row) => text(row?.id ?? row)).filter(Boolean));
}

function cleanEntry(row) {
  const { _rate, _hours, ...rest } = row || {};
  return rest;
}

function isDemo(companyId) {
  return !text(companyId) || companyId === '__demo__';
}

/** Endrer utlegg, turer og salg i prosjektstate med de valgte id-ene. */
async function patchOperations(companyId, { expenseIds, tripIds, saleIds }, change) {
  if (!expenseIds.size && !tripIds.size && !saleIds.size) return { ok: true, changed: false };
  return patchProjectOperations(companyId, (state) => {
    let changed = false;
    const map = (list, ids, normalize) => (list || []).map((row) => {
      if (!ids.has(row.id)) return row;
      const next = change(row);
      if (!next) return row;
      changed = true;
      return normalize({ ...next, updatedAt: stamp() });
    });
    const expenses = map(state.expenses, expenseIds, normalizeExpense);
    const mileageTrips = map(state.mileageTrips, tripIds, normalizeTrip);
    const sales = map(state.sales, saleIds, normalizeSale);
    return changed ? { expenses, mileageTrips, sales } : null;
  });
}

function splitOperations(selection) {
  const expenses = selection.expenses || [];
  const sales = selection.sales || [];
  return {
    internal: {
      expenseIds: idSet(expenses.filter((row) => !isExternalExpense(row))),
      tripIds: idSet(selection.trips || []),
      saleIds: idSet(sales.filter((row) => !isExternalSale(row))),
    },
    externalExpenses: expenses.filter((row) => isExternalExpense(row)),
    externalSales: sales.filter((row) => isExternalSale(row)),
  };
}

/** Godkjenn utvalget: timer blir godkjent, utlegg og turer godkjent, salg klare. */
export async function approveWork(companyId, selection) {
  if (isDemo(companyId)) return { approved: 0 };
  const entries = (selection.entries || []).filter((row) => row.status !== 'godkjent' && !text(row.invoiceId));
  if (entries.length) {
    await saveTimeEntries(companyId, entries.map((row) => ({ ...cleanEntry(row), status: 'godkjent', updatedAt: stamp() })));
  }
  const pick = (list) => (list || []).filter((row) => row.status !== 'approved' && !text(row.invoiceId));
  const opSelection = {
    expenses: pick(selection.expenses),
    trips: pick(selection.trips),
    sales: pick(selection.sales),
  };
  const { internal, externalExpenses, externalSales } = splitOperations(opSelection);
  await patchOperations(companyId, internal, (row) => ({ ...row, status: 'approved' }));
  if (externalExpenses.length) {
    await saveProjectExpenses(companyId, externalExpenses.map((row) => ({ ...row, status: 'approved', updatedAt: stamp() })));
  }
  if (externalSales.length) {
    await saveProductSales(companyId, externalSales.map((row) => ({ ...row, status: 'approved', updatedAt: stamp() })));
  }
  return {
    approved: entries.length + opSelection.expenses.length + opSelection.trips.length + opSelection.sales.length,
  };
}

/**
 * Reserver utvalget på et utkast: posten peker på utkastet og vises ikke lenger som åpen.
 * Når approve er satt, godkjennes postene samtidig.
 */
export class WorkConflictError extends Error {
  constructor(count) {
    super(count === 1
      ? 'En av postene er allerede lagt på en annen faktura. Last siden på nytt og prøv igjen.'
      : `${count} av postene er allerede lagt på en annen faktura. Last siden på nytt og prøv igjen.`);
    this.code = 'work-conflict';
  }
}

export async function reserveWork(companyId, selection, invoiceId) {
  const id = text(invoiceId);
  if (isDemo(companyId) || !id) return;
  const at = stamp();
  // Ferske timer fra skyen: en annen bruker kan ha fakturert dem i mellomtiden.
  const wanted = (selection.entries || []).map((row) => row.id).filter(Boolean);
  const fresh = wanted.length ? await loadTimeEntriesByIds(companyId, wanted) : [];
  const taken = fresh.filter((row) => text(row.invoiceId) && text(row.invoiceId) !== id);
  if (taken.length) throw new WorkConflictError(taken.length);
  const freshById = new Map(fresh.map((row) => [row.id, row]));
  const entries = (selection.entries || []).map((row) => ({
    ...cleanEntry(freshById.get(row.id) || row),
    invoiceId: id,
    status: 'låst',
    updatedAt: at,
  }));
  const { internal, externalExpenses, externalSales } = splitOperations(selection);
  let conflicts = 0;
  const mark = (row) => {
    if (text(row.invoiceId) && text(row.invoiceId) !== id) {
      conflicts += 1;
      return null;
    }
    return { ...row, status: 'invoiced', invoiceId: id };
  };
  const patched = await patchOperations(companyId, internal, mark);
  if (patched && patched.ok === false) throw patched.error || new Error('Kunne ikke lagre utlegg og salg på utkastet.');
  if (conflicts) throw new WorkConflictError(conflicts);
  if (entries.length) await saveTimeEntries(companyId, entries);
  if (externalExpenses.length) await saveProjectExpenses(companyId, externalExpenses.map((row) => ({ ...mark(row), updatedAt: at })));
  if (externalSales.length) await saveProductSales(companyId, externalSales.map((row) => ({ ...mark(row), updatedAt: at })));
}

/** Id-ene på fakturaen: fra linjene og fra timeEntryIds. */
export function invoiceWorkIds(invoice) {
  const sources = lineSources(invoice?.lines || []);
  return {
    timeEntryIds: [...new Set([...(invoice?.timeEntryIds || []), ...sources.timeEntryIds].map((row) => text(row)).filter(Boolean))],
    expenseIds: sources.expenseIds,
    tripIds: sources.tripIds,
    saleIds: sources.saleIds,
  };
}

/**
 * Frigjør eller avskriv postene på en faktura.
 * mode 'release': tilbake til Til fakturering (godkjent).
 * mode 'writeoff': settes som fakturert uten faktura, med årsak.
 * onlyIds begrenser til bestemte poster (delvis kreditering).
 */
export async function releaseWork(companyId, invoice, {
  mode = 'release',
  reason = '',
  actor = null,
  onlyIds = null,
} = {}) {
  const invoiceId = text(invoice?.id);
  if (isDemo(companyId) || !invoiceId) return { released: 0 };
  const at = stamp();
  const ids = invoiceWorkIds(invoice);
  const limit = onlyIds ? new Set(onlyIds) : null;
  const allowed = (id) => !limit || limit.has(id);
  const byName = text(actor?.byName);
  const writeOff = mode === 'writeoff';

  // Timer: fra id-ene på fakturaen, og alle som fortsatt peker på den.
  const linked = await loadTimeEntriesByInvoice(companyId, invoiceId).catch(() => []);
  const known = idSet(linked);
  const missing = ids.timeEntryIds.filter((id) => !known.has(id));
  const extra = missing.length ? await loadTimeEntriesByIds(companyId, missing).catch(() => []) : [];
  const entries = [...linked, ...extra]
    .filter((row) => text(row.invoiceId) === invoiceId && allowed(row.id))
    .map((row) => (writeOff
      ? {
        ...row,
        invoiceId: WRITE_OFF_ID,
        status: 'låst',
        writeOffAt: at,
        writeOffReason: text(reason),
        writeOffBy: byName,
        updatedAt: at,
      }
      : { ...row, invoiceId: '', status: 'godkjent', updatedAt: at }));
  if (entries.length) await saveTimeEntries(companyId, entries);

  const change = (row) => {
    if (text(row.invoiceId) !== invoiceId) return null;
    if (writeOff) {
      return {
        ...row,
        invoiceId: WRITE_OFF_ID,
        status: 'invoiced',
        writeOffAt: at,
        writeOffReason: text(reason),
        writeOffBy: byName,
      };
    }
    return { ...row, invoiceId: '', status: 'approved', writeOffAt: '', writeOffReason: '', writeOffBy: '' };
  };
  const internal = {
    expenseIds: new Set(ids.expenseIds.filter(allowed)),
    tripIds: new Set(ids.tripIds.filter(allowed)),
    saleIds: new Set(ids.saleIds.filter(allowed)),
  };
  await patchOperations(companyId, internal, change);

  const [externalExpenses, externalSales] = await Promise.all([
    ids.expenseIds.length ? loadProjectExpenses(companyId).catch(() => []) : [],
    ids.saleIds.length ? loadProductSales(companyId).catch(() => []) : [],
  ]);
  const touchedExpenses = externalExpenses
    .filter((row) => internal.expenseIds.has(row.id))
    .map((row) => change(row))
    .filter(Boolean)
    .map((row) => ({ ...row, updatedAt: at }));
  if (touchedExpenses.length) await saveProjectExpenses(companyId, touchedExpenses);
  const touchedSales = externalSales
    .filter((row) => internal.saleIds.has(row.id))
    .map((row) => change(row))
    .filter(Boolean)
    .map((row) => ({ ...row, updatedAt: at }));
  if (touchedSales.length) await saveProductSales(companyId, touchedSales);

  return { released: entries.length + touchedExpenses.length + touchedSales.length };
}

/** Bytt utkastets poster: nye reserveres, poster som ikke lenger er med frigjøres. */
export async function syncDraftWork(companyId, previous, nextInvoice, selection) {
  const before = invoiceWorkIds(previous);
  const after = invoiceWorkIds(nextInvoice);
  const removed = [
    ...before.timeEntryIds.filter((id) => !after.timeEntryIds.includes(id)),
    ...before.expenseIds.filter((id) => !after.expenseIds.includes(id)),
    ...before.tripIds.filter((id) => !after.tripIds.includes(id)),
    ...before.saleIds.filter((id) => !after.saleIds.includes(id)),
  ];
  if (removed.length) await releaseWork(companyId, previous, { mode: 'release', onlyIds: removed });
  const has = (list, id) => list.includes(id);
  await reserveWork(companyId, {
    entries: (selection?.entries || []).filter((row) => has(after.timeEntryIds, row.id) && !has(before.timeEntryIds, row.id)),
    expenses: (selection?.expenses || []).filter((row) => has(after.expenseIds, row.id) && !has(before.expenseIds, row.id)),
    trips: (selection?.trips || []).filter((row) => has(after.tripIds, row.id) && !has(before.tripIds, row.id)),
    sales: (selection?.sales || []).filter((row) => has(after.saleIds, row.id) && !has(before.saleIds, row.id)),
  }, nextInvoice.id);
}
