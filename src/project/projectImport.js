/**
 * Hurtigimport av bedriftens prosjektliste fra Excel/CSV (f.eks. Moment overview).
 * Kobler mot kunder via kundenummer, org.nr eller navn når det finnes i kunderegisteret.
 * Rammeavtale / oppdragsavtale settes ikke fra listen, men feltene ligger klare etterpå.
 */
import { readSpreadsheetTables, CUSTOMER_IMPORT_ACCEPT } from '../anbud/customerImport.js';
import { normalizeOrgnr } from '../anbud/customers.js';

const FIELDS = [
  ['number', ['prosjektnr', 'prosjektnummer', 'projectnumber', 'projectno', 'nr']],
  ['name', ['prosjektnavn', 'prosjekt', 'navn', 'projectname', 'tittel']],
  ['customerNumber', ['kundenr', 'kundenummer', 'customernumber', 'customerno']],
  ['client', ['kundenavn', 'kunde', 'oppdragsgiver', 'buyer', 'customer']],
  ['orgnr', ['orgnr', 'org.nr', 'organisasjonsnummer', 'orgno']],
  ['manager', ['prosjekteier', 'prosjektleder', 'owner', 'manager']],
  ['status', ['prosjektstatus', 'status']],
  ['start', ['start', 'startdato', 'fra']],
  ['end', ['slutt', 'sluttdato', 'til']],
  ['street', ['gate', 'adresse', 'address']],
  ['postalCode', ['postnr', 'postnummer', 'postalcode']],
  ['placeName', ['poststed', 'sted', 'place', 'city']],
  ['description', ['beskrivelse', 'description']],
  ['department', ['avdeling', 'department']],
  ['parentNumber', ['hovedprosjektnr', 'hovedprosjektnummer']],
  ['parentName', ['hovedprosjektnavn']],
  ['frameworkRef', ['rammeavtale', 'rammeavtalenr', 'framework']],
  ['agreementRef', ['oppdragsavtale', 'avtale', 'avtalenr', 'contract']],
  ['agreementKind', ['avtaletype', 'kind', 'type']],
];

function fold(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function fieldOf(header) {
  const key = fold(header);
  for (const [field, aliases] of FIELDS) {
    if (aliases.some((alias) => fold(alias) === key)) return field;
  }
  return '';
}

function headerIndex(table) {
  let best = -1;
  let score = 0;
  for (let index = 0; index < Math.min(table.length, 12); index += 1) {
    const rank = (table[index] || []).filter((cell) => fieldOf(cell)).length;
    if (rank > score) {
      score = rank;
      best = index;
    }
  }
  return score >= 2 ? best : -1;
}

function placeOf(row) {
  return [text(row.street), [text(row.postalCode), text(row.placeName)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

function phaseFromStatus(status) {
  const key = fold(status);
  if (!key) return 'planlegging';
  if (key.includes('avslutt') || key.includes('ferdig') || key.includes('arkiv')) return 'avsluttet';
  if (key.includes('garanti')) return 'garanti';
  if (key.includes('overlever')) return 'overlevering';
  if (key.includes('produksjon') || key.includes('arbeid') || key.includes('aktiv')) return 'produksjon';
  if (key.includes('tilbud')) return 'tilbud';
  return 'planlegging';
}

export function matchCustomer(customers, hint = {}) {
  const list = Array.isArray(customers) ? customers : [];
  const number = text(hint.customerNumber);
  if (number) {
    const byNumber = list.find((row) => text(row.customerNumber) === number);
    if (byNumber) return byNumber;
  }
  const orgnr = normalizeOrgnr(hint.orgnr);
  if (orgnr) {
    const byOrgnr = list.find((row) => normalizeOrgnr(row.orgnr) === orgnr);
    if (byOrgnr) return byOrgnr;
  }
  const name = fold(hint.client || hint.name);
  if (name) {
    const byName = list.find((row) => fold(row.name) === name);
    if (byName) return byName;
  }
  return null;
}

export function matchAgreement(contracts, hint = {}, customerId = '') {
  const list = (Array.isArray(contracts) ? contracts : []).filter((row) => row && row.status !== 'avsluttet');
  const forCustomer = customerId
    ? list.filter((row) => row.customerId === customerId)
    : list;
  const pool = forCustomer.length ? forCustomer : list;
  const id = text(hint.agreementId || hint.contractId);
  if (id) {
    const byId = pool.find((row) => row.id === id);
    if (byId) return byId;
  }
  const ref = fold(hint.agreementRef || hint.title);
  if (ref) {
    const byTitle = pool.find((row) => fold(row.title) === ref || fold(row.systemId) === ref || fold(row.oppdragId) === ref);
    if (byTitle) return byTitle;
  }
  return null;
}

export function companyProjectRow(input, customers = [], contracts = []) {
  const row = input && typeof input === 'object' ? input : {};
  const number = text(row.number);
  const name = text(row.name);
  const customerNumber = text(row.customerNumber);
  const client = text(row.client);
  const orgnr = normalizeOrgnr(row.orgnr);
  const customer = matchCustomer(customers, { customerNumber, orgnr, client });
  const agreementKindRaw = fold(row.agreementKind);
  let agreementKind = '';
  if (agreementKindRaw.includes('avrop')) agreementKind = 'avrop';
  else if (agreementKindRaw.includes('ramme')) agreementKind = 'rammeavtale';
  else if (agreementKindRaw.includes('oppdrag')) agreementKind = 'oppdrag';

  const agreement = matchAgreement(contracts, {
    agreementRef: row.agreementRef,
    contractId: row.contractId,
  }, customer?.id || '');
  const framework = matchAgreement(contracts, {
    agreementRef: row.frameworkRef,
    contractId: row.frameworkAgreementId,
  }, customer?.id || '') || (agreement?.kind === 'avrop' && agreement.parentId
    ? (contracts || []).find((item) => item.id === agreement.parentId)
    : null);

  if (agreement?.kind === 'avrop') agreementKind = 'avrop';
  else if (agreement?.kind === 'oppdrag') agreementKind = 'oppdrag';
  else if (agreement?.kind === 'rammeavtale' && !agreementKind) agreementKind = 'rammeavtale';

  const issues = [];
  let severity = 'ok';
  if (!number || !name) {
    severity = 'block';
    issues.push('Mangler prosjektnummer eller navn.');
  } else {
    if (!customer) {
      severity = 'review';
      if (client || customerNumber || orgnr) issues.push('Kunden finnes ikke i kunderegisteret ennå. Prosjektet kan importeres, men må kobles senere.');
      else issues.push('Ingen kunde i listen. Koble kunden manuelt etter import.');
    }
    if (!agreement && !framework) {
      if (severity === 'ok') severity = 'review';
      issues.push('Ingen avtale er koblet. Marker etterpå om oppdragsavtale eller rammeavtale mangler.');
    }
  }

  return {
    severity,
    issues,
    number,
    name,
    customerNumber: customer?.customerNumber || customerNumber,
    client: customer?.name || client,
    orgnr: customer?.orgnr || orgnr,
    customerId: customer?.id || '',
    place: placeOf(row),
    manager: text(row.manager),
    start: text(row.start),
    end: text(row.end),
    description: text(row.description),
    phase: phaseFromStatus(row.status),
    department: text(row.department),
    parentNumber: text(row.parentNumber),
    agreementKind,
    contractId: agreement?.id || '',
    frameworkAgreementId: framework?.id || (agreement?.kind === 'rammeavtale' ? agreement.id : ''),
    project: (!number || !name) ? null : {
      number,
      name,
      customerNumber: customer?.customerNumber || customerNumber,
      client: customer?.name || client,
      orgnr: customer?.orgnr || orgnr,
      customerId: customer?.id || '',
      place: placeOf(row),
      manager: text(row.manager),
      start: text(row.start),
      end: text(row.end),
      description: text(row.description),
      phase: phaseFromStatus(row.status),
      agreementKind,
      contractId: agreement?.id || '',
      frameworkAgreementId: framework?.id || (agreement?.kind === 'rammeavtale' ? agreement.id : ''),
    },
  };
}

export function planProjectImport(projectState, customers, contracts, rows) {
  const existing = new Set(
    (projectState?.projects || [])
      .filter((row) => row.status !== 'arkivert')
      .map((row) => text(row.number)),
  );
  const planned = [];
  for (const raw of Array.isArray(rows) ? rows : []) {
    const row = companyProjectRow(raw, customers, contracts);
    if (row.severity !== 'block' && existing.has(row.number)) {
      row.issues = [...(row.issues || []), 'Prosjektnummeret finnes fra før og blir oppdatert.'];
      if (row.severity === 'ok') row.severity = 'review';
      row.update = true;
    }
    planned.push(row);
  }
  return { rows: planned };
}

export async function readCompanyProjectTable(bytes, filename = '') {
  const tables = await readSpreadsheetTables(bytes, filename);
  let best = null;
  for (const sheet of tables || []) {
    const table = sheet?.table || [];
    const index = headerIndex(table);
    if (index < 0) continue;
    const rank = (table[index] || []).filter((cell) => fieldOf(cell)).length;
    if (!best || rank > best.rank) best = { table, index, rank };
  }
  if (!best) throw new Error('Fant ingen prosjektliste. Oversikten trenger kolonner for prosjektnummer og prosjektnavn.');
  const header = best.table[best.index].map((cell) => fieldOf(cell));
  if (!header.includes('number') || !header.includes('name')) {
    throw new Error('Listen mangler kolonner for prosjektnummer og prosjektnavn.');
  }
  const projects = [];
  for (const cells of best.table.slice(best.index + 1)) {
    const row = {};
    header.forEach((field, index) => {
      if (!field || row[field]) return;
      const value = text(cells?.[index]);
      if (value) row[field] = value;
    });
    if (text(row.number) || text(row.name)) projects.push(row);
  }
  if (!projects.length) throw new Error('Listen har ingen prosjekter.');
  return projects;
}

export const PROJECT_REGISTER_IMPORT_ACCEPT = CUSTOMER_IMPORT_ACCEPT;
