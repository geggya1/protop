/**
 * Hurtigimport av bedriftens prosjektliste fra Excel/CSV (f.eks. Moment overview).
 * Kobler mot kunder via kundenummer, org.nr eller navn når det finnes i kunderegisteret.
 * Rammeavtale / oppdragsavtale settes ikke fra listen, men feltene ligger klare etterpå.
 */
import { readSpreadsheetTables, CUSTOMER_IMPORT_ACCEPT } from '../anbud/customerImport.js';
import {
  namesLikelyMatch,
  normalizeCustomerNumber,
  normalizeOrgnr,
} from '../anbud/customers.js';
import { normalizePricingModel } from './projectFields.js';

const FIELDS = [
  ['number', ['prosjektnr', 'prosjektnummer', 'projectnumber', 'projectno']],
  ['name', ['prosjektnavn', 'prosjekt', 'projectname', 'tittel']],
  ['customerNumber', ['kundenr', 'kundenummer', 'customernumber', 'customerno']],
  ['client', ['kundenavn', 'kunde', 'oppdragsgiver', 'buyer', 'customer']],
  ['orgnr', ['orgnr', 'org.nr', 'organisasjonsnummer', 'orgno']],
  ['supplierLabel', ['leverandorkunde', 'leverandør/kunde', 'leverandør', 'supplier']],
  ['customerTags', ['kundetagger', 'customertags']],
  ['parentNumber', ['hovedprosjektnr', 'hovedprosjektnummer']],
  ['parentName', ['hovedprosjektnavn']],
  ['department', ['avdeling', 'department']],
  ['inboxEmail', ['momenteostadresse', 'moment-e-postadresse', 'prosjektepost', 'inbox']],
  ['manager', ['prosjekteier', 'prosjektleder', 'owner', 'manager']],
  ['status', ['prosjektstatus', 'status']],
  ['statusComment', ['statuskommentar', 'status comment']],
  ['openedAt', ['opprettet', 'created', 'opprettetdato']],
  ['createdBy', ['opprettetav', 'createdby']],
  ['start', ['start', 'startdato', 'fra']],
  ['end', ['slutt', 'sluttdato', 'til']],
  ['customerSegment', ['kundesegment', 'segment']],
  ['marketArea', ['markedsomrade', 'markedsområde', 'marketarea']],
  ['projectTags', ['prosjekttagger', 'projecttags', 'tagger']],
  ['size', ['storrelse', 'størrelse', 'size']],
  ['street', ['gate', 'adresse', 'address']],
  ['postalCode', ['postnr', 'postnummer', 'postalcode']],
  ['placeName', ['poststed', 'city']],
  ['cadastralId', ['matrikkelid', 'matrikkel-id', 'matrikkel']],
  ['pricingModel', ['prismodell', 'pricingmodel']],
  ['feeEstimate', ['honorarestimat', 'honorar', 'feeestimate']],
  ['billedOnPricingModels', ['fakturertpaprismodeller', 'fakturert på prismodeller']],
  ['description', ['beskrivelse', 'description']],
  ['exportStatus', ['eksportstatus']],
  ['hoursPeriod', ['timerperiode', 'timer (periode)', 'timer']],
  ['billableHours', ['fakturerbart', 'billable']],
  ['toInvoice', ['afaktureres', 'å faktureres']],
  ['totalCost', ['totalkostnad', 'total kostnad']],
  ['invoices', ['fakturaer', 'invoices']],
  ['estimatedIncome', ['estimertinntekt', 'estimert inntekt']],
  ['totalPlanned', ['totalplanned', 'total planned']],
  ['futurePlanned', ['futureplanned', 'future planned']],
  ['forecast', ['forecast']],
  ['estimatedCosts', ['estimertkostnader', 'estimerte kostnader']],
  ['expenses', ['expensescosts', 'expenses (costs)', 'expenses']],
  ['estimatedResult', ['estimertresultat', 'estimert resultat']],
  ['estimatedResultPct', ['estresultat', 'est. resultat %', 'est resultat']],
  ['profitFactor', ['profittfaktor']],
  ['expectedProfitFactor', ['forventetprofittfaktor', 'forventet profittfaktor']],
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

/** Stabil nøkkel for å gruppere rader som hører til samme kunde i importfilen. */
export function customerIdentityKey(hint = {}) {
  const number = normalizeCustomerNumber(hint.customerNumber);
  if (number) return `nr:${number}`;
  const orgnr = normalizeOrgnr(hint.orgnr);
  if (orgnr) return `org:${orgnr}`;
  const name = fold(hint.client || hint.name);
  if (name) return `name:${name}`;
  return '';
}

function scoreCustomer(customer, hint = {}) {
  let score = 0;
  const number = normalizeCustomerNumber(hint.customerNumber);
  const orgnr = normalizeOrgnr(hint.orgnr);
  const name = text(hint.client || hint.name);
  if (number && normalizeCustomerNumber(customer.customerNumber) === number) score += 100;
  if (orgnr && normalizeOrgnr(customer.orgnr) === orgnr) score += 80;
  if (name && fold(customer.name) === fold(name)) score += 60;
  else if (name && namesLikelyMatch(customer.name, name)) score += 40;
  else if (name && fold(customer.name) && fold(name)) {
    const left = fold(customer.name);
    const right = fold(name);
    if (left.includes(right) || right.includes(left)) score += 25;
  }
  return score;
}

/**
 * Kobler prosjektkunde mot kunderegisteret.
 * Prioritet: kundenummer → org.nr → eksakt navn → mykt navn (AS/kommune-varianter).
 */
export function matchCustomer(customers, hint = {}) {
  const list = Array.isArray(customers) ? customers : [];
  if (!list.length) return null;
  const number = normalizeCustomerNumber(hint.customerNumber);
  if (number) {
    const byNumber = list.filter((row) => normalizeCustomerNumber(row.customerNumber) === number);
    if (byNumber.length === 1) return byNumber[0];
    if (byNumber.length > 1) {
      const ranked = [...byNumber].sort((a, b) => scoreCustomer(b, hint) - scoreCustomer(a, hint));
      if (scoreCustomer(ranked[0], hint) > scoreCustomer(ranked[1], hint)) return ranked[0];
    }
  }
  const orgnr = normalizeOrgnr(hint.orgnr);
  if (orgnr) {
    const byOrgnr = list.filter((row) => normalizeOrgnr(row.orgnr) === orgnr);
    if (byOrgnr.length === 1) return byOrgnr[0];
    if (byOrgnr.length > 1) {
      const ranked = [...byOrgnr].sort((a, b) => scoreCustomer(b, hint) - scoreCustomer(a, hint));
      if (scoreCustomer(ranked[0], hint) > scoreCustomer(ranked[1], hint)) return ranked[0];
      // Samme org.nr = samme virksomhet; ta første ved ellers lik score.
      return ranked[0];
    }
  }
  const name = text(hint.client || hint.name);
  if (name) {
    const exact = list.filter((row) => fold(row.name) === fold(name));
    if (exact.length === 1) return exact[0];
    const soft = list.filter((row) => namesLikelyMatch(row.name, name));
    if (soft.length === 1) return soft[0];
    if (soft.length > 1) {
      const ranked = [...soft].sort((a, b) => scoreCustomer(b, hint) - scoreCustomer(a, hint));
      if (scoreCustomer(ranked[0], hint) > scoreCustomer(ranked[1], hint)) return ranked[0];
    }
  }
  return null;
}

/** Kandidater til manuell kobling i importgjennomgangen. */
export function suggestCustomers(customers, hint = {}, limit = 8) {
  const list = Array.isArray(customers) ? customers : [];
  const query = fold(hint.query || hint.client || hint.name || hint.customerNumber || hint.orgnr);
  const ranked = list
    .map((customer) => {
      let score = scoreCustomer(customer, hint);
      if (query) {
        const hay = fold([customer.customerNumber, customer.name, customer.orgnr].filter(Boolean).join(' '));
        if (hay.includes(query)) score += 15;
        else score -= 5;
      }
      return { customer, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.customer.name.localeCompare(b.customer.name, 'nb'));
  const out = [];
  const seen = new Set();
  for (const row of ranked) {
    if (seen.has(row.customer.id)) continue;
    seen.add(row.customer.id);
    out.push(row.customer);
    if (out.length >= limit) break;
  }
  if (out.length || !query) return out;
  return list
    .filter((customer) => {
      const hay = fold([customer.customerNumber, customer.name, customer.orgnr].filter(Boolean).join(' '));
      return hay.includes(query);
    })
    .slice(0, limit);
}

export function linkImportRowCustomer(row, customer) {
  if (!row || row.severity === 'block' || !customer?.id) return row;
  const customerNumber = normalizeCustomerNumber(customer.customerNumber) || text(row.customerNumber);
  const client = text(customer.name) || text(row.client);
  const orgnr = normalizeOrgnr(customer.orgnr) || text(row.orgnr);
  const issues = (row.issues || []).filter((issue) => !/kunde/i.test(issue));
  let severity = row.severity;
  if (!issues.length && severity === 'review') severity = 'ok';
  if (issues.some((issue) => /avtale/i.test(issue))) severity = 'review';
  const project = row.project ? {
    ...row.project,
    customerId: customer.id,
    customerNumber,
    client,
    orgnr,
  } : null;
  return {
    ...row,
    severity,
    issues,
    customerId: customer.id,
    customerNumber,
    client,
    orgnr,
    project,
    linkedManually: true,
  };
}

/** Koble valgt kunde til én rad, eller til alle rader med samme kundeidentitet i filen. */
export function linkImportPlanCustomer(plan, rowIndex, customer, { applyGroup = true } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const target = rows[rowIndex];
  if (!target || !customer?.id) return plan;
  const key = customerIdentityKey(target);
  const nextRows = rows.map((row, index) => {
    if (index === rowIndex) return linkImportRowCustomer(row, customer);
    if (applyGroup && key && customerIdentityKey(row) === key && !row.customerId) {
      return linkImportRowCustomer(row, customer);
    }
    return row;
  });
  return { ...plan, rows: nextRows };
}

export function matchAgreement(contracts, hint = {}, customerId = '') {
  const list = (Array.isArray(contracts) ? contracts : []).filter((row) => row && row.status !== 'avsluttet' && !row.deletedAt);
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

function looksLikeProjectNumber(value) {
  const raw = text(value);
  if (!raw) return false;
  const key = fold(raw);
  if (key === 'totalt' || key === 'sum' || key === 'total') return false;
  return /\d/.test(raw);
}

function looksLikeSummaryName(value) {
  const raw = text(value);
  return !!raw && /^[\d\s.,]+$/.test(raw);
}

export function companyProjectRow(input, customers = [], contracts = []) {
  const row = input && typeof input === 'object' ? input : {};
  const number = text(row.number);
  const name = text(row.name);
  const customerNumber = normalizeCustomerNumber(row.customerNumber) || text(row.customerNumber);
  const client = text(row.client);
  const orgnr = normalizeOrgnr(row.orgnr);
  const customer = row.customerId
    ? (customers || []).find((item) => item.id === row.customerId) || matchCustomer(customers, { customerNumber, orgnr, client })
    : matchCustomer(customers, { customerNumber, orgnr, client });
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
  } else if (!looksLikeProjectNumber(number) || looksLikeSummaryName(name)) {
    severity = 'block';
    issues.push('Ser ut som summeringsrad, ikke et prosjekt.');
  } else {
    if (!customer) {
      severity = 'review';
      if (client || customerNumber || orgnr) {
        issues.push('Kunden er ikke koblet ennå. Velg kunde under før du importerer.');
      } else {
        issues.push('Ingen kunde i listen. Velg kunde under før du importerer.');
      }
    }
    if (!agreement && !framework) {
      if (severity === 'ok') severity = 'review';
      issues.push('Ingen avtale er koblet. Den kan knyttes etter import; prosjektet markeres med varsel.');
    }
  }

  const blocked = severity === 'block';
  const place = placeOf(row);
  const pricingModel = normalizePricingModel(row.pricingModel);
  const feeEstimate = text(row.feeEstimate);
  const project = blocked ? null : {
    number,
    name,
    customerNumber: customer?.customerNumber || customerNumber,
    client: customer?.name || client,
    orgnr: customer?.orgnr || orgnr,
    customerId: customer?.id || '',
    parentNumber: text(row.parentNumber),
    parentName: text(row.parentName),
    department: text(row.department),
    manager: text(row.manager),
    projectStatus: text(row.status),
    statusComment: text(row.statusComment),
    start: text(row.start),
    end: text(row.end),
    street: text(row.street),
    postalCode: text(row.postalCode),
    placeName: text(row.placeName),
    place,
    cadastralId: text(row.cadastralId),
    pricingModel,
    pricingSettings: pricingModel === 'hourly' && feeEstimate
      ? { hourlyRate: feeEstimate }
      : (pricingModel === 'fixed' && feeEstimate
        ? { fixedFee: feeEstimate }
        : {}),
    feeEstimate,
    description: text(row.description),
    // Timer/økonomi og Moment-restfelter nullstilles ved lagring — fylles av andre moduler.
    phase: phaseFromStatus(row.status),
    agreementKind,
    contractId: agreement?.id || '',
    frameworkAgreementId: framework?.id || (agreement?.kind === 'rammeavtale' ? agreement.id : ''),
  };
  return {
    severity,
    issues,
    number,
    name,
    customerNumber: customer?.customerNumber || customerNumber,
    client: customer?.name || client,
    orgnr: customer?.orgnr || orgnr,
    customerId: customer?.id || '',
    place,
    manager: text(row.manager),
    start: text(row.start),
    end: text(row.end),
    description: text(row.description),
    phase: phaseFromStatus(row.status),
    department: text(row.department),
    parentNumber: text(row.parentNumber),
    projectStatus: text(row.status),
    agreementKind,
    contractId: agreement?.id || '',
    frameworkAgreementId: framework?.id || (agreement?.kind === 'rammeavtale' ? agreement.id : ''),
    project,
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
