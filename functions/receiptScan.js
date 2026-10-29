/**
 * Kvitteringsskann på serveren, for bilder appen ikke har behandlet selv (appen på telefonen,
 * store originaler). Samme beskjæring og skann som i nettleseren (src/economy/receiptImage.js).
 *
 * @napi-rs/canvas følger med pdfjs-dist. Mangler den, sendes bildet som det er.
 */
import {
  documentScan,
  findDocumentBox,
  fitSize,
  luminance,
  scanSize,
} from '../src/economy/receiptImage.js';

let canvasModule;

async function canvasLib() {
  if (canvasModule === undefined) {
    try {
      canvasModule = await import('@napi-rs/canvas');
    } catch {
      canvasModule = null;
    }
  }
  return canvasModule;
}

/** Bildetyper canvas kan lese. HEIC og PDF går til AI-en som de er. */
export function scannableMime(mime) {
  return /^image\/(jpeg|jpg|png|webp)$/i.test(String(mime || ''));
}

/**
 * Lager skann (svart-hvitt, høy oppløsning) og fargebilde (2000 px) av et kvitteringsbilde.
 * Gir null når bildet ikke kan leses. { scan: Buffer, color: Buffer, cropped, width, height }
 */
export async function scanReceiptImage(buffer) {
  const lib = await canvasLib();
  if (!lib) return null;
  let img;
  try {
    img = await lib.loadImage(buffer);
  } catch {
    return null;
  }
  const width = img.width;
  const height = img.height;
  if (!width || !height) return null;

  const small = fitSize(width, height, 240);
  const probe = lib.createCanvas(small.width, small.height);
  const probeCtx = probe.getContext('2d');
  probeCtx.drawImage(img, 0, 0, small.width, small.height);
  const box = findDocumentBox(
    luminance(probeCtx.getImageData(0, 0, small.width, small.height).data, small.width, small.height),
    small.width,
    small.height,
  );
  const sx = box ? Math.round(box.x * width) : 0;
  const sy = box ? Math.round(box.y * height) : 0;
  const sw = box ? Math.round(box.w * width) : width;
  const sh = box ? Math.round(box.h * height) : height;

  const colorSize = fitSize(sw, sh, 2000);
  const colorCanvas = lib.createCanvas(colorSize.width, colorSize.height);
  const colorCtx = colorCanvas.getContext('2d');
  colorCtx.fillStyle = '#fff';
  colorCtx.fillRect(0, 0, colorSize.width, colorSize.height);
  colorCtx.drawImage(img, sx, sy, sw, sh, 0, 0, colorSize.width, colorSize.height);
  const color = await colorCanvas.encode('jpeg', 85);

  const size = scanSize(sw, sh);
  const canvas = lib.createCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size.width, size.height);
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
  const scan = await canvas.encode('jpeg', 90);
  return { scan, color, cropped: !!box, width: size.width, height: size.height };
}
