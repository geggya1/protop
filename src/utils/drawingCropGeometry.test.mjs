/**
 * Unit tests: free-corner / perspective crop geometry.
 */
import assert from 'node:assert/strict';
import {
  clampNorm,
  defaultQuad,
  edgeMidpoint,
  getPerspectiveTransform,
  isAxisAlignedQuad,
  isValidQuad,
  moveQuad,
  moveQuadCorner,
  moveQuadEdge,
  quadOutputSize,
  quadToPixels,
  rectToQuad,
  resizeFromCorner,
  rotateQuadCcw90,
  rotateQuadCw90,
  warpPerspectiveImageData,
} from './drawingCropGeometry.js';

const start = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 };

// Legacy axis-aligned resize still works
{
  const next = clampNorm(resizeFromCorner('br', start, 0.1, 0.05));
  assert.equal(next.x, 0.2);
  assert.equal(next.y, 0.2);
  assert.ok(Math.abs(next.width - 0.6) < 1e-9);
}

// Free corner: only tl moves; opposite stays
{
  const quad = rectToQuad(start);
  const next = moveQuadCorner(quad, 'tl', -0.05, -0.05);
  assert.ok(Math.abs(next.tl.x - 0.15) < 1e-9);
  assert.ok(Math.abs(next.tl.y - 0.15) < 1e-9);
  assert.deepEqual(next.br, quad.br);
  assert.ok(isValidQuad(next));
}

// Skew: move only tr.x — creates parallelogram-ish free quad
{
  const quad = rectToQuad(start);
  const skewed = moveQuadCorner(quad, 'tr', 0.08, 0);
  assert.ok(!isAxisAlignedQuad(skewed));
  assert.equal(skewed.tl.x, quad.tl.x);
  assert.ok(Math.abs(skewed.tr.x - (quad.tr.x + 0.08)) < 1e-9);
  assert.ok(isValidQuad(skewed));
}

// Reject self-intersecting / too-small moves by keeping previous
{
  const quad = rectToQuad({ x: 0.4, y: 0.4, width: 0.1, height: 0.1 });
  const bad = moveQuadCorner(quad, 'tr', -0.2, 0.2);
  // Either rejected (same as input) or still valid
  assert.ok(isValidQuad(bad));
}

// Move whole quad
{
  const quad = rectToQuad({ x: 0.2, y: 0.2, width: 0.4, height: 0.4 });
  const moved = moveQuad(quad, 0.1, -0.02);
  assert.ok(Math.abs(moved.tl.x - (quad.tl.x + 0.1)) < 1e-9);
  assert.ok(Math.abs(moved.tr.y - (quad.tr.y - 0.02)) < 1e-9);
}

// Homography: identity maps corners to themselves
{
  const src = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const dst = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const H = getPerspectiveTransform(src, dst);
  assert.ok(Math.abs(H[0] - 1) < 1e-6);
  assert.ok(Math.abs(H[4] - 1) < 1e-6);
}

// Warp a solid red square into dest
{
  const w = 40;
  const h = 40;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 220;
    data[i + 1] = 30;
    data[i + 2] = 40;
    data[i + 3] = 255;
  }
  const quad = {
    tl: { x: 5, y: 5 },
    tr: { x: 35, y: 2 },
    br: { x: 38, y: 36 },
    bl: { x: 3, y: 34 },
  };
  const size = quadOutputSize(quad);
  assert.ok(size.width > 20 && size.height > 20);
  const out = warpPerspectiveImageData({ data, width: w, height: h }, quad, {
    width: 20,
    height: 20,
  });
  assert.equal(out.width, 20);
  assert.equal(out.height, 20);
  // Center should stay reddish
  const mid = (10 * 20 + 10) * 4;
  assert.ok(out.data[mid] > 150);
  assert.ok(out.data[mid + 3] === 255);
}

{
  const px = quadToPixels(rectToQuad({ x: 0.1, y: 0.2, width: 0.5, height: 0.4 }), 1000, 800);
  assert.equal(px.tl.x, 100);
  assert.equal(px.tl.y, 160);
  assert.equal(px.br.x, 600);
  assert.equal(px.br.y, 480);
}

// 90° CW remaps corners and keeps content alignment
{
  const quad = rectToQuad({ x: 0.2, y: 0.2, width: 0.6, height: 0.4 });
  const cw = rotateQuadCw90(quad);
  assert.ok(Math.abs(cw.tl.x - 0.4) < 1e-9); // 1 - 0.6
  assert.ok(Math.abs(cw.tl.y - 0.2) < 1e-9);
  assert.ok(Math.abs(cw.tr.x - 0.8) < 1e-9); // 1 - 0.2
  assert.ok(Math.abs(cw.tr.y - 0.2) < 1e-9);
  const back = rotateQuadCcw90(cw);
  assert.ok(Math.abs(back.tl.x - quad.tl.x) < 1e-9);
  assert.ok(Math.abs(back.tl.y - quad.tl.y) < 1e-9);
  assert.ok(Math.abs(back.br.x - quad.br.x) < 1e-9);
  assert.ok(Math.abs(back.br.y - quad.br.y) < 1e-9);
}

// Mid-edge handles
{
  const quad = rectToQuad({ x: 0.2, y: 0.2, width: 0.5, height: 0.4 });
  const mid = edgeMidpoint(quad, 'right');
  assert.ok(Math.abs(mid.x - 0.7) < 1e-9);
  const edged = moveQuadEdge(quad, 'left', -0.05, 0);
  assert.ok(Math.abs(edged.tl.x - 0.15) < 1e-9);
  assert.ok(Math.abs(edged.bl.x - 0.15) < 1e-9);
  assert.deepEqual(edged.tr, quad.tr);
}

console.log('drawingCropGeometry.test.mjs: ok');
