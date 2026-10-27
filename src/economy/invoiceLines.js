/**
 * Fakturalinjer: seksjoner, påslag, rabatt, mva og summer.
 *
 * Beløpet regnes som i Peppol BIS 3 (EN 16931): grunnbeløp (antall × enhetspris),
 * pluss påslag, minus rabatt. Mva regnes per mva-gruppe på summen av linjene,
 * ikke per linje, så summene stemmer med EHF-valideringen (BR-CO-17).
 */
import { roundMoney, vatCodeById } from './vat.js';

export const LINE_SECTIONS = [
  { id: 'hours', label: 'Timer' },
  { id: 'fixed', label: 'Fastpris og avtaler' },
  { id: 'expenses', label: 'Viderefakturerte utlegg' },
  { id: 'outlays', label: 'Utlegg på vegne av kunden (uten mva)' },
  { id: 'trips', label: 'Kjøring' },
  { id: 'products', label: 'Produkter' },
  { id: 'admin', label: 'Adm. kostnader' },
  { id: 'other', label: 'Andre linjer' },
];

const SECTION_IDS = new Set(LINE_SECTIONS.map((row) => row.id));

export const LINE_UNITS = [
  { id: 't', label: 'timer' },
  { id: 'stk', label: 'stk' },
  { id: 'km', label: 'km' },
  { id: 'mnd', label: 'mnd' },
  { id: 'dag', label: 'dag' },
];

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function num(value) {
  if (value === '' || value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Avrunding til øre, lik for positive og negative beløp. */
export function round2(value) {
  const n = Number(value) || 0;
  return n < 0 ? -roundMoney(-n) : roundMoney(n);
}

function round4(value) {
  const n = Number(value) || 0;
  const sign = n < 0 ? -1 : 1;
  return sign * (Math.round((Math.abs(n) + Number.EPSILON) * 10000) / 10000);
}

function ids(list) {
  return Array.isArray(list) ? [...new Set(list.map((id) => text(id)).filter(Boolean))] : [];
}

export function sectionLabel(id) {
  return LINE_SECTIONS.find((row) => row.id === id)?.label || 'Andre linjer';
}

/** Eldre linjer uten seksjon: gjett ut fra kildene og enheten. */
export function guessSection(line = {}) {
  const raw = text(line.section);
  if (SECTION_IDS.has(raw)) return raw;
  if (ids(line.timeEntryIds).length) return 'hours';
  if (ids(line.expenseIds).length) return 'expenses';
  if (ids(line.tripIds).length) return 'trips';
  if (ids(line.saleIds).length) return 'products';
  const id = text(line.id);
  if (id.startsWith('exp_')) return 'expenses';
  if (id.startsWith('trip_')) return 'trips';
  if (id.startsWith('sale_')) return 'products';
  if (/^(t|time|timer)$/i.test(text(line.unit))) return 'hours';
  return 'other';
}

export function vatPercentOf(vatCode, fallback = 25) {
  const known = vatCodeById(vatCode);
  if (known) return known.percent;
  const n = num(vatCode);
  return n == null ? fallback : Math.max(0, n);
}

/**
 * Beløp på én linje. Påslag og rabatt er prosent.
 * baseAmount = antall × enhetspris, markupAmount = påslag på grunnbeløpet,
 * discountAmount = rabatt på grunnbeløp + påslag.
 */
export function lineAmounts(line = {}) {
  const quantity = num(line.quantity) ?? 0;
  const unitPrice = num(line.unitPrice) ?? 0;
  const markupPercent = num(line.markupPercent) ?? 0;
  const discountPercent = num(line.discountPercent) ?? 0;
  const baseAmount = round2(quantity * unitPrice);
  const markupAmount = round2(baseAmount * (markupPercent / 100));
  const discountAmount = round2((baseAmount + markupAmount) * (discountPercent / 100));
  const amountExVat = round2(baseAmount + markupAmount - discountAmount);
  const vatPercent = vatPercentOf(line.vatCode, num(line.vatPercent) ?? 25);
  const vatAmount = round2(amountExVat * (vatPercent / 100));
  return {
    quantity,
    unitPrice,
    markupPercent,
    discountPercent,
    baseAmount,
    markupAmount,
    discountAmount,
    amountExVat,
    vatPercent,
    vatAmount,
    amountInclVat: round2(amountExVat + vatAmount),
    netUnitPrice: quantity ? round4(amountExVat / quantity) : round4(unitPrice),
  };
}

export function newLineId(prefix = 'line') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Full linje med alle felt og ferske beløp. */
export function normalizeLine(line, index = 0) {
  const row = line && typeof line === 'object' ? line : {};
  const vatCode = (text(row.vatCode) || 'HIGH').toUpperCase();
  const base = {
    id: text(row.id) || `line_${index + 1}`,
    section: guessSection(row),
    description: text(row.description),
    periodStart: text(row.periodStart).slice(0, 10),
    periodEnd: text(row.periodEnd).slice(0, 10),
    quantity: num(row.quantity) ?? 0,
    unit: text(row.unit) || 'stk',
    unitPrice: num(row.unitPrice) ?? 0,
    markupPercent: num(row.markupPercent) ?? 0,
    discountPercent: num(row.discountPercent) ?? 0,
    vatCode,
    account: text(row.account),
    employeeId: text(row.employeeId),
    employeeName: text(row.employeeName),
    activityName: text(row.activityName),
    productCode: text(row.productCode),
    locked: row.locked === true,
    manual: row.manual === true,
    timeEntryIds: ids(row.timeEntryIds),
    expenseIds: ids(row.expenseIds),
    tripIds: ids(row.tripIds),
    saleIds: ids(row.saleIds),
  };
  const amounts = lineAmounts(base);
  // Kreditnota speiler lagrede beløp, så øre ikke avviker fra originalen.
  if (row.fixedAmounts === true) {
    const ex = num(row.amountExVat) ?? amounts.amountExVat;
    const vat = num(row.vatAmount) ?? round2(ex * (amounts.vatPercent / 100));
    return {
      ...base,
      ...amounts,
      fixedAmounts: true,
      amountExVat: round2(ex),
      vatAmount: round2(vat),
      amountInclVat: round2(ex + vat),
      netUnitPrice: base.quantity ? round4(ex / base.quantity) : amounts.netUnitPrice,
    };
  }
  return { ...base, ...amounts };
}

export function normalizeLines(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((line, index) => (line && typeof line === 'object' ? normalizeLine(line, index) : null))
    .filter(Boolean);
}

/** Mva-grupper: grunnlag summert per kode, mva regnet på summen. */
export function vatGroups(lines = []) {
  const map = new Map();
  for (const line of lines) {
    const code = (text(line.vatCode) || 'HIGH').toUpperCase();
    const percent = vatPercentOf(code, num(line.vatPercent) ?? 25);
    const key = `${code}:${percent}`;
    const known = vatCodeById(code);
    const prev = map.get(key) || {
      vatCode: code,
      vatPercent: percent,
      category: known?.category || (percent > 0 ? 'S' : 'Z'),
      taxableAmount: 0,
      vatAmount: 0,
    };
    prev.taxableAmount = round2(prev.taxableAmount + (num(line.amountExVat) ?? 0));
    map.set(key, prev);
  }
  return [...map.values()].map((group) => ({
    ...group,
    vatAmount: round2(group.taxableAmount * (group.vatPercent / 100)),
  }));
}

/** Summer for hodet: eks. mva, mva, ink. mva, øreavrunding og å betale. */
export function totalsFromLines(lines = []) {
  const groups = vatGroups(lines);
  const amountExVat = round2(groups.reduce((sum, row) => sum + row.taxableAmount, 0));
  const vat = round2(groups.reduce((sum, row) => sum + row.vatAmount, 0));
  const amountInclVat = round2(amountExVat + vat);
  const totalDue = amountInclVat < 0 ? -Math.round(-amountInclVat) : Math.round(amountInclVat);
  return {
    amountExVat,
    vat,
    amountInclVat,
    rounding: round2(totalDue - amountInclVat),
    totalDue,
    groups,
  };
}

/** Linjer gruppert i seksjoner i fast rekkefølge, med delsum. */
export function sectionsOf(lines = []) {
  const list = normalizeLines(lines);
  return LINE_SECTIONS
    .map((section) => {
      const rows = list.filter((line) => line.section === section.id);
      return {
        ...section,
        lines: rows,
        amountExVat: round2(rows.reduce((sum, line) => sum + line.amountExVat, 0)),
      };
    })
    .filter((section) => section.lines.length);
}

/** Kilde-id-er fra alle linjer, slik at poster kan frigjøres eller låses. */
export function lineSources(lines = []) {
  const out = { timeEntryIds: [], expenseIds: [], tripIds: [], saleIds: [] };
  for (const line of lines || []) {
    for (const key of Object.keys(out)) out[key].push(...ids(line?.[key]));
  }
  for (const key of Object.keys(out)) out[key] = [...new Set(out[key])];
  return out;
}

export function emptyManualLine(section = 'other', extra = {}) {
  return normalizeLine({
    id: newLineId('man'),
    section,
    description: '',
    quantity: 1,
    unit: section === 'hours' ? 't' : 'stk',
    unitPrice: 0,
    vatCode: 'HIGH',
    manual: true,
    ...extra,
  });
}

/** Periodetekst som på fakturaen: 09.2026, eller 09.2026–10.2026. */
export function periodLabel(start, end) {
  const month = (value) => {
    const match = text(value).match(/^(\d{4})-(\d{2})/);
    return match ? `${match[2]}.${match[1]}` : '';
  };
  const a = month(start);
  const b = month(end);
  if (a && b && a !== b) return `${a}–${b}`;
  return a || b || '';
}
