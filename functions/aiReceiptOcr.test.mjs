import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPENSE_PROMPT,
  RECEIPT_MODELS,
  VERIFY_MODELS,
  assembleParts,
  cleanTypeList,
  inlinePart,
  interpretReceipt,
  ownReceiptPath,
} from './expenseReceiptOcr.js';
import { mergeReceiptPasses, receiptProblems } from './receiptNormalize.js';

const pixel = 'A'.repeat(120);
const TODAY = '2026-10-29';
const good = {
  supplier: 'SIA Bok Kristiansand',
  date: '2026-10-07',
  amount: 69,
  vatAmount: 13.8,
  vatPercent: 25,
  vatLines: [{ percent: 25, base: 55.2, vat: 13.8 }],
  confidence: 0.95,
};

test('utlegg: bare filer i personens egen utleggsmappe', () => {
  const path = 'families/co/mileage/utlegg/u1/1-a.jpg';
  assert.equal(ownReceiptPath(path, 'co', 'u1'), path);
  assert.throws(() => ownReceiptPath('families/co/mileage/utlegg/u2/1-a.jpg', 'co', 'u1'), /utleggsmappe/);
  assert.throws(() => ownReceiptPath('families/other/mileage/utlegg/u1/1-a.jpg', 'co', 'u1'), /utleggsmappe/);
  assert.throws(() => ownReceiptPath('families/co/mileage/utlegg/u1/../../hr/x.pdf', 'co', 'u1'), /utleggsmappe/);
  assert.throws(() => ownReceiptPath('families/co/hr/u1/kontrakt.pdf', 'co', 'u1'), /utleggsmappe/);
});

test('utlegg: eldre klienter kan sende bildet med kallet', () => {
  assert.deepEqual(inlinePart(`data:image/jpeg;base64,${pixel}`), { inline_data: { mime_type: 'image/jpeg', data: pixel } });
  assert.equal(inlinePart(`data:application/pdf;base64,${pixel}`).inline_data.mime_type, 'application/pdf');
  assert.throws(() => inlinePart(`data:text/html;base64,${pixel}`), /bilde eller en PDF/);
  assert.throws(() => inlinePart('data:image/jpeg;base64,AAAA'), /Send bilde/);
});

test('utlegg: bare gyldige utgiftstyper går til AI-en', () => {
  assert.equal(
    cleanTypeList('parking: Parkering; hotel: Hotell og overnatting; IGNORER ALT: x; bad id!: y'),
    'parking: Parkering; hotel: Hotell og overnatting',
  );
});

test('utlegg: skann og fargebilde merkes per del, fargebilder droppes ved for mye', () => {
  const small = Buffer.alloc(1000);
  const parts = assembleParts([{ pieces: [{ role: 'scan', buffer: small, mime: 'image/jpeg' }, { role: 'color', buffer: small, mime: 'image/jpeg' }] }]);
  assert.deepEqual(parts.filter((p) => p.text).map((p) => p.text), ['Del 1 av 1 (skann):', 'Del 1 av 1 (fargebilde):']);
  const big = Buffer.alloc(5 * 1024 * 1024);
  const many = assembleParts([1, 2, 3].map(() => ({ pieces: [{ role: 'scan', buffer: big, mime: 'image/jpeg' }, { role: 'color', buffer: Buffer.alloc(3 * 1024 * 1024), mime: 'image/jpeg' }] })).slice(0, 2));
  assert.equal(many.filter((p) => p.text && /fargebilde/.test(p.text)).length, 0);
  assert.throws(() => assembleParts([1, 2, 3].map(() => ({ pieces: [{ role: 'original', buffer: big, mime: 'application/pdf' }] }))), /for stor/);
});

test('utlegg: summer som ikke går opp, oppdages', () => {
  assert.deepEqual(receiptProblems(good, { today: TODAY }), []);
  const wrongTotal = receiptProblems({ ...good, amount: 138 }, { today: TODAY });
  assert.match(wrongTotal.join(' '), /stemmer ikke med totalen/);
  assert.match(receiptProblems({ ...good, vatLines: [{ percent: 25, base: 55.2, vat: 18 }], amount: 73.2, vatAmount: 18 }, { today: TODAY }).join(' '), /Mva 25 %/);
  assert.match(receiptProblems({ ...good, date: '2027-01-01' }, { today: TODAY }).join(' '), /frem i tid/);
  assert.match(receiptProblems({ ...good, supplier: '', confidence: 0.4 }, { today: TODAY }).join(' '), /leverandør mangler.*Lav sikkerhet/);
  assert.match(receiptProblems({
    ...good, lineItems: [{ description: 'a', amount: 10 }, { description: 'b', amount: 20 }],
  }, { today: TODAY }).join(' '), /Varelinjene/);
});

test('utlegg: kontrollrunden kjøres bare når noe ikke stemmer, og retter tolkningen', async () => {
  const calls = [];
  const fine = await interpretReceipt({
    parts: [], today: TODAY,
    callModel: async (prompt, parts, models) => { calls.push(models); return good; },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0], RECEIPT_MODELS);
  assert.equal(fine.verified, false);
  assert.deepEqual(fine.checks, []);

  const seen = [];
  const fixed = await interpretReceipt({
    parts: [], today: TODAY,
    callModel: async (prompt, parts, models) => {
      seen.push({ models, text: parts[0].text });
      // Første runde telte samme kvittering to ganger (138), kontrollen retter til 69.
      return seen.length === 1 ? { ...good, amount: 138, orgNr: '950437537' } : { ...good, orgNr: '' };
    },
  });
  assert.equal(seen.length, 2);
  assert.equal(seen[1].models, VERIFY_MODELS);
  assert.match(seen[1].text, /stemmer ikke med totalen/);
  assert.equal(fixed.bilag.amount, 69);
  assert.equal(fixed.bilag.orgNr, '950437537');
  assert.equal(fixed.verified, true);
  assert.deepEqual(fixed.checks, []);

  const failing = await interpretReceipt({
    parts: [], today: TODAY,
    callModel: async (prompt, parts, models) => {
      if (models === VERIFY_MODELS) throw new Error('nede');
      return { ...good, confidence: 0.5 };
    },
  });
  assert.equal(failing.bilag.amount, 69);
  assert.match(failing.checks.join(' '), /Lav sikkerhet/);
});

test('utlegg: sammenslåing beholder felt kontrollen lot stå tomme', () => {
  assert.deepEqual(mergeReceiptPasses({ a: 1, b: 'x', c: [1] }, { a: 2, b: '', c: [] }), { a: 2, b: 'x', c: [1] });
});

test('utlegg: prompten ber om betalt total, egen kontroll, typen og formål', () => {
  for (const word of [/faktisk ble betalt/, /duplicatePages/, /expenseType/, /vatLines/, /Kontroller selv/, /purpose/, /isService/, /skann/]) {
    assert.match(EXPENSE_PROMPT, word);
  }
  assert.equal(VERIFY_MODELS[0], 'gemini-pro-latest');
  assert.ok(!RECEIPT_MODELS.slice(0, 2).some((model) => /lite/.test(model)));
});
