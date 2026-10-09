/**
 * Norske momskoder / MVA-satser for faktura og EHF.
 * Ref: merverdiavgiftsloven — ordinær 25 %, næringsmidler 15 %, persontransport/kultur 12 %, fritatt/utenfor 0 %.
 */

export const VAT_CODES = [
  {
    id: 'HIGH',
    label: 'Høy sats',
    percent: 25,
    category: 'S', // Standard rated (Peppol TaxCategory)
    account: '2701',
    description: 'Alminnelig merverdiavgift 25 %',
  },
  {
    id: 'MID',
    label: 'Middels sats',
    percent: 15,
    category: 'S',
    account: '2702',
    description: 'Næringsmidler m.m. 15 %',
  },
  {
    id: 'LOW',
    label: 'Lav sats',
    percent: 12,
    category: 'S',
    account: '2703',
    description: 'Persontransport, kinobilletter m.m. 12 %',
  },
  {
    id: 'ZERO',
    label: 'Nullsats',
    percent: 0,
    category: 'Z',
    account: '2704',
    description: 'Omfattet av loven, 0 %',
  },
  {
    id: 'EXEMPT',
    label: 'Fritatt',
    percent: 0,
    category: 'E',
    account: '',
    description: 'Fritatt for merverdiavgift',
  },
  {
    id: 'OUTSIDE',
    label: 'Utenfor avgiftsområdet',
    percent: 0,
    category: 'O',
    account: '',
    description: 'Utenfor merverdiavgiftsloven',
  },
];

export function vatCodeById(id) {
  return VAT_CODES.find((row) => row.id === String(id || '').toUpperCase()) || null;
}

export function defaultVatCode(pricingModel = '') {
  if (pricingModel === 'not_billable') return 'EXEMPT';
  return 'HIGH';
}

export function resolveVatPercent(codeOrPercent) {
  if (typeof codeOrPercent === 'number' && Number.isFinite(codeOrPercent)) {
    return Math.max(0, codeOrPercent);
  }
  const known = vatCodeById(codeOrPercent);
  if (known) return known.percent;
  const n = Number(String(codeOrPercent || '').replace(',', '.'));
  return Number.isFinite(n) ? Math.max(0, n) : 25;
}

/** Round half up to 2 decimals (norsk fakturapraksis). */
export function roundMoney(value) {
  const n = Number(value) || 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calcLineVat({ quantity = 1, unitPrice = 0, vatCode = 'HIGH', vatPercent } = {}) {
  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  const percent = vatPercent != null ? resolveVatPercent(vatPercent) : resolveVatPercent(vatCode);
  const exVat = roundMoney(qty * price);
  const vat = roundMoney(exVat * (percent / 100));
  return {
    quantity: qty,
    unitPrice: roundMoney(price),
    vatCode: vatCodeById(vatCode)?.id || String(vatCode || 'HIGH').toUpperCase(),
    vatPercent: percent,
    amountExVat: exVat,
    vatAmount: vat,
    amountInclVat: roundMoney(exVat + vat),
  };
}

export function sumVatByCode(lines = []) {
  const map = new Map();
  for (const line of lines) {
    const code = line.vatCode || defaultVatCode();
    const percent = resolveVatPercent(line.vatPercent ?? code);
    const key = `${code}:${percent}`;
    const prev = map.get(key) || {
      vatCode: code,
      vatPercent: percent,
      category: vatCodeById(code)?.category || 'S',
      taxableAmount: 0,
      vatAmount: 0,
    };
    prev.taxableAmount = roundMoney(prev.taxableAmount + (Number(line.amountExVat) || 0));
    prev.vatAmount = roundMoney(prev.vatAmount + (Number(line.vatAmount) || 0));
    map.set(key, prev);
  }
  return [...map.values()];
}

export function invoiceVatTotals(lines = []) {
  const groups = sumVatByCode(lines);
  const amountExVat = roundMoney(groups.reduce((s, g) => s + g.taxableAmount, 0));
  const vat = roundMoney(groups.reduce((s, g) => s + g.vatAmount, 0));
  return {
    amountExVat,
    vat,
    amountInclVat: roundMoney(amountExVat + vat),
    groups,
  };
}
