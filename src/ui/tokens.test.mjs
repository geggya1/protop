import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { elevationStyle, FONT_WEIGHTS, radius, space, type } from './tokens.js';

test('tokens: 4-grid, faste hjørner, lastede vekter og skyggenivåer', () => {
  for (const value of Object.values(space)) assert.equal(value % 4, 0, `space ${value}`);
  assert.deepEqual(radius, { control: 8, card: 12, sheet: 16, pill: 999 });
  for (const style of Object.values(type)) assert.ok(FONT_WEIGHTS.includes(style.fontWeight), style.fontWeight);
  assert.ok(elevationStyle(1, 'web').boxShadow);
  assert.equal(elevationStyle(2, 'ios').elevation, 8);
  assert.deepEqual(elevationStyle(0, 'web'), {});
});

test('isoUi re-eksporterer designsystemet med de gamle navnene', () => {
  const iso = readFileSync(new URL('../../screens/iso/isoUi.jsx', import.meta.url), 'utf8');
  for (const pair of ['Badge as Pill', 'Button as Btn', 'EmptyState as Empty']) assert.ok(iso.includes(pair), pair);
  assert.match(iso, /from '\.\.\/\.\.\/src\/ui\/primitives'/);
  const ui = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  for (const name of ['Button', 'Card', 'Badge', 'Banner', 'EmptyState', 'Field', 'Sheet', 'ListRow', 'Page']) {
    assert.match(ui, new RegExp(`\\b${name}\\b`), name);
  }
  // Kortet bruker skyggenivå 1, som er samme skygge ISO hadde før.
  assert.equal(elevationStyle(1, 'web').boxShadow, '0 8px 22px rgba(15, 23, 42, 0.05)');
});
