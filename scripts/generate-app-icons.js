/**
 * Build Expo, PWA and store icons from the ProTop mark without the Digi
 * watermark (that word is not the product name and showed up on the tab
 * and iPhone home-screen icon).
 * Master: brand/ProTop_symbol_transparent.png
 * Run: node scripts/generate-app-icons.js
 * Prefer: node scripts/sync-brand-logo.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const toIco = require('to-ico');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'brand', 'ProTop_symbol_transparent.png');
const WHITE_LOCKUP = path.join(ROOT, 'brand', 'ProTop_logo_white_transparent.png');
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const NAVY = { r: 7, g: 39, b: 76, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const SAFE_ZONE = 0.66;

let cleanMarkCache;

function isInk(data, i) {
  const a = data[i + 3];
  if (a < 16) return false;
  return !(data[i] > 248 && data[i + 1] > 248 && data[i + 2] > 248);
}

/** Drop the small Digi letters that sit bottom-right of the symbol file. */
async function cleanMark() {
  if (cleanMarkCache) return cleanMarkCache;
  const { data, info } = await sharp(SOURCE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  const ink = new Uint8Array(n);
  for (let p = 0; p < n; p++) ink[p] = isInk(data, p * 4) ? 1 : 0;
  const label = new Int32Array(n).fill(-1);
  const sizes = [];
  const cx = [];
  const cy = [];
  let cid = 0;
  const neigh = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let p = 0; p < n; p++) {
    if (!ink[p] || label[p] !== -1) continue;
    let sz = 0;
    let sx = 0;
    let sy = 0;
    const stack = [p];
    label[p] = cid;
    while (stack.length) {
      const cur = stack.pop();
      const x = cur % w;
      const y = (cur / w) | 0;
      sz += 1;
      sx += x;
      sy += y;
      for (const [dx, dy] of neigh) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (ink[q] && label[q] === -1) {
          label[q] = cid;
          stack.push(q);
        }
      }
    }
    sizes.push(sz);
    cx.push(sx / sz);
    cy.push(sy / sz);
    cid += 1;
  }
  const largest = Math.max(0, ...sizes);
  const drop = new Set();
  for (let i = 0; i < sizes.length; i++) {
    if (sizes[i] < largest * 0.15 && cx[i] > w * 0.55 && cy[i] > h * 0.72) drop.add(i);
  }
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let p = 0; p < n; p++) {
    if (drop.has(label[p])) {
      data[p * 4 + 3] = 0;
      continue;
    }
    if (!ink[p] || drop.has(label[p])) continue;
    const x = p % w;
    const y = (p / w) | 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const buf = Buffer.from(data);
  cleanMarkCache = await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
    .extract({
      left: minX,
      top: minY,
      width: Math.max(1, maxX - minX + 1),
      height: Math.max(1, maxY - minY + 1),
    })
    .png()
    .toBuffer();
  return cleanMarkCache;
}

async function placeMark(size, { padding = 0.12, opaque = true } = {}) {
  const inner = Math.max(1, Math.round(size * (1 - 2 * padding)));
  const mark = await sharp(await cleanMark())
    .resize(inner, inner, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();
  const meta = await sharp(mark).metadata();
  const left = Math.round((size - (meta.width || inner)) / 2);
  const top = Math.round((size - (meta.height || inner)) / 2);
  let image = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: opaque ? WHITE : TRANSPARENT,
    },
  }).composite([{ input: mark, left, top }]);
  if (opaque) image = image.flatten({ background: WHITE }).removeAlpha();
  return image.png().toBuffer();
}

async function opaqueIcon(size) {
  const padding = size <= 48 ? 0.08 : 0.12;
  return placeMark(size, { padding, opaque: true });
}

async function safeZoneIcon(size, { opaque = false } = {}) {
  return placeMark(size, { padding: (1 - SAFE_ZONE) / 2, opaque });
}

async function notificationGlyph(size) {
  const { data, info } = await sharp(await cleanMark())
    .resize(size, size, { fit: 'contain', background: TRANSPARENT })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function ogImage() {
  const width = 1200;
  const height = 630;
  const logo = await sharp(WHITE_LOCKUP)
    .resize({ width: width - 180, height: height - 160, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const meta = await sharp(logo).metadata();
  const left = Math.round((width - meta.width) / 2);
  const top = Math.round((height - meta.height) / 2);
  return sharp({
    create: { width, height, channels: 4, background: NAVY },
  })
    .composite([{ input: logo, left, top }])
    .png()
    .toBuffer();
}

async function write(filePath, buffer) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  console.log(`Wrote ${path.relative(ROOT, filePath)} (${buffer.length} bytes)`);
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Missing source mark: ${SOURCE}`);
    process.exit(1);
  }

  const icon1024 = await opaqueIcon(1024);
  await write(path.join(ROOT, 'assets/icon.png'), icon1024);
  await write(path.join(ROOT, 'assets/splash-icon.png'), icon1024);
  await write(path.join(ROOT, 'assets/adaptive-icon.png'), await safeZoneIcon(1024));
  await write(path.join(ROOT, 'assets/notification-icon.png'), await notificationGlyph(96));
  await write(path.join(ROOT, 'assets/favicon.png'), await opaqueIcon(48));

  const pngs = [
    ['public/favicon.png', 32],
    ['public/favicon-48.png', 48],
    ['public/icons/icon-192.png', 192],
    ['public/icons/icon-512.png', 512],
    ['public/icons/apple-touch-icon.png', 180],
    ['public/apple-touch-icon.png', 180],
    ['public/apple-touch-icon-precomposed.png', 180],
    ['apple-touch-icon.png', 180],
    ['apple-touch-icon-precomposed.png', 180],
    ['icons/icon-32.png', 32],
    ['icons/icon-180.png', 180],
    ['icons/icon-192.png', 192],
    ['icons/apple-touch-icon.png', 180],
    ['icons/icon-512.png', 512],
  ];
  const bySize = new Map();
  for (const [file, size] of pngs) {
    let buffer = bySize.get(size);
    if (!buffer) {
      buffer = await opaqueIcon(size);
      bySize.set(size, buffer);
    }
    await write(path.join(ROOT, file), buffer);
  }

  const maskable = await safeZoneIcon(512, { opaque: true });
  await write(path.join(ROOT, 'public/icons/icon-512-maskable.png'), maskable);
  await write(path.join(ROOT, 'icons/icon-512-maskable.png'), maskable);

  const ico16 = await opaqueIcon(16);
  // to-ico writes 4 bytes per pixel but steps by the PNG channel count.
  // RGB (no alpha) therefore overlaps into rainbow noise in favicon.ico,
  // which is the icon Chrome shows in the address-bar heading.
  const rgba = (png) => sharp(png).ensureAlpha().png().toBuffer();
  const ico = await toIco([
    await rgba(ico16),
    await rgba(bySize.get(32)),
    await rgba(bySize.get(48)),
  ]);
  await write(path.join(ROOT, 'public/favicon.ico'), ico);
  await write(path.join(ROOT, 'favicon.ico'), ico);
  await write(path.join(ROOT, 'icons/favicon.ico'), ico);

  await write(path.join(ROOT, 'public/og-image.png'), await ogImage());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
