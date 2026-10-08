import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { protopBrand } from './protopBrand.js';

const app = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf8'));
const css = readFileSync(new URL('../../app.web.css', import.meta.url), 'utf8');

assert.equal(app.expo.primaryColor, protopBrand.digitalBlue);
assert.equal(app.expo.web.themeColor, protopBrand.digitalBlue);
assert.equal(manifest.theme_color, protopBrand.digitalBlue);
assert.match(css, new RegExp(`--wp-c-brand: ${protopBrand.digitalBlue}`));
assert.equal(app.expo.ios.bundleIdentifier, protopBrand.bundleId);
assert.equal(app.expo.android.package, protopBrand.bundleId);
assert.deepEqual(app.expo.platforms, ['ios', 'android', 'web']);

const notification = app.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications');
assert.equal(notification[1].icon, './assets/notification-icon.png');
assert.equal(notification[1].color, protopBrand.digitalBlue);

function assetPath(rel) {
  return fileURLToPath(new URL(`../../${rel}`, import.meta.url));
}

async function meta(rel) {
  return sharp(assetPath(rel)).metadata();
}

const icon = await meta('assets/icon.png');
assert.equal(icon.width, 1024);
assert.equal(icon.height, 1024);
assert.equal(icon.hasAlpha, false);

const adaptive = await meta('assets/adaptive-icon.png');
assert.equal(adaptive.width, 1024);
assert.equal(adaptive.hasAlpha, true);

const splash = await meta('assets/splash-icon.png');
assert.equal(splash.width, 1024);
assert.equal(splash.hasAlpha, false);

const glyph = await meta('assets/notification-icon.png');
assert.equal(glyph.width, 96);
assert.equal(glyph.hasAlpha, true);

for (const [file, size] of [
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
  ['public/icons/apple-touch-icon.png', 180],
  ['public/apple-touch-icon.png', 180],
  ['public/apple-touch-icon-precomposed.png', 180],
  ['public/icons/icon-512-maskable.png', 512],
]) {
  const image = await meta(file);
  assert.equal(image.width, size, file);
  assert.equal(image.height, size, file);
  assert.equal(image.hasAlpha, false, file);
}

const stamp = readFileSync(new URL('../../scripts/stamp-build.js', import.meta.url), 'utf8');
assert.match(stamp, /href="\/apple-touch-icon\.png/);
assert.match(stamp, /apple-touch-icon-precomposed\.png/);
assert.match(stamp, /ICON_VERSION = '8'/);

const firebase = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8'));
const headerSources = firebase.hosting.headers.map((h) => h.source);
assert.ok(headerSources.includes('/apple-touch-icon.png'));
assert.ok(headerSources.includes('/apple-touch-icon-precomposed.png'));

async function bottomRightIsMostlyWhite(rel) {
  const image = sharp(assetPath(rel));
  const { width, height } = await image.metadata();
  const side = Math.max(8, Math.round(Math.min(width, height) * 0.18));
  const { data, info } = await sharp(assetPath(rel))
    .extract({ left: width - side, top: height - side, width: side, height: side })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let white = 0;
  const px = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) white += 1;
  }
  assert.ok(white / px > 0.9, `${rel} still has Digi in the bottom-right (${white}/${px} white)`);
}

await bottomRightIsMostlyWhite('public/apple-touch-icon.png');
await bottomRightIsMostlyWhite('public/icons/icon-192.png');
await bottomRightIsMostlyWhite('assets/icon.png');

function decodeIco32(buf) {
  assert.equal(buf.readUInt16LE(0), 0);
  assert.equal(buf.readUInt16LE(2), 1);
  const count = buf.readUInt16LE(4);
  assert.ok(count >= 1, 'favicon.ico has no images');
  const frames = [];
  for (let i = 0; i < count; i += 1) {
    const base = 6 + i * 16;
    const width = buf.readUInt8(base) || 256;
    const height = buf.readUInt8(base + 1) || 256;
    const bpp = buf.readUInt16LE(base + 6);
    const off = buf.readUInt32LE(base + 12);
    assert.equal(bpp, 32, `favicon.ico ${width}px is ${bpp}-bit and renders as noise`);
    const pixels = [];
    const start = off + 40;
    for (let y = 0; y < height; y += 1) {
      const row = height - 1 - y;
      for (let x = 0; x < width; x += 1) {
        const p = start + (row * width + x) * 4;
        pixels.push([buf[p + 2], buf[p + 1], buf[p], buf[p + 3]]);
      }
    }
    frames.push({ width, height, pixels });
  }
  return frames;
}

const ico = readFileSync(assetPath('public/favicon.ico'));
const frames = decodeIco32(ico);
const frame32 = frames.find((frame) => frame.width === 32);
assert.ok(frame32, 'favicon.ico is missing the 32px image Chrome uses in the heading');
let blue = 0;
let white = 0;
let rainbow = 0;
for (const [r, g, b, a] of frame32.pixels) {
  if (a < 16) continue;
  if (r > 240 && g > 240 && b > 240) white += 1;
  else if (b > r + 20 && b > 70 && g < 230) blue += 1;
  else if ((r > 200 && g > 200 && b < 80) || (r > 200 && b > 150 && g < 80)) rainbow += 1;
}
const px = frame32.pixels.length;
assert.ok(blue / px > 0.12, `favicon.ico mark is missing (${blue}/${px} blue)`);
assert.ok(white / px > 0.4, `favicon.ico background is missing (${white}/${px} white)`);
assert.ok(rainbow / px < 0.02, `favicon.ico is still rainbow noise (${rainbow}/${px})`);

const og = await meta('public/og-image.png');
assert.equal(og.width, 1200);
assert.equal(og.height, 630);

const lockup = await meta('assets/weekplan-logo-transparent.png');
assert.equal(lockup.width, 1306);
assert.equal(lockup.height, 481);
assert.equal(lockup.hasAlpha, true);

console.log('appIcons.test.mjs ok');
