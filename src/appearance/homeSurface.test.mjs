import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { DARK, LIGHT } from './palette.js';

// UX-05: Hjem er den samme ProTop-flaten som modulene, på telefon, nettbrett og PC,
// i lyst og mørkt. Ingen soft-palett, ingen Fraunces, kortene er ProTop-kort.

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const HOME_FILES = [
  'components/home/PastelCards.jsx',
  'components/home/WidgetChrome.jsx',
  'components/home/WidgetBodies.jsx',
  'components/home/HomeTiles.jsx',
  'components/home/WidgetBoard.jsx',
  'components/home/WidgetGrid.jsx',
  'components/home/HomeBanner.jsx',
  'components/home/HomeHeroOverlay.jsx',
  'components/home/AddWidgetSheet.jsx',
  'components/home/WidgetCatalogGrid.jsx',
  'components/home/HomeModulesBoard.jsx',
  'components/home/ParentWidgetRenderer.jsx',
  'components/home/homeGlass.js',
  'components/parentHome/ParentHomeThemeHost.jsx',
  'components/DeskHomeDashboard.jsx',
];

function luminance(hex) {
  const h = String(hex).replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test('Hjem bruker ikke soft-paletten eller Fraunces', () => {
  for (const path of HOME_FILES) {
    const src = read(path);
    assert.equal(/softTheme/.test(src), false, `${path} importerer soft-paletten`);
    assert.equal(/\bsoft\.[a-zA-Z]/.test(src), false, `${path} bruker soft.*`);
    assert.equal(src.includes('Fraunces'), false, `${path} bruker Fraunces`);
    assert.equal(/fontFamily:\s*(sans|display)\b/.test(src), false, `${path} setter egen skrift`);
  }
});

test('widgetkortet er ProTop-kortet: colors.card, colors.line, radius.card', () => {
  const glass = read('components/home/homeGlass.js');
  assert.match(glass, /export const homeCardSurface = \{[\s\S]*?backgroundColor: colors\.card,[\s\S]*?borderColor: colors\.line,[\s\S]*?borderRadius: radius\.card,/);
  assert.match(glass, /export const immersiveCardSurface = homeCardSurface;/);
  const pastel = read('components/home/PastelCards.jsx');
  assert.match(pastel, /const card = \{\n(?:.*\n)*?\s+\.\.\.homeCardSurface,/);
  // Ingen pastellbakgrunn per kort (grønn, fersken, lavendel …).
  for (const hex of ['#EAF6EF', '#E7F3EA', '#EEF4EA', '#F7F3EA', '#EEF1F6', '#F8EEE6', '#E8F3EC']) {
    assert.equal(pastel.includes(hex), false, `PastelCards har fortsatt ${hex}`);
  }
  assert.match(read('components/home/WidgetChrome.jsx'), /export const glassCard = homeCardSurface;/);
  assert.match(read('components/parentHome/ParentHomeThemeHost.jsx'), /immersive \? 'transparent' : colors\.bg/);
});

test('Hjem på PC har ingen faste lyse flater som blir uleselige i mørkt', () => {
  const desk = read('components/DeskHomeDashboard.jsx');
  for (const hex of ['#f8fafc', '#fff8dc', '#f3e4a8', '#78716c', '#eff6ff', '#cbd5e1', '#e2e8f0']) {
    assert.equal(desk.includes(hex), false, `DeskHomeDashboard har fortsatt ${hex}`);
  }
  assert.match(desk, /primaryBtn: \{[\s\S]*?backgroundColor: colors\.brandInk/);
  assert.match(desk, /primaryBtnTxt: \{ color: colors\.onBrand/);
  assert.match(desk, /cardTitle: \{ \.\.\.type\.title/);
});

test('tekstparene på Hjem holder 4,5:1 i lyst og mørkt', () => {
  const pairs = [
    ['ink', 'card'], ['muted', 'card'], ['ink', 'bg'], ['muted', 'bg'],
    ['brandInk', 'card'], ['brandInk', 'bg'], ['brandInk', 'brandSoft'],
    ['onBrand', 'brandInk'], ['successInk', 'bg'], ['dangerInk', 'card'],
  ];
  for (const [name, pal] of [['lys', LIGHT], ['mørk', DARK]]) {
    for (const [fg, bg] of pairs) {
      const ratio = contrast(pal[fg], pal[bg]);
      assert.ok(ratio >= 4.5, `${name}: ${fg} på ${bg} gir ${ratio.toFixed(2)}:1`);
    }
  }
  // Ikonene i ProTop-blått holder 3:1 mot kortet (1.4.11).
  assert.ok(contrast(LIGHT.brand, LIGHT.card) >= 3);
  assert.ok(contrast(DARK.brand, DARK.card) >= 3);
});

test('rader inne i kortene bruker sidens bakgrunn, ikke sunken (muted på sunken er under 4,5:1 i mørkt)', () => {
  assert.ok(contrast(DARK.muted, DARK.sunken) < 4.5);
  for (const path of HOME_FILES) {
    assert.equal(read(path).includes('colors.sunken'), false, `${path} bruker colors.sunken`);
  }
});

test('soft-paletten er tatt ut av ProTop og ligger bare igjen for familieproduktet', () => {
  const root = new URL('../../', import.meta.url).pathname;
  // Barnas Hjem, familiewidgetene og barneprofilens tema (ThemeContext) er familieproduktet.
  const allowed = new Set([
    'components/childHome/softTheme.js',
    'components/childHome/ChildDashboardThemeHost.jsx',
    'components/parentHome/ParentHomeWidgets.jsx',
    'src/context/ThemeContext.jsx',
  ]);
  const users = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|jsx|ts|tsx)$/.test(name) && !/\.test\./.test(name)) {
        if (/from '[^']*softTheme'/.test(readFileSync(full, 'utf8'))) users.push(relative(root, full));
      }
    }
  };
  for (const dir of ['components', 'screens', 'src']) walk(join(root, dir));
  assert.deepEqual(users.filter((path) => !allowed.has(path)), [], 'ProTop-filer importerer soft-paletten');

  assert.equal(/SOFT_LIGHT|SOFT_DARK/.test(read('src/appearance/palette.js')), false, 'paletten har ikke soft-farger');
  assert.equal(read('app.web.css').includes('--wp-soft-'), false);
  assert.equal(read('src/appearance/applyAppearance.js').includes('--wp-soft-'), false);
  // Docken og hjelpekortet ser like ut i Privat og Bedrift, i lyst og mørkt.
  const dock = read('components/parentHome/ParentShellBottomNav.jsx');
  assert.match(dock, /tokens=\{DOCK_TOKENS\}/);
  assert.match(dock, /accent: colors\.brandInk,/);
  assert.equal(read('components/parentHome/ParentHomeBottomNav.jsx').includes('soft'), false);
  assert.equal(read('components/HelpOverlay.jsx').includes('cardSoft'), false);
});
