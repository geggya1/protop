/**
 * Utlegg / reiseregning — registrering, godkjenning og viderefakturering.
 * Ref: bokføringsforskriften § 5-5-1, MVA-håndboken 15-10.2.
 */

import { calcLineVat, roundMoney } from './vat.js';
import { text } from './invoices.js';

// Utgiftstyper med konto (NS 4102) og vanlig mva-sats. Satsen fra kvitteringen går foran.
// Id-ene lagres på utlegget og endres ikke. «Annet» brukes når typen ikke finnes.
export const EXPENSE_CATEGORIES = [
  { id: 'materials', label: 'Materiell / innsats', account: '4000', vatCode: 'HIGH', inputFactor: true },
  { id: 'tools', label: 'Verktøy / utstyr', account: '6500', vatCode: 'HIGH', inputFactor: true },
  { id: 'travel', label: 'Reise (billett/hotell)', account: '7140', vatCode: 'HIGH', inputFactor: false },
  { id: 'flight', label: 'Fly', account: '7140', vatCode: 'LOW', inputFactor: false },
  { id: 'transit', label: 'Buss, tog og båt', account: '7140', vatCode: 'LOW', inputFactor: false },
  { id: 'taxi', label: 'Drosje', account: '7140', vatCode: 'LOW', inputFactor: false },
  { id: 'hotel', label: 'Hotell og overnatting', account: '7140', vatCode: 'LOW', inputFactor: false },
  { id: 'meals', label: 'Mat på reise / overtidsmat', account: '7140', vatCode: 'HIGH', inputFactor: false },
  { id: 'mileage', label: 'Kjøregodtgjørelse', account: '7100', vatCode: 'EXEMPT', inputFactor: false },
  { id: 'fuel', label: 'Drivstoff', account: '7000', vatCode: 'HIGH', inputFactor: false },
  { id: 'charging', label: 'Lading el-bil', account: '7000', vatCode: 'HIGH', inputFactor: false },
  { id: 'parking', label: 'Parkering', account: '7140', vatCode: 'HIGH', inputFactor: false },
  { id: 'toll', label: 'Bompenger', account: '7140', vatCode: 'EXEMPT', inputFactor: false },
  { id: 'vehicle', label: 'Reparasjon og vedlikehold bil', account: '7020', vatCode: 'HIGH', inputFactor: false },
  { id: 'representation', label: 'Representasjon', account: '7370', vatCode: 'HIGH', inputFactor: false },
  { id: 'meeting', label: 'Møtekostnader', account: '6860', vatCode: 'HIGH', inputFactor: false },
  { id: 'course', label: 'Kurs og utdanning', account: '6860', vatCode: 'HIGH', inputFactor: false },
  { id: 'gifts', label: 'Gaver', account: '7420', vatCode: 'HIGH', inputFactor: false },
  { id: 'welfare', label: 'Velferd og sosialt', account: '5990', vatCode: 'HIGH', inputFactor: false },
  { id: 'office', label: 'Kontorrekvisita', account: '6800', vatCode: 'HIGH', inputFactor: false },
  { id: 'equipment', label: 'Inventar og småanskaffelser', account: '6540', vatCode: 'HIGH', inputFactor: false },
  { id: 'software', label: 'Programvare og abonnement', account: '6420', vatCode: 'HIGH', inputFactor: false },
  { id: 'phone', label: 'Telefon og internett', account: '6900', vatCode: 'HIGH', inputFactor: false },
  { id: 'books', label: 'Aviser, tidsskrifter og bøker', account: '6840', vatCode: 'ZERO', inputFactor: false },
  { id: 'postage', label: 'Porto og frakt', account: '6940', vatCode: 'HIGH', inputFactor: false },
  { id: 'marketing', label: 'Reklame og annonser', account: '7320', vatCode: 'HIGH', inputFactor: false },
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

/**
 * Hvordan utlegget faktureres.
 * reinvoice: kjøp i eget navn som viderefaktureres. Mva-pliktig omsetning, påslag tillatt.
 * outlay: kjøp i kundens navn (kvitteringen lyder på kunden). Utenfor mva-grunnlaget, uten påslag.
 */
export const EXPENSE_CHARGE_TYPES = [
  { id: 'reinvoice', label: 'Viderefakturering', hint: 'Kjøpt i eget navn. Faktureres eks. mva med påslag, og får mva.' },
  { id: 'outlay', label: 'Utlegg i kundens navn', hint: 'Kvitteringen lyder på kunden. Faktureres med bruttobeløpet, uten påslag og mva.' },
];

/**
 * Skal utlegget faktureres videre til kunden? Velges først i registreringen, som på kjøretur.
 * unsure: den som godkjenner avgjør. Utlegget står som fakturerbart til det er avklart.
 */
export const EXPENSE_BILLING_CHOICES = [
  { id: 'yes', label: 'Ja', hint: 'Kunden faktureres. Prosjekt må velges.' },
  { id: 'unsure', label: 'Usikker', hint: 'Den som godkjenner avgjør om kunden faktureres.' },
  { id: 'no', label: 'Nei', hint: 'Kostnad for bedriften, på prosjekt eller internt.' },
];

/** Hvem betalte: den ansatte (refunderes) eller bedriften (firmakort). */
export const EXPENSE_PAID_BY = [
  { id: 'personal', label: 'Betalt privat', hint: 'Du får pengene tilbake.' },
  { id: 'company', label: 'Firmakort', hint: 'Bedriften har betalt. Bare kvittering og fordeling.' },
];

export function expenseBillingChoice(row = {}) {
  if (row.billingChoice === 'unsure') return 'unsure';
  if (row.billable === false || row.billingChoice === 'no') return 'no';
  return 'yes';
}

function cleanAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => ({
      url: text(item?.url),
      path: text(item?.path),
      name: text(item?.name).slice(0, 160),
      type: text(item?.type).slice(0, 80),
    }))
    .filter((item) => item.url)
    .slice(0, 10);
}

export function expenseCategory(id) {
  return EXPENSE_CATEGORIES.find((row) => row.id === id) || EXPENSE_CATEGORIES.find((row) => row.id === 'other');
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
    chargeType: 'reinvoice',
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
    tripId: '',
    vehicleId: '',
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
  const signedEx = Number.isFinite(amountEx) && amountEx !== 0 ? amountEx : null;
  const signedIncl = Number.isFinite(amountIncl) && amountIncl !== 0 ? amountIncl : null;
  const sign = (signedEx != null ? signedEx : signedIncl) < 0 ? -1 : 1;
  const absEx = signedEx != null ? Math.abs(signedEx) : 0;
  const absIncl = signedIncl != null ? Math.abs(signedIncl) : 0;
  let calc;
  if (absEx > 0) {
    calc = calcLineVat({ quantity: 1, unitPrice: absEx, vatCode });
  } else if (absIncl > 0) {
    const known = calcLineVat({ quantity: 1, unitPrice: 100, vatCode });
    const factor = 1 + (known.vatPercent || 0) / 100;
    const ex = roundMoney(absIncl / factor);
    calc = calcLineVat({ quantity: 1, unitPrice: ex, vatCode });
  } else {
    calc = calcLineVat({ quantity: 1, unitPrice: 0, vatCode });
  }
  if (sign < 0) {
    calc = {
      ...calc,
      amountExVat: roundMoney(-calc.amountExVat),
      vatAmount: roundMoney(-calc.vatAmount),
      amountInclVat: roundMoney(-calc.amountInclVat),
    };
  }
  const status = EXPENSE_STATUSES.some((s) => s.id === row.status) ? row.status : 'draft';
  const attachments = cleanAttachments(row.attachments);
  // Nei = ikke fakturerbar. Usikker og ja står som fakturerbare til de er avklart.
  const billingChoice = row.billingChoice === 'unsure' ? 'unsure' : (row.billable === false || row.billingChoice === 'no' ? 'no' : 'yes');
  const originalAmount = Math.abs(Number(row.originalAmount)) > 0 ? roundMoney(Number(row.originalAmount)) : 0;
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
    markupPercent: row.chargeType === 'outlay' ? 0 : Math.max(0, Number(row.markupPercent) || 0),
    chargeType: row.chargeType === 'outlay' ? 'outlay' : 'reinvoice',
    billable: row.billable !== false && row.billingChoice !== 'no',
    representation: !!row.representation || category.id === 'representation',
    customerId: text(row.customerId),
    customerNumber: text(row.customerNumber),
    customerName: text(row.customerName),
    projectId: text(row.projectId),
    projectNumber: text(row.projectNumber),
    projectName: text(row.projectName),
    receiptUri: text(row.receiptUri) || attachments[0]?.url || '',
    receiptName: text(row.receiptName) || attachments[0]?.name || '',
    attachments,
    billingChoice,
    vendorOrgNr: text(row.vendorOrgNr).replace(/\D/g, '').slice(0, 9),
    receiptNumber: text(row.receiptNumber).slice(0, 60),
    originalCurrency: originalAmount ? text(row.originalCurrency).toUpperCase().slice(0, 3) : '',
    originalAmount,
    interpreted: Array.isArray(row.interpreted) ? row.interpreted.map(text).filter(Boolean).slice(0, 20) : [],
    status,
    invoiceId: text(row.invoiceId),
    tripId: text(row.tripId),
    vehicleId: text(row.vehicleId),
    notes: text(row.notes),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
    account: category.account,
    inputFactor: !!category.inputFactor,
    importFingerprint: text(row.importFingerprint),
    externalStore: row.externalStore === true || row.storage === 'projectExpenses',
    externalId: text(row.externalId),
    externalInvoiceNumber: text(row.externalInvoiceNumber),
    voucherNumber: text(row.voucherNumber),
    activityName: text(row.activityName),
    period: text(row.period),
    quantity: Number(row.quantity) || 0,
    unitPrice: Number(row.unitPrice) || 0,
    supplierNumber: text(row.supplierNumber),
    supplierInvoice: text(row.supplierInvoice),
    accountLabel: text(row.accountLabel),
    attachmentNames: text(row.attachmentNames),
    writeOffAt: text(row.writeOffAt),
    writeOffReason: text(row.writeOffReason).slice(0, 300),
    writeOffBy: text(row.writeOffBy).slice(0, 120),
    source: row.source && typeof row.source === 'object'
      ? {
        filename: text(row.source.filename),
        importedAt: text(row.source.importedAt),
      }
      : { filename: '', importedAt: '' },
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
  if (!(Math.abs(row.amountInclVat) > 0 || Math.abs(row.amountExVat) > 0)) return { ok: false, error: 'Beløp mangler.' };
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
