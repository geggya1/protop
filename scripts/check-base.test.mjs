import assert from 'assert';
import { createRequire } from 'node:module';

const { BLOCK_AFTER_HOURS, baseVerdict } = createRequire(import.meta.url)('./check-base.js');

assert.equal(baseVerdict({ behind: 0, missingHours: 500 }).level, 'ok', 'à jour med main');
assert.equal(baseVerdict({}).level, 'ok');

// main har gått videre i løpet av dagen: varsel, men commit går.
const fresh = baseVerdict({ behind: 3, missingHours: 5, branch: 'fix/x' });
assert.equal(fresh.level, 'warn');
assert.match(fresh.message, /fix\/x er 3 commits bak origin\/main/);
assert.match(fresh.message, /5 timer/);

// Som 3.11.2026: mangler 11 dager med endringer fra main, så commit stoppes.
const stale = baseVerdict({ behind: 120, missingHours: 11 * 24, branch: 'lokal/alt-samlet' });
assert.equal(stale.level, 'block');
assert.match(stale.message, /11 dager/);
assert.match(stale.message, /git merge origin\/main/);

assert.equal(baseVerdict({ behind: 1, missingHours: BLOCK_AFTER_HOURS }).level, 'block');
assert.equal(baseVerdict({ behind: 1, missingHours: BLOCK_AFTER_HOURS - 1 }).level, 'warn');

console.log('check-base ok');
