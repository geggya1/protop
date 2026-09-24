/**
 * Unit tests: document / paper quad detection (TurboScan-style auto-frame).
 */
import assert from 'node:assert/strict';
import {
  approxQuad,
  buildPaperMask,
  convexHull,
  douglasPeucker,
  findDocumentQuad,
  orderCorners,
} from './drawingDocumentDetect.js';
import {
  edgeMidpoint,
  isValidQuad,
  moveQuadEdge,
  rectToQuad,
} from './drawingCropGeometry.js';

function makeImage(width, height, fillFn) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = fillFn(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

function pointInQuad(px, py, quad) {
  // Ray-cast on triangle fan from tl
  const pts = [quad.tl, quad.tr, quad.br, quad.bl];
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i, i += 1) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const intersect = ((yi > py) !== (yj > py))
      && (px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Axis-aligned white paper on dark desk
{
  const img = makeImage(160, 120, (x, y) => {
    if (x >= 30 && x < 130 && y >= 20 && y < 100) return [245, 242, 238];
    return [90, 80, 70];
  });
  const result = findDocumentQuad(img);
  assert.ok(result, 'should detect paper');
  assert.ok(result.confidence > 0.3);
  assert.ok(isValidQuad(result.normalized));
  // Corners should be near the paper edges
  assert.ok(result.quad.tl.x < 45);
  assert.ok(result.quad.tl.y < 35);
  assert.ok(result.quad.br.x > 115);
  assert.ok(result.quad.br.y > 85);
}

// Skewed parallelogram paper (perspective-ish)
{
  const img = makeImage(200, 160, (x, y) => {
    // Parallelogram: top from (40,25)-(150,20), bottom from (25,130)-(165,135)
    const t = (y - 25) / (130 - 25);
    if (t < 0 || t > 1) return [110, 100, 90];
    const left = 40 + (25 - 40) * t;
    const right = 150 + (165 - 150) * t;
    if (x >= left && x <= right) return [250, 248, 245];
    return [110, 100, 90];
  });
  const result = findDocumentQuad(img);
  assert.ok(result, 'should detect skewed paper');
  assert.ok(isValidQuad(result.normalized));
  // Area should cover a good chunk but not the whole image
  const area = Math.abs(
    (result.normalized.tl.x * result.normalized.tr.y - result.normalized.tr.x * result.normalized.tl.y)
    + (result.normalized.tr.x * result.normalized.br.y - result.normalized.br.x * result.normalized.tr.y)
    + (result.normalized.br.x * result.normalized.bl.y - result.normalized.bl.x * result.normalized.br.y)
    + (result.normalized.bl.x * result.normalized.tl.y - result.normalized.tl.x * result.normalized.bl.y),
  ) / 2;
  assert.ok(area > 0.15 && area < 0.85, `area=${area}`);
}

// Paper with colorful ink should still find sheet
{
  const img = makeImage(140, 110, (x, y) => {
    if (x >= 25 && x < 115 && y >= 15 && y < 95) {
      if (x > 50 && x < 80 && y > 35 && y < 70) return [40, 120, 220];
      return [248, 246, 242];
    }
    return [130, 120, 105];
  });
  const paper = buildPaperMask(img.data, img.width, img.height);
  assert.ok(paper.count > img.width * img.height * 0.15);
  const result = findDocumentQuad(img);
  assert.ok(result);
  assert.equal(result.method === 'paper' || result.method.startsWith('paper'), true);
}

// Convex hull + DP + orderCorners
{
  const square = [
    { x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 40 }, { x: 10, y: 40 },
    { x: 30, y: 10 }, { x: 50, y: 25 },
  ];
  const hull = convexHull(square);
  assert.ok(hull.length >= 4);
  const ordered = orderCorners([
    { x: 50, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 40 }, { x: 50, y: 40 },
  ]);
  assert.ok(ordered.tl.x <= ordered.tr.x);
  assert.ok(ordered.tl.y <= ordered.bl.y);
  const approx = approxQuad(hull, 100, 100);
  assert.ok(approx?.tl);
}

// Douglas-Peucker reduces points
{
  const line = [];
  for (let i = 0; i <= 20; i += 1) line.push({ x: i, y: i * 0.01 });
  const simple = douglasPeucker(line, 0.5);
  assert.ok(simple.length <= 3);
}

// Edge mid-handle geometry
{
  const quad = rectToQuad({ x: 0.2, y: 0.2, width: 0.5, height: 0.4 });
  const mid = edgeMidpoint(quad, 'top');
  assert.ok(Math.abs(mid.x - 0.45) < 1e-9);
  assert.ok(Math.abs(mid.y - 0.2) < 1e-9);
  const moved = moveQuadEdge(quad, 'top', 0, -0.05);
  assert.ok(Math.abs(moved.tl.y - 0.15) < 1e-9);
  assert.ok(Math.abs(moved.tr.y - 0.15) < 1e-9);
  assert.deepEqual(moved.br, quad.br);
  assert.ok(isValidQuad(moved));
}

// Empty / uniform image → null or full fallback handled by caller
{
  const img = makeImage(40, 40, () => [200, 200, 200]);
  const result = findDocumentQuad(img);
  // Uniform may not yield a distinct document — null is OK
  assert.ok(result === null || result.confidence < 0.6);
}

void pointInQuad;

console.log('drawingDocumentDetect ok');
