import assert from 'node:assert/strict';
import { calculateAge, parseBirthday, toIsoDate, formatBirthday } from './age.js';

assert.deepEqual(toIsoDate('1997-12-2'), '1997-12-02');
assert.deepEqual(toIsoDate('1928-1-5'), '1928-01-05');
assert.equal(parseBirthday('1997-12-2')?.getFullYear(), 1997);
assert.equal(parseBirthday('1997-12-2')?.getDate(), 2);
assert.equal(formatBirthday('1997-12-2', 'nb'), '02.12.1997');

assert.equal(calculateAge('1928-01-01', '1997-12-02'), 69);
assert.equal(calculateAge('1928-12-31', '1997-12-02'), 68);
assert.equal(calculateAge('1928-05-15', '2026-09-01'), 98);
assert.equal(calculateAge('1928-12-02', '1997-12-02'), 69);
assert.equal(calculateAge('1928-12-03', '1997-12-02'), 68);

console.log('age.test.mjs ok');
