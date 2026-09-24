import assert from 'node:assert/strict';
import { sanitizeHtml } from './sanitizeHtml.js';

const dirty = '<p onclick="alert(1)">Hei</p><script>alert(2)</script><a href="javascript:alert(3)">x</a>';
const clean = sanitizeHtml(dirty);
assert.equal(clean.includes('<script'), false);
assert.equal(/onclick/i.test(clean), false);
assert.equal(/javascript:/i.test(clean), false);
assert.equal(clean.includes('<p'), true);

console.log('sanitizeHtml.test.mjs ok');
