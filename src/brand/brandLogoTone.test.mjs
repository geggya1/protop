import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brandLogoToneForBackground } from './brandLogoTone.js';

// Black-mode chrome from src/appearance/palette.js (DARK.bg / DARK.card).
assert.equal(brandLogoToneForBackground('#000000'), 'white');
assert.equal(brandLogoToneForBackground('#1c1c1e'), 'white');

// Light chrome, including the soft home surfaces that stay light.
assert.equal(brandLogoToneForBackground('#f4f7fb'), 'primary');
assert.equal(brandLogoToneForBackground('#ffffff'), 'primary');
assert.equal(brandLogoToneForBackground('#F5F2EC'), 'primary');
assert.equal(brandLogoToneForBackground('#FFFFFF'), 'primary');
assert.equal(brandLogoToneForBackground('transparent'), 'primary');
assert.equal(brandLogoToneForBackground(''), 'primary');

const header = readFileSync(new URL('../../components/ShellHeader.jsx', import.meta.url), 'utf8');
const drawer = readFileSync(new URL('../../components/ShellDrawer.jsx', import.meta.url), 'utf8');
const logo = readFileSync(new URL('../../components/BrandLogo.tsx', import.meta.url), 'utf8');

assert.match(header, /brandLogoToneForBackground\(chromeOnly \? colors\.card : colors\.bg\)/);
assert.match(header, /tone=\{logoTone\}/);
assert.match(drawer, /brandLogoToneForBackground\(colors\.card\)/);
assert.match(drawer, /tone=\{logoTone\}/);
assert.match(logo, /ProTop_logo_white_transparent\.png/);
assert.match(logo, /tone = 'primary'/);
assert.doesNotMatch(
  readFileSync(new URL('../../screens/LoginScreen.jsx', import.meta.url), 'utf8'),
  /tone=/,
  'login keeps the colour lockup',
);

console.log('brandLogoTone.test.mjs ok');
