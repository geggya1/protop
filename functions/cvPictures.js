/**
 * Henter profilbilde og prosjektbilder fra en CV-PDF.
 * Logoer som er mye bredere enn de er høye, tas ikke med.
 */
import { PNG } from 'pngjs';
import { assignProjectImages } from '../src/employees/cvPictures.js';
import { CV_PDF_PAGES } from './documentText.js';

const SKIP_TITLE = /^(curriculum vitae|profil|oppsummering|utdanning|sertifiseringer|kurs|erfaringer|referanseprosjekter|prosjekter|arbeidsoppgaver)$/i;
const MAX_URL = 520000;

function waitForImage(page, name) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000);
    page.objs.get(name, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function multiply(left, right) {
  const [a, b, c, d, e, f] = right;
  const [A, B, C, D, E, F] = left;
  return [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
}

function toPng(img, maxEdge) {
  const srcW = img?.width || 0;
  const srcH = img?.height || 0;
  const raw = img?.data;
  if (!srcW || !srcH || !raw?.length) return null;
  if (raw[0] === 0xff && raw[1] === 0xd8 && raw.length <= 400000) {
    return Buffer.from(raw);
  }
  const pixels = srcW * srcH;
  const channels = raw.length >= pixels * 4 ? 4 : raw.length >= pixels * 3 ? 3 : 0;
  if (!channels) return null;
  const edge = Math.max(srcW, srcH);
  const factor = edge > maxEdge ? edge / maxEdge : 1;
  const width = Math.max(1, Math.round(srcW / factor));
  const height = Math.max(1, Math.round(srcH / factor));
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(srcH - 1, Math.floor((y + 0.5) * factor));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(srcW - 1, Math.floor((x + 0.5) * factor));
      const src = (sy * srcW + sx) * channels;
      const dst = (y * width + x) * 4;
      png.data[dst] = raw[src];
      png.data[dst + 1] = channels === 1 ? raw[src] : raw[src + 1];
      png.data[dst + 2] = channels === 1 ? raw[src] : raw[src + 2];
      png.data[dst + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function dataUrl(img) {
  for (const edge of [480, 320, 200]) {
    const bytes = toPng(img, edge);
    if (!bytes) return '';
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      const url = `data:image/jpeg;base64,${bytes.toString('base64')}`;
      if (url.length <= MAX_URL) return url;
    }
    const url = `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
    if (url.length <= MAX_URL) return url;
  }
  return '';
}

function isLogo(width, height) {
  if (!width || !height) return true;
  if (height < 36) return true;
  return width / height > 2.8;
}

async function pageShots(page, OPS) {
  const content = await page.getTextContent().catch(() => null);
  const titles = [];
  for (const item of content?.items || []) {
    const value = String(item?.str || '').replace(/\s+/g, ' ').trim();
    if (!value || value.length < 8 || (item.height || 0) < 11) continue;
    if (SKIP_TITLE.test(value.replace(/:$/, ''))) continue;
    titles.push({ y: item.transform?.[5] || 0, text: value });
  }
  const ops = await page.getOperatorList();
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const images = [];
  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm.slice());
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = multiply(ctm, args);
    if (fn !== OPS.paintImageXObject && fn !== OPS.paintJpegXObject && fn !== OPS.paintInlineImageXObject) continue;
    const arg = args?.[0];
    const img = arg && typeof arg === 'object' ? arg : await waitForImage(page, arg);
    const drawnW = Math.abs(ctm[0]);
    const drawnH = Math.abs(ctm[3]);
    if (isLogo(drawnW, drawnH) || isLogo(img?.width, img?.height)) continue;
    images.push({ y: ctm[5] || 0, img });
  }
  images.sort((a, b) => b.y - a.y);
  const shots = [];
  const seen = new Set();
  for (const image of images) {
    const above = titles
      .filter((title) => title.y >= image.y - 30)
      .sort((a, b) => a.y - b.y);
    const closest = above[0];
    if (!closest) continue;
    const cluster = titles
      .filter((title) => title.y >= closest.y && title.y <= closest.y + 24)
      .sort((a, b) => b.y - a.y);
    const head = cluster.find((title) => !/^[a-zæøå(/[]/.test(title.text) && !/-$/.test(title.text)) || cluster[0];
    const hint = head?.text || '';
    if (!hint || seen.has(hint)) continue;
    const url = dataUrl(image.img);
    if (!url) continue;
    seen.add(hint);
    shots.push({ titleHint: hint, dataUrl: url });
  }
  return shots;
}

export async function extractCvPictures(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (buf.length < 100) return { photo: '', shots: [] };
  let doc;
  let OPS;
  try {
    const loaded = await import('pdfjs-dist/legacy/build/pdf.mjs');
    OPS = loaded.OPS;
    doc = await loaded.getDocument({
      data: new Uint8Array(buf),
      isEvalSupported: false,
      disableFontFace: true,
    }).promise;
  } catch {
    return { photo: '', shots: [] };
  }
  let photo = '';
  const shots = [];
  try {
    const pages = Math.min(doc.numPages || 0, CV_PDF_PAGES);
    for (let pageNo = 1; pageNo <= pages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const found = await pageShots(page, OPS);
      if (pageNo === 1) {
        photo = found.sort((a, b) => b.y - a.y)[0]?.dataUrl || photo;
        continue;
      }
      shots.push(...found);
    }
  } catch {
    // Bildene er et tillegg. Teksten skal likevel kunne leses.
  } finally {
    try {
      await doc.destroy?.();
    } catch {
      // ignore
    }
  }
  return { photo, shots };
}

export function withCvPictures(cv, pictures) {
  const photo = pictures?.photo || '';
  const projects = assignProjectImages(cv?.projects, pictures?.shots);
  return {
    ...cv,
    photo: photo || cv?.photo || '',
    projects,
  };
}
