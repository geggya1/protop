/**
 * Kvitteringsbilde før opplasting og tolking.
 *
 * Nett (også mobilnettleseren): bildet leses rett vei opp, beskjæres til kvitteringen og gjøres
 * om til et rent skann (skygger jevnes ut, teksten blir mørkere og skarpere, se documentScan i
 * src/economy/receiptImage.js). Ved siden av lages et fargebilde av samme utsnitt. Begge lastes opp:
 * skannet er bilaget, fargebildet er reserve når noe har farge (logo, stempel).
 * Store bilder (mange MB, 48 MP) leses nedskalert, så telefonen ikke går tom for minne.
 *
 * App: expo-image-manipulator skalerer og komprimerer fargebildet. Serveren lager skannet.
 * PDF og bilder nettleseren ikke kan lese (HEIC på PC), lastes opp som de er og tolkes på serveren.
 */
import { Image, Platform } from 'react-native';
import {
  documentScan,
  findDocumentBox,
  fitSize,
  luminance,
  scanSize,
} from '../economy/receiptImage.js';

const SCAN_QUALITY = 0.9;
const COLOR_QUALITY = 0.85;
const COLOR_MAX_SIDE = 2000;
const NATIVE_MAX_SIDE = 3200;
const ANALYSIS_SIDE = 240;
// Bredde når et bilde er for stort til å leses i fullt format.
const DECODE_MAX_SIDE = 5000;
// Største fil som lastes opp. Serveren leser opptil 40 MB.
export const MAX_RECEIPT_BYTES = 40 * 1024 * 1024;

export const RECEIPT_ACCEPT = 'image/*,application/pdf,.pdf,.heic,.heif';

function isPdf(picked) {
  return /pdf/i.test(String(picked?.mimeType || picked?.blob?.type || ''))
    || /\.pdf$/i.test(String(picked?.name || ''));
}

function baseName(picked, fallback) {
  const raw = String(picked?.name || picked?.uri?.split('/').pop() || fallback);
  return raw.replace(/[^\w.\-æøåÆØÅ ]+/g, '_').slice(0, 80) || fallback;
}

/**
 * Sti for en kvitteringsfil. Den ansattes uid står i stien, så serveren bare tolker filer
 * personen selv har lastet opp. Samme mappe og tilgang som kvitteringene i kjøreboken.
 */
export function receiptStoragePath(companyId, uid, name) {
  const safe = String(name || 'kvittering.jpg').replace(/[^\w.-]+/g, '_').slice(-60);
  const who = String(uid || 'ukjent').replace(/[^\w-]+/g, '_');
  return `families/${companyId || 'personal'}/mileage/utlegg/${who}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`;
}

async function readBlob(picked) {
  if (picked?.blob) return picked.blob;
  if (!picked?.uri) throw new Error('Kunne ikke lese filen.');
  const response = await fetch(picked.uri);
  return response.blob();
}

// Lar telefonen tegne spinneren mellom de tunge stegene.
function breathe() {
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

async function decodeImage(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch { /* for stort eller ukjent: prøv nedskalert */ }
    try {
      // Svært store bilder (48 MP) kan feile i fullt format på telefon. Les dem nedskalert.
      return await createImageBitmap(blob, { imageOrientation: 'from-image', resizeWidth: DECODE_MAX_SIDE, resizeQuality: 'high' });
    } catch { /* prøv bildeelement */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    // DOM-bildet, ikke React Native-komponenten med samme navn.
    const img = new globalThis.Image();
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

function toJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Kunne ikke lagre bildet.'))), 'image/jpeg', quality);
  });
}

/** Utsnittet med kvitteringen, som andeler av bildet (hele bildet når den ikke finnes). */
function documentArea(bitmap, width, height) {
  const small = fitSize(width, height, ANALYSIS_SIDE);
  const ctx = canvasOf(small.width, small.height).getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, small.width, small.height);
  const lum = luminance(ctx.getImageData(0, 0, small.width, small.height).data, small.width, small.height);
  return findDocumentBox(lum, small.width, small.height);
}

async function prepareWebImage(picked, { crop }) {
  const blob = await readBlob(picked);
  let bitmap;
  try {
    bitmap = await decodeImage(blob);
  } catch {
    // Nettleseren kan ikke lese formatet (HEIC på PC): serveren tolker originalen.
    return { kind: 'original', blob, mimeType: blob.type || 'image/heic', previewUri: '', cropped: false, enhanced: false };
  }
  const width = bitmap.width || bitmap.naturalWidth;
  const height = bitmap.height || bitmap.naturalHeight;
  const box = crop ? documentArea(bitmap, width, height) : null;
  const sx = box ? Math.round(box.x * width) : 0;
  const sy = box ? Math.round(box.y * height) : 0;
  const sw = box ? Math.round(box.w * width) : width;
  const sh = box ? Math.round(box.h * height) : height;
  await breathe();

  // Fargebilde av utsnittet.
  const colorSize = fitSize(sw, sh, COLOR_MAX_SIDE);
  const colorCanvas = canvasOf(colorSize.width, colorSize.height);
  const colorCtx = colorCanvas.getContext('2d');
  colorCtx.fillStyle = '#fff';
  colorCtx.fillRect(0, 0, colorSize.width, colorSize.height);
  colorCtx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, colorSize.width, colorSize.height);
  const color = await toJpeg(colorCanvas, COLOR_QUALITY);
  await breathe();

  // Skannet: høy oppløsning, svart-hvitt, utjevnet lys og mørkere tekst.
  const size = scanSize(sw, sh);
  const canvas = canvasOf(size.width, size.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, size.width, size.height);
  if (typeof bitmap.close === 'function') bitmap.close();
  const image = ctx.getImageData(0, 0, size.width, size.height);
  const scanned = documentScan(luminance(image.data, size.width, size.height), size.width, size.height);
  const px = image.data;
  for (let i = 0, p = 0; p < scanned.length; i += 4, p += 1) {
    px[i] = scanned[p];
    px[i + 1] = scanned[p];
    px[i + 2] = scanned[p];
    px[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  await breathe();
  const scan = await toJpeg(canvas, SCAN_QUALITY);
  return {
    kind: 'scan',
    blob: scan,
    mimeType: 'image/jpeg',
    color,
    previewUri: URL.createObjectURL(scan),
    colorPreviewUri: URL.createObjectURL(color),
    cropped: !!box,
    enhanced: true,
    width: size.width,
    height: size.height,
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
  const longest = size ? Math.max(size.width, size.height) : NATIVE_MAX_SIDE + 1;
  const resize = longest > NATIVE_MAX_SIDE
    ? [{ resize: !size || size.width >= size.height ? { width: NATIVE_MAX_SIDE } : { height: NATIVE_MAX_SIDE } }]
    : [];
  const out = await manipulate(picked.uri, resize, { compress: 0.9, format });
  // Serveren beskjærer og lager skannet fra dette fargebildet.
  return {
    kind: 'color',
    uri: out.uri,
    blob: null,
    mimeType: 'image/jpeg',
    previewUri: out.uri,
    cropped: false,
    enhanced: false,
    width: out.width,
    height: out.height,
  };
}

/**
 * Gjør en valgt fil klar for opplasting og tolking.
 * kind: 'scan' (nett: skann + fargebilde), 'color' (app: serveren lager skannet),
 * 'original' (PDF eller format nettleseren ikke leser: tolkes på serveren).
 * crop: false gir hele bildet (når den ansatte vil ha originalutsnittet).
 */
export async function prepareReceipt(picked, { crop = true } = {}) {
  if (!picked) throw new Error('Ingen fil valgt.');
  const size = Number(picked.size || picked.blob?.size || 0);
  if (size > MAX_RECEIPT_BYTES && (isPdf(picked) || Platform.OS !== 'web')) {
    throw new Error(`Filen er ${Math.round(size / 1048576)} MB. Største fil er ${MAX_RECEIPT_BYTES / 1048576} MB.`);
  }
  if (isPdf(picked)) {
    return {
      kind: 'original',
      name: baseName(picked, 'kvittering.pdf'),
      mimeType: 'application/pdf',
      blob: picked.blob || null,
      uri: picked.uri || '',
      previewUri: '',
      cropped: false,
      enhanced: false,
      pdf: true,
    };
  }
  const stem = baseName(picked, 'kvittering').replace(/\.(heic|heif|png|webp|jpe?g)$/i, '') || 'kvittering';
  const ready = Platform.OS === 'web'
    ? await prepareWebImage(picked, { crop })
    : await prepareNativeImage(picked);
  if (ready.kind === 'original') {
    if (size > MAX_RECEIPT_BYTES) throw new Error(`Bildet er ${Math.round(size / 1048576)} MB. Største fil er ${MAX_RECEIPT_BYTES / 1048576} MB.`);
    return { ...ready, name: baseName(picked, 'kvittering'), pdf: false };
  }
  return { ...ready, name: `${stem}.jpg`, colorName: `${stem}-farge.jpg`, pdf: false };
}
