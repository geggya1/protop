import assert from 'node:assert/strict';
import { glassInk, glassFill, glassLine, glassStyle, glassStyles } from './glassInk.js';
import { glassTintForBanner, DEFAULT_GLASS_TINT, HOME_BANNER_TINTS } from '../homeBannerTints.js';

// Dark ink turns light on tinted glass.
assert.equal(glassInk('#1F2630'), '#FFFFFF'); // soft.ink
assert.equal(glassInk('#5C6573'), 'rgba(255,255,255,0.74)'); // soft.muted
assert.equal(glassInk('#3D4450'), 'rgba(255,255,255,0.86)');
// Coloured links keep their hue but get lighter.
assert.equal(glassInk('#5A7A60'), 'rgb(181,195,183)'); // soft.sage
// Light or non-colour values are untouched.
assert.equal(glassInk('#FFFFFF'), '#FFFFFF');
assert.equal(glassInk('#34C759'), '#34C759');
assert.equal(glassInk(undefined), undefined);

// Light chips become a faint veil; dark washes flip to faint white.
assert.equal(glassFill('#FAF7F2'), 'rgba(255,255,255,0.14)');
assert.equal(glassFill('rgba(255,255,255,0.85)'), 'rgba(255,255,255,0.14)');
assert.equal(glassFill('rgba(61,68,80,0.12)'), 'rgba(255,255,255,0.192)');
assert.equal(glassFill('#34C759'), '#34C759'); // progress fill stays green
assert.equal(glassFill('#2F80ED'), '#2F80ED');
assert.equal(glassFill('transparent'), 'transparent');

assert.match(glassLine('#E8E4DC'), /^rgba\(255,255,255,/);

const sheet = {
  title: { fontSize: 15, color: '#1F2630' },
  pill: { backgroundColor: '#FAF7F2', borderColor: '#E8E4DC', borderWidth: 1 },
  plain: { flex: 1 },
};
const g = glassStyles(sheet);
assert.equal(g.title.color, '#FFFFFF');
assert.equal(g.title.fontSize, 15);
assert.equal(g.plain, sheet.plain); // unchanged styles keep identity
assert.equal(glassStyles(sheet), g); // cached per sheet
assert.equal(sheet.title.color, '#1F2630'); // source sheet not mutated
assert.equal(glassStyle(null), null);

// Banner tints: known id, fallback to default banner, custom default.
assert.match(glassTintForBanner('natur-brygge'), /^\d+, \d+, \d+$/);
assert.equal(glassTintForBanner('nope'), HOME_BANNER_TINTS['natur-innsjo-hytte-morgen']);
Object.values(HOME_BANNER_TINTS).forEach((t) => {
  const max = Math.max(...t.split(',').map(Number));
  assert.ok(max <= 78, `tint too light for white text: ${t}`);
});
assert.equal(typeof DEFAULT_GLASS_TINT, 'string');

console.log('glassInk.test.mjs: ok');

// ProTop: tilpassede farger (CSS-variabel på web, DynamicColorIOS på iOS) leses som lys variant.
{
  const { glassInk: ink, glassFill: fill, glassLine: line } = await import('./glassInk.js');
  assert.equal(ink('var(--wp-c-ink)'), '#FFFFFF');
  assert.equal(ink({ dynamic: { light: '#1a2744', dark: '#e5e7eb' } }), '#FFFFFF');
  assert.equal(fill('var(--wp-c-card)'), 'rgba(255,255,255,0.14)');
  assert.match(line('var(--wp-c-line)'), /^rgba\(255,255,255,/);
  assert.equal(ink('var(--ukjent)'), 'var(--ukjent)');
}
