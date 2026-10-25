import assert from 'node:assert/strict';
import { FILES, TIMEOUT_MS } from './run-verify-web.mjs';

assert.ok(TIMEOUT_MS <= 60_000);
assert.ok(TIMEOUT_MS >= 15_000);
assert.ok(FILES.includes('functions/slimDeploy.test.mjs'));
assert.ok(FILES.includes('scripts/functions-deploy-needed.test.mjs'));
assert.ok(FILES.includes('functions/anbud/intakeScan.test.mjs'));
assert.equal(new Set(FILES).size, FILES.length);
assert.ok(FILES.includes('src/help/assistantEngine.test.mjs'), 'hjelpen og assistenten testes i CI');
assert.ok(FILES.includes('src/help/protopPages.test.mjs'), 'alle sider har hjelp');
assert.ok(FILES.includes('src/help/helpAccess.test.mjs'), 'hjelpen følger tilgangsnivået');

console.log('run-verify-web.test.mjs: ok');
