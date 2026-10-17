import assert from 'node:assert/strict';
import { mileageModalFrame } from './modalFrame.js';

const phone = mileageModalFrame(390, 844, { top: 47, bottom: 34 });
assert.deepEqual(phone, { width: 370, height: 743 });

const landscape = mileageModalFrame(844, 390, { top: 0, bottom: 21 });
assert.equal(landscape.width, 824);
assert.equal(landscape.height, 349);
assert.deepEqual(landscape, mileageModalFrame(844, 390, { top: 0, bottom: 21 }));

const desk = mileageModalFrame(1280, 900, { top: 0, bottom: 0 });
assert.deepEqual(desk, { width: 480, height: 640 });

const tablet = mileageModalFrame(1024, 768, {});
assert.deepEqual(tablet, { width: 480, height: 640 });

assert.deepEqual(
  mileageModalFrame(390, 844, { top: 47, bottom: 34 }),
  mileageModalFrame(390, 844, { top: 47, bottom: 34 }),
);

console.log('modalFrame.test.mjs: ok');
