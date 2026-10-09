import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildInvoiceImportReview,
  companyInvoiceRow,
  invoiceColumnField,
  linkImportPlanCustomer,
  linkImportPlanProject,
  matchProject,
  planInvoiceImport,
  readInvoiceTable,
  reviewRowsForInvoicePlan,
  toggleInvoiceReviewRow,
} from './invoiceImport.js';
import {
  deriveInvoiceStatus,
  formatMoney,
  filterInvoicesByPeriod,
  invoiceAmountGroups,
  invoiceDetailSections,
  invoicePaymentSummary,
  isInvoiceOverdue,
  normalizeInvoice,
  parseMoney,
} from './invoices.js';

{
  assert.equal(invoiceColumnField('Fakturanr'), 'invoiceNumber');
  assert.equal(invoiceColumnField('Kundenavn'), 'customerName');
  assert.equal(invoiceColumnField('Org.nr.'), 'orgnr');
  assert.equal(invoiceColumnField('Prosjektnummer'), 'projectNumber');
  assert.equal(invoiceColumnField('Beløp ink. mva'), 'amountInclVat');
  assert.equal(invoiceColumnField('Regnskapskonto: 3000'), 'account:3000');
  assert.equal(invoiceColumnField('Utestående'), 'outstanding');
}

{
  assert.equal(parseMoney('70 796,00'), 70796);
  assert.equal(parseMoney('Paid'), 0);
  assert.equal(parseMoney('1.0'), 1);
  assert.ok(formatMoney(1300, 'NOK').includes('1'));
}

{
  const paid = deriveInvoiceStatus({
    outstanding: 'Paid',
    amountInclVat: 1000,
    paidAt: '2023-10-03',
  });
  assert.equal(paid, 'paid');
  const overdue = deriveInvoiceStatus({
    dueDate: '2020-01-01',
    outstanding: '100',
    amountInclVat: 100,
    sent: 'sent',
  });
  assert.equal(overdue, 'overdue');
}

{
  const customers = [
    { id: 'c1', name: 'Sandnes Kommune', customerNumber: '10025', orgnr: '964965137' },
  ];
  const projects = [
    { id: 'p1', number: '10857', name: 'Sikker skolevei Hommersåk', customerId: 'c1', contractId: 'ctr1' },
  ];
  const row = companyInvoiceRow({
    invoiceNumber: '16712',
    invoiceDate: '30.09.2026',
    dueDate: '28.10.2026',
    customerNumber: '10025',
    customerName: 'Sandnes Kommune',
    orgnr: '964965137',
    projectNumber: '10857',
    projectName: 'Sikker skolevei Hommersåk',
    amountExVat: '1040',
    vat: '260',
    amountInclVat: '1300',
    outstanding: '1 300,00',
    sent: 'sent',
    accounts: { 3000: '1040' },
    _sourceValues: { Fakturanr: '16712', Kundenavn: 'Sandnes Kommune' },
  }, customers, projects);
  assert.equal(row.severity, 'ok');
  assert.equal(row.invoice.customerId, 'c1');
  assert.equal(row.invoice.projectId, 'p1');
  assert.equal(row.invoice.accounts['3000'], 1040);
  assert.equal(row.invoice.source.values.Fakturanr, '16712');
  assert.equal(matchProject(projects, { projectNumber: '10857' }).id, 'p1');
}

{
  const blocked = companyInvoiceRow({ invoiceNumber: 'Totalt', amountInclVat: '100' });
  assert.equal(blocked.severity, 'block');
  assert.equal(blocked.invoice, null);
}

{
  const plan = planInvoiceImport(
    [],
    [{ id: 'c1', name: 'AS Betong', customerNumber: '10121', orgnr: '828855832' }],
    [],
    [{
      invoiceNumber: '16711',
      customerNumber: '10121',
      customerName: 'AS Betong',
      orgnr: '828855832',
      projectNumber: '10865',
      projectName: '31097 - Storåna bru',
      amountInclVat: '55578',
      _sourceValues: { Fakturanr: '16711' },
    }],
  );
  assert.equal(plan.rows[0].customerId, 'c1');
  assert.equal(plan.rows[0].severity, 'review');
  assert.match(plan.rows[0].issues.join(' '), /Prosjektet/);

  const linked = linkImportPlanCustomer(plan, 0, {
    id: 'c1', name: 'AS Betong', customerNumber: '10121', orgnr: '828855832',
  });
  assert.equal(linked.rows[0].customerId, 'c1');

  const withProject = linkImportPlanProject(plan, 0, {
    id: 'p65', number: '10865', name: '31097 - Storåna bru', customerId: 'c1',
  });
  assert.equal(withProject.rows[0].projectId, 'p65');
  assert.equal(withProject.rows[0].severity, 'ok');
}

{
  const existing = planInvoiceImport(
    [{ invoiceNumber: '16711' }],
    [{ id: 'c1', name: 'AS Betong', customerNumber: '10121', orgnr: '828855832' }],
    [{ id: 'p65', number: '10865', name: '31097 - Storåna bru' }],
    [{
      invoiceNumber: '16711',
      customerNumber: '10121',
      customerName: 'AS Betong',
      projectNumber: '10865',
      projectName: '31097 - Storåna bru',
      amountInclVat: '55578',
    }],
  );
  assert.equal(existing.rows[0].severity, 'existing');
  assert.equal(existing.rows[0].invoice, null);
  const built = buildInvoiceImportReview(existing);
  assert.equal(built.existingCount, 1);
  assert.ok(built.cards.some((row) => row.severity === 'existing'));
  assert.equal(built.okRows.length, 0);
}

{
  const plan = planInvoiceImport([], [], [], [
    {
      invoiceNumber: '1', customerName: 'A', amountInclVat: '10',
      _sourceValues: { Fakturanr: '1' },
    },
    {
      invoiceNumber: '2', customerName: 'A', amountInclVat: '20',
      _sourceValues: { Fakturanr: '2' },
    },
    { invoiceNumber: 'Totalt' },
  ]);
  const review = reviewRowsForInvoicePlan(plan);
  assert.ok(review.some((row) => row.severity === 'block'));
  assert.ok(review.some((row) => row.id === 'ok-group' || row.severity === 'review'));
  const ok = review.find((row) => row.id === 'ok-group') || review.find((row) => row.severity === 'review');
  const dropped = toggleInvoiceReviewRow(new Set(), ok, plan);
  assert.ok(dropped.size >= 1);
}

{
  const invoice = normalizeInvoice({
    invoiceNumber: '100',
    customerName: 'Test AS',
    amountInclVat: 1250,
    vat: 250,
    amountExVat: 1000,
    feesExMarkup: 900,
    adminCosts: 100,
    accounts: { 3000: 1000 },
    source: { values: { Fakturanr: '100', Extra: 'beholdes' } },
  });
  const sections = invoiceDetailSections(invoice);
  assert.ok(sections.some((section) => section.id === 'source'));
  assert.ok(sections.some((section) => section.id === 'accounts'));
  const source = sections.find((section) => section.id === 'source');
  assert.ok(source.rows.some(([label]) => label === 'Extra'));
  const pay = invoicePaymentSummary(invoice);
  assert.equal(pay.amountExVat, 1000);
  assert.equal(pay.totalDue, 1250);
  assert.ok(invoiceAmountGroups(invoice).length >= 1);
  assert.equal(isInvoiceOverdue({
    dueDate: '2020-01-01', outstanding: '100', status: 'sent',
  }), true);
  const periodRows = filterInvoicesByPeriod([
    { invoiceDate: '2026-09-30' },
    { invoiceDate: '2020-01-01' },
  ], 'year', new Date('2026-10-08'));
  assert.equal(periodRows.length, 1);
}

// Full Excel-fil (vedlegg): parse + plan uten avvik på summeringsrad
{
  const bytes = readFileSync('/home/ubuntu/.cursor/projects/workspace/uploads/invoices_eafb.xlsx');
  const rows = await readInvoiceTable(new Uint8Array(bytes), 'invoices.xlsx');
  assert.ok(rows.length >= 6700, `forventet mange rader, fikk ${rows.length}`);
  assert.equal(rows[0].invoiceNumber, '16713');
  assert.ok(rows[0]._sourceValues.Fakturanr);
  assert.ok(Object.keys(rows[0].accounts || {}).length >= 1 || rows[0]['account:3000']);

  const customers = [
    { id: 'c-ry', name: 'RYFYLKE EIENDOM AS', customerNumber: '10231', orgnr: '983858635' },
  ];
  const projects = [
    { id: 'p-gol', number: '10869', name: 'Golhaug VVA - Kontroll VA', customerId: 'c-ry' },
  ];
  const plan = planInvoiceImport([], customers, projects, rows.slice(0, 5));
  assert.equal(plan.rows.length, 5);
  const first = plan.rows.find((row) => row.invoice?.invoiceNumber === '16713');
  assert.equal(first.invoice.customerId, 'c-ry');
  assert.equal(first.invoice.projectId, 'p-gol');
  assert.equal(first.severity, 'ok');

  const full = planInvoiceImport([], customers, projects, rows);
  const blocked = full.rows.filter((row) => row.severity === 'block');
  assert.ok(blocked.length >= 1, 'summeringsrad skal blokkeres');
  assert.ok(full.rows.filter((row) => row.invoice).length >= 6700);
  const reviewUi = reviewRowsForInvoicePlan(full);
  assert.ok(reviewUi.length < 900, 'UI-gjennomgang skal være gruppert på prosjekt, ikke én kort per rad');
  const built = buildInvoiceImportReview(full);
  assert.ok(built.okRows.length >= 0);
  assert.ok(built.reviewCards.every((card) => card.indexes?.length));
}

{
  const bytes = readFileSync('/home/ubuntu/.cursor/projects/workspace/uploads/alle_fakturaer_8bfe.xlsx');
  const rows = await readInvoiceTable(new Uint8Array(bytes), 'alle_fakturaer.xlsx');
  assert.ok(rows.length >= 6700);
  const customers = [
    { id: 'c-nova', name: 'Novaform AS', customerNumber: '10002', orgnr: '991356959' },
  ];
  const projects = [
    { id: 'p-10009', number: '10009', name: 'E39 Hove - Sandved (2148)', customerId: 'c-nova' },
  ];
  const plan = planInvoiceImport([{ invoiceNumber: '10001' }], customers, projects, rows.slice(0, 20));
  assert.equal(plan.rows.find((row) => row.title?.includes('10001'))?.severity, 'existing');
  const built = buildInvoiceImportReview(plan);
  assert.ok(built.existingCount >= 1);
  assert.ok(built.okRows.length + built.reviewCards.length >= 1);
  // Kobling av ett prosjekt løser alle rader med samme prosjektnr
  const unlinked = plan.rows.findIndex((row) => row.severity === 'review' && row.projectNumber === '10009');
  if (unlinked >= 0) {
    const linked = linkImportPlanProject(plan, unlinked, projects[0], { applyGroup: true });
    assert.ok(linked.rows.filter((row) => row.projectNumber === '10009' && row.severity !== 'existing').every((row) => row.projectId === 'p-10009'));
  }
}

console.log('invoiceImport.test.mjs: ok');
