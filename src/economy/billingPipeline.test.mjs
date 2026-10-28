import assert from 'node:assert/strict';
import {
  addProjectMember,
  createProject,
  emptyProjectState,
  setTimeEntryStatus,
  upsertTimeEntry,
  updateProject,
} from '../project/engine.js';
import { approvedOnly, buildReadyProjects, selectableKeys, selectionFor } from './billingReady.js';
import { buildInvoiceDraft } from './invoiceDraft.js';
import { buildCreditNote, issueInvoice } from './invoiceFlow.js';
import { buildKid, validateKid, mod10CheckDigit, mod11CheckDigit, appendCheckDigit } from './kid.js';
import { calcLineVat, invoiceVatTotals, VAT_CODES, vatCodeById, roundMoney } from './vat.js';
import {
  attachVoucherSnapshot,
  voucherFromInvoice,
  creditVoucherFromInvoice,
  voucherBalances,
  snapshotVoucherLines,
} from './vouchers.js';
import { normalizeInvoice, toInvoiceCacheRow } from './invoices.js';
import { buildEhfXml, validateEhfBasics, supplierFromCompany } from './ehf.js';
import { reportByEmployee, reportSummary, entriesToCsv } from '../arbeid/reports.js';
import { rateWithOvertime, TIME_TYPES } from '../arbeid/overtime.js';
import { vatPayableAccount } from './accountsChart.js';

// --- VAT ---
assert.ok(VAT_CODES.some((r) => r.id === 'HIGH' && r.percent === 25));
const line = calcLineVat({ quantity: 8, unitPrice: 1359, vatCode: 'HIGH' });
assert.equal(line.amountExVat, 10872);
assert.equal(line.vatAmount, 2718);
assert.equal(line.amountInclVat, 13590);
const totals = invoiceVatTotals([line, calcLineVat({ quantity: 1, unitPrice: 100, vatCode: 'LOW' })]);
assert.equal(totals.groups.length, 2);

// MID / LOW / ZERO / EXEMPT
const mid = calcLineVat({ quantity: 10, unitPrice: 100, vatCode: 'MID' });
assert.equal(mid.vatPercent, 15);
assert.equal(mid.vatAmount, 150);
assert.equal(mid.amountInclVat, 1150);
assert.equal(vatCodeById('MID').category, 'S');

const low = calcLineVat({ quantity: 10, unitPrice: 100, vatCode: 'LOW' });
assert.equal(low.vatPercent, 12);
assert.equal(low.vatAmount, 120);
assert.equal(low.amountInclVat, 1120);

const zero = calcLineVat({ quantity: 10, unitPrice: 100, vatCode: 'ZERO' });
assert.equal(zero.vatPercent, 0);
assert.equal(zero.vatAmount, 0);
assert.equal(zero.amountInclVat, 1000);
assert.equal(vatCodeById('ZERO').category, 'Z');

const exempt = calcLineVat({ quantity: 10, unitPrice: 100, vatCode: 'EXEMPT' });
assert.equal(exempt.vatPercent, 0);
assert.equal(exempt.vatAmount, 0);
assert.equal(exempt.amountInclVat, 1000);
assert.equal(vatCodeById('EXEMPT').category, 'E');
assert.equal(vatPayableAccount('EXEMPT'), '');
assert.equal(vatPayableAccount('OUTSIDE'), '');

const mixedVat = invoiceVatTotals([mid, low, zero, exempt]);
assert.equal(mixedVat.groups.length, 4);
assert.equal(mixedVat.amountExVat, 4000);
assert.equal(mixedVat.vat, 270); // 150 + 120 + 0 + 0
assert.equal(mixedVat.amountInclVat, 4270);

// --- KID ---
const kid = buildKid({ customerNumber: '42', invoiceNumber: '10001', customerWidth: 4, invoiceWidth: 6 });
assert.equal(kid.length, 11); // 4+6+1
assert.equal(validateKid(kid).ok, true);
assert.equal(validateKid(kid.slice(0, -1) + '0').ok, false);
assert.equal(mod10CheckDigit('1234567890'), '3');

// MOD11 KID
const kid11 = buildKid({
  customerNumber: '42',
  invoiceNumber: '10001',
  customerWidth: 4,
  invoiceWidth: 6,
  method: 'mod11',
});
assert.equal(kid11.length, 11);
assert.equal(validateKid(kid11, 'mod11').ok, true);
assert.equal(validateKid(kid11, 'mod10').ok, false); // annen algoritme
assert.equal(mod11CheckDigit('1234567890'), '3');
assert.equal(mod11CheckDigit('1009'), null); // rest 1 → ugyldig
assert.equal(appendCheckDigit('1009', 'mod11'), '');
assert.equal(validateKid(`${'1009'}0`, 'mod11').ok, false);

// --- Overtid ---
assert.equal(rateWithOvertime(1000, 'overtime_50'), 1500);
assert.equal(rateWithOvertime(1000, 'overtime_100'), 2000);
assert.ok(TIME_TYPES.length >= 4);

// --- Tomt utvalg avvises ---
assert.equal(buildInvoiceDraft(null).ok, false);
assert.equal(buildInvoiceDraft({ entries: [] }).ok, false);
assert.match(buildInvoiceDraft({ entries: [] }).error || '', /ingen fakturalinjer/);

// --- Full pipeline: timer → godkjenning → Til fakturering → utkast → utstedelse → bilag → EHF ---
// Samme vei som appen: billingReady → selectionFor → buildInvoiceDraft → issueInvoice.
const customers = [{
  id: 'cust1', name: 'Mg Næring AS', customerNumber: '1042', orgnr: '912345678',
  address: 'Kundevei 1', postalCode: '4010', place: 'Stavanger',
}];
const seller = {
  name: 'ProTop AS', orgnr: '999888777', bankAccount: '12345678903',
  address: 'Storgata 1', city: 'Oslo', postalCode: '0150', vatRegistered: true,
};
const invoiceSettings = { accountHours: '3000', groupHoursBy: 'activity' };
function readyFor(current) {
  return buildReadyProjects({
    projects: current.projects,
    customers,
    timeEntries: current.timeEntries,
    settingsFor: () => invoiceSettings,
    periodEnd: '2026-12-31',
    today: '2026-12-31',
  });
}
function issuedFor(current, { number = '10001', kidMethod = 'mod10', vatCode = 'HIGH' } = {}) {
  const [ready] = readyFor(current);
  const selection = approvedOnly(selectionFor(ready, new Set(selectableKeys(ready))));
  const chart = [{ code: '3000', name: 'Salgsinntekt', vatRate: vatCode === 'HIGH' ? 25 : 0, vatLetter: vatCode === 'EXEMPT' ? 'E' : '' }];
  const draft = buildInvoiceDraft(selection, {
    settings: invoiceSettings, chart, supplier: seller, today: '2026-10-20',
  });
  if (!draft.ok) return draft;
  return issueInvoice(draft.invoice, { number, date: '2026-10-20', kidMethod, supplier: seller });
}
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

const ready = readyFor(state);
assert.equal(ready.length, 1);
assert.ok(ready[0].hourGroups.reduce((sum, group) => sum + group.hours, 0) >= 9);
assert.ok(ready[0].hourGroups.every((group) => group.rateSource === 'project'), 'timeprisen kommer fra prosjektet');

const created = issuedFor(state);
assert.equal(created.ok, true, created.error);
// Ordinær + overtid skal være egne linjer (ikke blandet sats)
assert.equal(created.invoice.lines.length, 2);
const expectedEx = roundMoney(7.5 * 1359 + 2 * rateWithOvertime(1359, 'overtime_50'));
assert.equal(created.invoice.amountExVat, expectedEx);
assert.ok(created.invoice.kid);
assert.equal(validateKid(created.invoice.kid).ok, true);
assert.ok(created.invoice.amountInclVat > created.invoice.amountExVat);

// MOD11 KID på faktura
const createdMod11 = issuedFor(state, { number: '10002', kidMethod: 'mod11' });
assert.equal(createdMod11.ok, true, createdMod11.error);
assert.equal(validateKid(createdMod11.invoice.kid, 'mod11').ok, true);

const voucher = voucherFromInvoice(created.invoice);
assert.equal(voucher.ok, true, voucher.error);
const bal = voucherBalances(voucher.voucher);
assert.equal(bal.debit, bal.credit);

// Bilag-snapshot på faktura (persistens uten egen collection)
const withVoucher = attachVoucherSnapshot(created.invoice, voucher);
assert.equal(withVoucher.voucherId, voucher.voucher.id);
assert.ok(withVoucher.voucherLines.length >= 2);
assert.equal(
  withVoucher.voucherLines.reduce((s, l) => s + l.debit, 0),
  withVoucher.voucherLines.reduce((s, l) => s + l.credit, 0),
);
const cachedVoucher = toInvoiceCacheRow(withVoucher);
// Lokal cache er kun listesammendrag (kvote). Bilagslinjer ligger i Firestore.
assert.equal(cachedVoucher.voucherId, withVoucher.voucherId);
assert.equal(cachedVoucher.voucherLines, undefined);
assert.deepEqual(
  snapshotVoucherLines(voucher.voucher),
  withVoucher.voucherLines,
);
assert.equal(attachVoucherSnapshot(created.invoice, { ok: false }).voucherId, created.invoice.voucherId || '');

// Kreditnota-bilag balanserer (debet/kredit speilet)
const credit = creditVoucherFromInvoice(created.invoice);
assert.equal(credit.ok, true, credit.error);
const creditBal = voucherBalances(credit.voucher);
assert.equal(creditBal.debit, creditBal.credit);
assert.equal(creditBal.debit, bal.debit);
assert.ok(credit.voucher.text.includes('Kreditnota'));
// Første linje på original er debet fordring → kreditnota har kredit fordring
assert.equal(credit.voucher.lines[0].credit, voucher.voucher.lines[0].debit);
assert.equal(credit.voucher.lines[0].debit, 0);

// Kreditnota-dokument fra faktura (negative linjer)
const creditDoc = buildCreditNote(created.invoice, { reason: 'Feil timegrunnlag' });
assert.equal(creditDoc.ok, true, creditDoc.error);
assert.equal(creditDoc.invoice.kind, 'credit_note');
assert.equal(creditDoc.invoice.creditNoteForId, created.invoice.id);
assert.equal(creditDoc.invoice.lines.length, created.invoice.lines.length);
assert.ok(creditDoc.invoice.amountInclVat < 0);
assert.equal(
  roundMoney(creditDoc.invoice.amountInclVat + created.invoice.amountInclVat),
  0,
);
assert.match(creditDoc.invoice.creditReason || '', /Feil timegrunnlag/);
assert.equal(buildCreditNote(created.invoice).ok, false, 'årsak kreves');
assert.equal(buildCreditNote(creditDoc.invoice, { reason: 'x' }).ok, false);

// ZERO/EXEMPT bilag uten MVA-linje, fortsatt i balanse
for (const code of ['ZERO', 'EXEMPT']) {
  const zInv = issuedFor(state, { number: '20000', vatCode: code });
  assert.equal(zInv.ok, true, zInv.error);
  assert.equal(zInv.invoice.vat, 0);
  const zV = voucherFromInvoice(zInv.invoice);
  assert.equal(zV.ok, true, zV.error);
  const zB = voucherBalances(zV.voucher);
  assert.equal(zB.debit, zB.credit);
  assert.equal(zV.voucher.lines.length, 2); // kun fordring + inntekt
  const zC = creditVoucherFromInvoice(zInv.invoice);
  assert.equal(zC.ok, true);
  assert.equal(voucherBalances(zC.voucher).debit, voucherBalances(zC.voucher).credit);
}

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

// Timene på fakturaen er ikke åpne lenger (billingWork merker dem i Firestore).
const billedIds = new Set(created.invoice.lines.flatMap((row) => row.timeEntryIds || []));
assert.equal(billedIds.size, state.timeEntries.length);
state = {
  ...state,
  timeEntries: state.timeEntries.map((row) => (billedIds.has(row.id) ? { ...row, invoiceId: created.invoice.id, status: 'låst' } : row)),
};
assert.equal(readyFor(state).length, 0);

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

// Leverandøradresse kommer fra company.forretning (ikke forretningsadresse)
const mapped = supplierFromCompany({
  navn: 'ProTop AS',
  organisasjonsnummer: '912345678',
  forretning: { lines: ['Storgata 1'], poststed: 'Oslo', postnummer: '0150', label: 'Storgata 1, 0150 Oslo' },
  kontonummer: '12345678903',
});
assert.equal(mapped.address, 'Storgata 1');
assert.equal(mapped.city, 'Oslo');
assert.equal(mapped.postalCode, '0150');
assert.equal(mapped.bankAccount, '12345678903');
assert.equal(supplierFromCompany({ addressLabel: 'Kun label' }, 'Fallback').address, 'Kun label');

console.log('billingPipeline.test.mjs: ok');
