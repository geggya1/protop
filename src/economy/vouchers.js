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

/** Kompakt snapshot for lagring på faktura.voucherLines. */
export function snapshotVoucherLines(voucher) {
  return (voucher?.lines || []).map((line) => ({
    account: String(line.account || ''),
    accountName: String(line.accountName || ''),
    debit: Number(line.debit) || 0,
    credit: Number(line.credit) || 0,
    vatCode: String(line.vatCode || ''),
  }));
}

/** Fest bilag-id + linjer på faktura (persistens uten egen collection). */
export function attachVoucherSnapshot(invoice, voucherResult) {
  if (!invoice || !voucherResult?.ok || !voucherResult.voucher) return invoice;
  return {
    ...invoice,
    voucherId: voucherResult.voucher.id,
    voucherLines: snapshotVoucherLines(voucherResult.voucher),
  };
}

/**
 * Bilag for en utstedt faktura eller kreditnota, ført per inntektskonto.
 * Faktura: debet kundefordringer, kredit inntekt og mva.
 * Kreditnota: speilet. Øreavrunding går til egen konto (7771 som standard).
 */
export function ledgerVoucher(invoice, { accountNames = {}, roundingAccount = '7771', totals = null } = {}) {
  if (!invoice) return { ok: false, error: 'Faktura mangler.', voucher: null };
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
  if (!lines.length) return { ok: false, error: 'Fakturaen har ingen linjer.', voucher: null };
  const sum = totals || invoiceVatTotals(lines);
  const credit = Number(sum.amountInclVat) < 0;
  const sign = (value) => roundMoney(Math.abs(Number(value) || 0));
  const name = (code, fallback) => accountNames[code] || ledgerAccount(code)?.name || fallback;
  const income = new Map();
  for (const line of lines) {
    const code = String(line.account || '').trim() || incomeAccountForHours();
    income.set(code, roundMoney((income.get(code) || 0) + (Number(line.amountExVat) || 0)));
  }
  const due = sum.totalDue != null ? Number(sum.totalDue) : Number(sum.amountInclVat);
  const rounding = roundMoney(due - Number(sum.amountInclVat || 0));
  const voucherLines = [{
    account: receivableAccount(),
    accountName: name(receivableAccount(), 'Kundefordringer'),
    debit: credit ? 0 : sign(due),
    credit: credit ? sign(due) : 0,
    vatCode: '',
  }];
  for (const [code, amount] of income) {
    if (!amount) continue;
    voucherLines.push({
      account: code,
      accountName: name(code, 'Salgsinntekt'),
      debit: credit ? sign(amount) : 0,
      credit: credit ? 0 : sign(amount),
      vatCode: '',
    });
  }
  for (const group of sum.groups || []) {
    if (!(Math.abs(group.vatAmount) > 0)) continue;
    const code = vatPayableAccount(group.vatCode);
    if (!code) continue;
    voucherLines.push({
      account: code,
      accountName: name(code, 'Utgående merverdiavgift'),
      debit: credit ? sign(group.vatAmount) : 0,
      credit: credit ? 0 : sign(group.vatAmount),
      vatCode: group.vatCode,
    });
  }
  if (Math.abs(rounding) >= 0.005) {
    // Avrundes beløpet opp, føres differansen i kredit. Ned: i debet.
    const up = rounding > 0;
    voucherLines.push({
      account: roundingAccount,
      accountName: name(roundingAccount, 'Øreavrunding'),
      debit: up ? 0 : sign(rounding),
      credit: up ? sign(rounding) : 0,
      vatCode: '',
    });
  }
  const debitSum = roundMoney(voucherLines.reduce((s, l) => s + l.debit, 0));
  const creditSum = roundMoney(voucherLines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(debitSum - creditSum) > 0.01) {
    return { ok: false, error: `Bilaget går ikke i balanse (debet ${debitSum} / kredit ${creditSum}).`, voucher: null };
  }
  const kind = credit ? 'Kreditnota' : 'Faktura';
  return {
    ok: true,
    error: null,
    voucher: emptyVoucher({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.invoiceDate || new Date().toISOString().slice(0, 10),
      text: `${kind} ${invoice.invoiceNumber} — ${invoice.customerName}`,
      lines: voucherLines,
      createdAt: new Date().toISOString(),
    }),
  };
}
