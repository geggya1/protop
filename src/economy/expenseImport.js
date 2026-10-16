/**
 * Import av prosjektutlegg fra Excel/CSV (f.eks. Moment «overview»).
 * Kobler mot medarbeider, kunde og prosjekt, og hopper over rader
 * som allerede finnes (samme fingerprint).
 */
import { readSpreadsheetTables, CUSTOMER_IMPORT_ACCEPT } from '../anbud/customerImport.js';
import { normalizeCustomerNumber, normalizeOrgnr } from '../anbud/customers.js';
import { displayName } from '../employees/model.js';
import { roundMoney } from './vat.js';
import {
  fold,
  formatMoney,
  parseDate,
  parseMoney,
  text,
} from './invoices.js';
import {
  applyCustomerFromProject,
  matchEmployee,
  normalizeEmployeeNumber,
  parseBillableFlag,
} from './hoursImport.js';
import {
  matchCustomer,
  matchProject,
  normalizeProjectNumber,
} from './invoiceImport.js';

export const EXPENSE_IMPORT_ACCEPT = CUSTOMER_IMPORT_ACCEPT;

const FIELD_ALIASES = [
  ['date', ['dato', 'date', 'utleggsdato', 'expensedate']],
  ['createdDate', ['opprettetdato', 'createddate', 'registrertdato']],
  ['title', ['navn', 'name', 'utleggsnavn', 'expensename', 'tittel']],
  ['period', ['periode', 'period']],
  ['vatRate', ['mva', 'mvaprosent', 'vat', 'vatrate', 'moms']],
  ['customerNumber', ['kundenummer', 'kundenr', 'customernumber', 'customerno']],
  ['customerName', ['kundenavn', 'kunde', 'customer', 'customername']],
  ['orgnr', ['orgnr', 'org.nr', 'organisasjonsnummer']],
  ['projectNumber', ['prosjektnummer', 'prosjektnr', 'projectnumber', 'projectno']],
  ['projectName', ['prosjekt', 'prosjektnavn', 'project', 'projectname']],
  ['activityName', ['aktivitet', 'aktivitetsnavn', 'activity', 'activityname']],
  ['voucherNumber', ['bilagsnr', 'bilagsnummer', 'vouchernumber', 'voucher']],
  ['externalId', ['bilagsid', 'voucherid', 'recordid', 'linjeid', 'utleggsid']],
  ['employeeNumber', ['ansattnummer', 'ansattnr', 'employeenumber']],
  ['employeeName', ['medarbeider', 'ansatt', 'ansattnavn', 'employee', 'employeename', 'ressurs']],
  ['attachmentNames', ['vedlegg', 'attachments', 'kvittering']],
  ['vendor', ['leverandor', 'leverandør', 'supplier', 'vendor']],
  ['supplierNumber', ['leverandornr', 'leverandørnr', 'suppliernumber', 'supplierno']],
  ['supplierInvoice', ['leverandorsfakturanr', 'leverandørsfakturanr', 'supplierinvoicenumber']],
  ['category', ['kategori', 'category']],
  ['accountLabel', ['regnskapskonto', 'konto', 'account']],
  ['description', ['beskrivelse', 'description', 'tekst', 'kommentar']],
  ['billable', ['fakturerbar', 'billable']],
  ['includedInTotal', ['inkludertitotalprisen', 'includedintotal']],
  ['invoiceStatus', ['fakturert', 'invoiced', 'faktureringsstatus']],
  ['externalInvoiceNumber', ['faktura', 'fakturanr', 'fakturanummer', 'invoicenumber']],
  ['quantity', ['antall', 'quantity', 'qty']],
  ['discount', ['rabatt', 'discount']],
  ['markup', ['paslag', 'påslag', 'markup', 'markuppercent']],
  ['markupAmount', ['paslagsbelop', 'påslagsbeløp', 'markupamount']],
  ['currency', ['valuta', 'currency']],
  ['unitPrice', ['enhetspris', 'unitprice', 'pris']],
  ['amountExVat', [
    'totalteksmva', 'totaltseksmva', 'totaltseks.mva', 'amountexvat',
    'belopeksmva', 'sumeksmva',
  ]],
  ['amountInclVat', [
    'totaltinkmva', 'totaltink.mva', 'amountinclvat', 'belopinkmva', 'suminkmva',
  ]],
];

export function expenseColumnField(header) {
  const key = fold(header);
  if (!key) return '';
  if (key.includes('prosjektvaluta') || key.includes('selskapsvaluta') || key.includes('valutakurs')) return '';
  if (key.includes('utsettel') || key.includes('postpone')) return '';
  if (key.includes('vispaslag') || key.includes('vispåslag')) return '';
  if (key === 'prisuteksmva') return '';
  for (const [field, aliases] of FIELD_ALIASES) {
    if (aliases.some((alias) => fold(alias) === key)) return field;
  }
  if (key.includes('kundenummer') || (key.includes('kunde') && key.includes('nr'))) return 'customerNumber';
  if (key.includes('prosjektnummer') || (key.includes('prosjekt') && (key.includes('nr') || key.includes('nummer')))) {
    return 'projectNumber';
  }
  if (key.includes('bilagsid')) return 'externalId';
  if (key.includes('bilagsnr')) return 'voucherNumber';
  if (key.includes('medarbeider') || key.includes('ansattnavn')) return 'employeeName';
  if (key.includes('totalt') && key.includes('ink') && key.includes('mva')) return 'amountInclVat';
  if (key.includes('totalt') && key.includes('eks') && key.includes('mva')) return 'amountExVat';
  if (key.includes('enhetspris')) return 'unitPrice';
  if (key.includes('regnskapskonto')) return 'accountLabel';
  if (key.includes('leverandor') && key.includes('faktura')) return 'supplierInvoice';
  return '';
}

function headerIndex(table) {
  let best = -1;
  let score = 0;
  for (let index = 0; index < Math.min(table.length, 15); index += 1) {
    const rank = (table[index] || []).filter((cell) => expenseColumnField(cell)).length;
    if (rank > score) {
      score = rank;
      best = index;
    }
  }
  return score >= 3 ? best : -1;
}

function markupPercent(value) {
  const n = parseMoney(value);
  if (n == null || n === 0) return 0;
  if (n > 0 && n <= 1) return roundMoney(n * 100);
  return Math.max(0, n);
}

export function expenseVatCode(value) {
  const n = parseMoney(value);
  if (n == null || n === '') return 'HIGH';
  const percent = n > 0 && n <= 1 ? n * 100 : n;
  if (percent >= 20) return 'HIGH';
  if (percent >= 14) return 'MID';
  if (percent >= 10) return 'LOW';
  if (percent === 0) return 'ZERO';
  return 'HIGH';
}

export function expenseImportStatus(value) {
  const key = fold(value);
  if (!key) return 'submitted';
  if (key.includes('fakturert') || key === 'invoiced') return 'invoiced';
  if (key.includes('utbetalt') || key === 'reimbursed') return 'reimbursed';
  if (key.includes('avvist') || key === 'rejected') return 'rejected';
  if (key.includes('ikkegodkjent') || key.includes('sendt') || key === 'submitted') return 'submitted';
  if (key.includes('godkjent') || key === 'approved') return 'approved';
  if (key.includes('utkast') || key === 'draft') return 'draft';
  return 'submitted';
}

function categoryFromBlob(blob) {
  if (!blob) return '';
  if (blob.includes('parkering')) return 'parking';
  if (blob.includes('bompenge')) return 'toll';
  if (blob.includes('reise') || blob.includes('kilometer') || blob.includes('hotell') || blob.includes('fly')) {
    return 'travel';
  }
  if (blob.includes('representasjon')) return 'representation';
  if (blob.includes('verktoy') || blob.includes('utstyr')) return 'tools';
  if (blob.includes('materiell') || blob.includes('innsats')) return 'materials';
  if (blob.includes('kontor')) return 'office';
  return '';
}

export function expenseImportCategory(mapped = {}) {
  return categoryFromBlob(fold(mapped.category))
    || categoryFromBlob(fold(mapped.accountLabel))
    || categoryFromBlob(fold([mapped.title, mapped.description].filter(Boolean).join(' ')))
    || 'other';
}

export function expensePersonKey(row = {}) {
  return text(row.employeeId) || text(row.employeeNumber) || fold(row.employeeName) || 'uten-ansatt';
}

export function expenseFingerprint(row = {}) {
  const date = parseDate(row.date) || text(row.date);
  const person = expensePersonKey(row);
  const project = text(row.projectNumber) || fold(row.projectName);
  const amount = String(roundMoney(row.amountExVat || row.amountInclVat || 0));
  const title = fold(row.purpose || row.title);
  const description = fold(row.description);
  const externalId = text(row.externalId || row.voucherNumber);
  if (!date || amount === '0' || amount === '-0') return '';
  return [date, person, project, amount, title, description, externalId].join('|');
}

export function collectExpenseFingerprints(rows) {
  const keys = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = text(row?.importFingerprint) || expenseFingerprint(row);
    if (key) keys.add(key);
  }
  return keys;
}

function looksLikeTotalRow(mapped) {
  const blob = fold([mapped.date, mapped.title, mapped.description, mapped.employeeName, mapped.projectName].join(' '));
  return blob === 'totalt' || blob === 'sum' || blob === 'total' || blob.startsWith('totalt');
}

function amountFromMapped(mapped) {
  const quantity = parseMoney(mapped.quantity);
  const unit = parseMoney(mapped.unitPrice);
  const ex = parseMoney(mapped.amountExVat);
  const incl = parseMoney(mapped.amountInclVat);
  const qty = quantity != null && quantity > 0 ? quantity : 1;
  const fromUnit = unit != null ? roundMoney(unit * qty) : null;
  return {
    quantity: qty,
    unitPrice: unit || 0,
    amountExVat: ex != null && ex !== 0 ? ex : (fromUnit || 0),
    amountInclVat: incl != null && incl !== 0 ? incl : 0,
  };
}

export function expenseEntryFromMappedRow(mapped, meta = {}) {
  const amounts = amountFromMapped(mapped);
  const description = text(mapped.description) || text(mapped.title);
  const purpose = text(mapped.title) && text(mapped.title) !== description ? text(mapped.title) : '';
  const billable = parseBillableFlag(mapped.billable);
  const draft = {
    date: parseDate(mapped.date) || parseDate(mapped.createdDate) || text(mapped.date),
    employeeNumber: normalizeEmployeeNumber(mapped.employeeNumber),
    employeeName: text(mapped.employeeName),
    employeeId: text(mapped.employeeId),
    customerNumber: normalizeCustomerNumber(mapped.customerNumber) || text(mapped.customerNumber),
    customerName: text(mapped.customerName),
    orgnr: normalizeOrgnr(mapped.orgnr) || text(mapped.orgnr),
    customerId: text(mapped.customerId),
    projectNumber: normalizeProjectNumber(mapped.projectNumber),
    projectName: text(mapped.projectName),
    projectId: text(mapped.projectId),
    activityName: text(mapped.activityName),
    category: expenseImportCategory(mapped),
    description,
    purpose,
    vendor: text(mapped.vendor),
    currency: text(mapped.currency) || 'NOK',
    vatCode: expenseVatCode(mapped.vatRate),
    ...amounts,
    markupPercent: markupPercent(mapped.markup),
    billable: billable !== false,
    status: expenseImportStatus(mapped.invoiceStatus),
    externalId: text(mapped.externalId),
    voucherNumber: text(mapped.voucherNumber),
    externalInvoiceNumber: text(mapped.externalInvoiceNumber),
    period: text(mapped.period),
    supplierNumber: text(mapped.supplierNumber),
    supplierInvoice: text(mapped.supplierInvoice),
    accountLabel: text(mapped.accountLabel),
    attachmentNames: text(mapped.attachmentNames),
    paidBy: text(mapped.employeeName) ? 'personal' : 'company',
    externalStore: true,
    storage: 'projectExpenses',
    source: {
      filename: text(meta.filename),
      importedAt: text(meta.importedAt) || new Date().toISOString(),
    },
  };
  draft.importFingerprint = expenseFingerprint(draft);
  return draft;
}

export function companyExpenseRow(input, {
  employees = [],
  customers = [],
  projects = [],
  existingFingerprints = new Set(),
} = {}) {
  const mapped = input && typeof input === 'object' ? input : {};
  const entry = expenseEntryFromMappedRow(mapped, {
    filename: mapped._filename,
    importedAt: mapped._importedAt,
  });
  const issues = [];
  let severity = 'ok';

  if (looksLikeTotalRow(mapped)) {
    return {
      severity: 'block',
      issues: ['Ser ut som summeringsrad.'],
      title: 'Summeringsrad',
      meta: '',
      entry: null,
      duplicate: false,
    };
  }
  if (!entry.date) {
    severity = 'block';
    issues.push('Dato mangler — raden blir ikke importert.');
  }
  if (!(Math.abs(entry.amountExVat) > 0) && !(Math.abs(entry.amountInclVat) > 0)) {
    severity = 'block';
    issues.push('Beløp mangler — raden blir ikke importert.');
  }
  if (!entry.description && !entry.purpose) {
    severity = 'block';
    issues.push('Beskrivelse mangler — raden blir ikke importert.');
  }

  const employee = entry.employeeName || entry.employeeNumber
    ? matchEmployee(employees, entry)
    : null;
  if (employee) {
    entry.employeeId = employee.id;
    entry.employeeName = displayName(employee) || entry.employeeName;
    entry.employeeNumber = text(employee.company?.externalEmployeeNumber) || entry.employeeNumber;
    entry.paidBy = 'personal';
  } else if (entry.employeeName || entry.employeeNumber) {
    if (severity === 'ok') severity = 'review';
    issues.push('Medarbeideren er ikke funnet i Ansatte. Koble manuelt, eller importer raden uten kobling.');
  }

  const customer = matchCustomer(customers, {
    customerNumber: entry.customerNumber,
    orgnr: entry.orgnr,
    client: entry.customerName,
  });
  if (customer) {
    entry.customerId = customer.id;
    entry.customerNumber = normalizeCustomerNumber(customer.customerNumber) || entry.customerNumber;
    entry.customerName = text(customer.name) || entry.customerName;
    entry.orgnr = normalizeOrgnr(customer.orgnr) || entry.orgnr;
  } else if (entry.customerName || entry.customerNumber) {
    if (severity === 'ok') severity = 'review';
    issues.push('Kunden er ikke koblet til kunderegisteret. Utlegget lagres med kundenummer og navn fra filen.');
  }

  const project = matchProject(projects, entry);
  if (project) {
    entry.projectId = project.id;
    entry.projectNumber = text(project.number) || entry.projectNumber;
    entry.projectName = text(project.name) || entry.projectName;
    applyCustomerFromProject(entry, project, customers);
  } else if (entry.projectNumber || entry.projectName) {
    if (severity === 'ok') severity = 'review';
    issues.push('Prosjektet er ikke funnet. Utlegget lagres med prosjektnummer og navn fra filen.');
  }

  const fingerprint = expenseFingerprint(entry);
  entry.importFingerprint = fingerprint;
  const duplicate = Boolean(fingerprint) && existingFingerprints.has(fingerprint);
  if (duplicate && severity !== 'block') {
    severity = 'existing';
    issues.push('Finnes allerede (samme dato, person, prosjekt, beløp og beskrivelse) — hoppes over.');
  }

  const title = [
    entry.date || 'Uten dato',
    entry.purpose || entry.description || 'Utlegg',
    entry.employeeName || '',
  ].filter(Boolean).join(' · ');
  const meta = [
    entry.customerName,
    entry.projectNumber && entry.projectName
      ? `${entry.projectNumber} ${entry.projectName}`
      : (entry.projectName || entry.projectNumber),
    formatMoney(entry.amountInclVat || entry.amountExVat),
  ].filter(Boolean).join(' · ');

  return {
    severity,
    issues,
    title,
    meta,
    entry,
    employeeId: entry.employeeId,
    employeeName: entry.employeeName,
    employeeNumber: entry.employeeNumber,
    projectId: entry.projectId,
    projectNumber: entry.projectNumber,
    projectName: entry.projectName,
    customerId: entry.customerId,
    customerNumber: entry.customerNumber,
    customerName: entry.customerName,
    duplicate,
  };
}

export function planExpenseImport(existingExpenses, employees, customers, projects, rows) {
  const existingFingerprints = collectExpenseFingerprints(existingExpenses);
  const planned = (Array.isArray(rows) ? rows : []).map((raw) => companyExpenseRow(raw, {
    employees,
    customers,
    projects,
    existingFingerprints,
  }));
  return { rows: planned, existingFingerprints: [...existingFingerprints] };
}

function refreshLinked(row, existingFingerprints) {
  if (!row?.entry || row.severity === 'block') return row;
  const fingerprint = expenseFingerprint(row.entry);
  row.entry.importFingerprint = fingerprint;
  const duplicate = Boolean(fingerprint) && existingFingerprints.has(fingerprint);
  const issues = (row.issues || []).filter((issue) => !/finnes allerede/i.test(issue));
  let severity = issues.length ? 'review' : 'ok';
  if (duplicate) {
    severity = 'existing';
    issues.push('Finnes allerede (samme dato, person, prosjekt, beløp og beskrivelse) — hoppes over.');
  }
  return { ...row, severity, issues, duplicate, entry: row.entry };
}

export function linkExpenseImportRowEmployee(row, employee, existingFingerprints = new Set()) {
  if (!row?.entry || row.severity === 'existing' || !employee?.id) return row;
  const issues = (row.issues || []).filter((issue) => !/medarbeider|ansatt/i.test(issue));
  const entry = {
    ...row.entry,
    employeeId: employee.id,
    employeeName: displayName(employee) || row.employeeName,
    employeeNumber: text(employee.company?.externalEmployeeNumber) || row.employeeNumber,
    paidBy: 'personal',
  };
  return refreshLinked({
    ...row,
    issues,
    entry,
    employeeId: entry.employeeId,
    employeeName: entry.employeeName,
    employeeNumber: entry.employeeNumber,
  }, existingFingerprints);
}

export function linkExpenseImportPlanEmployee(plan, rowIndex, employee, { applyGroup = true } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const target = rows[rowIndex];
  if (!target || !employee?.id) return plan;
  const keys = new Set(plan.existingFingerprints || []);
  const key = fold(target.employeeName) || fold(target.employeeNumber);
  const nextRows = rows.map((row, index) => {
    if (index === rowIndex) return linkExpenseImportRowEmployee(row, employee, keys);
    if (applyGroup && key && !row.employeeId && fold(row.employeeName) === key) {
      return linkExpenseImportRowEmployee(row, employee, keys);
    }
    return row;
  });
  return { ...plan, rows: nextRows };
}

export function linkExpenseImportRowProject(row, project, customers = [], existingFingerprints = new Set()) {
  if (!row?.entry || row.severity === 'existing' || !project?.id) return row;
  const issues = (row.issues || []).filter((issue) => !/prosjekt/i.test(issue));
  const entry = {
    ...row.entry,
    projectId: project.id,
    projectNumber: text(project.number) || row.projectNumber,
    projectName: text(project.name) || row.projectName,
  };
  applyCustomerFromProject(entry, project, customers);
  const nextIssues = entry.customerId ? issues.filter((issue) => !/kunde/i.test(issue)) : issues;
  return refreshLinked({
    ...row,
    issues: nextIssues,
    entry,
    projectId: entry.projectId,
    projectNumber: entry.projectNumber,
    projectName: entry.projectName,
    customerId: entry.customerId,
    customerNumber: entry.customerNumber,
    customerName: entry.customerName,
  }, existingFingerprints);
}

export function linkExpenseImportPlanProject(plan, rowIndex, project, { applyGroup = true, customers = [] } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const target = rows[rowIndex];
  if (!target || !project?.id) return plan;
  const keys = new Set(plan.existingFingerprints || []);
  const key = normalizeProjectNumber(target.projectNumber);
  const nextRows = rows.map((row, index) => {
    if (index === rowIndex) return linkExpenseImportRowProject(row, project, customers, keys);
    if (
      applyGroup
      && key
      && normalizeProjectNumber(row.projectNumber) === key
      && !row.projectId
      && row.severity !== 'block'
      && row.severity !== 'existing'
    ) {
      return linkExpenseImportRowProject(row, project, customers, keys);
    }
    return row;
  });
  return { ...plan, rows: nextRows };
}

export function linkExpenseImportRowCustomer(row, customer, existingFingerprints = new Set()) {
  if (!row?.entry || row.severity === 'existing' || !customer?.id) return row;
  const issues = (row.issues || []).filter((issue) => !/kunde/i.test(issue));
  const entry = {
    ...row.entry,
    customerId: customer.id,
    customerNumber: normalizeCustomerNumber(customer.customerNumber) || row.customerNumber,
    customerName: text(customer.name) || row.customerName,
  };
  return refreshLinked({
    ...row,
    issues,
    entry,
    customerId: entry.customerId,
    customerNumber: entry.customerNumber,
    customerName: entry.customerName,
  }, existingFingerprints);
}

export function linkExpenseImportPlanCustomer(plan, rowIndex, customer, { applyGroup = true } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const target = rows[rowIndex];
  if (!target || !customer?.id) return plan;
  const keys = new Set(plan.existingFingerprints || []);
  const key = normalizeCustomerNumber(target.customerNumber) || fold(target.customerName);
  const nextRows = rows.map((row, index) => {
    if (index === rowIndex) return linkExpenseImportRowCustomer(row, customer, keys);
    const rowKey = normalizeCustomerNumber(row.customerNumber) || fold(row.customerName);
    if (applyGroup && key && rowKey === key && !row.customerId && row.severity !== 'block' && row.severity !== 'existing') {
      return linkExpenseImportRowCustomer(row, customer, keys);
    }
    return row;
  });
  return { ...plan, rows: nextRows };
}

export async function readExpenseTable(bytes, filename = '') {
  const tables = await readSpreadsheetTables(bytes, filename);
  let best = null;
  for (const sheet of tables || []) {
    const table = sheet?.table || [];
    const index = headerIndex(table);
    if (index < 0) continue;
    const rank = (table[index] || []).filter((cell) => expenseColumnField(cell)).length;
    if (!best || rank > best.rank) best = { table, index, rank };
  }
  if (!best) {
    throw new Error('Fant ingen utleggsliste. Filen trenger kolonner som Dato, Prosjekt og Beløp.');
  }
  const headerCells = best.table[best.index] || [];
  const fields = headerCells.map((cell) => expenseColumnField(cell));
  if (!fields.includes('date') || (!fields.includes('amountExVat') && !fields.includes('amountInclVat') && !fields.includes('unitPrice'))) {
    throw new Error('Listen mangler kolonne for dato eller beløp.');
  }
  const importedAt = new Date().toISOString();
  const rows = [];
  for (const cells of best.table.slice(best.index + 1)) {
    const mapped = { _filename: filename, _importedAt: importedAt };
    let filled = 0;
    headerCells.forEach((header, index) => {
      const value = text(cells?.[index]);
      const field = fields[index];
      if (!field || value === '') return;
      if (!mapped[field]) mapped[field] = value;
      filled += 1;
    });
    if (filled >= 2) rows.push(mapped);
  }
  if (!rows.length) throw new Error('Listen har ingen utlegg.');
  return rows;
}

export async function readExpenseImport(bytes, filename, {
  existingExpenses = [],
  employees = [],
  customers = [],
  projects = [],
} = {}) {
  const rows = await readExpenseTable(bytes, filename);
  return planExpenseImport(existingExpenses, employees, customers, projects, rows);
}

function includedIndexes(indexes, dropped) {
  return (indexes || []).filter((index) => !dropped.has(String(index)));
}

export function buildExpenseImportReview(plan, { dropped = new Set() } = {}) {
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
      group.needsEmployee = group.needsEmployee || (!row.employeeId && !!(row.employeeName || row.employeeNumber));
      group.needsProject = group.needsProject || (!row.projectId && !!(row.projectNumber || row.projectName));
      group.needsCustomer = group.needsCustomer || (!row.customerId && !!(row.customerName || row.customerNumber));
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
      count: blockIndexes.length,
      title: `${blockIndexes.length} rader blir ikke importert`,
      meta: blockIndexes.slice(0, 4).map((index) => rows[index]?.title).filter(Boolean).join(', '),
      issues: [rows[blockIndexes[0]]?.issues?.[0] || 'Kan ikke importeres.'],
      indexes: blockIndexes,
    });
  }
  if (existingIndexes.length) {
    cards.push({
      id: 'existing-group',
      severity: 'existing',
      included: false,
      count: existingIndexes.length,
      title: `${existingIndexes.length} duplikater hoppes over`,
      meta: existingIndexes.slice(0, 4).map((index) => rows[index]?.title).filter(Boolean).join(', '),
      issues: [rows[existingIndexes[0]]?.issues?.[0] || 'Finnes allerede.'],
      indexes: existingIndexes,
    });
  }

  const reviewCards = [...reviewGroups.values()].map((group) => ({
    ...group,
    count: group.indexes.length,
    included: includedIndexes(group.indexes, dropped).length > 0,
    title: group.indexes.length === 1 ? group.title : `${group.indexes.length} utlegg med samme avvik`,
    meta: group.sampleTitles.join(', '),
  }));
  cards.push(...reviewCards);

  const okRows = okIndexes.map((index) => {
    const row = rows[index];
    const entry = row?.entry || {};
    return {
      id: String(index),
      index,
      included: !dropped.has(String(index)),
      date: entry.date || '',
      employeeName: entry.employeeName || '',
      customerName: entry.customerName || '',
      projectNumber: entry.projectNumber || '',
      projectName: entry.projectName || '',
      description: entry.purpose || entry.description || '',
      amountInclVat: entry.amountInclVat || entry.amountExVat,
      status: entry.status || '',
    };
  });

  if (okIndexes.length) {
    cards.push({
      id: 'ok-group',
      severity: 'ok',
      included: includedIndexes(okIndexes, dropped).length > 0,
      count: includedIndexes(okIndexes, dropped).length,
      title: `${okIndexes.length} utlegg klare uten avvik`,
      issues: [],
      indexes: okIndexes,
    });
  }

  let readyCount = 0;
  rows.forEach((row, index) => {
    if (row.severity === 'block' || row.severity === 'existing' || !row.entry) return;
    if (dropped.has(String(index))) return;
    readyCount += 1;
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

export function toggleExpenseReviewRow(dropped, reviewRow) {
  const next = new Set(dropped);
  const indexes = reviewRow?.indexes
    || (reviewRow?.rowIndex != null ? [reviewRow.rowIndex] : []);
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
