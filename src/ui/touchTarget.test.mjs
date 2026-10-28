import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { touch } from './tokens.js';
import { touchHit } from './touchTarget.js';

/** Boksen på web: innhold + padding, og plassen den tar i raden (boks + negativ margin). */
function webBox(content, style) {
  const w = content.w + 2 * (style?.paddingHorizontal || 0);
  const h = content.h + 2 * (style?.paddingVertical || 0);
  return {
    w: style?.width ?? w,
    h: style?.height ?? h,
    footW: (style?.width ?? w) + 2 * (style?.marginHorizontal || 0),
    footH: (style?.height ?? h) + 2 * (style?.marginVertical || 0),
  };
}

test('web: et 18 px ikon får 44 × 44 trykkflate uten å ta mer plass', () => {
  const { style, hitSlop } = touchHit(18, 20);
  assert.equal(hitSlop, undefined);
  const box = webBox({ w: 18, h: 20 }, style);
  assert.ok(box.w >= touch.min && box.h >= touch.min, JSON.stringify(box));
  assert.deepEqual([box.footW, box.footH], [18, 20]);
});

test('web: egen padding (inset) erstattes, og plassen i raden er den samme', () => {
  // Slett-knappen i fakturalisten: 18 px ikon med padding 4 = 26 × 28.
  const { style } = touchHit(18, 20, { inset: 4 });
  const box = webBox({ w: 18, h: 20 }, style);
  assert.ok(box.w >= 44 && box.h >= 44);
  assert.deepEqual([box.footW, box.footH], [26, 28]);
});

test('web: fast boks uten bakgrunn blir 44 × 44 med samme plass', () => {
  const { style } = touchHit(28, 28, { fixed: true });
  assert.deepEqual(style, { width: 44, height: 44, marginHorizontal: -8, marginVertical: -8 });
});

test('native bruker hitSlop, mus og store knapper får ingenting', () => {
  assert.deepEqual(touchHit(22, 24, { os: 'ios' }), { style: null, hitSlop: { top: 10, bottom: 10, left: 11, right: 11 } });
  assert.deepEqual(touchHit(18, 18, { os: 'android', inset: 4 }).hitSlop, { top: 9, bottom: 9, left: 9, right: 9 });
  assert.deepEqual(touchHit(18, 18, { touch: false }), { style: null, hitSlop: undefined });
  assert.deepEqual(touchHit(44, 48), { style: null, hitSlop: undefined });
});

test('felles knapper i skallet bruker trykkflaten på berøringsskjerm', () => {
  for (const rel of [
    '../../components/InfoButton.jsx',
    '../../components/PushEnableBanner.jsx',
    '../../components/ShellHeader.jsx',
    '../../components/ShellDrawer.jsx',
    '../../components/ScrollSheet.jsx',
    '../../components/HelpButton.jsx',
  ]) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.match(src, /touchHit\(/, rel);
    assert.match(src, /isTouch/, rel);
  }
});
