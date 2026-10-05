import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatWebDocumentTitle } from './webDocumentTitle.js';

assert.equal(formatWebDocumentTitle(), 'ProTop');
assert.equal(formatWebDocumentTitle({ title: 'Home' }, { name: 'Home' }), 'ProTop');

const linking = readFileSync(new URL('./linking.js', import.meta.url), 'utf8');
assert.match(linking, /formatWebDocumentTitle/);
assert.doesNotMatch(linking, /\$\{title\} — \$\{base\}/);

const app = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
assert.match(app, /title: 'ProTop'/);

console.log('webDocumentTitle.test.mjs ok');
