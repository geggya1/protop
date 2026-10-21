/**
 * OCR må lese ImageMask-lag (skarp tekst), ikke bare den bleke RGB-skannen.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bitmapToPng, ocrPdfPages, resetOcrWorker, resolvePageImage } from './ocrPdf.js';

const here = dirname(fileURLToPath(import.meta.url));
const pdfPath = join(here, 'fixtures/oppdragsavtale-ns8403-scan.pdf');

{
  // 1-bit mask: satt bit = tekst (svart), ellers hvitt.
  const width = 8;
  const height = 2;
  const data = Uint8Array.from([0b11110000, 0b00001111]);
  const png = bitmapToPng({ width, height, data }, { mask: true, maxEdge: 2800 });
  assert.ok(png?.buffer?.length > 40);
  assert.equal(png.mask, true);
  assert.equal(png.area, 16);
}

{
  // Svak grå tekst skal få kontraststrekk (ikke forbli nesten hvit).
  const width = 4;
  const height = 4;
  const data = Buffer.alloc(width * height * 3, 255);
  for (let i = 0; i < 4; i += 1) {
    data[i * 3] = 210;
    data[i * 3 + 1] = 210;
    data[i * 3 + 2] = 210;
  }
  const png = bitmapToPng({ width, height, data, kind: 2 }, { maxEdge: 2800 });
  assert.ok(png?.buffer?.length > 40);
  assert.equal(png.mask, false);
}

{
  const fakePage = {
    objs: {
      get(name, cb) {
        if (name === 'mask_p0_4') {
          cb({ width: 10, height: 10, data: Buffer.alloc(Math.ceil(10 / 8) * 10, 0xff) });
        }
      },
    },
    commonObjs: { get() {} },
  };
  const resolved = await resolvePageImage(fakePage, { data: 'mask_p0_4', width: 10, height: 10 });
  assert.equal(resolved.width, 10);
  assert.equal(resolved.height, 10);
  assert.ok(resolved.data?.length > 0);
}

const pdf = readFileSync(pdfPath);
const t0 = Date.now();
const result = await ocrPdfPages(pdf, { maxPages: 2 });
const elapsed = Date.now() - t0;
assert.ok(result.text.length > 800, `forventet rik OCR-tekst, fikk ${result.text.length} tegn`);
assert.match(result.text, /Oppdragsbekreftelse/i);
assert.match(result.text, /Fornebubanen|Fornebuporten|Allfug|Consult1/i);
assert.match(result.text, /N[S5]\s*8403|NS8403|N58403/i);
assert.match(result.text, /942322704|916\s*538\s*804|1670/i);
assert.ok(result.images.length >= 1, 'skal returnere minst én ImageMask');
assert.ok(result.images.every((img) => img.mask), 'skal bruke ImageMask, ikke blek RGB-skann');
// Hosting-rewrite ~60 s: OCR alene må holde seg godt under.
assert.ok(elapsed < 45000, `OCR tok for lang tid (${elapsed} ms)`);

console.log('functions/ocrPdf.test.mjs: all passed');
console.log('ocr_chars', result.text.length, 'images', result.images.length, 'ms', elapsed);
await resetOcrWorker();
