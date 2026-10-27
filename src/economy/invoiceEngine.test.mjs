/**
 * Fakturamotoren: linjer, utkast fra Til fakturering, ferdigstilling, betaling,
 * tap, kreditnota og status. Tallene speiler skjermbildene fra kartleggingen.
 */
import assert from 'node:assert/strict';
import { lineAmounts, normalizeLine, periodLabel, sectionsOf, totalsFromLines } from './invoiceLines.js';
import {
  applyCreditToOriginal,
  approveDraft,
  buildCreditNote,
  displayStatus,
  dueDateFor,
  isDraftInvoice,
  isLockedInvoice,
  issueChecks,
  issueDeadline,
  issueInvoice,
  mergeTemplate,
  nextInvoiceNumber,
  recordDelivery,
  registerPayment,
  removePayment,
  setCollectionFlag,
  settleCreditNote,
  updateDraft,
  writeOffInvoice,
} from './invoiceFlow.js';
import { buildReadyProjects, periodEndFor, selectableKeys, selectionFor } from './billingReady.js';
import { buildInvoiceDraft, hourLines, refreshDraftLines } from './invoiceDraft.js';
import { canDeleteInvoice, normalizeInvoice } from './invoices.js';
import { ledgerVoucher } from './vouchers.js';

// Linje med påslag: 60 807,21 + 15 % = 69 928,29 (bilde 3 og 9).
const expenseLine = lineAmounts({ quantity: 1, unitPrice: 60807.21, markupPercent: 15, vatCode: 'HIGH' });
assert.equal(expenseLine.baseAmount, 60807.21);
assert.equal(expenseLine.markupAmount, 9121.08);
assert.equal(expenseLine.amountExVat, 69928.29);

// Rabatt regnes på grunnbeløp + påslag.
const discounted = lineAmounts({ quantity: 2, unitPrice: 100, markupPercent: 10, discountPercent: 50 });
assert.equal(discounted.amountExVat, 110);

// Summer og øreavrunding: 148 738,29 eks. mva → 185 923 å betale (bilde 7).
const lines = [
  normalizeLine({ section: 'hours', description: 'Linda Øie', quantity: 10.5, unitPrice: 1090 }),
  normalizeLine({ section: 'hours', description: 'Silje Bore Håland', quantity: 5, unitPrice: 1137 }),
  normalizeLine({ section: 'hours', description: 'Ulv-Erik Nordby', quantity: 56.5, unitPrice: 1090 }),
  normalizeLine({ section: 'expenses', description: 'Utlegg : iTech (ITB)', quantity: 1, unitPrice: 60807.21, markupPercent: 15 }),
  normalizeLine({ section: 'admin', description: 'Adm. kostnader', quantity: 1, unitPrice: 95, locked: true }),
];
const totals = totalsFromLines(lines);
assert.equal(totals.amountExVat, 148738.29);
assert.equal(totals.vat, 37184.57);
assert.equal(totals.amountInclVat, 185922.86);
assert.equal(totals.rounding, 0.14);
assert.equal(totals.totalDue, 185923);
assert.deepEqual(sectionsOf(lines).map((row) => row.id), ['hours', 'expenses', 'admin']);
assert.equal(periodLabel('2026-09-01', '2026-09-30'), '09.2026');
assert.equal(periodLabel('2026-08-01', '2026-09-30'), '08.2026–09.2026');

// Nummerserie: høyeste + 1, aldri under startnummeret, hull fylles ikke.
assert.equal(nextInvoiceNumber([{ invoiceNumber: '16722' }, { invoiceNumber: '16719' }, { invoiceNumber: '' }]), '16723');
assert.equal(nextInvoiceNumber([{ invoiceNumber: '12' }], 20000), '20000');
assert.equal(nextInvoiceNumber([], 0), '1');

// Frist: levert i september → faktureres senest 31. oktober.
assert.equal(issueDeadline('2026-09-12'), '2026-10-31');
assert.equal(periodEndFor('lastMonth', '2026-10-27'), '2026-09-30');
assert.equal(periodEndFor('today', '2026-10-27'), '2026-10-27');

// Timer per medarbeider og måned.
const entries = [
  { id: 't1', employeeId: 'e1', employeeName: 'Linda Øie', activityName: 'Hovedaktivitet', date: '2026-09-03', _hours: 4, _rate: 1090 },
  { id: 't2', employeeId: 'e1', employeeName: 'Linda Øie', activityName: 'Hovedaktivitet', date: '2026-09-20', _hours: 6.5, _rate: 1090 },
  { id: 't3', employeeId: 'e2', employeeName: 'Ulv-Erik Nordby', activityName: 'Hovedaktivitet', date: '2026-09-04', _hours: 3, _rate: 1090, timeType: 'overtime_50' },
];
const byEmployee = hourLines(entries, { settings: { groupHoursBy: 'employee' }, accounts: { hours: '3000' } });
assert.equal(byEmployee.length, 2);
assert.equal(byEmployee.find((line) => line.description === 'Linda Øie').quantity, 10.5);
assert.equal(byEmployee.find((line) => line.description === 'Linda Øie').periodStart, '2026-09-01');
assert.equal(byEmployee.find((line) => line.description === 'Linda Øie').periodEnd, '2026-09-30');
assert.ok(byEmployee.some((line) => line.description.includes('Overtid 50 %')));

// Til fakturering → utkast.
const projects = [
  {
    id: 'p1', number: '10791', name: 'Jåsund Skole', customerId: 'c1', client: 'Sola Kommune',
    pricingModel: 'hourly', pricingSettings: { hourlyRate: 1090 }, manager: 'Geir Ove Andersen',
  },
  { id: 'p2', number: '10908', name: 'Leirvika', customerId: 'c2', pricingModel: 'hourly', pricingSettings: {} },
  { id: 'p3', number: '10950', name: 'Fastpris', customerId: 'c1', pricingModel: 'fixed', pricingSettings: { fixedFee: 50000 } },
];
const customers = [
  { id: 'c1', name: 'Sola Kommune', customerNumber: '10027', orgnr: '948243113', address: 'Postboks 99', postalCode: '4097', place: 'Sola', email: 'faktura@sola.kommune.no' },
  { id: 'c2', name: 'Consult1 Sør AS', customerNumber: '10088', orgnr: '' },
];
const timeEntries = [
  { id: 't1', projectId: 'p1', employeeId: 'e1', employeeName: 'Linda Øie', activityName: 'Hovedaktivitet', date: '2026-09-03', hours: 4, status: 'godkjent' },
  { id: 't2', projectId: 'p1', employeeId: 'e1', employeeName: 'Linda Øie', activityName: 'Hovedaktivitet', date: '2026-09-20', hours: 6.5, status: 'registrert' },
  { id: 't3', projectId: 'p1', employeeId: 'e2', employeeName: 'Ulv-Erik Nordby', activityName: 'Hovedaktivitet', date: '2026-09-04', hours: 3, status: 'godkjent', invoiceId: 'inv_old' },
  { id: 't4', projectId: 'p1', employeeId: 'e1', employeeName: 'Linda Øie', date: '2026-10-05', hours: 2, status: 'godkjent' },
  { id: 't5', projectId: 'p2', employeeId: 'e1', employeeName: 'Linda Øie', date: '2026-09-05', hours: 2, status: 'godkjent' },
];
const expenses = [
  { id: 'x1', projectId: 'p1', date: '2026-09-30', description: 'Utlegg : iTech (ITB)', amountExVat: 60807.21, markupPercent: 15, status: 'approved', receiptUri: 'https://files/k.jpg', receiptName: 'img418769196 (1).jpeg' },
  { id: 'x2', projectId: 'p1', date: '2026-09-30', description: 'Utkast', amountExVat: 100, status: 'draft' },
];
const ready = buildReadyProjects({
  projects,
  customers,
  timeEntries,
  expenses,
  invoices: [],
  timesheetLocks: [{ employeeId: 'e1', throughDate: '2026-07-31' }],
  settingsFor: () => ({ markupHourly: 0, markupExpenseHourly: 10, adminAmount: 95, adminOnHourly: true, groupHoursBy: 'employee' }),
  periodEnd: '2026-09-30',
  today: '2026-10-27',
});
const jasund = ready.find((row) => row.projectId === 'p1');
assert.ok(jasund);
assert.equal(jasund.hourGroups.length, 1, 'fakturert time og oktobertime tas ikke med');
assert.equal(jasund.hourGroups[0].hours, 10.5);
assert.equal(jasund.hourGroups[0].approvedCount, 1);
assert.equal(jasund.hourGroups[0].count, 2);
assert.equal(jasund.hourGroups[0].lockBehind, true, 'låst t.o.m. juli er bak september');
assert.equal(jasund.expenses.length, 1, 'utleggsutkast tas ikke med');
assert.ok(jasund.warnings.some((row) => row.id === 'approval'));
assert.ok(jasund.warnings.some((row) => row.id === 'lock'));
const leirvika = ready.find((row) => row.projectId === 'p2');
assert.ok(leirvika.warnings.some((row) => row.id === 'rate' && row.level === 'block'), 'mangler timepris');
assert.equal(selectableKeys(leirvika).length, 0, 'timer uten pris kan ikke velges');
const fixed = ready.find((row) => row.projectId === 'p3');
assert.equal(fixed.fixed.remaining, 50000);

const selected = new Set(selectableKeys(jasund));
const selection = selectionFor(jasund, selected);
assert.equal(selection.unapprovedCount, 1);
const built = buildInvoiceDraft(selection, {
  settings: { ...jasund.settings, creditDays: 28, introText: 'Takk for oppdraget.' },
  supplier: { bankAccount: '32010946149' },
  actor: { byUid: 'u1', byName: 'Geir Ove Andersen' },
  today: '2026-09-30',
  periodEnd: '2026-09-30',
});
assert.ok(built.ok, built.error);
const draft = built.invoice;
assert.equal(draft.invoiceNumber, '', 'utkast har ikke nummer');
assert.equal(draft.kid, '');
assert.equal(draft.status, 'draft');
assert.ok(isDraftInvoice(draft));
assert.equal(draft.customerName, 'Sola Kommune');
assert.equal(draft.customerAddress.city, 'Sola');
assert.equal(draft.customerEmail, 'faktura@sola.kommune.no');
assert.equal(draft.ourReference, 'Geir Ove Andersen');
assert.equal(draft.invoiceText, 'Takk for oppdraget.');
assert.equal(draft.dueDate, '2026-10-28');
assert.equal(draft.deliveryMethod, 'ehf');
assert.equal(draft.attachments.length, 1, 'kvitteringen følger med');
assert.deepEqual(draft.lines.map((line) => line.section), ['hours', 'expenses', 'admin']);
assert.equal(draft.lines.find((line) => line.section === 'expenses').account, '3001');
assert.equal(draft.lines.find((line) => line.section === 'expenses').markupPercent, 15);
assert.equal(draft.amountExVat, round(11445 + 69928.29 + 95));
assert.deepEqual(draft.timeEntryIds.sort(), ['t1', 't2']);
assert.equal(draft.events[0].text, 'opprettet fakturautkast');

function round(n) {
  return Math.round(n * 100) / 100;
}

// Rediger: godkjenning faller bort ved endring.
const approved = approveDraft(draft, { actor: { byName: 'Silje' } });
assert.ok(approved.ok && approved.invoice.approval?.byName === 'Silje');
assert.equal(displayStatus(approved.invoice).id, 'approved');
const edited = updateDraft(approved.invoice, { customerReference: '5611001' }, { actor: { byName: 'Geir' } });
assert.ok(edited.changed);
assert.equal(edited.invoice.approval, null);
assert.equal(edited.invoice.customerReference, '5611001');

// Oppdater utkast: manuelle linjer beholdes.
const withManual = { ...edited.invoice, lines: [...edited.invoice.lines, normalizeLine({ id: 'man1', manual: true, description: 'Reise', quantity: 1, unitPrice: 500 })] };
const refreshed = refreshDraftLines(withManual, selectionFor(jasund, new Set([jasund.hourGroups[0].key])), { settings: jasund.settings });
assert.ok(refreshed.lines.some((line) => line.id === 'man1'));
assert.ok(!refreshed.lines.some((line) => line.section === 'expenses'));
assert.ok(refreshed.removed > 0);

// Kontroll før ferdigstilling.
const checks = issueChecks(edited.invoice, { supplier: { name: 'Consult1 AS', orgnr: '916538804', bankAccount: '32010946149', address: 'Svanholmen 7' }, today: '2026-09-30' });
assert.equal(checks.ok, true, JSON.stringify(checks.blocking));
const noParty = issueChecks({ ...edited.invoice, orgnr: '', customerAddress: {} }, { supplier: { name: 'X', orgnr: '1', bankAccount: '1' } });
assert.ok(noParty.blocking.some((row) => row.id === 'party'));
const late = issueChecks(edited.invoice, { supplier: { name: 'X', orgnr: '1', bankAccount: '1', address: 'a' }, today: '2026-11-15' });
assert.ok(late.warnings.some((row) => row.id === 'late'));
const requireApproval = issueChecks(edited.invoice, { supplier: { name: 'X', orgnr: '1', bankAccount: '1' }, settings: { requireDraftApproval: true } });
assert.ok(requireApproval.blocking.some((row) => row.id === 'approval'));

// Ferdigstill: nummer, dato, forfall, KID og lås.
const issued = issueInvoice(edited.invoice, {
  number: '16722',
  date: '2026-09-30',
  creditDays: 28,
  kidFormat: 'invoice',
  projectInvoiceCount: 6,
  actor: { byName: 'Geir Ove Andersen' },
  at: '2026-09-30T10:00:00.000Z',
});
assert.ok(issued.ok, issued.error);
const invoice = issued.invoice;
assert.equal(invoice.invoiceNumber, '16722');
assert.equal(invoice.kid, '167221', 'fakturanummer + MOD10 som på bilde 13');
assert.equal(invoice.dueDate, '2026-10-28');
assert.equal(invoice.status, 'issued');
assert.equal(invoice.projectInvoiceCount, 6);
assert.ok(invoice.issuedAt);
assert.ok(isLockedInvoice(invoice));
assert.equal(canDeleteInvoice(invoice), false, 'ferdigstilt faktura kan ikke slettes');
assert.equal(updateDraft(invoice, { invoiceText: 'x' }).ok, false, 'ferdigstilt faktura kan ikke endres');
assert.equal(issueInvoice(invoice, { number: '16723' }).ok, false);
assert.equal(displayStatus(invoice, '2026-10-01').id, 'issued');
assert.equal(dueDateFor({ invoiceDate: '2026-09-30' }, { creditDays: 14 }), '2026-10-14');

// Bilag i balanse, per konto, med øreavrunding.
const voucher = ledgerVoucher(invoice, { totals: totalsFromLines(invoice.lines) });
assert.ok(voucher.ok, voucher.error);
const debit = voucher.voucher.lines.reduce((sum, row) => sum + row.debit, 0);
const credit = voucher.voucher.lines.reduce((sum, row) => sum + row.credit, 0);
assert.ok(Math.abs(debit - credit) < 0.01);
assert.ok(voucher.voucher.lines.some((row) => row.account === '3001'));

// Sendt, delbetalt, betalt.
const sent = recordDelivery(invoice, { channel: 'email', to: ['faktura@sola.kommune.no'], actor: { byName: 'Geir' }, at: '2026-09-30T11:00:00.000Z' });
assert.equal(sent.status, 'sent');
assert.equal(sent.deliveryChannel, 'email');
assert.ok(sent.events.some((row) => row.type === 'delivery'));
const failed = recordDelivery(sent, { channel: 'ehf', status: 'failed', message: 'Mottaker finnes ikke i ELMA' });
assert.equal(failed.status, 'sent', 'feilet sending endrer ikke status');
const part = registerPayment(sent, { date: '2026-10-10', amount: 100000, actor: { byName: 'Geir' } });
assert.ok(part.ok);
assert.equal(part.invoice.outstandingAmount, round(invoice.outstandingAmount - 100000));
assert.equal(displayStatus(part.invoice, '2026-10-11').id, 'partly_paid');
const full = registerPayment(part.invoice, { date: '2026-10-20', amount: part.invoice.outstandingAmount });
assert.equal(full.invoice.status, 'paid');
assert.equal(full.invoice.paidAt, '2026-10-20');
const undone = removePayment(full.invoice, full.invoice.payments[1].id);
assert.equal(undone.invoice.status, 'sent');
assert.equal(displayStatus(part.invoice, '2026-11-01').id, 'overdue');

// Purreflagg og tap.
const flagged = setCollectionFlag(part.invoice, 'reminderSent', true, { actor: { byName: 'Geir' } });
assert.equal(flagged.invoice.collection.reminderSent, true);
assert.equal(writeOffInvoice(part.invoice, { reason: '' }).ok, false, 'årsak kreves');
const lost = writeOffInvoice(part.invoice, { reason: 'Konkurs', date: '2026-12-01' });
assert.ok(lost.ok);
assert.equal(lost.invoice.status, 'written_off');
assert.equal(lost.invoice.outstandingAmount, 0);
assert.equal(displayStatus(lost.invoice).id, 'written_off');

// Kreditnota: speilede beløp, henvisning og årsak.
const creditNote = buildCreditNote(invoice, { reason: 'Feil timepris', actor: { byName: 'Geir' } });
assert.ok(creditNote.ok, creditNote.error);
const cn = creditNote.invoice;
assert.equal(cn.kind, 'credit_note');
assert.equal(cn.invoiceNumber, '');
assert.equal(cn.creditNoteForNumber, '16722');
assert.equal(cn.amountExVat, -invoice.amountExVat);
assert.equal(cn.vat, -invoice.vat);
assert.equal(totalsFromLines(cn.lines).totalDue, -totalsFromLines(invoice.lines).totalDue);
assert.ok(isDraftInvoice(cn));
assert.equal(buildCreditNote(invoice, { reason: '' }).ok, false);
assert.equal(buildCreditNote(edited.invoice, { reason: 'x' }).ok, false, 'utkast krediteres ikke');
const cnIssued = issueInvoice(cn, { number: '16723', date: '2026-10-02' });
assert.ok(cnIssued.ok);
assert.equal(cnIssued.invoice.kid, '');
assert.equal(issueChecks(cn, { supplier: { name: 'X', orgnr: '1' } }).ok, true, 'kreditnota trenger ikke kontonummer');
const credited = applyCreditToOriginal(invoice, cnIssued.invoice);
assert.equal(credited.status, 'credited');
assert.equal(credited.outstandingAmount, 0);
assert.equal(displayStatus(credited).id, 'credited');
const settled = settleCreditNote(cnIssued.invoice, credited);
assert.ok(cnIssued.invoice.outstandingAmount < 0, 'kreditnotaen står med negativt beløp før motregning');
assert.equal(settled.outstandingAmount, 0, 'motregnet kreditnota har ingenting utestående');
assert.equal(displayStatus(settled).id, 'credit_note');
assert.equal(
  mergeTemplate('@creditedInvoice', cnIssued.invoice),
  `faktura ${invoice.invoiceNumber}`,
);

// Delvis kreditering: bare adm.-linjen.
const adminId = invoice.lines.find((line) => line.section === 'admin').id;
const partial = buildCreditNote(invoice, { lineIds: [adminId], reason: 'Adm. skal ikke faktureres' });
assert.equal(partial.invoice.lines.length, 1);
const partialIssued = issueInvoice(partial.invoice, { number: '16724' }).invoice;
const partly = applyCreditToOriginal(invoice, partialIssued);
assert.notEqual(partly.status, 'credited');
assert.equal(displayStatus(partly, '2026-10-01').id, 'partly_credited');

// Importert faktura uten linjer: beløpene fra importen beholdes.
const imported = normalizeInvoice({ id: 'inv_100', invoiceNumber: '100', amountExVat: 800, vat: 200, amountInclVat: 1000, outstanding: '400', outstandingAmount: 400, status: 'sent', sentAt: '2026-01-01' });
const importedPaid = registerPayment(imported, { amount: 400, date: '2026-02-01' });
assert.equal(importedPaid.invoice.amountInclVat, 1000);
assert.equal(importedPaid.invoice.outstandingAmount, 0);
assert.equal(importedPaid.invoice.status, 'paid');

// E-postmal.
assert.equal(
  mergeTemplate('Faktura @invoiceNumber fra @company, @amount', invoice, { company: 'Consult1 AS' }),
  `Faktura 16722 fra Consult1 AS, ${new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 2 }).format(totalsFromLines(invoice.lines).totalDue)}`,
);

// Lagring tar vare på de nye feltene.
const stored = normalizeInvoice(JSON.parse(JSON.stringify(sent)));
assert.equal(stored.lines[0].periodStart, '2026-09-01');
assert.equal(stored.lines.find((line) => line.section === 'expenses').expenseIds[0], 'x1');
assert.equal(stored.events.length, sent.events.length);
assert.equal(stored.deliveries.length, 1);
assert.equal(stored.customerAddress.postalCode, '4097');

console.log('invoiceEngine.test.mjs: ok');
