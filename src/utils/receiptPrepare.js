/**
 * Kvitteringsbilde før opplasting og tolking: rett vei opp, beskåret til kvitteringen,
 * skalert ned og med strukket kontrast, så teksten blir skarp for AI-en og regnskapsføreren.
 *
 * Nett (også mobilnettleseren): canvas, med beskjæring og kontrast fra src/economy/receiptImage.js.
 * App: expo-image-manipulator skalerer og komprimerer. Beskjæring gjøres ikke der ennå.
 * PDF sendes som den er.
 */
import { Image, Platform } from 'react-native';
import {
  contrastLevels,
  findDocumentBox,
  fitSize,
  histogram,
  levelsTable,
  luminance,
} from '../economy/receiptImage.js';

export const RECEIPT_MAX_SIDE = 2000;
const QUALITY = 0.85;
const ANALYSIS_SIDE = 240;
// PDF-er over dette tolkes ikke (de lastes opp likevel).
const MAX_OCR_PDF_BYTES = 4 * 1024 * 1024;

export const RECEIPT_ACCEPT = 'image/*,application/pdf,.pdf,.heic,.heif';

function isPdf(picked) {
  return /pdf/i.test(String(picked?.mimeType || picked?.blob?.type || ''))
    || /\.pdf$/i.test(String(picked?.name || ''));
}

function baseName(picked, fallback) {
  const raw = String(picked?.name || picked?.uri?.split('/').pop() || fallback);
  return raw.replace(/[^\w.\-æøåÆØÅ ]+/g, '_').slice(0, 80) || fallback;
}

export function receiptStoragePath(companyId, name) {
  const safe = String(name || 'kvittering.jpg').replace(/[^\w.-]+/g, '_').slice(-60);
  // Samme mappe og tilgang som kvitteringene i kjøreboken: den som lastet opp og økonomi.
  return `families/${companyId || 'personal'}/mileage/utlegg/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Kunne ikke lese filen.'));
    reader.readAsDataURL(blob);
  });
}

async function readBlob(picked) {
  if (picked?.blob) return picked.blob;
  if (!picked?.uri) throw new Error('Kunne ikke lese filen.');
  const response = await fetch(picked.uri);
  return response.blob();
}

async function loadBitmap(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch { /* eldre nettleser */ }
    try {
      return await createImageBitmap(blob);
    } catch { /* prøv bildeelement */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function canvasOf(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Beskjæring og kontrast regnes på et lite utsnitt (240 px). */
function analyse(bitmap, width, height, crop) {
  const small = fitSize(width, height, ANALYSIS_SIDE);
  const canvas = canvasOf(small.width, small.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, small.width, small.height);
  const lum = luminance(ctx.getImageData(0, 0, small.width, small.height).data, small.width, small.height);
  const box = crop ? findDocumentBox(lum, small.width, small.height) : null;
  const area = box || { x: 0, y: 0, w: 1, h: 1 };
  const x0 = Math.floor(area.x * small.width);
  const y0 = Math.floor(area.y * small.height);
  const x1 = Math.ceil((area.x + area.w) * small.width);
  const y1 = Math.ceil((area.y + area.h) * small.height);
  const inside = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) inside.push(lum[y * small.width + x]);
  }
  return { box, levels: contrastLevels(histogram(inside)) };
}

async function prepareWebImage(picked, { crop }) {
  const blob = await readBlob(picked);
  let bitmap;
  try {
    bitmap = await loadBitmap(blob);
  } catch {
    // Nettleseren kan ikke vise formatet (HEIC på PC): send originalen.
    return { blob, mimeType: blob.type || 'image/jpeg', dataUrl: await blobToDataUrl(blob), previewUri: '', cropped: false, enhanced: false };
  }
  const width = bitmap.width || bitmap.naturalWidth;
  const height = bitmap.height || bitmap.naturalHeight;
  const { box, levels } = analyse(bitmap, width, height, crop);
  const sx = box ? Math.round(box.x * width) : 0;
  const sy = box ? Math.round(box.y * height) : 0;
  const sw = box ? Math.round(box.w * width) : width;
  const sh = box ? Math.round(box.h * height) : height;
  const out = fitSize(sw, sh, RECEIPT_MAX_SIDE);
  const canvas = canvasOf(out.width, out.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: !!levels });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, out.width, out.height);
  if (typeof bitmap.close === 'function') bitmap.close();
  if (levels) {
    const table = levelsTable(levels);
    const image = ctx.getImageData(0, 0, out.width, out.height);
    const px = image.data;
    for (let i = 0; i < px.length; i += 4) {
      px[i] = table[px[i]];
      px[i + 1] = table[px[i + 1]];
      px[i + 2] = table[px[i + 2]];
    }
    ctx.putImageData(image, 0, 0);
  }
  const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  if (!jpeg) throw new Error('Kunne ikke lagre bildet.');
  return {
    blob: jpeg,
    mimeType: 'image/jpeg',
    dataUrl: await blobToDataUrl(jpeg),
    previewUri: URL.createObjectURL(jpeg),
    cropped: !!box,
    enhanced: !!levels,
    width: out.width,
    height: out.height,
  };
}

function imageSize(uri) {
  return new Promise((resolve) => {
    if (!Image?.getSize) {
      resolve(null);
      return;
    }
    Image.getSize(uri, (width, height) => resolve({ width, height }), () => resolve(null));
  });
}

async function prepareNativeImage(picked) {
  const mod = await import('expo-image-manipulator');
  const manipulate = mod.manipulateAsync || mod.default?.manipulateAsync;
  const format = (mod.SaveFormat || mod.default?.SaveFormat)?.JPEG || 'jpeg';
  const size = await imageSize(picked.uri);
  const longest = size ? Math.max(size.width, size.height) : RECEIPT_MAX_SIDE + 1;
  const resize = longest > RECEIPT_MAX_SIDE
    ? [{ resize: !size || size.width >= size.height ? { width: RECEIPT_MAX_SIDE } : { height: RECEIPT_MAX_SIDE } }]
    : [];
  const out = await manipulate(picked.uri, resize, { compress: QUALITY, format, base64: true });
  return {
    uri: out.uri,
    blob: null,
    mimeType: 'image/jpeg',
    dataUrl: out.base64 ? `data:image/jpeg;base64,${out.base64}` : '',
    previewUri: out.uri,
    cropped: false,
    enhanced: false,
    width: out.width,
    height: out.height,
  };
}

/**
 * Gjør en valgt fil klar: { name, mimeType, blob|uri, dataUrl (for tolking), previewUri, cropped, enhanced, pdf }.
 * crop: false gir hele bildet (når den ansatte vil ha originalutsnittet).
 */
export async function prepareReceipt(picked, { crop = true } = {}) {
  if (!picked) throw new Error('Ingen fil valgt.');
  if (isPdf(picked)) {
    const blob = await readBlob(picked);
    const dataUrl = blob.size && blob.size <= MAX_OCR_PDF_BYTES ? await blobToDataUrl(blob) : '';
    return {
      name: baseName(picked, 'kvittering.pdf'),
      mimeType: 'application/pdf',
      blob,
      uri: picked.uri || '',
      dataUrl: dataUrl.replace(/^data:[^;]*;/, 'data:application/pdf;'),
      previewUri: '',
      cropped: false,
      enhanced: false,
      pdf: true,
    };
  }
  const name = baseName(picked, 'kvittering.jpg').replace(/\.(heic|heif|png|webp|jpe?g)$/i, '') || 'kvittering';
  const ready = Platform.OS === 'web'
    ? await prepareWebImage(picked, { crop })
    : await prepareNativeImage(picked);
  // Originalen sendes når nettleseren ikke kunne lese den (HEIC på PC). Da beholdes filnavnet.
  return { ...ready, name: ready.mimeType === 'image/jpeg' ? `${name}.jpg` : baseName(picked, 'kvittering'), pdf: false };
}
