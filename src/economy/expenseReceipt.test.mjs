import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expensePatchFromReceipt,
  expenseTypeHint,
  findDuplicateExpense,
  frequentExpenseTypes,
  guessExpenseType,
  plausibleReceiptDate,
  vatCodeForPercent,
} from './expenseReceipt.js';
import { emptyExpense, expenseBillingChoice, normalizeExpense } from './expenses.js';

const TODAY = '2026-10-29';

// Kvitteringen i eksempelet: bokhandel, 69,00 kr, 25 % mva (13,80), 7. oktober 2020.
const bookReceipt = {
  supplier: 'SIA Bok Kristiansand',
  orgNr: '950 437 537',
  date: '2026-10-07',
  amount: 69,
  currency: 'NOK',
  vatAmount: 13.8,
  vatPercent: 25,
  invoiceNumber: '99056',
  expenseType: 'books',
  suggestedTitle: 'Bok – SIA Bok Kristiansand',
  confidence: 0.9,
};

test('kvittering fyller dato, beløp, valuta, mva, leverandør, type og beskrivelse', () => {
  const { patch, interpreted, warnings } = expensePatchFromReceipt(
    { ...bookReceipt, orgNr: '950437537' },
    { today: TODAY },
  );
  assert.equal(patch.date, '2026-10-07');
  assert.equal(patch.amountInclVat, 69);
  assert.equal(patch.currency, 'NOK');
  assert.equal(patch.vatCode, 'HIGH');
  assert.equal(patch.vendor, 'SIA Bok Kristiansand');
  assert.equal(patch.vendorOrgNr, '950437537');
  assert.equal(patch.receiptNumber, '99056');
  assert.equal(patch.category, 'books');
  assert.equal(patch.description, 'Bok – SIA Bok Kristiansand');
  assert.equal(patch.vatTreatment, '1');
  assert.deepEqual(interpreted.sort(), [
    'amountInclVat', 'category', 'currency', 'date', 'description', 'receiptNumber', 'vatCode', 'vatTreatment', 'vendor', 'vendorOrgNr',
  ]);
  assert.deepEqual(warnings, []);
  // Utlegget får riktig beløp eks. mva fra satsen på kvitteringen, ikke fra typen (bøker 0 %).
  const row = normalizeExpense(emptyExpense({ ...patch }));
  assert.equal(row.amountInclVat, 69);
  assert.equal(row.amountExVat, 55.2);
  assert.equal(row.vatAmount, 13.8);
});

test('felt den ansatte har endret, beholdes', () => {
  const { patch, interpreted } = expensePatchFromReceipt(bookReceipt, { today: TODAY, touched: { amountInclVat: true, category: true } });
  assert.equal(patch.amountInclVat, undefined);
  assert.equal(patch.category, undefined);
  assert.ok(!interpreted.includes('amountInclVat'));
});

test('utenlandsk valuta: beløpet lagres i valuta, NOK skrives inn, ingen norsk mva', () => {
  const { patch, warnings } = expensePatchFromReceipt({ ...bookReceipt, currency: 'eur', amount: 12.5, vatPercent: 20 }, { today: TODAY });
  assert.equal(patch.currency, 'EUR');
  assert.equal(patch.originalAmount, 12.5);
  assert.equal(patch.originalCurrency, 'EUR');
  assert.equal(patch.amountInclVat, undefined);
  assert.equal(patch.vatCode, 'OUTSIDE');
  assert.match(warnings.join(' '), /EUR/);
});

test('dato frem i tid eller langt tilbake brukes ikke', () => {
  assert.equal(plausibleReceiptDate('2026-10-07', TODAY), true);
  assert.equal(plausibleReceiptDate('2027-01-01', TODAY), false);
  assert.equal(plausibleReceiptDate('2019-01-01', TODAY), false);
  assert.equal(plausibleReceiptDate('07.10.2026', TODAY), false);
  const { patch, warnings } = expensePatchFromReceipt({ ...bookReceipt, date: '2027-05-01' }, { today: TODAY });
  assert.equal(patch.date, undefined);
  assert.match(warnings[0], /Datoen/);
});

test('mva: flere satser gir den største, mva 0 gir fritatt', () => {
  assert.equal(vatCodeForPercent(25), 'HIGH');
  assert.equal(vatCodeForPercent('15'), 'MID');
  assert.equal(vatCodeForPercent(12), 'LOW');
  assert.equal(vatCodeForPercent(0), 'EXEMPT');
  assert.equal(vatCodeForPercent(20), '');
  const mixed = expensePatchFromReceipt({
    ...bookReceipt,
    vatPercent: null,
    vatLines: [{ percent: 25, base: 40, vat: 10 }, { percent: 15, base: 200, vat: 30 }],
  }, { today: TODAY });
  assert.equal(mixed.patch.vatCode, 'MID');
  const toll = expensePatchFromReceipt({ supplier: 'Fjellinjen', amount: 42, vatAmount: 0, vatPercent: null, date: '2026-10-01' }, { today: TODAY });
  assert.equal(toll.patch.vatCode, 'EXEMPT');
  assert.equal(toll.patch.category, 'toll');
});

test('utgiftstype: AI-ens id, ellers nøkkelord på leverandør og varer', () => {
  assert.equal(guessExpenseType({ expenseType: 'hotel' }), 'hotel');
  assert.equal(guessExpenseType({ expenseType: 'ukjent', supplier: 'Circle K Lillestrøm' }), 'fuel');
  assert.equal(guessExpenseType({ supplier: 'EasyPark' }), 'parking');
  assert.equal(guessExpenseType({ supplier: 'Vy', lineItems: [{ description: 'Enkeltbillett' }] }), 'transit');
  assert.equal(guessExpenseType({ supplier: 'Ukjent AS' }), '');
  assert.match(expenseTypeHint(), /hotel: Hotell og overnatting/);
  assert.doesNotMatch(expenseTypeHint(), /mileage/);
});

test('ofte brukt: personens mest brukte typer', () => {
  const rows = [
    { employeeId: 'a', category: 'parking', date: '2026-10-01' },
    { employeeId: 'a', category: 'parking', date: '2026-10-02' },
    { employeeId: 'a', category: 'meals', date: '2026-10-05' },
    { employeeId: 'a', category: 'other', date: '2026-10-05' },
    { employeeId: 'b', category: 'hotel', date: '2026-10-05' },
  ];
  assert.deepEqual(frequentExpenseTypes(rows, { employeeId: 'a' }), ['parking', 'meals']);
});

test('samme kvittering to ganger oppdages', () => {
  const rows = [{ id: 'x', employeeId: 'a', date: '2026-10-07', amountInclVat: 69 }];
  assert.ok(findDuplicateExpense(rows, { employeeId: 'a', date: '2026-10-07', amountInclVat: '69' }));
  assert.equal(findDuplicateExpense(rows, { id: 'x', employeeId: 'a', date: '2026-10-07', amountInclVat: 69 }), null);
  assert.equal(findDuplicateExpense(rows, { employeeId: 'a', date: '2026-10-08', amountInclVat: 69 }), null);
});

test('fakturering ja / usikker / nei og vedlegg lagres på utlegget', () => {
  const no = normalizeExpense({ billingChoice: 'no', amountInclVat: 100 });
  assert.equal(no.billable, false);
  assert.equal(expenseBillingChoice(no), 'no');
  const unsure = normalizeExpense({ billingChoice: 'unsure', amountInclVat: 100 });
  assert.equal(unsure.billable, true);
  assert.equal(expenseBillingChoice(unsure), 'unsure');
  assert.equal(expenseBillingChoice(normalizeExpense({ billable: false })), 'no');
  const withFiles = normalizeExpense({
    attachments: [{ url: 'https://x/a.jpg', name: 'a.jpg', type: 'image/jpeg', path: 'families/c/mileage/utlegg/a.jpg' }, { name: 'uten url' }],
  });
  assert.equal(withFiles.attachments.length, 1);
  assert.equal(withFiles.receiptUri, 'https://x/a.jpg');
  assert.equal(withFiles.receiptName, 'a.jpg');
  const foreign = normalizeExpense({ originalAmount: 12.5, originalCurrency: 'eur', currency: 'EUR', amountInclVat: 145 });
  assert.equal(foreign.originalAmount, 12.5);
  assert.equal(foreign.originalCurrency, 'EUR');
});

test('formål, betalingsmåte og avgiftskode fylles også', () => {
  const { patch, interpreted } = expensePatchFromReceipt({
    ...bookReceipt,
    supplier: 'Egon Kvadraturen',
    expenseType: 'representation',
    purpose: 'Lunsj med kunde',
    paymentMethod: 'kort',
    cardLast4: '9141',
  }, { today: TODAY });
  assert.equal(patch.purpose, 'Lunsj med kunde');
  assert.equal(patch.paymentMethod, 'kort');
  assert.equal(patch.cardLast4, '9141');
  // Representasjon: ikke fradrag.
  assert.equal(patch.vatTreatment, '0');
  for (const key of ['purpose', 'paymentMethod', 'vatTreatment']) assert.ok(interpreted.includes(key), key);
  // Tjeneste fra utlandet: omvendt avgiftsplikt.
  const adobe = expensePatchFromReceipt({ supplier: 'Adobe', expenseType: 'software', amount: 24, currency: 'EUR', vendorCountry: 'IE', isService: true, date: '2026-10-01' }, { today: TODAY });
  assert.equal(adobe.patch.vatTreatment, '86');
  const row = normalizeExpense({ vatTreatment: '86', paymentMethod: 'kort', cardLast4: '**9141', attachments: [{ url: 'https://x/s.jpg', originalUrl: 'https://x/o.jpg' }] });
  assert.equal(row.vatTreatment, '86');
  assert.equal(row.cardLast4, '9141');
  assert.equal(row.attachments[0].originalUrl, 'https://x/o.jpg');
});

test('eks. mva lagres slik kvitteringen viser det, også med flere satser', () => {
  // Matbutikk: 15 % på mat (200 + 30) og 25 % på annet (40 + 10). Totalt 280, mva 40.
  const { patch } = expensePatchFromReceipt({
    supplier: 'Rema 1000', date: '2026-10-07', amount: 280, currency: 'NOK',
    vatLines: [{ percent: 15, base: 200, vat: 30 }, { percent: 25, base: 40, vat: 10 }],
  }, { today: TODAY });
  assert.equal(patch.receiptVat, 40);
  const row = normalizeExpense({ amountInclVat: 280, amountExVat: 240, vatSplit: 'receipt', vatCode: patch.vatCode });
  assert.equal(row.amountExVat, 240);
  assert.equal(row.vatAmount, 40);
  assert.equal(row.amountInclVat, 280);
  assert.equal(row.vatSplit, 'receipt');
  // Uten kvitteringens mva: eks. mva fra satsen (som før).
  const byRate = normalizeExpense({ amountInclVat: 280, vatCode: 'MID' });
  assert.equal(byRate.amountExVat, 243.48);
  // Utenlandsk kvittering: ingen norsk mva å trekke fra.
  assert.equal(expensePatchFromReceipt({ supplier: 'X', amount: 20, currency: 'EUR', vatAmount: 4, date: '2026-10-07' }, { today: TODAY }).patch.receiptVat, undefined);
});
