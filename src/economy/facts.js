/** Økonomiske sammendrag per kunde og avtale. */

import { formatNok } from '../anbud/model.js';
import { kindLabel } from '../anbud/agreementTemplate.js';
import { matchCustomer, relatedContracts } from './desk.js';

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function customerEconomy(customer, contracts = []) {
  const related = relatedContracts(contracts, customer);
  const active = related.filter((row) => row.status !== 'avsluttet');
  const total = related.reduce((sum, row) => sum + number(row.value), 0);
  const indexed = related.filter((row) => row.indexDraft?.indexId || row.indexDraft?.standard || row.fields?.indexId || row.fields?.standard);
  return {
    related,
    contractCount: related.length,
    activeCount: active.length,
    totalValue: total,
    indexedCount: indexed.length,
    totalLabel: total ? formatNok(total) : '',
  };
}

export function contractEconomy(contract, customers = []) {
  const fields = contract?.fields && typeof contract.fields === 'object' ? contract.fields : {};
  const draft = contract?.indexDraft && typeof contract.indexDraft === 'object' ? contract.indexDraft : {};
  const customer = matchCustomer(customers, contract);
  return {
    customer,
    title: contract?.title || '',
    buyer: contract?.buyer || customer?.name || '',
    kind: kindLabel(contract?.kind) || '',
    value: number(contract?.value),
    valueLabel: contract?.value ? formatNok(contract.value) : '',
    period: [contract?.start, contract?.end].filter(Boolean).join(' – '),
    status: contract?.status === 'avsluttet' ? 'Avsluttet' : 'Aktiv',
    standard: draft.standard || fields.standard || '',
    indexId: draft.indexId || fields.indexId || '',
    honorar: draft.honorar || fields.honorar || contract?.honorar || '',
    reference: draft.reference || fields.reference || '',
    hasIndex: !!(draft.indexId || fields.indexId || draft.standard || fields.standard),
  };
}
