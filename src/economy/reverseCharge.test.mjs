/**
 * L-34: omvendt avgiftsplikt og valuta på fakturaen (innhold, PDF og EHF).
 *   node --test src/economy/reverseCharge.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEhfXml, supplierFromCompany } from './ehf.js';
import { normalizeLine, totalsFromLines } from './invoiceLines.js';
import { issueInvoice, recalcInvoice } from './invoiceFlow.js';
import { emptyInvoice } from './invoices.js';
import { invoiceContentChecks } from './invoiceContent.js';
import { vatCodeForAccount } from './invoiceDraft.js';
import { buildInvoicePdf } from './invoicePdf.js';
import { vatPayableAccount } from './accountsChart.js';
import { VAT_CODES, hasReverseCharge, vatCodeById } from './vat.js';
import { PRODUCT_VAT_CODES } from '../../functions/powerOfficeMap.js';

const supplier = supplierFromCompany({
  navn: 'Consult1 AS',
  organisasjonsnummer: '916538804',
  organisasjonsformKode: 'AS',
  mva: true,
  forretning: { lines: ['Svanholmen 7'], postnummer: '4313', poststed: 'Sandnes' },
  kontonummer: '32010946149',
});

const chart = [
  { code: '3000', kind: 'sale', vatRate: 25, vatLetter: 'S', vatCode: '3' },
  { code: '3150', kind: 'sale', vatRate: 0, vatLetter: 'Z', vatCode: '51' },
];

function invoiceWith(lines, over = {}) {
  const draft = recalcInvoice(emptyInvoice({
    id: 'inv_ae',
    status: 'draft',
    customerName: 'Bygg Hovedentreprenør AS',
    orgnr: '948243113',
    customerAddress: { street: 'Industriveien 1', postalCode: '4313', city: 'Sandnes' },
    customerReference: 'P-77',
    bankAccount: '32010946149',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    lines,
    ...over,
  }));
  return issueInvoice(draft, { number: '20001', date: '2026-09-30', creditDays: 14, kidFormat: 'invoice' }).invoice;
}

const reverseLine = (over = {}) => normalizeLine({
  section: 'hours', description: 'Tømrerarbeid som underentreprenør', quantity: 10, unit: 't', unitPrice: 800,
  account: '3150', vatCode: vatCodeForAccount('3150', chart), periodStart: '2026-09-01', periodEnd: '2026-09-30', ...over,
});
const highLine = () => normalizeLine({ section: 'fixed', description: 'Rigg', quantity: 1, unitPrice: 1000, account: '3000', vatCode: 'HIGH' });

test('mva-koden: omvendt avgiftsplikt uten mva, valgt fra kontoens mva-kode 51', () => {
  const code = vatCodeById('REVERSE');
  assert.equal(code.percent, 0);
  assert.equal(code.category, 'AE');
  assert.equal(code.label, 'Omvendt avgiftsplikt');
  assert.equal(vatCodeForAccount('3150', chart), 'REVERSE');
  assert.equal(vatCodeForAccount('3000', chart), 'HIGH');
  assert.equal(vatPayableAccount('REVERSE'), '', 'selgeren fører ikke utgående mva');
  const totals = totalsFromLines([reverseLine(), highLine()]);
  assert.equal(totals.vat, 250);
  assert.equal(totals.amountExVat, 9000);
  assert.deepEqual(totals.groups.map((g) => [g.vatCode, g.category, g.vatAmount]), [['REVERSE', 'AE', 0], ['HIGH', 'S', 250]]);
  assert.equal(hasReverseCharge([reverseLine()]), true);
  assert.equal(hasReverseCharge([highLine()]), false);
  // PowerOffice kan få et produkt for hver mva-kode i ProTop.
  assert.deepEqual([...PRODUCT_VAT_CODES].sort(), VAT_CODES.map((row) => row.id).sort());
});

test('innhold: kjøpers org.nr. og selgers mva-registrering kreves', () => {
  const ok = invoiceContentChecks(invoiceWith([reverseLine()]), { supplier });
  assert.deepEqual(ok.blocking, []);
  const noOrg = invoiceContentChecks(invoiceWith([reverseLine()], { orgnr: '' }), { supplier });
  assert.deepEqual(noOrg.blocking.map((row) => row.id), ['reverseBuyer']);
  const notVat = invoiceContentChecks(invoiceWith([reverseLine()]), { supplier: { ...supplier, vatRegistered: false } });
  assert.deepEqual(notVat.blocking.map((row) => row.id), ['reverseSupplier']);
  const unknown = invoiceContentChecks(invoiceWith([reverseLine()]), { supplier: { ...supplier, vatKnown: false } });
  assert.deepEqual(unknown.blocking, []);
  assert.ok(unknown.warnings.some((row) => row.id === 'reverseSupplier'));
  // Vanlig faktura uten org.nr. (privatkunde) berøres ikke.
  const plain = invoiceContentChecks(invoiceWith([highLine()], { orgnr: '' }), { supplier });
  assert.equal(plain.blocking.some((row) => row.id === 'reverseBuyer'), false);
});

test('PDF: påskriften «Omvendt avgiftsplikt», også sammen med linjer med mva', () => {
  const body = Buffer.from(buildInvoicePdf(invoiceWith([reverseLine(), highLine()]), { supplier })).toString('latin1');
  assert.ok(body.includes('(Omvendt avgiftsplikt. Kj\\370peren beregner og betaler merverdiavgiften \\(mval. \\247 11-1\\).) Tj'));
  assert.ok(body.includes('Foretaksregisteret NO 916 538 804 MVA'));
  assert.ok(body.includes('NO 948 243 113'), 'kjøpers org.nr. står på fakturaen');
  const plain = Buffer.from(buildInvoicePdf(invoiceWith([highLine()]), { supplier })).toString('latin1');
  assert.ok(!plain.includes('Omvendt avgiftsplikt'));
  const english = Buffer.from(buildInvoicePdf(invoiceWith([reverseLine()], { language: 'en' }), { supplier })).toString('latin1');
  assert.ok(english.includes('Omvendt avgiftsplikt \\(reverse charge\\)'));
});

test('PDF: beløpene merkes med fakturaens valuta', () => {
  const nok = Buffer.from(buildInvoicePdf(invoiceWith([highLine()]), { supplier })).toString('latin1');
  assert.ok(nok.includes('Sum eks. mva NOK'));
  assert.ok(nok.includes('\\305 betale NOK'));
  const eur = Buffer.from(buildInvoicePdf(invoiceWith([highLine()], { currency: 'EUR' }), { supplier })).toString('latin1');
  assert.ok(eur.includes('Sum eks. mva EUR'));
  assert.ok(eur.includes('Sum ink. mva EUR'));
  assert.ok(eur.includes('\\305 betale EUR'));
  assert.ok(!/[A-Za-z.] NOK\)/.test(eur), 'ingen etikett med NOK');
  // Ugyldig kode gir NOK som før.
  const odd = Buffer.from(buildInvoicePdf(invoiceWith([highLine()], { currency: 'euro' }), { supplier })).toString('latin1');
  assert.ok(odd.includes('Sum eks. mva NOK'));
});

test('EHF: kategori AE med fritaksgrunn i oppsummeringen, 0 i mva', () => {
  const ehf = buildEhfXml(invoiceWith([reverseLine(), highLine()]), { supplier });
  assert.ok(ehf.ok, ehf.error);
  const subtotals = ehf.xml.match(/<cac:TaxSubtotal>[\s\S]*?<\/cac:TaxSubtotal>/g);
  assert.equal(subtotals.length, 2);
  const ae = subtotals.find((row) => row.includes('<cbc:ID>AE</cbc:ID>'));
  assert.ok(ae.includes('<cbc:TaxableAmount currencyID="NOK">8000.00</cbc:TaxableAmount>'));
  assert.ok(ae.includes('<cbc:TaxAmount currencyID="NOK">0.00</cbc:TaxAmount>'));
  assert.ok(ae.includes('<cbc:Percent>0.00</cbc:Percent>'));
  assert.ok(ae.includes('<cbc:TaxExemptionReasonCode>VATEX-EU-AE</cbc:TaxExemptionReasonCode>'));
  assert.ok(ae.includes('<cbc:TaxExemptionReason>Omvendt avgiftsplikt</cbc:TaxExemptionReason>'));
  assert.ok(subtotals.some((row) => row.includes('<cbc:ID>S</cbc:ID>') && row.includes('>250.00<')));
  // Linjen har AE og 0 %, uten fritaksgrunn.
  const line = ehf.xml.match(/<cac:InvoiceLine>[\s\S]*?<\/cac:InvoiceLine>/)[0];
  assert.ok(line.includes('<cbc:ID>AE</cbc:ID>'));
  assert.ok(!line.includes('TaxExemptionReason'));
  // Selgers mva-nummer og kjøpers org.nr. (BR-AE-02).
  assert.ok(ehf.xml.includes('<cbc:CompanyID>NO916538804MVA</cbc:CompanyID>'));
  assert.ok(ehf.xml.includes('<cbc:EndpointID schemeID="0192">948243113</cbc:EndpointID>'));
  assert.ok(ehf.xml.includes('<cbc:TaxAmount currencyID="NOK">250.00</cbc:TaxAmount>'));
});

test('EHF: omvendt avgiftsplikt uten mva-registrering eller kundens org.nr. stoppes', () => {
  const notVat = buildEhfXml(invoiceWith([reverseLine()]), { supplier: { ...supplier, vatRegistered: false } });
  assert.equal(notVat.ok, false);
  assert.match(notVat.error, /Merverdiavgiftsregisteret/);
  const noOrg = buildEhfXml(invoiceWith([reverseLine()], { orgnr: '' }), { supplier });
  assert.equal(noOrg.ok, false);
  assert.match(noOrg.error, /org\.nr\./);
});

test('EHF: valutaen på fakturaen brukes i hele fila', () => {
  const ehf = buildEhfXml(invoiceWith([highLine()], { currency: 'EUR' }), { supplier });
  assert.ok(ehf.ok, ehf.error);
  assert.ok(ehf.xml.includes('<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>'));
  assert.ok(ehf.xml.includes('<cbc:PayableAmount currencyID="EUR">1250.00</cbc:PayableAmount>'));
  assert.ok(!ehf.xml.includes('currencyID="NOK"'));
});
