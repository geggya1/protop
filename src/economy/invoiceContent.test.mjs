/**
 * Påbudt innhold på fakturaen (bokføringsforskriften § 5-1-1).
 */
import assert from 'node:assert/strict';
import {
  customerHasAddress,
  deliveryDateOf,
  invoiceContentChecks,
  missingContentError,
  supplierHasAddress,
  supplierVatStatus,
} from './invoiceContent.js';
import { normalizeLine } from './invoiceLines.js';

const supplier = {
  name: 'Consult1 AS',
  orgnr: '916 538 804',
  address: 'Svanholmen 7',
  postalCode: '4313',
  city: 'Sandnes',
  vatRegistered: true,
};
const invoice = {
  customerName: 'Sola kommune',
  orgnr: '948243113',
  customerAddress: { street: 'Postboks 99', postalCode: '4097', city: 'Sola' },
  invoiceDate: '2026-10-01',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  lines: [normalizeLine({ section: 'hours', description: 'Rådgivning', quantity: 2, unitPrice: 1000, account: '3000' })],
};
const ids = (rows) => rows.map((row) => row.id).sort();

{
  const ok = invoiceContentChecks(invoice, { supplier });
  assert.deepEqual(ok.blocking, []);
  assert.deepEqual(ok.warnings, []);
  assert.equal(missingContentError(invoice, { supplier }), '');
}

// Adresser.
assert.equal(customerHasAddress(invoice), true);
assert.equal(customerHasAddress({ customerAddress: { street: 'Gate 1' } }), false, 'gate uten postnummer og sted holder ikke');
assert.equal(supplierHasAddress(supplier), true);
assert.equal(supplierHasAddress({ address: 'Gate 1, 4313 Sandnes' }), true);
assert.equal(supplierHasAddress({ address: 'Gate 1' }), false);
assert.equal(supplierHasAddress({}), false);

// MVA-status: bare true eller false regnes som kjent.
assert.equal(supplierVatStatus({ vatRegistered: true }), true);
assert.equal(supplierVatStatus({ vatRegistered: false }), false);
assert.equal(supplierVatStatus({}), null);
assert.equal(supplierVatStatus({ vatRegistered: 'ja' }), null);

{
  // Alt mangler: tydelige meldinger, i ProTop-modus også for selger.
  const empty = invoiceContentChecks({ lines: [] }, { supplier: {} });
  assert.deepEqual(ids(empty.blocking), ['address', 'customer', 'lines', 'supplierAddress', 'supplierName', 'supplierOrgnr']);
  const error = missingContentError({ lines: [] }, { supplier: {} });
  assert.match(error, /^Fakturaen kan ikke ferdigstilles: /);
  assert.match(error, /Kunden mangler\./);
}

{
  // Org.nr. må ha 9 siffer.
  const short = invoiceContentChecks(invoice, { supplier: { ...supplier, orgnr: '1234' } });
  assert.match(short.blocking.find((row) => row.id === 'supplierOrgnr').text, /9 siffer/);
}

{
  // Mva på linjene krever at selskapet står i Merverdiavgiftsregisteret.
  const unknown = invoiceContentChecks(invoice, { supplier: { ...supplier, vatRegistered: null } });
  assert.deepEqual(ids(unknown.blocking), ['supplierVat']);
  // Uten mva er det ikke noe krav om registrering.
  const zero = {
    ...invoice,
    lines: [normalizeLine({ section: 'outlays', description: 'Gebyr', quantity: 1, unitPrice: 100, vatCode: 'OUTSIDE', account: '3000' })],
  };
  assert.deepEqual(invoiceContentChecks(zero, { supplier: { ...supplier, vatRegistered: false } }).blocking, []);
}

{
  // PowerOffice utsteder: selger kontrolleres ikke her, og kjøpers adresse er et råd når org.nr. finnes.
  const po = invoiceContentChecks({ ...invoice, customerAddress: {} }, { supplier: {}, mode: 'poweroffice' });
  assert.deepEqual(po.blocking, []);
  assert.deepEqual(ids(po.warnings), ['address']);
  const none = invoiceContentChecks({ ...invoice, orgnr: '', customerAddress: {} }, { mode: 'poweroffice' });
  assert.deepEqual(ids(none.blocking), ['party']);
}

{
  // Leveringsdato: perioden, ellers fakturadatoen. Det står i en advarsel.
  assert.deepEqual(deliveryDateOf(invoice), { start: '2026-09-01', end: '2026-09-30', fromInvoiceDate: false });
  assert.deepEqual(deliveryDateOf({ periodEnd: '2026-09-30' }), { start: '2026-09-30', end: '2026-09-30', fromInvoiceDate: false });
  const noPeriod = { ...invoice, periodStart: '', periodEnd: '' };
  assert.deepEqual(deliveryDateOf(noPeriod), { start: '2026-10-01', end: '2026-10-01', fromInvoiceDate: true });
  const checks = invoiceContentChecks(noPeriod, { supplier });
  assert.deepEqual(checks.blocking, []);
  assert.match(checks.warnings.find((row) => row.id === 'period').text, /Fakturadatoen står som leveringsdato/);
  // Kreditnota viser til fakturaen den krediterer, og trenger ikke egen leveringsdato.
  assert.deepEqual(invoiceContentChecks({ ...noPeriod, kind: 'credit_note' }, { supplier }).warnings, []);
}

{
  // Valgt forfall før valgt fakturadato stopper.
  const backwards = invoiceContentChecks({ ...invoice, invoiceDateSet: true, dueDateSet: true, dueDate: '2026-09-15' }, { supplier });
  assert.deepEqual(ids(backwards.blocking), ['dueDate']);
}

{
  // Linje uten tekst og beløp 0.
  const blank = invoiceContentChecks({
    ...invoice,
    lines: [normalizeLine({ section: 'other', description: '', quantity: 0, unitPrice: 0, account: '3000' })],
  }, { supplier });
  assert.deepEqual(ids(blank.blocking), ['amount', 'lineText']);
}

console.log('invoiceContent.test.mjs: ok');
