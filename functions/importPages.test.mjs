import assert from 'node:assert/strict';
import test from 'node:test';
import { pdfFromJpegs } from '../src/imports/filePayload.js';
import { pagePartsFromPdf } from './importPages.js';

function be16(value) {
  return [(value >> 8) & 255, value & 255];
}

function segment(marker, payload) {
  const body = payload instanceof Uint8Array ? payload : Uint8Array.from(payload);
  return Uint8Array.from([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255, ...body]);
}

function pageJpeg() {
  const entropy = new Uint8Array(12_000);
  entropy.fill(0x22);
  return Uint8Array.from([
    0xff, 0xd8,
    ...segment(0xc0, [8, ...be16(40), ...be16(30), 1, 1, 0x11, 0]),
    ...segment(0xda, [1, 0, 0]),
    ...entropy,
    0xff, 0xd9,
  ]);
}

test('innbakte JPEG-sider blir bildedeler uten OCR', () => {
  const jpeg = pageJpeg();
  const pdf = pdfFromJpegs([{ bytes: jpeg, width: 30, height: 40 }]);
  const parts = pagePartsFromPdf(pdf, 4);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].inline_data.mime_type, 'image/jpeg');
  const decoded = Buffer.from(parts[0].inline_data.data, 'base64');
  assert.equal(decoded[0], 0xff);
  assert.equal(decoded[1], 0xd8);
  assert.equal(decoded.length, jpeg.length);
});
