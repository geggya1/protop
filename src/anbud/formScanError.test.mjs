import assert from 'node:assert/strict';
import { FORM_SCAN_DOWN, friendlyFormScanError } from './formScanError.js';

assert.equal(friendlyFormScanError({ code: 'functions/internal', message: 'internal' }), FORM_SCAN_DOWN);
assert.equal(friendlyFormScanError({ message: 'Failed to fetch' }), FORM_SCAN_DOWN);
assert.equal(friendlyFormScanError({ message: 'internal' }), FORM_SCAN_DOWN);
assert.match(friendlyFormScanError({ code: 'functions/unauthenticated', message: 'unauthenticated' }), /Logg inn/);
assert.equal(friendlyFormScanError({ message: 'AI fant ikke et skjema i dokumentet.' }), 'AI fant ikke et skjema i dokumentet.');

console.log('form scan error ok');
