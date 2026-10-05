import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ai = readFileSync(join(root, 'functions/anbudWatchAi.js'), 'utf8');
const proxy = readFileSync(join(root, 'functions/tenderProxy.js'), 'utf8');
const client = readFileSync(join(root, 'src/anbud/watchAi.js'), 'utf8');

assert.match(ai, /export async function interpretProfile/);
assert.match(ai, /export async function rankHits/);
assert.doesNotMatch(ai, /\.\.\/src\//);
assert.match(proxy, /action === 'interpret-profile'/);
assert.match(proxy, /action === 'rank-hits'/);
assert.match(proxy, /anbudWatchAi\.js/);
assert.match(proxy, /if \(action === 'rank-hits'\)[\s\S]*const channels/);
assert.match(client, /action, \.\.\.payload/);
assert.match(client, /interpret-profile/);
assert.match(client, /rank-hits/);

console.log('functions/anbudWatchAi.smoke.test.mjs: all passed');
