import assert from 'node:assert/strict';
import { FILES, TIMEOUT_MS } from './run-verify-web.mjs';

assert.ok(TIMEOUT_MS <= 60_000);
assert.ok(TIMEOUT_MS >= 15_000);
assert.ok(FILES.includes('functions/slimDeploy.test.mjs'));
assert.ok(FILES.includes('scripts/functions-deploy-needed.test.mjs'));
assert.ok(FILES.includes('functions/anbud/intakeScan.test.mjs'));
assert.equal(new Set(FILES).size, FILES.length);

console.log('run-verify-web.test.mjs: ok');
