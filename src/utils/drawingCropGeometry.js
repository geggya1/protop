/**
 * Perspektiv-crop: frie hjørner + homografi for å rette opp skjeve utsnitt.
 */

export const MIN_CROP = 0.08;
const MIN_SIDE = 0.04;

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {{ tl: Pt, tr: Pt, br: Pt, bl: Pt }} Quad */

export function clampNorm(rect) {
  let { x, y, width, height } = rect;
  x = Math.max(0, Math.min(1 - MIN_CROP, x));
  y = Math.max(0, Math.min(1 - MIN_CROP, y));
  width = Math.max(MIN_CROP, Math.min(1 - x, width));
  height = Math.max(MIN_CROP, Math.min(1 - y, height));
  return { x, y, width, height };
}

export function resizeFromCorner(corner, start, dx, dy) {
  if (corner === 'tl') {
    const nx = start.x + dx;
    const ny = start.y + dy;
    return {
      x: nx,
      y: ny,
      width: start.width - (nx - start.x),
      height: start.height - (ny - start.y),
    };
  }
  if (corner === 'tr') {
    const ny = start.y + dy;
    return {
      x: start.x,
      y: ny,
      width: start.width + dx,
      height: start.height - (ny - start.y),
    };
  }
  if (corner === 'bl') {
    const nx = start.x + dx;
    return {
      x: nx,
      y: start.y,
      width: start.width - (nx - start.x),
      height: start.height + dy,
    };
  }
  return {
    x: start.x,
    y: start.y,
    width: start.width + dx,
    height: start.height + dy,
  };
}

export function clampPoint(p) {
  return {
    x: Math.max(0, Math.min(1, Number(p?.x) || 0)),
    y: Math.max(0, Math.min(1, Number(p?.y) || 0)),
  };
}

export function rectToQuad(rect) {
  const r = clampNorm(rect);
  return {
    tl: { x: r.x, y: r.y },
    tr: { x: r.x + r.width, y: r.y },
    br: { x: r.x + r.width, y: r.y + r.height },
    bl: { x: r.x, y: r.y + r.height },
  };
}

export function defaultQuad() {
  return rectToQuad({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
}

export function cloneQuad(quad) {
  return {
    tl: { ...quad.tl },
    tr: { ...quad.tr },
    br: { ...quad.br },
    bl: { ...quad.bl },
  };
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function cross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** True når firkanten er konveks og har rimelig areal. */
export function isValidQuad(quad) {
  if (!quad?.tl || !quad?.tr || !quad?.br || !quad?.bl) return false;
  const pts = [quad.tl, quad.tr, quad.br, quad.bl];
  if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  if (dist(quad.tl, quad.tr) < MIN_SIDE) return false;
  if (dist(quad.tr, quad.br) < MIN_SIDE) return false;
  if (dist(quad.br, quad.bl) < MIN_SIDE) return false;
  if (dist(quad.bl, quad.tl) < MIN_SIDE) return false;
  const signs = [];
  for (let i = 0; i < 4; i += 1) {
    const o = pts[i];
    const a = pts[(i + 1) % 4];
    const b = pts[(i + 2) % 4];
    signs.push(Math.sign(cross(o, a, b)));
  }
  const nonzero = signs.filter((s) => s !== 0);
  if (!nonzero.length) return false;
  const first = nonzero[0];
  return nonzero.every((s) => s === first);
}

export function moveQuadCorner(quad, corner, dx, dy) {
  const next = cloneQuad(quad);
  if (!next[corner]) return quad;
  next[corner] = clampPoint({
    x: quad[corner].x + dx,
    y: quad[corner].y + dy,
  });
  return isValidQuad(next) ? next : quad;
}

export function moveQuad(quad, dx, dy) {
  const shifted = {
    tl: { x: quad.tl.x + dx, y: quad.tl.y + dy },
    tr: { x: quad.tr.x + dx, y: quad.tr.y + dy },
    br: { x: quad.br.x + dx, y: quad.br.y + dy },
    bl: { x: quad.bl.x + dx, y: quad.bl.y + dy },
  };
  // Clamp as a group so shape is preserved when hitting edges.
  let minX = Math.min(shifted.tl.x, shifted.tr.x, shifted.br.x, shifted.bl.x);
  let maxX = Math.max(shifted.tl.x, shifted.tr.x, shifted.br.x, shifted.bl.x);
  let minY = Math.min(shifted.tl.y, shifted.tr.y, shifted.br.y, shifted.bl.y);
  let maxY = Math.max(shifted.tl.y, shifted.tr.y, shifted.br.y, shifted.bl.y);
  let ox = 0;
  let oy = 0;
  if (minX < 0) ox = -minX;
  if (maxX > 1) ox = 1 - maxX;
  if (minY < 0) oy = -minY;
  if (maxY > 1) oy = 1 - maxY;
  return {
    tl: clampPoint({ x: shifted.tl.x + ox, y: shifted.tl.y + oy }),
    tr: clampPoint({ x: shifted.tr.x + ox, y: shifted.tr.y + oy }),
    br: clampPoint({ x: shifted.br.x + ox, y: shifted.br.y + oy }),
    bl: clampPoint({ x: shifted.bl.x + ox, y: shifted.bl.y + oy }),
  };
}

/**
 * Flytt en hele kant (TurboScan mid-edge handles).
 * edge: 'top' | 'right' | 'bottom' | 'left'
 */
export function moveQuadEdge(quad, edge, dx, dy) {
  const next = cloneQuad(quad);
  if (edge === 'top') {
    next.tl = clampPoint({ x: quad.tl.x + dx, y: quad.tl.y + dy });
    next.tr = clampPoint({ x: quad.tr.x + dx, y: quad.tr.y + dy });
  } else if (edge === 'right') {
    next.tr = clampPoint({ x: quad.tr.x + dx, y: quad.tr.y + dy });
    next.br = clampPoint({ x: quad.br.x + dx, y: quad.br.y + dy });
  } else if (edge === 'bottom') {
    next.bl = clampPoint({ x: quad.bl.x + dx, y: quad.bl.y + dy });
    next.br = clampPoint({ x: quad.br.x + dx, y: quad.br.y + dy });
  } else if (edge === 'left') {
    next.tl = clampPoint({ x: quad.tl.x + dx, y: quad.tl.y + dy });
    next.bl = clampPoint({ x: quad.bl.x + dx, y: quad.bl.y + dy });
  } else {
    return quad;
  }
  return isValidQuad(next) ? next : quad;
}

/** Midpunkt på kant (normalisert). */
export function edgeMidpoint(quad, edge) {
  if (edge === 'top') {
    return { x: (quad.tl.x + quad.tr.x) / 2, y: (quad.tl.y + quad.tr.y) / 2 };
  }
  if (edge === 'right') {
    return { x: (quad.tr.x + quad.br.x) / 2, y: (quad.tr.y + quad.br.y) / 2 };
  }
  if (edge === 'bottom') {
    return { x: (quad.bl.x + quad.br.x) / 2, y: (quad.bl.y + quad.br.y) / 2 };
  }
  return { x: (quad.tl.x + quad.bl.x) / 2, y: (quad.tl.y + quad.bl.y) / 2 };
}

export function quadCentroid(quad) {
  return {
    x: (quad.tl.x + quad.tr.x + quad.br.x + quad.bl.x) / 4,
    y: (quad.tl.y + quad.tr.y + quad.br.y + quad.bl.y) / 4,
  };
}

/** Pixel-quad fra normalisert quad. */
export function quadToPixels(quad, sourceWidth, sourceHeight) {
  const map = (p) => ({
    x: Math.round(clampPoint(p).x * sourceWidth),
    y: Math.round(clampPoint(p).y * sourceHeight),
  });
  return {
    tl: map(quad.tl),
    tr: map(quad.tr),
    br: map(quad.br),
    bl: map(quad.bl),
  };
}

export function quadOutputSize(pixelQuad) {
  const width = Math.max(
    32,
    Math.round((dist(pixelQuad.tl, pixelQuad.tr) + dist(pixelQuad.bl, pixelQuad.br)) / 2),
  );
  const height = Math.max(
    32,
    Math.round((dist(pixelQuad.tl, pixelQuad.bl) + dist(pixelQuad.tr, pixelQuad.br)) / 2),
  );
  return { width, height };
}

/**
 * Løs 8x8 for perspektiv-homografi som mapper src[i] → dst[i].
 * Returnerer [h0..h7] der h8 = 1.
 */
export function getPerspectiveTransform(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  return solveLinearSystem(A, b);
}

function solveLinearSystem(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) {
      throw new Error('Degenerate perspective');
    }
    if (pivot !== col) {
      const tmp = M[col];
      M[col] = M[pivot];
      M[pivot] = tmp;
    }
    const div = M[col][col];
    for (let c = col; c <= n; c += 1) M[col][c] /= div;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= n; c += 1) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

function applyHomography(H, x, y) {
  const w = H[6] * x + H[7] * y + 1;
  if (Math.abs(w) < 1e-12) return null;
  return {
    x: (H[0] * x + H[1] * y + H[2]) / w,
    y: (H[3] * x + H[4] * y + H[5]) / w,
  };
}

function sampleBilinear(data, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) {
    const xi = Math.max(0, Math.min(width - 1, Math.round(x)));
    const yi = Math.max(0, Math.min(height - 1, Math.round(y)));
    const i = (yi * width + xi) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = x - x0;
  const fy = y - y0;
  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c += 1) {
    const v0 = data[i00 + c] * (1 - fx) + data[i10 + c] * fx;
    const v1 = data[i01 + c] * (1 - fx) + data[i11 + c] * fx;
    out[c] = Math.round(v0 * (1 - fy) + v1 * fy);
  }
  return out;
}

/**
 * Warper et bilde slik at pixelQuad blir et rettvinklet destinasjonsbilde.
 * @param {ImageData} imageData
 * @param {{ tl: Pt, tr: Pt, br: Pt, bl: Pt }} pixelQuad
 * @param {{ width: number, height: number }} destSize
 * @returns {ImageData}
 */
export function warpPerspectiveImageData(imageData, pixelQuad, destSize) {
  const { width: srcW, height: srcH, data } = imageData;
  const dstW = Math.max(1, destSize.width | 0);
  const dstH = Math.max(1, destSize.height | 0);
  const srcPts = [
    [pixelQuad.tl.x, pixelQuad.tl.y],
    [pixelQuad.tr.x, pixelQuad.tr.y],
    [pixelQuad.br.x, pixelQuad.br.y],
    [pixelQuad.bl.x, pixelQuad.bl.y],
  ];
  const dstPts = [
    [0, 0],
    [dstW - 1, 0],
    [dstW - 1, dstH - 1],
    [0, dstH - 1],
  ];
  // Map destination → source for sampling
  const H = getPerspectiveTransform(dstPts, srcPts);
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  for (let y = 0; y < dstH; y += 1) {
    for (let x = 0; x < dstW; x += 1) {
      const src = applyHomography(H, x, y);
      const i = (y * dstW + x) * 4;
      if (!src) {
        out[i + 3] = 0;
        continue;
      }
      const [r, g, b, a] = sampleBilinear(data, srcW, srcH, src.x, src.y);
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = a;
    }
  }
  return {
    data: out,
    width: dstW,
    height: dstH,
  };
}

export function isAxisAlignedQuad(quad, eps = 0.002) {
  if (!quad) return false;
  return (
    Math.abs(quad.tl.y - quad.tr.y) < eps
    && Math.abs(quad.bl.y - quad.br.y) < eps
    && Math.abs(quad.tl.x - quad.bl.x) < eps
    && Math.abs(quad.tr.x - quad.br.x) < eps
  );
}

/** Normalisert punkt etter 90° med urviseren: (x,y) → (1−y, x). */
function mapPointCw90(p) {
  return { x: 1 - p.y, y: p.x };
}

/** Normalisert punkt etter 90° mot urviseren: (x,y) → (y, 1−x). */
function mapPointCcw90(p) {
  return { x: p.y, y: 1 - p.x };
}

/**
 * Roter crop-firkant 90° med urviseren (samme transform som bildet).
 * Hjørneetiketter følger visuelle posisjoner (tl/tr/br/bl).
 */
export function rotateQuadCw90(quad) {
  return {
    tl: mapPointCw90(quad.bl),
    tr: mapPointCw90(quad.tl),
    br: mapPointCw90(quad.tr),
    bl: mapPointCw90(quad.br),
  };
}

/** Roter crop-firkant 90° mot urviseren. */
export function rotateQuadCcw90(quad) {
  return {
    tl: mapPointCcw90(quad.tr),
    tr: mapPointCcw90(quad.br),
    br: mapPointCcw90(quad.bl),
    bl: mapPointCcw90(quad.tl),
  };
}
