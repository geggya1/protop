import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { LIGHT } from './palette.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('web laster vektene som brukes, så teksten ikke blir syntetisk fet (UX-03)', () => {
  const css = readFileSync(join(root, 'app.web.css'), 'utf8');
  const fonts = css.split('\n')[0];
  assert.match(fonts, /^@import url\('https:\/\/fonts\.googleapis\.com\/css2\?/);
  assert.match(fonts, /family=Inter:opsz,wght@14\.\.32,400;14\.\.32,500;14\.\.32,600;14\.\.32,700/);
  assert.match(fonts, /family=Nunito:wght@400;500;600;700/);
});

// Skallet, innlogging og de personlige modulene. Bedriftsmodulene tas av en egen kodemod.
const SCOPE = ['components', 'src/ui', 'src/appearance', 'screens/v2', 'screens/onboarding'];
const FILES = ['screens/LoginScreen.jsx', 'screens/RegisterScreen.jsx'];
const SKIP = /^components\/(arbeid|company|economy|employees|equipment|project|documents|home)\/|^components\/(ModuleHero|CompanyOfferModal)\.jsx$/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...walk(rel));
    else if (/\.(js|jsx|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(rel);
  }
  return out;
}

test('ingen døde hex-reserver bak tokens som alltid finnes (UX-04)', () => {
  const tokens = Object.keys(LIGHT).join('|');
  const dead = new RegExp(`colors\\.(${tokens}) \\|\\| '#[0-9A-Fa-f]{3,8}'`, 'g');
  const hits = [];
  for (const rel of [...SCOPE.flatMap(walk), ...FILES]) {
    if (SKIP.test(rel)) continue;
    const found = readFileSync(join(root, rel), 'utf8').match(dead);
    if (found) hits.push(`${rel}: ${found.join(', ')}`);
  }
  assert.deepEqual(hits, []);
});

test('rød er rød: ingen amber-reserve for danger i skallet', () => {
  const hits = [];
  for (const rel of [...SCOPE.flatMap(walk), ...FILES]) {
    if (SKIP.test(rel)) continue;
    if (readFileSync(join(root, rel), 'utf8').includes("colors.danger || '#b45309'")) hits.push(rel);
  }
  assert.deepEqual(hits, []);
});
