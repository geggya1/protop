/**
 * OCR av skannet PDF via innebygde bilder/ImageMasks + Tesseract (norsk).
 * Mange skannede avtaler (f.eks. Consult1) har svak RGB-bakgrunn og skarp
 * tekst i paintImageMaskXObject — maskene må lastes via objs, ikke hoppes over.
 * Gemini får både OCR-tekst og sidene.
 */
import { createRequire } from 'node:module';
import { jpegWithinLimit } from './imageLimit.js';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { createWorker } from 'tesseract.js';

const require = createRequire(import.meta.url);
const cachePath = path.join(os.tmpdir(), 'protop-tesseract');

/** Tesseract takler tabeller bedre rundt 250–300 dpi; A4 ≈ 2480 px på langside. */
const MAX_OCR_EDGE = 2800;
/** Hopp over logoer og små stempler. */
const MIN_IMAGE_EDGE = 180;
const MIN_IMAGE_AREA = 80_000;

let workerPromise = null;

function workerOptions() {
  const langPath = path.join(path.dirname(require.resolve('@tesseract.js-data/nor/package.json')), '4.0.0');
  return { cachePath, langPath, gzip: true };
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('nor', 1, workerOptions()).then(async (worker) => {
      try {
        await worker.setParameters({
          preserve_interword_spaces: '1',
          tessedit_pageseg_mode: '4',
        });
      } catch {
        // Eldre tesseract.js uten parameter-støtte: kjør med default.
      }
      return worker;
    }).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** Avslutt singleton-worker (tester / lokal CLI). */
export async function resetOcrWorker() {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // ignore
  }
}

function waitForImage(store, name) {
  if (!store || name == null) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8000);
    try {
      store.get(name, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/**
 * paintImageMaskXObject sender { data: 'mask_p0_N', width, height } — ikke piksler.
 * paintImageXObject kan sende navn (string) eller ferdig bitmap.
 */
export async function resolvePageImage(page, arg) {
  if (!arg) return null;
  if (typeof arg === 'string') {
    return (await waitForImage(page.objs, arg)) || (await waitForImage(page.commonObjs, arg));
  }
  if (typeof arg === 'object') {
    if (arg.data && typeof arg.data !== 'string' && (arg.width || arg.height)) return arg;
    const name = typeof arg.data === 'string' ? arg.data : null;
    if (!name) return arg.width && arg.height ? arg : null;
    const loaded = (await waitForImage(page.objs, name)) || (await waitForImage(page.commonObjs, name));
    if (!loaded) return null;
    return {
      ...loaded,
      width: loaded.width || arg.width,
      height: loaded.height || arg.height,
    };
  }
  return null;
}

function luminance(r, g, b) {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

function resizeGray(src, srcW, srcH, maxEdge) {
  const edge = Math.max(srcW, srcH);
  if (!edge || edge <= maxEdge) {
    return { width: srcW, height: srcH, gray: src };
  }
  const factor = edge / maxEdge;
  const width = Math.max(1, Math.round(srcW / factor));
  const height = Math.max(1, Math.round(srcH / factor));
  const gray = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(srcH - 1, Math.floor((y + 0.5) * factor));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(srcW - 1, Math.floor((x + 0.5) * factor));
      gray[y * width + x] = src[sy * srcW + sx];
    }
  }
  return { width, height, gray };
}

function grayToPng(width, height, gray) {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i += 1) {
    const value = gray[i];
    const offset = i * 4;
    png.data[offset] = value;
    png.data[offset + 1] = value;
    png.data[offset + 2] = value;
    png.data[offset + 3] = 255;
  }
  return { buffer: PNG.sync.write(png), mime: 'image/png' };
}

/** 1-bit ImageMask → svart tekst på hvit bakgrunn (Tesseract-vennlig). */
function maskToGray(img) {
  const width = img.width || 0;
  const height = img.height || 0;
  const bytes = img?.data;
  if (!width || !height || !bytes) return null;
  const gray = Buffer.alloc(width * height);
  const packed = bytes.length < width * height;
  if (packed) {
    const stride = Math.ceil(width / 8);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const bit = (bytes[y * stride + (x >> 3)] >> (7 - (x & 7))) & 1;
        gray[y * width + x] = bit ? 0 : 255;
      }
    }
  } else {
    for (let i = 0; i < width * height; i += 1) {
      gray[i] = bytes[i] ? 0 : 255;
    }
  }
  return { width, height, gray };
}

function rgbToGray(img) {
  const width = img.width || 0;
  const height = img.height || 0;
  const bytes = img?.data;
  if (!width || !height || !bytes) return null;
  const gray = Buffer.alloc(width * height);
  if (img.kind === 1) {
    const stride = Math.ceil(width / 8);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const bit = (bytes[y * stride + (x >> 3)] >> (7 - (x & 7))) & 1;
        gray[y * width + x] = bit ? 0 : 255;
      }
    }
    return { width, height, gray };
  }
  const channels = img.kind === 3 || bytes.length >= width * height * 4
    ? 4
    : bytes.length >= width * height * 3 ? 3 : 1;
  for (let i = 0; i < width * height; i += 1) {
    if (channels === 1) {
      gray[i] = bytes[i];
    } else {
      const offset = i * channels;
      gray[i] = luminance(bytes[offset], bytes[offset + 1], bytes[offset + 2]);
    }
  }
  return { width, height, gray };
}

/**
 * Svake skann (lys grå tekst) får kontraststrekk før OCR.
 * Masker som allerede er nær svart/hvitt hoppes over.
 */
function enhanceFaintGray(gray) {
  let dark = 0;
  let sum = 0;
  for (let i = 0; i < gray.length; i += 1) {
    const value = gray[i];
    sum += value;
    if (value < 40) dark += 1;
  }
  const mean = sum / Math.max(gray.length, 1);
  const darkRatio = dark / Math.max(gray.length, 1);
  if (darkRatio >= 0.01 || mean < 220) return gray;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1;
  const lowTarget = gray.length * 0.01;
  const highTarget = gray.length * 0.92;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let i = 0; i < 256; i += 1) {
    acc += hist[i];
    if (acc >= lowTarget) {
      lo = i;
      break;
    }
  }
  acc = 0;
  for (let i = 0; i < 256; i += 1) {
    acc += hist[i];
    if (acc >= highTarget) {
      hi = i;
      break;
    }
  }
  const span = Math.max(1, hi - lo);
  const out = Buffer.alloc(gray.length);
  for (let i = 0; i < gray.length; i += 1) {
    let value = ((gray[i] - lo) / span) * 255;
    if (value < 230) value *= 0.55;
    out[i] = Math.max(0, Math.min(255, Math.round(value)));
  }
  return out;
}

export function bitmapToPng(img, { mask = false, maxEdge = MAX_OCR_EDGE } = {}) {
  const bytes = img?.data;
  if (!bytes) return null;
  if (!mask && bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    if (!jpegWithinLimit(bytes)) return null;
    return { buffer: Buffer.from(bytes), mime: 'image/jpeg', area: (img.width || 0) * (img.height || 0), mask: false };
  }
  const raw = mask ? maskToGray(img) : rgbToGray(img);
  if (!raw) return null;
  const gray = mask ? raw.gray : enhanceFaintGray(raw.gray);
  const sized = resizeGray(gray, raw.width, raw.height, maxEdge);
  const png = grayToPng(sized.width, sized.height, sized.gray);
  return {
    ...png,
    area: raw.width * raw.height,
    mask: Boolean(mask),
    width: sized.width,
    height: sized.height,
  };
}

function isUsefulImage(png) {
  if (!png?.buffer) return false;
  const area = png.area || 0;
  const edge = Math.max(png.width || 0, png.height || 0);
  if (area >= MIN_IMAGE_AREA) return true;
  if (edge >= MIN_IMAGE_EDGE && area >= MIN_IMAGE_AREA / 2) return true;
  return false;
}

async function pageImages(page, OPS) {
  const ops = await page.getOperatorList();
  const found = [];
  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i];
    const isMask = fn === OPS.paintImageMaskXObject;
    const isPaint = fn === OPS.paintImageXObject
      || fn === OPS.paintJpegXObject
      || fn === OPS.paintInlineImageXObject;
    if (!isMask && !isPaint) continue;
    const arg = ops.argsArray[i]?.[0];
    const img = await resolvePageImage(page, arg);
    const png = bitmapToPng(img, { mask: isMask });
    if (!isUsefulImage(png)) continue;
    found.push(png);
  }
  // Masker først (skarp tekst). Bleke RGB-skann hopper vi over når maske finnes —
  // de ga tidligere «ppdrage ||» og forurenset både OCR og Gemini.
  found.sort((a, b) => {
    if (a.mask !== b.mask) return a.mask ? -1 : 1;
    return (b.area || 0) - (a.area || 0);
  });
  const masks = found.filter((row) => row.mask).slice(0, 1);
  if (masks.length) return masks;
  return found.filter((row) => !row.mask).slice(0, 2);
}

function pageText(content) {
  const chunks = [];
  for (const item of content?.items || []) {
    if (item?.str) chunks.push(item.str);
    chunks.push(item?.hasEOL ? '\n' : ' ');
  }
  return chunks.join('').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}

export async function ocrPdfPages(buffer, { maxPages = 12 } = {}) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  const worker = await getWorker();
  const texts = [];
  const images = [];
  try {
    const pages = Math.min(doc.numPages || 0, maxPages);
    for (let pageNo = 1; pageNo <= pages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const layer = pageText(await page.getTextContent().catch(() => null));
      if (layer) texts.push(layer);
      if (layer.length >= 80) continue;
      const pngs = await pageImages(page, OPS);
      for (const png of pngs) {
        images.push(png);
        try {
          const recognized = await worker.recognize(png.buffer);
          const text = String(recognized?.data?.text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
          if (text) texts.push(text);
        } catch {
          // Gemini kan fortsatt lese bildet.
        }
      }
    }
  } finally {
    await doc.destroy?.();
  }
  return {
    text: texts.join('\n').trim(),
    images: images.slice(0, 8),
  };
}
