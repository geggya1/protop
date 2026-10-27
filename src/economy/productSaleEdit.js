/**
 * Endre ett produktsalg fra Produktsalg-tabellen eller prosjektet.
 * Fakturert salg er låst: fakturaen er fasit, og retting skjer med kreditnota.
 */
import { normalizeSale } from './products.js';
import { displayName } from '../employees/model.js';
import { parseMoney, text } from './invoices.js';
import { saleIsLocked } from './productSalesView.js';
import { resolveVatPercent, roundMoney } from './vat.js';

export const SALE_EDIT_STATUSES = [
  { id: 'draft', label: 'Utkast' },
  { id: 'approved', label: 'Klar for faktura' },
];

function numText(value) {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? String(n).replace('.', ',') : '';
}

/** Skjemaverdier som tekst, så feltene kan redigeres fritt. */
export function saleDraft(sale) {
  const row = normalizeSale(sale);
  return {
    date: row.date,
    name: row.name,
    title: row.title && row.title !== row.name ? row.title : '',
    quantity: numText(row.quantity) || '1',
    unit: row.unit,
    unitPrice: numText(row.unitPrice),
    discountPercent: numText(row.discountPercent),
    purchaseUnitPrice: numText(row.purchaseUnitPrice),
    vatCode: row.vatCode,
    comment: row.comment,
    status: row.status === 'invoiced' ? 'approved' : row.status,
    projectId: row.projectId,
    customerId: row.customerId,
    customerName: row.customerName,
    employeeId: row.employeeId,
  };
}

/**
 * Kobling til prosjekt, kunde eller medarbeider. Treff i registeret vinner.
 * Samme id som før (også når raden er borte fra registeret) beholdes.
 * Uten kobling før og etter står teksten fra filen. Ellers tømmes feltene.
 */
function pickLink(before, id, list, { id: idKey, fields, from }) {
  const wanted = text(id);
  const hit = wanted ? (list || []).find((row) => row?.id === wanted) : null;
  if (hit) return from(hit);
  const keep = wanted ? wanted === before[idKey] : !before[idKey];
  const out = { [idKey]: keep ? before[idKey] : '' };
  for (const key of fields) out[key] = keep ? before[key] : '';
  return out;
}

function money(value) {
  if (value == null || String(value).trim() === '') return 0;
  return parseMoney(value);
}

/**
 * Bruk skjemaet på salget. Beløpene regnes på nytt bare når antall, pris,
 * rabatt eller MVA er endret. Ellers står importerte beløp urørt.
 */
export function applySaleDraft(sale, draft, {
  projects = [],
  customers = [],
  employees = [],
  now = new Date().toISOString(),
} = {}) {
  const before = normalizeSale(sale);
  if (saleIsLocked(before)) {
    return { ok: false, error: 'Salget er fakturert og kan ikke endres.' };
  }
  const name = text(draft?.name);
  if (!name) return { ok: false, error: 'Produktnavn mangler.' };
  const date = text(draft?.date);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Dato må være på formen ÅÅÅÅ-MM-DD.' };
  const quantity = money(draft?.quantity);
  if (quantity == null || !(quantity > 0)) return { ok: false, error: 'Antall må være større enn 0.' };
  const unitPrice = money(draft?.unitPrice);
  if (unitPrice == null || unitPrice < 0) return { ok: false, error: 'Pris må være et tall.' };
  const discount = money(draft?.discountPercent);
  if (discount == null || discount < 0 || discount > 100) return { ok: false, error: 'Rabatt må være mellom 0 og 100 %.' };
  const purchase = money(draft?.purchaseUnitPrice);
  if (purchase == null || purchase < 0) return { ok: false, error: 'Kostpris må være et tall.' };
  const vatCode = text(draft?.vatCode) || before.vatCode;
  const status = draft?.status === 'draft' ? 'draft' : 'approved';

  const projectFields = pickLink(before, draft?.projectId, projects, {
    id: 'projectId',
    fields: ['projectNumber', 'projectName'],
    from: (row) => ({ projectId: row.id, projectNumber: text(row.number), projectName: text(row.name) }),
  });
  const customerFields = draft?.customerId
    ? pickLink(before, draft.customerId, customers, {
      id: 'customerId',
      fields: ['customerNumber', 'customerName'],
      from: (row) => ({ customerId: row.id, customerNumber: text(row.customerNumber), customerName: text(row.name) }),
    })
    : {
      customerId: '',
      customerNumber: text(draft?.customerName) === before.customerName ? before.customerNumber : '',
      customerName: text(draft?.customerName),
    };
  const employeeFields = pickLink(before, draft?.employeeId, employees, {
    id: 'employeeId',
    fields: ['employeeName'],
    from: (row) => ({ employeeId: row.id, employeeName: displayName(row) }),
  });

  const priceChanged = roundMoney(quantity) !== roundMoney(before.quantity)
    || roundMoney(unitPrice) !== roundMoney(before.unitPrice)
    || roundMoney(discount) !== roundMoney(before.discountPercent || 0)
    || vatCode !== before.vatCode;
  let amounts = {};
  if (priceChanged) {
    const exVat = roundMoney(quantity * unitPrice * (1 - discount / 100));
    const percent = resolveVatPercent(vatCode);
    const vat = roundMoney(exVat * (percent / 100));
    amounts = {
      lockAmounts: true,
      amountExVat: exVat,
      vatAmount: vat,
      amountInclVat: roundMoney(exVat + vat),
      vatPercent: percent,
    };
  }

  const next = normalizeSale({
    ...before,
    ...projectFields,
    ...customerFields,
    ...employeeFields,
    ...amounts,
    date,
    name,
    title: text(draft?.title),
    quantity,
    unit: text(draft?.unit) || before.unit,
    unitPrice,
    discountPercent: discount,
    purchaseUnitPrice: purchase,
    vatCode,
    comment: text(draft?.comment),
    status,
    updatedAt: now,
  });
  return { ok: true, sale: next, priceChanged };
}

/**
 * Bytt ut salget i prosjektstate. Lagerført produkt justeres med endringen i
 * antall, ikke trukket på nytt.
 */
export function replaceSaleInState(state, sale) {
  const list = Array.isArray(state?.sales) ? state.sales : [];
  const current = list.find((row) => row?.id === sale?.id);
  if (!current) return { ok: false, state, error: 'Salgslinjen finnes ikke.' };
  if (saleIsLocked(current)) return { ok: false, state, error: 'Salget er fakturert og kan ikke endres.' };
  let products = state.products || [];
  if (sale.productId && sale.productId === current.productId) {
    const product = products.find((row) => row.id === sale.productId);
    const delta = (Number(sale.quantity) || 0) - (Number(current.quantity) || 0);
    if (product?.trackStock && delta) {
      const stock = roundMoney((Number(product.stock) || 0) - delta);
      if (stock < 0) return { ok: false, state, error: 'Ikke nok på lager.' };
      products = products.map((row) => (row.id === product.id ? { ...row, stock } : row));
    }
  }
  return {
    ok: true,
    state: {
      ...state,
      products,
      sales: list.map((row) => (row?.id === sale.id ? sale : row)),
    },
  };
}
