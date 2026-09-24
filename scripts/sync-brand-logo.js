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

const COPIES = [
  ['ProTop_logo_primary_transparent.png', 'assets/weekplan-logo-transparent.png'],
  ['ProTop_logo_primary_transparent.png', 'assets/weekplan-logo.png'],
  ['ProTop_symbol_transparent.png', 'assets/weekplan-mark.png'],
  ['ProTop_symbol_square_2048.png', 'assets/weekplan-mark-square.png'],
];

function copy(srcName, destRel) {
  const src = path.join(BRAND, srcName);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing brand master: ${srcName}`);
  }
  const dest = path.join(ROOT, destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`Copied ${destRel}`);
}

function main() {
  for (const [src, dest] of COPIES) copy(src, dest);

  const icons = spawnSync(process.execPath, [path.join(__dirname, 'generate-app-icons.js')], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (icons.status !== 0) process.exit(icons.status || 1);
}

main();
