/**
 * Mutasjoner for utlegg, kjørebok, produkter og varesalg på prosjektstate.
 */

import { createId } from '../project/engine.js';
import { normalizeExpense, validateExpense } from './expenses.js';
import { normalizeTrip, validateTrip } from './mileage.js';
import { applySaleToStock, normalizeProduct, normalizeSale, validateProduct } from './products.js';

function stamp() {
  return new Date().toISOString();
}

function ok(state, extra = {}) {
  return { ok: true, error: null, state, ...extra };
}

function fail(state, error) {
  return { ok: false, error, state };
}

function replaceById(list, row) {
  const rest = (list || []).filter((item) => item.id !== row.id);
  return [row, ...rest];
}

export function upsertExpense(state, input) {
  const check = validateExpense(input);
  if (!check.ok) return fail(state, check.error);
  const existing = (state.expenses || []).find((row) => row.id && row.id === input.id);
  if (existing?.status === 'invoiced') return fail(state, 'Fakturert utlegg kan ikke endres.');
  const row = normalizeExpense({
    ...check.expense,
    id: existing?.id || input.id || createId('utl'),
    createdAt: existing?.createdAt || stamp(),
    updatedAt: stamp(),
  });
  return ok({ ...state, expenses: replaceById(state.expenses || [], row) }, { expense: row });
}

export function setExpenseStatus(state, id, status) {
  const current = (state.expenses || []).find((row) => row.id === id);
  if (!current) return fail(state, 'Utlegget finnes ikke.');
  if (current.status === 'invoiced' && status !== 'invoiced') {
    return fail(state, 'Fakturert utlegg kan ikke åpnes.');
  }
  const row = normalizeExpense({ ...current, status, updatedAt: stamp() });
  return ok({ ...state, expenses: replaceById(state.expenses, row) }, { expense: row });
}

export function deleteExpense(state, id) {
  const current = (state.expenses || []).find((row) => row.id === id);
  if (!current) return fail(state, 'Utlegget finnes ikke.');
  if (current.status === 'invoiced') return fail(state, 'Fakturert utlegg kan ikke slettes.');
  return ok({
    ...state,
    expenses: (state.expenses || []).filter((row) => row.id !== id),
  }, { expense: current });
}

export function upsertTrip(state, input) {
  const check = validateTrip(input);
  if (!check.ok) return fail(state, check.error);
  const existing = (state.mileageTrips || []).find((row) => row.id && row.id === input.id);
  if (existing?.status === 'invoiced') return fail(state, 'Fakturert tur kan ikke endres.');
  const row = normalizeTrip({
    ...check.trip,
    id: existing?.id || input.id || createId('tur'),
    createdAt: existing?.createdAt || stamp(),
    updatedAt: stamp(),
  });
  return ok({ ...state, mileageTrips: replaceById(state.mileageTrips || [], row) }, { trip: row });
}

/**
 * Lagrer kjøreturen og et tilhørende utlegg på samme prosjekt og person.
 * Utlegget er ikke viderefakturerbart: fakturalinjen kommer fra kjøreboken,
 * så kunden ikke belastes to ganger for samme tur.
 */
export function recordDutyTrip(state, input) {
  const expenseId = input?.expenseId || (state.expenses || []).find((row) => row.tripId && row.tripId === input?.id)?.id || '';
  const draft = {
    ...input,
    purpose: input?.purpose || 'duty',
    status: input?.status || 'approved',
    billable: input?.billable !== false,
    expenseId: expenseId || input?.expenseId || '',
  };
  const check = validateTrip(draft);
  if (!check.ok) return fail(state, check.error);
  const nextExpenseId = expenseId || check.trip.expenseId || createId('utl');
  const tripSaved = upsertTrip(state, { ...check.trip, expenseId: nextExpenseId });
  if (!tripSaved.ok) return tripSaved;
  const trip = tripSaved.trip;
  const expenseSaved = upsertExpense(tripSaved.state, {
    id: nextExpenseId,
    date: trip.date,
    employeeId: trip.employeeId,
    employeeName: trip.employeeName,
    category: 'mileage',
    description: `Kjøring ${trip.from} – ${trip.to}`,
    purpose: trip.notes || trip.visitPurpose,
    vendor: trip.vehicleName || '',
    paidBy: trip.vehicleKind === 'company' ? 'company' : 'personal',
    amountExVat: trip.amount,
    vatCode: 'EXEMPT',
    billable: false,
    customerId: trip.customerId,
    customerNumber: trip.customerNumber,
    customerName: trip.customerName,
    projectId: trip.projectId,
    projectNumber: trip.projectNumber,
    projectName: trip.projectName,
    tripId: trip.id,
    vehicleId: trip.vehicleId,
    status: 'approved',
    notes: 'Koblet til kjørebok. Faktureres som kjøretur, ikke som eget utlegg.',
  });
  if (!expenseSaved.ok) return expenseSaved;
  return ok(expenseSaved.state, { trip, expense: expenseSaved.expense });
}

export function deleteTrip(state, id) {
  const current = (state.mileageTrips || []).find((row) => row.id === id);
  if (!current) return fail(state, 'Turen finnes ikke.');
  if (current.status === 'invoiced') return fail(state, 'Fakturert tur kan ikke slettes.');
  const tombstone = {
    id: current.id,
    expenseId: current.expenseId || '',
    deletedAt: stamp(),
  };
  return ok({
    ...state,
    mileageTrips: (state.mileageTrips || []).filter((row) => row.id !== id),
    expenses: (state.expenses || []).filter((row) => row.id !== current.expenseId && row.tripId !== id),
    deletedMileageTrips: [
      ...(state.deletedMileageTrips || []).filter((row) => row?.id !== id),
      tombstone,
    ],
  }, { trip: current });
}

export function setTripStatus(state, id, status) {
  const current = (state.mileageTrips || []).find((row) => row.id === id);
  if (!current) return fail(state, 'Turen finnes ikke.');
  const row = normalizeTrip({ ...current, status, updatedAt: stamp() });
  return ok({ ...state, mileageTrips: replaceById(state.mileageTrips, row) }, { trip: row });
}

export function upsertProduct(state, input) {
  const check = validateProduct(input);
  if (!check.ok) return fail(state, check.error);
  const existing = (state.products || []).find((row) => row.id && row.id === input.id);
  const sku = check.product.sku.toLowerCase();
  // Bare nytt eller endret varenr sjekkes. Gamle dubletter fra import kan fortsatt redigeres.
  const skuChanged = sku && String(existing?.sku || '').trim().toLowerCase() !== sku;
  const twin = skuChanged
    ? (state.products || []).find((row) => (
      row.id !== (existing?.id || input.id) && String(row.sku || '').trim().toLowerCase() === sku
    ))
    : null;
  if (twin) return fail(state, `Varenr ${check.product.sku} brukes allerede av ${twin.name || 'et annet produkt'}.`);
  const row = normalizeProduct({
    ...check.product,
    id: existing?.id || input.id || createId('var'),
    createdAt: existing?.createdAt || stamp(),
    updatedAt: stamp(),
  });
  return ok({ ...state, products: replaceById(state.products || [], row) }, { product: row });
}

/** Arkiver eller hent tilbake. Arkiverte produkter beholder salgshistorikken. */
export function setProductArchived(state, id, archived = true) {
  const current = (state.products || []).find((row) => row.id === id);
  if (!current) return fail(state, 'Produktet finnes ikke.');
  const at = stamp();
  const row = normalizeProduct({
    ...current,
    archived: !!archived,
    archivedAt: archived ? at : '',
    updatedAt: at,
  });
  return ok({ ...state, products: replaceById(state.products, row) }, { product: row });
}

/**
 * Slett et produkt som aldri er brukt. usedCount er antall salg som peker på
 * produktet. Brukte produkter arkiveres i stedet, så historikken står.
 */
export function deleteProduct(state, id, { usedCount = 0 } = {}) {
  const current = (state.products || []).find((row) => row.id === id);
  if (!current) return fail(state, 'Produktet finnes ikke.');
  if (usedCount > 0) {
    return fail(state, 'Produktet er brukt i salg og kan ikke slettes. Arkiver det i stedet.');
  }
  return ok({
    ...state,
    products: (state.products || []).filter((row) => row.id !== id),
    deletedProducts: [
      ...(state.deletedProducts || []).filter((row) => row?.id !== id),
      { id, deletedAt: stamp() },
    ],
  }, { product: current });
}

export function upsertSale(state, input) {
  const sale = normalizeSale({
    ...input,
    id: input.id || createId('sal'),
    createdAt: input.createdAt || stamp(),
    updatedAt: stamp(),
  });
  if (!sale.name) return fail(state, 'Salgslinje mangler produktnavn.');
  if (!(sale.quantity > 0)) return fail(state, 'Antall må være større enn 0.');
  let products = state.products || [];
  if (sale.productId) {
    const product = products.find((row) => row.id === sale.productId);
    if (product?.trackStock) {
      const next = applySaleToStock(product, sale);
      if (next.stock < 0) return fail(state, 'Ikke nok på lager.');
      products = replaceById(products, next);
    }
  }
  return ok({
    ...state,
    products,
    sales: replaceById(state.sales || [], sale),
  }, { sale });
}

export function setSaleStatus(state, id, status) {
  const current = (state.sales || []).find((row) => row.id === id);
  if (!current) return fail(state, 'Salgslinjen finnes ikke.');
  const row = normalizeSale({ ...current, status, updatedAt: stamp() });
  return ok({ ...state, sales: replaceById(state.sales, row) }, { sale: row });
}

export function deleteSale(state, id) {
  const current = (state.sales || []).find((row) => row.id === id);
  if (!current) return fail(state, 'Salgslinjen finnes ikke.');
  if (current.status === 'invoiced') return fail(state, 'Fakturert salg kan ikke slettes.');
  return ok({
    ...state,
    sales: (state.sales || []).filter((row) => row.id !== id),
  }, { sale: current });
}

export function markOperationsInvoiced(state, {
  expenseIds = [],
  tripIds = [],
  saleIds = [],
  invoiceId = '',
} = {}) {
  const stampAt = stamp();
  const expenses = (state.expenses || []).map((row) => (
    expenseIds.includes(row.id)
      ? normalizeExpense({ ...row, status: 'invoiced', invoiceId, updatedAt: stampAt })
      : row
  ));
  const mileageTrips = (state.mileageTrips || []).map((row) => (
    tripIds.includes(row.id)
      ? normalizeTrip({ ...row, status: 'invoiced', invoiceId, updatedAt: stampAt })
      : row
  ));
  const sales = (state.sales || []).map((row) => (
    saleIds.includes(row.id)
      ? normalizeSale({ ...row, status: 'invoiced', invoiceId, updatedAt: stampAt })
      : row
  ));
  return { ...state, expenses, mileageTrips, sales };
}

/** Frigjør utlegg/kjøring/varer knyttet til en slettet faktura. */
export function clearOperationsInvoice(state, invoiceId = '') {
  const id = String(invoiceId || '').trim();
  if (!id) return state;
  const stampAt = stamp();
  let changed = false;
  const release = (row, approvedStatus) => {
    if (String(row?.invoiceId || '').trim() !== id) return row;
    changed = true;
    return {
      ...row,
      invoiceId: '',
      status: row.status === 'invoiced' ? approvedStatus : row.status,
      updatedAt: stampAt,
    };
  };
  const expenses = (state.expenses || []).map((row) => normalizeExpense(release(row, 'approved')));
  const mileageTrips = (state.mileageTrips || []).map((row) => normalizeTrip(release(row, 'approved')));
  const sales = (state.sales || []).map((row) => normalizeSale(release(row, 'approved')));
  return changed ? { ...state, expenses, mileageTrips, sales } : state;
}
