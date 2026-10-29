/**
 * Faktura-modell for Økonomi · Faktura.
 * Alle Excel-kolonner beholdes (source.values + typed felt + regnskapskontoer).
 */
import { normalizeLines } from './invoiceLines.js';

export const INVOICE_STATUSES = [
  { id: 'registered', label: 'Registrert' },
  { id: 'issued', label: 'Ferdigstilt' },
  { id: 'sent', label: 'Sendt' },
  { id: 'overdue', label: 'Forfalt' },
  { id: 'paid', label: 'Betalt' },
  { id: 'credited', label: 'Kreditert' },
  { id: 'written_off', label: 'Tap' },
  { id: 'draft', label: 'Utkast' },
];

export function newInvoiceId(invoiceNumber = '') {
  const num = String(invoiceNumber || '').replace(/[^\w.-]+/g, '').slice(0, 48);
  if (num) return `inv_${num}`;
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `inv_${stamp}${rand}`;
}

export function fold(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Parser norske/engelske beløp: "70 796,00", "Paid", vitenskapelig notasjon. */
export function parseMoney(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = text(value);
  if (!raw) return null;
  if (/^paid$/i.test(raw)) return 0;
  const cleaned = raw
    .replace(/\s/g, '')
    .replace(/kr\.?/gi, '')
    .replace(/nok/gi, '');
  if (!cleaned || cleaned === '-') return null;
  let normalized = cleaned;
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

export function formatMoney(value, currency = 'NOK') {
  const amount = parseMoney(value);
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: currency || 'NOK',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency || 'NOK'}`.trim();
  }
}

/** dd.mm.yyyy / yyyy-mm-dd / Excel-serienr → ISO yyyy-mm-dd når mulig. */
export function parseDate(value) {
  const raw = text(value);
  if (!raw) return '';
  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    let year = dmy[3];
    if (year.length === 2) year = Number(year) >= 70 ? `19${year}` : `20${year}`;
    return `${year}-${month}-${day}`;
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 20000 && asNumber < 80000) {
    // Excel serial (dager siden 1899-12-30)
    const utc = new Date(Date.UTC(1899, 11, 30) + asNumber * 86400000);
    return utc.toISOString().slice(0, 10);
  }
  return raw;
}

export function formatDate(value) {
  const iso = parseDate(value) || text(value);
  if (!iso) return '—';
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function statusLabel(status) {
  return INVOICE_STATUSES.find((row) => row.id === status)?.label || text(status) || 'Registrert';
}

export function deriveInvoiceStatus(invoice = {}) {
  const loss = parseMoney(invoice.loss) || 0;
  if (loss > 0) return 'written_off';
  const outstandingRaw = text(invoice.outstanding);
  const outstanding = parseMoney(invoice.outstanding);
  const amount = parseMoney(invoice.amountInclVat);
  if (/^paid$/i.test(outstandingRaw) || (text(invoice.paidAt) && (outstanding === 0 || outstanding == null))) {
    return 'paid';
  }
  if (outstanding === 0 && amount != null && amount > 0) return 'paid';
  if (amount != null && amount < 0) return 'credited';
  const due = parseDate(invoice.dueDate);
  const today = new Date().toISOString().slice(0, 10);
  if (due && due < today && (outstanding == null || outstanding > 0) && !/^paid$/i.test(outstandingRaw)) {
    return 'overdue';
  }
  const sent = fold(invoice.sent);
  if (sent === 'sent' || text(invoice.sentAt)) return 'sent';
  if (/utkast|draft/i.test(text(invoice.exportStatus))) return 'draft';
  return 'registered';
}

export function emptyInvoice(overrides = {}) {
  return normalizeInvoice({
    id: '',
    invoiceNumber: '',
    invoiceDate: '',
    dueDate: '',
    reminderPostponedTo: '',
    periodStart: '',
    periodEnd: '',
    customerNumber: '',
    customerName: '',
    orgnr: '',
    customerReference: '',
    customerTags: '',
    projectNumber: '',
    projectName: '',
    projectTagSegment: '',
    projectTagMarket: '',
    projectTags: '',
    activities: '',
    activityTags: '',
    department: '',
    invoiceTags: '',
    exportStatus: '',
    sent: '',
    sentAt: '',
    kid: '',
    vatCode: 'HIGH',
    bankAccount: '',
    deliveryMethod: '',
    lines: [],
    timeEntryIds: [],
    voucherId: '',
    voucherLines: [],
    ehfXml: '',
    creditNoteForId: '',
    creditNoteForNumber: '',
    currency: 'NOK',
    exchangeRate: null,
    feesExMarkup: null,
    feesMarkup: null,
    feesInclMarkup: null,
    expensesExMarkup: null,
    expensesMarkup: null,
    expensesInclMarkup: null,
    products: null,
    adminCosts: null,
    accounts: {},
    amountExVat: null,
    vat: null,
    amountInclVat: null,
    outstanding: '',
    outstandingAmount: null,
    loss: null,
    paidAt: '',
    daysSentToPaid: null,
    daysPaidToDue: null,
    lockedAt: '',
    creditDays: null,
    customerId: '',
    projectId: '',
    contractId: '',
    status: 'registered',
    attachment: null,
    previewReady: false,
    source: { filename: '', importedAt: '', values: {} },
    notes: '',
    kind: 'invoice',
    customerAddress: null,
    customerEmail: '',
    customerVatNumber: '',
    customerContact: '',
    ourReference: '',
    orderReference: '',
    contractReference: '',
    addressLineAbove: '',
    addressLineBelow: '',
    externalProjectNumber: '',
    invoiceText: '',
    footerText: '',
    language: 'nb',
    projectInvoiceCount: null,
    approval: null,
    issuedAt: '',
    issuedByUid: '',
    issuedByName: '',
    events: [],
    noteList: [],
    payments: [],
    paidAmount: null,
    creditedAmount: null,
    creditNoteIds: [],
    creditReason: '',
    creditReleaseWork: false,
    lossAt: '',
    lossReason: '',
    collection: null,
    deliveries: [],
    deliveryChannel: '',
    archive: {},
    attachments: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  });
}

function moneyOrNull(value) {
  return parseMoney(value);
}

function normalizeInvoiceLines(list) {
  return normalizeLines(list);
}

function stamped(list, mapRow, limit = 400) {
  if (!Array.isArray(list)) return [];
  return list
    .map((row, index) => (row && typeof row === 'object' ? mapRow(row, index) : null))
    .filter(Boolean)
    .slice(0, limit);
}

function person(row) {
  return {
    byUid: text(row?.byUid),
    byName: text(row?.byName),
  };
}

/** Endringslogg: hvem gjorde hva, og når. */
function normalizeEvents(list) {
  return stamped(list, (row, index) => {
    const message = text(row.text);
    if (!message) return null;
    return {
      id: text(row.id) || `ev_${index + 1}`,
      at: text(row.at),
      type: text(row.type) || 'note',
      text: message.slice(0, 500),
      ...person(row),
    };
  });
}

function normalizeNotes(list) {
  return stamped(list, (row, index) => {
    const message = String(row.text ?? '').trim();
    if (!message) return null;
    return {
      id: text(row.id) || `note_${index + 1}`,
      at: text(row.at),
      text: message.slice(0, 4000),
      ...person(row),
    };
  }, 200);
}

function normalizePayments(list) {
  return stamped(list, (row, index) => {
    const amount = parseMoney(row.amount);
    if (amount == null || amount === 0) return null;
    return {
      id: text(row.id) || `pay_${index + 1}`,
      date: parseDate(row.date) || text(row.date),
      amount,
      note: text(row.note).slice(0, 300),
      source: text(row.source) || 'manual',
      at: text(row.at),
      ...person(row),
    };
  }, 200);
}

function normalizeFileRef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const url = text(raw.url);
  const storagePath = text(raw.storagePath);
  if (!url && !storagePath) return null;
  return {
    url,
    storagePath,
    name: text(raw.name),
    mime: text(raw.mime),
    size: Number(raw.size) || 0,
    at: text(raw.at),
  };
}

function normalizeAttachments(list) {
  return stamped(list, (row, index) => {
    const file = normalizeFileRef(row);
    if (!file) return null;
    return {
      id: text(row.id) || `att_${index + 1}`,
      ...file,
      source: text(row.source) || 'upload',
      expenseId: text(row.expenseId),
      include: row.include !== false,
    };
  }, 60);
}

function normalizeDeliveries(list) {
  return stamped(list, (row, index) => ({
    id: text(row.id) || `del_${index + 1}`,
    at: text(row.at),
    channel: text(row.channel) || 'manual',
    status: text(row.status) || 'sent',
    to: Array.isArray(row.to) ? row.to.map((item) => text(item)).filter(Boolean).slice(0, 10) : [],
    message: text(row.message).slice(0, 500),
    providerId: text(row.providerId),
    ...person(row),
  }), 100);
}

function normalizeAddress(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    street: text(src.street).slice(0, 200),
    postalCode: text(src.postalCode).slice(0, 12),
    city: text(src.city).slice(0, 80),
    country: (text(src.country) || 'NO').toUpperCase().slice(0, 2),
  };
}

/** Mottakerfeltene et utkast henter fra kunderegisteret (se invoiceCustomer.js). */
export const CUSTOMER_COPY_KEYS = [
  'customerNumber', 'customerName', 'orgnr', 'customerAddress', 'customerEmail', 'customerContact',
];

/** Kunden slik den sist ble hentet fra registeret til utkastet. null når den mangler. */
function normalizeCustomerCopy(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    customerNumber: text(raw.customerNumber),
    customerName: text(raw.customerName),
    orgnr: text(raw.orgnr).replace(/\s/g, ''),
    customerAddress: normalizeAddress(raw.customerAddress),
    customerEmail: text(raw.customerEmail).slice(0, 200),
    customerContact: text(raw.customerContact).slice(0, 120),
  };
}

const COLLECTION_STEP_KINDS = new Set(['friendly', 'reminder', 'notice', 'debt', 'interest']);

/** Steg i innkrevingen (purring, inkassovarsel, inkasso, rentefaktura). Se collection.js. */
function normalizeCollectionSteps(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((row) => row && typeof row === 'object' && COLLECTION_STEP_KINDS.has(row.kind))
    .slice(0, 50)
    .map((row, index) => ({
      id: text(row.id) || `col_${index + 1}`,
      kind: row.kind,
      at: text(row.at),
      fee: Number.isFinite(Number(row.fee)) ? Math.max(0, Number(row.fee)) : 0,
      deadline: text(row.deadline).slice(0, 10),
      to: text(row.to).slice(0, 200),
      channel: text(row.channel),
      amount: row.amount == null || row.amount === '' || !Number.isFinite(Number(row.amount)) ? null : Number(row.amount),
      invoiceId: text(row.invoiceId),
      feeInvoiceId: text(row.feeInvoiceId),
      note: text(row.note).slice(0, 500),
      auto: row.auto === true,
      ...person(row),
    }));
}

function normalizeCollection(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    hold: src.hold === true,
    // Automatisk steg som ikke kunne sendes (for eksempel manglende e-post), så det meldes én gang.
    autoBlocked: text(src.autoBlocked),
    friendlySent: src.friendlySent === true,
    friendlySentAt: text(src.friendlySentAt),
    reminderSent: src.reminderSent === true,
    reminderSentAt: text(src.reminderSentAt),
    noticeSent: src.noticeSent === true,
    noticeSentAt: text(src.noticeSentAt),
    debtCollection: src.debtCollection === true,
    debtCollectionAt: text(src.debtCollectionAt),
    interestInvoice: src.interestInvoice === true,
    interestInvoiceAt: text(src.interestInvoiceAt),
    steps: normalizeCollectionSteps(src.steps),
  };
}

function normalizeApproval(raw) {
  if (!raw || typeof raw !== 'object' || !text(raw.at)) return null;
  return { at: text(raw.at), ...person(raw) };
}

function normalizeArchive(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of ['pdf', 'xml', 'timeSpec']) {
    const file = normalizeFileRef(src[key]);
    if (file) out[key] = file;
  }
  return out;
}

/** Snapshot av bilagslinjer lagret på faktura (uten egen voucher-collection). */
function normalizeVoucherLines(list) {
  if (!Array.isArray(list)) return [];
  return list.map((line) => {
    if (!line || typeof line !== 'object') return null;
    return {
      account: text(line.account),
      accountName: text(line.accountName),
      debit: moneyOrNull(line.debit) ?? 0,
      credit: moneyOrNull(line.credit) ?? 0,
      vatCode: text(line.vatCode),
    };
  }).filter((line) => line && (line.account || line.debit || line.credit));
}

/**
 * PowerOffice-data skrives av serveren (functions/powerOfficeMap.js).
 * Tas bare med når den finnes: lagring skjer med merge, og en eldre kopi i appen
 * skal ikke nulle ut det serveren har hentet.
 */
function normalizePowerOffice(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item == null || ['string', 'number', 'boolean'].includes(typeof item)) out[key] = item;
  }
  return Object.keys(out).length ? out : null;
}

export function normalizeInvoice(input) {
  const row = input && typeof input === 'object' ? input : {};
  const accounts = {};
  if (row.accounts && typeof row.accounts === 'object') {
    for (const [key, value] of Object.entries(row.accounts)) {
      const amount = parseMoney(value);
      if (amount != null) accounts[String(key)] = amount;
    }
  }
  const sourceValues = row.source?.values && typeof row.source.values === 'object'
    ? { ...row.source.values }
    : {};
  const invoiceNumber = text(row.invoiceNumber);
  const attachment = row.attachment && typeof row.attachment === 'object'
    ? {
      url: text(row.attachment.url),
      name: text(row.attachment.name),
      mime: text(row.attachment.mime) || 'application/pdf',
      storagePath: text(row.attachment.storagePath),
      uploadedAt: text(row.attachment.uploadedAt),
    }
    : null;
  const hasAttachment = !!(attachment?.url || attachment?.storagePath);
  const normalized = {
    id: text(row.id) || (invoiceNumber ? newInvoiceId(invoiceNumber) : ''),
    invoiceNumber,
    invoiceDate: parseDate(row.invoiceDate) || text(row.invoiceDate),
    dueDate: parseDate(row.dueDate) || text(row.dueDate),
    reminderPostponedTo: parseDate(row.reminderPostponedTo) || text(row.reminderPostponedTo),
    periodStart: parseDate(row.periodStart) || text(row.periodStart),
    periodEnd: parseDate(row.periodEnd) || text(row.periodEnd),
    customerNumber: text(row.customerNumber),
    customerName: text(row.customerName),
    orgnr: text(row.orgnr).replace(/\s/g, ''),
    customerReference: text(row.customerReference),
    customerTags: text(row.customerTags),
    projectNumber: text(row.projectNumber),
    projectName: text(row.projectName),
    projectTagSegment: text(row.projectTagSegment),
    projectTagMarket: text(row.projectTagMarket),
    projectTags: text(row.projectTags),
    activities: text(row.activities),
    activityTags: text(row.activityTags),
    department: text(row.department),
    invoiceTags: text(row.invoiceTags),
    exportStatus: text(row.exportStatus),
    sent: text(row.sent),
    sentAt: parseDate(row.sentAt) || text(row.sentAt),
    kid: text(row.kid),
    vatCode: text(row.vatCode) || 'HIGH',
    bankAccount: text(row.bankAccount),
    deliveryMethod: text(row.deliveryMethod),
    lines: normalizeInvoiceLines(row.lines),
    timeEntryIds: Array.isArray(row.timeEntryIds) ? row.timeEntryIds.map((id) => text(id)).filter(Boolean) : [],
    voucherId: text(row.voucherId),
    voucherLines: normalizeVoucherLines(row.voucherLines),
    ehfXml: text(row.ehfXml),
    creditNoteForId: text(row.creditNoteForId),
    creditNoteForNumber: text(row.creditNoteForNumber),
    currency: text(row.currency) || 'NOK',
    exchangeRate: moneyOrNull(row.exchangeRate),
    feesExMarkup: moneyOrNull(row.feesExMarkup),
    feesMarkup: moneyOrNull(row.feesMarkup),
    feesInclMarkup: moneyOrNull(row.feesInclMarkup),
    expensesExMarkup: moneyOrNull(row.expensesExMarkup),
    expensesMarkup: moneyOrNull(row.expensesMarkup),
    expensesInclMarkup: moneyOrNull(row.expensesInclMarkup),
    products: moneyOrNull(row.products),
    adminCosts: moneyOrNull(row.adminCosts),
    accounts,
    amountExVat: moneyOrNull(row.amountExVat),
    vat: moneyOrNull(row.vat),
    amountInclVat: moneyOrNull(row.amountInclVat),
    outstanding: text(row.outstanding),
    outstandingAmount: moneyOrNull(row.outstandingAmount ?? row.outstanding),
    loss: moneyOrNull(row.loss),
    paidAt: parseDate(row.paidAt) || text(row.paidAt),
    daysSentToPaid: moneyOrNull(row.daysSentToPaid),
    daysPaidToDue: moneyOrNull(row.daysPaidToDue),
    lockedAt: parseDate(row.lockedAt) || text(row.lockedAt),
    creditDays: moneyOrNull(row.creditDays),
    // Datoer valgt i utkastet. Uten valg får fakturaen datoen den ferdigstilles.
    invoiceDateSet: row.invoiceDateSet === true,
    dueDateSet: row.dueDateSet === true,
    customerId: text(row.customerId),
    projectId: text(row.projectId),
    contractId: text(row.contractId),
    status: text(row.status) || 'registered',
    attachment: hasAttachment ? attachment : null,
    previewReady: !!(row.previewReady || hasAttachment),
    source: {
      filename: text(row.source?.filename),
      importedAt: text(row.source?.importedAt),
      values: sourceValues,
    },
    notes: text(row.notes),
    kind: row.kind === 'credit_note' || text(row.creditNoteForId) ? 'credit_note' : 'invoice',
    customerAddress: normalizeAddress(row.customerAddress),
    customerEmail: text(row.customerEmail).slice(0, 200),
    customerVatNumber: text(row.customerVatNumber).slice(0, 40),
    customerContact: text(row.customerContact).slice(0, 120),
    ourReference: text(row.ourReference).slice(0, 120),
    orderReference: text(row.orderReference).slice(0, 120),
    contractReference: text(row.contractReference).slice(0, 120),
    addressLineAbove: text(row.addressLineAbove).slice(0, 160),
    addressLineBelow: text(row.addressLineBelow).slice(0, 160),
    externalProjectNumber: text(row.externalProjectNumber).slice(0, 60),
    invoiceText: String(row.invoiceText ?? '').trim().slice(0, 4000),
    footerText: String(row.footerText ?? '').trim().slice(0, 4000),
    language: ['nb', 'nn', 'en'].includes(text(row.language)) ? text(row.language) : 'nb',
    projectInvoiceCount: moneyOrNull(row.projectInvoiceCount),
    approval: normalizeApproval(row.approval),
    issuedAt: text(row.issuedAt),
    issuedByUid: text(row.issuedByUid),
    issuedByName: text(row.issuedByName),
    events: normalizeEvents(row.events),
    noteList: normalizeNotes(row.noteList),
    payments: normalizePayments(row.payments),
    paidAmount: moneyOrNull(row.paidAmount),
    creditedAmount: moneyOrNull(row.creditedAmount),
    creditNoteIds: Array.isArray(row.creditNoteIds) ? row.creditNoteIds.map((id) => text(id)).filter(Boolean) : [],
    creditReason: text(row.creditReason).slice(0, 500),
    creditReleaseWork: row.creditReleaseWork === true,
    lossAt: parseDate(row.lossAt) || text(row.lossAt),
    lossReason: text(row.lossReason).slice(0, 500),
    collection: normalizeCollection(row.collection),
    deliveries: normalizeDeliveries(row.deliveries),
    deliveryChannel: text(row.deliveryChannel),
    archive: normalizeArchive(row.archive),
    attachments: normalizeAttachments(row.attachments),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
  };
  const poweroffice = normalizePowerOffice(row.poweroffice);
  if (poweroffice) normalized.poweroffice = poweroffice;
  const customerCopy = normalizeCustomerCopy(row.customerCopy);
  if (customerCopy) normalized.customerCopy = customerCopy;
  if (!INVOICE_STATUSES.some((item) => item.id === normalized.status)) {
    normalized.status = deriveInvoiceStatus(normalized);
  }
  return normalized;
}

/** Gjenkjenn nettleser-/AsyncStorage-kvotefeil (web localStorage ~5 MB). */
export function isInvoiceCacheQuotaError(err) {
  const name = String(err?.name || '');
  const message = String(err?.message || '');
  return name === 'QuotaExceededError'
    || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || err?.code === 22
    || err?.code === 1014
    || /quota/i.test(message)
    || /exceeded the quota/i.test(message);
}

/** Felt som fakturalisten trenger. Ikke les EHF, linjer eller bilag — det fryser nettleseren ved ~6700 fakturaer. */
const INVOICE_LIST_KEYS = [
  'invoiceNumber', 'invoiceDate', 'dueDate', 'customerNumber', 'customerName', 'orgnr',
  'projectNumber', 'projectName', 'customerId', 'projectId',
  'amountExVat', 'vat', 'amountInclVat', 'outstanding', 'outstandingAmount', 'loss',
  'currency', 'status', 'sent', 'sentAt', 'paidAt', 'exportStatus',
  'kid', 'vatCode', 'deliveryMethod', 'voucherId',
  'creditNoteForId', 'creditNoteForNumber', 'department', 'previewReady', 'poweroffice',
  'kind', 'issuedAt', 'approval', 'collection', 'paidAmount', 'creditedAmount', 'archive',
  'deliveryChannel', 'customerReference',
];

export function invoiceListSource(data, id = '') {
  const src = data && typeof data === 'object' ? data : {};
  const row = { id: text(id || src.id) };
  for (const key of INVOICE_LIST_KEYS) {
    if (src[key] != null && src[key] !== '') row[key] = src[key];
  }
  const attachment = src.attachment;
  if (attachment && typeof attachment === 'object' && (attachment.url || attachment.storagePath)) {
    row.attachment = {
      url: attachment.url || '',
      name: attachment.name || '',
      mime: attachment.mime || '',
      storagePath: attachment.storagePath || '',
    };
    row.previewReady = true;
  }
  return row;
}

/**
 * Kompakt listesammendrag for AsyncStorage (invoiceStorage).
 * Kun felt som fakturalisten trenger. Linjer, EHF, bilag, kontoer og source.values
 * hentes fra Firestore i detaljvisning — ellers sprenges nettleserkvoten ved masseimport.
 */
export function toInvoiceCacheRow(invoice) {
  const row = normalizeInvoice(invoice);
  const hasAttachment = !!(row.attachment?.url || row.attachment?.storagePath || row.previewReady);
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: row.invoiceDate,
    dueDate: row.dueDate,
    customerNumber: row.customerNumber,
    customerName: row.customerName,
    orgnr: row.orgnr,
    projectNumber: row.projectNumber,
    projectName: row.projectName,
    customerId: row.customerId,
    projectId: row.projectId,
    amountExVat: row.amountExVat,
    vat: row.vat,
    amountInclVat: row.amountInclVat,
    outstanding: row.outstanding,
    outstandingAmount: row.outstandingAmount,
    loss: row.loss,
    currency: row.currency,
    status: row.status,
    sent: row.sent,
    sentAt: row.sentAt,
    paidAt: row.paidAt,
    exportStatus: row.exportStatus,
    kid: row.kid,
    vatCode: row.vatCode,
    deliveryMethod: row.deliveryMethod,
    voucherId: row.voucherId,
    creditNoteForId: row.creditNoteForId,
    creditNoteForNumber: row.creditNoteForNumber,
    department: row.department,
    previewReady: hasAttachment,
    attachment: hasAttachment && row.attachment?.url
      ? { url: row.attachment.url, name: row.attachment.name || '', mime: row.attachment.mime || '' }
      : null,
    updatedAt: row.updatedAt,
    // Bare når feltene har innhold: cachen må tåle tusenvis av importerte fakturaer.
    ...(row.kind === 'credit_note' ? { kind: row.kind } : {}),
    ...(row.issuedAt ? { issuedAt: row.issuedAt } : {}),
    ...(row.approval ? { approval: row.approval } : {}),
    ...(row.collection && (row.collection.hold || row.collection.friendlySent || row.collection.reminderSent
      || row.collection.noticeSent || row.collection.debtCollection
      || row.collection.interestInvoice || row.collection.steps?.length)
      ? { collection: row.collection }
      : {}),
    ...(row.paidAmount != null ? { paidAmount: row.paidAmount } : {}),
    ...(row.creditedAmount != null ? { creditedAmount: row.creditedAmount } : {}),
    ...(row.archive?.pdf ? { archive: { pdf: row.archive.pdf } } : {}),
    ...(row.deliveryChannel ? { deliveryChannel: row.deliveryChannel } : {}),
    ...(row.customerReference ? { customerReference: row.customerReference } : {}),
  };
}

export function sortInvoices(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const byDate = text(right.invoiceDate).localeCompare(text(left.invoiceDate));
    if (byDate) return byDate;
    return text(right.invoiceNumber).localeCompare(text(left.invoiceNumber), 'nb', { numeric: true });
  });
}

export function invoiceSearchHay(invoice) {
  return fold([
    invoice.invoiceNumber,
    invoice.customerName,
    invoice.customerNumber,
    invoice.orgnr,
    invoice.projectNumber,
    invoice.projectName,
    invoice.kid,
    invoice.department,
    invoice.status,
    statusLabel(invoice.status),
  ].filter(Boolean).join(' '));
}

export function filterInvoices(rows, query = '', status = '') {
  const needle = fold(query);
  const statusId = text(status);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (statusId && row.status !== statusId) return false;
    if (!needle) return true;
    return invoiceSearchHay(row).includes(needle);
  });
}

export function invoiceTotals(rows) {
  let ex = 0;
  let vat = 0;
  let incl = 0;
  let outstanding = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    ex += parseMoney(row.amountExVat) || 0;
    vat += parseMoney(row.vat) || 0;
    incl += parseMoney(row.amountInclVat) || 0;
    outstanding += parseMoney(row.outstandingAmount ?? row.outstanding) || 0;
  }
  return { amountExVat: ex, vat, amountInclVat: incl, outstanding };
}

export function isInvoiceOverdue(invoice, today = new Date().toISOString().slice(0, 10)) {
  const row = invoice || {};
  if (row.status === 'paid' || row.status === 'credited' || row.status === 'written_off') return false;
  const due = parseDate(row.dueDate);
  if (!due) return false;
  const outstanding = parseMoney(row.outstandingAmount ?? row.outstanding);
  if (outstanding === 0 || /^paid$/i.test(text(row.outstanding))) return false;
  return due < today;
}

export function isInvoiceSent(invoice) {
  const sent = fold(invoice?.sent);
  return sent === 'sent' || !!text(invoice?.sentAt) || invoice?.status === 'sent' || invoice?.status === 'overdue' || invoice?.status === 'paid';
}

/** Utkast eller aldri sendt — kan slettes. Sendte/betalte/krediterte må kreditnota. */
export function canDeleteInvoice(invoice) {
  const row = invoice || {};
  if (!text(row.id) && !text(row.invoiceNumber)) return false;
  // Ferdigstilt i ProTop: salgsdokumentet står fast og rettes med kreditnota.
  if (text(row.issuedAt)) return false;
  // Fra PowerOffice sin testklient: aldri ekte regnskap, så den kan alltid ryddes bort.
  if (row.poweroffice?.env === 'demo') return true;
  // Ligger utkastet i PowerOffice, må det slettes der først. Ellers frigjøres timene
  // mens utkastet fortsatt kan sendes, og kunden kan bli fakturert to ganger.
  if (text(row.poweroffice?.salesOrderId) && row.poweroffice?.state !== 'missing') return false;
  if (row.status === 'paid' || row.status === 'credited' || row.status === 'written_off') return false;
  if (row.status === 'draft') return true;
  if (/utkast|draft/i.test(text(row.exportStatus)) && !isInvoiceSent(row)) return true;
  return !isInvoiceSent(row);
}

/** Marker utkast som sendt (status + sentAt). Endrer ikke linjer eller beløp. */
export function markInvoiceAsSent(invoice, at = new Date().toISOString()) {
  const stamp = text(at) || new Date().toISOString();
  const day = stamp.slice(0, 10);
  const exportStatus = /utkast|draft/i.test(text(invoice?.exportStatus))
    ? 'sendt'
    : (text(invoice?.exportStatus) || 'sendt');
  return normalizeInvoice({
    ...invoice,
    status: 'sent',
    sent: 'sent',
    sentAt: day,
    exportStatus,
    lockedAt: text(invoice?.lockedAt) || day,
    updatedAt: stamp,
  });
}

/** Summeringslinje som i Moment-detalj: eks. mva → øreavrunding → å betale. */
export function invoicePaymentSummary(invoice) {
  const row = normalizeInvoice(invoice);
  const ex = parseMoney(row.amountExVat) || 0;
  const vat = parseMoney(row.vat) || 0;
  const inclRaw = parseMoney(row.amountInclVat);
  const incl = inclRaw != null ? inclRaw : ex + vat;
  const rounded = Math.round(incl);
  const rounding = Number((rounded - incl).toFixed(2));
  const outstanding = parseMoney(row.outstandingAmount ?? row.outstanding);
  const paid = parseMoney(row.paidAt ? (incl - (outstanding ?? 0)) : null);
  const remaining = outstanding != null
    ? outstanding
    : (row.status === 'paid' ? 0 : rounded);
  return {
    currency: row.currency || 'NOK',
    amountExVat: ex,
    vat,
    amountInclVat: incl,
    rounding,
    totalDue: rounded,
    paid: paid != null && paid > 0 ? paid : null,
    remaining,
  };
}

/**
 * Aggregerte beløpsgrupper fra Excel (før detaljerte fakturalinjer finnes).
 * Speiler Moment: Timer / Utlegg / Adm. kostnader / Produkter.
 */
export function invoiceAmountGroups(invoice) {
  const row = normalizeInvoice(invoice);
  const period = [formatDate(row.periodStart), formatDate(row.periodEnd)]
    .filter((value) => value && value !== '—')
    .join(' – ');
  const groups = [];
  const push = (id, title, amount, label) => {
    const value = parseMoney(amount);
    if (value == null || value === 0) return;
    groups.push({
      id,
      title,
      lines: [{
        period: period || '—',
        text: label,
        qty: 1,
        unitPrice: value,
        totalExVat: value,
        vatPct: row.vat != null && row.amountExVat ? 25 : null,
      }],
    });
  };
  push('fees', 'Timer / honorarer', row.feesInclMarkup ?? row.feesExMarkup, 'Honorarer');
  push('expenses', 'Utlegg', row.expensesInclMarkup ?? row.expensesExMarkup, 'Utlegg');
  push('products', 'Produkter', row.products, 'Produkter');
  push('admin', 'Adm. kostnader', row.adminCosts, 'Adm. kostnader');
  if (!groups.length && (parseMoney(row.amountExVat) || 0) > 0) {
    push('total', 'Fakturagrunnlag', row.amountExVat, 'Beløp eks. mva');
  }
  return groups;
}

export function filterInvoicesByPeriod(rows, period = 'all', today = new Date()) {
  const list = Array.isArray(rows) ? rows : [];
  if (!period || period === 'all') return list;
  let end = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  let start = null;
  if (period === 'lastYear') {
    start = new Date(Date.UTC(today.getFullYear() - 1, 0, 1));
    end = new Date(Date.UTC(today.getFullYear() - 1, 11, 31));
  } else if (period === '365') {
    start = new Date(end);
    start.setUTCFullYear(start.getUTCFullYear() - 1);
  } else if (period === '7') {
    start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 7);
  } else if (period === '30') {
    start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 30);
  } else if (period === '100') {
    start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 100);
  } else if (period === 'year') {
    start = new Date(Date.UTC(today.getFullYear(), 0, 1));
  }
  if (!start) return list;
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);
  return list.filter((row) => {
    const date = parseDate(row.invoiceDate);
    return date && date >= from && date <= to;
  });
}

/** Feltgrupper for detaljvisning — alle lagrede verdier. */
export function invoiceDetailSections(invoice) {
  const row = normalizeInvoice(invoice);
  const money = (value) => (value == null || value === '' ? '—' : formatMoney(value, row.currency));
  const sections = [
    {
      id: 'party',
      title: 'Kunde og prosjekt',
      rows: [
        ['Kundenummer', row.customerNumber],
        ['Kundenavn', row.customerName],
        ['Org.nr.', row.orgnr],
        ['Kundens referanse', row.customerReference],
        ['Kundetagger', row.customerTags],
        ['Prosjektnummer', row.projectNumber],
        ['Prosjekt', row.projectName],
        ['Kundesegment', row.projectTagSegment],
        ['Markedsområde', row.projectTagMarket],
        ['Prosjekttagger', row.projectTags],
        ['Avdeling', row.department],
      ],
    },
    {
      id: 'dates',
      title: 'Datoer og sending',
      rows: [
        ['Fakturadato', formatDate(row.invoiceDate)],
        ['Forfallsdato', formatDate(row.dueDate)],
        ['Påminnelse utsatt til', formatDate(row.reminderPostponedTo)],
        ['Periodestart', formatDate(row.periodStart)],
        ['Periodeslutt', formatDate(row.periodEnd)],
        ['Sendt', row.sent],
        ['Sendt dato', formatDate(row.sentAt)],
        ['Betalingsdato', formatDate(row.paidAt)],
        ['Låsedato', formatDate(row.lockedAt)],
        ['Forsendelsesmåte', row.deliveryMethod],
        ['Eksportstatus', row.exportStatus],
        ['KID', row.kid],
        ['Kredittid', row.creditDays == null ? '' : String(row.creditDays)],
        ['Dager mellom sendt og betalt', row.daysSentToPaid == null ? '' : String(row.daysSentToPaid)],
        ['Dager mellom betalt og forfall', row.daysPaidToDue == null ? '' : String(row.daysPaidToDue)],
      ],
    },
    {
      id: 'amounts',
      title: 'Beløp',
      rows: [
        ['Valuta', row.currency],
        ['Valutakurs', row.exchangeRate == null ? '' : String(row.exchangeRate)],
        ['Honorarer eks. påslag', money(row.feesExMarkup)],
        ['Påslag honorarer', money(row.feesMarkup)],
        ['Honorarer ink. påslag', money(row.feesInclMarkup)],
        ['Utlegg eks. påslag', money(row.expensesExMarkup)],
        ['Påslag utlegg', money(row.expensesMarkup)],
        ['Utlegg ink. påslag', money(row.expensesInclMarkup)],
        ['Produkter', money(row.products)],
        ['Adm. kostnader', money(row.adminCosts)],
        ['Beløp eks. mva', money(row.amountExVat)],
        ['MVA', money(row.vat)],
        ['Beløp ink. mva', money(row.amountInclVat)],
        ['Utestående', row.outstanding || money(row.outstandingAmount)],
        ['Tap', money(row.loss)],
      ],
    },
  ];
  const accountRows = Object.keys(row.accounts || {})
    .sort((a, b) => a.localeCompare(b, 'nb', { numeric: true }))
    .map((code) => [`Regnskapskonto ${code}`, money(row.accounts[code])]);
  if (accountRows.length) {
    sections.push({ id: 'accounts', title: 'Regnskapskontoer', rows: accountRows });
  }
  sections.push({
    id: 'meta',
    title: 'Aktivitet og merknader',
    rows: [
      ['Aktiviteter', row.activities],
      ['Aktivitetstagger', row.activityTags],
      ['Fakturatagger', row.invoiceTags],
      ['Status', statusLabel(row.status)],
      ['Koblet kunde-id', row.customerId],
      ['Koblet prosjekt-id', row.projectId],
      ['Notater', row.notes],
      ['Importfil', row.source?.filename],
      ['Importert', row.source?.importedAt ? formatDate(row.source.importedAt.slice(0, 10)) : ''],
    ],
  });
  const sourceEntries = Object.entries(row.source?.values || {});
  if (sourceEntries.length) {
    sections.push({
      id: 'source',
      title: 'Alle kilderader (original)',
      rows: sourceEntries.map(([key, value]) => [key, text(value)]),
    });
  }
  return sections.map((section) => ({
    ...section,
    rows: section.rows.filter(([, value]) => value !== '' && value != null),
  })).filter((section) => section.rows.length);
}
