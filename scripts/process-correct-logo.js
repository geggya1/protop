#!/usr/bin/env node
/**
 * Build transparent ProTop logo masters from the approved full-color artwork.
 * Removes the white page background without punching the light-gray house interior.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = process.argv[2];
const OUT = path.join(ROOT, 'brand', 'logo');

if (!SRC) {
  console.error('Usage: node scripts/process-correct-logo.js <logo.jpg|png>');
  process.exit(1);
}

function isNearWhite(r, g, b, limit = 245) {
  return r >= limit && g >= limit && b >= limit && Math.max(r, g, b) - Math.min(r, g, b) <= 14;
}

async function toRgba(file) {
  return sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function floodBackground(data, w, h) {
  const seen = new Uint8Array(w * h);
  const q = [];
  const tryPush = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const id = y * w + x;
    if (seen[id]) return;
    const i = id * 4;
    if (!isNearWhite(data[i], data[i + 1], data[i + 2])) return;
    seen[id] = 1;
    q.push(id);
  };
  for (let x = 0; x < w; x++) {
    tryPush(x, 0);
    tryPush(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    tryPush(0, y);
    tryPush(w - 1, y);
  }
  for (let qi = 0; qi < q.length; qi++) {
    const id = q[qi];
    const x = id % w;
    const y = (id / w) | 0;
    data[id * 4 + 3] = 0;
    tryPush(x - 1, y);
    tryPush(x + 1, y);
    tryPush(x, y - 1);
    tryPush(x, y + 1);
  }
  return seen;
}

function houseSplit(data, w, h) {
  const cols = new Uint32Array(w);
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 8 && !isNearWhite(data[i], data[i + 1], data[i + 2])) n++;
    }
    cols[x] = n;
  }
  let seenInk = false;
  for (let x = 0; x < w; x++) {
    if (cols[x] > 40) seenInk = true;
    if (seenInk && cols[x] < 10) return x;
  }
  return Math.round(w * 0.36);
}

function punchWordmarkHoles(data, w, h, splitX, seen) {
  const vis = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const id = y * w + x;
      if (seen[id] || vis[id]) continue;
      const i = id * 4;
      if (data[i + 3] === 0) continue;
      if (!isNearWhite(data[i], data[i + 1], data[i + 2], 248)) continue;
      const stack = [id];
      vis[id] = 1;
      const cells = [];
      let minX = x;
      let maxX = x;
      while (stack.length) {
        const cur = stack.pop();
        cells.push(cur);
        const cx = cur % w;
        const cy = (cur / w) | 0;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        const nbs = [cur - 1, cur + 1, cur - w, cur + w];
        for (const n of nbs) {
          if (n < 0 || n >= w * h) continue;
          if (vis[n] || seen[n]) continue;
          const ni = n * 4;
          if (data[ni + 3] === 0) continue;
          if (!isNearWhite(data[ni], data[ni + 1], data[ni + 2], 248)) continue;
          vis[n] = 1;
          stack.push(n);
        }
      }
      const cx = (minX + maxX) / 2;
      if (cx > splitX) {
        for (const c of cells) data[c * 4 + 3] = 0;
      }
    }
  }
}

function fringeAlpha(data, w, h) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] === 0) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (!isNearWhite(r, g, b, 236)) continue;
      let nextToClear = false;
      if (x > 0 && data[i - 1] === 0) nextToClear = true;
      if (x < w - 1 && data[i + 7] === 0) nextToClear = true;
      if (y > 0 && data[i - w * 4 + 3] === 0) nextToClear = true;
      if (y < h - 1 && data[i + w * 4 + 3] === 0) nextToClear = true;
      if (!nextToClear) continue;
      const m = Math.min(r, g, b);
      const a = Math.max(0, Math.min(255, Math.round((255 - m) * 12)));
      data[i + 3] = a;
    }
  }
}

async function fromRaw(data, w, h) {
  return sharp(Buffer.from(data), { raw: { width: w, height: h, channels: 4 } })
    .trim({ threshold: 0 })
    .png()
    .toBuffer();
}

async function write(rel, buffer) {
  const dest = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buffer);
  const meta = await sharp(buffer).metadata();
  console.log(`Wrote ${rel} ${meta.width}x${meta.height} (${buffer.length} bytes)`);
  return meta;
}

function lastHouseColumn(data, w, h, minX, maxX) {
  const cols = new Uint32Array(maxX - minX + 1);
  for (let x = minX; x <= maxX; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) {
      if (data[(y * w + x) * 4 + 3] >= 16) n++;
    }
    cols[x - minX] = n;
  }
  let x = maxX;
  while (x > minX && cols[x - minX] < 4) x--;
  const blobEnd = x;
  while (x > minX && cols[x - minX] >= 4) x--;
  while (x > minX && cols[x - minX] < 4) x--;
  const blobWidth = blobEnd - (x + 1) + 1;
  if (blobWidth < 24 && x > minX) return x;
  return blobEnd;
}

function opaqueBBox(data, w, h, x0, x1) {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = x0; x < x1; x++) {
      if (data[(y * w + x) * 4 + 3] < 16) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { data, info } = await toRgba(SRC);
  const w = info.width;
  const h = info.height;
  const seen = floodBackground(data, w, h);
  const splitX = houseSplit(data, w, h);
  console.log('house/wordmark split at x=', splitX);
  punchWordmarkHoles(data, w, h, splitX, seen);
  fringeAlpha(data, w, h);

  const fullBuf = await fromRaw(data, w, h);
  const fullMeta = await write('brand/logo/ProTop_logo_transparent_master.png', fullBuf);

  const full2048 = await sharp(fullBuf)
    .resize({ width: 2048, withoutEnlargement: true })
    .png()
    .toBuffer();
  await write('brand/logo/ProTop_logo_transparent_2048px.png', full2048);

  const full1024 = await sharp(fullBuf)
    .resize({ width: 1024, withoutEnlargement: true })
    .png()
    .toBuffer();
  await write('brand/logo/ProTop_logo_transparent_1024px.png', full1024);

  const { data: tdata, info: tinfo } = await sharp(fullBuf).raw().toBuffer({ resolveWithObject: true });
  const tw = tinfo.width;
  const th = tinfo.height;
  // splitX is in source pixels; trim() is a crop, not a scale.
  const trimBox = opaqueBBox(data, w, h, 0, w);
  const split2 = Math.max(8, splitX - trimBox.minX);
  const box = opaqueBBox(tdata, tw, th, 0, Math.min(tw, split2));
  const houseRight = lastHouseColumn(tdata, tw, th, box.minX, box.maxX);
  const pad = 8;
  const left = Math.max(0, box.minX - pad);
  const top = Math.max(0, box.minY - pad);
  const right = Math.min(tw - 1, Math.min(houseRight + 4, split2 - 1));
  const bottom = Math.min(th - 1, box.maxY + pad);
  const width = right - left + 1;
  const height = bottom - top + 1;
  const symbol = await sharp(fullBuf).extract({ left, top, width, height }).png().toBuffer();
  await write('brand/logo/ProTop_symbol_transparent_master.png', symbol);

  const symbol1024 = await sharp(symbol)
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  await write('brand/logo/ProTop_symbol_transparent_1024px.png', symbol1024);

  const sm = await sharp(symbol).metadata();
  const side = Math.max(sm.width, sm.height);
  const squareMaster = await sharp({
    create: {
      width: side,
      height: side,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: symbol,
      left: Math.round((side - sm.width) / 2),
      top: Math.round((side - sm.height) / 2),
    }])
    .png()
    .toBuffer();
  await write('brand/logo/ProTop_symbol_square_transparent_master.png', squareMaster);

  for (const size of [1024, 512, 256]) {
    const sq = await sharp(squareMaster)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await write(`brand/logo/ProTop_symbol_square_transparent_${size}px.png`, sq);
  }

  fs.writeFileSync(
    path.join(OUT, 'README.txt'),
    `WEEKPLAN LOGO — godkjent utgave

Kilde: brand/logo/ProTop_logo_source.jpg
(glatt hus + familie, hvitt inni huset, solide blå bokstaver).
Den pikselerte utgaven med hvit glød i bokstavene og gjennomsiktig hus er feil.

Ikke key ut all hvit: husfyllen skal være ugjennomsiktig.
Regenerer: node scripts/process-correct-logo.js brand/logo/ProTop_logo_source.jpg
Deretter: npm run sync:logo

- ProTop_logo_transparent_master.png: master PNG (${fullMeta.width}×${fullMeta.height})
- ProTop_logo_transparent_2048px.png / 1024px.png: web
- ProTop_symbol_transparent_*.png: kun hus-symbolet
- ProTop_symbol_square_transparent_*.png: app-/ikonbruk
`,
  );
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
