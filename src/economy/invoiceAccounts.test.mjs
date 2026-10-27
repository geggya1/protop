/**
 * Kontoer og mva på fakturalinjene: alt kommer fra innstillingene, ingen reservekonto
 * eller reservepris, og utlegg i kundens navn skilles fra viderefakturering.
 */
import assert from 'node:assert/strict';
import { buildReadyProjects, selectableKeys, selectionFor } from './billingReady.js';
import { accountProblems, accountsFrom, buildInvoiceDraft, vatCodeForAccount } from './invoiceDraft.js';
import { defaultCompanyAccounts, resolveStandardAccounts } from './companyChart.js';
import { resolveProjectInvoiceSettings } from '../project/invoiceSettings.js';
import { buildEhfXml } from './ehf.js';
import { normalizeExpense } from './expenses.js';
import { totalsFromLines } from './invoiceLines.js';

const chart = defaultCompanyAccounts();

// Standardkontoene har alle kontogruppene, også utlegg på vegne av kunden og kjøring.
const standard = resolveStandardAccounts({});
assert.equal(standard.domestic.expenses, '3001');
assert.equal(standard.domestic.outlays, '6301');
assert.equal(standard.domestic.mileage, '3001');
assert.equal(standard.foreign.hours, '3100');

const project = { id: 'p1', number: '10791', name: 'Jåsund Skole', customerId: 'c1', pricingModel: 'hourly', pricingSettings: { hourlyRate: 1090 } };
const settings = resolveProjectInvoiceSettings({}, project).effective;
assert.equal(settings.accountOutlays, '6301');
assert.equal(settings.accountMileage, '3001');
assert.equal(settings.foreignAccounts.accountHours, '3100');
assert.deepEqual(accountsFrom(settings), {
  hours: '3000', fees: '3000', expenses: '3001', outlays: '6301', mileage: '3001', products: '3001', admin: '3000',
});
assert.equal(accountsFrom(settings, { foreign: true }).expenses, '3101');
// Prosjektets egen konto gjelder også for kunder i utlandet.
const overridden = resolveProjectInvoiceSettings({}, { ...project, invoiceSettings: { accountExpenses: '3002' } }).effective;
assert.equal(accountsFrom(overridden, { foreign: true }).expenses, '3002');

// Ingen reservekonto: tom konto gir feil, og ukjent konto også.
assert.equal(accountsFrom({}).hours, '');
assert.match(accountProblems([{ section: 'expenses', account: '' }], chart), /Viderefakturerte utlegg/);
assert.match(accountProblems([{ section: 'hours', account: '9999' }], chart), /9999 finnes ikke/);
assert.equal(accountProblems([{ section: 'hours', account: '3000' }], chart), '');
assert.equal(vatCodeForAccount('6301', chart), 'OUTLAY', 'mva-kode 7 er ingen mva-behandling');
assert.equal(vatCodeForAccount('3001', chart), 'HIGH');

// Utlegg i kundens navn og viderefakturering.
const reinvoice = normalizeExpense({ id: 'x1', projectId: 'p1', date: '2026-09-30', description: 'Utlegg : iTech (ITB)', amountExVat: 60807.21, vatCode: 'HIGH', markupPercent: 15, status: 'approved' });
const outlay = normalizeExpense({ id: 'x2', projectId: 'p1', date: '2026-09-30', description: 'Byggesaksgebyr', amountInclVat: 12500, vatCode: 'EXEMPT', markupPercent: 10, chargeType: 'outlay', status: 'approved' });
assert.equal(outlay.chargeType, 'outlay');
assert.equal(outlay.markupPercent, 0, 'utlegg i kundens navn har ikke påslag');
assert.equal(reinvoice.chargeType, 'reinvoice');

const customers = [{ id: 'c1', name: 'Sola Kommune', customerNumber: '10027', orgnr: '948243113', address: 'Postboks 99', postalCode: '4097', place: 'Sola' }];
const timeEntries = [{ id: 't1', projectId: 'p1', employeeId: 'e1', employeeName: 'Linda Øie', date: '2026-09-03', hours: 4, status: 'godkjent' }];
const ready = buildReadyProjects({
  projects: [project, { id: 'p2', number: '10908', name: 'Uten pris', customerId: 'c1', pricingModel: 'hourly', pricingSettings: {} }],
  customers,
  timeEntries: [...timeEntries, { id: 't2', projectId: 'p2', employeeId: 'e1', date: '2026-09-04', hours: 2, status: 'godkjent' }],
  expenses: [reinvoice, outlay, { id: 'x3', projectId: 'p2', date: '2026-09-10', amountExVat: 500, status: 'approved' }],
  settingsFor: (row) => resolveProjectInvoiceSettings({}, row).effective,
  chart,
  periodEnd: '2026-09-30',
  today: '2026-10-27',
});
const jasund = ready.find((row) => row.projectId === 'p1');
assert.equal(jasund.blocked, false);
const outlayRow = jasund.expenses.find((row) => row.id === 'x2');
assert.equal(outlayRow.chargeType, 'outlay');
assert.equal(outlayRow.amount, 12500, 'bruttobeløpet, uten påslag');

// Timepris mangler: hele prosjektet stoppes, også utleggene.
const noRate = ready.find((row) => row.projectId === 'p2');
assert.equal(noRate.blocked, true);
assert.ok(noRate.blockReasons.includes('Timepris mangler'));
assert.equal(selectableKeys(noRate, { includeFixed: true }).length, 0, 'utlegget kan ikke faktureres før timeprisen er satt');

// Konto mangler i innstillingene: prosjektet stoppes.
const missing = buildReadyProjects({
  projects: [project],
  customers,
  timeEntries,
  expenses: [outlay],
  settingsFor: (row) => ({ ...resolveProjectInvoiceSettings({}, row).effective, accountOutlays: '' }),
  chart,
  periodEnd: '2026-09-30',
  today: '2026-10-27',
})[0];
assert.equal(missing.blocked, true);
assert.ok(missing.warnings.some((row) => row.id === 'account' && /utlegg på vegne av kunden/.test(row.text)));

// Utkastet: viderefakturert utlegg på 3001 med påslaget for seg og mva, utlegget i kundens navn uten.
const selection = selectionFor(jasund, new Set(selectableKeys(jasund)));
const built = buildInvoiceDraft(selection, { settings: { ...settings, adminAmount: 0 }, chart, today: '2026-09-30', periodEnd: '2026-09-30' });
assert.ok(built.ok, built.error);
const lines = built.invoice.lines;
const re = lines.find((line) => line.section === 'expenses');
const out = lines.find((line) => line.section === 'outlays');
assert.equal(re.account, '3001');
assert.equal(re.unitPrice, 60807.21);
assert.equal(re.markupPercent, 15);
assert.equal(re.vatCode, 'HIGH');
assert.equal(re.amountExVat, 69928.29);
assert.equal(out.account, '6301');
assert.equal(out.unitPrice, 12500);
assert.equal(out.markupPercent, 0);
assert.equal(out.vatCode, 'OUTLAY');
assert.equal(out.vatAmount, 0);
const totals = totalsFromLines(lines);
assert.equal(totals.vat, Math.round((4 * 1090 + 69928.29) * 0.25 * 100) / 100, 'mva bare på timer og viderefakturert utlegg');

// Adm.-kostnad regnes ikke av utlegg i kundens navn.
const withAdmin = buildInvoiceDraft(selection, { settings: { ...settings, adminAmount: 0, adminMarkupPercent: 10 }, chart, today: '2026-09-30', periodEnd: '2026-09-30' });
const admin = withAdmin.invoice.lines.find((line) => line.section === 'admin');
assert.equal(admin.unitPrice, Math.round((4 * 1090 + 69928.29) * 0.1 * 100) / 100);

// Uten konto lages ikke utkastet.
const noAccount = buildInvoiceDraft(selection, { settings: { ...settings, accountOutlays: '' }, chart, today: '2026-09-30' });
assert.equal(noAccount.ok, false);
assert.match(noAccount.error, /Utlegg på vegne av kunden/);

// EHF: utlegget får kategori Z, og Z og S kan stå på samme faktura (ikke O).
const ehf = buildEhfXml({
  ...built.invoice,
  invoiceNumber: '16720',
  issuedAt: '2026-09-30T12:00:00Z',
  dueDate: '2026-10-28',
}, { supplier: { name: 'Rådgiver AS', orgnr: '916538804', bankAccount: '32010946149', address: 'Gate 1', postalCode: '4006', city: 'Stavanger' } });
assert.ok(ehf.ok, ehf.error);
assert.match(ehf.xml, /<cbc:ID>Z<\/cbc:ID>/);
assert.doesNotMatch(ehf.xml, /<cbc:ID>O<\/cbc:ID>/);
assert.equal((ehf.xml.match(/<cac:TaxSubtotal>/g) || []).length, 2, 'én mva-gruppe per kategori og sats');

console.log('invoiceAccounts.test.mjs: ok');

// Nullsats og utlegg slås sammen til én Z-gruppe i EHF.
{
  const mixed = buildEhfXml({
    ...built.invoice,
    invoiceNumber: '16721',
    issuedAt: '2026-09-30T12:00:00Z',
    dueDate: '2026-10-28',
    lines: [...built.invoice.lines, { id: 'z1', section: 'other', description: 'Nullsats', quantity: 1, unitPrice: 100, vatCode: 'ZERO', account: '3100' }],
  }, { supplier: { name: 'Rådgiver AS', orgnr: '916538804', bankAccount: '32010946149', address: 'Gate 1', postalCode: '4006', city: 'Stavanger' } });
  assert.ok(mixed.ok, mixed.error);
  assert.equal((mixed.xml.match(/<cac:TaxSubtotal>/g) || []).length, 2);
}
