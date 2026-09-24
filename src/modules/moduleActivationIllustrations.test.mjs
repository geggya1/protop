/**
 * Dedicated activation/help/module-page art must stay independent of the
 * older hero-* bitmaps. Catalog filenames stay
 * `{slug}--module-activation-illustration.png`. Bundled and public copies
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

/** Older module-page / child-home heroes that must not be copied over activation art. */
const LEGACY_HERO = {
  stars: 'assets/hero-tasks.webp',
  notes: 'assets/hero-notes.webp',
  chat: 'assets/hero-chat.webp',
  chores: 'assets/hero-chores.webp',
  shop: 'assets/hero-shopping.webp',
  meals: 'assets/hero-meals.webp',
  pantry: 'public/heroes/hero-pantry.png',
  albums: 'public/heroes/hero-albums.png',
  wall: 'public/heroes/hero-wall.png',
  familyTree: 'public/heroes/hero-family-tree.png',
  wishes: 'assets/hero-wishes.webp',
  rememberDates: 'public/heroes/hero-remember-dates.png',
  activities: 'public/heroes/hero-activities.png',
  books: 'public/heroes/hero-books.png',
  games: 'public/heroes/hero-games.png',
  progress: 'public/heroes/hero-progress.png',
  skole: 'assets/child-home/hero-school.webp',
  lekser: 'assets/child-home/hero-lekser.webp',
  leksehjelp: 'assets/child-home/hero-leksehjelp.webp',
  mattehjelp: 'assets/child-home/hero-mattehjelp.webp',
  'week-plan': 'assets/child-home/hero-week-plan.png',
  holdings: 'public/heroes/hero-holdings.png',
  documents: 'public/heroes/hero-documents.png',
  boligmappa: 'public/heroes/hero-boligmappa.png',
  hospitality: 'public/heroes/hero-hospitality.png',
};

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
  pngSize(readFileSync(bundled));

  const heroRel = LEGACY_HERO[id];
  if (!heroRel) continue;
  const heroPath = join(ROOT, heroRel);
  assert.equal(existsSync(heroPath), true, `${id} missing legacy hero ${heroRel}`);

  if (heroRel.endsWith('.png')) {
    assert.notEqual(
      sha256(bundled),
      sha256(heroPath),
      `${id} must not reuse the old hero ${heroRel}`,
    );
  } else {
    const welcome = pngSize(readFileSync(bundled));
    const hero = webpSize(readFileSync(heroPath));
    assert.notDeepEqual(
      welcome,
      hero,
      `${id} must not be a raster copy of ${heroRel}`,
    );
  }
}

const mealsPng = readFileSync(join(ROOT, 'assets/module-activation/maltidsplanlegger--module-activation-illustration.png'));
assert.ok(mealsPng.length > 400000, 'meals illustration looks like the overwritten hero copy');

const matcoachBundled = join(ROOT, 'assets/module-activation/ai-matcoach--module-activation-illustration.png');
const matcoachPublic = join(ROOT, 'public/assets/module-activation/ai-matcoach--module-activation-illustration.png');
assert.equal(existsSync(matcoachBundled), true, 'matcoach dedicated illustration');
assert.equal(existsSync(matcoachPublic), true, 'matcoach public illustration');
assert.equal(sha256(matcoachBundled), sha256(matcoachPublic), 'matcoach bundled != public copy');
assert.notEqual(sha256(matcoachBundled), sha256(join(ROOT, 'assets/module-activation/maltidsplanlegger--module-activation-illustration.png')), 'matcoach must not reuse meals art');

for (const [id, filename] of Object.entries(ILLUSTRATION_FILES)) {
  const bundledFile = join(ROOT, 'assets/module-activation', filename);
  const publicFile = join(ROOT, 'public/assets/module-activation', filename);
  assert.equal(existsSync(bundledFile), true, `ILLUSTRATION_FILES missing bundled ${id}`);
  assert.equal(existsSync(publicFile), true, `ILLUSTRATION_FILES missing public ${id}`);
}

const familyTreeFile = 'familietreet--module-activation-illustration.png';
const familyTreeBundled = join(ROOT, 'assets/module-activation', familyTreeFile);
const familyTreePublic = join(ROOT, 'public/assets/module-activation', familyTreeFile);
assert.equal(sha256(familyTreeBundled), sha256(familyTreePublic), 'familyTree bundled != public copy');
const familyTreeSize = pngSize(readFileSync(familyTreeBundled));
assert.notDeepEqual(
  familyTreeSize,
  { width: 748, height: 747 },
  'familyTree must not keep the leftover pair-crop (corkboard/shovel on the left)',
);
assert.notDeepEqual(
  familyTreeSize,
  { width: 816, height: 784 },
  'familyTree must use the dedicated 3D tree with ~28px pad, not the 8px-pad crop',
);
assert.ok(familyTreeSize.width >= 840 && familyTreeSize.height >= 800, 'familyTree hero art should fill the heading');
assert.ok(familyTreeSize.width <= 880 && familyTreeSize.height <= 850, 'familyTree should stay a compact square after trim+pad');

const leftoverPairCrops = {
  activities: { file: 'aktiviteter--module-activation-illustration.png', width: 746, height: 482 },
  games: { file: 'familiespill--module-activation-illustration.png', width: 752, height: 522 },
  recipes: { file: 'oppskrift--module-activation-illustration.png', width: 752, height: 533 },
};
for (const [id, spec] of Object.entries(leftoverPairCrops)) {
  const bundledFile = join(ROOT, 'assets/module-activation', spec.file);
  const publicFile = join(ROOT, 'public/assets/module-activation', spec.file);
  assert.equal(sha256(bundledFile), sha256(publicFile), `${id} bundled != public copy`);
  const size = pngSize(readFileSync(bundledFile));
  assert.notDeepEqual(
    size,
    { width: spec.width, height: spec.height },
    `${id} must not keep the leftover pair-crop on the left`,
  );
  assert.ok(size.width < spec.width, `${id} leftover fragment should be cropped away`);
}

{
  const recipesFile = join(ROOT, 'assets/module-activation/oppskrift--module-activation-illustration.png');
  const { data, info } = await sharp(recipesFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width;
  const colOpaque = new Array(width).fill(false);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > 12) {
        colOpaque[x] = true;
        if (x < minX) minX = x;
      }
    }
  }
  assert.ok(minX >= 20, `recipes leftover must not start at x=0 (padL=${minX})`);
  const blobs = [];
  let start = null;
  let end = null;
  for (let x = minX; x < width; x++) {
    if (colOpaque[x]) {
      if (start === null) start = x;
      end = x;
    } else if (start !== null) {
      blobs.push({ start, end, width: end - start + 1 });
      start = end = null;
    }
  }
  if (start !== null) blobs.push({ start, end, width: end - start + 1 });
  assert.equal(blobs[0]?.start > 0, true, 'recipes first blob must not sit at x=0');
}

const clippedRightCrops = {
  books: { file: 'bokhylla--module-activation-illustration.png', width: 743, height: 547 },
  wall: { file: 'familievegg--module-activation-illustration.png', width: 751, height: 547 },
};
for (const [id, spec] of Object.entries(clippedRightCrops)) {
  const bundledFile = join(ROOT, 'assets/module-activation', spec.file);
  const publicFile = join(ROOT, 'public/assets/module-activation', spec.file);
  assert.equal(sha256(bundledFile), sha256(publicFile), `${id} bundled != public copy`);
  const size = pngSize(readFileSync(bundledFile));
  assert.ok(
    size.width > spec.width,
    `${id} must keep the full right edge (was clipped at ${spec.width}px)`,
  );
}

const sparseCanvas = {
  progress: 'barnas-progresjon--module-activation-illustration.png',
  holdings: 'kjoretoy--module-activation-illustration.png',
  documents: 'dokumenter--module-activation-illustration.png',
  boligmappa: 'boligen--module-activation-illustration.png',
  hospitality: 'utleie--module-activation-illustration.png',
};
for (const [id, file] of Object.entries(sparseCanvas)) {
  const bundledFile = join(ROOT, 'assets/module-activation', file);
  const publicFile = join(ROOT, 'public/assets/module-activation', file);
  assert.equal(sha256(bundledFile), sha256(publicFile), `${id} bundled != public copy`);
  const size = pngSize(readFileSync(bundledFile));
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
  assert.ok(minX >= 20, `${file} needs transparent pad on the left (padL=${minX})`);
}

console.log(`moduleActivationIllustrations.test.mjs: ok (${ACTIVATABLE_MODULE_IDS.length} modules)`);
