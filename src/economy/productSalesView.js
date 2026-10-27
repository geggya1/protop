/**
 * Produktsalg-listen: salg fra produktkatalogen, import og timelisten.
 * Siden viser hele registeret. scope «mine» begrenser til innlogget ansatt
 * og salg uten ansatt.
 */
import { normalizeSale, SALE_STATUSES } from './products.js';

export function saleStatusLabel(status) {
  return SALE_STATUSES.find((row) => row.id === status)?.label || 'Utkast';
}

/** Fakturert salg er låst. Fakturaen er fasit, og endringer må gå via kreditnota. */
export function saleIsLocked(sale) {
  return sale?.status === 'invoiced' || !!String(sale?.invoiceId || '').trim();
}

export function productSalesForViewer(sales = [], employeeId = '', { scope = 'company' } = {}) {
  const id = String(employeeId || '').trim();
  return (sales || [])
    .map((row) => normalizeSale(row))
    .filter((row) => row.name)
    .filter((row) => scope !== 'mine' || !id || !row.employeeId || row.employeeId === id)
    .sort((a, b) => (
      String(b.date).localeCompare(String(a.date))
      || String(a.name).localeCompare(String(b.name), 'nb')
    ));
}

/**
 * Nøkkel for prosjektfilteret. Prosjektnummeret samler koblede rader og rader
 * med bare nummeret fra filen. Uten nummer brukes id, så navn.
 */
export function saleProjectKey(row) {
  const number = String(row?.projectNumber || '').trim();
  if (number) return `nr:${number}`;
  if (row?.projectId) return `id:${row.projectId}`;
  const name = String(row?.projectName || '').trim().toLowerCase();
  return name ? `navn:${name}` : '';
}

export function saleCustomerKey(row) {
  if (row?.customerId) return `id:${row.customerId}`;
  const number = String(row?.customerNumber || '').trim();
  if (number) return `nr:${number}`;
  const name = String(row?.customerName || '').trim().toLowerCase();
  return name ? `navn:${name}` : '';
}

export function saleProjectLabel(row) {
  const number = String(row?.projectNumber || '').trim();
  const name = String(row?.projectName || '').trim();
  return [number ? `#${number}` : '', name].filter(Boolean).join(' ');
}

export function filterProductSales(rows = [], query = '', status = '', { project = '', customer = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const statusId = String(status || '').trim();
  return rows.filter((row) => {
    if (statusId && row.status !== statusId) return false;
    if (project && saleProjectKey(row) !== project) return false;
    if (customer && saleCustomerKey(row) !== customer) return false;
    if (!q) return true;
    const hay = [
      row.date,
      row.name,
      row.sku,
      row.customerName,
      row.customerNumber,
      row.projectName,
      row.projectNumber,
      row.employeeName,
      row.title,
      row.comment,
      row.activityName,
      row.department,
      row.productGroup,
      saleStatusLabel(row.status),
      String(row.quantity),
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

/** Valg til prosjekt- og kundefilteret: bare det som finnes i salgene, med antall. */
export function saleFilterOptions(rows = []) {
  const projects = new Map();
  const customers = new Map();
  for (const row of rows || []) {
    const pKey = saleProjectKey(row);
    if (pKey) {
      const hit = projects.get(pKey) || { id: pKey, label: saleProjectLabel(row) || 'Uten navn', count: 0 };
      hit.count += 1;
      projects.set(pKey, hit);
    }
    const cKey = saleCustomerKey(row);
    if (cKey) {
      const hit = customers.get(cKey) || { id: cKey, label: String(row.customerName || row.customerNumber || 'Uten navn'), count: 0 };
      hit.count += 1;
      customers.set(cKey, hit);
    }
  }
  const sorted = (map) => [...map.values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'nb', { numeric: true }))
    .map((row) => ({ id: row.id, label: row.label, hint: `${row.count} salg` }));
  return { projects: sorted(projects), customers: sorted(customers) };
}

const STATUS_ORDER = { draft: 0, approved: 1, invoiced: 2 };

const SORT_VALUE = {
  date: (row) => String(row.date || ''),
  name: (row) => String(row.name || ''),
  quantity: (row) => Number(row.quantity) || 0,
  customer: (row) => String(row.customerName || ''),
  project: (row) => String(row.projectNumber || row.projectName || ''),
  employee: (row) => String(row.employeeName || ''),
  amount: (row) => Number(row.amountInclVat) || 0,
  status: (row) => STATUS_ORDER[row.status] ?? 0,
};

export const SALE_SORT_KEYS = Object.keys(SORT_VALUE);

/**
 * Sorter etter kolonne. Tomme felt havner sist uansett retning.
 * Lik verdi: nyeste dato først, så produktnavn.
 */
export function sortProductSales(rows = [], { key = 'date', dir = 'desc' } = {}) {
  const pick = SORT_VALUE[key] || SORT_VALUE.date;
  const sign = dir === 'asc' ? 1 : -1;
  return [...(rows || [])].sort((a, b) => {
    const va = pick(a);
    const vb = pick(b);
    const emptyA = va === '' || va == null;
    const emptyB = vb === '' || vb == null;
    if (emptyA !== emptyB) return emptyA ? 1 : -1;
    let diff = 0;
    if (typeof va === 'number' && typeof vb === 'number') diff = va - vb;
    else diff = String(va).localeCompare(String(vb), 'nb', { numeric: true, sensitivity: 'base' });
    if (diff) return diff * sign;
    return String(b.date).localeCompare(String(a.date))
      || String(a.name).localeCompare(String(b.name), 'nb');
  });
}

export function saleTotals(rows = []) {
  let exVat = 0;
  let inclVat = 0;
  let invoiced = 0;
  let open = 0;
  for (const row of rows || []) {
    const ex = Number(row.amountExVat) || 0;
    exVat += ex;
    inclVat += Number(row.amountInclVat) || 0;
    if (row.status === 'invoiced') invoiced += ex;
    else open += ex;
  }
  const round = (n) => Math.round(n * 100) / 100;
  return { exVat: round(exVat), inclVat: round(inclVat), invoiced: round(invoiced), open: round(open) };
}

/**
 * Salg som hører til prosjektet. Rader uten prosjekt-id kobles på prosjektnummeret.
 * Treff får prosjekt-id satt, så summene på prosjektet tar dem med.
 */
export function salesForProject(sales = [], project) {
  const id = String(project?.id || '').trim();
  const number = String(project?.number || '').trim();
  if (!id) return [];
  const out = [];
  for (const row of sales || []) {
    if (!row) continue;
    if (row.projectId === id) out.push(row);
    else if (!row.projectId && number && String(row.projectNumber || '').trim() === number) {
      out.push({ ...row, projectId: id });
    }
  }
  return out;
}

const EXPORT_HEADER = [
  'Dato', 'Varenr', 'Produkt', 'Beskrivelse', 'Antall', 'Enhet', 'Enhetspris eks. mva', 'Rabatt %',
  'Beløp eks. mva', 'MVA', 'Beløp inkl. mva', 'MVA-kode', 'Konto',
  'Kundenr', 'Kunde', 'Prosjektnr', 'Prosjekt', 'Medarbeider', 'Avdeling', 'Aktivitet',
  'Status', 'Faktura-id', 'Kommentar',
];

/** Rader til Excel: tall som tall, så summer og filtre virker i regnearket. */
export function productSalesExportRows(rows = []) {
  const body = (rows || []).map((raw) => {
    const row = normalizeSale(raw);
    return [
      row.date, row.sku, row.name, row.title && row.title !== row.name ? row.title : '',
      row.quantity, row.unit, row.unitPrice, row.discountPercent || 0,
      row.amountExVat, row.vatAmount, row.amountInclVat, row.vatCode, row.account,
      row.customerNumber, row.customerName, row.projectNumber, row.projectName, row.employeeName,
      row.department, row.activityName,
      saleStatusLabel(row.status), row.invoiceId, row.comment,
    ];
  });
  return [EXPORT_HEADER, ...body];
}

export function productSalesToCsv(rows = []) {
  const table = productSalesExportRows(rows);
  const cell = (value) => {
    const raw = typeof value === 'number' ? String(value).replace('.', ',') : String(value ?? '');
    return `"${raw.replace(/"/g, '""')}"`;
  };
  return `﻿${table.map((line) => line.map(cell).join(';')).join('\n')}`;
}
