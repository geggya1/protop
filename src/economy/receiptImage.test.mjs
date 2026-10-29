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

test('skann: skygge jevnes ut, blek tekst blir mørk, papiret hvitt', async () => {
  const { documentScan } = await import('./receiptImage.js');
  const width = 120;
  const height = 120;
  const lum = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Papiret går fra lyst (220) til skygge (110) fra venstre mot høyre.
      const paper = 220 - (110 * x) / width;
      // Blek tekst: 75 % av papiret på hver fjerde linje.
      const text = y % 8 < 2 && x % 10 < 6;
      lum[y * width + x] = Math.round(text ? paper * 0.75 : paper);
    }
  }
  const out = documentScan(lum, width, height, { sharpen: 0 });
  const at = (x, y) => out[y * width + x];
  // Papir i lys og i skygge blir like hvitt.
  assert.ok(at(5, 5) >= 245, `lys ${at(5, 5)}`);
  assert.ok(at(110, 5) >= 245, `skygge ${at(110, 5)}`);
  // Teksten blir mørk både i lys og skygge (var 165 og 85 før).
  assert.ok(at(2, 0) < 90, `tekst i lys ${at(2, 0)}`);
  assert.ok(at(102, 0) < 90, `tekst i skygge ${at(102, 0)}`);
});

test('skann: store svarte felt blekes ikke bort', async () => {
  const { documentScan } = await import('./receiptImage.js');
  const width = 100;
  const height = 100;
  const lum = new Uint8Array(width * height).fill(230);
  for (let y = 30; y < 70; y += 1) for (let x = 30; x < 70; x += 1) lum[y * width + x] = 20;
  const out = documentScan(lum, width, height, { sharpen: 0 });
  assert.ok(out[50 * width + 50] < 40, `logo ${out[50 * width + 50]}`);
  assert.ok(out[5 * width + 5] >= 245);
});

test('størrelse: lang kvittering beholder lesbar bredde', async () => {
  const { scanSize } = await import('./receiptImage.js');
  // 12 MP mobilbilde av en lang kvittering (beskåret 1000 x 3800).
  const tall = scanSize(1000, 3800);
  assert.equal(tall.width, 1000);
  assert.equal(tall.height, 3800);
  const huge = scanSize(4000, 12000);
  assert.ok(huge.width >= 1200 && huge.width * huge.height <= 7_000_001, JSON.stringify(huge));
  const photo = scanSize(4032, 3024);
  assert.equal(Math.max(photo.width, photo.height), 3055);
});
