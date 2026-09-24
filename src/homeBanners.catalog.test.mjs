import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = path.join(root, 'src/homeBanners.js');
const src = fs.readFileSync(srcPath, 'utf8');

const JENTE_IDS = [
  'jente-smaabarn-klosser',
  'jente-smaabarn-sapa',
  'jente-barn-piknik',
  'jente-barn-sykkel',
  'jente-barn-fotball',
  'jente-barn-tur',
  'jente-barn-strand',
  'jente-ungdom-kyststi',
  'jente-ungdom-vindu',
  'jente-ungdom-brygge',
];

const NOYTRALT_IDS = [
  'noytralt-smaabarn-barnerom',
  'noytralt-smaabarn-lekeplass',
  'noytralt-barn-tur',
  'noytralt-barn-sykkel',
  'noytralt-barn-fotball',
  'noytralt-barn-piknik',
  'noytralt-ungdom-stjerner',
  'noytralt-ungdom-skate',
  'noytralt-ungdom-tegnebord',
  'noytralt-ungdom-pult',
];

const RETIRED_IDS = [
  'noytralt-smaabarn-lekerom',
  'noytralt-ungdom-park',
  'noytralt-ungdom-kveld',
  'noytralt-voksen-kontor',
];

function parseBanners(text) {
  const blocks = [];
  const re = /\{\s*id:\s*'([^']+)',\s*pack:\s*'([^']+)',\s*group:\s*'([^']+)',[\s\S]*?source:\s*require\('([^']+)'\),[\s\S]*?\n  \}/g;
  let m;
  while ((m = re.exec(text))) {
    const body = m[0];
    const field = (name) => {
      const hit = body.match(new RegExp(`${name}:\\s*'([^']+)'`));
      return hit ? hit[1] : null;
    };
    blocks.push({
      id: m[1],
      pack: m[2],
      group: m[3],
      fit: field('fit'),
      align: field('align'),
      fullscreen: /fullscreen:\s*true/.test(body),
      source: m[4],
    });
  }
  return blocks;
}

const banners = parseBanners(src);
assert.ok(banners.length > 20, `parsed ${banners.length} banners`);

const byPack = (pack) => banners.filter((b) => b.pack === pack);
const jente = byPack('jente');
const noytralt = byPack('noytralt');

assert.equal(jente.length, 10);
assert.deepEqual(jente.map((b) => b.id).sort(), [...JENTE_IDS].sort());
assert.equal(noytralt.length, 10);
assert.deepEqual(noytralt.map((b) => b.id).sort(), [...NOYTRALT_IDS].sort());

for (const id of RETIRED_IDS) {
  assert.equal(banners.some((b) => b.id === id), false, `retired id still present: ${id}`);
  assert.equal(src.includes(`'${id}'`), false, `retired id string still in catalog: ${id}`);
}

for (const banner of [...jente, ...noytralt]) {
  assert.equal(banner.fit, 'cover', banner.id);
  assert.equal(banner.align, 'center', banner.id);
  assert.equal(banner.fullscreen, true, banner.id);
  assert.ok(banner.source, banner.id);
  const abs = path.resolve(path.dirname(srcPath), banner.source);
  assert.equal(fs.existsSync(abs), true, `missing file for ${banner.id}: ${abs}`);
}

function listedPngs(pack) {
  const dir = path.join(root, 'assets/home-banners', pack);
  return fs.readdirSync(dir).filter((name) => name.endsWith('.png')).sort();
}

assert.deepEqual(
  listedPngs('jente'),
  jente.map((b) => path.basename(b.source)).sort(),
);
assert.deepEqual(
  listedPngs('noytralt'),
  noytralt.map((b) => path.basename(b.source)).sort(),
);

assert.match(src, /export const DEFAULT_HOME_BANNER_ID = 'natur-innsjo-hytte-morgen'/);
assert.match(src, /export const DEFAULT_CHILD_HOME_BANNER_ID = 'noytralt-smaabarn-barnerom'/);
assert.match(
  src,
  /if \(groupId === 'noytralt'\) return HOME_BANNERS\.filter\(\(b\) => b\.pack === 'noytralt'\)/,
);

const childDefault = banners.find((b) => b.id === 'noytralt-smaabarn-barnerom');
assert.equal(childDefault?.pack, 'noytralt');
assert.equal(childDefault?.group, 'smaabarn');

const lake = banners.find((b) => b.id === 'natur-innsjo-hytte-morgen');
assert.equal(lake?.pack, 'natur');
assert.ok(fs.existsSync(path.resolve(path.dirname(srcPath), lake.source)));

const NATUR_PORTRAIT_IDS = [
  'natur-fjelltopp',
  'natur-hytte-regn',
  'natur-terrasse',
  'natur-kyststi',
  'natur-skogsti',
  'natur-utsikt',
  'natur-brygge',
  'natur-nordlys',
  'natur-skjergard',
  'natur-badestamp',
];

const GUTT_PORTRAIT_IDS = [
  'gutt-smaabarn-klosser',
  'gutt-barn-sparkesykkel',
  'gutt-barn-tur',
  'gutt-ungdom-skole',
  'gutt-ungdom-laptop',
  'gutt-ungdom-kveld',
];

const VOKSEN_PORTRAIT_IDS = [
  'voksen-middag-plan',
  'voksen-hjemmekontor',
  'voksen-delt-omsorg',
  'voksen-familiechat',
  'voksen-kveld-plan',
  'voksen-morgen-plan',
];

function assertPortrait941x1672(ids, { allowCutout = false } = {}) {
  for (const id of ids) {
    const banner = banners.find((b) => b.id === id);
    assert.ok(banner, `missing ${id}`);
    if (allowCutout && /cutout:\s*true/.test(
      src.slice(src.indexOf(`id: '${id}'`), src.indexOf(`id: '${id}'`) + 400),
    )) {
      assert.equal(banner.fit, 'contain', id);
    } else {
      assert.equal(banner.fit, 'cover', id);
    }
    assert.equal(banner.align, 'center', id);
    assert.equal(banner.fullscreen, true, id);
    const abs = path.resolve(path.dirname(srcPath), banner.source);
    assert.equal(fs.existsSync(abs), true, `missing file for ${id}`);
    const { width, height } = pngSize(abs);
    assert.ok(height > width, `${id} should be portrait, got ${width}x${height}`);
    assert.equal(width, 941, `${id} width`);
    assert.equal(height, 1672, `${id} height`);
  }
}

for (const id of NATUR_PORTRAIT_IDS) {
  const banner = banners.find((b) => b.id === id);
  assert.ok(banner, `missing ${id}`);
  assert.equal(banner.fit, 'cover', id);
  assert.equal(banner.align, 'center', id);
  assert.equal(banner.fullscreen, true, id);
  const abs = path.resolve(path.dirname(srcPath), banner.source);
  assert.equal(fs.existsSync(abs), true, `missing file for ${id}`);
  const { width, height } = pngSize(abs);
  assert.ok(height > width, `${id} should be portrait, got ${width}x${height}`);
  assert.equal(width, 941, `${id} width`);
  assert.equal(height, 1672, `${id} height`);
}

assertPortrait941x1672(GUTT_PORTRAIT_IDS, { allowCutout: true });
assertPortrait941x1672(VOKSEN_PORTRAIT_IDS);

function pngSize(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.equal(buf.toString('ascii', 1, 4), 'PNG', `not a PNG: ${filePath}`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

console.log('homeBanners.catalog.test.mjs: ok', {
  jente: jente.length,
  noytralt: noytralt.length,
  gutt: byPack('gutt').length,
  voksen: byPack('voksen').length,
  naturPortrait: NATUR_PORTRAIT_IDS.length,
  guttPortrait: GUTT_PORTRAIT_IDS.length,
  voksenPortrait: VOKSEN_PORTRAIT_IDS.length,
});
