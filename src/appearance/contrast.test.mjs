import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DARK, LIGHT } from './palette.js';

// WCAG 2.x relativ luminans og kontrast (1.4.3 krever 4,5:1 for vanlig tekst).
function luminance(hex) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const AA = 4.5;

function expectAA(pal, fg, bg, label) {
  const ratio = contrast(pal[fg], pal[bg]);
  assert.ok(ratio >= AA, `${label}: ${fg} ${pal[fg]} på ${bg} ${pal[bg]} gir ${ratio.toFixed(2)}:1`);
}

test('tekstfargene i lys palett har minst 4,5:1 mot kort og bakgrunn', () => {
  for (const key of ['brandInk', 'successInk', 'warnInk', 'dangerInk', 'placeholder', 'muted', 'ink']) {
    expectAA(LIGHT, key, 'card', 'lys');
  }
  for (const key of ['brandInk', 'successInk', 'warnInk', 'dangerInk', 'muted', 'ink']) {
    expectAA(LIGHT, key, 'bg', 'lys');
  }
  expectAA(LIGHT, 'brandInk', 'brandSoft', 'aktiv pille');
  expectAA(LIGHT, 'onBrand', 'brandInk', 'fylt knapp');
  expectAA(LIGHT, 'placeholder', 'sunken', 'plassholder i felt');
});

test('tekstfargene i mørk palett har minst 4,5:1 mot kortet', () => {
  for (const key of ['brandInk', 'successInk', 'warnInk', 'dangerInk', 'placeholder', 'muted', 'ink']) {
    expectAA(DARK, key, 'card', 'mørk');
  }
  expectAA(DARK, 'onBrand', 'brandInk', 'fylt knapp');
});

test('merkefargen er beholdt til ikoner og fokusring, men er ikke tekstfargen', () => {
  assert.equal(LIGHT.brand, '#1099F4');
  assert.ok(contrast(LIGHT.brand, LIGHT.card) < AA, 'digital blå alene består ikke som tekst');
  assert.ok(contrast(LIGHT.brand, LIGHT.card) >= 3, 'men holder 3:1 for ikoner og fokusring (1.4.11)');
});

test('CSS-variablene for første maling på web følger paletten', () => {
  const css = readFileSync(new URL('../../app.web.css', import.meta.url), 'utf8');
  for (const key of ['brandInk', 'onBrand', 'successInk', 'warnInk', 'dangerInk', 'dangerSoft', 'placeholder']) {
    const m = css.match(new RegExp(`--wp-c-${key}:\\s*(#[0-9a-fA-F]{3,6})`));
    assert.ok(m, `--wp-c-${key} mangler i app.web.css`);
    assert.equal(m[1].toLowerCase(), LIGHT[key].toLowerCase(), `--wp-c-${key}`);
  }
});

test('felles komponenter bruker brandInk til tekst på aktive faner og fylte knapper', () => {
  const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  assert.match(read('components/ModuleTabs.jsx'), /color: on \? colors\.brandInk/);
  assert.match(read('components/ui.jsx'), /themeColors\.brandInk/);
  assert.match(read('components/DeskBtn.jsx'), /backgroundColor: colors\.brandInk/);
  assert.match(read('components/ConfirmDialog.jsx'), /primary: \{ backgroundColor: colors\.brandInk \}/);
  assert.match(read('screens/iso/isoUi.jsx'), /primary \? colors\.brandInk/);
  for (const path of ['screens/LoginScreen.jsx', 'screens/RegisterScreen.jsx']) {
    assert.equal(read(path).includes('#8b98a5'), false, `${path}: plassholderen bruker colors.placeholder`);
  }
});
