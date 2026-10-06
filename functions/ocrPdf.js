/**
 * OCR av skannet PDF via innebygde bilder + Tesseract (norsk).
 * Brukes når pdfjs ikke finner tekstlag. Gemini får både OCR-tekst og sidene.
 */
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { createWorker } from 'tesseract.js';

const require = createRequire(import.meta.url);
const cachePath = path.join(os.tmpdir(), 'protop-tesseract');

let workerPromise = null;

function workerOptions() {
  const langPath = path.join(path.dirname(require.resolve('@tesseract.js-data/nor/package.json')), '4.0.0');
  return { cachePath, langPath, gzip: true };
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('nor', 1, workerOptions()).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

function bitmapToPng(img) {
  const bytes = img?.data;
  if (!bytes) return null;
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return { buffer: Buffer.from(bytes), mime: 'image/jpeg' };
  }
  const width = img.width || 0;
  const height = img.height || 0;
  if (!width || !height) return null;
  const png = new PNG({ width, height });
  const set = (index, value) => {
    const offset = index * 4;
    png.data[offset] = value;
    png.data[offset + 1] = value;
    png.data[offset + 2] = value;
    png.data[offset + 3] = 255;
  };
  if (img.kind === 1) {
    const stride = Math.ceil(width / 8);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const bit = (bytes[y * stride + (x >> 3)] >> (7 - (x & 7))) & 1;
        set(y * width + x, bit ? 0 : 255);
      }
    }
  } else if (img.kind === 2) {
    for (let i = 0; i < width * height; i += 1) set(i, bytes[i * 3]);
  } else {
    for (let i = 0; i < width * height; i += 1) {
      const value = img.kind === 3 ? bytes[i * 4] : bytes[i];
      set(i, value);
    }
  }
  const edge = Math.max(png.width, png.height);
  const maxEdge = 1600;
  if (!edge || edge <= maxEdge) return { buffer: PNG.sync.write(png), mime: 'image/png' };
  const factor = edge / maxEdge;
  const outWidth = Math.max(1, Math.round(png.width / factor));
  const outHeight = Math.max(1, Math.round(png.height / factor));
  const out = new PNG({ width: outWidth, height: outHeight });
  for (let y = 0; y < outHeight; y += 1) {
    const sy = Math.min(png.height - 1, Math.floor((y + 0.5) * factor));
    for (let x = 0; x < outWidth; x += 1) {
      const sx = Math.min(png.width - 1, Math.floor((x + 0.5) * factor));
      const src = (sy * png.width + sx) * 4;
      const dst = (y * outWidth + x) * 4;
      out.data[dst] = png.data[src];
      out.data[dst + 1] = png.data[src + 1];
      out.data[dst + 2] = png.data[src + 2];
      out.data[dst + 3] = 255;
    }
  }
  return { buffer: PNG.sync.write(out), mime: 'image/png' };
}

function waitForImage(page, name) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8000);
    page.objs.get(name, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function pageImages(page, OPS) {
  const ops = await page.getOperatorList();
  const found = [];
  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i];
    if (fn !== OPS.paintImageXObject && fn !== OPS.paintJpegXObject && fn !== OPS.paintInlineImageXObject) continue;
    const arg = ops.argsArray[i]?.[0];
    const img = arg && typeof arg === 'object' ? arg : await waitForImage(page, arg);
    const png = bitmapToPng(img);
    if (png?.buffer) found.push(png);
  }
  found.sort((a, b) => (b.buffer.length || 0) - (a.buffer.length || 0));
  return found.slice(0, 2);
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
