#!/usr/bin/env node
/**
 * Generate thumb / medium / full JPEG variants for heavy startup images.
 * Original PNGs stay untouched until callers switch requires (then can be removed).
 *
 * Usage:
 *   node scripts/generate-responsive-images.mjs
 *   node scripts/generate-responsive-images.mjs --roots assets/home-banners
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SIZES = {
  thumb: { width: 480, quality: 70 },
  medium: { width: 1080, quality: 80 },
  full: { width: 1600, quality: 85 },
};

const DEFAULT_ROOTS = [
  'assets/home-banners',
  'assets/dashboard-art',
  'assets/child-dashboard-art',
  'assets/child-dashboard-themes',
  'assets/dashboard-themes',
];

function parseRoots(argv) {
  const idx = argv.indexOf('--roots');
  if (idx >= 0 && argv[idx + 1]) {
    return argv[idx + 1].split(',').map((s) => s.trim()).filter(Boolean);
  }
  return DEFAULT_ROOTS;
}

function listPngs(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_') || entry.name === 'originals') continue;
      out.push(...listPngs(full));
    } else if (/\.png$/i.test(entry.name) && !/\.(thumb|medium|full)\.png$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function variantPath(pngPath, sizeName) {
  return pngPath.replace(/\.png$/i, `.${sizeName}.jpg`);
}

async function generateOne(pngPath) {
  const input = sharp(pngPath).rotate();
  const meta = await input.metadata();
  const results = [];
  for (const [name, cfg] of Object.entries(SIZES)) {
    const outPath = variantPath(pngPath, name);
    const targetW = Math.min(cfg.width, meta.width || cfg.width);
    await sharp(pngPath)
      .rotate()
      .resize({ width: targetW, withoutEnlargement: true })
      .jpeg({ quality: cfg.quality, mozjpeg: true })
      .toFile(outPath);
    const st = fs.statSync(outPath);
    results.push({ name, outPath, bytes: st.size });
  }
  return { pngPath, srcBytes: fs.statSync(pngPath).size, results };
}

async function main() {
  const roots = parseRoots(process.argv).map((r) => path.join(root, r));
  const files = roots.flatMap(listPngs);
  if (!files.length) {
    console.error('No PNG files found under', roots);
    process.exit(1);
  }
  let srcTotal = 0;
  let outTotal = 0;
  console.log(`Generating thumb/medium/full for ${files.length} PNGs…`);
  for (const file of files) {
    const { srcBytes, results } = await generateOne(file);
    srcTotal += srcBytes;
    const variantBytes = results.reduce((n, r) => n + r.bytes, 0);
    outTotal += variantBytes;
    const rel = path.relative(root, file);
    console.log(
      `${rel}: ${(srcBytes / 1024 / 1024).toFixed(2)}MB → `
      + results.map((r) => `${r.name}=${(r.bytes / 1024).toFixed(0)}KB`).join(' '),
    );
  }
  console.log(
    `\nDone. Source PNG ${(srcTotal / 1024 / 1024).toFixed(1)}MB → `
    + `variants ${(outTotal / 1024 / 1024).toFixed(1)}MB `
    + `(bundle will only pack required sizes).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
