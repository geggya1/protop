/**
 * Slå sammen flere crop-ede dokumentsider til ett bilde.
 * Stables vertikalt — samme idé som flerside-skann i regnskapsapper.
 */

import { readPickedBlob } from './documentScanCrop.js';

const MAX_EDGE = 1800;
const GAP = 12;
const BG = '#ffffff';

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      reject(new Error('merge-unavailable'));
      return;
    }
    const uri = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ img, uri, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    };
    img.onerror = () => {
      try { URL.revokeObjectURL(uri); } catch { /* ignore */ }
      reject(new Error('merge-image-load'));
    };
    img.src = uri;
  });
}

/**
 * @param {Array<{ blob?: Blob, uri?: string, name?: string }>} pages
 * @param {{ maxEdge?: number, quality?: number, name?: string }} [opts]
 * @returns {Promise<{ uri: string, blob: Blob, name: string, mimeType: string, size: number, width: number, height: number, pageCount: number, revoke: boolean }>}
 */
export async function mergeDocumentPages(pages, {
  maxEdge = MAX_EDGE,
  quality = 0.9,
  name = 'dokument.jpg',
} = {}) {
  const list = Array.isArray(pages) ? pages.filter(Boolean) : [];
  if (list.length < 2) {
    throw new Error('merge-needs-two-pages');
  }
  if (typeof document === 'undefined') {
    throw new Error('merge-unavailable');
  }

  const loaded = [];
  try {
    for (const page of list) {
      const blob = await readPickedBlob(page);
      if (!blob) continue;
      loaded.push(await loadImageFromBlob(blob));
    }
    if (loaded.length < 2) throw new Error('merge-needs-two-pages');

    const scales = loaded.map((p) => {
      const edge = Math.max(p.width, p.height, 1);
      return Math.min(1, maxEdge / edge);
    });
    const widths = loaded.map((p, i) => Math.max(1, Math.round(p.width * scales[i])));
    const heights = loaded.map((p, i) => Math.max(1, Math.round(p.height * scales[i])));
    const canvasW = Math.max(...widths);
    const canvasH = heights.reduce((sum, h) => sum + h, 0) + GAP * (loaded.length - 1);

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvasW, canvasH);

    let y = 0;
    loaded.forEach((p, i) => {
      const w = widths[i];
      const h = heights[i];
      const x = Math.round((canvasW - w) / 2);
      ctx.drawImage(p.img, x, y, w, h);
      y += h + GAP;
    });

    const outBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('merge-encode'))),
        'image/jpeg',
        quality,
      );
    });

    let outUri = null;
    if (typeof URL !== 'undefined') {
      try { outUri = URL.createObjectURL(outBlob); } catch { /* ignore */ }
    }

    return {
      uri: outUri,
      blob: outBlob,
      name: String(name || 'dokument.jpg').replace(/\.[^.]+$/, '') + '.jpg',
      mimeType: 'image/jpeg',
      size: outBlob.size || 0,
      width: canvasW,
      height: canvasH,
      pageCount: loaded.length,
      revoke: !!outUri,
      merged: true,
    };
  } finally {
    loaded.forEach((p) => {
      try { URL.revokeObjectURL(p.uri); } catch { /* ignore */ }
    });
  }
}

export function canMergeDocumentPages() {
  return typeof document !== 'undefined';
}
