/**
 * Build Expo, PWA and store icons from the approved ProTop symbol.
 * Master: brand/ProTop_symbol_square_2048.png (official square, ~15% padding).
 * Run: node scripts/generate-app-icons.js
 * Prefer: node scripts/sync-brand-logo.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const toIco = require('to-ico');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'brand', 'ProTop_symbol_square_2048.png');
const WHITE_LOCKUP = path.join(ROOT, 'brand', 'ProTop_logo_white_transparent.png');
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const NAVY = { r: 7, g: 39, b: 76, alpha: 1 };

/** Opaque content of the square master is ~72.4% of the canvas. */
const MASTER_CONTENT = 0.724;
/** Android adaptive and maskable icons keep artwork inside the center 66%. */
const SAFE_ZONE = 0.66;

async function masterSquare(size) {
  return sharp(SOURCE).resize(size, size, { fit: 'fill' }).png().toBuffer();
}

async function opaqueIcon(size) {
  const resized = await masterSquare(size);
  return sharp(resized).flatten({ background: WHITE }).removeAlpha().png().toBuffer();
}

async function safeZoneIcon(size, { opaque = false } = {}) {
  const inner = Math.round(size * (SAFE_ZONE / MASTER_CONTENT));
  const mark = await masterSquare(inner);
  const left = Math.round((size - inner) / 2);
  let image = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: opaque ? WHITE : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{ input: mark, left, top: left }]);
  if (opaque) image = image.flatten({ background: WHITE }).removeAlpha();
  return image.png().toBuffer();
}

async function notificationGlyph(size) {
  const { data, info } = await sharp(SOURCE)
    .resize(size, size, { fit: 'fill' })
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
  const ico = await toIco([ico16, bySize.get(32), bySize.get(48)]);
  await write(path.join(ROOT, 'public/favicon.ico'), ico);
  await write(path.join(ROOT, 'favicon.ico'), ico);
  await write(path.join(ROOT, 'icons/favicon.ico'), ico);

  await write(path.join(ROOT, 'public/og-image.png'), await ogImage());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
