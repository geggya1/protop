/**
 * Minimums-CSP på protop.no. Den skal ikke kunne knekke appen: ingen script-src,
 * style-src eller connect-src (appen laster Google Fonts, unpkg, OSM-fliser og Firebase).
 * object-src tillater blob: fordi PDF-forhåndsvisningen viser blob-PDF-er i iframe,
 * og Chrome/Safari viser PDF som plugin-innhold som arver CSP-en.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hosting = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8')).hosting;
const all = hosting.headers.find((row) => row.source === '**');
const csp = all.headers.find((row) => row.key === 'Content-Security-Policy')?.value || '';

const directives = Object.fromEntries(csp.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
  const [name, ...values] = part.split(/\s+/);
  return [name, values];
}));

assert.deepEqual(directives['frame-ancestors'], ["'none'"]);
assert.deepEqual(directives['base-uri'], ["'self'"]);
assert.ok(directives['object-src'], 'object-src er satt');
assert.equal(directives['object-src'].includes('*'), false);
assert.equal(directives['object-src'].includes('data:'), false);
for (const name of ['default-src', 'script-src', 'style-src', 'connect-src', 'img-src', 'font-src', 'frame-src', 'sandbox']) {
  assert.equal(name in directives, false, `${name} kan knekke appen`);
}
// X-Frame-Options står fortsatt for eldre nettlesere.
assert.equal(all.headers.find((row) => row.key === 'X-Frame-Options')?.value, 'DENY');

console.log('hosting-csp.test.mjs: ok');
