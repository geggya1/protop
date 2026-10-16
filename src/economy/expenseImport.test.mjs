import assert from 'node:assert/strict';
import {
  buildExpenseImportReview,
  companyExpenseRow,
  expenseColumnField,
  expenseFingerprint,
  expenseImportStatus,
  expenseVatCode,
  planExpenseImport,
  readExpenseTable,
} from './expenseImport.js';
import { filterExpenses, sortExpenses } from './expenseList.js';
import { mergeExpenseLists } from './expenseStorage.js';

const HEADERS = [
  'Dato', 'Periode', 'Navn', 'Opprettet dato', 'MVA', 'Kundenummer', 'Kundenavn',
  'Prosjektnummer', 'Prosjekt', 'Aktivitet', 'Bilagsnr.', 'Bilagsid', 'Medarbeider',
  'Vedlegg', 'Leverandør', 'Leverandørnr.', 'Leverandørs fakturanr.', 'Kategori',
  'Regnskapskonto', 'Beskrivelse', 'Fakturerbar', 'Inkludert i totalprisen',
  'Vis påslagsprosent og antall på faktura', 'Fakturert', 'Faktura',
  'Antall', 'Rabatt', 'Påslag', 'Påslagsbeløp', 'Valuta', 'Enhetspris',
  'Totalt eks. mva.', 'Totalt ink. mva.',
];

{
  assert.equal(expenseColumnField('Dato'), 'date');
  assert.equal(expenseColumnField('Navn'), 'title');
  assert.equal(expenseColumnField('Medarbeider'), 'employeeName');
  assert.equal(expenseColumnField('Kundenummer'), 'customerNumber');
  assert.equal(expenseColumnField('Prosjektnummer'), 'projectNumber');
  assert.equal(expenseColumnField('Totalt eks. mva.'), 'amountExVat');
  assert.equal(expenseColumnField('Totalt ink. mva.'), 'amountInclVat');
  assert.equal(expenseColumnField('Påslag'), 'markup');
  assert.equal(expenseColumnField('Fakturert'), 'invoiceStatus');
  assert.equal(expenseColumnField('Faktura'), 'externalInvoiceNumber');
  assert.equal(expenseColumnField('Totalt eks. mva., prosjektvaluta'), '');
  assert.equal(expenseVatCode('0.25'), 'HIGH');
  assert.equal(expenseVatCode('0'), 'ZERO');
  assert.equal(expenseImportStatus('Ikke godkjent ennå'), 'submitted');
  assert.equal(expenseImportStatus('Godkjent'), 'approved');
  assert.equal(expenseImportStatus('Fakturert'), 'invoiced');
}

function line(values) {
  const cells = HEADERS.map((_, index) => values[index] ?? '');
  return cells.join(';');
}

{
  const csv = [
    HEADERS.join(';'),
    line({
      0: '2026-10-02', 1: '10.2026', 2: 'Parkering Evenes', 3: '2026-10-02', 4: '0.25',
      5: '10059', 6: 'Consult1 Øst AS', 7: '10862', 8: 'Narvik - datasenter', 9: 'Hovedaktivitet',
      12: 'Runar Sørheim', 17: 'Reiser', 18: 'Honorar', 19: 'iht. vedlegg', 20: 'Ja',
      23: 'Ikke godkjent ennå', 25: '1', 26: '0', 27: '0.1', 29: 'NOK', 30: '500', 31: '500', 32: '625',
    }),
    line({
      0: '2026-09-01', 1: '09.2026', 2: 'Parkering', 3: '2026-09-01', 4: '0.25',
      5: '10099', 6: 'Pedersgata Utvikling AS', 7: '10727', 8: 'SHA Nytorget', 9: 'Hovedaktivitet',
      12: 'Runar Sørheim', 17: 'Reiser', 19: 'kvittering', 20: 'Ja',
      23: 'Fakturert', 24: '16688', 25: '1', 27: '0', 29: 'NOK', 30: '100', 31: '100', 32: '125',
    }),
  ].join('\n');
  const rows = await readExpenseTable(new TextEncoder().encode(csv), 'utlegg.csv');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'Parkering Evenes');
  assert.equal(rows[0].employeeName, 'Runar Sørheim');
  assert.equal(rows[0].projectNumber, '10862');

  const employees = [{
    id: 'emp-runar',
    person: { firstName: 'Runar', lastName: 'Sørheim' },
    company: { status: 'active' },
  }];
  const customers = [{ id: 'cus-1', name: 'Consult1 Øst AS', customerNumber: '10059' }];
  const projects = [{ id: 'prj-1', number: '10862', name: 'Narvik - datasenter', customerId: 'cus-1', client: 'Consult1 Øst AS' }];
  const plan = planExpenseImport([], employees, customers, projects, rows);
  const first = plan.rows[0];
  assert.equal(first.severity, 'ok');
  assert.equal(first.entry.employeeId, 'emp-runar');
  assert.equal(first.entry.customerId, 'cus-1');
  assert.equal(first.entry.projectId, 'prj-1');
  assert.equal(first.entry.category, 'travel');
  assert.equal(first.entry.markupPercent, 10);
  assert.equal(first.entry.amountExVat, 500);
  assert.equal(first.entry.status, 'submitted');
  assert.equal(plan.rows[1].entry.status, 'invoiced');
  assert.equal(plan.rows[1].entry.externalInvoiceNumber, '16688');
  assert.equal(plan.rows[1].severity, 'review');

  const again = planExpenseImport([first.entry], employees, customers, projects, [rows[0]]);
  assert.equal(again.rows[0].severity, 'existing');
  assert.equal(expenseFingerprint(first.entry), again.rows[0].entry.importFingerprint);

  const review = buildExpenseImportReview(plan);
  assert.equal(review.readyCount, 2);
  assert.equal(review.okRows.length, 1);

  const filtered = filterExpenses([first.entry, plan.rows[1].entry], { status: 'invoiced', query: 'peder' });
  assert.equal(filtered.length, 1);
  const sorted = sortExpenses([plan.rows[1].entry, first.entry], 'date-asc');
  assert.equal(sorted[0].date, '2026-09-01');
  const merged = mergeExpenseLists([first.entry], [{ ...first.entry, description: 'ny' }]);
  assert.equal(merged.length, 1);
}

{
  const blocked = companyExpenseRow({ title: 'Totalt' }, {});
  assert.equal(blocked.severity, 'block');
  const missing = companyExpenseRow({ date: '2026-01-01', title: 'Tomt' }, {});
  assert.equal(missing.severity, 'block');
}

console.log('expenseImport.test.mjs ok');
