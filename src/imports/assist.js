/**
 * Leser importfiler lokalt, og spør OCR/AI når kolonnene er ukjente eller filen er skannet.
 */
import {
  customerColumnField,
  customersFromTable,
  parseCustomerFile,
  readSpreadsheetTables,
} from '../anbud/customerImport.js';
import {
  employeeColumnField,
  planEmployeeImport,
  previewEmployeeTable,
} from '../employees/import.js';
import {
  invoiceColumnField,
  planInvoiceImport,
  readInvoiceTable,
} from '../economy/invoiceImport.js';
import {
  hourColumnField,
  planHourImport,
  readHourTable,
} from '../economy/hoursImport.js';
import {
  assignmentMap,
  claimAssignments,
  columnsNeedingHelp,
  fileMedia,
  mergeCustomerRows,
  objectsToTable,
  sanitizeOcrRows,
  tablePreview,
  tableToCsv,
} from './interpret.js';

const MAX_BYTES = 8_000_000;

function asBytes(bytes) {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!raw.length) throw new Error('Filen er tom.');
  if (raw.length > MAX_BYTES) throw new Error('Filen er for stor. Del den opp eller eksporter et mindre utdrag.');
  return raw;
}

function headerSlice(table) {
  let best = 0;
  let score = -1;
  for (let index = 0; index < Math.min((table || []).length, 8); index += 1) {
    const cells = (table[index] || []).map((cell) => String(cell || '').trim()).filter(Boolean);
    const letters = cells.filter((cell) => /[a-zæøå]/i.test(cell)).length;
    const rank = letters * 2 + cells.length;
    if (rank > score) {
      score = rank;
      best = index;
    }
  }
  return (table || []).slice(best);
}

async function localCustomers(bytes, filename) {
  let table = null;
  let rows = [];
  try {
    const tables = await readSpreadsheetTables(bytes, filename);
    const richest = [...tables].sort((left, right) => (right.table?.length || 0) - (left.table?.length || 0))[0];
    table = headerSlice(richest?.table || []);
    rows = customersFromTable(table);
  } catch {
    table = null;
  }
  if (!rows.length) {
    const parsed = await parseCustomerFile(bytes, filename).catch(() => []);
    if (parsed.length) return { rows: parsed, table: null };
  }
  return { rows, table };
}

function claimedFrom(table, localField, columns) {
  const headers = table?.[0] || [];
  const preview = tablePreview(table);
  const hinted = assignmentMap(columns, preview.headers);
  const localFields = headers.map((header) => localField(header));
  return claimAssignments(preview.headers, localFields, hinted);
}

export async function readCustomerImport(bytes, filename, { ask, familyId } = {}) {
  const raw = asBytes(bytes);
  const media = fileMedia(raw, filename);
  if (media.kind !== 'table') {
    if (!ask || !familyId) throw new Error('Skannede lister leses med OCR og AI. Åpne selskapet og prøv igjen.');
    const result = await ask({
      mode: 'ocr', kind: 'customers', familyId, filename, media, bytes: raw,
    });
    const clean = sanitizeOcrRows(result, 'customers');
    const table = objectsToTable(clean.rows);
    const assignments = Object.fromEntries((table[0] || []).map((header) => [header, header]));
    const rows = customersFromTable(table, assignments);
    if (!rows.length) throw new Error(result?.summary || 'AI fant ingen kunder i dokumentet.');
    return { rows, engine: result?.engine || 'ocr+gemini', summary: result?.summary || '' };
  }
  const local = await localCustomers(raw, filename);
  const gaps = local.table ? columnsNeedingHelp(local.table, customerColumnField) : [];
  if (!gaps.length || !ask || !familyId) {
    if (!local.rows.length) throw new Error('Fant ingen kunder i filen. Bruk CSV, Excel, PDF eller et bilde av listen.');
    return { rows: local.rows, engine: 'lokal', summary: '' };
  }
  try {
    const preview = tablePreview(local.table);
    const result = await ask({
      mode: 'columns',
      kind: 'customers',
      familyId,
      filename,
      headers: preview.headers,
      samples: preview.samples,
    });
    const claimed = claimedFrom(local.table, customerColumnField, result?.columns);
    const assisted = customersFromTable(local.table, claimed);
    const rows = mergeCustomerRows(local.rows, assisted);
    if (!rows.length) throw new Error('Fant ingen kunder i filen.');
    return { rows, engine: result?.engine || 'gemini', summary: result?.summary || '' };
  } catch (err) {
    if (local.rows.length) return { rows: local.rows, engine: 'lokal', summary: '' };
    throw err;
  }
}

export async function readEmployeeImport(bytes, filename, options = {}, ask) {
  const raw = asBytes(bytes);
  const media = fileMedia(raw, filename);
  const { familyId, ...planOptions } = options;
  if (media.kind !== 'table') {
    if (!ask || !familyId) throw new Error('Skannede lister leses med OCR og AI. Åpne selskapet og prøv igjen.');
    const result = await ask({
      mode: 'ocr', kind: 'employees', familyId, filename, media, bytes: raw,
    });
    const clean = sanitizeOcrRows(result, 'employees');
    const table = objectsToTable(clean.rows);
    if (!table[0]?.length) throw new Error(result?.summary || 'AI fant ingen medarbeidere i dokumentet.');
    const csv = new TextEncoder().encode(tableToCsv(table));
    const columnFields = Object.fromEntries(table[0].map((header) => [header, header]));
    const plan = await planEmployeeImport(csv, 'ocr.csv', { ...planOptions, columnFields });
    return { ...plan, interpretation: { engine: result?.engine || 'ocr+gemini', summary: result?.summary || '' } };
  }
  let plan = null;
  let localError = null;
  try {
    plan = await planEmployeeImport(raw, filename, planOptions);
  } catch (err) {
    localError = err;
  }
  const tables = await readSpreadsheetTables(raw, filename).catch(() => []);
  const table = previewEmployeeTable(tables);
  const gaps = columnsNeedingHelp(table, employeeColumnField);
  if (!gaps.length || !ask || !familyId) {
    if (!plan) throw localError || new Error('Fant ingen medarbeiderliste.');
    return plan;
  }
  try {
    const preview = tablePreview(table);
    const result = await ask({
      mode: 'columns',
      kind: 'employees',
      familyId,
      filename,
      headers: preview.headers,
      samples: preview.samples,
    });
    const claimed = claimedFrom(table, employeeColumnField, result?.columns);
    const next = await planEmployeeImport(raw, filename, { ...planOptions, columnFields: claimed });
    return { ...next, interpretation: { engine: result?.engine || 'gemini', summary: result?.summary || '' } };
  } catch (err) {
    if (plan) return plan;
    throw localError || err;
  }
}

function invoiceHeaderSlice(table) {
  let best = 0;
  let score = -1;
  for (let index = 0; index < Math.min((table || []).length, 8); index += 1) {
    const rank = (table[index] || []).filter((cell) => invoiceColumnField(cell)).length;
    if (rank > score) {
      score = rank;
      best = index;
    }
  }
  return (table || []).slice(best);
}

/**
 * Leser fakturaliste lokalt, og spør OCR/AI ved ukjente kolonner eller skannet PDF/bilde.
 * options: { existingInvoices, customers, projects, familyId }
 */
export async function readInvoiceImport(bytes, filename, options = {}, ask) {
  const raw = asBytes(bytes);
  const media = fileMedia(raw, filename);
  const {
    familyId,
    existingInvoices = [],
    customers = [],
    projects = [],
  } = options;

  if (media.kind !== 'table') {
    if (!ask || !familyId) {
      throw new Error('Skannede fakturaer leses med OCR og AI. Åpne selskapet og prøv igjen — eller bruk Excel.');
    }
    const result = await ask({
      mode: 'ocr', kind: 'invoices', familyId, filename, media, bytes: raw,
    });
    const clean = sanitizeOcrRows(result, 'invoices');
    const table = objectsToTable(clean.rows);
    if (!table[0]?.length) throw new Error(result?.summary || 'AI fant ingen fakturaer i dokumentet.');
    const mapped = [];
    const headers = table[0] || [];
    for (const cells of table.slice(1)) {
      const row = { accounts: {}, _filename: filename, _importedAt: new Date().toISOString(), _sourceValues: {} };
      headers.forEach((header, index) => {
        const value = String(cells?.[index] ?? '').trim();
        const field = invoiceColumnField(header) || header;
        row._sourceValues[header] = value;
        if (field && value) row[field] = value;
      });
      if (row.invoiceNumber || row.customerName) mapped.push(row);
    }
    if (!mapped.length) throw new Error(result?.summary || 'AI fant ingen fakturaer i dokumentet.');
    const plan = planInvoiceImport(existingInvoices, customers, projects, mapped);
    return { ...plan, interpretation: { engine: result?.engine || 'ocr+gemini', summary: result?.summary || '' } };
  }

  let rows = null;
  let localError = null;
  try {
    rows = await readInvoiceTable(raw, filename);
  } catch (err) {
    localError = err;
  }

  const tables = await readSpreadsheetTables(raw, filename).catch(() => []);
  const table = invoiceHeaderSlice(tables[0]?.table || []);
  const gaps = columnsNeedingHelp(table, invoiceColumnField);
  if (!gaps.length || !ask || !familyId) {
    if (!rows?.length) throw localError || new Error('Fant ingen fakturaliste.');
    return planInvoiceImport(existingInvoices, customers, projects, rows);
  }
  try {
    const preview = tablePreview(table);
    const result = await ask({
      mode: 'columns',
      kind: 'invoices',
      familyId,
      filename,
      headers: preview.headers,
      samples: preview.samples,
    });
    const claimed = claimedFrom(table, invoiceColumnField, result?.columns);
    const assisted = await readInvoiceTable(raw, filename, { columnFields: claimed });
    const plan = planInvoiceImport(existingInvoices, customers, projects, assisted);
    return { ...plan, interpretation: { engine: result?.engine || 'gemini', summary: result?.summary || '' } };
  } catch (err) {
    if (rows?.length) return planInvoiceImport(existingInvoices, customers, projects, rows);
    throw localError || err;
  }
}

function hourHeaderSlice(table) {
  let best = 0;
  let score = -1;
  for (let index = 0; index < Math.min((table || []).length, 8); index += 1) {
    const rank = (table[index] || []).filter((cell) => hourColumnField(cell)).length;
    if (rank > score) {
      score = rank;
      best = index;
    }
  }
  return (table || []).slice(best);
}

/**
 * Leser timeliste lokalt, og spør OCR/AI ved ukjente kolonner eller skannet PDF/bilde.
 * options: { existingEntries, employees, customers, projects, familyId }
 */
export async function readHourImport(bytes, filename, options = {}, ask) {
  const raw = asBytes(bytes);
  const media = fileMedia(raw, filename);
  const {
    familyId,
    existingEntries = [],
    employees = [],
    customers = [],
    projects = [],
  } = options;

  if (media.kind !== 'table') {
    if (!ask || !familyId) {
      throw new Error('Skannede timelister leses med OCR og AI. Åpne selskapet og prøv igjen — eller bruk Excel.');
    }
    const result = await ask({
      mode: 'ocr', kind: 'hours', familyId, filename, media, bytes: raw,
    });
    const clean = sanitizeOcrRows(result, 'hours');
    const table = objectsToTable(clean.rows);
    if (!table[0]?.length) throw new Error(result?.summary || 'AI fant ingen timer i dokumentet.');
    const mapped = [];
    const headers = table[0] || [];
    for (const cells of table.slice(1)) {
      const row = { _filename: filename, _importedAt: new Date().toISOString(), _sourceValues: {} };
      headers.forEach((header, index) => {
        const value = String(cells?.[index] ?? '').trim();
        const field = hourColumnField(header) || header;
        row._sourceValues[header] = value;
        if (field && value) row[field] = value;
      });
      if (row.date || row.employeeName || row.hours) mapped.push(row);
    }
    if (!mapped.length) throw new Error(result?.summary || 'AI fant ingen timer i dokumentet.');
    const plan = planHourImport(existingEntries, employees, customers, projects, mapped);
    return { ...plan, interpretation: { engine: result?.engine || 'ocr+gemini', summary: result?.summary || '' } };
  }

  let rows = null;
  let localError = null;
  try {
    rows = await readHourTable(raw, filename);
  } catch (err) {
    localError = err;
  }

  const tables = await readSpreadsheetTables(raw, filename).catch(() => []);
  const table = hourHeaderSlice(tables[0]?.table || []);
  const gaps = columnsNeedingHelp(table, hourColumnField);
  if (!gaps.length || !ask || !familyId) {
    if (!rows?.length) throw localError || new Error('Fant ingen timeliste.');
    return planHourImport(existingEntries, employees, customers, projects, rows);
  }
  try {
    const preview = tablePreview(table);
    const result = await ask({
      mode: 'columns',
      kind: 'hours',
      familyId,
      filename,
      headers: preview.headers,
      samples: preview.samples,
    });
    const claimed = claimedFrom(table, hourColumnField, result?.columns);
    const assisted = await readHourTable(raw, filename, { columnFields: claimed });
    const plan = planHourImport(existingEntries, employees, customers, projects, assisted);
    return { ...plan, interpretation: { engine: result?.engine || 'gemini', summary: result?.summary || '' } };
  } catch (err) {
    if (rows?.length) return planHourImport(existingEntries, employees, customers, projects, rows);
    throw localError || err;
  }
}
