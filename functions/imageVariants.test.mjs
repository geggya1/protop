import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { VARIANTS, wantsVariants } from './imageVariants.js';
import { imageVariantUrl, hasVariants } from '../src/utils/imageVariants.js';

test('bare bilder i appens mapper får utgaver', () => {
  assert.equal(wantsVariants({ name: 'users/u1/avatar-1.jpg', contentType: 'image/jpeg', size: 1000 }), true);
  assert.equal(wantsVariants({ name: 'families/f/employees/e/photo', contentType: 'image/png', size: 1000 }), true);
  assert.equal(wantsVariants({ name: 'users/u1/avatar-1.jpg.t.webp', contentType: 'image/webp', size: 10 }), false);
  assert.equal(wantsVariants({ name: 'families/f/documents/bilag.jpg', contentType: 'image/jpeg', size: 10 }), false);
  assert.equal(wantsVariants({ name: 'families/f/x.pdf', contentType: 'application/pdf', size: 10 }), false);
  assert.equal(wantsVariants({ name: 'tmp/x.jpg', contentType: 'image/jpeg', size: 10 }), false);
  assert.equal(wantsVariants({ name: 'users/u/x.jpg', contentType: 'image/jpeg', size: 30 * 1024 * 1024 }), false);
});

test('appen og funksjonen er enige om navnene', () => {
  const url = 'https://firebasestorage.googleapis.com/v0/b/protop-c189c.firebasestorage.app/o/users%2Fu1%2Favatar-1.jpg?alt=media&token=abc';
  assert.equal(hasVariants(url), true);
  assert.equal(
    imageVariantUrl(url, 'thumb'),
    'https://firebasestorage.googleapis.com/v0/b/protop-c189c.firebasestorage.app/o/users%2Fu1%2Favatar-1.jpg.t.webp?alt=media&token=abc',
  );
  assert.equal(imageVariantUrl(url, 'mobile').includes('avatar-1.jpg.m.webp'), true);
  assert.deepEqual(VARIANTS.map((v) => v.suffix), ['.m.webp', '.t.webp']);
  assert.equal(imageVariantUrl('https://example.com/x.jpg', 'thumb'), 'https://example.com/x.jpg');
});

test('utgavene blir mindre og beholder forholdet', async () => {
  const src = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#1099F4' } }).jpeg().toBuffer();
  for (const v of VARIANTS) {
    const out = await sharp(src).resize({ width: v.max, height: v.max, fit: 'inside', withoutEnlargement: true }).webp({ quality: v.quality }).toBuffer();
    const meta = await sharp(out).metadata();
    assert.equal(Math.max(meta.width, meta.height), v.max);
    assert.equal(Math.round(meta.width / meta.height * 10), 15);
  }
});
