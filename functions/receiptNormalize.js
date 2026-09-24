/**
 * Pure helpers for receipt OCR → regnskapsbilag (no Firebase deps).
 */

function toNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).replace(/\s/g, '').replace(',', '.');
  const n = Number(s.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function cleanStr(v, max = 200) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normalizeOrgNr(v) {
  const digits = String(v || '').replace(/\D/g, '');
  return digits.length === 9 ? digits : '';
}

export function normalizeDate(v) {
  const s = cleanStr(v, 32);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    const mm = String(m[2]).padStart(2, '0');
    const dd = String(m[1]).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  }
  return '';
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
    currency: cleanStr(raw.currency || 'NOK', 8).toUpperCase() || 'NOK',
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
  };
}

export const __test = { toNum, cleanStr, normalizeOrgNr, normalizeDate, normalizeReceiptBilag };
