import assert from 'node:assert/strict';
import {
  addProjectMember,
  createProject,
  emptyProjectState,
  setTimeEntryStatus,
  upsertTimeEntry,
  updateProject,
} from '../project/engine.js';
import { buildBillingProposals, createInvoiceFromProposal, markEntriesInvoiced } from './billingFromHours.js';
import { buildKid, validateKid, mod10CheckDigit } from './kid.js';
import { calcLineVat, invoiceVatTotals, VAT_CODES } from './vat.js';
import { voucherFromInvoice, voucherBalances } from './vouchers.js';
import { buildEhfXml, validateEhfBasics } from './ehf.js';
import { reportByEmployee, reportSummary, entriesToCsv } from '../arbeid/reports.js';
import { rateWithOvertime, TIME_TYPES } from '../arbeid/overtime.js';

// --- VAT ---
assert.ok(VAT_CODES.some((r) => r.id === 'HIGH' && r.percent === 25));
const line = calcLineVat({ quantity: 8, unitPrice: 1359, vatCode: 'HIGH' });
assert.equal(line.amountExVat, 10872);
assert.equal(line.vatAmount, 2718);
assert.equal(line.amountInclVat, 13590);
const totals = invoiceVatTotals([line, calcLineVat({ quantity: 1, unitPrice: 100, vatCode: 'LOW' })]);
assert.equal(totals.groups.length, 2);

// --- KID ---
const kid = buildKid({ customerNumber: '42', invoiceNumber: '10001', customerWidth: 4, invoiceWidth: 6 });
assert.equal(kid.length, 11); // 4+6+1
assert.equal(validateKid(kid).ok, true);
assert.equal(validateKid(kid.slice(0, -1) + '0').ok, false);
assert.equal(mod10CheckDigit('1234567890'), '3');

// --- Overtid ---
assert.equal(rateWithOvertime(1000, 'overtime_50'), 1500);
assert.equal(rateWithOvertime(1000, 'overtime_100'), 2000);
assert.ok(TIME_TYPES.length >= 4);

// --- Full pipeline: timer → godkjenning → faktura → bilag → EHF ---
let state = emptyProjectState();
state = createProject(state, {
  name: 'Foss Eikeland',
  number: '10374',
  client: 'Mg Næring AS',
  customerNumber: '1042',
  orgnr: '912345678',
  customerId: 'cust1',
  pricingModel: 'hourly',
}).state;
state = updateProject(state, state.activeProjectId, {
  pricingSettings: { hourlyRate: 1359 },
}).state;
const projectId = state.activeProjectId;
state = addProjectMember(state, {
  projectId,
  employeeId: 'emp1',
  employeeName: 'Ola Nordmann',
  role: 'Prosjektleder',
}).state;

state = upsertTimeEntry(state, {
  projectId,
  employeeId: 'emp1',
  employeeName: 'Ola Nordmann',
  date: '2026-10-06',
  hours: 7.5,
  description: 'Befaring',
  timeType: 'ordinary',
}).state;
state = upsertTimeEntry(state, {
  projectId,
  employeeId: 'emp1',
  employeeName: 'Ola Nordmann',
  date: '2026-10-07',
  hours: 2,
  description: 'Kveldsarbeid',
  timeType: 'overtime_50',
}).state;

for (const row of state.timeEntries) {
  state = setTimeEntryStatus(state, row.id, 'godkjent').state;
}

const proposals = buildBillingProposals(state, { onlyApproved: true });
assert.equal(proposals.length, 1);
assert.ok(proposals[0].hours >= 9);

const created = createInvoiceFromProposal(proposals[0], {
  existingInvoices: [],
  vatCode: 'HIGH',
  groupBy: 'activity',
  bankAccount: '12345678903',
});
assert.equal(created.ok, true, created.error);
assert.ok(created.invoice.lines.length >= 1);
assert.ok(created.invoice.kid);
assert.equal(validateKid(created.invoice.kid).ok, true);
assert.ok(created.invoice.amountInclVat > created.invoice.amountExVat);

const voucher = voucherFromInvoice(created.invoice);
assert.equal(voucher.ok, true, voucher.error);
const bal = voucherBalances(voucher.voucher);
assert.equal(bal.debit, bal.credit);

const ehf = validateEhfBasics(created.invoice, {
  name: 'ProTop AS',
  orgnr: '999888777',
  bankAccount: '12345678903',
  address: 'Storgata 1',
  city: 'Oslo',
  postalCode: '0150',
});
assert.equal(ehf.ok, true, ehf.error);
assert.ok(ehf.xml.includes('CustomizationID'));
assert.ok(ehf.xml.includes('InvoiceLine'));
assert.ok(ehf.xml.includes(created.invoice.kid));

state = markEntriesInvoiced(state, created.invoice.timeEntryIds, created.invoice.id);
assert.ok(state.timeEntries.every((row) => row.invoiceId === created.invoice.id));
assert.equal(buildBillingProposals(state, { onlyApproved: true }).length, 0);

const summary = reportSummary(state.timeEntries);
assert.equal(summary.count, 2);
assert.ok(summary.overtimeHours >= 2);
const byEmp = reportByEmployee(state.timeEntries);
assert.equal(byEmp[0].employeeName, 'Ola Nordmann');
const csv = entriesToCsv(state.timeEntries);
assert.ok(csv.includes('Overtid 50'));

// EHF uten orgnr på selger skal feile tydelig
const bad = buildEhfXml(created.invoice, { supplier: { name: 'X', orgnr: '12' } });
assert.equal(bad.ok, false);

console.log('billingPipeline.test.mjs: ok');
