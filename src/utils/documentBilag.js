/**
 * Pure helpers for document bilag list — unit-tested without Firebase.
 */

export function emptyBilag(overrides = {}) {
  return {
    supplier: '',
    orgNr: '',
    date: '',
    amount: null,
    currency: 'NOK',
    vatAmount: null,
    vatPercent: null,
    paymentMethod: '',
    invoiceNumber: '',
    category: '',
    lineItems: [],
    notes: '',
    ocrStatus: 'pending',
    ocrEngine: '',
    confidence: null,
    ...overrides,
  };
}

export function formatBilagAmount(amount, currency = 'NOK') {
  if (amount == null || amount === '' || Number.isNaN(Number(amount))) return '—';
  const n = Number(amount);
  try {
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: currency || 'NOK',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency || 'NOK'}`;
  }
}

export function bilagSearchHaystack(file) {
  const b = file?.bilag || {};
  const lines = Array.isArray(b.lineItems)
    ? b.lineItems.map((l) => `${l?.description || ''} ${l?.amount ?? ''}`).join(' ')
    : '';
  return [
    file?.name,
    b.supplier,
    b.orgNr,
    b.date,
    b.amount,
    b.invoiceNumber,
    b.category,
    b.paymentMethod,
    b.notes,
    lines,
  ].map((v) => String(v ?? '').toLowerCase()).join(' ');
}

export function filterDocumentFiles(files, query) {
  const list = Array.isArray(files) ? files : [];
  const q = String(query || '').trim().toLowerCase();
  if (!q) return list;
  const tokens = q.split(/\s+/).filter(Boolean);
  return list.filter((file) => {
    const hay = bilagSearchHaystack(file);
    return tokens.every((t) => hay.includes(t));
  });
}

function tsMs(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  if (typeof v === 'number') return v;
  return 0;
}

export function sortFilesForDocumentList(files) {
  return [...(files || [])].sort((a, b) => {
    const aBilag = a?.bilag && (a.kind === 'receipt' || a.bilag.amount != null || a.bilag.supplier);
    const bBilag = b?.bilag && (b.kind === 'receipt' || b.bilag.amount != null || b.bilag.supplier);
    if (aBilag && bBilag) {
      const da = String(a.bilag?.date || '');
      const db = String(b.bilag?.date || '');
      if (da !== db) return db.localeCompare(da);
      const aa = Number(a.bilag?.amount);
      const ba = Number(b.bilag?.amount);
      if (Number.isFinite(aa) && Number.isFinite(ba) && aa !== ba) return ba - aa;
    }
    return tsMs(b.updatedAt || b.createdAt) - tsMs(a.updatedAt || a.createdAt);
  });
}

export function isReceiptFile(file) {
  if (!file) return false;
  if (file.kind === 'receipt') return true;
  const b = file.bilag;
  if (!b || typeof b !== 'object') return false;
  return !!(b.supplier || b.amount != null || b.date || b.ocrStatus);
}
