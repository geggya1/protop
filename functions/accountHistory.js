/**
 * Eldre årsregnskap fra åpne regnskapskopier.
 * Kopiene er skannede PDF-er. Vi leser resultat og balanse og krever at
 * siste år stemmer med nøkkeltall-APIet før serien brukes.
 */
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { createWorker } from 'tesseract.js';
import {
  linesFromWords,
  acceptCopyYears,
  mergeAccountYears,
  parseAccountStatement,
  parsePositionedStatement,
  pendingCopyYears,
  pickCopyYears,
  shapeAccountPayload,
} from './accountSeries.js';

const require = createRequire(import.meta.url);

const ACCOUNTS = 'https://data.brreg.no/regnskapsregisteret/regnskap';
const CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const cachePath = path.join(os.tmpdir(), 'protop-tesseract');

let workerPromise = null;

export async function closeAccountOcr() {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  const worker = await pending.catch(() => null);
  await worker?.terminate?.();
}

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

async function readJson(url, fetchImpl) {
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  return res.json();
}

async function readPdf(url, fetchImpl) {
  const res = await fetchImpl(url, {
    headers: { Accept: '*/*' },
    signal: AbortSignal.timeout(25000),
  });
  if (res.status === 429) {
    const error = new Error('Regnskapsregisteret begrenset antall kall.');
    error.rateLimited = true;
    throw error;
  }
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

function bitmapToPng(img) {
  const bytes = img?.data;
  if (!bytes) return null;
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return { buffer: Buffer.from(bytes), scaleX: 1 };
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
  const maxEdge = 1300;
  if (!edge || edge <= maxEdge) return { buffer: PNG.sync.write(png), scaleX: 1 };
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
  return { buffer: PNG.sync.write(out), scaleX: png.width / outWidth };
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

async function largestImage(page, OPS) {
  const ops = await page.getOperatorList();
  let best = null;
  let bestArea = 0;
  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i];
    if (fn !== OPS.paintImageXObject && fn !== OPS.paintJpegXObject && fn !== OPS.paintInlineImageXObject) continue;
    const arg = ops.argsArray[i]?.[0];
    const img = arg && typeof arg === 'object' ? arg : await waitForImage(page, arg);
    const area = (img?.width || 0) * (img?.height || 0);
    if (area > bestArea) {
      best = img;
      bestArea = area;
    }
  }
  return best;
}

function statementComplete(text) {
  return (/sum inntekter|sum driftsinntekter/i.test(text))
    && /^sum eiendeler\b/im.test(text)
    && /^sum egenkapital\b/im.test(text)
    && !/^sum egenkapital\s+og\b/im.test(text.match(/^sum egenkapital\b.*$/im)?.[0] || '')
    && /^sum gjeld\b/im.test(text);
}

export async function ocrAccountPdf(buffer, worker) {
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  const active = worker || await getWorker();
  const parts = [];
  const words = [];
  let yShift = 0;
  try {
    const maxPages = Math.min(doc.numPages || 0, 4);
    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const image = await largestImage(page, OPS);
      const png = image ? bitmapToPng(image) : null;
      if (!png?.buffer) continue;
      const recognized = await active.recognize(png.buffer);
      parts.push(recognized?.data?.text || '');
      const scaleX = png.scaleX || 1;
      for (const word of recognized?.data?.words || []) {
        const text = String(word?.text || '').trim();
        if (!text) continue;
        words.push({
          text,
          x: (((word.bbox?.x0 || 0) + (word.bbox?.x1 || 0)) / 2) * scaleX,
          y: (word.bbox?.y0 || 0) + yShift,
        });
      }
      yShift += 10000;
      if (statementComplete(parts.join('\n'))) break;
    }
  } finally {
    await doc.destroy?.();
  }
  return { text: parts.join('\n'), lines: linesFromWords(words) };
}

function packYears(years) {
  return (years || []).map((row) => {
    const out = {};
    for (const [key, value] of Object.entries(row)) {
      if (value == null || value === '' || key === 'years') continue;
      out[key] = value;
    }
    return out;
  });
}

async function db() {
  const { getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  if (!getApps().length) initializeApp();
  return getFirestore();
}

async function readCache(orgnr, latest) {
  try {
    const snap = await (await db()).collection('publicAccountSeries').doc(orgnr).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const age = Date.now() - Date.parse(data.updatedAt || '');
    if (!Number.isFinite(age) || age < 0 || age > CACHE_MS) return null;
    if (!Array.isArray(data.years) || !data.years.length) return null;
    if (latest?.aar && !data.years.some((row) => Number(row.aar) === Number(latest.aar))) return null;
    return {
      years: data.years,
      copies: Array.isArray(data.copies) ? data.copies : null,
    };
  } catch {
    return null;
  }
}

async function writeCache(orgnr, years, copies) {
  try {
    await (await db()).collection('publicAccountSeries').doc(orgnr).set({
      years: packYears(years),
      copies: [...new Set((copies || []).map((year) => Number(year)).filter((year) => Number.isFinite(year)))],
      updatedAt: new Date().toISOString(),
      source: 'regnskapsregisteret',
    });
  } catch {
    // Cache er et tillegg. Serien er allerede lest.
  }
}

async function readCopy(id, year, latest, fetchImpl, worker) {
  const pdf = await readPdf(
    `https://data.brreg.no/regnskapsregisteret/regnskap/aarsregnskap/kopi/${id}/${year}`,
    fetchImpl,
  );
  if (!pdf) return { year, rows: [], missing: true };
  const read = await ocrAccountPdf(pdf, worker);
  const positioned = parsePositionedStatement(read.lines);
  const rows = positioned.some((row) => row.driftsinntekter != null)
    ? positioned
    : parseAccountStatement(read.text);
  return { year, rows: acceptCopyYears(latest, rows), missing: !rows.some((row) => row.aar === year) };
}

export async function buildAccountHistory(orgnr, { fetchImpl = fetch, useCache = false, budgetMs = 40000 } = {}) {
  const id = String(orgnr || '').replace(/\D/g, '');
  if (id.length !== 9) return null;
  const started = Date.now();
  const latest = shapeAccountPayload(await readJson(`${ACCOUNTS}/${id}`, fetchImpl).catch(() => null));
  const cached = useCache ? await readCache(id, latest) : null;
  const listed = await readJson(
    `https://data.brreg.no/regnskapsregisteret/regnskap/aarsregnskap/kopi/${id}/aar`,
    fetchImpl,
  ).catch(() => null);
  const targets = pickCopyYears(Array.isArray(listed) ? listed : [], latest?.aar);
  const pending = pendingCopyYears(targets, cached?.years, cached?.copies);
  if (!pending.length) return mergeAccountYears(latest, cached?.years || []);
  const worker = await getWorker();
  const found = [];
  const limit = Math.min(Math.max(8000, budgetMs), 40000);
  for (const year of pending) {
    const remaining = limit - (Date.now() - started);
    if (remaining < 8000) break;
    try {
      const result = await Promise.race([
        readCopy(id, year, latest, fetchImpl, worker),
        new Promise((resolve) => setTimeout(() => resolve(null), remaining)),
      ]);
      if (!result) {
        await closeAccountOcr();
        break;
      }
      found.push(result);
    } catch (err) {
      console.error('accountHistory', year, err?.message || err);
      found.push({ year, rows: [], missing: true, rateLimited: !!err?.rateLimited });
      if (err?.rateLimited) break;
    }
  }
  const parsed = found.flatMap((result) => result?.rows || []);
  const knownCopies = Array.isArray(cached?.copies)
    ? cached.copies
    : targets.filter((year) => (cached?.years || []).some((row) => Number(row.aar) === Number(year)));
  const doneCopies = [
    ...knownCopies,
    ...found.filter((result) => result && !result.rateLimited).map((result) => result.year),
  ];
  const complete = targets.length > 0 && targets.every((year) => doneCopies.some((copy) => Number(copy) === Number(year)));
  const merged = mergeAccountYears(latest, [...(cached?.years || []), ...parsed]);
  if (useCache && merged?.years?.length > 1 && (complete || found.length > 0 || Date.now() - started > limit)) {
    await writeCache(id, merged.years, doneCopies);
  }
  return merged;
}
