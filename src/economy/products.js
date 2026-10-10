/**
 * Produktkatalog og varesalg (stykk) mot kunde/prosjekt.
 * Ref: Fiken produkter, PowerOffice produkt + salgskonto, bokføringsforskriften 5-1.
 */

import { calcLineVat, defaultVatCode, roundMoney } from './vat.js';
import { text } from './invoices.js';

export const PRODUCT_KINDS = [
  { id: 'goods_resale', label: 'Vare (videresalg)', account: '3000', costAccount: '4000' },
  { id: 'goods_own', label: 'Vare (egenprodusert)', account: '3000', costAccount: '4000' },
  { id: 'service', label: 'Tjeneste', account: '3000', costAccount: '' },
  { id: 'other', label: 'Annet', account: '3900', costAccount: '' },
];

export const SALE_STATUSES = [
  { id: 'draft', label: 'Utkast' },
  { id: 'approved', label: 'Klar' },
  { id: 'invoiced', label: 'Fakturert' },
];

export function productKind(id) {
  return PRODUCT_KINDS.find((row) => row.id === id) || PRODUCT_KINDS[0];
}

export function emptyProduct(overrides = {}) {
  return normalizeProduct({
    id: '',
    sku: '',
    name: '',
    kind: 'goods_resale',
    unit: 'stk',
    priceExVat: 0,
    costExVat: 0,
    vatCode: 'HIGH',
    account: '',
    stock: null,
    trackStock: false,
    notes: '',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  });
}

export function normalizeProduct(input = {}) {
  const row = input && typeof input === 'object' ? input : {};
  const kind = productKind(row.kind);
  const vatCode = text(row.vatCode) || defaultVatCode();
  const price = Math.max(0, Number(row.priceExVat) || 0);
  return {
    id: text(row.id),
    sku: text(row.sku),
    name: text(row.name),
    kind: kind.id,
    unit: text(row.unit) || 'stk',
    priceExVat: roundMoney(price),
    costExVat: roundMoney(Math.max(0, Number(row.costExVat) || 0)),
    vatCode,
    account: text(row.account) || kind.account,
    costAccount: kind.costAccount,
    stock: row.trackStock || row.stock != null ? Number(row.stock) || 0 : null,
    trackStock: !!row.trackStock || row.stock != null,
    notes: text(row.notes),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
  };
}

export function validateProduct(product) {
  const row = normalizeProduct(product);
  if (!row.name) return { ok: false, error: 'Produktnavn mangler.' };
  if (!(row.priceExVat >= 0)) return { ok: false, error: 'Pris mangler.' };
  return { ok: true, error: null, product: row };
}

export function emptySale(overrides = {}) {
  return normalizeSale({
    id: '',
    date: '',
    productId: '',
    sku: '',
    name: '',
    quantity: 1,
    unit: 'stk',
    unitPrice: 0,
    vatCode: 'HIGH',
    account: '3000',
    billable: true,
    customerId: '',
    customerNumber: '',
    customerName: '',
    projectId: '',
    projectNumber: '',
    projectName: '',
    status: 'draft',
    invoiceId: '',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  });
}

export function normalizeSale(input = {}) {
  const row = input && typeof input === 'object' ? input : {};
  const quantity = Number(row.quantity);
  const qty = Number.isFinite(quantity) && quantity !== 0 ? quantity : 1;
  const vatCode = text(row.vatCode) || 'HIGH';
  const unitPrice = Math.max(0, Number(row.unitPrice) || 0);
  const calc = calcLineVat({ quantity: qty, unitPrice, vatCode });
  const status = SALE_STATUSES.some((s) => s.id === row.status) ? row.status : 'draft';
  return {
    id: text(row.id),
    date: text(row.date),
    productId: text(row.productId),
    sku: text(row.sku),
    name: text(row.name),
    quantity: qty,
    unit: text(row.unit) || 'stk',
    unitPrice: roundMoney(unitPrice),
    vatCode,
    account: text(row.account) || '3000',
    billable: row.billable !== false,
    customerId: text(row.customerId),
    customerNumber: text(row.customerNumber),
    customerName: text(row.customerName),
    projectId: text(row.projectId),
    projectNumber: text(row.projectNumber),
    projectName: text(row.projectName),
    status,
    invoiceId: text(row.invoiceId),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
    amountExVat: calc.amountExVat,
    vatAmount: calc.vatAmount,
    amountInclVat: calc.amountInclVat,
    vatPercent: calc.vatPercent,
  };
}

export function saleFromProduct(product, extras = {}) {
  const row = normalizeProduct(product);
  return emptySale({
    productId: row.id,
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    unitPrice: row.priceExVat,
    vatCode: row.vatCode,
    account: row.account,
    ...extras,
  });
}

export function applySaleToStock(product, sale) {
  const catalog = normalizeProduct(product);
  const line = normalizeSale(sale);
  if (!catalog.trackStock) return catalog;
  return { ...catalog, stock: roundMoney((Number(catalog.stock) || 0) - line.quantity) };
}

export function saleInvoiceLine(sale) {
  const row = normalizeSale(sale);
  return {
    id: `sale_${row.id || 'x'}`,
    description: row.sku ? `${row.sku} ${row.name}` : (row.name || 'Vare'),
    quantity: row.quantity,
    unit: row.unit,
    unitPrice: row.unitPrice,
    vatCode: row.vatCode,
    account: row.account || '3000',
    saleIds: row.id ? [row.id] : [],
    amountExVat: row.amountExVat,
    vatAmount: row.vatAmount,
    amountInclVat: row.amountInclVat,
    vatPercent: row.vatPercent,
  };
}

export function productsToCsv(rows = []) {
  const header = ['Varenr', 'Navn', 'Type', 'Enhet', 'Pris eks', 'MVA', 'Konto', 'Lager'];
  const lines = rows.map((raw) => {
    const row = normalizeProduct(raw);
    return [
      row.sku, row.name, productKind(row.kind).label, row.unit,
      row.priceExVat, row.vatCode, row.account,
      row.trackStock ? row.stock : '',
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';');
  });
  return `\uFEFF${header.join(';')}\n${lines.join('\n')}`;
}
