#!/usr/bin/env node
/**
 * Copy the approved ProTop masters into the runtime paths the shell
 * already requires, then regenerate store, splash and PWA icons.
 *
 * Run: node scripts/sync-brand-logo.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BRAND = path.join(ROOT, 'brand');

// [master, kopi i appen, høyde i px]. Appen viser logoen i høyst 64 px høyde og merket i
// widgetene i 24 px, så kopiene lages i 3× visningsstørrelse (skarpt på alle skjermer) i stedet
// for masterstørrelsen (opptil 2048 px og 600 KB). Masterne i brand/ beholder full oppløsning.
const COPIES = [
  ['ProTop_logo_primary_transparent.png', 'assets/protop-logo-transparent.png', 200],
  ['ProTop_logo_primary_transparent.png', 'assets/protop-logo.png', 200],
  ['ProTop_symbol_transparent.png', 'assets/protop-mark.png', 200],
  ['ProTop_symbol_square_2048.png', 'assets/protop-mark-square.png', 96],
];

async function copy(srcName, destRel, height) {
  const src = path.join(BRAND, srcName);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing brand master: ${srcName}`);
  }
  const dest = path.join(ROOT, destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // eslint-disable-next-line global-require
  const sharp = require('sharp');
  await sharp(src)
    .resize({ height, withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
    .toFile(dest);
  console.log(`Wrote ${destRel} (${height} px høy)`);
}

async function main() {
  for (const [src, dest, height] of COPIES) await copy(src, dest, height);

  const icons = spawnSync(process.execPath, [path.join(__dirname, 'generate-app-icons.js')], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (icons.status !== 0) process.exit(icons.status || 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
