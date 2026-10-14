/**
 * Tre fulle sykluser: les tabell → plan → detaljfelter → gjennomgang → «lagring» (minne).
 * Verifiserer at opplastning→kontroll→navigering i data-laget er stabilt.
 * Eksisterende fakturanr fjernes fra importlisten (ikke oppdatert i stillehet).
 *
 * Bruker innebygd CSV (Moment-lignende kolonner). Valgfri stor Excel-fil kjøres
 * i tillegg når den finnes lokalt.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildInvoiceImportReview,
  linkImportPlanProject,
  planInvoiceImport,
  readInvoiceTable,
  reviewRowsForInvoicePlan,
  toggleInvoiceReviewRow,
} from './invoiceImport.js';
import {
  filterInvoices,
  invoiceDetailSections,
  normalizeInvoice,
  sortInvoices,
} from './invoices.js';

const customers = [
  { id: 'c-ry', name: 'RYFYLKE EIENDOM AS', customerNumber: '10231', orgnr: '983858635' },
  { id: 'c-sa', name: 'Sandnes Kommune', customerNumber: '10025', orgnr: '964965137' },
  { id: 'c-be', name: 'AS Betong', customerNumber: '10121', orgnr: '828855832' },
];
const projects = [
  { id: 'p-gol', number: '10869', name: 'Golhaug VVA - Kontroll VA', customerId: 'c-ry' },
  { id: 'p-sk', number: '10857', name: 'Sikker skolevei Hommersåk', customerId: 'c-sa' },
  { id: 'p-sto', number: '10865', name: '31097 - Storåna bru', customerId: 'c-be' },
];

function buildSampleCsv(count = 40) {
  const header = [
    'Fakturanr', 'Fakturadato', 'Forfallsdato', 'Påminnelse utsatt til', 'Periodestart', 'Periodeslutt',
    'Kundenummer', 'Kundenavn', 'Org.nr.', 'Prosjektnummer', 'Prosjekt',
    'Honorarer eks. påslag', 'Regnskapskonto: 3000', 'Beløp eks. mva', 'MVA', 'Beløp ink. mva', 'Utestående', 'Ekstra',
  ].join(';');
  const samples = [
    ['10231', 'RYFYLKE EIENDOM AS', '983858635', '10869', 'Golhaug VVA - Kontroll VA'],
    ['10025', 'Sandnes Kommune', '964965137', '10857', 'Sikker skolevei Hommersåk'],
    ['10121', 'AS Betong', '828855832', '10865', '31097 - Storåna bru'],
  ];
  const lines = [header];
  for (let i = 0; i < count; i += 1) {
    const num = String(16000 + i);
    const [customerNumber, customerName, orgnr, projectNumber, projectName] = samples[i % samples.length];
    const ex = 1000 + i;
    const vat = Math.round(ex * 0.25);
    lines.push([
      num, '30.09.2026', '28.10.2026', '', '01.09.2026', '30.09.2026',
      customerNumber, customerName, orgnr, projectNumber, projectName,
      String(ex), String(ex), String(ex), String(vat), String(ex + vat), 'Paid', `cell-${num}`,
    ].join(';'));
  }
  lines.push(['Totalt', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '999999', '', ''].join(';'));
  return lines.join('\n');
}

async function runCycle(cycle, store, bytes, filename, { minRows, firstInvoiceNumber }) {
  const rows = await readInvoiceTable(bytes, filename);
  assert.ok(rows.length >= minRows, `syklus ${cycle}: forventet >= ${minRows} rader, fikk ${rows.length}`);
  const plan = planInvoiceImport(store, customers, projects, rows);
  const review = reviewRowsForInvoicePlan(plan);
  const built = buildInvoiceImportReview(plan);
  assert.ok(review.length < Math.max(900, minRows), `syklus ${cycle}: for mange review-kort (${review.length})`);
  assert.ok(built.okRows.length >= 0);

  if (cycle === 1) {
    assert.equal(built.existingCount, 0);
    let dropped = new Set();
    const toggleTarget = review.find((row) => row.id === 'ok-group')
      || review.find((row) => row.severity === 'review' && row.indexes?.length);
    assert.ok(toggleTarget, `syklus ${cycle}: mangler inkluderbar gruppe`);
    dropped = toggleInvoiceReviewRow(dropped, toggleTarget, plan);
    assert.ok(dropped.size > 0);
    dropped = toggleInvoiceReviewRow(dropped, toggleTarget, plan);
    assert.equal(dropped.size, 0);

    const needProject = built.reviewCards.find((card) => card.needsProject && card.projectNumber);
    if (needProject) {
      const hit = projects.find((project) => String(project.number) === String(needProject.projectNumber))
        || { id: 'p-extra', number: needProject.projectNumber, name: needProject.projectName || 'Ekstra' };
      const linked = linkImportPlanProject(plan, needProject.rowIndex, hit, { applyGroup: true });
      assert.ok(linked.rows.some((row) => row.projectId === hit.id));
    }

    const chosen = plan.rows
      .filter((row, index) => (
        row.severity !== 'block'
        && row.severity !== 'existing'
        && !dropped.has(String(index))
        && row.invoice
      ))
      .map((row) => normalizeInvoice(row.invoice));
    assert.ok(chosen.length >= minRows - 1);

    const first = chosen.find((row) => row.invoiceNumber === firstInvoiceNumber) || chosen[0];
    assert.ok(first, `syklus ${cycle}: mangler første faktura`);
    assert.equal(first.reminderPostponedTo || '', '');
    assert.ok(first.periodStart);
    assert.ok(first.accounts?.['3000'] != null || first.feesExMarkup != null);
    assert.ok(Object.keys(first.source?.values || {}).length >= 10, 'alle Excel-kolonner skal ligge i source.values');

    const byId = new Map(store.map((row) => [row.id, row]));
    for (const invoice of chosen) byId.set(invoice.id, invoice);
    const next = sortInvoices([...byId.values()]);

    const found = filterInvoices(next, firstInvoiceNumber);
    assert.ok(found.length >= 1, `syklus ${cycle}: fant ikke ${firstInvoiceNumber}`);
    const detail = invoiceDetailSections(found[0]);
    assert.ok(detail.some((section) => section.id === 'source'), `syklus ${cycle}: mangler kilderader`);
    assert.ok(detail.some((section) => section.id === 'amounts' || section.id === 'accounts'));
    return next;
  }

  assert.ok(built.existingCount >= minRows - 1, `syklus ${cycle}: forventet mange eksisterende`);
  const importable = plan.rows.filter((row) => row.invoice && row.severity !== 'existing' && row.severity !== 'block');
  assert.equal(importable.length, 0, `syklus ${cycle}: ingen nye skal importeres når alt finnes`);
  assert.ok(built.okRows.length === 0);
  return store;
}

const csvBytes = new TextEncoder().encode(buildSampleCsv(40));
let store = [];
for (let cycle = 1; cycle <= 3; cycle += 1) {
  store = await runCycle(cycle, store, csvBytes, `invoices-cycle-${cycle}.csv`, {
    minRows: 41,
    firstInvoiceNumber: '16000',
  });
  assert.ok(store.length >= 40, `etter syklus ${cycle}`);
}

try {
  const xlsx = readFileSync('/home/ubuntu/.cursor/projects/workspace/uploads/invoices_eafb.xlsx');
  let xlsxStore = [];
  for (let cycle = 1; cycle <= 2; cycle += 1) {
    xlsxStore = await runCycle(cycle, xlsxStore, new Uint8Array(xlsx), `invoices-xlsx-${cycle}.xlsx`, {
      minRows: 6700,
      firstInvoiceNumber: '16713',
    });
  }
  assert.equal(xlsxStore.find((row) => row.invoiceNumber === '16713')?.customerId, 'c-ry');
  assert.equal(xlsxStore.find((row) => row.invoiceNumber === '16713')?.projectId, 'p-gol');
} catch (err) {
  if (err?.code !== 'ENOENT') throw err;
}

console.log('invoiceCycle.test.mjs: ok');
