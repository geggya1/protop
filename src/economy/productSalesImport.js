/**
 * Import av produktsalg fra Excel/CSV (f.eks. Moment).
 * Leser alle kolonner, kobler mot produkt, prosjekt, kunde og medarbeider,
 * og hopper over rader som allerede ligger i registeret.
 */
import { readSpreadsheetTables, CUSTOMER_IMPORT_ACCEPT } from '../anbud/customerImport.js';
import { normalizeCustomerNumber } from '../anbud/customers.js';
import { displayName } from '../employees/model.js';
import { addProjectMember, createId } from '../project/engine.js';
import {
  applyCustomerFromProject,
  matchEmployee,
} from './hoursImport.js';
import { fold, parseDate, text } from './invoices.js';
import {
  matchCustomer,
  matchProject,
  customerIdentityKey,
  normalizeProjectNumber,
} from './invoiceImport.js';
import {
  emptyProduct,
  normalizeSale,
} from './products.js';
import { upsertProduct } from './opsState.js';
import { roundMoney } from './vat.js';

export { matchCustomer, matchProject, customerIdentityKey, normalizeProjectNumber, matchEmployee };

const FIELD_ALIASES = [
  ['date', ['dato', 'date', 'salgsdato', 'fakturadato']],
  ['period', ['periode', 'period', 'maned', 'måned']],
  ['title', ['tittel', 'title', 'linje', 'linjetekst', 'beskrivelse', 'description']],
  ['product', ['produkt', 'product', 'varenavn', 'artikkel']],
  ['productGroup', ['produktgruppe', 'productgroup', 'varegruppe']],
  ['projectNumber', ['prosjektnummer', 'prosjektnr', 'projectnumber', 'projectno']],
  ['projectName', ['prosjekt', 'prosjektnavn', 'project', 'projectname']],
  ['department', ['avdeling', 'department']],
  ['customerNumber', ['kundenummer', 'kundenr', 'customernumber', 'customerno']],
  ['customerName', ['kundenavn', 'kunde', 'customer', 'client']],
  ['activityName', ['aktivitet', 'aktivitetsnavn', 'activity', 'activityname']],
  ['employeeName', ['medarbeider', 'ansatt', 'selger', 'employee', 'employeename']],
  ['employeeNumber', ['ansattnummer', 'ansattnr', 'employeenumber']],
  ['includedInTotal', ['inkludertitotalprisen', 'inkluderttotalpris', 'includedintotal']],
  ['invoiced', ['fakturert', 'invoiced', 'fakturastatus']],
  ['postponedUntil', ['utsatt til', 'utsattil', 'postponeuntil']],
  ['postponeReason', ['utsettelse arsak', 'utsettelseårsak', 'postponereason']],
  ['comment', ['kommentar', 'comment', 'merknad', 'notat']],
  ['quantity', ['antall', 'quantity', 'qty']],
  ['purchaseCurrency', ['kjopsvaluta', 'kjøpsvaluta', 'purchasecurrency']],
  ['purchaseUnitPrice', ['kjopspris', 'kjøpspris', 'kjopsprisprenhet', 'purchaseprice']],
  ['salesCurrency', ['salgsvaluta', 'salescurrency', 'valuta']],
  ['unitPrice', ['salgspris', 'salgsprisprenhet', 'enhetspris', 'unitprice', 'pris']],
  ['discountPercent', ['rabatt', 'rabatt%', 'discount']],
  ['surchargePercent', ['tilleggsandel', 'tilleggsandel%', 'paslag', 'påslag']],
  ['account', ['regnskapskonto', 'konto', 'account']],
  ['vat', ['mva', 'mva%', 'vat', 'momssats']],
  ['purchaseAmountExVat', ['kjopsbelopeksmva', 'kjøpsbeløpeksmva']],
  ['purchaseVatAmount', ['kjopsmva', 'kjøps-mva', 'kjopsmva']],
  ['purchaseAmountInclVat', ['kjopsbelopinkmva', 'kjøpsbeløpinkmva']],
  ['amountExVat', ['salgsbelopeksmva', 'salgsbeløpeksmva']],
  ['vatAmount', ['salgsmva', 'salgs-mva']],
  ['amountInclVat', ['salgsbelopinkmva', 'salgsbeløpinkmva']],
];

export function productSaleColumnField(header) {
  const key = fold(header).replace(/%/g, '');
  if (!key) return '';
  for (const [field, aliases] of FIELD_ALIASES) {
    if (aliases.some((alias) => fold(alias).replace(/%/g, '') === key)) return field;
  }
  if (key.includes('kjop') && key.includes('eks')) return 'purchaseAmountExVat';
  if (key.includes('kjop') && key.includes('ink')) return 'purchaseAmountInclVat';
  if (key.includes('kjop') && key.includes('mva') && !key.includes('belop')) return 'purchaseVatAmount';
  if (key.includes('salgsbelop') && key.includes('eks')) return 'amountExVat';
  if (key.includes('salgsbelop') && key.includes('ink')) return 'amountInclVat';
  if (key.includes('salgs') && key.includes('mva') && !key.includes('belop')) return 'vatAmount';
  if (key.includes('kjopspris') || key.includes('kjop') && key.includes('enhet')) return 'purchaseUnitPrice';
  if (key.includes('salgspris') || (key.includes('pris') && key.includes('enhet') && !key.includes('kjop'))) return 'unitPrice';
  if (key.includes('produktgruppe')) return 'productGroup';
  if (key === 'produkt' || key.endsWith('produkt')) return 'product';
  if (key.includes('prosjekt') && (key.includes('nr') || key.includes('nummer'))) return 'projectNumber';
  if (key.includes('kunde') && (key.includes('nr') || key.includes('nummer'))) return 'customerNumber';
  if (key.includes('kundenavn')) return 'customerName';
  if (key.includes('prosjektnavn') || key === 'prosjekt') return 'projectName';
  if (key.includes('medarbeider') || key.includes('ansattnavn')) return 'employeeName';
  if (key.includes('regnskap') || key === 'konto') return 'account';
  if (key.includes('utsett') && key.includes('arsak')) return 'postponeReason';
  if (key.includes('utsatt')) return 'postponedUntil';
  if (key.includes('totalpris')) return 'includedInTotal';
  if (key.includes('rabatt')) return 'discountPercent';
  if (key.includes('tillegg')) return 'surchargePercent';
  if (key === 'antall' || key === 'quantity') return 'quantity';
  if (key === 'dato' || (key.endsWith('dato') && !key.includes('utsatt'))) return 'date';
  return '';
}

export function parseProductLabel(value) {
  const raw = text(value);
  const match = raw.match(/^#?\s*(\d+)\s+(.+)$/);
  if (!match) return { sku: '', name: raw };
  return { sku: match[1], name: text(match[2]) };
}

export function parseAccountLabel(value) {
  const raw = text(value);
  const match = raw.match(/^(\d{3,4})\b/);
  return { account: match ? match[1] : '', accountLabel: raw };
}

function parseNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).trim().replace(/\s/g, '').replace(',', '.').replace(/%/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function parseImportMoney(value) {
  const n = parseNumber(value);
  return n == null ? null : roundMoney(n);
}

/** 0.25 og 25 % blir 25. */
export function parseVatPercent(value) {
  const n = parseNumber(value);
  if (n == null) return null;
  if (n > 0 && n <= 1) return roundMoney(n * 100);
  return roundMoney(n);
}

export function vatCodeForPercent(percent) {
  const n = Number(percent);
  if (!Number.isFinite(n)) return 'HIGH';
  if (n >= 24) return 'HIGH';
  if (n >= 14 && n <= 16) return 'MID';
  if (n >= 11 && n <= 13) return 'LOW';
  if (n === 0) return 'ZERO';
  return 'HIGH';
}

function yesNo(value) {
  const key = fold(value);
  if (['ja', 'yes', 'true', '1', 'x'].includes(key)) return true;
  if (['nei', 'no', 'false', '0'].includes(key)) return false;
  return null;
}

export function saleStatusFromImport(invoiced) {
  const key = fold(invoiced);
  if (['fakturert', 'invoiced', 'faktura'].includes(key)) return 'invoiced';
  if (['klar', 'godkjent', 'approved', 'ja', 'yes'].includes(key)) return 'approved';
  return 'draft';
}

/**
 * Stabil nøkkel mot allerede lagrede salg.
 * Person holdes utenfor: filen har ofte tom medarbeider, og kobling i etterkant
 * skal ikke få samme linje til å se ny ut.
 */
export function saleFingerprint(row = {}) {
  const date = parseDate(row.date) || text(row.date);
  const product = text(row.sku) || fold(row.name);
  const project = text(row.projectNumber) || fold(row.projectName);
  const customer = text(row.customerNumber) || fold(row.customerName);
  const qty = String(roundMoney(Number(row.quantity) || 0));
  const price = String(roundMoney(Number(row.unitPrice) || 0));
  const title = fold(row.title || row.comment || '');
  if (!date || !product) return '';
  return [date, product, project, customer, qty, price, title].join('|');
}

export function collectSaleFingerprints(sales) {
  const keys = new Set();
  for (const row of Array.isArray(sales) ? sales : []) {
    const key = text(row?.importFingerprint) || saleFingerprint(row);
    if (key) keys.add(key);
  }
  return keys;
}

export function matchCatalogProduct(products, hint = {}) {
  const list = Array.isArray(products) ? products : [];
  const sku = text(hint.sku);
  if (sku) {
    const hit = list.find((row) => text(row.sku) === sku);
    if (hit) return hit;
  }
  const name = fold(hint.name);
  if (!name) return null;
  return list.find((row) => fold(row.name) === name) || null;
}

function headerIndex(table) {
  let best = -1;
  let score = 0;
  for (let index = 0; index < Math.min(table.length, 20); index += 1) {
    const rank = (table[index] || []).filter((cell) => productSaleColumnField(cell)).length;
    if (rank > score) {
      score = rank;
      best = index;
    }
  }
  return score >= 3 ? best : -1;
}

function looksLikeSaleRow(mapped) {
  if (parseDate(mapped.date) || text(mapped.date)) return true;
  if (text(mapped.product) || text(mapped.title)) return true;
  if (parseNumber(mapped.quantity) != null) return true;
  return false;
}

function looksLikeTotalRow(mapped) {
  const blob = fold([mapped.title, mapped.product, mapped.customerName, mapped.projectName].join(' '));
  return blob === 'totalt' || blob === 'sum' || blob === 'total' || blob.startsWith('totalt');
}

export function saleDraftFromMappedRow(mapped, originalValues = {}, meta = {}) {
  const product = parseProductLabel(mapped.product);
  const account = parseAccountLabel(mapped.account);
  const vatPercent = parseVatPercent(mapped.vat);
  const included = yesNo(mapped.includedInTotal);
  const quantity = parseNumber(mapped.quantity);
  const unitPrice = parseImportMoney(mapped.unitPrice);
  const draft = {
    date: parseDate(mapped.date) || text(mapped.date),
    period: text(mapped.period),
    title: text(mapped.title),
    sku: product.sku,
    name: product.name || text(mapped.title),
    productGroup: text(mapped.productGroup),
    projectNumber: text(mapped.projectNumber),
    projectName: text(mapped.projectName),
    department: text(mapped.department),
    customerNumber: normalizeCustomerNumber(mapped.customerNumber) || text(mapped.customerNumber),
    customerName: text(mapped.customerName),
    activityName: text(mapped.activityName),
    employeeName: text(mapped.employeeName),
    employeeNumber: text(mapped.employeeNumber),
    includedInTotal: included === true,
    quantity: quantity == null ? 0 : quantity,
    unit: 'stk',
    purchaseCurrency: text(mapped.purchaseCurrency),
    purchaseUnitPrice: parseImportMoney(mapped.purchaseUnitPrice) ?? 0,
    salesCurrency: text(mapped.salesCurrency) || 'NOK',
    unitPrice: unitPrice ?? 0,
    discountPercent: parseImportMoney(mapped.discountPercent) ?? 0,
    surchargePercent: parseImportMoney(mapped.surchargePercent) ?? 0,
    account: account.account,
    accountLabel: account.accountLabel,
    vatPercent: vatPercent ?? 25,
    vatCode: vatCodeForPercent(vatPercent ?? 25),
    purchaseAmountExVat: parseImportMoney(mapped.purchaseAmountExVat),
    purchaseVatAmount: parseImportMoney(mapped.purchaseVatAmount),
    purchaseAmountInclVat: parseImportMoney(mapped.purchaseAmountInclVat),
    amountExVat: parseImportMoney(mapped.amountExVat),
    vatAmount: parseImportMoney(mapped.vatAmount),
    amountInclVat: parseImportMoney(mapped.amountInclVat),
    postponedUntil: parseDate(mapped.postponedUntil) || text(mapped.postponedUntil),
    postponeReason: text(mapped.postponeReason),
    comment: text(mapped.comment),
    status: saleStatusFromImport(mapped.invoiced),
    billable: included !== true,
    lockAmounts: mapped.amountExVat != null && mapped.amountExVat !== '',
    source: {
      filename: text(meta.filename),
      importedAt: text(meta.importedAt) || new Date().toISOString(),
      values: originalValues,
    },
  };
  draft.importFingerprint = saleFingerprint(draft);
  return draft;
}

export function companyProductSaleRow(input, {
  employees = [],
  customers = [],
  projects = [],
  products = [],
  existingFingerprints = new Set(),
} = {}) {
  const mapped = input && typeof input === 'object' ? input : {};
  const originalValues = mapped._sourceValues && typeof mapped._sourceValues === 'object'
    ? mapped._sourceValues
    : {};
  const sale = saleDraftFromMappedRow(mapped, originalValues, {
    filename: mapped._filename,
    importedAt: mapped._importedAt,
  });
  const issues = [];
  let severity = 'ok';

  if (looksLikeTotalRow(mapped) || !sale.name) {
    return {
      severity: 'block',
      issues: ['Ser ut som summeringsrad eller mangler produkt.'],
      title: text(mapped.title) || text(mapped.product) || 'Ugyldig rad',
      meta: '',
      sale: null,
      duplicate: false,
    };
  }
  if (!sale.date) {
    severity = 'block';
    issues.push('Dato mangler — raden blir ikke importert.');
  }
  if (!(sale.quantity > 0)) {
    severity = 'block';
    issues.push('Antall mangler — raden blir ikke importert.');
  }

  const product = matchCatalogProduct(products, sale);
  if (product) {
    sale.productId = product.id;
    sale.sku = text(product.sku) || sale.sku;
    sale.name = text(product.name) || sale.name;
  }

  const employee = sale.employeeId
    ? (employees || []).find((row) => row.id === sale.employeeId) || matchEmployee(employees, sale)
    : matchEmployee(employees, sale);
  if (employee) {
    sale.employeeId = employee.id;
    sale.employeeName = displayName(employee) || sale.employeeName;
    sale.employeeNumber = text(employee.company?.externalEmployeeNumber) || sale.employeeNumber;
  } else if (sale.employeeName || sale.employeeNumber) {
    if (severity === 'ok') severity = 'review';
    issues.push('Medarbeideren er ikke funnet i Ansatte. Koble personen, eller importer uten kobling.');
  }

  const customer = matchCustomer(customers, {
    customerNumber: sale.customerNumber,
    client: sale.customerName,
  });
  if (customer) {
    sale.customerId = customer.id;
    sale.customerNumber = normalizeCustomerNumber(customer.customerNumber) || sale.customerNumber;
    sale.customerName = text(customer.name) || sale.customerName;
  } else if (sale.customerName || sale.customerNumber) {
    if (severity === 'ok') severity = 'review';
    issues.push('Kunden er ikke koblet til kunderegisteret.');
  }

  const project = matchProject(projects, sale);
  if (project) {
    sale.projectId = project.id;
    sale.projectNumber = text(project.number) || sale.projectNumber;
    sale.projectName = text(project.name) || sale.projectName;
    if (!sale.customerId) applyCustomerFromProject(sale, project, customers);
  } else if (sale.projectNumber || sale.projectName) {
    if (severity === 'ok') severity = 'review';
    issues.push('Prosjektet er ikke funnet. Importer prosjektlisten først, eller koble manuelt.');
  }

  sale.importFingerprint = saleFingerprint(sale);
  const duplicate = Boolean(sale.importFingerprint) && existingFingerprints.has(sale.importFingerprint);
  if (duplicate) {
    severity = 'existing';
    issues.push('Finnes allerede (samme dato, produkt, prosjekt, kunde, antall, pris og tittel) — hoppes over.');
  }

  const title = [sale.date || 'Uten dato', sale.name || sale.title].filter(Boolean).join(' · ');
  const meta = [
    sale.title && sale.title !== sale.name ? sale.title : '',
    sale.customerName,
    sale.projectNumber ? `${sale.projectNumber} ${sale.projectName || ''}`.trim() : sale.projectName,
    sale.employeeName,
  ].filter(Boolean).join(' · ');

  return {
    severity,
    issues,
    title,
    meta,
    sale: severity === 'block' && !sale.date && !(sale.quantity > 0) ? null : sale,
    employeeId: sale.employeeId || '',
    employeeName: sale.employeeName || '',
    employeeNumber: sale.employeeNumber || '',
    projectId: sale.projectId || '',
    projectNumber: sale.projectNumber || '',
    projectName: sale.projectName || '',
    customerId: sale.customerId || '',
    customerNumber: sale.customerNumber || '',
    customerName: sale.customerName || '',
    duplicate,
  };
}

export function planProductSalesImport(existingSales, employees, customers, projects, rows, products = []) {
  const existingFingerprints = collectSaleFingerprints(existingSales);
  const planned = [];
  for (const raw of Array.isArray(rows) ? rows : []) {
    planned.push(companyProductSaleRow(raw, {
      employees,
      customers,
      projects,
      products,
      existingFingerprints,
    }));
  }
  return { rows: planned };
}

function relinkSeverity(row, sale) {
  const issues = [];
  if ((sale.employeeName || sale.employeeNumber) && !sale.employeeId) {
    issues.push('Medarbeideren er ikke funnet i Ansatte. Koble personen, eller importer uten kobling.');
  }
  if ((sale.customerName || sale.customerNumber) && !sale.customerId) {
    issues.push('Kunden er ikke koblet til kunderegisteret.');
  }
  if ((sale.projectNumber || sale.projectName) && !sale.projectId) {
    issues.push('Prosjektet er ikke funnet. Importer prosjektlisten først, eller koble manuelt.');
  }
  let severity = issues.length ? 'review' : 'ok';
  if (row.duplicate) severity = 'existing';
  if (!sale.date || !(sale.quantity > 0) || !sale.name) severity = 'block';
  return { severity, issues: severity === 'block' ? (row.issues || issues) : issues };
}

export function linkSaleImportRowEmployee(row, employee) {
  if (!row?.sale || row.severity === 'existing' || row.severity === 'block' || !employee?.id) return row;
  const sale = {
    ...row.sale,
    employeeId: employee.id,
    employeeName: displayName(employee) || row.employeeName,
    employeeNumber: text(employee.company?.externalEmployeeNumber) || row.employeeNumber,
  };
  sale.importFingerprint = saleFingerprint(sale);
  const next = relinkSeverity(row, sale);
  return {
    ...row,
    ...next,
    sale,
    employeeId: sale.employeeId,
    employeeName: sale.employeeName,
    employeeNumber: sale.employeeNumber,
    linkedManually: true,
  };
}

export function linkSaleImportPlanEmployee(plan, rowIndex, employee, { applyGroup = true } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const target = rows[rowIndex];
  if (!target || !employee?.id) return plan;
  const key = fold(target.employeeName) || fold(target.employeeNumber);
  return {
    ...plan,
    rows: rows.map((row, index) => {
      if (index === rowIndex) return linkSaleImportRowEmployee(row, employee);
      if (applyGroup && key && !row.employeeId && (fold(row.employeeName) === key || fold(row.employeeNumber) === key)) {
        return linkSaleImportRowEmployee(row, employee);
      }
      return row;
    }),
  };
}

export function linkSaleImportRowProject(row, project, customers = []) {
  if (!row?.sale || row.severity === 'existing' || row.severity === 'block' || !project?.id) return row;
  const sale = {
    ...row.sale,
    projectId: project.id,
    projectNumber: text(project.number) || row.projectNumber,
    projectName: text(project.name) || row.projectName,
  };
  if (!sale.customerId) applyCustomerFromProject(sale, project, customers);
  sale.importFingerprint = saleFingerprint(sale);
  const next = relinkSeverity(row, sale);
  return {
    ...row,
    ...next,
    sale,
    projectId: sale.projectId,
    projectNumber: sale.projectNumber,
    projectName: sale.projectName,
    customerId: sale.customerId || row.customerId || '',
    customerNumber: sale.customerNumber || row.customerNumber || '',
    customerName: sale.customerName || row.customerName || '',
  };
}

export function linkSaleImportPlanProject(plan, rowIndex, project, { applyGroup = true, customers = [] } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const target = rows[rowIndex];
  if (!target || !project?.id) return plan;
  const key = normalizeProjectNumber(target.projectNumber);
  return {
    ...plan,
    rows: rows.map((row, index) => {
      if (index === rowIndex) return linkSaleImportRowProject(row, project, customers);
      if (
        applyGroup
        && key
        && normalizeProjectNumber(row.projectNumber) === key
        && !row.projectId
        && row.severity !== 'block'
        && row.severity !== 'existing'
      ) {
        return linkSaleImportRowProject(row, project, customers);
      }
      return row;
    }),
  };
}

export function linkSaleImportRowCustomer(row, customer) {
  if (!row?.sale || row.severity === 'existing' || row.severity === 'block' || !customer?.id) return row;
  const sale = {
    ...row.sale,
    customerId: customer.id,
    customerNumber: normalizeCustomerNumber(customer.customerNumber) || row.customerNumber,
    customerName: text(customer.name) || row.customerName,
  };
  sale.importFingerprint = saleFingerprint(sale);
  const next = relinkSeverity(row, sale);
  return {
    ...row,
    ...next,
    sale,
    customerId: sale.customerId,
    customerNumber: sale.customerNumber,
    customerName: sale.customerName,
  };
}

export function linkSaleImportPlanCustomer(plan, rowIndex, customer, { applyGroup = true } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const target = rows[rowIndex];
  if (!target || !customer?.id) return plan;
  const key = customerIdentityKey({
    customerNumber: target.customerNumber,
    client: target.customerName,
  });
  return {
    ...plan,
    rows: rows.map((row, index) => {
      if (index === rowIndex) return linkSaleImportRowCustomer(row, customer);
      if (
        applyGroup
        && key
        && !row.customerId
        && customerIdentityKey({ customerNumber: row.customerNumber, client: row.customerName }) === key
      ) {
        return linkSaleImportRowCustomer(row, customer);
      }
      return row;
    }),
  };
}

export async function readProductSalesTable(bytes, filename = '') {
  const tables = await readSpreadsheetTables(bytes, filename);
  let best = null;
  for (const sheet of tables || []) {
    const table = sheet?.table || [];
    const index = headerIndex(table);
    if (index < 0) continue;
    const rank = (table[index] || []).filter((cell) => productSaleColumnField(cell)).length;
    if (!best || rank > best.rank) best = { table, index, rank };
  }
  if (!best) {
    throw new Error('Fant ingen produktsalg. Filen trenger kolonner som Dato, Produkt og Antall.');
  }
  const headerCells = best.table[best.index] || [];
  const fields = headerCells.map((cell) => productSaleColumnField(cell));
  if (!fields.includes('product') && !fields.includes('title')) {
    throw new Error('Listen mangler kolonne for produkt eller tittel.');
  }
  const importedAt = new Date().toISOString();
  const rows = [];
  for (const cells of best.table.slice(best.index + 1)) {
    const mapped = { _filename: filename, _importedAt: importedAt };
    const sourceValues = {};
    headerCells.forEach((header, index) => {
      const label = text(header);
      const value = text(cells?.[index]);
      if (label) sourceValues[label] = value;
      const field = fields[index];
      if (!field || value === '') return;
      if (!mapped[field]) mapped[field] = value;
    });
    mapped._sourceValues = sourceValues;
    if (looksLikeSaleRow(mapped) && !looksLikeTotalRow(mapped)) rows.push(mapped);
  }
  if (!rows.length) throw new Error('Listen har ingen produktsalg.');
  return rows;
}

function includedIndexes(indexes, dropped) {
  return (indexes || []).filter((index) => !dropped.has(String(index)));
}

export function saleRowReady(row, index, dropped) {
  if (!row || row.severity === 'block' || row.severity === 'existing' || !row.sale) return false;
  if (dropped?.has?.(String(index))) return false;
  const sale = row.sale;
  if (!sale.date || !sale.name || !(sale.quantity > 0)) return false;
  if ((sale.projectNumber || sale.projectName) && !sale.projectId) return false;
  if ((sale.customerNumber || sale.customerName) && !sale.customerId) return false;
  return true;
}

export function buildProductSalesImportReview(plan, { dropped = new Set() } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const okIndexes = [];
  const blockIndexes = [];
  const existingIndexes = [];
  const reviewGroups = new Map();

  rows.forEach((row, index) => {
    if (row.severity === 'block') {
      blockIndexes.push(index);
      return;
    }
    if (row.severity === 'existing') {
      existingIndexes.push(index);
      return;
    }
    if (row.severity === 'review') {
      const issueKey = (row.issues || []).slice().sort().join(' | ') || 'Avvik';
      if (!reviewGroups.has(issueKey)) {
        reviewGroups.set(issueKey, {
          id: `review:${fold(issueKey).slice(0, 80)}`,
          severity: 'review',
          included: true,
          title: row.title,
          meta: row.meta,
          issues: row.issues || [],
          indexes: [],
          sampleTitles: [],
          needsEmployee: false,
          needsProject: false,
          needsCustomer: false,
          employeeName: row.employeeName || '',
          employeeNumber: row.employeeNumber || '',
          projectNumber: row.projectNumber || '',
          projectName: row.projectName || '',
          customerName: row.customerName || '',
          customerNumber: row.customerNumber || '',
          rowIndex: index,
        });
      }
      const group = reviewGroups.get(issueKey);
      group.indexes.push(index);
      if (group.sampleTitles.length < 4) group.sampleTitles.push(row.title);
      group.needsEmployee = group.needsEmployee || ((row.sale?.employeeName || row.sale?.employeeNumber) && !row.employeeId);
      group.needsProject = group.needsProject || ((row.sale?.projectNumber || row.sale?.projectName) && !row.projectId);
      group.needsCustomer = group.needsCustomer || ((row.sale?.customerNumber || row.sale?.customerName) && !row.customerId);
      if (dropped.has(String(index))) group.included = false;
      return;
    }
    okIndexes.push(index);
  });

  const cards = [];
  if (blockIndexes.length) {
    cards.push({
      id: 'block-group',
      severity: 'block',
      included: false,
      locked: true,
      count: blockIndexes.length,
      title: blockIndexes.length === 1 ? (rows[blockIndexes[0]]?.title || 'Ugyldig rad') : `${blockIndexes.length} rader blir ikke importert`,
      meta: '',
      issues: [rows[blockIndexes[0]]?.issues?.[0] || 'Kan ikke importeres.'],
      indexes: blockIndexes,
      rowIndex: blockIndexes[0],
    });
  }
  if (existingIndexes.length) {
    cards.push({
      id: 'existing-group',
      severity: 'existing',
      included: false,
      locked: true,
      count: existingIndexes.length,
      title: existingIndexes.length === 1 ? (rows[existingIndexes[0]]?.title || 'Duplikat') : `${existingIndexes.length} duplikater hoppes over`,
      meta: '',
      issues: [rows[existingIndexes[0]]?.issues?.[0] || 'Finnes allerede.'],
      indexes: existingIndexes,
      rowIndex: existingIndexes[0],
    });
  }

  const reviewCards = [...reviewGroups.values()].map((group) => ({
    ...group,
    count: group.indexes.length,
    included: includedIndexes(group.indexes, dropped).length > 0,
    title: group.indexes.length === 1 ? group.title : `${group.indexes.length} salg med samme avvik`,
    meta: group.sampleTitles.join(', '),
  }));
  cards.push(...reviewCards);

  const okRows = okIndexes.map((index) => {
    const row = rows[index];
    const sale = row?.sale || {};
    return {
      id: String(index),
      index,
      included: !dropped.has(String(index)),
      title: sale.title || row.title,
      date: sale.date || '',
      name: sale.name || '',
      sku: sale.sku || '',
      quantity: sale.quantity,
      customerName: sale.customerName || '',
      projectNumber: sale.projectNumber || '',
      projectName: sale.projectName || '',
      employeeName: sale.employeeName || '',
      amountInclVat: sale.amountInclVat,
      status: sale.status || '',
    };
  });

  if (okIndexes.length) {
    cards.push({
      id: 'ok-group',
      severity: 'ok',
      included: includedIndexes(okIndexes, dropped).length > 0,
      count: includedIndexes(okIndexes, dropped).length,
      title: `${okIndexes.length} salg klare uten avvik`,
      meta: '',
      issues: [],
      indexes: okIndexes,
      list: true,
    });
  }

  let readyCount = 0;
  rows.forEach((row, index) => {
    if (saleRowReady(row, index, dropped)) readyCount += 1;
  });

  return {
    cards,
    okRows,
    reviewCards,
    existingCount: existingIndexes.length,
    blockCount: blockIndexes.length,
    readyCount,
  };
}

export function toggleProductSaleReviewRow(dropped, reviewRow) {
  const next = new Set(dropped);
  const indexes = reviewRow?.indexes || [];
  if (reviewRow?.id && /^\d+$/.test(reviewRow.id)) indexes.push(Number(reviewRow.id));
  const unique = [...new Set(indexes.map(Number).filter(Number.isFinite))];
  if (!unique.length) return next;
  const allDropped = unique.every((index) => next.has(String(index)));
  for (const index of unique) {
    const id = String(index);
    if (allDropped) next.delete(id);
    else next.add(id);
  }
  return next;
}

/**
 * Lagrer salg og oppretter manglende produkter i katalogen.
 * Lagerbeholdning røres ikke: historiske linjer er allerede levert.
 * Medarbeider med prosjekt legges inn som deltaker når begge er koblet.
 */
export function importProductSales(state, drafts = []) {
  const list = Array.isArray(drafts) ? drafts : [];
  if (!list.length) return { ok: true, error: null, state, added: [], skipped: [], productsAdded: [] };
  let working = state && typeof state === 'object' ? state : { products: [], sales: [], members: [] };
  if (!Array.isArray(working.members)) working = { ...working, members: [] };
  if (!Array.isArray(working.products)) working = { ...working, products: [] };
  if (!Array.isArray(working.sales)) working = { ...working, sales: [] };
  const existingFingerprints = collectSaleFingerprints(working.sales);
  const added = [];
  const skipped = [];
  const productsAdded = [];
  const now = new Date().toISOString();

  for (const draft of list) {
    const saleInput = draft?.sale && typeof draft.sale === 'object' ? draft.sale : draft;
    const fingerprint = saleFingerprint(saleInput) || text(saleInput.importFingerprint);
    if (!saleInput?.name || !saleInput?.date || !(Number(saleInput.quantity) > 0)) {
      skipped.push({ reason: 'Mangler produkt, dato eller antall.', draft: saleInput });
      continue;
    }
    if (fingerprint && existingFingerprints.has(fingerprint)) {
      skipped.push({ reason: 'Duplikat mot eksisterende produktsalg', draft: saleInput });
      continue;
    }
    let product = matchCatalogProduct(working.products, saleInput);
    if (!product) {
      const created = upsertProduct(working, emptyProduct({
        name: saleInput.name,
        sku: saleInput.sku,
        priceExVat: saleInput.unitPrice,
        vatCode: saleInput.vatCode || 'HIGH',
        account: saleInput.account || '',
        unit: saleInput.unit || 'stk',
        kind: String(saleInput.account || '').startsWith('3') ? 'service' : 'other',
        trackStock: false,
      }));
      if (created.ok) {
        working = created.state;
        product = created.product;
        productsAdded.push(product);
      }
    }
    const row = normalizeSale({
      ...saleInput,
      id: createId('sal'),
      productId: product?.id || saleInput.productId || '',
      sku: text(product?.sku) || saleInput.sku,
      name: text(product?.name) || saleInput.name,
      importFingerprint: fingerprint,
      createdAt: now,
      updatedAt: now,
    });
    working = { ...working, sales: [row, ...(working.sales || [])] };
    added.push(row);
    if (row.employeeId && row.projectId) {
      const member = addProjectMember(working, {
        projectId: row.projectId,
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        role: 'Prosjektmedlem',
      });
      if (member.ok) working = member.state;
    }
  }

  return {
    ok: true,
    error: null,
    state: working,
    added,
    skipped,
    productsAdded,
  };
}

export const PRODUCT_SALES_IMPORT_ACCEPT = CUSTOMER_IMPORT_ACCEPT;
