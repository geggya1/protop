import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestVatTreatment, vatTreatment, VAT_TREATMENTS } from './vatTreatment.js';

test('avgiftskode etter sats på kvitteringen', () => {
  assert.equal(suggestVatTreatment({ vatCode: 'HIGH', category: 'office' }).id, '1');
  assert.equal(suggestVatTreatment({ vatCode: 'MID', category: 'other' }).id, '11');
  assert.equal(suggestVatTreatment({ vatCode: 'LOW', category: 'hotel' }).id, '13');
  assert.equal(suggestVatTreatment({ vatCode: 'EXEMPT', category: 'postage' }).id, '0');
  assert.equal(suggestVatTreatment({ vatCode: '', category: 'other' }).id, '');
});

test('ikke fradrag for representasjon, servering, gaver og personbil', () => {
  for (const category of ['representation', 'meals', 'gifts', 'fuel', 'charging', 'vehicle', 'toll']) {
    const hit = suggestVatTreatment({ vatCode: 'HIGH', category });
    assert.equal(hit.id, '0', category);
    assert.ok(hit.reason.length > 10);
  }
  assert.match(suggestVatTreatment({ vatCode: 'HIGH', category: 'representation' }).reason, /§ 8-3/);
  assert.match(suggestVatTreatment({ vatCode: 'HIGH', category: 'fuel' }).reason, /varebil/);
});

test('kjøp i utlandet: ingen norsk mva, men omvendt avgiftsplikt for tjenester levert hit', () => {
  assert.equal(suggestVatTreatment({ vatCode: 'OUTSIDE', category: 'hotel', foreign: true, isService: true }).id, '0');
  assert.equal(suggestVatTreatment({ vatCode: 'OUTSIDE', category: 'software', foreign: true, isService: true }).id, '86');
  assert.equal(suggestVatTreatment({ vatCode: 'HIGH', category: 'software', vendorCountry: 'IE', isService: true }).id, '86');
  assert.equal(suggestVatTreatment({ vatCode: 'HIGH', category: 'software', vendorCountry: 'NO', isService: true }).id, '1');
});

test('kodelisten', () => {
  assert.deepEqual(VAT_TREATMENTS.map((row) => row.id), ['1', '11', '13', '0', '86']);
  assert.equal(vatTreatment('13').rate, 12);
  assert.equal(vatTreatment('x'), null);
});
