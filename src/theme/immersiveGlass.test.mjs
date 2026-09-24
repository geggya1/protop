import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, 'immersiveGlass.js'), 'utf8');

// Bottom dock must sit flush — floating margin was regressed after #615/#607.
assert.match(src, /marginBottom:\s*0/, 'bottom glass dock marginBottom must be 0');
assert.doesNotMatch(
  src,
  /edge === 'bottom'\s*\?\s*\{\s*marginBottom:\s*8/,
  'must not reintroduce floating marginBottom: 8 on bottom edge',
);
assert.match(src, /borderBottomLeftRadius:\s*0/);
assert.match(src, /borderBottomRightRadius:\s*0/);
assert.match(src, /marginHorizontal:\s*0/);

console.log('immersiveGlass.test.mjs: ok');
