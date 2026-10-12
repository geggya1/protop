import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fn = readFileSync(join(root, 'functions/agreementTreatment.js'), 'utf8');
const entry = readFileSync(join(root, 'functions/agreementIndex.js'), 'utf8');
const script = readFileSync(join(root, 'scripts/deploy-slim-functions.sh'), 'utf8');
const index = readFileSync(join(root, 'functions/index.js'), 'utf8');

assert.match(fn, /export const agreementTreatment/);
assert.match(fn, /invoker:\s*'public'/);
assert.match(fn, /cors:\s*true/);
assert.match(fn, /agreementShares/);
assert.doesNotMatch(fn, /defineSecret/);
assert.match(entry, /import '\.\/setRegion\.js'/);
assert.match(entry, /agreementTreatment/);
assert.match(script, /agreementIndex\.js/);
assert.match(script, /functions:agreementTreatment/);
assert.match(index, /agreementTreatment/);

console.log('agreementTreatment.smoke.test.mjs ok');
