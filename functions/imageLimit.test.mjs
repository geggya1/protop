import assert from 'node:assert/strict';
import { jpegWithinLimit, MAX_OCR_IMAGE_BYTES } from './imageLimit.js';

assert.equal(jpegWithinLimit(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])), true);
assert.equal(jpegWithinLimit(new Uint8Array(MAX_OCR_IMAGE_BYTES + 1)), false);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
assert.equal(jpegWithinLimit(png), false);

console.log('imageLimit.test.mjs: ok');
