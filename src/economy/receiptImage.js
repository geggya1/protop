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

/**
 * «Skann»: gjør et kvitteringsfoto om til et rent, svart-hvitt dokument.
 * 1. Bakgrunnslyset anslås i ruter (lyseste punkt per rute, glattet), så skygger,
 *    blits og ujevnt lys jevnes ut. Papiret blir hvitt overalt.
 * 2. Hver piksel deles på bakgrunnen. Det som er nesten like lyst som papiret, blir hvitt.
 * 3. Teksten strekkes mot svart og gjøres mørkere (gamma), så blek termotekst blir tydelig.
 * 4. Kantene skjerpes litt (uskarp maske).
 * Inn og ut er gråtoner (0–255) i samme størrelse.
 */
export function documentScan(lum, width, height, {
  white = 0.9,
  gamma = 1.9,
  sharpen = 0.6,
  floor = 0.45,
} = {}) {
  const n = width * height;
  const out = new Uint8ClampedArray(n);
  if (!lum || !width || !height || lum.length < n) return out;
  const block = Math.max(8, Math.round(Math.min(width, height) / 32));
  const bw = Math.ceil(width / block);
  const bh = Math.ceil(height / block);
  // Lyseste punkt per rute (papiret), men ikke under en andel av papiret i hele bildet,
  // så store svarte felt (logo, strek) ikke blir regnet som bakgrunn og bleket.
  const blocks = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by += 1) {
    for (let bx = 0; bx < bw; bx += 1) {
      let max = 0;
      const y1 = Math.min(height, (by + 1) * block);
      const x1 = Math.min(width, (bx + 1) * block);
      for (let y = by * block; y < y1; y += 1) {
        for (let x = bx * block; x < x1; x += 1) {
          const v = lum[y * width + x];
          if (v > max) max = v;
        }
      }
      blocks[by * bw + bx] = max;
    }
  }
  const sorted = Float32Array.from(blocks).sort();
  const paper = Math.max(1, sorted[Math.floor(sorted.length * 0.9)] || 255);
  for (let i = 0; i < blocks.length; i += 1) blocks[i] = Math.max(blocks[i], paper * floor, 1);
  const smooth = boxBlur(boxBlur(blocks, bw, bh, 1), bw, bh, 1);
  // Forholdet til bakgrunnen, interpolert mellom rutene. Kolonnene regnes ut én gang.
  const colX0 = new Int32Array(width);
  const colX1 = new Int32Array(width);
  const colF = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    const gx = Math.min(bw - 1, Math.max(0, (x + 0.5) / block - 0.5));
    colX0[x] = Math.floor(gx);
    colX1[x] = Math.min(bw - 1, colX0[x] + 1);
    colF[x] = gx - colX0[x];
  }
  const ratio = new Float32Array(n);
  const rowBg = new Float32Array(bw);
  for (let y = 0; y < height; y += 1) {
    const gy = Math.min(bh - 1, Math.max(0, (y + 0.5) / block - 0.5));
    const y0 = Math.floor(gy);
    const yb = Math.min(bh - 1, y0 + 1);
    const fy = gy - y0;
    for (let bx = 0; bx < bw; bx += 1) rowBg[bx] = smooth[y0 * bw + bx] * (1 - fy) + smooth[yb * bw + bx] * fy;
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const f = colF[x];
      ratio[row + x] = lum[row + x] / (rowBg[colX0[x]] * (1 - f) + rowBg[colX1[x]] * f);
    }
  }
  // Hvit- og svartpunkt fra papiret og teksten selv (bord og store svarte felt holdes utenfor,
  // forholdet er der under 0,45). Otsu skiller tekst og papir. Hvitpunktet legges mellom
  // skillet og papiret, nær papiret, så også svak tekst (75–90 % av papiret, krøllete eller
  // farget papir) blir med. Svartpunktet er den mørkeste tiendedelen av teksten.
  const sample = [];
  const step = Math.max(1, Math.floor(n / 40000));
  // Papir ved siden av mørke felt kan få forhold over 1 (bakgrunnen er glattet). Det er papir.
  for (let i = 0; i < n; i += step) sample.push(Math.min(1, ratio[i]));
  const lowCut = 0.45;
  const paperish = sample.filter((v) => v > lowCut).sort((a, b) => a - b);
  let whitePoint = white;
  let black = 0;
  if (paperish.length > 50) {
    const bins = new Array(256).fill(0);
    for (const v of paperish) bins[Math.min(255, Math.round(((v - lowCut) / (1 - lowCut)) * 255))] += 1;
    const split = lowCut + (otsuThreshold(bins) / 255) * (1 - lowCut);
    const above = paperish.filter((v) => v > split);
    const below = paperish.filter((v) => v <= split);
    const paperMid = above.length ? above[Math.floor(above.length / 2)] : 1;
    // Uten tydelig tekst (skillet ligger i papiret): faste punkter.
    if (paperMid - split < 0.04 || split > 0.95 || !below.length) {
      whitePoint = white;
      black = sample.sort((a, b) => a - b)[Math.floor(sample.length * 0.02)] || 0;
    } else {
      whitePoint = Math.min(0.97, paperMid - 0.01, split + 0.75 * (paperMid - split));
      black = below[Math.floor(below.length * 0.1)];
    }
  }
  black = Math.max(0, Math.min(black, whitePoint - 0.08));
  const span = Math.max(0.05, whitePoint - black);
  // Kurven som tabell (1024 trinn) i stedet for potens per piksel.
  const steps = 1024;
  const curve = new Float32Array(steps + 1);
  for (let i = 0; i <= steps; i += 1) curve[i] = 255 * (i / steps) ** gamma;
  const flat = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = (ratio[i] - black) / span;
    flat[i] = t <= 0 ? 0 : (t >= 1 ? 255 : curve[Math.round(t * steps)]);
  }
  if (!sharpen) {
    for (let i = 0; i < n; i += 1) out[i] = flat[i];
    return out;
  }
  const blur = boxBlur(flat, width, height, 1);
  for (let i = 0; i < n; i += 1) out[i] = flat[i] + sharpen * (flat[i] - blur[i]);
  return out;
}

/** Boks-uskarphet med radius r (separabel, løpende sum). */
function boxBlur(src, width, height, r) {
  const tmp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    for (let x = 0; x <= Math.min(r, width - 1); x += 1) sum += src[row + x];
    for (let x = 0; x < width; x += 1) {
      const left = x - r;
      const count = Math.min(width - 1, x + r) - Math.max(0, left) + 1;
      tmp[row + x] = sum / count;
      const add = x + r + 1;
      if (add < width) sum += src[row + add];
      if (left >= 0) sum -= src[row + left];
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = 0; y <= Math.min(r, height - 1); y += 1) sum += tmp[y * width + x];
    for (let y = 0; y < height; y += 1) {
      const top = y - r;
      const count = Math.min(height - 1, y + r) - Math.max(0, top) + 1;
      dst[y * width + x] = sum / count;
      const add = y + r + 1;
      if (add < height) sum += tmp[add * width + x];
      if (top >= 0) sum -= tmp[top * width + x];
    }
  }
  return dst;
}

/**
 * Størrelse for skann og tolking: lengste side maks maxSide, men en lang, smal kvittering
 * skal ha minst minShort piksler i bredden (teksten blir ellers for liten). Totalt maks maxPixels.
 */
export function scanSize(width, height, { maxSide = 3600, minShort = 1200, maxPixels = 7_000_000 } = {}) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  let scale = Math.min(1, maxSide / long);
  if (short * scale < minShort) scale = Math.min(1, minShort / short);
  if (w * h * scale * scale > maxPixels) scale = Math.sqrt(maxPixels / (w * h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
}
