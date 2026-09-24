import assert from 'node:assert/strict';
import { generateSecureJoinCode, normalizeJoinCode, isValidJoinCodeFormat } from './secureJoinCode.js';

const a = generateSecureJoinCode(8);
const b = generateSecureJoinCode(8);
assert.equal(a.length, 8);
assert.equal(b.length, 8);
assert.notEqual(a, b);
assert.equal(normalizeJoinCode(' ab-12cd '), 'AB12CD');
assert.equal(isValidJoinCodeFormat(a), true);
assert.equal(isValidJoinCodeFormat('SHORT'), false);
console.log('secureJoinCode.test.mjs: ok');
