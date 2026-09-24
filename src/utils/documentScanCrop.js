/**
 * Delte hjelpere for TurboScan-stil crop ved opplasting av
 * kvitteringer / bilag / dokumentbilder (gjenbruker barnetegning-pipeline).
 */

import { processDrawingImage } from './drawingImageProcess.js';

const IMAGE_EXT = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff',
]);

/**
 * @param {{ mimeType?: string, name?: string, type?: string }|null} picked
 */
export function isImageUpload(picked) {
  if (!picked) return false;
  const mime = String(picked.mimeType || picked.type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  if (mime && mime !== 'application/octet-stream') return false;
  const name = String(picked.name || picked.uri || '');
  const ext = name.split('.').pop()?.toLowerCase()?.split('?')[0] || '';
  return IMAGE_EXT.has(ext);
}

/** Web/canvas er tilgjengelig for auto-ramme + perspektiv-warp. */
export function canInteractiveScanCrop() {
  return typeof document !== 'undefined';
}

/**
 * Les blob fra pick (uri/blob/File).
 * @param {{ blob?: Blob, uri?: string, file?: File }|Blob|File} picked
 */
export async function readPickedBlob(picked) {
  if (!picked) return null;
  if (typeof Blob !== 'undefined' && picked instanceof Blob) return picked;
  if (picked.blob) return picked.blob;
  if (picked.file && typeof Blob !== 'undefined' && picked.file instanceof Blob) {
    return picked.file;
  }
  const uri = typeof picked === 'string' ? picked : picked.uri;
  if (!uri) return null;
  const res = await fetch(uri);
  if (!res.ok) throw new Error('Kunne ikke lese bildet');
  return res.blob();
}

function jpegName(name) {
  const base = String(name || 'dokument')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w.\-()+ ]/g, '_')
    || 'dokument';
  return `${base}.jpg`;
}

/**
 * Kjør perspektiv-/papircrop og returner en ny pick klar for opplasting.
 * @param {{ blob?: Blob, uri?: string, name?: string, mimeType?: string }} picked
 * @param {{ cropQuad?: object, cropRect?: object, autoCrop?: boolean }} [opts]
 */
export async function applyDocumentScanCrop(picked, {
  cropQuad = null,
  cropRect = null,
  autoCrop = true,
} = {}) {
  const srcBlob = await readPickedBlob(picked);
  if (!srcBlob) throw new Error('Mangler bilde');

  if (!canInteractiveScanCrop()) {
    // Native uten canvas: last opp original.
    return {
      ...picked,
      blob: srcBlob,
      uri: picked?.uri || null,
      mimeType: picked?.mimeType || srcBlob.type || 'image/jpeg',
      size: srcBlob.size,
      name: picked?.name || 'dokument.jpg',
    };
  }

  const processed = await processDrawingImage(srcBlob, {
    autoCrop: !cropQuad && !cropRect ? autoCrop : false,
    cropQuad,
    cropRect,
    displayEdge: 2400,
    quality: 0.92,
  });

  const outBlob = processed.displayBlob || srcBlob;
  let outUri = null;
  if (typeof URL !== 'undefined') {
    try { outUri = URL.createObjectURL(outBlob); } catch { /* ignore */ }
  }

  return {
    uri: outUri,
    blob: outBlob,
    name: jpegName(picked?.name),
    mimeType: 'image/jpeg',
    size: outBlob.size || 0,
    width: processed.width || 0,
    height: processed.height || 0,
    revoke: !!outUri,
    cropped: true,
  };
}
