/**
 * Selskapets standard faktura- og økonomiinnstillinger.
 * Prosjekter arver disse verdien når prosjektfelt er tomme / «bruk standard».
 */
import { normalizeNumberJumps } from './invoiceNumberSeries.js';

function text(value) {
  return String(value ?? '').trim();
}

function numOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function bool(value, fallback) {
  if (value === true || value === false) return value;
  return fallback;
}

/** Hardkodede standardverdier når selskapet ikke har lagret egne. */
export function builtinInvoiceDefaults() {
  return {
    creditDays: 28,
    invoiceLanguage: 'nb',
    ourReferenceMode: 'project_manager',
    dueDateMode: 'invoice_date',
    showPeriod: true,
    showUnit: true,
    showSubtotal: false,
    groupLinesBy: 'activity',
    periodization: 'none',
    groupExpensesBy: 'category',
    groupSalesBy: 'product',
    groupHoursBy: 'employee',
    hoursVisibility: 'hours_and_rate',
    standardLineTextHours: '',
    showBillingSummary: 'with_fee',
    summaryPlacement: 'above',
    includeExpensesInSummary: true,
    includeSalesInSummary: true,
    showTimeSummaryPerActivity: 'with_estimate',
    attachTimeSpec: true,
    showHourlyEntries: true,
    showFixedEntries: true,
    groupTimeEntriesBy: 'employee',
    timeSpecShowEmployee: true,
    timeSpecShowRole: true,
    timeSpecShowActivity: true,
    timeSpecShowTask: false,
    timeSpecShowTags: false,
    timeSpecShowDescription: true,
    timeSpecShowRate: true,
    timeSpecShowAmount: true,
    timeSpecShowActualHours: true,
    timeSpecShowNonBillable: false,
    requireInvoiceAttachment: false,
    copyExpenseAttachments: true,
    markupHourly: 0,
    markupFixed: 0,
    markupExpenseHourly: 10,
    markupExpenseFixed: 10,
    discountHours: 0,
    discountProducts: 0,
    adminMarkupPercent: 0,
    adminAmount: 0,
    adminOnFixed: true,
    adminOnHourly: true,
    adminOnExpenses: true,
    adminOnProducts: true,
    ehfMergePdf: true,
    ehfAlsoEmail: true,
    ehfAttachPdf: true,
    introText: '',
    footerText: '',
    theirReferenceDefault: '',
    orderReferenceDefault: '',
    contractReferenceDefault: '',
    invoiceNumberStart: 0,
    kidFormat: 'customer_invoice',
    kidMethod: 'mod10',
    requireDraftApproval: false,
    defaultDelivery: 'ehf',
    emailSubject: 'Faktura @invoiceNumber fra @company',
    emailBodyText: 'Hei,\n\nVedlagt følger faktura @invoiceNumber fra @company.\n\nÅ betale: @amount\nForfall: @dueDate\nKID: @kid\n\nEventuelle spørsmål om fakturaen rettes til @replyTo.\n\nMed vennlig hilsen\n@company',
    creditEmailSubject: 'Kreditnota @invoiceNumber fra @company',
    creditEmailBodyText: 'Hei,\n\nVedlagt følger kreditnota @invoiceNumber fra @company. Den krediterer @creditedInvoice og trekkes fra det dere skylder oss.\n\nBeløp: @amount\n\nEventuelle spørsmål rettes til @replyTo.\n\nMed vennlig hilsen\n@company',
    emailReplyTo: '',
    emailCc: '',
    emailIncludePdf: true,
    emailIncludeAttachments: true,
    reminderDays: 14,
    reminderFee: 0,
  };
}

/**
 * Normaliser lagret selskapskonfig. Ukjente felt ignoreres; mangler fylles fra builtin.
 */
export function normalizeCompanyInvoiceDefaults(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const base = builtinInvoiceDefaults();
  const next = { ...base };
  for (const key of Object.keys(base)) {
    if (src[key] === undefined) continue;
    const sample = base[key];
    if (typeof sample === 'boolean') next[key] = bool(src[key], sample);
    else if (typeof sample === 'number') {
      const n = numOrNull(src[key]);
      next[key] = n == null ? sample : n;
    } else next[key] = text(src[key]).slice(0, key.endsWith('Text') ? 4000 : 200);
  }
  // Begrunnede hopp i nummerserien (bokføringsforskriften § 5-1-1 nr. 1). Loggen bare vokser.
  next.numberJumps = normalizeNumberJumps(src.numberJumps);
  return next;
}

/** Effektiv selskapstandard: lagret overstyrer builtin. */
export function resolveCompanyInvoiceDefaults(state) {
  return normalizeCompanyInvoiceDefaults(state?.companyInvoiceDefaults);
}

export const INVOICE_LANGUAGE_OPTIONS = [
  { id: 'nb', label: 'Norsk bokmål' },
  { id: 'nn', label: 'Norsk nynorsk' },
  { id: 'en', label: 'English' },
];

export const DUE_DATE_MODE_OPTIONS = [
  { id: 'completion_date', label: 'Basert på ferdigdato (ferdigdato + kredittid)' },
  { id: 'invoice_date', label: 'Basert på fakturadato (fakturadato + kredittid)' },
  { id: 'on_create', label: 'Sett forfallsdato ved opprettelse' },
];

export const GROUP_HOURS_OPTIONS = [
  { id: 'employee', label: 'Per medarbeider' },
  { id: 'activity', label: 'Per aktivitet' },
  { id: 'employee_activity', label: 'Per medarbeider og aktivitet' },
  { id: 'total', label: 'Samlet på én linje' },
];

export const OUR_REFERENCE_OPTIONS = [
  { id: 'project_manager', label: 'Prosjektleder' },
  { id: 'user', label: 'Den som lager utkastet' },
  { id: 'none', label: 'Ingen' },
];

export const KID_FORMAT_OPTIONS = [
  { id: 'customer_invoice', label: 'Kundenummer + fakturanummer + kontrollsiffer' },
  { id: 'invoice', label: 'Fakturanummer + kontrollsiffer' },
  { id: 'none', label: 'Ingen KID' },
];

export const KID_METHOD_OPTIONS = [
  { id: 'mod10', label: 'MOD10' },
  { id: 'mod11', label: 'MOD11' },
];

export const DELIVERY_OPTIONS = [
  { id: 'ehf', label: 'EHF når kunden kan motta det, ellers e-post' },
  { id: 'email', label: 'E-post' },
  { id: 'manual', label: 'Manuelt (last ned og send selv)' },
];

/** Inkassoforskriften § 1-1: purregebyret har tak (kr 38 i 2026, ifølge Virke). */
export const REMINDER_FEE_MAX = 38;

export const TRI_BOOL_OPTIONS = [
  { id: 'inherit', label: 'Bruk standardinnstillinger' },
  { id: 'yes', label: 'Ja' },
  { id: 'no', label: 'Nei' },
];

export function labelForDefault(key, value) {
  const defaults = builtinInvoiceDefaults();
  const v = value === undefined ? defaults[key] : value;
  if (typeof v === 'boolean') return v ? 'Ja' : 'Nei';
  if (key === 'invoiceLanguage') {
    return INVOICE_LANGUAGE_OPTIONS.find((row) => row.id === v)?.label || String(v);
  }
  if (key === 'dueDateMode') {
    return DUE_DATE_MODE_OPTIONS.find((row) => row.id === v)?.label || String(v);
  }
  if (typeof v === 'number') {
    if (String(key).includes('markup') || String(key).includes('discount') || String(key).includes('Percent')) {
      return `${String(v).replace('.', ',')}%`;
    }
    if (key === 'creditDays') return `${v} dager`;
    return String(v);
  }
  return text(v) || '—';
}
