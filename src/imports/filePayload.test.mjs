import assert from 'node:assert/strict';
import {
  base64Length,
  extractEmbeddedJpegs,
  jpegSize,
  pdfFromJpegs,
  prepareImportBody,
  readableImportError,
} from './filePayload.js';

function be16(value) {
  return [(value >> 8) & 255, value & 255];
}

function segment(marker, payload) {
  const body = payload instanceof Uint8Array ? payload : Uint8Array.from(payload);
  const length = body.length + 2;
  return Uint8Array.from([0xff, marker, ...be16(length), ...body]);
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function pageJpeg(width, height, extra = 0) {
  const entropy = new Uint8Array(extra);
  entropy.fill(0x22);
  return concat([
    Uint8Array.from([0xff, 0xd8]),
    segment(0xe1, Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])),
    segment(0xc0, [8, ...be16(height), ...be16(width), 1, 1, 0x11, 0]),
    segment(0xda, [1, 0, 0]),
    entropy,
    Uint8Array.from([0xff, 0x00, 0x11, 0xff, 0xd9]),
  ]);
}

const page = pageJpeg(1200, 1600, 90_000);
assert.equal(jpegSize(page).width, 1200);
assert.equal(jpegSize(page).height, 1600);
const found = extractEmbeddedJpegs(concat([Uint8Array.from([0x25, 0x50, 0x44, 0x46]), page]));
assert.equal(found.length, 1);
assert.equal(found[0].length, page.length);
assert.equal(found[0][found[0].length - 2], 0xff);
assert.equal(found[0][found[0].length - 1], 0xd9);

const packed = pdfFromJpegs([{ bytes: page, width: 1200, height: 1600 }]);
const repacked = extractEmbeddedJpegs(packed);
assert.equal(repacked.length, 1);
assert.equal(repacked[0].length, page.length);

const source = new Uint8Array(4_200_000);
source.set(Uint8Array.from([0x25, 0x50, 0x44, 0x46]), 0);
source.set(page, 2000);
const small = pageJpeg(32, 32, 0);
const prepared = await prepareImportBody({
  bytes: source,
  filename: 'cv.pdf',
  mime: 'application/pdf',
}, {
  shrinkImage: async () => ({ bytes: small, width: 32, height: 32 }),
});
assert.equal(prepared.mime, 'application/pdf');
assert.ok(prepared.imageBase64.length < 5_500_000);
assert.ok(prepared.imageBase64.length < base64Length(source.length));
const decoded = Uint8Array.from(atob(prepared.imageBase64), (char) => char.charCodeAt(0));
assert.equal(extractEmbeddedJpegs(decoded, { minBytes: 20 }).length, 1);

const forty = new Uint8Array(45 * 1024 * 1024);
forty.set(page, 4000);
const fromForty = await prepareImportBody({
  bytes: forty,
  filename: 'cv-40mb.pdf',
  mime: 'application/pdf',
}, {
  shrinkImage: async () => ({ bytes: small, width: 32, height: 32 }),
});
assert.equal(fromForty.mime, 'application/pdf');
assert.ok(fromForty.imageBase64.length < 2_400_000);
assert.ok(fromForty.imageBase64.length < base64Length(forty.length));

await assert.rejects(
  () => prepareImportBody({ bytes: new Uint8Array(5_000_000), filename: 'stor.pdf', mime: 'application/pdf' }),
  /for stor/,
);
await assert.rejects(
  () => prepareImportBody({ bytes: new Uint8Array(90 * 1024 * 1024), filename: 'for-stor.pdf', mime: 'application/pdf' }),
  /for stor/,
);

const internal = readableImportError({ code: 'functions/internal', message: 'internal' });
assert.match(internal.message, /Komprimer/);
assert.match(readableImportError({ code: 'functions/unavailable', message: 'unavailable' }).message, /Komprimer/);
assert.match(readableImportError({ code: 'functions/invalid-argument', message: '400' }).message, /Komprimer/);

console.log('filePayload.test.mjs: ok');
