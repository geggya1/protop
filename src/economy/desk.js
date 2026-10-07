/** Tabell og valg mellom kunder, avtaler og prosjekt i Økonomi. */

import { kindLabel } from '../anbud/agreementTemplate.js';
import { formatNok } from '../anbud/model.js';
import { formatOrgnr, ownerLabel } from '../anbud/customers.js';
import { formatNumberId, sortContractsChronological } from '../anbud/numbering.js';

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function fold(value) {
  return text(value).toLowerCase();
}

export function matchCustomer(customers, contract) {
  const rows = Array.isArray(customers) ? customers : [];
  if (!contract) return null;
  if (contract.customerId) {
    const byId = rows.find((row) => row.id === contract.customerId);
    if (byId) return byId;
  }
  const buyer = fold(contract.buyer);
  if (!buyer) return null;
  return rows.find((row) => fold(row.name) === buyer) || null;
}

export function relatedContracts(contracts, customer) {
  const rows = Array.isArray(contracts) ? contracts : [];
  if (!customer) return [];
  return rows.filter((row) => (
    row.customerId === customer.id
    || (!row.customerId && fold(row.buyer) === fold(customer.name))
  ));
}

export function contractsForProject(contracts, projectId) {
  const id = text(projectId);
  if (!id) return [];
  return (Array.isArray(contracts) ? contracts : []).filter((row) => text(row.projectId) === id);
}

function contractExtra(contract) {
  return [
    kindLabel(contract.kind) || '',
    [contract.start, contract.end].filter(Boolean).join(' – '),
    contract.value ? formatNok(contract.value) : '',
    contract.status === 'avsluttet' ? 'Avsluttet' : 'Aktiv',
  ].filter(Boolean).join(' · ');
}

function dueForProject(projectId, contracts, dueMap) {
  return contractsForProject(contracts, projectId).some((row) => dueMap?.[row.id]?.due);
}

export function economyTableRows(customers = [], contracts = [], query = '', {
  projects = [],
  dueById = {},
  includeCustomers = true,
} = {}) {
  const customerRows = includeCustomers ? (Array.isArray(customers) ? customers : []).map((customer) => {
    const related = relatedContracts(contracts, customer);
    return {
      key: `kunde:${customer.id}`,
      kind: 'kunde',
      customerId: customer.id,
      contractId: '',
      projectId: '',
      title: customer.name,
      party: customer.kind === 'person' ? 'Privatkunde' : (formatOrgnr(customer.orgnr) || 'Virksomhet'),
      extra: related.length === 1 ? '1 avtale' : `${related.length} avtaler`,
      due: false,
      dueReason: '',
      sort: fold(customer.name),
    };
  }) : [];
  const contractRows = (Array.isArray(contracts) ? contracts : []).map((contract) => {
    const status = dueById?.[contract.id];
    return {
      key: `avtale:${contract.id}`,
      kind: 'avtale',
      customerId: contract.customerId || '',
      contractId: contract.id,
      projectId: contract.projectId || '',
      title: text(contract.title) || 'Avtale uten navn',
      party: text(contract.buyer) || 'Uten kunde',
      extra: contractExtra(contract),
      due: !!status?.due,
      dueReason: status?.due ? (status.reason || 'Klar for indeksregulering') : '',
      sort: fold(contract.title || contract.buyer),
    };
  });
  const projectRows = (Array.isArray(projects) ? projects : [])
    .filter((project) => project?.status !== 'arkivert')
    .map((project) => {
      const related = contractsForProject(contracts, project.id);
      const due = dueForProject(project.id, contracts, dueById);
      return {
        key: `prosjekt:${project.id}`,
        kind: 'prosjekt',
        customerId: '',
        contractId: '',
        projectId: project.id,
        title: text(project.name || project.title) || 'Prosjekt uten navn',
        party: related.length ? `${related.length} avtale${related.length === 1 ? '' : 'r'}` : 'Uten avtale',
        extra: text(project.reference || project.status || ''),
        due,
        dueReason: due ? 'Klar for indeksregulering' : '',
        sort: fold(project.name || project.title),
      };
    });
  const rows = [...customerRows, ...projectRows, ...contractRows].sort((a, b) => {
    if (a.due !== b.due) return a.due ? -1 : 1;
    if (a.sort === b.sort) return a.kind.localeCompare(b.kind);
    return a.sort.localeCompare(b.sort, 'nb');
  });
  const q = fold(query);
  if (!q) return rows;
  return rows.filter((row) => fold(`${row.kind} ${row.title} ${row.party} ${row.extra}`).includes(q));
}

function contractValue(contract) {
  const n = Number(contract?.value);
  return Number.isFinite(n) ? n : 0;
}

/** Kundeliste for økonomi: volum og sum, ikke full kunderegistrering. */
export function economyCustomerRows(customers = [], contracts = [], people = [], query = '') {
  const rows = (Array.isArray(customers) ? customers : []).map((customer) => {
    const related = relatedContracts(contracts, customer);
    const sum = related.reduce((total, row) => total + contractValue(row), 0);
    return {
      key: customer.id,
      customerId: customer.id,
      name: customer.name,
      identity: customer.kind === 'person' ? 'Privatkunde' : (formatOrgnr(customer.orgnr) || 'Virksomhet'),
      agreements: related.length,
      value: sum,
      valueLabel: sum ? formatNok(sum) : '—',
      owner: ownerLabel(customer, people) || '—',
      sort: fold(customer.name),
    };
  }).sort((a, b) => a.sort.localeCompare(b.sort, 'nb'));
  const q = fold(query);
  if (!q) return rows;
  return rows.filter((row) => fold(`${row.name} ${row.identity} ${row.owner}`).includes(q));
}

/** Avtaleliste for økonomi: nummer, periode og sum — ikke NS 8403-registrering. */
export function economyContractRows(customers = [], contracts = [], people = [], query = '') {
  const rows = sortContractsChronological(Array.isArray(contracts) ? contracts : []).map((contract) => {
    const customer = matchCustomer(customers, contract);
    return {
      key: contract.id,
      contractId: contract.id,
      systemId: formatNumberId(contract.systemId) || '—',
      oppdragId: formatNumberId(contract.oppdragId) || '—',
      title: text(contract.title) || 'Avtale uten navn',
      buyer: text(contract.buyer) || 'Uten kunde',
      period: [contract.start, contract.end].filter(Boolean).join(' – ') || '—',
      value: contractValue(contract),
      valueLabel: contract.value ? formatNok(contract.value) : '—',
      status: contract.status === 'avsluttet' ? 'Avsluttet' : 'Aktiv',
      owner: ownerLabel(customer, people) || '—',
      kind: kindLabel(contract.kind) || '—',
    };
  });
  const q = fold(query);
  if (!q) return rows;
  return rows.filter((row) => fold([
    row.systemId, row.oppdragId, row.title, row.buyer, row.period, row.valueLabel, row.status, row.owner, row.kind,
  ].join(' ')).includes(q));
}
