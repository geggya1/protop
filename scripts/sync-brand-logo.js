#!/usr/bin/env node
/**
 * Copy official Weekplan logo masters from brand/logo/ into app + website
 * runtime paths, then regenerate icons, OG-image and compatibility SVG.
 *
 * Run: node scripts/sync-brand-logo.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const BRAND = path.join(ROOT, 'brand', 'logo');

const FULL_MASTER = 'Weekplan_logo_transparent_master.png';
const FULL_1024 = 'Weekplan_logo_transparent_1024px.png';
const FULL_2048 = 'Weekplan_logo_transparent_2048px.png';
const SYMBOL_1024 = 'Weekplan_symbol_transparent_1024px.png';
const SQUARE_1024 = 'Weekplan_symbol_square_transparent_1024px.png';
const ASSET_VERSION = '4';

function mustExist(file) {
  const full = path.join(BRAND, file);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing brand master: ${path.relative(ROOT, full)}`);
  }
  return full;
}

function copy(src, destRel) {
  const dest = path.join(ROOT, destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`Copied ${path.relative(ROOT, dest)}`);
}

async function writePng(destRel, buffer) {
  const dest = path.join(ROOT, destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buffer);
  console.log(`Wrote ${path.relative(ROOT, dest)} (${buffer.length} bytes)`);
}

async function makeOgImage(logoPath) {
  const width = 1200;
  const height = 630;
  const padX = 90;
  const innerW = width - padX * 2;
  const logo = await sharp(logoPath)
    .resize({ width: innerW, height: height - 140, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const meta = await sharp(logo).metadata();
  const left = Math.round((width - meta.width) / 2);
  const top = Math.round((height - meta.height) / 2);
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 21, g: 44, b: 75, alpha: 1 }, // --wp-navy
    },
  })
    .composite([{ input: logo, left, top }])
    .png()
    .toBuffer();
}

async function makeEmbeddedSvg(pngPath, destRel) {
  const meta = await sharp(pngPath).metadata();
  const b64 = fs.readFileSync(pngPath).toString('base64');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${meta.width}" height="${meta.height}" viewBox="0 0 ${meta.width} ${meta.height}" role="img" aria-label="Weekplan">
  <title>Weekplan</title>
  <image width="${meta.width}" height="${meta.height}" xlink:href="data:image/png;base64,${b64}"/>
</svg>
`;
  const dest = path.join(ROOT, destRel);
  fs.writeFileSync(dest, svg);
  console.log(`Wrote ${path.relative(ROOT, dest)}`);
}

function patchWebsiteHtml() {
  const dir = path.join(ROOT, 'website');
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.html')) continue;
    const file = path.join(dir, name);
    let html = fs.readFileSync(file, 'utf8');
    const before = html;
    html = html.replace(
      /src="\/img\/logo-nav\.png(?:\?v=\d+)?" alt="Weekplan" width="\d+" height="\d+"/g,
      `src="/img/logo-nav.png?v=${ASSET_VERSION}" alt="Weekplan" width="154" height="50"`,
    );
    html = html.replace(
      /src="\/img\/logo\.png(?:\?v=\d+)?" alt="Weekplan" width="\d+" height="\d+"/g,
      `src="/img/logo.png?v=${ASSET_VERSION}" alt="Weekplan" width="155" height="51"`,
    );
    html = html.replace(
      /href="\/img\/favicon\.png(?:\?v=\d+)?"/g,
      `href="/img/favicon.png?v=${ASSET_VERSION}"`,
    );
    html = html.replace(
      /content="https:\/\/www\.weekplan\.no\/img\/logo\.png"/g,
      'content="https://www.protop.no/img/og-image.png"',
    );
    if (html !== before) {
      fs.writeFileSync(file, html);
      console.log(`Updated ${path.relative(ROOT, file)}`);
    }
  }
}

async function main() {
  const fullMaster = mustExist(FULL_MASTER);
  const full1024 = mustExist(FULL_1024);
  const full2048 = fs.existsSync(path.join(BRAND, FULL_2048))
    ? mustExist(FULL_2048)
    : fullMaster;
  const symbol1024 = mustExist(SYMBOL_1024);
  const square1024 = mustExist(SQUARE_1024);

  copy(full1024, 'assets/weekplan-logo-transparent.png');
  copy(full1024, 'assets/weekplan-logo.png');
  copy(symbol1024, 'assets/weekplan-mark.png');
  copy(square1024, 'assets/weekplan-mark-square.png');

  copy(full2048, 'website/img/logo.png');
  copy(full1024, 'website/img/logo-nav.png');
  copy(full1024, 'website/img/phones/logo-nav.png');
  copy(symbol1024, 'website/img/mark.png');

  await makeEmbeddedSvg(full2048, 'brand/logo/Weekplan_logo_highres_embedded.svg');

  const og = await makeOgImage(full2048);
  await writePng('website/img/og-image.png', og);

  patchWebsiteHtml();

  const icons = spawnSync(process.execPath, [path.join(__dirname, 'generate-app-icons.js')], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (icons.status !== 0) {
    process.exit(icons.status || 1);
  }

  // Marketing favicon matches the generated 48px app favicon.
  copy(path.join(ROOT, 'assets', 'favicon.png'), 'website/img/favicon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
