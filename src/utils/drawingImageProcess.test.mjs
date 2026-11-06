/**
 * Unit tests for drawing auto-crop / scale helpers.
 */
import assert from 'node:assert/strict';
import {
  findContentBounds,
  findPaperRect,
  scaleSize,
} from './drawingImageProcess.js';

// Uniform image → full bounds fallback
{
  const width = 40;
  const height = 30;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 240;
    data[i + 1] = 240;
    data[i + 2] = 240;
    data[i + 3] = 255;
  }
  const bounds = findContentBounds({ width, height, data });
  assert.equal(bounds.x, 0);
  assert.equal(bounds.y, 0);
  assert.equal(bounds.width, width);
  assert.equal(bounds.height, height);
}

// Drawing on grey background → tight crop around dark ink
{
  const width = 100;
  const height = 80;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 210;
    data[i + 1] = 205;
    data[i + 2] = 198;
    data[i + 3] = 255;
  }
  for (let y = 20; y < 50; y += 1) {
    for (let x = 25; x < 70; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = 20;
      data[i + 1] = 20;
      data[i + 2] = 20;
    }
  }
  const bounds = findContentBounds({ width, height, data }, { paddingRatio: 0 });
  assert.ok(bounds.width < width);
  assert.ok(bounds.height < height);
  assert.ok(bounds.x <= 25);
  assert.ok(bounds.y <= 20);
  assert.ok(bounds.x + bounds.width >= 70);
  assert.ok(bounds.y + bounds.height >= 50);
}

// Bright paper sheet on darker desk → paper rect
{
  const width = 120;
  const height = 100;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 120;
    data[i + 1] = 110;
    data[i + 2] = 100;
    data[i + 3] = 255;
  }
  for (let y = 15; y < 85; y += 1) {
    for (let x = 20; x < 100; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = 245;
      data[i + 1] = 242;
      data[i + 2] = 238;
    }
  }
  // colorful ink on paper
  for (let y = 30; y < 55; y += 1) {
    for (let x = 40; x < 75; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = 30;
      data[i + 1] = 90;
      data[i + 2] = 200;
    }
  }
  const paper = findPaperRect(data, width, height, { r: 120, g: 110, b: 100 });
  assert.ok(paper);
  assert.ok(paper.width >= 70);
  assert.ok(paper.height >= 60);
  const bounds = findContentBounds({ width, height, data }, { paddingRatio: 0 });
  assert.ok(bounds.width < width);
  assert.ok(bounds.height < height);
  // Should prefer paper over tiny ink-only box or full desk
  assert.ok(bounds.width >= 70);
  assert.ok(bounds.x <= 25);
}

{
  const s = scaleSize(4000, 2000, 2400);
  assert.equal(s.width, 2400);
  assert.equal(s.height, 1200);
  const small = scaleSize(800, 600, 2400);
  assert.equal(small.width, 800);
  assert.equal(small.height, 600);
}
