import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { BREAKPOINTS, coarsePointer, layoutFor } from './layout.js';

/**
 * Brytepunkter (UX-23): telefon/nettbrett/PC/bred PC er definert én gang i src/ui/layout.js
 * og brukes via useLayout() eller BREAKPOINTS. Denne vakten teller egne tall (en bredde
 * sammenlignet med et tall på 3–4 sifre) under screens/, components/ og src/. Tallet kan bare
 * bli mindre, som designGuard.
 *
 * Det som står igjen er bredder på en boks (onLayout), ikke på vinduet: kolonnen i en tabell,
 * en kartskuff, forhåndsvisningen ved siden av et skjema, bildestørrelser.
 * Går tallet ned, senk BASELINE i samme endring (testen sier fra).
 */
export const BASELINE = 14;

const root = fileURLToPath(new URL('../../', import.meta.url));
const SKIP = new Set(['src/ui/layout.js']);

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(js|jsx|tsx|ts)$/.test(name) && !/\.test\./.test(name) && !SKIP.has(rel)) out.push(rel);
  }
  return out;
}

const WIDTH = String.raw`(?:\w*[wW]idth|winW|vw|w)`;
const PATTERN = new RegExp(String.raw`\b${WIDTH}\s*(?:<=?|>=?)\s*\d{3,4}\b|\b\d{3,4}\s*(?:<=?|>=?)\s*${WIDTH}\b`, 'g');

export function countOwnBreakpoints(text) {
  return (String(text).match(PATTERN) || []).length;
}

test('telleren finner egne brytepunkter, ikke de felles', () => {
  assert.equal(countOwnBreakpoints('const wide = width >= 980; const narrow = winW < 600;'), 2);
  assert.equal(countOwnBreakpoints('if (w < 1024) return 1; if (1100 <= screenWidth) return 2;'), 2);
  assert.equal(countOwnBreakpoints('const wide = width >= BREAKPOINTS.desktop; const { isWide } = useLayout();'), 0);
  assert.equal(countOwnBreakpoints('style={{ width: 1200, maxWidth: 980 }} rows.map((w) => 100)'), 0);
});

test('egne brytepunkter under screens/, components/ og src/ øker ikke', () => {
  const hits = [];
  for (const dir of ['screens', 'components', 'src']) {
    for (const rel of sourceFiles(dir)) {
      const lines = readFileSync(join(root, rel), 'utf8').split('\n');
      lines.forEach((line, i) => {
        const n = countOwnBreakpoints(line);
        if (n) hits.push(`${rel}:${i + 1} ${line.trim().slice(0, 90)}`);
      });
    }
  }
  assert.ok(
    hits.length <= BASELINE,
    `${hits.length} egne brytepunkter, mer enn grensen ${BASELINE}. Bruk useLayout() (isPhone, isTablet, isDesktop, isWide) eller BREAKPOINTS fra src/ui/layout.js:\n${hits.join('\n')}`,
  );
  if (hits.length < BASELINE) console.log(`breakpointGuard: nede i ${hits.length} (grense ${BASELINE}). Senk BASELINE.`);
});

test('brytepunktene: telefon < 768, nettbrett, PC ≥ 1024, bred PC ≥ 1280', () => {
  assert.deepEqual(BREAKPOINTS, { tablet: 768, desktop: 1024, wide: 1280 });
  assert.deepEqual(layoutFor(390, { touch: true }), {
    isPhone: true, isTablet: false, isDesktop: false, isWide: false, isTouch: true, density: 'touch',
  });
  const ipadPortrait = layoutFor(820, { touch: true });
  assert.equal(ipadPortrait.isTablet, true);
  assert.equal(ipadPortrait.density, 'touch');
  const pc = layoutFor(1440);
  assert.equal(pc.isDesktop && pc.isWide, true);
  assert.equal(pc.density, 'mouse');
  assert.equal(layoutFor(1100).isWide, false);
});

test('tettheten følger pekeren, ikke bredden: iPad i liggende format er berøring', () => {
  const ipad = layoutFor(1024, { touch: true });
  assert.equal(ipad.isDesktop, true, 'oppsettet er PC (sidemeny og bredde)');
  assert.equal(ipad.isTouch, true);
  assert.equal(ipad.density, 'touch', 'men trykkflatene er for fingre');
  const fakeWindow = (coarse) => ({ matchMedia: (q) => ({ matches: q === '(pointer: coarse)' && coarse }) });
  assert.equal(coarsePointer(fakeWindow(true)), true);
  assert.equal(coarsePointer(fakeWindow(false)), false);
  assert.equal(coarsePointer({}), false);
  assert.equal(coarsePointer({ matchMedia() { throw new Error('nei'); } }), false);
});

test('useLayout gir isWide, isTouch og density fra src/ui/layout.js', () => {
  const theme = readFileSync(join(root, 'src/theme.js'), 'utf8');
  assert.match(theme, /from '\.\/ui\/layout\.js'/);
  assert.match(theme, /Platform\.OS !== 'web' \|\| coarsePointer\(\)/);
  for (const key of ['isWide', 'isTouch', 'density']) assert.match(theme, new RegExp(`\\b${key},`), key);
  assert.doesNotMatch(theme, /isWide = isDesktop/);
});

test('app.web.css: skarpe hjørner og 14 px felt bare med mus, hover bare der det finnes', () => {
  const css = readFileSync(join(root, 'app.web.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const block = (head) => {
    const at = css.indexOf(head);
    assert.ok(at >= 0, head);
    let depth = 0;
    for (let i = css.indexOf('{', at); i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      if (css[i] === '}') { depth -= 1; if (!depth) return css.slice(at, i); }
    }
    return '';
  };
  const desktop = block('@media (min-width: 1024px) {');
  assert.doesNotMatch(desktop, /--wp-radius-md/, 'hjørnene følger ikke bredden alene');
  assert.doesNotMatch(desktop, /font-size:\s*14px/, 'iPad beholder 16 px i feltene (ellers zoomer iOS)');
  assert.doesNotMatch(desktop, /:hover/);
  const mouse = block('@media (min-width: 1024px) and (pointer: fine) {');
  assert.match(mouse, /--wp-radius-md:\s*7px/);
  assert.match(mouse, /font-size:\s*14px !important/);
  const hover = block('@media (min-width: 1024px) and (hover: hover) {');
  assert.match(hover, /\[role="button"\]:hover/);
  assert.match(hover, /\[data-wp-cal-plus\]/);
});
