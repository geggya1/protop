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
  const row = normalizeProduct({
    ...check.product,
    id: existing?.id || input.id || createId('var'),
    createdAt: existing?.createdAt || stamp(),
    updatedAt: stamp(),
  });
  return ok({ ...state, products: replaceById(state.products || [], row) }, { product: row });
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
