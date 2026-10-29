/**
 * Pure helpers for receipt OCR → regnskapsbilag (no Firebase deps).
 */

function toNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[\s\u00a0]/g, '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  // «1.234,50» og «1,234.50»: siste skilletegn er desimaltegnet, de andre er tusenskille.
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const decimal = Math.max(lastComma, lastDot);
  if (decimal >= 0) {
    const tail = s.slice(decimal + 1);
    const head = s.slice(0, decimal).replace(/[.,]/g, '');
    // «1.234» (tre siffer etter ett punktum og ingen komma) er tusenskille i norske beløp.
    const thousands = tail.length === 3 && lastComma < 0 && s.indexOf('.') === lastDot && head.replace('-', '').length <= 3;
    s = thousands ? `${head}${tail}` : `${head}.${tail}`;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const MONTHS = {
  jan: 1, januar: 1, january: 1,
  feb: 2, februar: 2, february: 2,
  mar: 3, mars: 3, march: 3,
  apr: 4, april: 4,
  mai: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

function isoDay(y, m, d) {
  let year = Number(y);
  if (year < 100) year += 2000;
  const month = Number(m);
  const day = Number(d);
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1990 && year <= 2100)) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function cleanStr(v, max = 200) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normalizeOrgNr(v) {
  const digits = String(v || '').replace(/\D/g, '');
  return digits.length === 9 ? digits : '';
}

export function normalizeDate(v) {
  const s = cleanStr(v, 48).toLowerCase();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return isoDay(m[1], m[2], m[3]);
  m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) return isoDay(m[3], m[2], m[1]);
  // «onsdag 7. oktober 2020», «7 okt 20»
  m = s.match(/(\d{1,2})\.?\s*([a-zæøå]+)\.?\s*(\d{2,4})/);
  if (m && MONTHS[m[2]]) return isoDay(m[3], MONTHS[m[2]], m[1]);
  return '';
}

function normalizeVatLines(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 6).map((row) => ({
    percent: toNum(row?.percent ?? row?.rate),
    base: toNum(row?.base ?? row?.net ?? row?.exVat),
    vat: toNum(row?.vat ?? row?.vatAmount),
  })).filter((row) => row.percent != null && (row.base != null || row.vat != null));
}

function normalizeCurrency(v) {
  const raw = cleanStr(v, 8).toUpperCase();
  if (!raw || raw === 'KR' || raw === 'KR.' || raw === 'NKR') return 'NOK';
  if (raw === '€' || raw === 'EURO') return 'EUR';
  if (raw === '$' || raw === 'US$') return 'USD';
  if (raw === '£') return 'GBP';
  return /^[A-Z]{3}$/.test(raw) ? raw : 'NOK';
}

export function normalizeReceiptBilag(raw = {}) {
  const lineItems = Array.isArray(raw.lineItems)
    ? raw.lineItems.slice(0, 40).map((row) => ({
      description: cleanStr(row?.description || row?.name, 160),
      quantity: toNum(row?.quantity) ?? 1,
      amount: toNum(row?.amount),
    })).filter((row) => row.description || row.amount != null)
    : [];

  const amount = toNum(raw.amount);
  const vatAmount = toNum(raw.vatAmount);
  let vatPercent = toNum(raw.vatPercent);
  if (vatPercent == null && amount != null && vatAmount != null && amount > vatAmount) {
    const net = amount - vatAmount;
    if (net > 0) vatPercent = Math.round((vatAmount / net) * 1000) / 10;
  }

  let confidence = toNum(raw.confidence);
  if (confidence != null) confidence = Math.max(0, Math.min(1, confidence));

  let warrantyMonths = toNum(raw.warrantyMonths ?? raw.garantiMonths ?? raw.warrantyPeriodMonths);
  if (warrantyMonths != null) {
    warrantyMonths = Math.max(0, Math.min(600, Math.round(warrantyMonths)));
    if (warrantyMonths <= 0) warrantyMonths = null;
  }

  const warrantyUntil = normalizeDate(
    raw.warrantyUntil || raw.warrantyEnd || raw.garantiTil || raw.garantiSlutt,
  );
  const warrantyText = cleanStr(
    raw.warrantyText || raw.warranty || raw.garanti || raw.garantiInfo,
    200,
  );
  const suggestedTitle = cleanStr(raw.suggestedTitle || raw.title || raw.tittel, 120);

  return {
    supplier: cleanStr(raw.supplier || raw.vendor || raw.merchant, 120),
    orgNr: normalizeOrgNr(raw.orgNr || raw.orgNumber || raw.organisasjonsnummer),
    date: normalizeDate(raw.date || raw.purchaseDate),
    amount,
    currency: normalizeCurrency(raw.currency),
    vatAmount,
    vatPercent,
    paymentMethod: cleanStr(raw.paymentMethod, 40).toLowerCase(),
    invoiceNumber: cleanStr(raw.invoiceNumber || raw.receiptNumber, 60),
    category: cleanStr(raw.category, 40),
    lineItems,
    notes: cleanStr(raw.notes, 400),
    confidence,
    suggestedTitle,
    warrantyMonths,
    warrantyUntil,
    warrantyText,
    vatLines: normalizeVatLines(raw.vatLines),
    expenseType: cleanStr(raw.expenseType, 32).toLowerCase().replace(/[^a-z]/g, ''),
    documentType: ['receipt', 'invoice', 'card_slip', 'other'].includes(raw.documentType) ? raw.documentType : '',
    cardLast4: String(raw.cardLast4 || '').replace(/\D/g, '').slice(-4),
    duplicatePages: raw.duplicatePages === true,
    vendorCountry: /^[A-Za-z]{2}$/.test(String(raw.vendorCountry || '').trim()) ? String(raw.vendorCountry).trim().toUpperCase() : '',
    isService: raw.isService === true,
    purpose: cleanStr(raw.purpose || raw.formaal, 200),
    time: /^\d{1,2}[:.]\d{2}/.test(String(raw.time || '').trim()) ? String(raw.time).trim().slice(0, 5).replace('.', ':') : '',
  };
}

function near(a, b, tolerance) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

/**
 * Det som ikke stemmer i en tolket kvittering: manglende hovedfelt, lav sikkerhet og summer
 * som ikke går opp (mva-linjer mot total, mva-beløp, varelinjer). Tom liste når alt stemmer.
 * today: YYYY-MM-DD (dato frem i tid er feil).
 */
export function receiptProblems(bilag = {}, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const problems = [];
  const amount = bilag.amount;
  if (amount == null || !(Math.abs(amount) > 0)) problems.push('Totalbeløp mangler.');
  if (!bilag.date) problems.push('Dato mangler.');
  else if (bilag.date > today) problems.push(`Datoen ${bilag.date} er frem i tid.`);
  if (!bilag.supplier) problems.push('Butikk/leverandør mangler.');
  if (bilag.confidence != null && bilag.confidence < 0.8) problems.push(`Lav sikkerhet (${bilag.confidence}).`);
  const lines = Array.isArray(bilag.vatLines) ? bilag.vatLines : [];
  if (amount != null && lines.length && lines.every((row) => row.base != null && row.vat != null)) {
    const sum = lines.reduce((acc, row) => acc + row.base + row.vat, 0);
    if (!near(sum, amount, Math.max(1, Math.abs(amount) * 0.01))) {
      problems.push(`Mva-spesifikasjonen (${sum.toFixed(2)}) stemmer ikke med totalen (${Number(amount).toFixed(2)}).`);
    }
    for (const row of lines) {
      if (row.base > 0 && !near((row.base * row.percent) / 100, row.vat, Math.max(0.6, row.vat * 0.02))) {
        problems.push(`Mva ${row.percent} % av ${row.base} er ikke ${row.vat}.`);
      }
    }
  }
  if (bilag.vatAmount != null && lines.length) {
    const vatSum = lines.reduce((acc, row) => acc + (row.vat || 0), 0);
    if (!near(vatSum, bilag.vatAmount, 1)) problems.push(`Mva-beløpet (${bilag.vatAmount}) stemmer ikke med mva-linjene (${vatSum.toFixed(2)}).`);
  }
  if (amount != null && bilag.vatAmount != null && bilag.vatAmount >= Math.abs(amount) && amount !== 0) {
    problems.push('Mva-beløpet er like stort som eller større enn totalen.');
  }
  const items = (bilag.lineItems || []).filter((row) => row.amount != null);
  if (amount != null && items.length >= 2) {
    const sum = items.reduce((acc, row) => acc + row.amount, 0);
    if (!near(sum, amount, Math.max(1, Math.abs(amount) * 0.02)) && !near(sum, amount * 2, 1)) {
      problems.push(`Varelinjene (${sum.toFixed(2)}) stemmer ikke med totalen (${Number(amount).toFixed(2)}).`);
    }
  }
  return problems;
}

/**
 * Kontrollrunden går foran. Felt den lot stå tomme, hentes fra første runde.
 */
export function mergeReceiptPasses(first = {}, second = {}) {
  const out = { ...second };
  for (const [key, value] of Object.entries(first)) {
    const next = out[key];
    const empty = next == null || next === '' || (Array.isArray(next) && !next.length);
    if (empty && value != null && value !== '' && !(Array.isArray(value) && !value.length)) out[key] = value;
  }
  return out;
}

export const __test = { toNum, cleanStr, normalizeOrgNr, normalizeDate, normalizeReceiptBilag, normalizeCurrency, receiptProblems, mergeReceiptPasses };
