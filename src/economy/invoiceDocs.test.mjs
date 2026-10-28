/**
 * PDF og EHF fra fakturamotoren: faktura, kreditnota, utkast og timespesifikasjon.
 */
import assert from 'node:assert/strict';
import { buildEhfXml, ehfReadiness, supplierFromCompany, supplierLegalLine } from './ehf.js';
import { normalizeLine } from './invoiceLines.js';
import { buildCreditNote, issueInvoice, recalcInvoice } from './invoiceFlow.js';
import { emptyInvoice } from './invoices.js';
import {
  buildInvoicePdf,
  buildInvoiceWithTimeSpecPdf,
  buildTimeSpecPdf,
  invoicePdfName,
  pdfBase64,
  textWidth,
} from './invoicePdf.js';

const supplier = supplierFromCompany({
  navn: 'Consult1 AS',
  organisasjonsnummer: '916538804',
  organisasjonsformKode: 'AS',
  mva: true,
  forretning: { lines: ['Svanholmen 7'], postnummer: '4313', poststed: 'Sandnes' },
  kontonummer: '32010946149',
  telefon: '+47 52 05 52 10',
  epostadresse: 'faktura@consult1.no',
});
assert.equal(supplier.inForetaksregisteret, true);
assert.equal(supplier.vatRegistered, true);
assert.equal(supplierLegalLine(supplier), 'Foretaksregisteret NO 916 538 804 MVA');
assert.equal(supplierLegalLine({ ...supplier, inForetaksregisteret: false, vatRegistered: false }), 'NO 916 538 804');
// Ukjent mva-registrering gir ikke «MVA» (bokføringsforskriften § 5-1-1). Beskrivelsen fra Brønnøysund gir foretaksform.
{
  const unknown = supplierFromCompany({ navn: 'Ny AS', organisasjonsnummer: '916538804', organisasjonsform: 'Aksjeselskap', addressLabel: 'Gate 1, 4313 Sandnes' });
  assert.equal(unknown.vatRegistered, null);
  assert.equal(unknown.inForetaksregisteret, true);
  assert.equal(supplierLegalLine(unknown), 'Foretaksregisteret NO 916 538 804');
  const enk = supplierFromCompany({ navn: 'Ola', organisasjonsnummer: '916538804', organisasjonsform: 'Enkeltpersonforetak', mva: false });
  assert.equal(enk.inForetaksregisteret, false);
  assert.equal(supplierLegalLine(enk), 'NO 916 538 804');
}

const draft = recalcInvoice(emptyInvoice({
  id: 'inv_test',
  status: 'draft',
  customerName: 'Sola Kommune',
  customerNumber: '10027',
  orgnr: '948243113',
  customerAddress: { street: 'Postboks 99', postalCode: '4097', city: 'Sola' },
  customerReference: '5611001',
  projectNumber: '10791',
  projectName: 'Jåsund Skole',
  bankAccount: '32010946149',
  lines: [
    normalizeLine({ section: 'hours', description: 'Linda Øie', quantity: 10.5, unit: 't', unitPrice: 1090, periodStart: '2026-09-01', periodEnd: '2026-09-30', timeEntryIds: ['t1'] }),
    normalizeLine({ section: 'expenses', description: 'Utlegg <iTech> & co', quantity: 1, unitPrice: 60807.21, markupPercent: 15, account: '3001' }),
    normalizeLine({ section: 'products', description: 'Vare', quantity: 3, unitPrice: 99.9, discountPercent: 10, vatCode: 'MID' }),
  ],
}));
const invoice = issueInvoice(draft, { number: '16722', date: '2026-09-30', creditDays: 28, kidFormat: 'invoice' }).invoice;

// EHF faktura.
const ehf = buildEhfXml(invoice, { supplier, attachments: [{ name: 'Faktura-16722.pdf', mime: 'application/pdf', base64: 'JVBERi0=' }] });
assert.ok(ehf.ok, ehf.error);
assert.ok(ehf.xml.startsWith('<?xml'));
assert.ok(ehf.xml.includes('<Invoice '));
assert.ok(ehf.xml.includes('<cbc:EndpointID schemeID="0192">916538804</cbc:EndpointID>'));
assert.ok(ehf.xml.includes('<cbc:EndpointID schemeID="0192">948243113</cbc:EndpointID>'));
assert.ok(ehf.xml.includes('<cbc:CompanyID>NO916538804MVA</cbc:CompanyID>'));
assert.ok(ehf.xml.includes('<cbc:CompanyLegalForm>Foretaksregisteret</cbc:CompanyLegalForm>'));
assert.ok(ehf.xml.includes('<cbc:BuyerReference>5611001</cbc:BuyerReference>'));
assert.ok(ehf.xml.includes('<cbc:PaymentID>167221</cbc:PaymentID>'));
assert.ok(ehf.xml.includes('<cbc:ChargeIndicator>true</cbc:ChargeIndicator>'));
assert.ok(ehf.xml.includes('<cbc:ChargeIndicator>false</cbc:ChargeIndicator>'));
assert.ok(ehf.xml.includes('unitCode="HUR"'));
assert.ok(ehf.xml.includes('EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="Faktura-16722.pdf"'));
assert.ok(ehf.xml.includes('Utlegg &lt;iTech&gt; &amp; co'));
assert.ok(!ehf.xml.includes('<CreditNote'));
const amount = (tag) => Number(ehf.xml.match(new RegExp(`<cbc:${tag} currencyID="NOK">([^<]+)<`))[1]);
assert.equal(amount('LineExtensionAmount'), Math.round(invoice.lines.reduce((sum, line) => sum + line.amountExVat, 0) * 100) / 100);
assert.equal(amount('TaxExclusiveAmount'), invoice.amountExVat);
assert.equal(amount('TaxInclusiveAmount'), invoice.amountInclVat);

// EHF kreditnota: CreditNote med positive beløp og henvisning.
const credit = issueInvoice(buildCreditNote(invoice, { reason: 'Feil pris' }).invoice, { number: '16723', date: '2026-10-01' }).invoice;
const cn = buildEhfXml(credit, { supplier });
assert.ok(cn.ok);
assert.ok(cn.xml.includes('<CreditNote '));
assert.ok(cn.xml.includes('<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>'));
assert.ok(cn.xml.includes('<cac:InvoiceDocumentReference>'));
assert.ok(cn.xml.includes('<cbc:ID>16722</cbc:ID>'));
assert.ok(cn.xml.includes('<cbc:CreditedQuantity'));
assert.ok(!/currencyID="NOK">-/.test(cn.xml), 'beløpene i en CreditNote er positive');
assert.ok(!cn.xml.includes('<cac:PaymentMeans>'));

// Klar for EHF?
assert.equal(ehfReadiness(invoice, supplier).ok, true);
assert.equal(ehfReadiness({ ...invoice, orgnr: '' }, supplier).ok, false);
assert.equal(ehfReadiness({ ...invoice, customerReference: '' }, supplier).warnings.length, 1);

// PDF.
const pdf = buildInvoicePdf(invoice, { supplier });
const head = String.fromCharCode(...pdf.slice(0, 8));
assert.equal(head, '%PDF-1.4');
const body = Buffer.from(pdf).toString('latin1');
assert.ok(body.includes('FAKTURA 16722'));
assert.ok(body.includes('Foretaksregisteret NO 916 538 804 MVA'));
assert.ok(body.includes('Leveringsperiode'), 'perioden fra timelinjene står på fakturaen');
assert.ok(!body.includes('Leveringsdato'));
assert.ok(body.includes('167221'));
assert.ok(body.includes('Side 1 av 1'));
const draftPdf = Buffer.from(buildInvoicePdf(draft, { supplier })).toString('latin1');
assert.ok(draftPdf.includes('FAKTURAUTKAST'));
const creditPdf = Buffer.from(buildInvoicePdf(credit, { supplier, originalDate: '30.09.2026' })).toString('latin1');
assert.ok(creditPdf.includes('KREDITNOTA 16723'));
assert.ok(creditPdf.includes('Faktura 16722 av 30.09.2026'));
const entries = [{ id: 't1', date: '2026-09-03', employeeName: 'Linda Øie', activityName: 'Hovedaktivitet', hours: 10.5, description: 'Byggemøte' }];
const spec = Buffer.from(buildTimeSpecPdf(invoice, entries, { supplier })).toString('latin1');
assert.ok(spec.includes('Timespesifikasjon'));
assert.ok(spec.includes('Byggem'));
const both = Buffer.from(buildInvoiceWithTimeSpecPdf(invoice, entries, { supplier })).toString('latin1');
assert.ok(both.includes('/Count 2'));
assert.equal(invoicePdfName(invoice), 'Faktura-16722.pdf');
assert.equal(invoicePdfName(draft), 'Faktura-utkast.pdf');
assert.equal(invoicePdfName(credit), 'Kreditnota-16723.pdf');
assert.ok(pdfBase64(pdf).startsWith('JVBERi0xLjQ'));

// Uten periode: fakturadatoen står som leveringsdato på PDF og i EHF.
{
  const noPeriod = issueInvoice(recalcInvoice({
    ...draft,
    id: 'inv_noperiod',
    periodStart: '',
    periodEnd: '',
    lines: [normalizeLine({ section: 'products', description: 'Vare', quantity: 1, unitPrice: 1000, account: '3000' })],
  }), { number: '16725', date: '2026-10-05' }).invoice;
  assert.equal(noPeriod.periodStart, '');
  const noPeriodPdf = Buffer.from(buildInvoicePdf(noPeriod, { supplier })).toString('latin1');
  assert.ok(noPeriodPdf.includes('Leveringsdato'));
  assert.ok(noPeriodPdf.includes('05.10.2026'));
  const noPeriodEhf = buildEhfXml(noPeriod, { supplier });
  assert.ok(noPeriodEhf.xml.includes('<cbc:ActualDeliveryDate>2026-10-05</cbc:ActualDeliveryDate>'));
  // Selskap som ikke er mva-registrert: ingen MVA-id i EHF.
  const plain = buildEhfXml(noPeriod, { supplier: { ...supplier, vatRegistered: null } });
  assert.ok(!plain.xml.includes('NO916538804MVA'));
}

// Mange linjer gir flere sider.
const long = recalcInvoice({
  ...draft,
  lines: Array.from({ length: 80 }, (_, i) => normalizeLine({ id: `l${i}`, section: 'hours', description: `Linje ${i}`, quantity: 1, unitPrice: 100, unit: 't' })),
});
const longPdf = Buffer.from(buildInvoicePdf(long, { supplier })).toString('latin1');
assert.ok(/\/Count [2-9]/.test(longPdf));
assert.ok(longPdf.includes('Side 2 av'));

// Bredder: tall i Helvetica er 0,556 em.
assert.equal(Math.round(textWidth('1 090,00', 10) * 100) / 100, 38.92);

console.log('invoiceDocs.test.mjs: ok');
