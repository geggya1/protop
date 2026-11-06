import assert from 'node:assert/strict';
import { hasVariants, imageVariantUrl, variantForSize } from './imageVariants.js';

const original = 'https://firebasestorage.googleapis.com/v0/b/protop-c189c.firebasestorage.app/o/users%2Fu1%2Favatar.jpg?alt=media&token=abc';

assert.equal(hasVariants(original), true);
assert.equal(
  imageVariantUrl(original, 'thumb'),
  'https://firebasestorage.googleapis.com/v0/b/protop-c189c.firebasestorage.app/o/users%2Fu1%2Favatar.jpg.t.webp?alt=media&token=abc',
);
assert.equal(
  imageVariantUrl(original, 'mobile'),
  'https://firebasestorage.googleapis.com/v0/b/protop-c189c.firebasestorage.app/o/users%2Fu1%2Favatar.jpg.m.webp?alt=media&token=abc',
);

// Utgaver av utgaver, dokumenter og fremmede adresser beholdes som de er.
const thumb = imageVariantUrl(original, 'thumb');
assert.equal(hasVariants(thumb), false);
assert.equal(imageVariantUrl(thumb, 'mobile'), thumb);
const pdf = original.replace('avatar.jpg', 'kontrakt.pdf');
assert.equal(imageVariantUrl(pdf, 'thumb'), pdf);
assert.equal(imageVariantUrl('https://example.com/a.jpg', 'thumb'), 'https://example.com/a.jpg');
assert.equal(imageVariantUrl('', 'thumb'), '');
assert.equal(imageVariantUrl(original, 'nope'), original);

// Størrelse × skjermtetthet velger utgave.
assert.equal(variantForSize(40, 3), 'thumb');
assert.equal(variantForSize(128, 2), 'thumb');
assert.equal(variantForSize(200, 2), 'mobile');
assert.equal(variantForSize(540, 2), 'mobile');
assert.equal(variantForSize(800, 2), null);
assert.equal(variantForSize(0, 2), null);

console.log('imageVariants.test.mjs: ok');
