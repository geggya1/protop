/**
 * Regenerate Expo + PWA icon assets from assets/weekplan-mark-square.png
 * (official Weekplan_symbol_square_transparent_* master, already padded).
 * Run: node scripts/generate-app-icons.js
 * Prefer: node scripts/sync-brand-logo.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const toIco = require('to-ico');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets', 'weekplan-mark-square.png');
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function renderSquare(size, { padding = 0.12, background = WHITE } = {}) {
  const inset = Math.round(size * padding);
  const inner = size - inset * 2;
  const mark = await sharp(SOURCE)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: mark, left: inset, top: inset }])
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

  const outputs = [
    { file: 'assets/icon.png', size: 1024, padding: 0 },
    { file: 'assets/adaptive-icon.png', size: 1024, padding: 0 },
    { file: 'assets/splash-icon.png', size: 1024, padding: 0.14 },
    { file: 'assets/favicon.png', size: 48, padding: 0 },
    { file: 'public/favicon.png', size: 32, padding: 0 },
    { file: 'public/favicon-48.png', size: 48, padding: 0 },
    { file: 'public/icons/icon-192.png', size: 192, padding: 0 },
    { file: 'public/icons/icon-512.png', size: 512, padding: 0 },
    { file: 'public/icons/apple-touch-icon.png', size: 180, padding: 0 },
    // Maskable: keep mark inside ~80% safe zone (Android adaptive / iOS mask).
    { file: 'public/icons/icon-512-maskable.png', size: 512, padding: 0.12 },
  ];

  const buffers = new Map();
  for (const { file, size, padding } of outputs) {
    const buffer = await renderSquare(size, { padding });
    buffers.set(size, buffer);
    await write(path.join(ROOT, file), buffer);
  }

  const ico16 = await renderSquare(16, { padding: 0 });
  const ico = await toIco([ico16, buffers.get(32), buffers.get(48)]);
  await write(path.join(ROOT, 'public', 'favicon.ico'), ico);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
