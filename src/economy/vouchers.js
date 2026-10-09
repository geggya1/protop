/**
 * Bilag / regnskapsføring fra faktura.
 */

import { receivableAccount, vatPayableAccount, incomeAccountForHours, ledgerAccount } from './accountsChart.js';
import { invoiceVatTotals, roundMoney } from './vat.js';

function newVoucherId() {
  return `bilag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyVoucher(overrides = {}) {
  return {
    id: newVoucherId(),
    invoiceId: '',
    invoiceNumber: '',
    date: '',
    text: '',
    lines: [],
    createdAt: '',
    ...overrides,
  };
}

/**
 * Bygg bilag: Debet 1500 / Kredit salg + MVA.
 */
export function voucherFromInvoice(invoice) {
  if (!invoice) return { ok: false, error: 'Faktura mangler.', voucher: null };
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
  const totals = lines.length
    ? invoiceVatTotals(lines)
    : {
      amountExVat: Number(invoice.amountExVat) || 0,
      vat: Number(invoice.vat) || 0,
      amountInclVat: Number(invoice.amountInclVat) || 0,
      groups: [],
    };
  if (!(totals.amountInclVat > 0) && !(totals.amountInclVat < 0)) {
    return { ok: false, error: 'Faktura har ikke beløp å bokføre.', voucher: null };
  }

  const voucherLines = [];
  // Debet kundefordringer
  voucherLines.push({
    account: receivableAccount(),
    accountName: ledgerAccount(receivableAccount())?.name || 'Kundefordringer',
    debit: roundMoney(Math.abs(totals.amountInclVat)),
    credit: 0,
    vatCode: '',
  });

  // Kredit inntekt
  const incomeAcc = incomeAccountForHours();
  voucherLines.push({
    account: incomeAcc,
    accountName: ledgerAccount(incomeAcc)?.name || 'Salgsinntekt',
    debit: 0,
    credit: roundMoney(Math.abs(totals.amountExVat)),
    vatCode: invoice.vatCode || 'HIGH',
  });

  // Kredit MVA per gruppe
  const groups = totals.groups?.length
    ? totals.groups
    : [{ vatCode: invoice.vatCode || 'HIGH', vatAmount: totals.vat }];
  for (const g of groups) {
    if (!(Math.abs(g.vatAmount) > 0)) continue;
    const acc = vatPayableAccount(g.vatCode);
    if (!acc) continue;
    voucherLines.push({
      account: acc,
      accountName: ledgerAccount(acc)?.name || 'Utgående MVA',
      debit: 0,
      credit: roundMoney(Math.abs(g.vatAmount)),
      vatCode: g.vatCode,
    });
  }

  const debit = roundMoney(voucherLines.reduce((s, l) => s + l.debit, 0));
  const credit = roundMoney(voucherLines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(debit - credit) > 0.05) {
    return { ok: false, error: `Bilaget balanseerer ikke (debet ${debit} / kredit ${credit}).`, voucher: null };
  }

  const voucher = emptyVoucher({
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.invoiceDate || new Date().toISOString().slice(0, 10),
    text: `Faktura ${invoice.invoiceNumber} — ${invoice.customerName}`,
    lines: voucherLines,
    createdAt: new Date().toISOString(),
  });
  return { ok: true, error: null, voucher };
}

/** Enkel kreditnota = speilet bilag. */
export function creditVoucherFromInvoice(invoice) {
  const base = voucherFromInvoice(invoice);
  if (!base.ok) return base;
  return {
    ok: true,
    error: null,
    voucher: {
      ...base.voucher,
      id: newVoucherId(),
      text: `Kreditnota ${invoice.invoiceNumber}`,
      lines: base.voucher.lines.map((line) => ({
        ...line,
        debit: line.credit,
        credit: line.debit,
      })),
    },
  };
}

export function voucherBalances(voucher) {
  const lines = voucher?.lines || [];
  return {
    debit: roundMoney(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)),
    credit: roundMoney(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)),
  };
}

export function formatVoucherLines(voucher) {
  return (voucher?.lines || []).map((line) => (
    `${line.account} ${line.accountName}: D ${line.debit} / K ${line.credit}`
  )).join('\n');
}
