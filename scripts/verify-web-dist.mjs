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

console.log('verify-web-dist: ok (ProTop SPA index.html)');
