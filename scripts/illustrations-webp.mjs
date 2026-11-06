/**
 * Lager WebP av modulillustrasjonene (assets/module-activation og public/assets/module-activation):
 *   <navn>.webp    full størrelse (PC, nettbrett, mobilappen)
 *   <navn>-m.webp  mobilutgave, høyst 640 px bred (telefon på web)
 * PNG-filene fjernes. Gjennomsiktighet beholdes. Kjør etter at nye PNG-er er lagt inn:
 *
 *   node scripts/illustrations-webp.mjs
 */
import { readdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['assets/module-activation', 'public/assets/module-activation'];
const MOBILE_WIDTH = 640;
const OPTS = { quality: 84, alphaQuality: 90, effort: 6 };

let made = 0;
let before = 0;
let after = 0;
for (const rel of DIRS) {
  const dir = join(root, rel);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.png'))) {
    const src = join(dir, name);
    const base = name.replace(/\.png$/, '');
    const img = sharp(src);
    const meta = await img.metadata();
    const full = await img.clone().webp(OPTS).toFile(join(dir, `${base}.webp`));
    const small = await img.clone()
      .resize({ width: Math.min(MOBILE_WIDTH, meta.width || MOBILE_WIDTH), withoutEnlargement: true })
      .webp(OPTS)
      .toFile(join(dir, `${base}-m.webp`));
    const { size } = await sharp(src).toBuffer({ resolveWithObject: true }).then((r) => r.info);
    before += size;
    after += full.size + small.size;
    rmSync(src);
    made += 1;
  }
}
console.log(`${made} illustrasjoner: ${(before / 1e6).toFixed(1)} MB PNG → ${(after / 1e6).toFixed(1)} MB WebP (full + mobil)`);
