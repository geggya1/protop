/**
 * Produktkatalogen: søk, sortering og bruksstatistikk per produkt.
 * Salg kobles på productId. Salg uten kobling (timeliste, eldre import)
 * kobles på varenr og deretter navn, slik importen gjør.
 */
import { fold, text } from './invoices.js';
import { normalizeProduct, normalizeSale, productKind } from './products.js';
import { roundMoney } from './vat.js';

export const CATALOG_SORTS = [
  { id: 'name', label: 'Navn' },
  { id: 'sku', label: 'Varenr' },
  { id: 'revenue', label: 'Omsetning' },
  { id: 'lastSold', label: 'Sist solgt' },
];

const MONTH_LABELS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

function skuKey(value) {
  return text(value).toLowerCase();
}

/** Hvilket produkt i katalogen et salg hører til, eller ''. */
export function catalogIndex(products = []) {
  const ids = new Set();
  const bySku = new Map();
  const byName = new Map();
  // Aktive først, så et arkivert duplikat ikke stjeler salg fra det som brukes nå.
  const ordered = [...(products || [])]
    .filter((row) => row?.id)
    .sort((a, b) => Number(!!a.archived) - Number(!!b.archived));
  for (const row of ordered) {
    ids.add(row.id);
    const sku = skuKey(row.sku);
    if (sku && !bySku.has(sku)) bySku.set(sku, row.id);
    const name = fold(row.name);
    if (name && !byName.has(name)) byName.set(name, row.id);
  }
  return {
    resolve(sale) {
      const productId = text(sale?.productId);
      if (productId && ids.has(productId)) return productId;
      const sku = skuKey(sale?.sku);
      if (sku && bySku.has(sku)) return bySku.get(sku);
      const name = fold(sale?.name);
      return (name && byName.get(name)) || '';
    },
  };
}

/** Map produktId → salg (normalisert, nyeste først). */
export function salesByProduct(products = [], sales = []) {
  const index = catalogIndex(products);
  const out = new Map();
  for (const raw of sales || []) {
    const sale = normalizeSale(raw);
    if (!sale.name) continue;
    const id = index.resolve(sale);
    if (!id) continue;
    if (!out.has(id)) out.set(id, []);
    out.get(id).push(sale);
  }
  for (const rows of out.values()) {
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }
  return out;
}

/** Kort sammendrag for katalogtabellen. */
export function usageSummary(rows = []) {
  let quantity = 0;
  let amountExVat = 0;
  let amountInclVat = 0;
  let firstDate = '';
  let lastDate = '';
  for (const row of rows || []) {
    quantity += Number(row.quantity) || 0;
    amountExVat += Number(row.amountExVat) || 0;
    amountInclVat += Number(row.amountInclVat) || 0;
    const date = text(row.date);
    if (date && (!firstDate || date < firstDate)) firstDate = date;
    if (date && (!lastDate || date > lastDate)) lastDate = date;
  }
  return {
    count: (rows || []).length,
    quantity: roundMoney(quantity),
    amountExVat: roundMoney(amountExVat),
    amountInclVat: roundMoney(amountInclVat),
    firstDate,
    lastDate,
  };
}

export function emptyUsage() {
  return usageSummary([]);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** De siste tolv månedene til og med denne, eldste først. */
export function lastTwelveMonths(now = new Date()) {
  const out = [];
  for (let back = 11; back >= 0; back -= 1) {
    const at = new Date(now.getFullYear(), now.getMonth() - back, 1);
    out.push({
      key: monthKey(at),
      label: MONTH_LABELS[at.getMonth()],
      year: at.getFullYear(),
    });
  }
  return out;
}

function groupBy(rows, keyOf, labelOf) {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const hit = map.get(key) || { key, label: labelOf(row), count: 0, quantity: 0, amountExVat: 0, lastDate: '' };
    hit.count += 1;
    hit.quantity += Number(row.quantity) || 0;
    hit.amountExVat += Number(row.amountExVat) || 0;
    if (text(row.date) > hit.lastDate) hit.lastDate = text(row.date);
    map.set(key, hit);
  }
  return [...map.values()]
    .map((row) => ({ ...row, quantity: roundMoney(row.quantity), amountExVat: roundMoney(row.amountExVat) }))
    .sort((a, b) => b.amountExVat - a.amountExVat || b.count - a.count || a.label.localeCompare(b.label, 'nb'));
}

// Importerte salg har ofte nummer og navn, men ikke id. Grupper på det som vises.
function customerKey(row) {
  return fold(row.customerName) || skuKey(row.customerNumber) || text(row.customerId);
}

function projectKey(row) {
  return skuKey(row.projectNumber) || fold(row.projectName) || text(row.projectId);
}

export function projectLabel(row) {
  const number = text(row.projectNumber);
  const name = text(row.projectName);
  if (number && name) return `${number} · ${name}`;
  return name || number;
}

/**
 * Statistikk for ett produkt: totaler, i år, per status, per måned,
 * per kunde og per prosjekt.
 */
export function productStats(rows = [], { now = new Date() } = {}) {
  const list = rows || [];
  const year = String(now.getFullYear());
  const total = usageSummary(list);
  const thisYear = usageSummary(list.filter((row) => String(row.date).startsWith(year)));
  const byStatus = { draft: 0, approved: 0, invoiced: 0 };
  for (const row of list) {
    if (byStatus[row.status] != null) byStatus[row.status] += 1;
  }
  const months = lastTwelveMonths(now).map((month) => {
    const inMonth = list.filter((row) => String(row.date).startsWith(month.key));
    return { ...month, ...usageSummary(inMonth) };
  });
  return {
    total,
    thisYear,
    byStatus,
    months,
    averagePrice: total.quantity > 0 ? roundMoney(total.amountExVat / total.quantity) : 0,
    customers: groupBy(list, customerKey, (row) => text(row.customerName) || text(row.customerNumber) || 'Uten navn'),
    projects: groupBy(list, projectKey, (row) => projectLabel(row) || 'Uten navn'),
    withoutCustomer: list.filter((row) => !customerKey(row)).length,
    withoutProject: list.filter((row) => !projectKey(row)).length,
  };
}

/** Dekningsbidrag per enhet når kostpris er satt. */
export function productMargin(product) {
  const row = normalizeProduct(product);
  if (!(row.costExVat > 0)) return null;
  const amount = roundMoney(row.priceExVat - row.costExVat);
  const percent = row.priceExVat > 0 ? Math.round((amount / row.priceExVat) * 1000) / 10 : 0;
  return { amount, percent };
}

/** Brukte produkter arkiveres. Bare produkter uten salg kan slettes. */
export function productRemoval(usage) {
  const count = Number(usage?.count) || 0;
  return count > 0
    ? { mode: 'archive', count }
    : { mode: 'delete', count: 0 };
}

export function filterCatalog(products = [], usage = new Map(), {
  query = '',
  status = 'active',
  kind = '',
  sort = 'name',
} = {}) {
  const q = fold(query).trim();
  const rows = (products || [])
    .map((raw) => normalizeProduct(raw))
    .filter((row) => row.id)
    .filter((row) => (status === 'archived' ? row.archived : status === 'all' ? true : !row.archived))
    .filter((row) => !kind || row.kind === kind)
    .filter((row) => {
      if (!q) return true;
      return fold([
        row.sku,
        row.name,
        row.description,
        row.unit,
        productKind(row.kind).label,
      ].join(' ')).includes(q);
    })
    .map((row) => ({ product: row, usage: usage.get(row.id) || emptyUsage() }));
  const byName = (a, b) => a.product.name.localeCompare(b.product.name, 'nb', { numeric: true });
  rows.sort((a, b) => {
    if (sort === 'sku') {
      return (a.product.sku || '￿').localeCompare(b.product.sku || '￿', 'nb', { numeric: true }) || byName(a, b);
    }
    if (sort === 'revenue') return b.usage.amountExVat - a.usage.amountExVat || byName(a, b);
    if (sort === 'lastSold') return String(b.usage.lastDate).localeCompare(String(a.usage.lastDate)) || byName(a, b);
    return byName(a, b);
  });
  return rows;
}

/** Map produktId → sammendrag, til tabellen. */
export function usageByProduct(grouped = new Map()) {
  return new Map([...grouped].map(([id, rows]) => [id, usageSummary(rows)]));
}

/** Tall øverst i katalogen. grouped er salesByProduct(). */
export function catalogTotals(products = [], grouped = new Map(), { now = new Date() } = {}) {
  const list = (products || []).map((raw) => normalizeProduct(raw)).filter((row) => row.id);
  const active = list.filter((row) => !row.archived);
  const year = String(now.getFullYear());
  const yearRows = [];
  let top = null;
  for (const [id, rows] of grouped) {
    const inYear = rows.filter((row) => String(row.date).startsWith(year));
    yearRows.push(...inYear);
    const amount = usageSummary(inYear).amountExVat;
    if (amount > 0 && (!top || amount > top.amountExVat)) top = { id, amountExVat: amount };
  }
  const yearSummary = usageSummary(yearRows);
  const topProduct = top ? list.find((row) => row.id === top.id) : null;
  return {
    active: active.length,
    archived: list.length - active.length,
    unused: active.filter((row) => !(grouped.get(row.id)?.length > 0)).length,
    yearAmountExVat: yearSummary.amountExVat,
    yearCount: yearSummary.count,
    topName: topProduct?.name || '',
    topAmountExVat: top?.amountExVat || 0,
  };
}
