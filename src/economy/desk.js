/** Tabell og valg mellom kunder og avtaler i Økonomi. */

import { kindLabel } from '../anbud/agreementTemplate.js';
import { formatNok } from '../anbud/model.js';
import { formatOrgnr } from '../anbud/customers.js';

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

function contractExtra(contract) {
  return [
    kindLabel(contract.kind) || '',
    [contract.start, contract.end].filter(Boolean).join(' – '),
    contract.value ? formatNok(contract.value) : '',
    contract.status === 'avsluttet' ? 'Avsluttet' : 'Aktiv',
  ].filter(Boolean).join(' · ');
}

export function economyTableRows(customers = [], contracts = [], query = '') {
  const customerRows = (Array.isArray(customers) ? customers : []).map((customer) => {
    const related = relatedContracts(contracts, customer);
    return {
      key: `kunde:${customer.id}`,
      kind: 'kunde',
      customerId: customer.id,
      contractId: '',
      title: customer.name,
      party: customer.kind === 'person' ? 'Privatkunde' : (formatOrgnr(customer.orgnr) || 'Virksomhet'),
      extra: related.length === 1 ? '1 avtale' : `${related.length} avtaler`,
      sort: fold(customer.name),
    };
  });
  const contractRows = (Array.isArray(contracts) ? contracts : []).map((contract) => ({
    key: `avtale:${contract.id}`,
    kind: 'avtale',
    customerId: contract.customerId || '',
    contractId: contract.id,
    title: text(contract.title) || 'Avtale uten navn',
    party: text(contract.buyer) || 'Uten kunde',
    extra: contractExtra(contract),
    sort: fold(contract.title || contract.buyer),
  }));
  const rows = [...customerRows, ...contractRows].sort((a, b) => {
    if (a.sort === b.sort) return a.kind.localeCompare(b.kind);
    return a.sort.localeCompare(b.sort, 'nb');
  });
  const q = fold(query);
  if (!q) return rows;
  return rows.filter((row) => fold(`${row.kind} ${row.title} ${row.party} ${row.extra}`).includes(q));
}
