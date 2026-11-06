/**
 * Dedicated activation/help/module-page art must stay independent of the
 * older hero-* bitmaps. Catalog filenames stay
 * `{slug}--module-activation-illustration.webp`. Bundled and public copies
 * must match each other.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ACTIVATABLE_MODULE_IDS, getModuleConfig, ILLUSTRATION_FILES } from './moduleActivationRegistry.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');


const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function pngSize(buf) {
  assert.ok(buf.subarray(0, 8).equals(PNG_MAGIC), 'not a PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') {
    return {
      width: 1 + buf.readUIntLE(24, 3),
      height: 1 + buf.readUIntLE(27, 3),
    };
  }
  if (kind === 'VP8 ') {
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    };
  }
  if (kind === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >> 14) & 0x3fff),
    };
  }
  throw new Error(`unsupported webp chunk ${kind}`);
}

for (const id of ACTIVATABLE_MODULE_IDS) {
  const filename = getModuleConfig(id).illustration;
  const bundled = join(ROOT, 'assets/module-activation', filename);
  const published = join(ROOT, 'public/assets/module-activation', filename);
  assert.equal(existsSync(bundled), true, `${id} missing ${bundled}`);
  assert.equal(existsSync(published), true, `${id} missing ${published}`);
  assert.equal(sha256(bundled), sha256(published), `${id} bundled != public copy`);
  webpSize(readFileSync(bundled));
  // Mobilutgaven (scripts/illustrations-webp.mjs) brukes på telefon på web.
  assert.equal(existsSync(published.replace(/\.webp$/, '-m.webp')), true, `${id} missing mobile copy`);
}

for (const [id, filename] of Object.entries(ILLUSTRATION_FILES)) {
  const bundledFile = join(ROOT, 'assets/module-activation', filename);
  const publicFile = join(ROOT, 'public/assets/module-activation', filename);
  assert.equal(existsSync(bundledFile), true, `ILLUSTRATION_FILES missing bundled ${id}`);
  assert.equal(existsSync(publicFile), true, `ILLUSTRATION_FILES missing public ${id}`);
}

const sparseCanvas = {
  utstyr: 'kjoretoy--module-activation-illustration.webp',
  documents: 'dokumenter--module-activation-illustration.webp',
};
for (const [id, file] of Object.entries(sparseCanvas)) {
  const bundledFile = join(ROOT, 'assets/module-activation', file);
  const publicFile = join(ROOT, 'public/assets/module-activation', file);
  assert.equal(sha256(bundledFile), sha256(publicFile), `${id} bundled != public copy`);
  const size = webpSize(readFileSync(bundledFile));
  assert.notDeepEqual(
    size,
    { width: 1024, height: 1024 },
    `${id} must be trimmed of empty canvas so the heading art matches other modules`,
  );
  assert.ok(size.width < 1024 && size.height < 800, `${id} heading art should fill the band after trim`);
}

/** Pair-crops leave a fragment at the left edge, a gap, then the real subject. */
const PAIR_CROP_ALPHA = 12;
const PAIR_CROP_GAP = 20;
const illustrationDir = join(ROOT, 'assets/module-activation');
for (const file of readdirSync(illustrationDir).filter((name) => name.endsWith('.png'))) {
  const bundledFile = join(illustrationDir, file);
  const publicFile = join(ROOT, 'public/assets/module-activation', file);
  assert.equal(sha256(bundledFile), sha256(publicFile), `${file} bundled != public copy`);
  const { data, info } = await sharp(bundledFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const colOpaque = new Array(width).fill(false);
  let minX = width;
  let maxX = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > PAIR_CROP_ALPHA) {
        colOpaque[x] = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  const blobs = [];
  let start = null;
  let end = null;
  for (let x = minX; x <= maxX; x++) {
    if (colOpaque[x]) {
      if (start === null) start = x;
      end = x;
    } else if (start !== null) {
      blobs.push({ start, end, width: end - start + 1 });
      start = end = null;
    }
  }
  if (start !== null) blobs.push({ start, end, width: end - start + 1 });
  if (blobs.length >= 2) {
    const first = blobs[0];
    const main = blobs.slice(1).reduce((a, b) => (b.width > a.width ? b : a));
    const gap = main.start - first.end - 1;
    assert.ok(
      !(first.start <= minX + 2 && gap >= PAIR_CROP_GAP && first.width < main.width * 0.45),
      `${file} leftover pair-crop fragment at x=${first.start}..${first.end} (gap ${gap}px)`,
    );
  }
  // Delivered 1024×512 heading canvases keep the artist's margin.
  // The heading crops from the right at PAGE_ART_SCALE, so a few pixels
  // under the older 20px pad still sit outside the visible band.
  const deliveredWide = width === 1024 && height === 512;
  assert.ok(
    minX >= (deliveredWide ? 4 : 20),
    `${file} needs transparent pad on the left (padL=${minX})`,
  );
}

console.log(`moduleActivationIllustrations.test.mjs: ok (${ACTIVATABLE_MODULE_IDS.length} modules)`);
