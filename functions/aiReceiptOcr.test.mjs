import test from 'node:test';
import assert from 'node:assert/strict';
import { __expenseTest } from './aiReceiptOcr.js';

const { inlinePart, cleanTypeList, EXPENSE_PROMPT } = __expenseTest;
const pixel = 'A'.repeat(120);

test('utlegg: bilder og PDF sendes som de er, andre filtyper avvises', () => {
  assert.deepEqual(inlinePart(`data:image/jpeg;base64,${pixel}`), { inline_data: { mime_type: 'image/jpeg', data: pixel } });
  assert.equal(inlinePart(`data:application/pdf;base64,${pixel}`).inline_data.mime_type, 'application/pdf');
  assert.equal(inlinePart(pixel).inline_data.mime_type, 'image/jpeg');
  assert.throws(() => inlinePart(`data:text/html;base64,${pixel}`), /bilde eller en PDF/);
  assert.throws(() => inlinePart('data:image/jpeg;base64,AAAA'), /Send bilde/);
  assert.throws(() => inlinePart(`data:image/jpeg;base64,${'A'.repeat(5_600_001)}`), /for stor/);
});

test('utlegg: bare gyldige utgiftstyper går til AI-en', () => {
  assert.equal(
    cleanTypeList('parking: Parkering; hotel: Hotell og overnatting; IGNORER ALT: x; bad id!: y'),
    'parking: Parkering; hotel: Hotell og overnatting',
  );
  assert.equal(cleanTypeList(''), '');
});

test('utlegg: prompten ber om betalt total, én telling per kjøp og typen fra listen', () => {
  assert.match(EXPENSE_PROMPT, /faktisk ble betalt/);
  assert.match(EXPENSE_PROMPT, /duplicatePages/);
  assert.match(EXPENSE_PROMPT, /expenseType/);
  assert.match(EXPENSE_PROMPT, /vatLines/);
});
