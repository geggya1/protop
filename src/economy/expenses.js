/**
 * Utlegg / reiseregning — registrering, godkjenning og viderefakturering.
 * Ref: bokføringsforskriften § 5-5-1, MVA-håndboken 15-10.2.
 */

import { calcLineVat, roundMoney } from './vat.js';
import { text } from './invoices.js';

export const EXPENSE_CATEGORIES = [
  { id: 'materials', label: 'Materiell / innsats', account: '4000', vatCode: 'HIGH', inputFactor: true },
  { id: 'tools', label: 'Verktøy / utstyr', account: '6500', vatCode: 'HIGH', inputFactor: true },
  { id: 'travel', label: 'Reise (billett/hotell)', account: '7140', vatCode: 'HIGH', inputFactor: false },
  { id: 'parking', label: 'Parkering', account: '7140', vatCode: 'HIGH', inputFactor: false },
  { id: 'toll', label: 'Bompenger', account: '7140', vatCode: 'EXEMPT', inputFactor: false },
  { id: 'representation', label: 'Representasjon', account: '7370', vatCode: 'HIGH', inputFactor: false },
  { id: 'office', label: 'Kontor', account: '7000', vatCode: 'HIGH', inputFactor: false },
  { id: 'other', label: 'Annet', account: '7790', vatCode: 'HIGH', inputFactor: false },
];

export const EXPENSE_STATUSES = [
  { id: 'draft', label: 'Utkast' },
  { id: 'submitted', label: 'Sendt' },
  { id: 'approved', label: 'Godkjent' },
  { id: 'rejected', label: 'Avvist' },
  { id: 'invoiced', label: 'Fakturert' },
  { id: 'reimbursed', label: 'Utbetalt' },
];

export const RECEIPT_REQUIRED_INCL = 1000;

export function expenseCategory(id) {
  return EXPENSE_CATEGORIES.find((row) => row.id === id) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}

export function emptyExpense(overrides = {}) {
  return normalizeExpense({
    id: '',
    date: '',
    employeeId: '',
    employeeName: '',
    category: 'other',
    description: '',
    purpose: '',
    vendor: '',
    paidBy: 'personal', // personal | company
    currency: 'NOK',
    amountExVat: 0,
    vatCode: 'HIGH',
    vatAmount: 0,
    amountInclVat: 0,
    markupPercent: 0,
    billable: true,
    representation: false,
    customerId: '',
    customerNumber: '',
    customerName: '',
    projectId: '',
    projectNumber: '',
    projectName: '',
    receiptUri: '',
    receiptName: '',
    status: 'draft',
    invoiceId: '',
    notes: '',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  });
}

export function normalizeExpense(input = {}) {
  const row = input && typeof input === 'object' ? input : {};
  const category = expenseCategory(row.category);
  const vatCode = text(row.vatCode) || category.vatCode;
  const amountEx = Number(row.amountExVat);
  const amountIncl = Number(row.amountInclVat);
  let calc;
  if (Number.isFinite(amountEx) && amountEx > 0) {
    calc = calcLineVat({ quantity: 1, unitPrice: amountEx, vatCode });
  } else if (Number.isFinite(amountIncl) && amountIncl > 0) {
    const known = calcLineVat({ quantity: 1, unitPrice: 100, vatCode });
    const factor = 1 + (known.vatPercent || 0) / 100;
    const ex = roundMoney(amountIncl / factor);
    calc = calcLineVat({ quantity: 1, unitPrice: ex, vatCode });
  } else {
    calc = calcLineVat({ quantity: 1, unitPrice: 0, vatCode });
  }
  const status = EXPENSE_STATUSES.some((s) => s.id === row.status) ? row.status : 'draft';
  return {
    id: text(row.id),
    date: text(row.date),
    employeeId: text(row.employeeId),
    employeeName: text(row.employeeName),
    category: category.id,
    description: text(row.description),
    purpose: text(row.purpose),
    vendor: text(row.vendor),
    paidBy: row.paidBy === 'company' ? 'company' : 'personal',
    currency: text(row.currency) || 'NOK',
    amountExVat: calc.amountExVat,
    vatCode,
    vatPercent: calc.vatPercent,
    vatAmount: calc.vatAmount,
    amountInclVat: calc.amountInclVat,
    markupPercent: Math.max(0, Number(row.markupPercent) || 0),
    billable: row.billable !== false,
    representation: !!row.representation || category.id === 'representation',
    customerId: text(row.customerId),
    customerNumber: text(row.customerNumber),
    customerName: text(row.customerName),
    projectId: text(row.projectId),
    projectNumber: text(row.projectNumber),
    projectName: text(row.projectName),
    receiptUri: text(row.receiptUri),
    receiptName: text(row.receiptName),
    status,
    invoiceId: text(row.invoiceId),
    notes: text(row.notes),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
    account: category.account,
    inputFactor: !!category.inputFactor,
  };
}

export function expenseNeedsNamedBuyer(expense) {
  const row = normalizeExpense(expense);
  return row.inputFactor && row.amountInclVat > RECEIPT_REQUIRED_INCL;
}

export function expenseNeedsReceipt(expense) {
  const row = normalizeExpense(expense);
  if (row.receiptUri) return false;
  return row.amountInclVat > RECEIPT_REQUIRED_INCL || expenseNeedsNamedBuyer(row);
}

export function expenseBillableExVat(expense) {
  const row = normalizeExpense(expense);
  const markup = 1 + (row.markupPercent || 0) / 100;
  return roundMoney(row.amountExVat * markup);
}

export function validateExpense(expense) {
  const row = normalizeExpense(expense);
  if (!row.date) return { ok: false, error: 'Dato mangler.' };
  if (!(row.amountInclVat > 0 || row.amountExVat > 0)) return { ok: false, error: 'Beløp mangler.' };
  if (!row.description && !row.purpose) return { ok: false, error: 'Beskrivelse eller formål mangler.' };
  if (expenseNeedsNamedBuyer(row) && !row.receiptUri) {
    return { ok: false, error: 'Utlegg over 1 000 kr til videresalg/innsats krever kvittering med arbeidsgiver som kjøper.' };
  }
  return { ok: true, error: null, expense: row };
}

export function expenseInvoiceLine(expense, { vatCode } = {}) {
  const row = normalizeExpense(expense);
  const amount = expenseBillableExVat(row);
  const code = vatCode || row.vatCode || 'HIGH';
  const calc = calcLineVat({ quantity: 1, unitPrice: amount, vatCode: code });
  return {
    id: `exp_${row.id || 'x'}`,
    description: row.description || row.purpose || expenseCategory(row.category).label,
    quantity: 1,
    unit: 'stk',
    unitPrice: amount,
    vatCode: code,
    account: '3000',
    expenseIds: row.id ? [row.id] : [],
    ...calc,
  };
}

export function expensesToCsv(rows = []) {
  const header = [
    'Dato', 'Ansatt', 'Kategori', 'Beskrivelse', 'Formål', 'Eks mva', 'MVA', 'Ink mva',
    'Viderefakturer', 'Status', 'Kunde', 'Prosjekt',
  ];
  const lines = rows.map((raw) => {
    const row = normalizeExpense(raw);
    return [
      row.date,
      row.employeeName,
      expenseCategory(row.category).label,
      row.description,
      row.purpose,
      row.amountExVat,
      row.vatAmount,
      row.amountInclVat,
      row.billable ? 'ja' : 'nei',
      row.status,
      row.customerName,
      row.projectName,
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';');
  });
  return `\uFEFF${header.join(';')}\n${lines.join('\n')}`;
}
