/**
 * Skannet Consult1 NS8403 (OCR-støy) skal likevel fylle hovedfeltene.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { interpretDocuments, normalizeAgreementText } from './interpret.js';
import { inputFromInterpretation } from '../../src/anbud/directContract.js';
import { ocrPdfPages, resetOcrWorker } from '../ocrPdf.js';

const here = dirname(fileURLToPath(import.meta.url));
const pdf = readFileSync(join(here, '../fixtures/oppdragsavtale-ns8403-scan.pdf'));

assert.match(normalizeAgreementText('N58403 : Alminnelig'), /NS 8403/i);
assert.match(normalizeAgreementText('Avtalthonorar ps — 1670'), /Avtalt honorar/i);

const ocr = await ocrPdfPages(pdf, { maxPages: 2 });
assert.ok(ocr.text.length > 800);
const draft = interpretDocuments([{ id: 'dok-1', name: 'Consult1.pdf', text: ocr.text }]);
const input = inputFromInterpretation(draft, { documents: [{ text: ocr.text }] });

assert.equal(input.buyer, 'Allfug AS');
assert.equal(input.supplier, 'Consult1 AS');
assert.equal(input.orgnr, '942322704');
assert.equal(input.supplierOrgnr, '916538804');
assert.match(input.title, /Fornebubanen/i);
assert.match(String(input.description || ''), /endringsoversikt|sluttoppgjør/i);
assert.equal(input.address, 'Industriveien 14');
assert.equal(input.place, 'Fornebu');
assert.equal(input.value, 1670);
assert.notEqual(input.value, 58403);
assert.equal(input.fields?.standard || draft.standard, 'NS 8403');
assert.equal(input.start, '2026-08-21');
assert.equal(input.end, '2026-12-31');
assert.equal(input.leaderName, 'Geir Ove Andersen');
assert.equal(input.phone, '95946463');

// Ren honorarfrase uten beløp skal ikke bli 58403.
const bad = inputFromInterpretation({
  title: 'Test',
  buyer: 'Kunde AS',
  honorar: 'Honoreres etter medgått tid. lif. N58403 510.2.2)',
  lines: [],
}, {});
assert.equal(bad.value, 0);

console.log('functions/indeksregulering/interpret.ocrScan.test.mjs: all passed');
await resetOcrWorker();
