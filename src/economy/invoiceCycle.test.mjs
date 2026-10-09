/**
 * Tre fulle sykluser: les Excel → plan → detaljfelter → gjennomgang → «lagring» (minne).
 * Verifiserer at opplastning→kontroll→navigering i data-laget er stabilt.
 * Eksisterende fakturanr fjernes fra importlisten (ikke oppdatert i stillehet).
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

const bytes = new Uint8Array(readFileSync('/home/ubuntu/.cursor/projects/workspace/uploads/invoices_eafb.xlsx'));

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

async function runCycle(cycle, store) {
  const rows = await readInvoiceTable(bytes, `invoices-cycle-${cycle}.xlsx`);
  assert.ok(rows.length > 6700);
  const plan = planInvoiceImport(store, customers, projects, rows);
  const review = reviewRowsForInvoicePlan(plan);
  const built = buildInvoiceImportReview(plan);
  assert.ok(review.length < 900, `syklus ${cycle}: for mange review-kort (${review.length})`);
  assert.ok(built.okRows.length >= 0);

  if (cycle === 1) {
    assert.equal(built.existingCount, 0);
    // Simuler toggle ut/inn på OK-listen
    let dropped = new Set();
    const toggleTarget = review.find((row) => row.id === 'ok-group')
      || review.find((row) => row.severity === 'review' && row.indexes?.length);
    assert.ok(toggleTarget, `syklus ${cycle}: mangler inkluderbar gruppe`);
    dropped = toggleInvoiceReviewRow(dropped, toggleTarget, plan);
    assert.ok(dropped.size > 0);
    dropped = toggleInvoiceReviewRow(dropped, toggleTarget, plan);
    assert.equal(dropped.size, 0);

    // Koble et prosjekt for en review-gruppe om mulig
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
    assert.ok(chosen.length > 6700);

    const byId = new Map(store.map((row) => [row.id, row]));
    for (const invoice of chosen) byId.set(invoice.id, invoice);
    const next = sortInvoices([...byId.values()]);

    const found = filterInvoices(next, '16713');
    assert.ok(found.length >= 1, `syklus ${cycle}: fant ikke 16713`);
    const detail = invoiceDetailSections(found[0]);
    assert.ok(detail.some((section) => section.id === 'source'), `syklus ${cycle}: mangler kilderader`);
    assert.equal(found[0].customerId, 'c-ry');
    assert.equal(found[0].projectId, 'p-gol');
    return next;
  }

  // Syklus 2–3: samme fil — alle kjente fakturanr skal være fjernet fra importen
  assert.ok(built.existingCount > 6700, `syklus ${cycle}: forventet mange eksisterende`);
  const importable = plan.rows.filter((row) => row.invoice && row.severity !== 'existing' && row.severity !== 'block');
  assert.equal(importable.length, 0, `syklus ${cycle}: ingen nye skal importeres når alt finnes`);
  assert.ok(built.okRows.length === 0);
  return store;
}

let store = [];
for (let cycle = 1; cycle <= 3; cycle += 1) {
  store = await runCycle(cycle, store);
  assert.ok(store.length > 6700, `etter syklus ${cycle}`);
}

console.log('invoiceCycle.test.mjs: ok');
