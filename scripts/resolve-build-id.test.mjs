import assert from 'assert';
import { createRequire } from 'node:module';

const { resolveBuildId } = createRequire(import.meta.url)('./resolve-build-id.js');

assert.strictEqual(
  resolveBuildId({ env: { APP_BUILD_ID: 'abc123' } }),
  'abc123',
  'CI SHA must win',
);

const local = resolveBuildId({
  env: {},
  exec: () => 'deadbee\n',
  now: () => 0xabc,
});
assert.strictEqual(local, 'deadbee-abc');

const fallback = resolveBuildId({
  env: { APP_BUILD_ID: '  ' },
  exec: () => { throw new Error('no git'); },
  now: () => 0xdef,
});
assert.strictEqual(fallback, 'dev-def');

console.log('resolve-build-id: ok');
