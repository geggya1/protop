/**
 * Hurtigimport av fakturaliste fra Excel/CSV (f.eks. Moment invoices).
 * Kobler mot kunder og prosjekter uten å miste kolonner.
 */
import { readSpreadsheetTables, CUSTOMER_IMPORT_ACCEPT } from '../anbud/customerImport.js';
import {
  namesLikelyMatch,
  normalizeCustomerNumber,
  normalizeOrgnr,
} from '../anbud/customers.js';
import {
  deriveInvoiceStatus,
  emptyInvoice,
  fold,
  normalizeInvoice,
  parseMoney,
  text,
} from './invoices.js';
import {
  customerIdentityKey,
  matchCustomer,
  suggestCustomers,
} from '../project/projectImport.js';

export { matchCustomer, suggestCustomers, customerIdentityKey };

const FIELD_ALIASES = [
  ['invoiceNumber', ['fakturanr', 'fakturanummer', 'invoicenumber', 'invoiceno', 'invoice']],
  ['invoiceDate', ['fakturadato', 'invoicedate', 'dato']],
  ['dueDate', ['forfallsdato', 'duedate', 'forfall']],
  ['reminderPostponedTo', ['paminneelseutsattil', 'paminneelseutsatt', 'reminderpostponedto']],
  ['periodStart', ['periodestart', 'periodstart']],
  ['periodEnd', ['periodeslutt', 'periodend']],
  ['customerNumber', ['kundenummer', 'kundenr', 'customernumber', 'customerno']],
  ['customerName', ['kundenavn', 'kunde', 'customer', 'buyer', 'customername']],
  ['orgnr', ['orgnr', 'org.nr', 'organisasjonsnummer', 'orgno']],
  ['customerReference', ['kundensreferanse', 'kundereferanse', 'customerreference', 'reference']],
  ['customerTags', ['kundetagger', 'customertags']],
  ['projectNumber', ['prosjektnummer', 'prosjektnr', 'projectnumber', 'projectno']],
  ['projectName', ['prosjekt', 'prosjektnavn', 'project', 'projectname']],
  ['projectTagSegment', ['prosjekttaggerkundesegment', 'kundesegment']],
  ['projectTagMarket', ['prosjekttaggermarkedsomrade', 'markedsomrade', 'markedsområde']],
  ['projectTags', ['prosjekttaggerprosjekttagger', 'prosjekttagger']],
  ['activities', ['aktiviteter', 'activities']],
  ['activityTags', ['aktivitetstagger', 'activitytags']],
  ['department', ['avdeling', 'department']],
  ['invoiceTags', ['fakturatagger', 'invoicetags']],
  ['exportStatus', ['eksportstatus', 'exportstatus']],
  ['sent', ['sendt', 'sent']],
  ['sentAt', ['sendtdato', 'sentdate', 'sentat']],
  ['kid', ['kid']],
  ['deliveryMethod', ['forsendelsesmate', 'forsendelsesmåte', 'deliverymethod']],
  ['currency', ['valuta', 'currency']],
  ['exchangeRate', ['valutakurs', 'exchangerate']],
  ['feesExMarkup', ['honorarerekspaslag', 'honorarereks.paslag']],
  ['feesMarkup', ['paslaghonorarer', 'påslaghonorarer']],
  ['feesInclMarkup', ['honorarerinkpaslag', 'honorarerink.paslag']],
  ['expensesExMarkup', ['utleggekspaslag', 'utleggeks.paslag']],
  ['expensesMarkup', ['paslagutlegg', 'påslagutlegg']],
  ['expensesInclMarkup', ['utlegginkpaslag', 'utleggink.paslag']],
  ['products', ['produkter', 'products']],
  ['adminCosts', ['admkostnader', 'adm.kostnader', 'administrasjonskostnader']],
  ['amountExVat', ['belopeksmva', 'beløpeksmva', 'belopeks.mva', 'amountExVat', 'net']],
  ['vat', ['mva', 'vat', 'moms']],
  ['amountInclVat', ['belopinkmva', 'beløpinkmva', 'belopink.mva', 'gross', 'total']],
  ['outstanding', ['utestaende', 'utestående', 'outstanding']],
  ['loss', ['tap', 'loss']],
  ['paidAt', ['betalingsdato', 'paidat', 'paiddate']],
  ['daysSentToPaid', ['dagermellomsendtogbetalt']],
  ['daysPaidToDue', ['dagermellombetaltogforfall']],
  ['lockedAt', ['lasedato', 'låsedato', 'lockedat']],
  ['creditDays', ['kredittid', 'creditdays']],
];

export function invoiceColumnField(header) {
  const key = fold(header);
  if (!key) return '';
  const account = key.match(/^regnskapskonto(\d+)$/) || String(header || '').match(/regnskapskonto[:\s]*(\d+)/i);
  if (account) return `account:${account[1]}`;
  for (const [field, aliases] of FIELD_ALIASES) {
    if (aliases.some((alias) => fold(alias) === key)) return field;
    if (fold(field) === key) return field;
  }
  // «Prosjekttagger: Kundesegment» osv.
  if (key.includes('kundesegment')) return 'projectTagSegment';
  if (key.includes('markedsomrade')) return 'projectTagMarket';
  if (key.startsWith('prosjekttagger') && key.endsWith('prosjekttagger')) return 'projectTags';
  if (key === 'paminneelseutsattil' || key.includes('paminneelse')) return 'reminderPostponedTo';
  return '';
}

function headerIndex(table) {
  let best = -1;
  let score = 0;
  for (let index = 0; index < Math.min(table.length, 12); index += 1) {
    const rank = (table[index] || []).filter((cell) => invoiceColumnField(cell)).length;
    if (rank > score) {
      score = rank;
      best = index;
    }
  }
  return score >= 2 ? best : -1;
}

function looksLikeInvoiceNumber(value) {
  const raw = text(value);
  if (!raw) return false;
  const key = fold(raw);
  if (key === 'totalt' || key === 'sum' || key === 'total') return false;
  return /\d/.test(raw);
}

export function normalizeProjectNumber(value) {
  let raw = text(value);
  if (!raw) return '';
  if (/^\d+\.0+$/.test(raw)) raw = raw.replace(/\.0+$/, '');
  return raw;
}

export function matchProject(projects, hint = {}) {
  const list = Array.isArray(projects) ? projects : [];
  const number = normalizeProjectNumber(hint.projectNumber);
  const name = text(hint.projectName);
  if (number) {
    const byNumber = list.filter((row) => normalizeProjectNumber(row.number) === number);
    if (byNumber.length === 1) return byNumber[0];
    if (byNumber.length > 1 && name) {
      const named = byNumber.filter((row) => fold(row.name) === fold(name) || namesLikelyMatch(row.name, name));
      if (named.length) return named[0];
    }
    if (byNumber.length) return byNumber[0];
  }
  if (name) {
    const exact = list.filter((row) => fold(row.name) === fold(name));
    if (exact.length === 1) return exact[0];
    const soft = list.filter((row) => namesLikelyMatch(row.name, name));
    if (soft.length === 1) return soft[0];
  }
  return null;
}

/** Kandidater til manuell prosjektkobling i importgjennomgangen. */
export function suggestProjects(projects, hint = {}, limit = 8) {
  const list = Array.isArray(projects) ? projects : [];
  const number = normalizeProjectNumber(hint.projectNumber || hint.query);
  const query = fold(hint.query || hint.projectName || hint.projectNumber || '');
  const ranked = list.map((project) => {
    let score = 0;
    const projectNumber = normalizeProjectNumber(project.number);
    if (number && projectNumber === number) score += 100;
    if (query) {
      const hay = fold([project.number, project.name, project.client].filter(Boolean).join(' '));
      if (hay.includes(query)) score += 20;
      if (fold(project.name) === fold(hint.projectName)) score += 40;
      else if (hint.projectName && namesLikelyMatch(project.name, hint.projectName)) score += 25;
    }
    return { project, score };
  }).filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || text(a.project.number).localeCompare(text(b.project.number), 'nb', { numeric: true }));
  const out = [];
  const seen = new Set();
  for (const row of ranked) {
    if (seen.has(row.project.id)) continue;
    seen.add(row.project.id);
    out.push(row.project);
    if (out.length >= limit) break;
  }
  if (out.length || !query) return out;
  return list.filter((project) => {
    const hay = fold([project.number, project.name].filter(Boolean).join(' '));
    return hay.includes(query);
  }).slice(0, limit);
}

export function invoiceFromMappedRow(mapped, originalValues = {}, meta = {}) {
  const accounts = { ...(mapped.accounts || {}) };
  for (const [key, value] of Object.entries(mapped)) {
    if (key.startsWith('account:')) {
      const code = key.slice('account:'.length);
      const amount = parseMoney(value);
      if (amount != null) accounts[code] = amount;
    }
  }
  const draft = emptyInvoice({
    invoiceNumber: text(mapped.invoiceNumber),
    invoiceDate: mapped.invoiceDate,
    dueDate: mapped.dueDate,
    reminderPostponedTo: mapped.reminderPostponedTo,
    periodStart: mapped.periodStart,
    periodEnd: mapped.periodEnd,
    customerNumber: normalizeCustomerNumber(mapped.customerNumber) || text(mapped.customerNumber),
    customerName: text(mapped.customerName),
    orgnr: normalizeOrgnr(mapped.orgnr) || text(mapped.orgnr),
    customerReference: mapped.customerReference,
    customerTags: mapped.customerTags,
    projectNumber: text(mapped.projectNumber),
    projectName: text(mapped.projectName),
    projectTagSegment: mapped.projectTagSegment,
    projectTagMarket: mapped.projectTagMarket,
    projectTags: mapped.projectTags,
    activities: mapped.activities,
    activityTags: mapped.activityTags,
    department: mapped.department,
    invoiceTags: mapped.invoiceTags,
    exportStatus: mapped.exportStatus,
    sent: mapped.sent,
    sentAt: mapped.sentAt,
    kid: mapped.kid,
    deliveryMethod: mapped.deliveryMethod,
    currency: mapped.currency || 'NOK',
    exchangeRate: mapped.exchangeRate,
    feesExMarkup: mapped.feesExMarkup,
    feesMarkup: mapped.feesMarkup,
    feesInclMarkup: mapped.feesInclMarkup,
    expensesExMarkup: mapped.expensesExMarkup,
    expensesMarkup: mapped.expensesMarkup,
    expensesInclMarkup: mapped.expensesInclMarkup,
    products: mapped.products,
    adminCosts: mapped.adminCosts,
    accounts,
    amountExVat: mapped.amountExVat,
    vat: mapped.vat,
    amountInclVat: mapped.amountInclVat,
    outstanding: mapped.outstanding,
    outstandingAmount: parseMoney(mapped.outstanding),
    loss: mapped.loss,
    paidAt: mapped.paidAt,
    daysSentToPaid: mapped.daysSentToPaid,
    daysPaidToDue: mapped.daysPaidToDue,
    lockedAt: mapped.lockedAt,
    creditDays: mapped.creditDays,
    customerId: text(mapped.customerId),
    projectId: text(mapped.projectId),
    source: {
      filename: text(meta.filename),
      importedAt: text(meta.importedAt) || new Date().toISOString(),
      values: originalValues,
    },
  });
  draft.status = deriveInvoiceStatus(draft);
  return normalizeInvoice(draft);
}

export function companyInvoiceRow(input, customers = [], projects = [], existingNumbers = new Set()) {
  const mapped = input && typeof input === 'object' ? input : {};
  const originalValues = mapped._sourceValues && typeof mapped._sourceValues === 'object'
    ? mapped._sourceValues
    : {};
  const invoice = invoiceFromMappedRow(mapped, originalValues, {
    filename: mapped._filename,
    importedAt: mapped._importedAt,
  });
  const issues = [];
  let severity = 'ok';

  if (!looksLikeInvoiceNumber(invoice.invoiceNumber)) {
    return {
      severity: 'block',
      issues: ['Ser ut som summeringsrad eller mangler fakturanummer.'],
      title: text(mapped.invoiceNumber) || 'Uten fakturanr',
      meta: text(mapped.customerName) || text(mapped.projectName) || '',
      invoice: null,
      customerId: '',
      projectId: '',
      customerNumber: invoice.customerNumber,
      customerName: invoice.customerName,
      orgnr: invoice.orgnr,
      projectNumber: invoice.projectNumber,
      projectName: invoice.projectName,
      update: false,
    };
  }

  const customer = invoice.customerId
    ? (customers || []).find((row) => row.id === invoice.customerId) || matchCustomer(customers, {
      customerNumber: invoice.customerNumber,
      orgnr: invoice.orgnr,
      client: invoice.customerName,
    })
    : matchCustomer(customers, {
      customerNumber: invoice.customerNumber,
      orgnr: invoice.orgnr,
      client: invoice.customerName,
    });

  const project = invoice.projectId
    ? (projects || []).find((row) => row.id === invoice.projectId) || matchProject(projects, invoice)
    : matchProject(projects, invoice);

  if (customer) {
    invoice.customerId = customer.id;
    invoice.customerNumber = normalizeCustomerNumber(customer.customerNumber) || invoice.customerNumber;
    invoice.customerName = text(customer.name) || invoice.customerName;
    invoice.orgnr = normalizeOrgnr(customer.orgnr) || invoice.orgnr;
  } else if (invoice.customerName || invoice.customerNumber || invoice.orgnr) {
    severity = 'review';
    issues.push('Kunden er ikke koblet til kunderegisteret. Velg kunde under før import, eller importer likevel.');
  } else {
    severity = 'review';
    issues.push('Ingen kunde i raden. Velg kunde under før import, eller importer likevel.');
  }

  if (project) {
    invoice.projectId = project.id;
    invoice.projectNumber = text(project.number) || invoice.projectNumber;
    invoice.projectName = text(project.name) || invoice.projectName;
    if (!invoice.customerId && project.customerId) {
      invoice.customerId = project.customerId;
    }
    if (project.contractId) invoice.contractId = project.contractId;
  } else if (invoice.projectNumber || invoice.projectName) {
    if (severity === 'ok') severity = 'review';
    issues.push('Prosjektet er ikke koblet. Velg prosjekt under for å koble alle fakturaer med samme prosjektnummer.');
  }

  const update = existingNumbers.has(invoice.invoiceNumber);
  if (update) {
    return {
      severity: 'existing',
      locked: true,
      issues: ['Fakturanummeret finnes allerede og er fjernet fra importen.'],
      title: `Faktura ${invoice.invoiceNumber}`,
      meta: [
        invoice.customerName,
        invoice.projectNumber && invoice.projectName
          ? `${invoice.projectNumber} · ${invoice.projectName}`
          : (invoice.projectName || invoice.projectNumber),
      ].filter(Boolean).join(' · '),
      invoice: null,
      customerId: invoice.customerId,
      projectId: invoice.projectId,
      customerNumber: invoice.customerNumber,
      customerName: invoice.customerName,
      orgnr: invoice.orgnr,
      projectNumber: invoice.projectNumber,
      projectName: invoice.projectName,
      amountInclVat: invoice.amountInclVat,
      currency: invoice.currency,
      update: true,
    };
  }

  invoice.id = invoice.id || `inv_${invoice.invoiceNumber}`;

  return {
    severity,
    issues,
    title: `Faktura ${invoice.invoiceNumber}`,
    meta: [
      invoice.customerName,
      invoice.projectNumber && invoice.projectName
        ? `${invoice.projectNumber} · ${invoice.projectName}`
        : (invoice.projectName || invoice.projectNumber),
      invoice.amountInclVat != null ? String(invoice.amountInclVat) : '',
    ].filter(Boolean).join(' · '),
    invoice,
    customerId: invoice.customerId,
    projectId: invoice.projectId,
    customerNumber: invoice.customerNumber,
    customerName: invoice.customerName,
    orgnr: invoice.orgnr,
    projectNumber: invoice.projectNumber,
    projectName: invoice.projectName,
    amountInclVat: invoice.amountInclVat,
    currency: invoice.currency,
    update: false,
  };
}

export function planInvoiceImport(existingInvoices, customers, projects, rows) {
  const existingNumbers = new Set(
    (Array.isArray(existingInvoices) ? existingInvoices : [])
      .map((row) => text(row.invoiceNumber))
      .filter(Boolean),
  );
  const planned = [];
  for (const raw of Array.isArray(rows) ? rows : []) {
    planned.push(companyInvoiceRow(raw, customers, projects, existingNumbers));
  }
  return { rows: planned };
}

export function linkImportRowCustomer(row, customer) {
  if (!row || row.severity === 'block' || row.severity === 'existing' || !customer?.id || !row.invoice) return row;
  const customerNumber = normalizeCustomerNumber(customer.customerNumber) || text(row.customerNumber);
  const customerName = text(customer.name) || text(row.customerName);
  const orgnr = normalizeOrgnr(customer.orgnr) || text(row.orgnr);
  const issues = (row.issues || []).filter((issue) => !/kunde/i.test(issue));
  let severity = row.severity;
  if (!issues.length && severity === 'review') severity = 'ok';
  if (issues.some((issue) => /prosjekt/i.test(issue))) severity = 'review';
  const invoice = {
    ...row.invoice,
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
    invoice,
    linkedManually: true,
    meta: [
      customerName,
      row.projectNumber && row.projectName
        ? `${row.projectNumber} · ${row.projectName}`
        : (row.projectName || row.projectNumber),
    ].filter(Boolean).join(' · '),
  };
}

export function linkImportPlanCustomer(plan, rowIndex, customer, { applyGroup = true } = {}) {
  // gjenbruk gruppe-nøkkel-logikk fra prosjektimport via lokal kopi
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

export function linkImportRowProject(row, project) {
  if (!row || row.severity === 'block' || row.severity === 'existing' || !project?.id || !row.invoice) return row;
  const issues = (row.issues || []).filter((issue) => !/prosjekt/i.test(issue));
  let severity = row.severity;
  if (!issues.length && severity === 'review') severity = 'ok';
  if (issues.some((issue) => /kunde/i.test(issue))) severity = 'review';
  const invoice = {
    ...row.invoice,
    projectId: project.id,
    projectNumber: text(project.number) || row.projectNumber,
    projectName: text(project.name) || row.projectName,
    contractId: project.contractId || row.invoice.contractId || '',
    customerId: row.invoice.customerId || project.customerId || '',
  };
  return {
    ...row,
    severity,
    issues,
    projectId: project.id,
    projectNumber: invoice.projectNumber,
    projectName: invoice.projectName,
    invoice,
    meta: [
      row.customerName,
      `${invoice.projectNumber} · ${invoice.projectName}`.replace(/^\s·\s/, ''),
    ].filter(Boolean).join(' · '),
  };
}

export function linkImportPlanProject(plan, rowIndex, project, { applyGroup = true } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const target = rows[rowIndex];
  if (!target || !project?.id) return plan;
  const key = normalizeProjectNumber(target.projectNumber);
  const nextRows = rows.map((row, index) => {
    if (index === rowIndex) return linkImportRowProject(row, project);
    if (
      applyGroup
      && key
      && normalizeProjectNumber(row.projectNumber) === key
      && !row.projectId
      && row.severity !== 'block'
      && row.severity !== 'existing'
    ) {
      return linkImportRowProject(row, project);
    }
    return row;
  });
  return { ...plan, rows: nextRows };
}

export async function readInvoiceTable(bytes, filename = '', { columnFields } = {}) {
  const tables = await readSpreadsheetTables(bytes, filename);
  let best = null;
  for (const sheet of tables || []) {
    const table = sheet?.table || [];
    const index = headerIndex(table);
    if (index < 0) continue;
    const rank = (table[index] || []).filter((cell) => invoiceColumnField(cell)).length;
    if (!best || rank > best.rank) best = { table, index, rank };
  }
  if (!best) throw new Error('Fant ingen fakturaliste. Filen trenger kolonner som Fakturanr og Kundenavn.');
  const headerCells = best.table[best.index] || [];
  const fields = headerCells.map((cell, index) => {
    if (columnFields && columnFields[cell]) return columnFields[cell];
    if (columnFields && columnFields[String(index)]) return columnFields[String(index)];
    return invoiceColumnField(cell);
  });
  if (!fields.includes('invoiceNumber')) {
    throw new Error('Listen mangler kolonne for fakturanummer.');
  }
  const importedAt = new Date().toISOString();
  const rows = [];
  for (const cells of best.table.slice(best.index + 1)) {
    const mapped = { accounts: {}, _filename: filename, _importedAt: importedAt };
    const sourceValues = {};
    headerCells.forEach((header, index) => {
      const label = text(header);
      const value = text(cells?.[index]);
      if (label) sourceValues[label] = value;
      const field = fields[index];
      if (!field || !value) return;
      if (field.startsWith('account:')) {
        mapped.accounts[field.slice('account:'.length)] = value;
        mapped[field] = value;
        return;
      }
      if (!mapped[field]) mapped[field] = value;
    });
    mapped._sourceValues = sourceValues;
    if (text(mapped.invoiceNumber) || text(mapped.customerName) || text(mapped.amountInclVat)) {
      rows.push(mapped);
    }
  }
  if (!rows.length) throw new Error('Listen har ingen fakturaer.');
  return rows;
}

/**
 * Gjennomgang for fakturaimport.
 * - existing/block: sammendrag
 * - review: gruppert på prosjektnr (eller kunde) så man kan koble én gang
 * - ok: egen tabelliste (ikke minimert gruppe)
 */
export function buildInvoiceImportReview(plan, { dropped = new Set() } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const existingIndexes = [];
  const blockIndexes = [];
  const okIndexes = [];
  const reviewGroups = new Map();

  rows.forEach((row, index) => {
    if (row.severity === 'existing') {
      existingIndexes.push(index);
      return;
    }
    if (row.severity === 'block') {
      blockIndexes.push(index);
      return;
    }
    if (row.severity === 'review') {
      const projectKey = normalizeProjectNumber(row.projectNumber);
      let groupKey;
      if (projectKey) {
        // Samle på prosjektnr — én kobling løser alle fakturaer på prosjektet.
        groupKey = `project:${projectKey}`;
      } else {
        groupKey = `customer:${customerIdentityKey({
          customerNumber: row.customerNumber,
          orgnr: row.orgnr,
          client: row.customerName,
        }) || fold(row.customerName) || index}`;
      }
      if (!reviewGroups.has(groupKey)) {
        reviewGroups.set(groupKey, {
          id: `review:${groupKey}`,
          severity: 'review',
          included: true,
          title: row.title,
          meta: row.meta,
          issues: [],
          indexes: [],
          sampleTitles: [],
          customers: new Set(),
          projectNumber: row.projectNumber || '',
          projectName: row.projectName || '',
          customerName: row.customerName || '',
          customerNumber: row.customerNumber || '',
          orgnr: row.orgnr || '',
          needsCustomer: false,
          needsProject: false,
          rowIndex: index,
        });
      }
      const group = reviewGroups.get(groupKey);
      group.indexes.push(index);
      for (const issue of row.issues || []) {
        if (!group.issues.includes(issue)) group.issues.push(issue);
      }
      group.needsCustomer = group.needsCustomer || (row.issues || []).some((issue) => /kunde/i.test(issue));
      group.needsProject = group.needsProject || (row.issues || []).some((issue) => /prosjekt/i.test(issue));
      if (row.customerName) group.customers.add(row.customerName);
      if (!group.projectName && row.projectName) group.projectName = row.projectName;
      if (group.sampleTitles.length < 5) group.sampleTitles.push(row.title);
      if (dropped.has(String(index))) group.included = false;
      return;
    }
    okIndexes.push(index);
  });

  const cards = [];
  if (existingIndexes.length) {
    cards.push({
      id: 'existing-group',
      severity: 'existing',
      locked: true,
      included: false,
      count: existingIndexes.length,
      title: `${existingIndexes.length} fakturaer finnes allerede`,
      meta: 'Kontrollert mot registeret og fjernet fra importen.',
      issues: ['Fakturanummeret finnes allerede og er fjernet fra importen.'],
      indexes: existingIndexes,
      rowIndex: existingIndexes[0],
    });
  }
  if (blockIndexes.length) {
    const sample = blockIndexes.slice(0, 5).map((index) => rows[index]?.title).filter(Boolean);
    cards.push({
      id: 'block-group',
      severity: 'block',
      locked: true,
      included: false,
      count: blockIndexes.length,
      title: blockIndexes.length === 1
        ? (rows[blockIndexes[0]]?.title || 'Blokkert rad')
        : `${blockIndexes.length} rader blir ikke importert`,
      meta: sample.join(', '),
      issues: [rows[blockIndexes[0]]?.issues?.[0] || 'Kan ikke importeres.'],
      indexes: blockIndexes,
      rowIndex: blockIndexes[0],
    });
  }

  const reviewCards = [...reviewGroups.values()].map((group) => {
    const count = group.indexes.length;
    const projectLabel = [group.projectNumber, group.projectName].filter(Boolean).join(' · ');
    const customerHint = [...group.customers].slice(0, 3).join(', ');
    return {
      ...group,
      count,
      included: group.indexes.some((index) => !dropped.has(String(index))),
      title: count === 1
        ? group.title
        : (group.needsProject && group.projectNumber
          ? `${count} fakturaer · prosjekt ${projectLabel || group.projectNumber}`
          : `${count} fakturaer med samme avvik`),
      meta: [customerHint, group.sampleTitles.join(', ')].filter(Boolean).join(' · '),
    };
  }).sort((a, b) => b.count - a.count || text(a.projectNumber).localeCompare(text(b.projectNumber), 'nb', { numeric: true }));

  cards.push(...reviewCards);

  const okRows = okIndexes.map((index) => {
    const row = rows[index];
    return {
      id: String(index),
      index,
      included: !dropped.has(String(index)),
      title: row.title,
      invoiceNumber: row.invoice?.invoiceNumber || row.title,
      customerName: row.customerName || '',
      customerNumber: row.customerNumber || '',
      projectNumber: row.projectNumber || '',
      projectName: row.projectName || '',
      amountInclVat: row.amountInclVat ?? row.invoice?.amountInclVat,
      currency: row.currency || row.invoice?.currency || 'NOK',
    };
  });

  if (okIndexes.length) {
    cards.push({
      id: 'ok-group',
      severity: 'ok',
      included: okIndexes.some((index) => !dropped.has(String(index))),
      count: okIndexes.length,
      title: `${okIndexes.length} fakturaer klare uten avvik`,
      meta: '',
      issues: [],
      indexes: okIndexes,
      list: true,
    });
  }

  return {
    cards,
    okRows,
    reviewCards,
    existingCount: existingIndexes.length,
    blockCount: blockIndexes.length,
  };
}

/** Bakoverkompatibel wrapper for tester/eldre kall. */
export function reviewRowsForInvoicePlan(plan, options = {}) {
  return buildInvoiceImportReview(plan, options).cards;
}

export function toggleInvoiceReviewRow(dropped, reviewRow, plan) {
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
  // unused plan kept for API symmetry / future row lookups
  void plan;
  return next;
}

export const INVOICE_IMPORT_ACCEPT = CUSTOMER_IMPORT_ACCEPT;
