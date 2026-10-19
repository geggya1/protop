/**
 * Parkering, lading og andre kostnader kunden betaler på en kjøretur.
 * Hver linje kan ha et bilag.
 */

import { roundMoney } from '../economy/vat.js';

export const CUSTOMER_COST_KINDS = [
  { id: 'parking', label: 'Parkering' },
  { id: 'charging', label: 'Lading' },
  { id: 'other', label: 'Annet' },
];

function text(value) {
  return String(value ?? '').trim();
}

export function normalizeCustomerCosts(input) {
  const rows = Array.isArray(input) ? input : [];
  return rows.map((row, index) => {
    const kind = CUSTOMER_COST_KINDS.some((item) => item.id === row?.kind) ? row.kind : 'other';
    const amount = roundMoney(Math.max(0, Number(String(row?.amount ?? '').replace(',', '.')) || 0));
    return {
      id: text(row?.id) || `kost-${index + 1}`,
      kind,
      label: text(row?.label),
      amount,
      receiptUri: text(row?.receiptUri),
      receiptName: text(row?.receiptName),
    };
  }).filter((row) => row.amount > 0 || row.receiptUri || row.label);
}

export function sumCustomerCosts(rows, kind) {
  return roundMoney((rows || []).reduce((sum, row) => (
    !kind || row.kind === kind ? sum + (Number(row.amount) || 0) : sum
  ), 0));
}

export function customerCostTitle(row) {
  const kind = CUSTOMER_COST_KINDS.find((item) => item.id === row?.kind)?.label || 'Annet';
  const note = text(row?.label);
  return note && row?.kind === 'other' ? `${kind}: ${note}` : (note ? `${kind} · ${note}` : kind);
}
