import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contrastLevels,
  findDocumentBox,
  fitSize,
  histogram,
  levelsTable,
  luminance,
  otsuThreshold,
} from './receiptImage.js';

// Mørkt bord med en lys kvittering (med tekstlinjer) fra x 30–59 og y 10–69.
function receiptOnTable({ width = 100, height = 80, table = 40, paper = 228 } = {}) {
  const lum = new Uint8Array(width * height).fill(table);
  for (let y = 10; y < 70; y += 1) {
    for (let x = 30; x < 60; x += 1) {
      const textLine = y % 6 === 0 && x > 33 && x < 56;
      lum[y * width + x] = textLine ? 70 : paper;
    }
  }
  return { lum, width, height };
}

test('finner kvitteringen på et mørkt bord og beskjærer med marg', () => {
  const { lum, width, height } = receiptOnTable();
  const box = findDocumentBox(lum, width, height);
  assert.ok(box);
  assert.ok(Math.abs(box.x - 0.28) < 0.011, `x ${box.x}`);
  assert.ok(Math.abs(box.y - 0.1) < 0.001, `y ${box.y}`);
  assert.ok(Math.abs(box.w - 0.34) < 0.02, `w ${box.w}`);
  assert.ok(Math.abs(box.h - 0.8) < 0.001, `h ${box.h}`);
});

test('beskjærer ikke når kvitteringen fyller bildet eller bordet er like lyst', () => {
  const full = new Uint8Array(50 * 50).fill(230);
  for (let i = 0; i < full.length; i += 7) full[i] = 60;
  assert.equal(findDocumentBox(full, 50, 50), null);
  const white = receiptOnTable({ table: 225, paper: 230 });
  assert.equal(findDocumentBox(white.lum, white.width, white.height), null);
});

test('beskjærer ikke til en tynn lys stripe (lampe, refleks)', () => {
  const width = 100;
  const height = 80;
  const lum = new Uint8Array(width * height).fill(40);
  for (let y = 0; y < height; y += 1) lum[y * width + y] = 240;
  assert.equal(findDocumentBox(lum, width, height), null);
});

test('Otsu deler lyst og mørkt', () => {
  const hist = new Array(256).fill(0);
  hist[40] = 500;
  hist[220] = 500;
  const t = otsuThreshold(hist);
  assert.ok(t >= 40 && t < 220);
});

test('kontraststrekk: grått papir blir hvitt, grå tekst blir svart', () => {
  const lum = new Uint8Array(1000);
  for (let i = 0; i < lum.length; i += 1) lum[i] = i % 5 === 0 ? 90 : 190;
  const levels = contrastLevels(histogram(lum));
  assert.deepEqual(levels, { low: 90, high: 190 });
  const table = levelsTable(levels);
  assert.equal(table[90], 0);
  assert.equal(table[190], 255);
  assert.equal(table[140], 128);
  // Bruker allerede hele skalaen: ingen endring.
  const wide = new Uint8Array(512);
  for (let i = 0; i < wide.length; i += 1) wide[i] = i % 256;
  assert.equal(contrastLevels(histogram(wide)), null);
});

test('luminans og størrelse', () => {
  assert.deepEqual([...luminance([255, 255, 255, 255, 0, 0, 0, 255], 2, 1)], [255, 0]);
  assert.deepEqual(fitSize(4000, 3000, 2000), { width: 2000, height: 1500, scale: 0.5 });
  assert.equal(fitSize(800, 600, 2000).width, 800);
});
