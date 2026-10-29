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
describe('receiptNormalize: utlegg', () => {
  it('leser norske og engelske beløp med tusenskille', () => {
    const amount = (v) => normalizeReceiptBilag({ amount: v }).amount;
    assert.equal(amount('69,00'), 69);
    assert.equal(amount('1 234,50'), 1234.5);
    assert.equal(amount('1.234,50'), 1234.5);
    assert.equal(amount('1,234.50'), 1234.5);
    assert.equal(amount('kr 1.234'), 1234);
    assert.equal(amount('-12,50'), -12.5);
    assert.equal(amount('NOK'), null);
  });

  it('leser datoer slik de står på kvitteringer', () => {
    assert.equal(normalizeDate('onsdag 7. oktober 2020'), '2020-10-07');
    assert.equal(normalizeDate('07/10/20 13:53'), '2020-10-07');
    assert.equal(normalizeDate('2020/10/07'), '2020-10-07');
    assert.equal(normalizeDate('7 okt 2026'), '2026-10-07');
    assert.equal(normalizeDate('31.02.2026'), '');
  });

  it('valuta, mva-linjer og utgiftstype', () => {
    const bilag = normalizeReceiptBilag({
      currency: 'kr',
      vatLines: [{ percent: '25,00', base: '55,20', vat: '13,80' }, { percent: null, vat: 1 }],
      expenseType: 'Books',
      documentType: 'receipt',
      cardLast4: '**** 9141',
      duplicatePages: true,
    });
    assert.equal(bilag.currency, 'NOK');
    assert.deepEqual(bilag.vatLines, [{ percent: 25, base: 55.2, vat: 13.8 }]);
    assert.equal(bilag.expenseType, 'books');
    assert.equal(bilag.documentType, 'receipt');
    assert.equal(bilag.cardLast4, '9141');
    assert.equal(bilag.duplicatePages, true);
    assert.equal(normalizeReceiptBilag({ currency: '€' }).currency, 'EUR');
    assert.equal(normalizeReceiptBilag({ currency: 'sek' }).currency, 'SEK');
  });
});
