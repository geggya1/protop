/**
 * Faktura, kreditnota og timespesifikasjon som PDF (A4), uten eksterne biblioteker.
 * Innholdet følger bokføringsforskriften § 5-1-1: nummer og dato, partene, ytelsen,
 * leveringsperiode (ellers fakturadatoen som leveringsdato), vederlag, forfall og mva i NOK,
 * og «Foretaksregisteret» i bunnen.
 */
import { pdfDocument, pdfEscape } from '../indeksregulering/office.js';
import { fitLogoBox, logoForDocument } from '../project/companyLogo.js';
import { formatDate, text } from './invoices.js';
import { periodLabel, sectionsOf, totalsFromLines } from './invoiceLines.js';
import { isCreditNote, isDraftInvoice, paidAmountOf } from './invoiceFlow.js';
import { supplierLegalLine } from './ehf.js';

const PAGE_W = 595;
const PAGE_H = 842;
const LEFT = 40;
const RIGHT = 555;
const FOOTER_TOP = 118;

// Bredder fra Helvetica AFM (1/1000 em), så høyrejusterte tall står riktig.
const HELV = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389,
  '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556,
  '@': 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556,
  M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667,
  Z: 611, '[': 278, '\\': 278, ']': 278, _: 556, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556,
  h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, æ: 889, ø: 611, å: 556, Æ: 1000, Ø: 778, Å: 667, é: 556,
};
const BOLD = {
  ...HELV,
  '!': 333, '"': 474, '&': 722, "'": 238, ':': 333, ';': 333, '?': 611, '@': 975, A: 722, B: 722, J: 556,
  K: 722, L: 611, '[': 333, ']': 333, b: 611, d: 611, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278,
  m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556,
  Å: 722,
};

const LABELS = {
  nb: {
    invoice: 'FAKTURA',
    credit: 'KREDITNOTA',
    draft: 'FAKTURAUTKAST',
    creditDraft: 'KREDITNOTAUTKAST',
    draftNote: 'Utkast – ikke gyldig som faktura',
    customerNo: 'Kundenr',
    customerOrg: 'Kunde org.nr',
    invoiceDate: 'Fakturadato',
    creditDate: 'Dato',
    project: 'Prosjekt',
    count: 'Fakturaantall',
    countValue: (n) => `${n} på dette prosjektet`,
    period: 'Leveringsperiode',
    deliveryDate: 'Leveringsdato',
    theirRef: 'Deres ref.',
    ourRef: 'Vår ref.',
    orderRef: 'Bestilling',
    contractRef: 'Kontrakt',
    due: 'Betalingsfrist',
    account: 'Bankkonto',
    kid: 'KID',
    toPay: 'Å betale NOK',
    refund: 'Til gode NOK',
    credits: 'Krediterer',
    creditsValue: (no, date) => `Faktura ${no}${date ? ` av ${date}` : ''}`,
    periodCol: 'Periode',
    textCol: 'Tekst',
    qtyCol: 'Antall',
    unitCol: 'Enhet',
    priceCol: 'Enh.pris',
    markupCol: 'Påslag %',
    discountCol: 'Rabatt %',
    sumCol: 'Sum eks. mva',
    vatCol: 'Mva %',
    vatRate: 'Mva-sats %',
    base: 'Grunnlag',
    vat: 'Mva',
    sumEx: 'Sum eks. mva NOK',
    vatSum: 'Mva NOK',
    rounding: 'Øreavrunding NOK',
    sumIncl: 'Sum ink. mva NOK',
    paid: 'Betalt NOK',
    rest: 'Igjen å betale NOK',
    page: (a, b) => `Side ${a} av ${b}`,
    bank: 'Bank',
    timeSpec: 'Timespesifikasjon',
    date: 'Dato',
    employee: 'Medarbeider',
    activity: 'Aktivitet',
    description: 'Beskrivelse',
    hours: 'Timer',
    rate: 'Timepris',
    amount: 'Beløp',
    total: 'Totalt',
    reverse: 'Merverdiavgift er ikke beregnet.',
  },
  en: {
    invoice: 'INVOICE',
    credit: 'CREDIT NOTE',
    draft: 'DRAFT INVOICE',
    creditDraft: 'DRAFT CREDIT NOTE',
    draftNote: 'Draft – not a valid invoice',
    customerNo: 'Customer no.',
    customerOrg: 'Customer org. no.',
    invoiceDate: 'Invoice date',
    creditDate: 'Date',
    project: 'Project',
    count: 'Invoice count',
    countValue: (n) => `${n} on this project`,
    period: 'Delivery period',
    deliveryDate: 'Delivery date',
    theirRef: 'Your ref.',
    ourRef: 'Our ref.',
    orderRef: 'Order',
    contractRef: 'Contract',
    due: 'Due date',
    account: 'Bank account',
    kid: 'KID',
    toPay: 'Amount due NOK',
    refund: 'Credit NOK',
    credits: 'Credits',
    creditsValue: (no, date) => `Invoice ${no}${date ? ` of ${date}` : ''}`,
    periodCol: 'Period',
    textCol: 'Description',
    qtyCol: 'Qty',
    unitCol: 'Unit',
    priceCol: 'Unit price',
    markupCol: 'Markup %',
    discountCol: 'Discount %',
    sumCol: 'Amount excl. VAT',
    vatCol: 'VAT %',
    vatRate: 'VAT rate %',
    base: 'Basis',
    vat: 'VAT',
    sumEx: 'Total excl. VAT NOK',
    vatSum: 'VAT NOK',
    rounding: 'Rounding NOK',
    sumIncl: 'Total incl. VAT NOK',
    paid: 'Paid NOK',
    rest: 'Remaining NOK',
    page: (a, b) => `Page ${a} of ${b}`,
    bank: 'Bank',
    timeSpec: 'Time specification',
    date: 'Date',
    employee: 'Employee',
    activity: 'Activity',
    description: 'Description',
    hours: 'Hours',
    rate: 'Rate',
    amount: 'Amount',
    total: 'Total',
    reverse: 'VAT has not been charged.',
  },
};
LABELS.nn = {
  ...LABELS.nb,
  draftNote: 'Utkast – ikkje gyldig som faktura',
  count: 'Fakturatal',
  countValue: (n) => `${n} på dette prosjektet`,
  toPay: 'Å betale NOK',
  rest: 'Att å betale NOK',
  reverse: 'Meirverdiavgift er ikkje rekna ut.',
};

const SECTION_LABELS = {
  en: { hours: 'Hours', fixed: 'Fixed price and agreements', expenses: 'Re-invoiced expenses', outlays: 'Outlays on behalf of the customer (no VAT)', trips: 'Mileage', products: 'Products', admin: 'Admin costs', other: 'Other' },
};

function labelsFor(language) {
  return LABELS[language] || LABELS.nb;
}

export function textWidth(value, size, bold = false) {
  const table = bold ? BOLD : HELV;
  let width = 0;
  for (const ch of String(value ?? '')) width += table[ch] ?? 556;
  return (width / 1000) * size;
}

function wrap(value, maxWidth, size, bold = false) {
  const out = [];
  for (const paragraph of String(value ?? '').split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && textWidth(next, size, bold) > maxWidth) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function num(value, decimals = 2) {
  const n = Number(value) || 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [whole, frac] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '-' : ''}${grouped}${frac ? `,${frac}` : ''}`;
}

function qty(value) {
  const n = Number(value) || 0;
  return num(n, Number.isInteger(n) ? 2 : 2);
}

function pct(value) {
  return num(value, 2);
}

function orgPretty(value) {
  const digits = text(value).replace(/\D/g, '');
  return digits.length === 9 ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : text(value);
}

function accountPretty(value) {
  const digits = text(value).replace(/\D/g, '');
  return digits.length === 11 ? `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}` : text(value);
}

const UNIT_LABELS = { t: 'TIME', stk: 'STK', km: 'KM', mnd: 'MND', dag: 'DAG' };

/** Sidebygger med enkel flyt og sideskift. */
function pageWriter({ onNewPage } = {}) {
  const pages = [[]];
  let y = 0;
  const api = {
    get y() { return y; },
    set y(value) { y = value; },
    ops() { return pages[pages.length - 1]; },
    pages,
    text(value, x, top, size = 8, bold = false, gray = 0) {
      if (value == null || value === '') return;
      const ops = api.ops();
      if (gray) ops.push(`${gray} g`);
      ops.push('BT');
      ops.push(`/${bold ? 'F2' : 'F1'} ${size} Tf`);
      ops.push(`1 0 0 1 ${x.toFixed(2)} ${(PAGE_H - top - size).toFixed(2)} Tm`);
      ops.push(`(${pdfEscape(value)}) Tj`);
      ops.push('ET');
      if (gray) ops.push('0 g');
    },
    right(value, xRight, top, size = 8, bold = false) {
      api.text(value, xRight - textWidth(value, size, bold), top, size, bold);
    },
    line(x1, top, x2, width = 0.5, gray = 0) {
      const ops = api.ops();
      if (gray) ops.push(`${gray} G`);
      ops.push(`${width} w`);
      ops.push(`${x1.toFixed(2)} ${(PAGE_H - top).toFixed(2)} m ${x2.toFixed(2)} ${(PAGE_H - top).toFixed(2)} l S`);
      if (gray) ops.push('0 G');
    },
    ensure(height) {
      if (y + height <= PAGE_H - FOOTER_TOP) return false;
      pages.push([]);
      y = 40;
      onNewPage?.(api);
      return true;
    },
  };
  return api;
}

function drawLogo(page, logo, supplierName) {
  if (logo) {
    const box = fitLogoBox(logo.width, logo.height, 170, 56);
    const ops = page.ops();
    ops.push('q');
    ops.push(`${box.width.toFixed(2)} 0 0 ${box.height.toFixed(2)} ${(RIGHT - box.width).toFixed(2)} ${(PAGE_H - 36 - box.height).toFixed(2)} cm`);
    ops.push('/Im1 Do');
    ops.push('Q');
    return 36 + box.height;
  }
  page.right(supplierName, RIGHT, 40, 16, true);
  return 62;
}

function footer(page, supplier, labels, invoice) {
  const top = PAGE_H - FOOTER_TOP + 24;
  page.line(LEFT, top - 6, RIGHT, 0.5, 0.6);
  const left = [
    supplier.name,
    supplier.address,
    [supplier.postalCode, supplier.city].filter(Boolean).join(' '),
    'Norge',
    supplierLegalLine(supplier),
  ].filter(Boolean);
  left.forEach((row, index) => page.text(row, LEFT, top + index * 9, 7, index === 0));
  const mid = [supplier.phone, supplier.email, supplier.website].filter(Boolean);
  mid.forEach((row, index) => page.text(row, 220, top + index * 9, 7));
  const bank = [
    supplier.bankName ? [labels.bank, supplier.bankName] : null,
    invoice.bankAccount || supplier.bankAccount ? [labels.account, accountPretty(invoice.bankAccount || supplier.bankAccount)] : null,
    supplier.iban ? ['IBAN', supplier.iban] : null,
    supplier.bic ? ['BIC', supplier.bic] : null,
  ].filter(Boolean);
  bank.forEach(([label, value], index) => {
    page.text(`${label}:`, 380, top + index * 9, 7);
    page.text(value, 440, top + index * 9, 7);
  });
  if (invoice.footerText) {
    wrap(invoice.footerText, RIGHT - LEFT, 7).slice(0, 3).forEach((row, index) => {
      page.text(row, LEFT, top + 48 + index * 8, 7, false, 0.35);
    });
  }
}

function columnsFor(lines) {
  const markup = lines.some((line) => Number(line.markupPercent));
  const discount = lines.some((line) => Number(line.discountPercent));
  // Høyrekanter for tallkolonnene. Teksten får resten av bredden.
  const cols = { period: LEFT, text: 88, vat: RIGHT, sum: 520 };
  let edge = 462;
  if (discount) { cols.discount = edge; edge -= 40; }
  if (markup) { cols.markup = edge; edge -= 40; }
  cols.price = edge;
  cols.unit = edge - 58;
  cols.qty = edge - 82;
  cols.textEnd = cols.qty - 42;
  return { ...cols, markupOn: markup, discountOn: discount };
}

function sectionHeader(page, labels, cols) {
  const top = page.y;
  page.text(labels.periodCol, cols.period, top, 7, true);
  page.text(labels.textCol, cols.text, top, 7, true);
  page.right(labels.qtyCol, cols.qty, top, 7, true);
  page.text(labels.unitCol, cols.unit - 22, top, 7, true);
  page.right(labels.priceCol, cols.price, top, 7, true);
  if (cols.markupOn) page.right(labels.markupCol, cols.markup, top, 7, true);
  if (cols.discountOn) page.right(labels.discountCol, cols.discount, top, 7, true);
  page.right(labels.sumCol, cols.sum, top, 7, true);
  page.right(labels.vatCol, cols.vat, top, 7, true);
  page.y += 10;
  page.line(LEFT, page.y, RIGHT, 0.6);
  page.y += 4;
}

function drawLines(page, invoice, labels) {
  const sections = sectionsOf(invoice.lines || []);
  const cols = columnsFor(invoice.lines || []);
  const sectionLabels = SECTION_LABELS[invoice.language] || null;
  for (const section of sections) {
    page.ensure(40);
    page.text(sectionLabels?.[section.id] || section.label, LEFT, page.y, 8, true);
    page.y += 11;
    sectionHeader(page, labels, cols);
    for (const line of section.lines) {
      const description = wrap(line.description, cols.textEnd - cols.text, 8);
      const height = Math.max(1, description.length) * 10 + 2;
      if (page.ensure(height)) {
        page.text(sectionLabels?.[section.id] || section.label, LEFT, page.y, 8, true);
        page.y += 11;
        sectionHeader(page, labels, cols);
      }
      const top = page.y;
      page.text(periodLabel(line.periodStart, line.periodEnd), cols.period, top, 8);
      description.forEach((row, index) => page.text(row, cols.text, top + index * 10, 8));
      if (!(line.section === 'admin' && Number(line.quantity) === 1 && line.locked)) {
        page.right(qty(line.quantity), cols.qty, top, 8);
        page.right(num(line.unitPrice), cols.price, top, 8);
      }
      page.text(UNIT_LABELS[line.unit] || text(line.unit).toUpperCase(), cols.unit - 22, top, 8);
      if (cols.markupOn) page.right(Number(line.markupPercent) ? pct(line.markupPercent) : '', cols.markup, top, 8);
      if (cols.discountOn) page.right(Number(line.discountPercent) ? pct(line.discountPercent) : '', cols.discount, top, 8);
      page.right(num(line.amountExVat), cols.sum, top, 8);
      page.right(pct(line.vatPercent), cols.vat, top, 8);
      page.y += height;
    }
    page.y += 8;
  }
}

function drawTotals(page, invoice, labels, totals) {
  const rows = (totals.groups || []).length || 1;
  page.ensure(30 + rows * 10 + 50);
  page.y += 6;
  page.line(LEFT, page.y, RIGHT, 0.6);
  page.y += 6;
  const top = page.y;
  page.text(labels.vatRate, LEFT, top, 7, true);
  page.right(labels.base, 190, top, 7, true);
  page.right(labels.vat, 260, top, 7, true);
  (totals.groups || []).forEach((group, index) => {
    const y = top + 11 + index * 10;
    page.text(pct(group.vatPercent), LEFT, y, 8);
    page.right(num(group.taxableAmount), 190, y, 8);
    page.right(num(group.vatAmount), 260, y, 8);
  });
  const paid = paidAmountOf(invoice);
  const right = [
    [labels.sumEx, num(totals.amountExVat), false],
    [labels.vatSum, num(totals.vat), false],
    [labels.rounding, num(totals.rounding), false],
    [labels.sumIncl, num(totals.totalDue), true],
  ];
  if (paid) {
    right.push([labels.paid, num(paid), false]);
    right.push([labels.rest, num(totals.totalDue - paid), true]);
  }
  right.forEach(([label, value, bold], index) => {
    const y = top + index * 11;
    page.text(label, 360, y, 8, bold);
    page.right(value, RIGHT, y, 8, bold);
  });
  page.line(360, top + right.length * 11 - 1, RIGHT, bold(right) ? 0.8 : 0.4);
  page.y = top + Math.max(right.length * 11, 11 + rows * 10) + 10;
  const zeroVat = (totals.groups || []).some((group) => ['ZERO', 'EXEMPT', 'OUTSIDE'].includes(group.vatCode) && group.taxableAmount);
  if (zeroVat && !totals.vat) {
    page.text(labels.reverse, LEFT, page.y, 8);
    page.y += 12;
  }
}

function bold(rows) {
  return rows.some((row) => row[2]);
}

function headerBlock(page, invoice, supplier, labels, logo, options) {
  const draft = isDraftInvoice(invoice);
  const credit = isCreditNote(invoice);
  const logoBottom = drawLogo(page, logo, supplier.name);
  let title = credit ? labels.credit : labels.invoice;
  if (draft) title = credit ? labels.creditDraft : labels.draft;
  else if (invoice.invoiceNumber) title = `${title} ${invoice.invoiceNumber}`;
  const top = Math.max(logoBottom + 14, 92);
  page.text(title, 330, top, 15, true);
  if (draft) page.text(labels.draftNote, 330, top + 19, 8, false, 0.45);

  // Mottaker til venstre.
  const addr = invoice.customerAddress || {};
  const recipient = [
    invoice.addressLineAbove,
    invoice.customerName,
    invoice.addressLineBelow,
    invoice.customerContact ? `v/ ${invoice.customerContact}` : '',
    addr.street,
    [addr.postalCode, addr.city].filter(Boolean).join(' '),
    addr.country && addr.country !== 'NO' ? addr.country : '',
  ].filter(Boolean);
  recipient.forEach((row, index) => page.text(row, LEFT, top + 26 + index * 10, 9, index === (invoice.addressLineAbove ? 1 : 0)));

  // Fakta til høyre.
  const totals = options.totals;
  const facts = [
    [labels.customerNo, invoice.customerNumber],
    [labels.customerOrg, invoice.customerVatNumber || (invoice.orgnr ? `NO ${orgPretty(invoice.orgnr)}` : '')],
    [credit ? labels.creditDate : labels.invoiceDate, formatDate(invoice.invoiceDate)],
    credit ? [labels.credits, labels.creditsValue(invoice.creditNoteForNumber, options.originalDate || '')] : null,
    [labels.project, [invoice.projectNumber, invoice.projectName].filter(Boolean).join(' - ')],
    invoice.externalProjectNumber ? [labels.project, invoice.externalProjectNumber] : null,
    invoice.projectInvoiceCount ? [labels.count, labels.countValue(invoice.projectInvoiceCount)] : null,
    invoice.periodStart || invoice.periodEnd
      ? [labels.period, [formatDate(invoice.periodStart), formatDate(invoice.periodEnd)].filter((v) => v && v !== '—').join(' – ')]
      : null,
    // Uten periode er fakturadatoen leveringsdato (bokføringsforskriften § 5-1-1).
    !credit && !invoice.periodStart && !invoice.periodEnd ? [labels.deliveryDate, formatDate(invoice.invoiceDate)] : null,
    [labels.theirRef, invoice.customerReference],
    [labels.ourRef, invoice.ourReference],
    [labels.orderRef, invoice.orderReference],
    [labels.contractRef, invoice.contractReference],
    credit ? null : [labels.due, formatDate(invoice.dueDate), true],
    credit ? null : [labels.account, accountPretty(invoice.bankAccount || supplier.bankAccount), true],
    credit || !invoice.kid ? null : [labels.kid, invoice.kid, true],
    [totals.totalDue < 0 ? labels.refund : labels.toPay, num(Math.abs(totals.totalDue)), true],
  ].filter((row) => row && text(row[1]) && text(row[1]) !== '—');
  const factTop = top + (draft ? 34 : 26);
  facts.forEach(([label, value, strong], index) => {
    const y = factTop + index * 10;
    page.text(`${label}:`, 330, y, 8, !!strong);
    wrap(value, RIGHT - 430, 8, !!strong).slice(0, 1).forEach((row) => page.text(row, 430, y, 8, !!strong));
  });
  page.y = Math.max(top + 26 + recipient.length * 10, factTop + facts.length * 10) + 18;
  if (invoice.invoiceText) {
    for (const row of wrap(invoice.invoiceText, RIGHT - LEFT, 9)) {
      page.ensure(12);
      page.text(row, LEFT, page.y, 9);
      page.y += 12;
    }
    page.y += 6;
  }
}

function finish(pages, { supplier, labels, invoice }) {
  const total = pages.length;
  return pages.map((ops, index) => {
    const writer = pageWriter();
    writer.pages[0] = ops;
    footer(writer, supplier, labels, invoice);
    const label = labels.page(index + 1, total);
    writer.text(label, RIGHT - textWidth(label, 7), PAGE_H - 30, 7);
    return ops.join('\n');
  });
}

/** Sidene til fakturaen som PDF-strømmer (brukes også i «Faktura med timespesifikasjoner»). */
export function invoicePageStreams(invoice, { supplier = {}, logo = null, originalDate = '' } = {}) {
  const labels = labelsFor(invoice?.language);
  const totals = totalsFromLines(invoice?.lines || []);
  const doc = invoice?.lines?.length ? invoice : { ...invoice, lines: [] };
  const page = pageWriter({
    onNewPage: (writer) => {
      const head = isDraftInvoice(doc) ? labels.draft : `${isCreditNote(doc) ? labels.credit : labels.invoice} ${doc.invoiceNumber || ''}`;
      writer.text(head.trim(), LEFT, 30, 9, true);
      writer.y = 50;
    },
  });
  page.y = 40;
  headerBlock(page, doc, supplier, labels, logo, { totals, originalDate });
  drawLines(page, doc, labels);
  drawTotals(page, doc, labels, totals);
  return finish(page.pages, { supplier, labels, invoice: doc });
}

/**
 * Timespesifikasjon: timene bak timelinjene, gruppert per medarbeider eller aktivitet.
 * show styrer kolonnene (timeSpecShow* i innstillingene).
 */
export function timeSpecPageStreams(invoice, entries = [], { supplier = {}, settings = {} } = {}) {
  const labels = labelsFor(invoice?.language);
  const show = {
    employee: settings.timeSpecShowEmployee !== false,
    activity: settings.timeSpecShowActivity !== false,
    description: settings.timeSpecShowDescription !== false,
    rate: settings.timeSpecShowRate !== false,
    amount: settings.timeSpecShowAmount !== false,
  };
  const groupBy = settings.groupTimeEntriesBy === 'activity' ? 'activity' : (settings.groupTimeEntriesBy === 'date' ? 'date' : 'employee');
  const rows = [...(entries || [])].sort((a, b) => text(a.date).localeCompare(text(b.date)));
  const rateOf = new Map();
  for (const line of invoice?.lines || []) {
    for (const id of line.timeEntryIds || []) rateOf.set(id, Number(line.unitPrice) || 0);
  }
  const groups = new Map();
  for (const row of rows) {
    const key = groupBy === 'activity' ? (text(row.activityName) || 'Hovedaktivitet')
      : groupBy === 'date' ? text(row.date).slice(0, 7)
        : (text(row.employeeName) || 'Medarbeider');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const page = pageWriter({
    onNewPage: (writer) => {
      writer.text(`${labels.timeSpec} ${invoice?.invoiceNumber || ''}`.trim(), LEFT, 30, 9, true);
      writer.y = 50;
    },
  });
  page.y = 40;
  page.text(labels.timeSpec, LEFT, page.y, 15, true);
  page.y += 22;
  const head = [
    invoice?.invoiceNumber ? `${isCreditNote(invoice) ? labels.credit : labels.invoice} ${invoice.invoiceNumber}` : labels.draft,
    [invoice?.projectNumber, invoice?.projectName].filter(Boolean).join(' - '),
    invoice?.customerName,
    invoice?.periodStart || invoice?.periodEnd ? `${labels.period}: ${formatDate(invoice.periodStart)} – ${formatDate(invoice.periodEnd)}` : '',
  ].filter(Boolean);
  head.forEach((row) => { page.text(row, LEFT, page.y, 9); page.y += 11; });
  page.y += 8;

  const cols = {
    date: LEFT,
    employee: 92,
    activity: show.employee ? 200 : 92,
    description: 0,
    hours: show.amount ? (show.rate ? 445 : 495) : (show.rate ? 495 : RIGHT),
    rate: show.amount ? 495 : RIGHT,
    amount: RIGHT,
  };
  let x = show.activity ? cols.activity + 90 : (show.employee ? 200 : 92);
  cols.description = x;
  const descEnd = cols.hours - 40;
  function headerRow() {
    const top = page.y;
    page.text(labels.date, cols.date, top, 7, true);
    if (show.employee) page.text(labels.employee, cols.employee, top, 7, true);
    if (show.activity) page.text(labels.activity, cols.activity, top, 7, true);
    if (show.description) page.text(labels.description, cols.description, top, 7, true);
    page.right(labels.hours, cols.hours, top, 7, true);
    if (show.rate) page.right(labels.rate, cols.rate, top, 7, true);
    if (show.amount) page.right(labels.amount, cols.amount, top, 7, true);
    page.y += 10;
    page.line(LEFT, page.y, RIGHT, 0.6);
    page.y += 4;
  }
  let totalHours = 0;
  let totalAmount = 0;
  for (const [key, list] of groups) {
    page.ensure(40);
    page.text(groupBy === 'date' ? periodLabel(`${key}-01`, `${key}-01`) : key, LEFT, page.y, 8, true);
    page.y += 11;
    headerRow();
    let groupHours = 0;
    let groupAmount = 0;
    for (const row of list) {
      const hours = Number(row.billableHours ?? row.hours) || 0;
      const rate = rateOf.get(row.id) || 0;
      const amount = Math.round(hours * rate * 100) / 100;
      const desc = show.description ? wrap(row.description, descEnd - cols.description, 7) : [''];
      const height = Math.max(1, desc.length) * 9 + 2;
      if (page.ensure(height)) headerRow();
      const top = page.y;
      page.text(formatDate(row.date), cols.date, top, 7);
      if (show.employee) page.text(wrap(row.employeeName, 100, 7)[0] || '', cols.employee, top, 7);
      if (show.activity) page.text(wrap(row.activityName, 86, 7)[0] || '', cols.activity, top, 7);
      desc.forEach((line, index) => page.text(line, cols.description, top + index * 9, 7));
      page.right(num(hours), cols.hours, top, 7);
      if (show.rate) page.right(rate ? num(rate) : '', cols.rate, top, 7);
      if (show.amount) page.right(rate ? num(amount) : '', cols.amount, top, 7);
      page.y += height;
      groupHours += hours;
      groupAmount += amount;
    }
    page.line(cols.hours - 60, page.y, RIGHT, 0.4);
    page.y += 3;
    page.right(num(groupHours), cols.hours, page.y, 7, true);
    if (show.amount) page.right(num(groupAmount), cols.amount, page.y, 7, true);
    page.y += 16;
    totalHours += groupHours;
    totalAmount += groupAmount;
  }
  page.ensure(20);
  page.line(LEFT, page.y, RIGHT, 0.8);
  page.y += 4;
  page.text(labels.total, LEFT, page.y, 8, true);
  page.right(num(totalHours), cols.hours, page.y, 8, true);
  if (show.amount) page.right(num(totalAmount), cols.amount, page.y, 8, true);
  return finish(page.pages, { supplier, labels, invoice: invoice || {} });
}

function logoImage(logo) {
  return logo ? logoForDocument(logo) : null;
}

/** Fakturaen som PDF. logo er bedriftens logo (company.logo). */
export function buildInvoicePdf(invoice, { supplier = {}, logo = null, originalDate = '' } = {}) {
  const image = logoImage(logo);
  return pdfDocument(invoicePageStreams(invoice, { supplier, logo: image, originalDate }), image);
}

export function buildTimeSpecPdf(invoice, entries, { supplier = {}, settings = {}, logo = null } = {}) {
  const image = logoImage(logo);
  return pdfDocument(timeSpecPageStreams(invoice, entries, { supplier, settings }), image);
}

/** «Faktura med timespesifikasjoner»: fakturaen først, så timene. */
export function buildInvoiceWithTimeSpecPdf(invoice, entries, { supplier = {}, settings = {}, logo = null, originalDate = '' } = {}) {
  const image = logoImage(logo);
  return pdfDocument([
    ...invoicePageStreams(invoice, { supplier, logo: image, originalDate }),
    ...timeSpecPageStreams(invoice, entries, { supplier, settings }),
  ], image);
}

export function invoicePdfName(invoice) {
  if (isDraftInvoice(invoice)) return isCreditNote(invoice) ? 'Kreditnota-utkast.pdf' : 'Faktura-utkast.pdf';
  return `${isCreditNote(invoice) ? 'Kreditnota' : 'Faktura'}-${text(invoice?.invoiceNumber) || 'utkast'}.pdf`;
}

export function pdfBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export const PDF_PAGE = { width: PAGE_W, height: PAGE_H };
