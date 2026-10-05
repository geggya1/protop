#!/usr/bin/env node
/**
 * Guard against publishing an empty Firebase Hosting dist for protop.no.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = join(root, 'dist', 'index.html');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!existsSync(indexHtml)) fail('dist/index.html missing — run export:web first');

const index = readFileSync(indexHtml, 'utf8');
if (!/id="root"/.test(index) && !/_expo\//.test(index)) {
  fail('dist/index.html is not the Expo SPA');
}
if (/weekplan-4310f/.test(index)) {
  fail('dist/index.html still points at ProTop Firebase');
}

function assertPng(rel) {
  const file = join(root, 'dist', rel);
  if (!existsSync(file)) fail(`dist/${rel} missing`);
  const buf = readFileSync(file);
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    fail(`dist/${rel} is not a PNG (iOS would screenshot the page as the home icon)`);
  }
}

function assertIco(rel) {
  const file = join(root, 'dist', rel);
  if (!existsSync(file)) fail(`dist/${rel} missing`);
  const buf = readFileSync(file);
  if (buf[0] !== 0x00 || buf[1] !== 0x00 || buf[2] !== 0x01 || buf[3] !== 0x00) {
    fail(`dist/${rel} is not an ICO`);
  }
}

assertPng('apple-touch-icon.png');
assertPng('apple-touch-icon-precomposed.png');
assertPng('icons/apple-touch-icon.png');
assertPng('icons/icon-192.png');
assertPng('favicon.png');
assertIco('favicon.ico');
if (!/rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png/.test(index)) {
  fail('dist/index.html must point apple-touch-icon at /apple-touch-icon.png');
}

if (!/name="protop-build-id"/.test(index)) {
  fail('dist/index.html missing protop-build-id meta (run stamp:web)');
}
const buildJsonPath = join(root, 'dist', 'build.json');
if (!existsSync(buildJsonPath)) fail('dist/build.json missing — run stamp:web');
let buildJson;
try {
  buildJson = JSON.parse(readFileSync(buildJsonPath, 'utf8'));
} catch {
  fail('dist/build.json is not JSON');
}
if (!buildJson?.id) fail('dist/build.json must have id');
if (buildJson.id === '20260923-protop-shell' || buildJson.id === '20261005-local-preview') {
  fail('dist/build.json still has the source placeholder — APP_BUILD_ID was not stamped');
}
if (!index.includes(buildJson.id)) {
  fail('dist/index.html must include the stamped build id');
}

console.log(`verify-web-dist: ok (ProTop SPA index.html + PWA icons, build ${buildJson.id})`);
