/**
 * Hurtigimport av timer / timeføringer fra Excel/CSV (f.eks. Moment hours).
 * Kobler mot medarbeidere, kunder og prosjekter, sjekker duplikater,
 * og forbereder lagring i prosjektets timeEntries + medlemskap.
 */
import { readSpreadsheetTables, CUSTOMER_IMPORT_ACCEPT } from '../anbud/customerImport.js';
import {
  namesLikelyMatch,
  normalizeCustomerNumber,
  normalizeOrgnr,
} from '../anbud/customers.js';
import { parseHours, roundHours, formatHours } from '../arbeid/hours.js';
import { displayName } from '../employees/model.js';
import { matchCustomer, matchProject, customerIdentityKey } from './invoiceImport.js';
import { parseDate, fold, text } from './invoices.js';

export { matchCustomer, matchProject, customerIdentityKey };

const FIELD_ALIASES = [
  ['date', ['dato', 'date', 'workdate', 'arbeidsdato', 'day']],
  ['employeeNumber', [
    'ansattnummer', 'ansattnr', 'ansattno', 'employeenumber', 'employeeno',
    'externalemployeenumber', 'eksterntansattnummer', 'resourceid', 'userid', 'brukerid',
  ]],
  ['employeeName', [
    'ansatt', 'ansattnavn', 'medarbeider', 'medarbeidernavn', 'resource', 'ressurs',
    'user', 'bruker', 'employee', 'employeename', 'name', 'navn',
  ]],
  ['customerNumber', ['kundenummer', 'kundenr', 'customernumber', 'customerno']],
  ['customerName', ['kundenavn', 'kunde', 'customer', 'client', 'oppdragsgiver']],
  ['orgnr', ['orgnr', 'org.nr', 'organisasjonsnummer', 'orgno']],
  ['projectNumber', ['prosjektnummer', 'prosjektnr', 'projectnumber', 'projectno', 'projectid']],
  ['projectName', ['prosjekt', 'prosjektnavn', 'project', 'projectname']],
  ['activityName', ['aktivitet', 'aktivitetsnavn', 'activity', 'activityname', 'task']],
  ['hours', ['timer', 'hours', 'quantity', 'antall', 'tid', 'time', 'registeredhours']],
  ['billableHours', [
    'fakturerbart', 'fakturerbaretimer', 'billable', 'billablehours',
    'timerfakturerbart', 'hoursbillable',
  ]],
  ['description', ['beskrivelse', 'description', 'tekst', 'kommentar', 'comment', 'note', 'notes']],
  ['internalNote', [
    'internmerknad', 'internkommentar', 'internalnote', 'internalcomment',
    'privatkommentar', 'privatnote',
  ]],
  ['department', ['avdeling', 'department']],
  ['status', ['status', 'godkjent', 'approved', 'approvalstatus']],
  ['rate', ['timepris', 'rate', 'hourlyrate', 'pris', 'enhetspris']],
  ['amount', ['belop', 'beløp', 'amount', 'sum', 'verdi']],
  ['externalId', ['id', 'timeid', 'recordid', 'timerecordid', 'entryid', 'linjeid']],
];

export function hourColumnField(header) {
  const key = fold(header);
  if (!key) return '';
  for (const [field, aliases] of FIELD_ALIASES) {
    if (aliases.some((alias) => fold(alias) === key)) return field;
    if (fold(field) === key) return field;
  }
  if (key.includes('fakturerbar') && key.includes('timer')) return 'billableHours';
  if (key.includes('ansatt') && (key.includes('nr') || key.includes('nummer'))) return 'employeeNumber';
  if (key.includes('prosjekt') && (key.includes('nr') || key.includes('nummer'))) return 'projectNumber';
  if (key.includes('kunde') && (key.includes('nr') || key.includes('nummer'))) return 'customerNumber';
  return '';
}

function headerIndex(table) {
  let best = -1;
  let score = 0;
  for (let index = 0; index < Math.min(table.length, 12); index += 1) {
    const rank = (table[index] || []).filter((cell) => hourColumnField(cell)).length;
    if (rank > score) {
      score = rank;
      best = index;
    }
  }
  return score >= 2 ? best : -1;
}

function normalizeStatus(value) {
  const key = fold(value);
  if (!key) return 'registrert';
  if (['godkjent', 'approved', 'ok', 'ja', 'yes', 'true', '1'].includes(key)) return 'godkjent';
  if (['last', 'locked', 'closed', 'avsluttet'].includes(key)) return 'låst';
  if (['registrert', 'draft', 'pending', 'open'].includes(key)) return 'registrert';
  return 'registrert';
}

/** Stabil nøkkel for å unngå dobbeltføringer ved gjentatt import. */
export function hourFingerprint(row = {}) {
  const parts = [
    parseDate(row.date) || text(row.date),
    text(row.employeeNumber) || fold(row.employeeName),
    text(row.projectNumber) || fold(row.projectName),
    fold(row.activityName),
    String(roundHours(row.hours ?? 0)),
    String(roundHours(row.billableHours == null ? row.hours : row.billableHours)),
    fold(row.description),
    text(row.externalId),
  ];
  return parts.join('|');
}

export function matchEmployee(employees, hint = {}) {
  const list = Array.isArray(employees) ? employees : [];
  const number = text(hint.employeeNumber);
  const name = text(hint.employeeName);
  if (number) {
    const byNumber = list.filter((row) => (
      text(row?.company?.externalEmployeeNumber) === number
    ));
    if (byNumber.length === 1) return byNumber[0];
    if (byNumber.length > 1 && name) {
      const named = byNumber.filter((row) => {
        const label = displayName(row);
        return fold(label) === fold(name) || namesLikelyMatch(label, name);
      });
      if (named.length) return named[0];
    }
    if (byNumber.length) return byNumber[0];
  }
  if (name) {
    const exact = list.filter((row) => fold(displayName(row)) === fold(name));
    if (exact.length === 1) return exact[0];
    const soft = list.filter((row) => namesLikelyMatch(displayName(row), name));
    if (soft.length === 1) return soft[0];
  }
  return null;
}

export function suggestEmployees(employees, hint = {}, limit = 8) {
  const list = Array.isArray(employees) ? employees : [];
  const q = fold(hint.query || hint.employeeName || hint.employeeNumber);
  if (!q) return list.slice(0, limit);
  const scored = list.map((row) => {
    const name = fold(displayName(row));
    const number = fold(row?.company?.externalEmployeeNumber);
    let score = 0;
    if (number && number === q) score += 100;
    if (name === q) score += 80;
    if (name.includes(q) || q.includes(name)) score += 40;
    if (number.includes(q)) score += 30;
    return { row, score };
  }).filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || displayName(left.row).localeCompare(displayName(right.row), 'nb'));
  return scored.slice(0, limit).map((item) => item.row);
}

export function hourEntryFromMappedRow(mapped, originalValues = {}, meta = {}) {
  const date = parseDate(mapped.date) || text(mapped.date);
  const hours = roundHours(parseHours(mapped.hours));
  const billableRaw = mapped.billableHours;
  const billableHours = billableRaw == null || billableRaw === ''
    ? hours
    : roundHours(parseHours(billableRaw));
  const employeeName = text(mapped.employeeName);
  const activityName = text(mapped.activityName) || 'Hovedaktivitet';
  const draft = {
    date,
    employeeNumber: text(mapped.employeeNumber),
    employeeName,
    employeeId: text(mapped.employeeId),
    customerNumber: normalizeCustomerNumber(mapped.customerNumber) || text(mapped.customerNumber),
    customerName: text(mapped.customerName),
    orgnr: normalizeOrgnr(mapped.orgnr) || text(mapped.orgnr),
    customerId: text(mapped.customerId),
    projectNumber: text(mapped.projectNumber),
    projectName: text(mapped.projectName),
    projectId: text(mapped.projectId),
    activityName,
    hours,
    billableHours,
    description: text(mapped.description),
    internalNote: text(mapped.internalNote),
    department: text(mapped.department),
    status: normalizeStatus(mapped.status),
    rate: mapped.rate,
    amount: mapped.amount,
    externalId: text(mapped.externalId),
    source: {
      filename: text(meta.filename),
      importedAt: text(meta.importedAt) || new Date().toISOString(),
      values: originalValues,
    },
  };
  draft.importFingerprint = hourFingerprint(draft);
  return draft;
}

function looksLikeHourRow(mapped) {
  if (parseDate(mapped.date) || text(mapped.date)) return true;
  if (text(mapped.employeeName) || text(mapped.employeeNumber)) return true;
  if (text(mapped.projectNumber) || text(mapped.projectName)) return true;
  if (parseHours(mapped.hours) !== 0) return true;
  return false;
}

function looksLikeTotalRow(mapped) {
  const blob = fold([
    mapped.date, mapped.employeeName, mapped.employeeNumber,
    mapped.projectName, mapped.projectNumber, mapped.description,
  ].join(' '));
  return blob === 'totalt' || blob === 'sum' || blob === 'total' || blob.startsWith('totalt');
}

export function companyHourRow(input, {
  employees = [],
  customers = [],
  projects = [],
  existingFingerprints = new Set(),
  seenInFile = new Set(),
} = {}) {
  const mapped = input && typeof input === 'object' ? input : {};
  const originalValues = mapped._sourceValues && typeof mapped._sourceValues === 'object'
    ? mapped._sourceValues
    : {};
  const entry = hourEntryFromMappedRow(mapped, originalValues, {
    filename: mapped._filename,
    importedAt: mapped._importedAt,
  });
  const issues = [];
  let severity = 'ok';

  if (looksLikeTotalRow(mapped) || (!looksLikeHourRow(mapped) && !(entry.hours > 0))) {
    return {
      severity: 'block',
      issues: ['Ser ut som summeringsrad eller mangler timeføring.'],
      title: text(mapped.employeeName) || text(mapped.projectName) || 'Ugyldig rad',
      meta: '',
      entry: null,
      employeeId: '',
      projectId: '',
      customerId: '',
      duplicate: false,
      update: false,
    };
  }

  if (!entry.date) {
    severity = 'block';
    issues.push('Dato mangler — raden blir ikke importert.');
  }
  if (!(entry.hours > 0) && !(entry.billableHours > 0) && !entry.description) {
    if (severity !== 'block') severity = 'block';
    issues.push('Ingen timer i raden.');
  }

  const employee = entry.employeeId
    ? (employees || []).find((row) => row.id === entry.employeeId) || matchEmployee(employees, entry)
    : matchEmployee(employees, entry);
  if (employee) {
    entry.employeeId = employee.id;
    entry.employeeName = displayName(employee) || entry.employeeName;
    entry.employeeNumber = text(employee.company?.externalEmployeeNumber) || entry.employeeNumber;
  } else if (entry.employeeName || entry.employeeNumber) {
    severity = 'review';
    issues.push('Medarbeideren er ikke funnet i Ansatte. Importer/opprett personen først, eller koble manuelt.');
  } else {
    severity = 'review';
    issues.push('Mangler medarbeider — raden kan ikke lagres uten ansatt.');
  }

  const customer = entry.customerId
    ? (customers || []).find((row) => row.id === entry.customerId) || matchCustomer(customers, {
      customerNumber: entry.customerNumber,
      orgnr: entry.orgnr,
      client: entry.customerName,
    })
    : matchCustomer(customers, {
      customerNumber: entry.customerNumber,
      orgnr: entry.orgnr,
      client: entry.customerName,
    });
  if (customer) {
    entry.customerId = customer.id;
    entry.customerNumber = normalizeCustomerNumber(customer.customerNumber) || entry.customerNumber;
    entry.customerName = text(customer.name) || entry.customerName;
    entry.orgnr = normalizeOrgnr(customer.orgnr) || entry.orgnr;
  } else if (entry.customerName || entry.customerNumber || entry.orgnr) {
    if (severity === 'ok') severity = 'review';
    issues.push('Kunden er ikke koblet til kunderegisteret.');
  }

  const project = entry.projectId
    ? (projects || []).find((row) => row.id === entry.projectId) || matchProject(projects, entry)
    : matchProject(projects, entry);
  if (project) {
    entry.projectId = project.id;
    entry.projectNumber = text(project.number) || entry.projectNumber;
    entry.projectName = text(project.name) || entry.projectName;
    if (!entry.customerId && project.customerId) {
      entry.customerId = project.customerId;
    }
  } else if (entry.projectNumber || entry.projectName) {
    if (severity === 'ok') severity = 'review';
    issues.push('Prosjektet er ikke funnet. Importer prosjektlisten først, eller koble manuelt.');
  } else {
    if (severity === 'ok') severity = 'review';
    issues.push('Mangler prosjekt — timer må fordeles på et prosjekt.');
  }

  const fingerprint = hourFingerprint(entry);
  entry.importFingerprint = fingerprint;
  const duplicateInFile = seenInFile.has(fingerprint);
  const duplicateExisting = existingFingerprints.has(fingerprint);
  const duplicate = duplicateInFile || duplicateExisting;
  if (duplicate) {
    severity = 'existing';
    issues.push(duplicateInFile
      ? 'Duplikat i importfilen — raden blir hoppet over.'
      : 'Føringen finnes fra før — raden blir hoppet over.');
  }
  seenInFile.add(fingerprint);

  const title = [
    entry.date || 'Uten dato',
    entry.employeeName || entry.employeeNumber || 'Uten ansatt',
  ].join(' · ');
  const meta = [
    entry.projectNumber && entry.projectName
      ? `${entry.projectNumber} · ${entry.projectName}`
      : (entry.projectName || entry.projectNumber),
    entry.activityName,
    formatHours(entry.hours),
    entry.customerName,
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
    orgnr: entry.orgnr,
    duplicate,
    update: false,
  };
}

export function planHourImport(existingEntries, employees, customers, projects, rows) {
  const existingFingerprints = new Set(
    (Array.isArray(existingEntries) ? existingEntries : [])
      .map((row) => text(row.importFingerprint) || hourFingerprint(row))
      .filter(Boolean),
  );
  const seenInFile = new Set();
  const planned = [];
  for (const raw of Array.isArray(rows) ? rows : []) {
    planned.push(companyHourRow(raw, {
      employees,
      customers,
      projects,
      existingFingerprints,
      seenInFile,
    }));
  }
  return { rows: planned };
}

export function linkImportRowEmployee(row, employee) {
  if (!row || row.severity === 'existing' || !employee?.id || !row.entry) return row;
  const employeeName = displayName(employee) || text(row.employeeName);
  const employeeNumber = text(employee.company?.externalEmployeeNumber) || text(row.employeeNumber);
  const issues = (row.issues || []).filter((issue) => !/medarbeider|ansatt/i.test(issue));
  let severity = 'ok';
  if (!row.projectId) {
    severity = 'review';
    if (!issues.some((issue) => /prosjekt/i.test(issue))) {
      issues.push('Prosjektet er ikke funnet. Importer prosjektlisten først, eller koble manuelt.');
    }
  } else if (issues.some((issue) => /kunde/i.test(issue))) {
    severity = 'review';
  }
  if (row.duplicate) severity = 'existing';
  const entry = {
    ...row.entry,
    employeeId: employee.id,
    employeeName,
    employeeNumber,
  };
  entry.importFingerprint = hourFingerprint(entry);
  return {
    ...row,
    severity,
    issues,
    employeeId: employee.id,
    employeeName,
    employeeNumber,
    entry,
    linkedManually: true,
    title: [entry.date || 'Uten dato', employeeName].join(' · '),
  };
}

export function linkImportPlanEmployee(plan, rowIndex, employee, { applyGroup = true } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const target = rows[rowIndex];
  if (!target || !employee?.id) return plan;
  const key = fold(target.employeeNumber) || fold(target.employeeName);
  const nextRows = rows.map((row, index) => {
    if (index === rowIndex) return linkImportRowEmployee(row, employee);
    if (
      applyGroup
      && key
      && !row.employeeId
      && (fold(row.employeeNumber) === key || fold(row.employeeName) === key)
    ) {
      return linkImportRowEmployee(row, employee);
    }
    return row;
  });
  return { ...plan, rows: nextRows };
}

export function linkImportRowProject(row, project) {
  if (!row || row.severity === 'existing' || !project?.id || !row.entry) return row;
  const issues = (row.issues || []).filter((issue) => !/prosjekt/i.test(issue));
  let severity = 'ok';
  if (!row.employeeId) {
    severity = 'review';
    if (!issues.some((issue) => /medarbeider|ansatt/i.test(issue))) {
      issues.push('Mangler medarbeider — raden kan ikke lagres uten ansatt.');
    }
  } else if (issues.some((issue) => /kunde/i.test(issue))) {
    severity = 'review';
  }
  if (row.duplicate) severity = 'existing';
  const entry = {
    ...row.entry,
    projectId: project.id,
    projectNumber: text(project.number) || row.projectNumber,
    projectName: text(project.name) || row.projectName,
    customerId: row.entry.customerId || project.customerId || '',
  };
  entry.importFingerprint = hourFingerprint(entry);
  return {
    ...row,
    severity,
    issues,
    projectId: project.id,
    projectNumber: entry.projectNumber,
    projectName: entry.projectName,
    entry,
    meta: [
      `${entry.projectNumber} · ${entry.projectName}`.replace(/^\s·\s/, ''),
      entry.activityName,
      formatHours(entry.hours),
      row.customerName,
    ].filter(Boolean).join(' · '),
  };
}

export function linkImportPlanProject(plan, rowIndex, project) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  if (!rows[rowIndex] || !project?.id) return plan;
  const nextRows = rows.map((row, index) => (index === rowIndex ? linkImportRowProject(row, project) : row));
  return { ...plan, rows: nextRows };
}

export function linkImportRowCustomer(row, customer) {
  if (!row || row.severity === 'existing' || !customer?.id || !row.entry) return row;
  const customerNumber = normalizeCustomerNumber(customer.customerNumber) || text(row.customerNumber);
  const customerName = text(customer.name) || text(row.customerName);
  const orgnr = normalizeOrgnr(customer.orgnr) || text(row.orgnr);
  const issues = (row.issues || []).filter((issue) => !/kunde/i.test(issue));
  let severity = row.severity;
  if (severity === 'review' && !issues.length && row.employeeId && row.projectId) severity = 'ok';
  if (!row.employeeId || !row.projectId) severity = 'block';
  const entry = {
    ...row.entry,
    customerId: customer.id,
    customerNumber,
    customerName,
    orgnr,
  };
  return {
    ...row,
    severity,
    issues,
    customerId: customer.id,
    customerNumber,
    customerName,
    orgnr,
    entry,
  };
}

export function linkImportPlanCustomer(plan, rowIndex, customer, { applyGroup = true } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const target = rows[rowIndex];
  if (!target || !customer?.id) return plan;
  const key = customerIdentityKey({
    customerNumber: target.customerNumber,
    orgnr: target.orgnr,
    client: target.customerName,
  });
  const nextRows = rows.map((row, index) => {
    if (index === rowIndex) return linkImportRowCustomer(row, customer);
    if (
      applyGroup
      && key
      && customerIdentityKey({
        customerNumber: row.customerNumber,
        orgnr: row.orgnr,
        client: row.customerName,
      }) === key
      && !row.customerId
    ) {
      return linkImportRowCustomer(row, customer);
    }
    return row;
  });
  return { ...plan, rows: nextRows };
}

export async function readHourTable(bytes, filename = '', { columnFields } = {}) {
  const tables = await readSpreadsheetTables(bytes, filename);
  let best = null;
  for (const sheet of tables || []) {
    const table = sheet?.table || [];
    const index = headerIndex(table);
    if (index < 0) continue;
    const rank = (table[index] || []).filter((cell) => hourColumnField(cell)).length;
    if (!best || rank > best.rank) best = { table, index, rank };
  }
  if (!best) {
    throw new Error('Fant ingen timeliste. Filen trenger kolonner som Dato, Ansatt og Timer.');
  }
  const headerCells = best.table[best.index] || [];
  const fields = headerCells.map((cell, index) => {
    if (columnFields && columnFields[cell]) return columnFields[cell];
    if (columnFields && columnFields[String(index)]) return columnFields[String(index)];
    return hourColumnField(cell);
  });
  if (!fields.includes('date') && !fields.includes('hours')) {
    throw new Error('Listen mangler kolonne for dato eller timer.');
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
    if (looksLikeHourRow(mapped)) rows.push(mapped);
  }
  if (!rows.length) throw new Error('Listen har ingen timeføringer.');
  return rows;
}

/** Kompakt gjennomgang: grupperte avvik + klare + duplikater. */
export function reviewRowsForHourPlan(plan, { dropped = new Set(), okSample = 12 } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const out = [];
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
        });
      }
      const group = reviewGroups.get(issueKey);
      group.indexes.push(index);
      if (group.sampleTitles.length < 4) group.sampleTitles.push(row.title);
      if (dropped.has(String(index))) group.included = false;
      return;
    }
    okIndexes.push(index);
  });

  if (blockIndexes.length) {
    const sample = blockIndexes.slice(0, 5).map((index) => rows[index]?.title).filter(Boolean);
    out.push({
      id: 'block-group',
      severity: 'block',
      included: false,
      locked: true,
      title: blockIndexes.length === 1
        ? (rows[blockIndexes[0]]?.title || 'Blokkert rad')
        : `${blockIndexes.length} rader blir ikke importert`,
      meta: sample.join(', '),
      issues: [rows[blockIndexes[0]]?.issues?.[0] || 'Kan ikke importeres.'],
      indexes: blockIndexes,
      rowIndex: blockIndexes[0],
    });
  }

  if (existingIndexes.length) {
    const sample = existingIndexes.slice(0, 5).map((index) => rows[index]?.title).filter(Boolean);
    out.push({
      id: 'existing-group',
      severity: 'existing',
      included: false,
      locked: true,
      title: existingIndexes.length === 1
        ? (rows[existingIndexes[0]]?.title || 'Duplikat')
        : `${existingIndexes.length} duplikater hoppes over`,
      meta: sample.join(', '),
      issues: [rows[existingIndexes[0]]?.issues?.[0] || 'Finnes allerede.'],
      indexes: existingIndexes,
      rowIndex: existingIndexes[0],
      count: existingIndexes.length,
    });
  }

  for (const group of reviewGroups.values()) {
    const count = group.indexes.length;
    out.push({
      id: group.id,
      severity: 'review',
      included: group.included && group.indexes.some((index) => !dropped.has(String(index))),
      title: count === 1 ? group.title : `${count} føringer med samme avvik`,
      meta: group.sampleTitles.join(', '),
      issues: group.issues,
      indexes: group.indexes,
      rowIndex: group.indexes[0],
      count,
    });
  }

  if (okIndexes.length) {
    const included = okIndexes.some((index) => !dropped.has(String(index)));
    const sample = okIndexes.slice(0, okSample).map((index) => rows[index]?.title).filter(Boolean);
    out.push({
      id: 'ok-group',
      severity: 'ok',
      included,
      title: `${okIndexes.length} timer klare uten avvik`,
      meta: sample.join(', ') + (okIndexes.length > okSample ? ' …' : ''),
      issues: [],
      indexes: okIndexes,
      count: okIndexes.length,
    });
  }

  return out;
}

export function toggleHourReviewRow(dropped, reviewRow, plan) {
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
  void plan;
  return next;
}

export const HOUR_IMPORT_ACCEPT = CUSTOMER_IMPORT_ACCEPT;
