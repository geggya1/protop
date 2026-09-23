/**
 * Barnetegninger — auto-crop (papirkant) + skaler til høy oppløsning.
 * Web: canvas. Native: returnerer original uten crop (picker leverer allerede bilde),
 * med mindre cropRect / cropQuad er satt eksplisitt (da kreves canvas/web).
 *
 * Auto-ramme: foreslår skjev firkant (dokumentdeteksjon) når mulig, ellers
 * akseparallell papir/innholdsboks — TurboScan-stil.
 */

import {
  isAxisAlignedQuad,
  quadOutputSize,
  rectToQuad,
  warpPerspectiveImageData,
} from './drawingCropGeometry.js';
import { findDocumentQuad } from './drawingDocumentDetect.js';

export const DRAWING_DISPLAY_EDGE = 2400;
export const DRAWING_THUMB_EDGE = 480;
export const DRAWING_JPEG_QUALITY = 0.92;

/** @typedef {{ x: number, y: number, width: number, height: number }} CropRect */
/** @typedef {{ tl: {x:number,y:number}, tr: {x:number,y:number}, br: {x:number,y:number}, bl: {x:number,y:number} }} CropQuad */

/**
 * Finn innholdsboks i ImageData ved å skille tegning/papir fra bakgrunn.
 * Bakgrunn estimeres fra kantprøver; piksler som avviker markeres som innhold.
 * Deretter forsøkes et papir-rektangel (lyse flate) for strammere crop.
 */
export function findContentBounds(imageData, {
  threshold = 24,
  edgeSample = 6,
  paddingRatio = 0.015,
  minContentRatio = 0.012,
} = {}) {
  const { width, height, data } = imageData || {};
  if (!width || !height || !data) return null;

  const bg = sampleEdgeBackground(data, width, height, edgeSample);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let content = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a < 20) continue;
      const dr = Math.abs(data[i] - bg.r);
      const dg = Math.abs(data[i + 1] - bg.g);
      const db = Math.abs(data[i + 2] - bg.b);
      if (dr + dg + db < threshold * 3) continue;
      content += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const total = width * height;
  if (content < total * minContentRatio || maxX < minX || maxY < minY) {
    const paper = findPaperRect(data, width, height, bg);
    if (paper) return padRect(paper, width, height, paddingRatio);
    return { x: 0, y: 0, width, height };
  }

  let bounds = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };

  // Prefer a paper sheet rectangle when it is tighter / more rectangular.
  const paper = findPaperRect(data, width, height, bg);
  if (paper) {
    const contentArea = bounds.width * bounds.height;
    const paperArea = paper.width * paper.height;
    const coversContent = (
      paper.x <= bounds.x + bounds.width * 0.08
      && paper.y <= bounds.y + bounds.height * 0.08
      && paper.x + paper.width >= bounds.x + bounds.width * 0.92
      && paper.y + paper.height >= bounds.y + bounds.height * 0.92
    );
    if (coversContent && paperArea <= contentArea * 1.35) {
      bounds = paper;
    } else if (paperArea < contentArea * 0.92 && paperArea > total * 0.04) {
      // Paper is clearly smaller than ink-blob bbox — use paper.
      const inkInside = (
        bounds.x >= paper.x - 4
        && bounds.y >= paper.y - 4
        && bounds.x + bounds.width <= paper.x + paper.width + 4
        && bounds.y + bounds.height <= paper.y + paper.height + 4
      );
      if (inkInside || paperArea > contentArea * 0.35) {
        bounds = paper;
      }
    }
  }

  return padRect(bounds, width, height, paddingRatio);
}

function padRect(rect, width, height, paddingRatio) {
  const padX = Math.max(4, Math.round(width * paddingRatio));
  const padY = Math.max(4, Math.round(height * paddingRatio));
  const x = Math.max(0, rect.x - padX);
  const y = Math.max(0, rect.y - padY);
  const right = Math.min(width, rect.x + rect.width + padX);
  const bottom = Math.min(height, rect.y + rect.height + padY);
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

/**
 * Finn lys papirflate midt i bildet (typisk A4/tegning på bord).
 * Returnerer null hvis ingen tydelig papirregion.
 */
export function findPaperRect(data, width, height, bgHint) {
  if (!data || !width || !height) return null;
  const bgLum = bgHint
    ? 0.299 * bgHint.r + 0.587 * bgHint.g + 0.114 * bgHint.b
    : 180;

  // Paper is usually brighter than desk; require low saturation + high luminance.
  const paperLumMin = Math.max(165, Math.min(230, bgLum + 18));
  const mask = new Uint8Array(width * height);
  let paperCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 20) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = max === 0 ? 0 : (max - min) / max;
      // Tillat litt mer fargetone (krem/beige papir) — stram sat-grense
      // feilet ofte på fargerike tegninger der «papir» fortsatt er synlig i kantene.
      if (lum >= paperLumMin && sat < 0.28 && Math.abs(r - g) < 40 && Math.abs(g - b) < 40) {
        mask[y * width + x] = 1;
        paperCount += 1;
      }
    }
  }
  if (paperCount < width * height * 0.04) return null;

  // Largest connected component via scanline flood (stack).
  const visited = new Uint8Array(width * height);
  let best = null;
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
      while (stack.length) {
        const cur = stack.pop();
        const cy = (cur / width) | 0;
        const cx = cur % width;
        count += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        const neighbors = [cur - 1, cur + 1, cur - width, cur + width];
        for (let n = 0; n < neighbors.length; n += 1) {
          const ni = neighbors[n];
          if (ni < 0 || ni >= mask.length) continue;
          if (!mask[ni] || visited[ni]) continue;
          // prevent wrap on left/right
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
      if (count < width * height * 0.04) continue;
      if (fill < 0.55) continue;
      if (w < width * 0.18 || h < height * 0.18) continue;
      const aspect = w / h;
      if (aspect < 0.45 || aspect > 2.4) continue;
      const score = count * fill;
      if (!best || score > best.score) {
        best = {
          x: minX, y: minY, width: w, height: h, score, fill,
        };
      }
    }
  }
  if (!best) return null;
  return {
    x: best.x,
    y: best.y,
    width: best.width,
    height: best.height,
  };
}

function sampleEdgeBackground(data, width, height, edgeSample) {
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
  if (!samples.length) return { r: 240, g: 240, b: 240 };
  const mid = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return {
    r: mid(samples.map((s) => s[0])),
    g: mid(samples.map((s) => s[1])),
    b: mid(samples.map((s) => s[2])),
  };
}

export function scaleSize(srcW, srcH, maxEdge) {
  const w = Math.max(1, srcW || 1);
  const h = Math.max(1, srcH || 1);
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  };
}

function canvasToJpegBlob(canvas, quality = DRAWING_JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    if (canvas.toBlob) {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Kunne ikke lage bilde'))),
        'image/jpeg',
        quality,
      );
      return;
    }
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      fetch(dataUrl).then((r) => r.blob()).then(resolve).catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Roter bilde 90/180/270° med urviseren (web/canvas).
 * @param {Blob} blob
 * @param {90|180|270|number} degreesCw
 * @returns {Promise<Blob>}
 */
export async function rotateImageBlob(blob, degreesCw = 90) {
  if (!blob || typeof document === 'undefined') {
    throw new Error('Rotering krever nettleser');
  }
  const deg = ((Number(degreesCw) % 360) + 360) % 360;
  if (deg === 0) return blob;
  if (![90, 180, 270].includes(deg)) {
    throw new Error('Kun 90/180/270° støttes');
  }
  const src = await loadBitmap(blob);
  const sw = src.width || src.naturalWidth || 0;
  const sh = src.height || src.naturalHeight || 0;
  if (!sw || !sh) {
    src.close?.();
    throw new Error('Ugyldig bilde');
  }
  const canvas = document.createElement('canvas');
  if (deg === 90 || deg === 270) {
    canvas.width = sh;
    canvas.height = sw;
  } else {
    canvas.width = sw;
    canvas.height = sh;
  }
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (deg === 90) {
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  } else if (deg === 180) {
    ctx.translate(canvas.width, canvas.height);
    ctx.rotate(Math.PI);
  } else if (deg === 270) {
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(src, 0, 0);
  src.close?.();
  return canvasToJpegBlob(canvas, DRAWING_JPEG_QUALITY);
}

async function loadBitmap(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* fall through */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Kunne ikke lese bildet'));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawSource(ctx, src, dx, dy, dw, dh, sx, sy, sw, sh) {
  if (sw != null) {
    ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
  } else {
    ctx.drawImage(src, dx, dy, dw, dh);
  }
}

function clampCrop(crop, sourceWidth, sourceHeight) {
  const x = Math.max(0, Math.min(Math.round(crop.x), sourceWidth - 1));
  const y = Math.max(0, Math.min(Math.round(crop.y), sourceHeight - 1));
  const width = Math.max(1, Math.min(Math.round(crop.width), sourceWidth - x));
  const height = Math.max(1, Math.min(Math.round(crop.height), sourceHeight - y));
  return { x, y, width, height };
}

/**
 * Foreslå auto-crop for et bilde (web/canvas). Brukes av crop-UI.
 * @returns {Promise<{ crop: CropRect, sourceWidth: number, sourceHeight: number }|null>}
 */
export async function suggestDrawingCrop(blob) {
  const quadSuggest = await suggestDrawingQuad(blob);
  if (!quadSuggest) return null;
  const { cropQuad, sourceWidth, sourceHeight } = quadSuggest;
  const xs = [cropQuad.tl.x, cropQuad.tr.x, cropQuad.br.x, cropQuad.bl.x];
  const ys = [cropQuad.tl.y, cropQuad.tr.y, cropQuad.br.y, cropQuad.bl.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    crop: clampCrop({
      x,
      y,
      width: Math.max(...xs) - x,
      height: Math.max(...ys) - y,
    }, sourceWidth, sourceHeight),
    sourceWidth,
    sourceHeight,
    cropQuad,
    confidence: quadSuggest.confidence,
    method: quadSuggest.method,
  };
}

/**
 * Foreslå dokument-firkant (muligens skjev) for crop-UI / auto-ramme.
 * @returns {Promise<{
 *   cropQuad: CropQuad,
 *   normalizedQuad: import('./drawingCropGeometry.js').Quad,
 *   sourceWidth: number,
 *   sourceHeight: number,
 *   confidence: number,
 *   method: string,
 * }|null>}
 */
export async function suggestDrawingQuad(blob) {
  if (!blob || typeof document === 'undefined') return null;
  const src = await loadBitmap(blob);
  const sourceWidth = src.width || src.naturalWidth || 0;
  const sourceHeight = src.height || src.naturalHeight || 0;
  if (!sourceWidth || !sourceHeight) {
    src.close?.();
    return null;
  }
  const probe = document.createElement('canvas');
  const probeScale = Math.min(1, 900 / Math.max(sourceWidth, sourceHeight));
  probe.width = Math.max(1, Math.round(sourceWidth * probeScale));
  probe.height = Math.max(1, Math.round(sourceHeight * probeScale));
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  drawSource(pctx, src, 0, 0, probe.width, probe.height);
  const imageData = pctx.getImageData(0, 0, probe.width, probe.height);

  const detected = findDocumentQuad(imageData);
  const inv = 1 / probeScale;

  if (detected?.quad) {
    src.close?.();
    const q = detected.quad;
    const cropQuad = {
      tl: { x: q.tl.x * inv, y: q.tl.y * inv },
      tr: { x: q.tr.x * inv, y: q.tr.y * inv },
      br: { x: q.br.x * inv, y: q.br.y * inv },
      bl: { x: q.bl.x * inv, y: q.bl.y * inv },
    };
    return {
      cropQuad,
      normalizedQuad: {
        tl: { x: cropQuad.tl.x / sourceWidth, y: cropQuad.tl.y / sourceHeight },
        tr: { x: cropQuad.tr.x / sourceWidth, y: cropQuad.tr.y / sourceHeight },
        br: { x: cropQuad.br.x / sourceWidth, y: cropQuad.br.y / sourceHeight },
        bl: { x: cropQuad.bl.x / sourceWidth, y: cropQuad.bl.y / sourceHeight },
      },
      sourceWidth,
      sourceHeight,
      confidence: detected.confidence,
      method: detected.method,
    };
  }

  // Fallback: axis-aligned content/paper bounds
  const bounds = findContentBounds(imageData);
  src.close?.();
  const crop = bounds
    ? clampCrop({
      x: bounds.x * inv,
      y: bounds.y * inv,
      width: bounds.width * inv,
      height: bounds.height * inv,
    }, sourceWidth, sourceHeight)
    : { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  const normalizedQuad = rectToQuad({
    x: crop.x / sourceWidth,
    y: crop.y / sourceHeight,
    width: crop.width / sourceWidth,
    height: crop.height / sourceHeight,
  });
  return {
    cropQuad: {
      tl: { x: crop.x, y: crop.y },
      tr: { x: crop.x + crop.width, y: crop.y },
      br: { x: crop.x + crop.width, y: crop.y + crop.height },
      bl: { x: crop.x, y: crop.y + crop.height },
    },
    normalizedQuad,
    sourceWidth,
    sourceHeight,
    confidence: bounds ? 0.4 : 0.1,
    method: bounds ? 'bounds' : 'full',
  };
}

/**
 * Kjør dokumentdeteksjon på ImageData (live kamera-preview).
 * Returnerer normalisert quad eller null.
 */
export function detectDrawingQuadFromImageData(imageData) {
  return findDocumentQuad(imageData);
}

/**
 * Auto-crop + lag display (høy oppløsning) og thumb.
 * @param {Blob} blob
 * @param {{
 *   displayEdge?: number,
 *   thumbEdge?: number,
 *   quality?: number,
 *   autoCrop?: boolean,
 *   cropRect?: CropRect|null,
 *   cropQuad?: CropQuad|null,
 * }} [opts]
 */
export async function processDrawingImage(blob, {
  displayEdge = DRAWING_DISPLAY_EDGE,
  thumbEdge = DRAWING_THUMB_EDGE,
  quality = DRAWING_JPEG_QUALITY,
  autoCrop = true,
  cropRect = null,
  cropQuad = null,
} = {}) {
  if (!blob) throw new Error('Mangler bilde');
  if (typeof document === 'undefined') {
    return {
      displayBlob: blob,
      thumbBlob: blob,
      width: 0,
      height: 0,
      crop: cropRect || cropQuad || null,
      sourceWidth: 0,
      sourceHeight: 0,
    };
  }

  const src = await loadBitmap(blob);
  const sourceWidth = src.width || src.naturalWidth || 0;
  const sourceHeight = src.height || src.naturalHeight || 0;
  if (!sourceWidth || !sourceHeight) throw new Error('Ugyldig bilde');

  const hasQuad = cropQuad?.tl && cropQuad?.tr && cropQuad?.br && cropQuad?.bl;
  const usePerspective = hasQuad && !isAxisAlignedQuad({
    tl: {
      x: cropQuad.tl.x / sourceWidth,
      y: cropQuad.tl.y / sourceHeight,
    },
    tr: {
      x: cropQuad.tr.x / sourceWidth,
      y: cropQuad.tr.y / sourceHeight,
    },
    br: {
      x: cropQuad.br.x / sourceWidth,
      y: cropQuad.br.y / sourceHeight,
    },
    bl: {
      x: cropQuad.bl.x / sourceWidth,
      y: cropQuad.bl.y / sourceHeight,
    },
  }, 0.01);

  let crop = { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  let displayCanvas;

  if (usePerspective) {
    const full = document.createElement('canvas');
    full.width = sourceWidth;
    full.height = sourceHeight;
    const fctx = full.getContext('2d', { willReadFrequently: true });
    drawSource(fctx, src, 0, 0, sourceWidth, sourceHeight);
    const imageData = fctx.getImageData(0, 0, sourceWidth, sourceHeight);
    const pixelQuad = {
      tl: {
        x: Math.max(0, Math.min(sourceWidth - 1, cropQuad.tl.x)),
        y: Math.max(0, Math.min(sourceHeight - 1, cropQuad.tl.y)),
      },
      tr: {
        x: Math.max(0, Math.min(sourceWidth - 1, cropQuad.tr.x)),
        y: Math.max(0, Math.min(sourceHeight - 1, cropQuad.tr.y)),
      },
      br: {
        x: Math.max(0, Math.min(sourceWidth - 1, cropQuad.br.x)),
        y: Math.max(0, Math.min(sourceHeight - 1, cropQuad.br.y)),
      },
      bl: {
        x: Math.max(0, Math.min(sourceWidth - 1, cropQuad.bl.x)),
        y: Math.max(0, Math.min(sourceHeight - 1, cropQuad.bl.y)),
      },
    };
    let outSize = quadOutputSize(pixelQuad);
    const maxEdge = Math.max(outSize.width, outSize.height);
    if (maxEdge > displayEdge) {
      const s = displayEdge / maxEdge;
      outSize = {
        width: Math.max(1, Math.round(outSize.width * s)),
        height: Math.max(1, Math.round(outSize.height * s)),
      };
    }
    const warped = warpPerspectiveImageData(imageData, pixelQuad, outSize);
    displayCanvas = document.createElement('canvas');
    displayCanvas.width = warped.width;
    displayCanvas.height = warped.height;
    displayCanvas.getContext('2d').putImageData(
      new ImageData(warped.data, warped.width, warped.height),
      0,
      0,
    );
    crop = {
      x: Math.min(pixelQuad.tl.x, pixelQuad.tr.x, pixelQuad.br.x, pixelQuad.bl.x),
      y: Math.min(pixelQuad.tl.y, pixelQuad.tr.y, pixelQuad.br.y, pixelQuad.bl.y),
      width: warped.width,
      height: warped.height,
      quad: pixelQuad,
    };
  } else {
    if (hasQuad) {
      const xs = [cropQuad.tl.x, cropQuad.tr.x, cropQuad.br.x, cropQuad.bl.x];
      const ys = [cropQuad.tl.y, cropQuad.tr.y, cropQuad.br.y, cropQuad.bl.y];
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      crop = clampCrop({
        x,
        y,
        width: Math.max(...xs) - x,
        height: Math.max(...ys) - y,
      }, sourceWidth, sourceHeight);
    } else if (cropRect && Number.isFinite(cropRect.x) && Number.isFinite(cropRect.width)) {
      crop = clampCrop(cropRect, sourceWidth, sourceHeight);
    } else if (autoCrop) {
      // Prefer skewed document quad → perspective warp when detection is strong.
      const probe = document.createElement('canvas');
      const probeScale = Math.min(1, 900 / Math.max(sourceWidth, sourceHeight));
      probe.width = Math.max(1, Math.round(sourceWidth * probeScale));
      probe.height = Math.max(1, Math.round(sourceHeight * probeScale));
      const pctx = probe.getContext('2d', { willReadFrequently: true });
      drawSource(pctx, src, 0, 0, probe.width, probe.height);
      const probeData = pctx.getImageData(0, 0, probe.width, probe.height);
      const detected = findDocumentQuad(probeData);
      const inv = 1 / probeScale;

      if (detected?.quad && detected.confidence >= 0.5 && detected.normalized
        && !isAxisAlignedQuad(detected.normalized, 0.012)) {
        const q = detected.quad;
        const pixelQuad = {
          tl: {
            x: Math.max(0, Math.min(sourceWidth - 1, q.tl.x * inv)),
            y: Math.max(0, Math.min(sourceHeight - 1, q.tl.y * inv)),
          },
          tr: {
            x: Math.max(0, Math.min(sourceWidth - 1, q.tr.x * inv)),
            y: Math.max(0, Math.min(sourceHeight - 1, q.tr.y * inv)),
          },
          br: {
            x: Math.max(0, Math.min(sourceWidth - 1, q.br.x * inv)),
            y: Math.max(0, Math.min(sourceHeight - 1, q.br.y * inv)),
          },
          bl: {
            x: Math.max(0, Math.min(sourceWidth - 1, q.bl.x * inv)),
            y: Math.max(0, Math.min(sourceHeight - 1, q.bl.y * inv)),
          },
        };
        const full = document.createElement('canvas');
        full.width = sourceWidth;
        full.height = sourceHeight;
        const fctx = full.getContext('2d', { willReadFrequently: true });
        drawSource(fctx, src, 0, 0, sourceWidth, sourceHeight);
        const imageData = fctx.getImageData(0, 0, sourceWidth, sourceHeight);
        let outSize = quadOutputSize(pixelQuad);
        const maxEdge = Math.max(outSize.width, outSize.height);
        if (maxEdge > displayEdge) {
          const s = displayEdge / maxEdge;
          outSize = {
            width: Math.max(1, Math.round(outSize.width * s)),
            height: Math.max(1, Math.round(outSize.height * s)),
          };
        }
        const warped = warpPerspectiveImageData(imageData, pixelQuad, outSize);
        displayCanvas = document.createElement('canvas');
        displayCanvas.width = warped.width;
        displayCanvas.height = warped.height;
        displayCanvas.getContext('2d').putImageData(
          new ImageData(warped.data, warped.width, warped.height),
          0,
          0,
        );
        crop = {
          x: Math.min(pixelQuad.tl.x, pixelQuad.tr.x, pixelQuad.br.x, pixelQuad.bl.x),
          y: Math.min(pixelQuad.tl.y, pixelQuad.tr.y, pixelQuad.br.y, pixelQuad.bl.y),
          width: warped.width,
          height: warped.height,
          quad: pixelQuad,
        };
      } else {
        const bounds = findContentBounds(probeData);
        if (bounds) {
          crop = clampCrop({
            x: bounds.x * inv,
            y: bounds.y * inv,
            width: bounds.width * inv,
            height: bounds.height * inv,
          }, sourceWidth, sourceHeight);
        }
      }
    }

    if (!displayCanvas) {
      const display = scaleSize(crop.width, crop.height, displayEdge);
      displayCanvas = document.createElement('canvas');
      displayCanvas.width = display.width;
      displayCanvas.height = display.height;
      const dctx = displayCanvas.getContext('2d');
      dctx.imageSmoothingEnabled = true;
      dctx.imageSmoothingQuality = 'high';
      drawSource(
        dctx, src, 0, 0, display.width, display.height,
        crop.x, crop.y, crop.width, crop.height,
      );
    }
  }

  const displayBlob = await canvasToJpegBlob(displayCanvas, quality);

  const thumb = scaleSize(displayCanvas.width, displayCanvas.height, thumbEdge);
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumb.width;
  thumbCanvas.height = thumb.height;
  const tctx = thumbCanvas.getContext('2d');
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  drawSource(tctx, displayCanvas, 0, 0, thumb.width, thumb.height);
  const thumbBlob = await canvasToJpegBlob(thumbCanvas, 0.85);

  src.close?.();

  return {
    displayBlob,
    thumbBlob,
    width: displayCanvas.width,
    height: displayCanvas.height,
    crop,
    sourceWidth,
    sourceHeight,
  };
}
