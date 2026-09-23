import assert from 'node:assert/strict';
import {
  containBackdropBox,
  coverBackdropBox,
  backdropCoverZoomFactor,
  resolveSourceAspect,
} from './homeBackdropFit.js';

const PHONE = { w: 390, h: 844 }; // ~0.462
const BANNER_AR = 941 / 1672; // ~0.563 authored mobile banners

{
  const box = containBackdropBox(PHONE.w, PHONE.h, BANNER_AR);
  // Width-limited: full width, letterbox top/bottom — no side crop.
  assert.ok(Math.abs(box.width - PHONE.w) < 0.5, 'contain uses full width');
  assert.ok(box.height < PHONE.h, 'contain letterboxes vertically on tall phones');
  assert.ok(box.top > 0, 'contain centers vertically');
  assert.ok(Math.abs(box.width / box.height - BANNER_AR) < 1e-9, 'keeps image aspect');
}

{
  const cover = coverBackdropBox(PHONE.w, PHONE.h, BANNER_AR);
  const contain = containBackdropBox(PHONE.w, PHONE.h, BANNER_AR);
  assert.ok(cover.scale > contain.scale, 'cover zooms more than contain');
  assert.ok(cover.width > PHONE.w, 'cover overflows horizontally');
  const zoom = backdropCoverZoomFactor(PHONE.w / PHONE.h, BANNER_AR);
  assert.ok(zoom > 1.15 && zoom < 1.3, `expected ~1.22 zoom, got ${zoom}`);
  assert.ok(Math.abs(cover.scale / contain.scale - zoom) < 1e-9);
}

{
  // Matching aspects → cover and contain agree (min zoom fills exactly).
  const ar = PHONE.w / PHONE.h;
  const cover = coverBackdropBox(PHONE.w, PHONE.h, ar);
  const contain = containBackdropBox(PHONE.w, PHONE.h, ar);
  assert.ok(Math.abs(cover.scale - contain.scale) < 1e-9);
  assert.equal(backdropCoverZoomFactor(ar, ar), 1);
}

{
  // Landscape photo on portrait phone: contain letterboxes heavily, no zoom-in crop.
  const land = containBackdropBox(PHONE.w, PHONE.h, 16 / 9);
  assert.ok(Math.abs(land.width - PHONE.w) < 0.5);
  assert.ok(land.height < PHONE.h * 0.6);
}

{
  assert.equal(resolveSourceAspect(null, null), null);
  assert.equal(resolveSourceAspect({ width: 941, height: 1672 }, null), 941 / 1672);
  const fakeImage = {
    resolveAssetSource: () => ({ width: 100, height: 200 }),
  };
  assert.equal(resolveSourceAspect(12, fakeImage), 0.5);
}

console.log('homeBackdropFit.test.mjs: ok');
