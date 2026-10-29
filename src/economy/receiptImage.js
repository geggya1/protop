/**
 * Kvitteringsbilde: finn kvitteringen i bildet, og strekk kontrasten.
 * Rene funksjoner på et lite gråtonebilde (luminans 0–255), så de kan testes uten canvas.
 * src/utils/receiptPrepare.js tegner bildet og bruker resultatet.
 *
 * Kvitteringen er nesten alltid lysere enn bordet den ligger på. Vi deler bildet i lyst og
 * mørkt (Otsu), tar det største sammenhengende lyse feltet og beskjærer til det med litt marg.
 * Er det ingen tydelig forskjell (hvit kvittering på hvitt bord), beskjæres det ikke.
 */

/** Største side blir max. Bildet forstørres aldri. */
export function fitSize(width, height, max) {
  const w = Math.max(1, Math.round(Number(width) || 1));
  const h = Math.max(1, Math.round(Number(height) || 1));
  const scale = Math.min(1, (Number(max) || Math.max(w, h)) / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
}

/** Luminans fra RGBA (ImageData.data). */
export function luminance(rgba, width, height) {
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < out.length; i += 4, p += 1) {
    out[p] = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
  }
  return out;
}

export function histogram(lum) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < lum.length; i += 1) hist[lum[i]] += 1;
  return hist;
}

/** Terskelen som skiller lyst og mørkt best (Otsu). */
export function otsuThreshold(hist) {
  const total = hist.reduce((sum, n) => sum + n, 0);
  if (!total) return 128;
  let sumAll = 0;
  for (let i = 0; i < 256; i += 1) sumAll += i * hist[i];
  let sumBack = 0;
  let weightBack = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t += 1) {
    weightBack += hist[t];
    if (!weightBack) continue;
    const weightFore = total - weightBack;
    if (!weightFore) break;
    sumBack += t * hist[t];
    const meanBack = sumBack / weightBack;
    const meanFore = (sumAll - sumBack) / weightFore;
    const between = weightBack * weightFore * (meanBack - meanFore) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Største sammenhengende felt der mask er sann (4-naboer). Gir antall og ytterkanter. */
function largestComponent(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  let best = null;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top] = start;
    top += 1;
    seen[start] = 1;
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    while (top > 0) {
      top -= 1;
      const p = stack[top];
      const x = p % width;
      const y = (p - x) / width;
      count += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const next = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const q of next) {
        if (q >= 0 && mask[q] && !seen[q]) {
          seen[q] = 1;
          stack[top] = q;
          top += 1;
        }
      }
    }
    if (!best || count > best.count) best = { count, minX, minY, maxX, maxY };
  }
  return best;
}

/**
 * Kvitteringens plass i bildet som andeler (0–1): { x, y, w, h }, eller null når bildet
 * skal stå som det er (ingen tydelig kvittering, eller den fyller allerede bildet).
 */
export function findDocumentBox(lum, width, height, { margin = 0.02 } = {}) {
  if (!lum || !width || !height || lum.length < width * height) return null;
  const threshold = otsuThreshold(histogram(lum));
  const mask = new Uint8Array(width * height);
  let bright = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (lum[i] > threshold) {
      mask[i] = 1;
      bright += 1;
    }
  }
  const share = bright / mask.length;
  // Nesten bare lyst eller bare mørkt: ingen kvittering å skille ut.
  if (share > 0.92 || share < 0.04) return null;
  const part = largestComponent(mask, width, height);
  if (!part || part.count / mask.length < 0.06) return null;
  const boxW = part.maxX - part.minX + 1;
  const boxH = part.maxY - part.minY + 1;
  // Feltet må være kvitteringsformet: fylle det meste av sin egen ramme.
  if (part.count / (boxW * boxH) < 0.45) return null;
  const padX = Math.round(width * margin);
  const padY = Math.round(height * margin);
  const x0 = Math.max(0, part.minX - padX);
  const y0 = Math.max(0, part.minY - padY);
  const x1 = Math.min(width, part.maxX + 1 + padX);
  const y1 = Math.min(height, part.maxY + 1 + padY);
  const box = { x: x0 / width, y: y0 / height, w: (x1 - x0) / width, h: (y1 - y0) / height };
  if (box.w > 0.9 && box.h > 0.9) return null;
  return box;
}

/**
 * Nivåer for kontraststrekk: mørkeste og lyseste prosent settes til svart og hvitt.
 * null når bildet allerede bruker hele skalaen, eller når det er nesten ensfarget.
 */
export function contrastLevels(hist, { clip = 0.01 } = {}) {
  const total = hist.reduce((sum, n) => sum + n, 0);
  if (!total) return null;
  const cut = total * clip;
  let low = 0;
  let acc = 0;
  for (; low < 255; low += 1) {
    acc += hist[low];
    if (acc > cut) break;
  }
  let high = 255;
  acc = 0;
  for (; high > 0; high -= 1) {
    acc += hist[high];
    if (acc > cut) break;
  }
  if (high - low < 24) return null;
  if (low <= 8 && high >= 247) return null;
  return { low, high };
}

/** Oppslagstabell 0–255 for nivåene. */
export function levelsTable({ low, high }) {
  const table = new Uint8ClampedArray(256);
  const span = Math.max(1, high - low);
  for (let v = 0; v < 256; v += 1) table[v] = Math.round(((v - low) / span) * 255);
  return table;
}
