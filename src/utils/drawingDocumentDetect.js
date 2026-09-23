/**
 * Document / paper quad detection for barnetegninger (TurboScan-style).
 * Pure JS — no OpenCV. Finds a skewed quadrilateral around a sheet of paper.
 */

import { isValidQuad, rectToQuad } from './drawingCropGeometry.js';

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {{ tl: Pt, tr: Pt, br: Pt, bl: Pt }} Quad */

function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function sampleEdgeBackground(data, width, height, edgeSample = 6) {
  const samples = [];
  const push = (x, y) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 20) return;
    samples.push([data[i], data[i + 1], data[i + 2]]);
  };
  const e = Math.max(1, Math.min(edgeSample, Math.floor(Math.min(width, height) / 4)));
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 40))) {
    for (let y = 0; y < e; y += 1) push(x, y);
    for (let y = height - e; y < height; y += 1) push(x, y);
  }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 40))) {
    for (let x = 0; x < e; x += 1) push(x, y);
    for (let x = width - e; x < width; x += 1) push(x, y);
  }
  if (!samples.length) return { r: 240, g: 240, b: 240, lum: 240 };
  const mid = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const r = mid(samples.map((s) => s[0]));
  const g = mid(samples.map((s) => s[1]));
  const b = mid(samples.map((s) => s[2]));
  return { r, g, b, lum: luminance(r, g, b) };
}

/**
 * Build a binary mask of likely paper pixels (bright, low saturation).
 */
export function buildPaperMask(data, width, height, bgHint) {
  const bg = bgHint || sampleEdgeBackground(data, width, height);
  const bgLum = bg.lum ?? luminance(bg.r, bg.g, bg.b);
  // Paper is usually brighter than desk/floor; allow cream/beige.
  const paperLumMin = Math.max(150, Math.min(225, bgLum + 12));
  const mask = new Uint8Array(width * height);
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 20) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const lum = luminance(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const delta = Math.abs(r - bg.r) + Math.abs(g - bg.g) + Math.abs(b - bg.b);
      // Prefer brighter-than-bg paper; also accept near-white regions.
      const isPaper = (
        (lum >= paperLumMin && sat < 0.32 && Math.abs(r - g) < 48 && Math.abs(g - b) < 48)
        || (lum >= 210 && sat < 0.22 && delta > 28)
      );
      if (isPaper) {
        mask[y * width + x] = 1;
        count += 1;
      }
    }
  }
  return { mask, count, bg };
}

/**
 * Contrast mask: pixels that differ from edge background (ink + paper vs floor).
 */
export function buildContrastMask(data, width, height, bgHint, threshold = 28) {
  const bg = bgHint || sampleEdgeBackground(data, width, height);
  const mask = new Uint8Array(width * height);
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 20) continue;
      const dr = Math.abs(data[i] - bg.r);
      const dg = Math.abs(data[i + 1] - bg.g);
      const db = Math.abs(data[i + 2] - bg.b);
      if (dr + dg + db < threshold * 3) continue;
      mask[y * width + x] = 1;
      count += 1;
    }
  }
  return { mask, count, bg };
}

/**
 * Largest 4-connected component in a binary mask.
 * @returns {{ minX, maxX, minY, maxY, count, fill, mask: Uint8Array }|null}
 */
export function largestComponent(mask, width, height, {
  minAreaRatio = 0.035,
  minFill = 0.42,
  minSideRatio = 0.14,
} = {}) {
  if (!mask || !width || !height) return null;
  const visited = new Uint8Array(width * height);
  let best = null;
  const total = width * height;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!mask[start] || visited[start]) continue;
      const stack = [start];
      visited[start] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      const pixels = [];
      while (stack.length) {
        const cur = stack.pop();
        const cy = (cur / width) | 0;
        const cx = cur % width;
        count += 1;
        pixels.push(cur);
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        const neighbors = [cur - 1, cur + 1, cur - width, cur + width];
        for (let n = 0; n < neighbors.length; n += 1) {
          const ni = neighbors[n];
          if (ni < 0 || ni >= mask.length) continue;
          if (!mask[ni] || visited[ni]) continue;
          const nx = ni % width;
          const ny = (ni / width) | 0;
          if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
          visited[ni] = 1;
          stack.push(ni);
        }
      }
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const area = w * h;
      const fill = count / area;
      if (count < total * minAreaRatio) continue;
      if (fill < minFill) continue;
      if (w < width * minSideRatio || h < height * minSideRatio) continue;
      const aspect = w / h;
      if (aspect < 0.35 || aspect > 2.8) continue;
      const score = count * fill;
      if (!best || score > best.score) {
        const componentMask = new Uint8Array(width * height);
        for (let p = 0; p < pixels.length; p += 1) componentMask[pixels[p]] = 1;
        best = {
          minX, maxX, minY, maxY, count, fill, score, w, h, mask: componentMask,
        };
      }
    }
  }
  return best;
}

/** Collect outer boundary pixels of a component mask (simplified: any mask pixel with empty neighbor). */
export function componentBoundary(mask, width, height, minX, maxX, minY, maxY) {
  const pts = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 220));
  for (let y = minY; y <= maxY; y += step) {
    for (let x = minX; x <= maxX; x += step) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const edge = (
        x === 0 || y === 0 || x === width - 1 || y === height - 1
        || !mask[i - 1] || !mask[i + 1] || !mask[i - width] || !mask[i + width]
      );
      if (edge) pts.push({ x, y });
    }
  }
  return pts;
}

function cross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Andrew's monotone chain convex hull. */
export function convexHull(points) {
  if (!points?.length) return [];
  const pts = [...points].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (pts.length <= 2) return pts;
  const lower = [];
  for (let i = 0; i < pts.length; i += 1) {
    while (lower.length >= 2
      && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) {
      lower.pop();
    }
    lower.push(pts[i]);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    while (upper.length >= 2
      && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) {
      upper.pop();
    }
    upper.push(pts[i]);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function pointLineDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Douglas–Peucker polyline simplification. */
export function douglasPeucker(points, epsilon) {
  if (!points || points.length < 3) return points ? [...points] : [];
  let maxD = 0;
  let idx = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i += 1) {
    const d = pointLineDist(points[i], points[0], points[end]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > epsilon) {
    const left = douglasPeucker(points.slice(0, idx + 1), epsilon);
    const right = douglasPeucker(points.slice(idx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

/**
 * Approximate a closed convex polygon to exactly 4 corners.
 */
export function approxQuad(hull, width, height) {
  if (!hull?.length) return null;
  if (hull.length === 4) return orderCorners(hull);
  if (hull.length < 4) {
    // Degenerate — expand AABB corners
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of hull) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return orderCorners([
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ]);
  }

  // Close the ring for DP
  const ring = [...hull, hull[0]];
  const diag = Math.hypot(width, height);
  let best = null;
  // Binary-search epsilon until we get ~4 vertices
  let lo = diag * 0.005;
  let hi = diag * 0.25;
  for (let iter = 0; iter < 18; iter += 1) {
    const mid = (lo + hi) / 2;
    let simplified = douglasPeucker(ring, mid);
    // Drop closing duplicate
    if (simplified.length > 1
      && simplified[0].x === simplified[simplified.length - 1].x
      && simplified[0].y === simplified[simplified.length - 1].y) {
      simplified = simplified.slice(0, -1);
    }
    if (simplified.length === 4) {
      best = simplified;
      break;
    }
    if (simplified.length > 4) lo = mid;
    else hi = mid;
  }

  if (!best || best.length !== 4) {
    // Pick 4 extreme points: min/max (x+y) and (x-y)
    let tl = hull[0];
    let tr = hull[0];
    let br = hull[0];
    let bl = hull[0];
    for (const p of hull) {
      if (p.x + p.y < tl.x + tl.y) tl = p;
      if (-p.x + p.y < -tr.x + tr.y) tr = p;
      if (p.x + p.y > br.x + br.y) br = p;
      if (p.x - p.y < bl.x - bl.y) bl = p;
    }
    // Fix tr: maximize x - y among top-ish
    for (const p of hull) {
      if (p.x - p.y > tr.x - tr.y) tr = p;
      if (-p.x + p.y > bl.x * -1 + bl.y && p.x + p.y < (tl.x + br.x) / 2 + height) {
        /* keep */
      }
    }
    // Recompute extremes more carefully
    tl = hull[0]; tr = hull[0]; br = hull[0]; bl = hull[0];
    for (const p of hull) {
      if (p.x + p.y < tl.x + tl.y) tl = p;
      if (p.x - p.y > tr.x - tr.y) tr = p;
      if (p.x + p.y > br.x + br.y) br = p;
      if (-p.x + p.y > -bl.x + bl.y) bl = p;
    }
    best = [tl, tr, br, bl];
  }

  return orderCorners(best);
}

/** Order 4 points as tl, tr, br, bl (clockwise from top-left). */
export function orderCorners(pts) {
  if (!pts || pts.length !== 4) return null;
  const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
  const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
  const sorted = [...pts].sort((a, b) => (
    Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  ));
  // Find index of top-left (min x+y)
  let start = 0;
  let bestScore = Infinity;
  for (let i = 0; i < 4; i += 1) {
    const s = sorted[i].x + sorted[i].y;
    if (s < bestScore) {
      bestScore = s;
      start = i;
    }
  }
  const ordered = [
    sorted[start],
    sorted[(start + 1) % 4],
    sorted[(start + 2) % 4],
    sorted[(start + 3) % 4],
  ];
  // Ensure clockwise: if going counter-clockwise, reverse
  const area = (
    ordered[0].x * ordered[1].y - ordered[1].x * ordered[0].y
    + ordered[1].x * ordered[2].y - ordered[2].x * ordered[1].y
    + ordered[2].x * ordered[3].y - ordered[3].x * ordered[2].y
    + ordered[3].x * ordered[0].y - ordered[0].x * ordered[3].y
  );
  if (area < 0) {
    return {
      tl: ordered[0],
      tr: ordered[3],
      br: ordered[2],
      bl: ordered[1],
    };
  }
  return {
    tl: ordered[0],
    tr: ordered[1],
    br: ordered[2],
    bl: ordered[3],
  };
}

function padQuad(quad, width, height, padRatio = 0.008) {
  const pad = Math.max(2, Math.round(Math.min(width, height) * padRatio));
  const cx = (quad.tl.x + quad.tr.x + quad.br.x + quad.bl.x) / 4;
  const cy = (quad.tl.y + quad.tr.y + quad.br.y + quad.bl.y) / 4;
  const expand = (p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: Math.max(0, Math.min(width - 1, Math.round(p.x + (dx / len) * pad))),
      y: Math.max(0, Math.min(height - 1, Math.round(p.y + (dy / len) * pad))),
    };
  };
  return {
    tl: expand(quad.tl),
    tr: expand(quad.tr),
    br: expand(quad.br),
    bl: expand(quad.bl),
  };
}

function quadArea(quad) {
  const pts = [quad.tl, quad.tr, quad.br, quad.bl];
  let a = 0;
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
}

function normalizePixelQuad(quad, width, height) {
  return {
    tl: { x: quad.tl.x / width, y: quad.tl.y / height },
    tr: { x: quad.tr.x / width, y: quad.tr.y / height },
    br: { x: quad.br.x / width, y: quad.br.y / height },
    bl: { x: quad.bl.x / width, y: quad.bl.y / height },
  };
}

function tryQuadFromMask(mask, width, height, componentOpts) {
  const comp = largestComponent(mask, width, height, componentOpts);
  if (!comp) return null;
  const boundary = componentBoundary(
    comp.mask, width, height, comp.minX, comp.maxX, comp.minY, comp.maxY,
  );
  if (boundary.length < 8) {
    return {
      tl: { x: comp.minX, y: comp.minY },
      tr: { x: comp.maxX, y: comp.minY },
      br: { x: comp.maxX, y: comp.maxY },
      bl: { x: comp.minX, y: comp.maxY },
    };
  }
  const hull = convexHull(boundary);
  const quad = approxQuad(hull, width, height);
  if (!quad) return null;
  const area = quadArea(quad);
  if (area < width * height * 0.04) return null;
  if (area > width * height * 0.98) return null;
  return quad;
}

/**
 * Detect document/paper as a (possibly skewed) quadrilateral in pixel space.
 * @param {ImageData|{width:number,height:number,data:Uint8ClampedArray|Uint8Array}} imageData
 * @returns {{ quad: Quad, confidence: number, method: string }|null}
 *   quad is in pixel coordinates of the given imageData.
 */
export function findDocumentQuad(imageData) {
  const { width, height, data } = imageData || {};
  if (!width || !height || !data) return null;

  const bg = sampleEdgeBackground(data, width, height);

  // 1) Prefer paper mask (white sheet on darker/colored desk)
  const paper = buildPaperMask(data, width, height, bg);
  let quad = null;
  let method = 'none';
  if (paper.count >= width * height * 0.04) {
    quad = tryQuadFromMask(paper.mask, width, height, {
      minAreaRatio: 0.04,
      minFill: 0.45,
      minSideRatio: 0.16,
    });
    if (quad) method = 'paper';
  }

  // 2) Contrast blob fallback (ink+paper vs floor)
  if (!quad) {
    const contrast = buildContrastMask(data, width, height, bg, 26);
    if (contrast.count >= width * height * 0.03) {
      quad = tryQuadFromMask(contrast.mask, width, height, {
        minAreaRatio: 0.03,
        minFill: 0.4,
        minSideRatio: 0.14,
      });
      if (quad) method = 'contrast';
    }
  }

  if (!quad) return null;

  const padded = padQuad(quad, width, height, 0.006);
  const norm = normalizePixelQuad(padded, width, height);
  if (!isValidQuad(norm)) {
    // Fall back to AABB of the detected quad
    const xs = [padded.tl.x, padded.tr.x, padded.br.x, padded.bl.x];
    const ys = [padded.tl.y, padded.tr.y, padded.br.y, padded.bl.y];
    const aabb = rectToQuad({
      x: Math.min(...xs) / width,
      y: Math.min(...ys) / height,
      width: (Math.max(...xs) - Math.min(...xs)) / width,
      height: (Math.max(...ys) - Math.min(...ys)) / height,
    });
    return {
      quad: {
        tl: { x: aabb.tl.x * width, y: aabb.tl.y * height },
        tr: { x: aabb.tr.x * width, y: aabb.tr.y * height },
        br: { x: aabb.br.x * width, y: aabb.br.y * height },
        bl: { x: aabb.bl.x * width, y: aabb.bl.y * height },
      },
      confidence: 0.45,
      method: `${method}-aabb`,
      normalized: aabb,
    };
  }

  const areaRatio = quadArea(padded) / (width * height);
  const confidence = Math.max(0.35, Math.min(0.98, areaRatio * 1.4 + (method === 'paper' ? 0.15 : 0)));

  return {
    quad: padded,
    confidence,
    method,
    normalized: norm,
  };
}

/**
 * Run detection on ImageData and return a normalized (0–1) quad, or null.
 */
export function detectNormalizedQuad(imageData) {
  const result = findDocumentQuad(imageData);
  return result?.normalized || null;
}
