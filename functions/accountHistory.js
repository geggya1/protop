/**
 * Eldre årsregnskap fra åpne regnskapskopier.
 * Kopiene er skannede PDF-er. Vi leser resultat og balanse og krever at
 * siste år stemmer med nøkkeltall-APIet før serien brukes.
 */
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { createWorker } from 'tesseract.js';
import {
  linesFromWords,
  mergeAccountYears,
  ocrAgrees,
  parseAccountStatement,
  parsePositionedStatement,
  pickCopyYears,
  shapeAccountPayload,
} from '../src/project/accountSeries.js';

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

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('nor', 1, { cachePath }).catch((err) => {
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
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return Buffer.from(bytes);
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
  return PNG.sync.write(png);
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

export async function ocrAccountPdf(buffer) {
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  const worker = await getWorker();
  const parts = [];
  const words = [];
  let yShift = 0;
  try {
    const maxPages = Math.min(doc.numPages || 0, 6);
    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const image = await largestImage(page, OPS);
      const png = image ? bitmapToPng(image) : null;
      if (!png) continue;
      const recognized = await worker.recognize(png);
      parts.push(recognized?.data?.text || '');
      for (const word of recognized?.data?.words || []) {
        const text = String(word?.text || '').trim();
        if (!text) continue;
        words.push({
          text,
          x: ((word.bbox?.x0 || 0) + (word.bbox?.x1 || 0)) / 2,
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
    return data.years;
  } catch {
    return null;
  }
}

async function writeCache(orgnr, years) {
  try {
    await (await db()).collection('publicAccountSeries').doc(orgnr).set({
      years: packYears(years),
      updatedAt: new Date().toISOString(),
      source: 'regnskapsregisteret',
    });
  } catch {
    // Cache er et tillegg. Serien er allerede lest.
  }
}

export async function buildAccountHistory(orgnr, { fetchImpl = fetch, useCache = false, budgetMs = 70000 } = {}) {
  const id = String(orgnr || '').replace(/\D/g, '');
  if (id.length !== 9) return null;
  const latest = shapeAccountPayload(await readJson(`${ACCOUNTS}/${id}`, fetchImpl).catch(() => null));
  if (useCache) {
    const cached = await readCache(id, latest);
    if (cached) return mergeAccountYears(latest, cached);
  }
  const listed = await readJson(
    `https://data.brreg.no/regnskapsregisteret/regnskap/aarsregnskap/kopi/${id}/aar`,
    fetchImpl,
  ).catch(() => null);
  const targets = pickCopyYears(Array.isArray(listed) ? listed : [], latest?.aar);
  const parsed = [];
  const deadline = Date.now() + budgetMs;
  let complete = true;
  for (const year of targets) {
    if (Date.now() > deadline) {
      complete = false;
      break;
    }
    try {
      const pdf = await readPdf(
        `https://data.brreg.no/regnskapsregisteret/regnskap/aarsregnskap/kopi/${id}/${year}`,
        fetchImpl,
      );
      if (!pdf) {
        complete = false;
        continue;
      }
      const read = await ocrAccountPdf(pdf);
      const positioned = parsePositionedStatement(read.lines);
      const rows = positioned.some((row) => row.driftsinntekter != null)
        ? positioned
        : parseAccountStatement(read.text);
      if (!rows.some((row) => row.aar === year)) complete = false;
      parsed.push(...rows);
    } catch (err) {
      complete = false;
      console.error('accountHistory', year, err?.message || err);
      if (err?.rateLimited) break;
    }
  }
  if (latest?.driftsinntekter != null && parsed.length && !ocrAgrees(latest, parsed)) {
    return latest;
  }
  const merged = mergeAccountYears(latest, parsed);
  if (useCache && complete && merged?.years?.length > (latest?.years?.length || 0)) {
    await writeCache(id, merged.years);
  }
  return merged;
}
