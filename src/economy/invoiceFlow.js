/**
 * Fakturaflyten: utkast → godkjent → ferdigstilt → sendt → betalt,
 * med kreditnota, tap, purreflagg, notater og endringslogg.
 *
 * Utkast har ikke nummer. Nummeret tildeles ved ferdigstilling (bokføringsforskriften § 5-1-3),
 * og en ferdigstilt faktura endres ikke. Den rettes med kreditnota (GBS 1).
 * Med PowerOffice koblet setter PowerOffice nummer, KID og sender fakturaen.
 */
import {
  emptyInvoice,
  formatDate,
  formatMoney,
  isInvoiceSent,
  newInvoiceId,
  normalizeInvoice,
  parseDate,
  parseMoney,
  text,
} from './invoices.js';
import { lineSources, normalizeLines, round2, totalsFromLines } from './invoiceLines.js';
import { buildKid } from './kid.js';
import { invoiceContentChecks, missingContentError } from './invoiceContent.js';

/** Poster som ikke skal faktureres, merkes med denne i stedet for en faktura-id. */
export const WRITE_OFF_ID = 'avskrevet';

export const DELIVERY_CHANNELS = [
  { id: 'ehf', label: 'EHF (e-faktura)' },
  { id: 'email', label: 'E-post' },
  { id: 'poweroffice', label: 'PowerOffice Go' },
  { id: 'manual', label: 'Manuelt' },
];

export function deliveryChannelLabel(id) {
  return DELIVERY_CHANNELS.find((row) => row.id === id)?.label || text(id) || '—';
}

function nowIso(at) {
  return text(at) || new Date().toISOString();
}

function todayKey(at) {
  return nowIso(at).slice(0, 10);
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** { byUid, byName } fra innlogget bruker. */
export function actorOf(user = {}, name = '') {
  return {
    byUid: text(user?.uid || user?.byUid),
    byName: text(name || user?.byName || user?.displayName || user?.email),
  };
}

export function isCreditNote(invoice) {
  return invoice?.kind === 'credit_note' || !!text(invoice?.creditNoteForId);
}

export function isDraftInvoice(invoice) {
  const row = invoice || {};
  if (text(row.issuedAt)) return false;
  if (row.status === 'draft') return true;
  return /utkast|draft/i.test(text(row.exportStatus)) && !isInvoiceSent(row) && !text(row.invoiceNumber);
}

/** Ligger i PowerOffice: endres ikke i ProTop lenger. */
export function isTransferredToPowerOffice(invoice) {
  const po = invoice?.poweroffice || {};
  return !!text(po.salesOrderId) && po.state !== 'missing';
}

/** Kan ikke endres: ferdigstilt av ProTop, overført til PowerOffice eller sendt. */
export function isLockedInvoice(invoice) {
  const row = invoice || {};
  if (text(row.issuedAt)) return true;
  if (isTransferredToPowerOffice(row)) return true;
  return !isDraftInvoice(row);
}

export function isEditableDraft(invoice) {
  return isDraftInvoice(invoice) && !isTransferredToPowerOffice(invoice);
}

export function withEvent(invoice, { type = 'note', text: message = '', actor = null, at = '' } = {}) {
  const line = text(message);
  if (!line) return invoice;
  const event = {
    id: newId('ev'),
    at: nowIso(at),
    type,
    text: line,
    byUid: text(actor?.byUid),
    byName: text(actor?.byName),
  };
  return { ...invoice, events: [...(invoice?.events || []), event] };
}

export function addNote(invoice, { text: message = '', actor = null, at = '' } = {}) {
  const body = String(message ?? '').trim();
  if (!body) return invoice;
  const note = {
    id: newId('note'),
    at: nowIso(at),
    text: body.slice(0, 4000),
    byUid: text(actor?.byUid),
    byName: text(actor?.byName),
  };
  return normalizeInvoice({ ...invoice, noteList: [...(invoice?.noteList || []), note] });
}

export function removeNote(invoice, noteId) {
  return normalizeInvoice({
    ...invoice,
    noteList: (invoice?.noteList || []).filter((row) => row.id !== noteId),
  });
}

/** Utstedt i ProTop eller bygget med linjer her. Importerte fakturaer har bare summer. */
export function isManagedInvoice(invoice) {
  return !!(text(invoice?.issuedAt) || (Array.isArray(invoice?.lines) && invoice.lines.length));
}

/**
 * Linjer og summer regnet på nytt. Utestående = å betale − betalt − kreditert − tap.
 * Importerte fakturaer uten linjer beholder beløpene og utestående fra importen.
 */
export function recalcInvoice(invoice) {
  const row = invoice || {};
  if (!isManagedInvoice(row)) return normalizeInvoice(row);
  const lines = normalizeLines(row.lines);
  const totals = totalsFromLines(lines);
  const sources = lineSources(lines);
  const paid = paidAmountOf(row);
  const credited = Math.abs(parseMoney(row.creditedAmount) || 0);
  const loss = Math.abs(parseMoney(row.loss) || 0);
  const outstanding = round2(totals.totalDue - paid - (totals.totalDue < 0 ? -credited : credited) - loss);
  const dates = lines.flatMap((line) => [line.periodStart, line.periodEnd]).filter(Boolean).sort();
  return normalizeInvoice({
    ...row,
    lines,
    timeEntryIds: sources.timeEntryIds,
    amountExVat: totals.amountExVat,
    vat: totals.vat,
    amountInclVat: totals.amountInclVat,
    outstanding: String(outstanding),
    outstandingAmount: outstanding,
    periodStart: dates[0] || row.periodStart || '',
    periodEnd: dates[dates.length - 1] || row.periodEnd || '',
  });
}

/** Utestående på en importert faktura, justert med beløpet. */
function adjustImportedOutstanding(row, delta) {
  const totals = invoiceTotals(row);
  const current = parseMoney(row.outstandingAmount ?? row.outstanding);
  const base = current == null ? totals.totalDue : current;
  const next = round2(base + delta);
  return normalizeInvoice({ ...row, outstanding: String(next), outstandingAmount: next });
}

export function invoiceTotals(invoice) {
  const lines = normalizeLines(invoice?.lines);
  if (lines.length) return totalsFromLines(lines);
  const ex = parseMoney(invoice?.amountExVat) || 0;
  const vat = parseMoney(invoice?.vat) || 0;
  const incl = parseMoney(invoice?.amountInclVat) ?? round2(ex + vat);
  const due = Math.round(incl);
  return { amountExVat: ex, vat, amountInclVat: incl, rounding: round2(due - incl), totalDue: due, groups: [] };
}

export function paidAmountOf(invoice) {
  const list = Array.isArray(invoice?.payments) ? invoice.payments : [];
  if (!list.length) return parseMoney(invoice?.paidAmount) || 0;
  return round2(list.reduce((sum, row) => sum + (parseMoney(row.amount) || 0), 0));
}

/** Felt i utkastet som kan endres i Rediger. */
export const DRAFT_FIELDS = [
  'customerId', 'customerNumber', 'customerName', 'orgnr', 'customerAddress', 'customerEmail',
  'customerVatNumber', 'customerContact', 'customerReference', 'ourReference', 'orderReference',
  'contractReference', 'addressLineAbove', 'addressLineBelow', 'externalProjectNumber',
  'invoiceDate', 'dueDate', 'invoiceDateSet', 'dueDateSet', 'creditDays', 'department', 'activities', 'bankAccount', 'kid',
  'invoiceText', 'footerText', 'language', 'lines', 'deliveryMethod', 'currency', 'attachments',
];

/** Endrer utkastet. Godkjenningen faller bort når innholdet endres. */
export function updateDraft(invoice, patch = {}, { actor = null, at = '', message = 'endret utkastet' } = {}) {
  if (!isEditableDraft(invoice)) return { ok: false, error: 'Bare utkast kan endres.', invoice };
  const next = { ...invoice };
  let changed = false;
  for (const key of DRAFT_FIELDS) {
    if (patch[key] === undefined) continue;
    if (JSON.stringify(patch[key]) === JSON.stringify(invoice?.[key])) continue;
    next[key] = patch[key];
    changed = true;
  }
  if (!changed) return { ok: true, error: null, invoice, changed: false };
  let updated = recalcInvoice({ ...next, updatedAt: nowIso(at) });
  if (invoice?.approval) {
    updated = { ...updated, approval: null };
    updated = withEvent(updated, { type: 'approval', text: 'godkjenningen falt bort fordi utkastet ble endret', actor, at });
  }
  const dates = [
    next.invoiceDate !== invoice?.invoiceDate && parseDate(next.invoiceDate) ? `fakturadato ${formatDate(next.invoiceDate)}` : '',
    next.dueDate !== invoice?.dueDate && parseDate(next.dueDate) ? `betalingsfrist ${formatDate(next.dueDate)}` : '',
  ].filter(Boolean);
  updated = withEvent(updated, { type: 'edit', text: dates.length ? `${message} (${dates.join(', ')})` : message, actor, at });
  return { ok: true, error: null, invoice: normalizeInvoice(updated), changed: true };
}

export function approveDraft(invoice, { actor = null, at = '' } = {}) {
  if (!isEditableDraft(invoice)) return { ok: false, error: 'Bare utkast kan godkjennes.', invoice };
  if (invoice?.approval) return { ok: true, error: null, invoice };
  const approved = withEvent({
    ...invoice,
    approval: { at: nowIso(at), byUid: text(actor?.byUid), byName: text(actor?.byName) },
  }, { type: 'approval', text: isCreditNote(invoice) ? 'godkjente kreditnotautkastet' : 'godkjente fakturautkastet', actor, at });
  return { ok: true, error: null, invoice: normalizeInvoice(approved) };
}

export function unapproveDraft(invoice, { actor = null, at = '' } = {}) {
  if (!invoice?.approval) return { ok: true, error: null, invoice };
  return {
    ok: true,
    error: null,
    invoice: normalizeInvoice(withEvent({ ...invoice, approval: null }, {
      type: 'approval', text: 'trakk tilbake godkjenningen', actor, at,
    })),
  };
}

function numericNumber(value) {
  const digits = text(value).replace(/\D/g, '');
  if (!digits || digits.length > 12) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/**
 * Neste nummer: høyeste nummer i listen + 1, aldri under startnummeret.
 * Hull fylles ikke, så sekvensen forblir kontrollerbar.
 */
export function nextInvoiceNumber(invoices = [], startNumber = 0) {
  let max = 0;
  for (const row of invoices || []) {
    const n = numericNumber(row?.invoiceNumber);
    if (n != null && n > max) max = n;
  }
  const start = Number(startNumber) > 0 ? Math.floor(Number(startNumber)) : 1;
  return String(Math.max(max + 1, start));
}

function addDays(iso, days) {
  const day = parseDate(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (Number(days) || 0));
  return date.toISOString().slice(0, 10);
}

/** Forfall etter selskapets regel. */
export function dueDateFor(invoice, { creditDays = null, dueDateMode = 'invoice_date' } = {}) {
  const days = Number.isFinite(Number(creditDays)) && creditDays !== null
    ? Number(creditDays)
    : (Number(invoice?.creditDays) || 0);
  if (dueDateMode === 'on_create' && parseDate(invoice?.dueDate)) return parseDate(invoice.dueDate);
  const invoiceDate = parseDate(invoice?.invoiceDate) || todayKey();
  if (dueDateMode === 'completion_date' && parseDate(invoice?.periodEnd)) {
    const fromEnd = addDays(invoice.periodEnd, days);
    return fromEnd > invoiceDate ? fromEnd : invoiceDate;
  }
  return addDays(invoiceDate, days);
}

/** Dager fra en dato til en annen. null når en av dem mangler. */
export function daysBetween(from, to) {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}

/**
 * Datoene fakturaen får ved ferdigstilling. Valgt i utkastet: de brukes.
 * Ellers dagens dato, og forfall etter kredittiden.
 */
export function issueDates(invoice, { today = '', dueDateMode = 'invoice_date' } = {}) {
  const row = invoice || {};
  const invoiceDate = (row.invoiceDateSet && parseDate(row.invoiceDate)) || todayKey(today);
  if (isCreditNote(row)) return { invoiceDate, dueDate: invoiceDate };
  const dueDate = (row.dueDateSet && parseDate(row.dueDate))
    || dueDateFor({ ...row, invoiceDate }, { creditDays: row.creditDays ?? null, dueDateMode });
  return { invoiceDate, dueDate };
}

/** Siste dag fakturaen burde vært utstedt: én måned etter levering (bokføringsforskriften § 5-2-2). */
export function issueDeadline(periodEnd) {
  const day = parseDate(periodEnd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const date = new Date(`${day}T12:00:00Z`);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 2, 0));
  return end.toISOString().slice(0, 10);
}

const PUBLIC_BUYER = /kommune|fylkeskommune|direktorat|departement|statens|universitet|helse\s|sykehus|politi|skatteetaten|nav\b|forsvar/i;

export function isPublicBuyer(invoice) {
  return PUBLIC_BUYER.test(text(invoice?.customerName));
}

/**
 * Kontroll før ferdigstilling. blocking stopper, warnings vises.
 * mode: 'protop' (ProTop utsteder) eller 'poweroffice'.
 * Påbudt innhold (bokføringsforskriften § 5-1-1) kontrolleres i invoiceContent.js.
 */
export function issueChecks(invoice, {
  supplier = {},
  settings = {},
  mode = 'protop',
  indexWarning = null,
  today = '',
} = {}) {
  const row = normalizeInvoice(invoice);
  // Partene, ytelsen og selgers registreringer. Selger kontrolleres bare når ProTop utsteder.
  const content = invoiceContentChecks(row, { supplier: supplier || {}, mode });
  const blocking = [...content.blocking];
  const warnings = [];
  const add = (list, id, message, field = '') => list.push({ id, text: message, field });
  const lines = row.lines || [];
  const totals = invoiceTotals(row);

  // Bare fakturaer laget i ProTop har linjer med konto. Importerte fakturaer har ingen linjer.
  if (lines.some((line) => !text(line.account))) {
    add(blocking, 'lineAccount', 'En linje mangler konto. Kontoene settes under Økonomi → Innstillinger → Standard regnskapskontoer.', 'lines');
  }
  if (!isCreditNote(row) && lines.some((line) => line.section === 'hours' && !(Number(line.unitPrice) > 0))) {
    add(blocking, 'linePrice', 'En timelinje mangler timepris.', 'lines');
  }
  if (isCreditNote(row) && !text(row.creditNoteForNumber)) {
    add(blocking, 'creditRef', 'Kreditnotaen mangler henvisning til fakturaen den krediterer (GBS 1).', '');
  }
  if (isCreditNote(row) && totals.totalDue > 0) {
    add(blocking, 'creditSign', 'En kreditnota må ha negativt beløp.', 'lines');
  }
  if (!isCreditNote(row) && totals.totalDue < 0) {
    add(blocking, 'invoiceSign', 'Fakturabeløpet er negativt. Lag en kreditnota i stedet.', 'lines');
  }
  if (settings.requireDraftApproval && !row.approval) {
    add(blocking, 'approval', 'Utkastet må godkjennes før det ferdigstilles.', '');
  }
  if (settings.requireInvoiceAttachment && !(row.attachments || []).length) {
    add(blocking, 'attachment', 'Fakturaen skal ha vedlegg.', 'attachments');
  }

  if (mode === 'protop') {
    if (!text(row.bankAccount || supplier?.bankAccount) && !isCreditNote(row)) {
      add(blocking, 'bank', 'Kontonummer mangler. Legg det inn under Selskap.', 'bankAccount');
    }
  }

  warnings.push(...content.warnings);
  const deadline = issueDeadline(row.periodEnd || row.periodStart);
  const now = text(today) || todayKey();
  if (deadline && deadline < now && !isCreditNote(row)) {
    add(warnings, 'late', `Arbeidet ble levert ${formatDate(row.periodEnd || row.periodStart)}. Fristen for å fakturere var ${formatDate(deadline)} (bokføringsforskriften § 5-2-2).`, '');
  }
  const days = Number(row.creditDays);
  if (Number.isFinite(days) && days > 60) {
    add(warnings, 'credit', `Kredittiden er ${days} dager. Over 60 dager binder som hovedregel ikke mellom næringsdrivende.`, 'creditDays');
  } else if (Number.isFinite(days) && days > 30 && isPublicBuyer(row)) {
    add(warnings, 'creditPublic', `Kredittiden er ${days} dager. Overfor det offentlige er grensen 30 dager.`, 'creditDays');
  }
  if (isPublicBuyer(row) && !text(row.customerReference) && !text(row.orderReference)) {
    add(warnings, 'buyerRef', 'Offentlige kunder krever som regel «Deres referanse» eller bestillingsnummer. EHF uten referanse blir ofte avvist.', 'customerReference');
  }
  if (indexWarning) add(warnings, 'index', 'Ny indeks på avtalen. Regulering bør gjøres før fakturaen ferdigstilles.', '');
  return { ok: !blocking.length, blocking, warnings };
}

function kidFor(row, { kidFormat = 'customer_invoice', kidMethod = 'mod10' } = {}) {
  const number = text(row.invoiceNumber);
  if (!number) return '';
  if (kidFormat === 'none') return '';
  if (kidFormat === 'invoice') {
    const digits = number.replace(/\D/g, '');
    return buildKid({ customerNumber: '', invoiceNumber: digits, customerWidth: 0, invoiceWidth: digits.length, method: kidMethod });
  }
  return buildKid({ customerNumber: row.customerNumber || '0', invoiceNumber: number, method: kidMethod });
}

/**
 * Ferdigstiller: nummer, fakturadato, forfall og KID. Låser fakturaen.
 * number tildeles av invoiceSeries (transaksjon), ikke her.
 * Fakturaen stoppes når påbudt innhold mangler (bokføringsforskriften § 5-1-1). Med supplier
 * kontrolleres også selgers navn, adresse, org.nr. og mva-registrering.
 */
export function issueInvoice(invoice, {
  number,
  date = '',
  dueDate = '',
  creditDays = null,
  dueDateMode = 'invoice_date',
  kidFormat = 'customer_invoice',
  kidMethod = 'mod10',
  projectInvoiceCount = null,
  supplier = null,
  actor = null,
  at = '',
} = {}) {
  if (!isEditableDraft(invoice)) return { ok: false, error: 'Fakturaen er allerede ferdigstilt.', invoice };
  const invoiceNumber = text(number);
  if (!invoiceNumber) return { ok: false, error: 'Fakturanummer mangler.', invoice };
  const stamp = nowIso(at);
  const invoiceDate = parseDate(date) || stamp.slice(0, 10);
  const chosenDue = isCreditNote(invoice) ? '' : parseDate(dueDate);
  if (chosenDue && chosenDue < invoiceDate) {
    return { ok: false, error: 'Betalingsfristen kan ikke være før fakturadatoen.', invoice };
  }
  let row = recalcInvoice({ ...invoice, invoiceNumber, invoiceDate });
  const missing = missingContentError(row, { supplier });
  if (missing) return { ok: false, error: missing, invoice };
  let days = creditDays == null ? row.creditDays : creditDays;
  if (chosenDue) days = daysBetween(invoiceDate, chosenDue);
  row = {
    ...row,
    creditDays: days,
    dueDate: isCreditNote(row) ? invoiceDate : (chosenDue || dueDateFor({ ...row, creditDays: days }, { creditDays: days, dueDateMode })),
  };
  row = {
    ...row,
    kid: isCreditNote(row) ? '' : kidFor(row, { kidFormat, kidMethod }),
    status: 'issued',
    exportStatus: 'ferdigstilt',
    issuedAt: stamp,
    issuedByUid: text(actor?.byUid),
    issuedByName: text(actor?.byName),
    lockedAt: invoiceDate,
    projectInvoiceCount: projectInvoiceCount == null ? row.projectInvoiceCount : projectInvoiceCount,
    updatedAt: stamp,
  };
  // Hendelsen står med klokkeslettet det skjedde. Datoene på fakturaen står i teksten.
  const dated = isCreditNote(row)
    ? `datert ${formatDate(invoiceDate)}`
    : `fakturadato ${formatDate(invoiceDate)}, forfall ${formatDate(row.dueDate)}`;
  row = withEvent(row, {
    type: 'issue',
    text: `ferdigstilte ${isCreditNote(row) ? 'kreditnota' : 'faktura'} ${invoiceNumber} (${dated})`,
    actor,
    at: stamp,
  });
  return { ok: true, error: null, invoice: recalcInvoice(row) };
}

/** Registrerer at fakturaen er sendt (eller at sendingen feilet). */
export function recordDelivery(invoice, {
  channel = 'manual',
  to = [],
  status = 'sent',
  message = '',
  providerId = '',
  actor = null,
  at = '',
} = {}) {
  const stamp = nowIso(at);
  const entry = {
    id: newId('del'),
    at: stamp,
    channel,
    status,
    to: (Array.isArray(to) ? to : [to]).map((row) => text(row)).filter(Boolean),
    message: text(message),
    providerId: text(providerId),
    byUid: text(actor?.byUid),
    byName: text(actor?.byName),
  };
  let row = { ...invoice, deliveries: [...(invoice?.deliveries || []), entry] };
  const where = entry.to.length ? ` til ${entry.to.join(', ')}` : '';
  if (status === 'sent') {
    const keep = ['paid', 'credited', 'written_off'].includes(row.status);
    row = {
      ...row,
      status: keep ? row.status : 'sent',
      sent: 'sent',
      sentAt: row.sentAt || stamp.slice(0, 10),
      deliveryMethod: channel,
      deliveryChannel: channel,
      exportStatus: 'sendt',
      updatedAt: stamp,
    };
    row = withEvent(row, { type: 'delivery', text: `sendte via ${deliveryChannelLabel(channel)}${where}`, actor, at: stamp });
  } else {
    row = withEvent(row, {
      type: 'delivery',
      text: `sending via ${deliveryChannelLabel(channel)}${where} feilet${entry.message ? `: ${entry.message}` : ''}`,
      actor,
      at: stamp,
    });
  }
  return normalizeInvoice(row);
}

function settleStatus(row) {
  const outstanding = parseMoney(row.outstandingAmount) || 0;
  if (row.status === 'credited' || row.status === 'written_off') return row.status;
  if (outstanding <= 0.004 && (paidAmountOf(row) > 0)) return 'paid';
  if (row.status === 'paid' && outstanding > 0.004) return isInvoiceSent(row) ? 'sent' : 'issued';
  return row.status;
}

/** Innbetaling, også delbetaling. Fullt betalt gir status Betalt. */
export function registerPayment(invoice, { date = '', amount, note = '', actor = null, at = '', source = 'manual' } = {}) {
  const value = round2(parseMoney(amount));
  if (!value) return { ok: false, error: 'Skriv inn beløpet som er betalt.', invoice };
  if (isDraftInvoice(invoice)) return { ok: false, error: 'Et utkast kan ikke betales.', invoice };
  const stamp = nowIso(at);
  const payment = {
    id: newId('pay'),
    date: parseDate(date) || stamp.slice(0, 10),
    amount: value,
    note: text(note),
    source,
    at: stamp,
    byUid: text(actor?.byUid),
    byName: text(actor?.byName),
  };
  let row = { ...invoice, payments: [...(invoice?.payments || []), payment] };
  row = isManagedInvoice(row)
    ? recalcInvoice({ ...row, paidAmount: paidAmountOf(row) })
    : adjustImportedOutstanding({ ...row, paidAmount: paidAmountOf(row) }, -value);
  const status = settleStatus(row);
  row = {
    ...row,
    status,
    paidAt: status === 'paid' ? payment.date : row.paidAt,
    updatedAt: stamp,
  };
  row = withEvent(row, {
    type: 'payment',
    text: `registrerte betaling ${formatMoney(value, row.currency)} (${formatDate(payment.date)})`,
    actor,
    at: stamp,
  });
  return { ok: true, error: null, invoice: normalizeInvoice(row) };
}

export function removePayment(invoice, paymentId, { actor = null, at = '' } = {}) {
  const payment = (invoice?.payments || []).find((row) => row.id === paymentId);
  if (!payment) return { ok: false, error: 'Fant ikke betalingen.', invoice };
  const stamp = nowIso(at);
  let row = { ...invoice, payments: (invoice.payments || []).filter((item) => item.id !== paymentId) };
  row = isManagedInvoice(row)
    ? recalcInvoice({ ...row, paidAmount: paidAmountOf(row) })
    : adjustImportedOutstanding({ ...row, paidAmount: paidAmountOf(row) }, Math.abs(payment.amount));
  row = { ...row, status: settleStatus(row), paidAt: settleStatus(row) === 'paid' ? row.paidAt : '', updatedAt: stamp };
  row = withEvent(row, { type: 'payment', text: `fjernet betaling ${formatMoney(payment.amount, row.currency)}`, actor, at: stamp });
  return { ok: true, error: null, invoice: normalizeInvoice(row) };
}

/** Konstatert tap på fordringen (mval. § 4-7). Restbeløpet føres som tap. */
export function writeOffInvoice(invoice, { date = '', reason = '', actor = null, at = '' } = {}) {
  if (isDraftInvoice(invoice)) return { ok: false, error: 'Et utkast kan ikke føres som tap. Slett utkastet i stedet.', invoice };
  const why = text(reason);
  if (!why) return { ok: false, error: 'Skriv hvorfor tapet er konstatert.', invoice };
  const current = recalcInvoice(invoice);
  const remaining = round2(parseMoney(current.outstandingAmount ?? current.outstanding) || 0);
  if (!(remaining > 0)) return { ok: false, error: 'Fakturaen har ikke noe utestående å føre som tap.', invoice };
  const stamp = nowIso(at);
  const written = {
    ...current,
    loss: round2((parseMoney(current.loss) || 0) + remaining),
    lossAt: parseDate(date) || stamp.slice(0, 10),
    lossReason: why,
    status: 'written_off',
    updatedAt: stamp,
  };
  let row = isManagedInvoice(written) ? recalcInvoice(written) : adjustImportedOutstanding(written, -remaining);
  row = withEvent(row, { type: 'loss', text: `førte ${formatMoney(remaining, row.currency)} som tap: ${why}`, actor, at: stamp });
  return { ok: true, error: null, invoice: normalizeInvoice(row) };
}

export const COLLECTION_FLAGS = [
  { id: 'reminderSent', label: 'Purring sendt' },
  { id: 'debtCollection', label: 'Inkasso pågår' },
  { id: 'interestInvoice', label: 'Rentefaktura laget' },
];

export function setCollectionFlag(invoice, key, value, { actor = null, at = '' } = {}) {
  const flag = COLLECTION_FLAGS.find((row) => row.id === key);
  if (!flag) return { ok: false, error: 'Ukjent status.', invoice };
  const stamp = nowIso(at);
  const collection = { ...(invoice?.collection || {}), [key]: !!value, [`${key}At`]: value ? stamp : '' };
  const row = withEvent({ ...invoice, collection, updatedAt: stamp }, {
    type: 'collection',
    text: `${value ? 'markerte' : 'fjernet'} «${flag.label}»`,
    actor,
    at: stamp,
  });
  return { ok: true, error: null, invoice: normalizeInvoice(row) };
}

/** Utsett påminnelser til en dato. */
export function postponeReminder(invoice, date, { actor = null, at = '' } = {}) {
  const day = parseDate(date);
  const row = withEvent({ ...invoice, reminderPostponedTo: day || '' }, {
    type: 'collection',
    text: day ? `utsatte påminnelse til ${formatDate(day)}` : 'fjernet utsettelsen av påminnelser',
    actor,
    at,
  });
  return normalizeInvoice(row);
}

/**
 * Kreditnotautkast fra en ferdigstilt faktura. lineIds = null krediterer alt.
 * Beløpene speiles, så øre ikke avviker fra originalen.
 */
export function buildCreditNote(invoice, { lineIds = null, reason = '', releaseWork = false, actor = null, at = '', account = '' } = {}) {
  const original = normalizeInvoice(invoice);
  if (isDraftInvoice(original)) return { ok: false, error: 'Et utkast krediteres ikke. Slett eller endre det.', invoice: null };
  if (isCreditNote(original)) return { ok: false, error: 'En kreditnota kan ikke krediteres.', invoice: null };
  const why = text(reason);
  if (!why) return { ok: false, error: 'Skriv årsaken til krediteringen.', invoice: null };
  const pick = Array.isArray(lineIds) ? new Set(lineIds) : null;
  const source = (original.lines || []).filter((line) => !pick || pick.has(line.id));
  const stamp = nowIso(at);
  let lines;
  if (source.length) {
    lines = source.map((line, index) => ({
      ...line,
      id: `cn_${line.id || index + 1}`,
      quantity: -Math.abs(Number(line.quantity) || 0),
      amountExVat: -Math.abs(Number(line.amountExVat) || 0),
      vatAmount: -Math.abs(Number(line.vatAmount) || 0),
      fixedAmounts: true,
      locked: false,
      manual: false,
    }));
  } else if (!original.lines?.length) {
    const ex = Math.abs(parseMoney(original.amountExVat) || 0);
    if (!ex) return { ok: false, error: 'Fakturaen har ingen linjer eller beløp å kreditere.', invoice: null };
    lines = [{
      id: 'cn_total',
      section: 'other',
      description: `Kreditering av faktura ${original.invoiceNumber}`,
      quantity: -1,
      unit: 'stk',
      unitPrice: ex,
      vatCode: original.vatCode || 'HIGH',
      // Importert faktura uten linjer: kontoen for honorar fra innstillingene. Kan endres i utkastet.
      account: text(account),
    }];
  } else {
    return { ok: false, error: 'Velg minst én linje å kreditere.', invoice: null };
  }
  const draft = emptyInvoice({
    ...original,
    id: newInvoiceId(''),
    kind: 'credit_note',
    invoiceNumber: '',
    invoiceDate: stamp.slice(0, 10),
    dueDate: stamp.slice(0, 10),
    kid: '',
    status: 'draft',
    exportStatus: 'utkast',
    sent: '',
    sentAt: '',
    paidAt: '',
    lines,
    timeEntryIds: [],
    creditNoteForId: original.id,
    creditNoteForNumber: original.invoiceNumber,
    creditReason: why,
    creditReleaseWork: !!releaseWork,
    invoiceText: `Kreditnota for faktura ${original.invoiceNumber} datert ${formatDate(original.invoiceDate)}. Årsak: ${why}`,
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
    loss: null,
    lossAt: '',
    lossReason: '',
    collection: null,
    deliveries: [],
    deliveryChannel: '',
    archive: {},
    attachments: [],
    voucherId: '',
    voucherLines: [],
    ehfXml: '',
    poweroffice: undefined,
    attachment: null,
    previewReady: false,
    source: { filename: 'kreditnota', importedAt: stamp, values: { origin: 'buildCreditNote', originalInvoiceId: original.id } },
    notes: '',
    createdAt: stamp,
    updatedAt: stamp,
  });
  delete draft.poweroffice;
  const withLog = withEvent(recalcInvoice(draft), {
    type: 'create',
    text: `opprettet kreditnotautkast for faktura ${original.invoiceNumber}`,
    actor,
    at: stamp,
  });
  return { ok: true, error: null, invoice: normalizeInvoice(withLog) };
}

/** Når kreditnotaen er ferdigstilt: originalen får kreditert beløp og eventuelt status Kreditert. */
export function applyCreditToOriginal(original, creditNote, { actor = null, at = '' } = {}) {
  const credit = Math.abs(invoiceTotals(creditNote).totalDue);
  const total = Math.abs(invoiceTotals(original).totalDue);
  const credited = round2((Math.abs(parseMoney(original.creditedAmount) || 0)) + credit);
  const full = credited >= total - 0.01;
  const next = {
    ...original,
    creditedAmount: credited,
    creditNoteIds: [...new Set([...(original.creditNoteIds || []), creditNote.id])],
  };
  let row = isManagedInvoice(next) ? recalcInvoice(next) : adjustImportedOutstanding(next, -credit);
  row = {
    ...row,
    status: full ? 'credited' : row.status,
    updatedAt: nowIso(at),
  };
  row = withEvent(row, {
    type: 'credit',
    text: `${full ? 'kreditert' : 'delvis kreditert'} med kreditnota ${creditNote.invoiceNumber} (${formatMoney(credit, row.currency)})`,
    actor,
    at,
  });
  return normalizeInvoice(row);
}

/**
 * Kreditnotaen etter at den er motregnet mot fakturaen den krediterer. Restbeløpet står på
 * den opprinnelige fakturaen (et tilgodehavende hvis kunden har betalt), ikke på kreditnotaen,
 * så utestående ikke telles to ganger. creditedAmount på en kreditnota er beløpet som er brukt.
 */
export function settleCreditNote(creditNote, original, { actor = null, at = '' } = {}) {
  const used = Math.abs(invoiceTotals(creditNote).totalDue);
  const next = { ...creditNote, creditedAmount: used, updatedAt: nowIso(at) };
  const row = isManagedInvoice(next) ? recalcInvoice(next) : normalizeInvoice({ ...next, outstanding: '0', outstandingAmount: 0 });
  return normalizeInvoice(withEvent(row, {
    type: 'credit',
    text: `motregnet mot faktura ${original?.invoiceNumber || ''}`.trim(),
    actor,
    at,
  }));
}

/**
 * Første dag purring sendes, etter innstillingene. Med purregebyr er det tidligst 14 dager
 * etter forfall (inkassoforskriften § 1-1), og gebyret har et tak (REMINDER_FEE_MAX).
 */
export function reminderFrom(invoice, settings = {}) {
  const due = parseDate(invoice?.dueDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return '';
  const fee = Number(settings.reminderFee) || 0;
  const days = Math.max(Number(settings.reminderDays) || 0, fee > 0 ? 14 : 0);
  const from = addDays(due, days);
  const postponed = parseDate(invoice?.reminderPostponedTo);
  return postponed && postponed > from ? postponed : from;
}

/** Status som vises: utkast, godkjent, ferdigstilt, sendt, delbetalt, betalt, forfalt, kreditert, tap. */
export function displayStatus(invoice, today = '') {
  const row = invoice || {};
  const now = text(today) || todayKey();
  const draft = isDraftInvoice(row);
  if (draft) {
    if (isTransferredToPowerOffice(row)) return { id: 'transferred', label: 'I PowerOffice' };
    return row.approval ? { id: 'approved', label: 'Godkjent utkast' } : { id: 'draft', label: 'Utkast' };
  }
  if (row.status === 'written_off') return { id: 'written_off', label: 'Tap' };
  if (row.status === 'credited') return { id: 'credited', label: 'Kreditert' };
  if (isCreditNote(row)) return { id: 'credit_note', label: 'Kreditnota' };
  if (row.status === 'paid') return { id: 'paid', label: 'Betalt' };
  const outstanding = parseMoney(row.outstandingAmount ?? row.outstanding);
  const due = parseDate(row.dueDate);
  if (due && due < now && (outstanding == null || outstanding > 0)) return { id: 'overdue', label: 'Forfalt' };
  if (paidAmountOf(row) > 0) return { id: 'partly_paid', label: 'Delbetalt' };
  if ((parseMoney(row.creditedAmount) || 0) > 0) return { id: 'partly_credited', label: 'Delvis kreditert' };
  if (row.status === 'issued' && !isInvoiceSent(row)) return { id: 'issued', label: 'Ferdigstilt' };
  if (isInvoiceSent(row)) return { id: 'sent', label: 'Sendt' };
  return { id: row.status || 'registered', label: row.status === 'issued' ? 'Ferdigstilt' : 'Registrert' };
}

/** Flettefelt i e-postmalen: @invoiceNumber, @company, @amount, @dueDate, @kid, @customer, @replyTo. */
export function mergeTemplate(template, invoice, { company = '', replyTo = '' } = {}) {
  const totals = invoiceTotals(invoice);
  const values = {
    invoiceNumber: text(invoice?.invoiceNumber),
    company: text(company),
    amount: formatMoney(totals.totalDue, invoice?.currency),
    dueDate: formatDate(invoice?.dueDate),
    kid: text(invoice?.kid) || '—',
    customer: text(invoice?.customerName),
    replyTo: text(replyTo) || text(company),
    project: [text(invoice?.projectNumber), text(invoice?.projectName)].filter(Boolean).join(' '),
    creditedInvoice: text(invoice?.creditNoteForNumber) ? `faktura ${text(invoice.creditNoteForNumber)}` : '',
  };
  return String(template ?? '').replace(/@(invoiceNumber|company|amount|dueDate|kid|customer|replyTo|project|creditedInvoice)\b/g, (_, key) => values[key] ?? '');
}

/** Antall utstedte fakturaer på prosjektet, denne medregnet. */
export function projectInvoiceCountFor(invoices = [], projectId = '', excludeId = '') {
  if (!text(projectId)) return null;
  const count = (invoices || []).filter((row) => (
    row?.projectId === projectId
    && row.id !== excludeId
    && !isDraftInvoice(row)
    && !isCreditNote(row)
  )).length;
  return count + 1;
}
