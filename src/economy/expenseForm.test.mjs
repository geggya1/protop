/**
 * «Nytt utlegg»: prosjektvelgeren og utfylling fra en tolket kvittering.
 */
import assert from 'node:assert/strict';
import { expensePatchFromReceipt, expenseProjectOptions, receiptVatCode } from './expenseForm.js';

{
  const projects = [
    { id: 'p1', number: '10772', name: 'Prismen', client: 'Hillevågsveien 59-63 AS' },
    { id: 'p2', number: '10010', name: 'Kontorbygg' },
    { id: 'p3', number: '9001', name: 'Gammel', phase: 'avsluttet' },
    { id: 'p4', number: '8000', name: 'Arkivert', status: 'arkivert' },
    { id: 'p5', number: '10020', name: 'Annet', projectStatus: 'Under arbeid' },
  ];
  const options = expenseProjectOptions(projects, { mineIds: new Set(['p5']) });
  assert.deepEqual(options.map((row) => row.id), ['p5', 'p2', 'p1', 'p3']);
  assert.deepEqual([...new Set(options.map((row) => row.group))], ['Dine aktive prosjekter', 'Andre aktive prosjekter', 'Avsluttede prosjekter']);
  assert.equal(options[2].label, '#10772 Prismen');
  assert.equal(options[2].hint, 'Hillevågsveien 59-63 AS');
  assert.ok(options[2].keywords.includes('Hillevågsveien 59-63 AS'), 'søket treffer kunden');
  // Arkivert vises bare når utlegget allerede står på prosjektet.
  assert.ok(expenseProjectOptions(projects, { keepId: 'p4' }).some((row) => row.id === 'p4'));
  assert.deepEqual(expenseProjectOptions([], {}), []);
}

assert.equal(receiptVatCode(25), 'HIGH');
assert.equal(receiptVatCode(15), 'MID');
assert.equal(receiptVatCode(12), 'LOW');
assert.equal(receiptVatCode(0), 'EXEMPT');
assert.equal(receiptVatCode(25.1), 'HIGH');
assert.equal(receiptVatCode(null), null);
assert.equal(receiptVatCode(8), null);

{
  // Tomt skjema: dato, beløp eks. mva, beskrivelse og kategori fylles.
  const draft = { date: '2026-10-29', category: 'other', amountExVat: '' };
  const bilag = {
    supplier: 'Byggmakker Sandnes', date: '2026-10-27', amount: 1250, vatAmount: 250, vatPercent: 25,
    category: 'bygg', suggestedTitle: 'Skruer og lister – Byggmakker',
  };
  const { patch, summary, filled } = expensePatchFromReceipt(draft, bilag, { today: '2026-10-29' });
  assert.deepEqual(patch, {
    vendor: 'Byggmakker Sandnes',
    date: '2026-10-27',
    vatCode: 'HIGH',
    amountExVat: '1000',
    description: 'Skruer og lister – Byggmakker',
    category: 'materials',
  });
  assert.deepEqual(filled, ['dato', 'beløp', 'beskrivelse', 'kategori']);
  assert.match(summary, /^Lest fra kvitteringen: Byggmakker Sandnes, 27\.10\.2026, 1 250,00 kr inkl\. mva \(mva 250,00 kr\)\./);
}

{
  // Det brukeren har skrevet, overskrives ikke. Dato endret av brukeren står.
  const draft = { date: '2026-10-01', amountExVat: '3', description: 'TEST', category: 'tools', vendor: 'Meg' };
  const { patch, filled } = expensePatchFromReceipt(draft, { supplier: 'X', date: '2026-10-27', amount: 500, vatAmount: 100 }, { today: '2026-10-29' });
  assert.deepEqual(patch, {});
  assert.deepEqual(filled, []);
}

{
  // Bompenger uten mva, og beløp uten mva-opplysning (regnes som 25 %).
  assert.deepEqual(expensePatchFromReceipt({}, { amount: 45, vatPercent: 0, category: 'bompenger' }).patch, {
    vatCode: 'EXEMPT', amountExVat: '45', category: 'toll',
  });
  assert.equal(expensePatchFromReceipt({}, { amount: 125 }).patch.amountExVat, '100');
  assert.match(expensePatchFromReceipt({}, {}).summary, /Fant ikke/);
}
