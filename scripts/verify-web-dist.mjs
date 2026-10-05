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

console.log('verify-web-dist: ok (ProTop SPA index.html + PWA icons)');
