import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeDate,
  normalizeOrgNr,
  normalizeReceiptBilag,
} from '../../functions/receiptNormalize.js';

describe('receiptNormalize', () => {
  it('parses Norwegian date and orgnr', () => {
    assert.equal(normalizeDate('18.09.2026'), '2026-09-18');
    assert.equal(normalizeDate('2026-09-18'), '2026-09-18');
    assert.equal(normalizeOrgNr('123 456 789'), '123456789');
    assert.equal(normalizeOrgNr('123'), '');
  });

  it('normalizes receipt bilag payload', () => {
    const bilag = normalizeReceiptBilag({
      supplier: '  Kiwi Extra  ',
      orgNr: '123 456 789',
      date: '18.09.2026',
      amount: '64,00',
      vatAmount: '12,80',
      currency: 'nok',
      lineItems: [
        { description: 'Melk', amount: '20,00', quantity: 1 },
        { description: '', amount: null },
      ],
      confidence: 1.2,
      suggestedTitle: '  Kvittering Kiwi  ',
      warrantyMonths: '24',
      warrantyUntil: '18.09.2028',
      warrantyText: '  2 år  ',
    });
    assert.equal(bilag.supplier, 'Kiwi Extra');
    assert.equal(bilag.orgNr, '123456789');
    assert.equal(bilag.date, '2026-09-18');
    assert.equal(bilag.amount, 64);
    assert.equal(bilag.vatAmount, 12.8);
    assert.equal(bilag.currency, 'NOK');
    assert.equal(bilag.lineItems.length, 1);
    assert.equal(bilag.confidence, 1);
    assert.equal(bilag.suggestedTitle, 'Kvittering Kiwi');
    assert.equal(bilag.warrantyMonths, 24);
    assert.equal(bilag.warrantyUntil, '2028-09-18');
    assert.equal(bilag.warrantyText, '2 år');
  });
});