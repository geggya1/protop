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
  ['public/icons/icon-512-maskable.png', 512],
]) {
  const image = await meta(file);
  assert.equal(image.width, size, file);
  assert.equal(image.height, size, file);
  assert.equal(image.hasAlpha, false, file);
}

const og = await meta('public/og-image.png');
assert.equal(og.width, 1200);
assert.equal(og.height, 630);

const lockup = await meta('assets/weekplan-logo-transparent.png');
assert.equal(lockup.width, 1306);
assert.equal(lockup.height, 481);
assert.equal(lockup.hasAlpha, true);
