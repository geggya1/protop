/**
 * Utbetaling av utlegg og kjøregodtgjørelse til de ansatte.
 *
 * Det den ansatte har betalt privat (paidBy 'personal'), og som er godkjent, skal tilbake til den
 * ansatte. Hvordan settes på den ansatte under HR → Lønn, med bedriftens standard under
 * Økonomi → Innstillinger → Reise og kjøring (expensePayout i src/mileage/compensation.js):
 * - payroll: med neste lønnskjøring. Utlegg er trekkfri refusjon. Kjøregodtgjørelse over trekkfri
 *   sats er skattepliktig (taxableAmount på utlegget), og må på lønnslippen som det.
 * - direct: egen utbetaling til konto.
 *
 * Når utbetalingen er gjort, markeres utleggene «Utbetalt» med lønnsperioden (payoutPeriod,
 * «åååå-mm»), måten (payoutMethod) og tidspunktet (reimbursedAt).
 */
import { normalizeExpense } from './expenses.js';
import { roundMoney } from './vat.js';

function text(value) {
  return String(value ?? '').trim();
}

/** Godkjente utlegg som den ansatte har betalt selv, og som ikke er utbetalt ennå. */
export function isPayable(row) {
  if (!row) return false;
  const expense = normalizeExpense(row);
  return expense.paidBy === 'personal'
    && expense.status === 'approved'
    && !text(row.reimbursedAt)
    && Math.abs(expense.amountInclVat) > 0;
}

/** Til utbetaling: utleggene som venter, til og med en dato (tom: alle). */
export function payableExpenses(expenses = [], { employeeId = '', until = '' } = {}) {
  return (expenses || []).filter((row) => isPayable(row)
    && (!employeeId || text(row.employeeId) === employeeId)
    && (!until || text(row.date) <= until));
}

/** Utbetalingen for en rad: refusjon (trekkfri) og skattepliktig del av kjøregodtgjørelsen. */
export function payoutParts(row) {
  const expense = normalizeExpense(row);
  const total = roundMoney(expense.amountInclVat);
  const taxable = expense.category === 'mileage' ? Math.min(total, roundMoney(Number(row.taxableAmount) || 0)) : 0;
  return { total, taxable, taxFree: roundMoney(total - taxable) };
}

/**
 * Summen per ansatt: [{ employeeId, employeeName, count, total, taxFree, taxable, mileage, outlays, oldest }].
 * Størst beløp først.
 */
export function payoutSummary(expenses = [], options = {}) {
  const groups = new Map();
  for (const row of payableExpenses(expenses, options)) {
    const id = text(row.employeeId) || `navn:${text(row.employeeName)}`;
    const group = groups.get(id) || {
      employeeId: text(row.employeeId),
      employeeName: text(row.employeeName),
      count: 0,
      total: 0,
      taxFree: 0,
      taxable: 0,
      mileage: 0,
      outlays: 0,
      oldest: '',
    };
    const parts = payoutParts(row);
    group.count += 1;
    group.total = roundMoney(group.total + parts.total);
    group.taxFree = roundMoney(group.taxFree + parts.taxFree);
    group.taxable = roundMoney(group.taxable + parts.taxable);
    if (row.category === 'mileage') group.mileage = roundMoney(group.mileage + parts.total);
    else group.outlays = roundMoney(group.outlays + parts.total);
    if (!group.oldest || text(row.date) < group.oldest) group.oldest = text(row.date);
    if (!group.employeeName && row.employeeName) group.employeeName = text(row.employeeName);
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

/** Lønnsperioden («åååå-mm») for en dato. */
export function payoutPeriodOf(date = new Date()) {
  const d = date instanceof Date ? date : new Date(`${text(date).slice(0, 10)}T12:00:00`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Linjene til lønn, én per utlegg og del:
 * - «Refusjon utlegg» (trekkfri, ikke opplysningspliktig),
 * - «Bilgodtgjørelse, trekkfri» og «Bilgodtgjørelse, trekkpliktig» for kjøring.
 */
export function payrollLines(expenses = []) {
  const lines = [];
  for (const row of expenses || []) {
    const parts = payoutParts(row);
    const base = {
      employeeId: text(row.employeeId),
      employeeName: text(row.employeeName),
      date: text(row.date),
      description: text(row.description) || text(row.purpose),
      expenseId: text(row.id),
    };
    if (row.category === 'mileage') {
      if (parts.taxFree > 0) lines.push({ ...base, kind: 'mileageTaxFree', label: 'Bilgodtgjørelse, trekkfri', amount: parts.taxFree });
      if (parts.taxable > 0) lines.push({ ...base, kind: 'mileageTaxable', label: 'Bilgodtgjørelse, trekkpliktig', amount: parts.taxable });
    } else if (parts.total) {
      lines.push({ ...base, kind: 'outlay', label: 'Refusjon utlegg', amount: parts.total });
    }
  }
  return lines;
}

/** CSV til lønn (semikolon, BOM for Excel). */
export function payrollCsv(expenses = [], { period = '' } = {}) {
  const header = ['Periode', 'Ansatt-ID', 'Ansatt', 'Dato', 'Lønnsart', 'Beløp', 'Beskrivelse', 'Utlegg-ID'];
  const rows = payrollLines(expenses).map((line) => [
    period,
    line.employeeId,
    line.employeeName,
    line.date,
    line.label,
    String(line.amount.toFixed(2)).replace('.', ','),
    line.description,
    line.expenseId,
  ].map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';'));
  return `﻿${header.join(';')}\n${rows.join('\n')}`;
}

/** Utlegget markert som utbetalt i en periode. */
export function markReimbursed(row, { period, method = 'payroll', at = new Date().toISOString() } = {}) {
  return {
    ...row,
    status: 'reimbursed',
    reimbursedAt: at,
    payoutPeriod: text(period) || payoutPeriodOf(at),
    payoutMethod: method === 'direct' ? 'direct' : 'payroll',
  };
}
