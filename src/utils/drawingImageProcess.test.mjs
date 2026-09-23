/**
 * Unit tests for drawing auto-crop / scale helpers.
 */
import assert from 'node:assert/strict';
import {
  findContentBounds,
  findPaperRect,
  scaleSize,
} from './drawingImageProcess.js';
import {
  normalizeFrame,
  normalizePlacement,
  frameColorHex,
  FRAME_SHAPES,
  FRAME_COLORS,
  ROOM_SCENES,
  ageAtDate,
  getFrameRect,
  coverImageBox,
  containImageBox,
  frameRectToViewStyle,
} from './childDrawingMeta.js';

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

assert.equal(FRAME_SHAPES.length >= 4, true);
assert.equal(FRAME_COLORS.length >= 5, true);
assert.equal(frameColorHex('oak'), '#C4A574');
assert.equal(normalizeFrame({ shape: 'oval', colorId: 'gold' }).shape, 'oval');
assert.equal(normalizeFrame({ shape: 'heart' }).shape, 'heart');
assert.equal(normalizeFrame({ shape: 'nope' }).shape, 'classic');
assert.equal(normalizePlacement({ x: 2, y: -1, scale: 9 }).x, 0.95);
assert.equal(normalizePlacement({ scene: 'kids' }).scene, 'kids');
assert.equal(normalizePlacement({ scene: 'bedroom' }).scene, 'bedroom');
assert.ok(ROOM_SCENES.length >= 6);
assert.equal(ageAtDate('2018-06-01', '2024-06-01'), 6);

{
  const living = getFrameRect('living');
  assert.ok(living);
  assert.ok(living.width > 0.2 && living.width < 0.6);
  assert.ok(living.height > 0.2 && living.height < 0.5);
  assert.equal(getFrameRect('gallery-living'), null);

  // Square viewport → identity cover box (no crop of wall frame)
  const square = coverImageBox(400, 400, 1);
  assert.ok(Math.abs(square.width - 400) < 0.01);
  assert.ok(Math.abs(square.height - 400) < 0.01);
  assert.ok(Math.abs(square.top) < 0.01);
  assert.ok(Math.abs(square.left) < 0.01);

  const view = frameRectToViewStyle(living, square);
  assert.ok(view.width > 80);
  assert.ok(view.height > 60);
  assert.ok(view.top > 20);
  assert.ok(view.top + view.height < 280);

  // Wide viewport with contain keeps full frame visible
  const letter = containImageBox(400, 200, 1);
  assert.ok(Math.abs(letter.height - 200) < 0.01);
  assert.ok(Math.abs(letter.width - 200) < 0.01);
  assert.ok(letter.left > 90);
}

console.log('drawingImageProcess + childDrawings helpers ok');
