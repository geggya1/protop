/**
 * Unit tests for document scan crop helpers.
 */
import assert from 'node:assert/strict';
import {
  isImageUpload,
  canInteractiveScanCrop,
} from './documentScanCrop.js';

assert.equal(isImageUpload({ mimeType: 'image/jpeg', name: 'a.jpg' }), true);
assert.equal(isImageUpload({ mimeType: 'image/png' }), true);
assert.equal(isImageUpload({ mimeType: 'application/pdf', name: 'x.pdf' }), false);
assert.equal(isImageUpload({ name: 'kvittering.HEIC' }), true);
assert.equal(isImageUpload({ name: 'fil.pdf' }), false);
assert.equal(isImageUpload(null), false);
assert.equal(canInteractiveScanCrop(), false); // node has no document

console.log('documentScanCrop.test.mjs: ok');
