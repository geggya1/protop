import test from 'node:test';
import assert from 'node:assert/strict';
import { PROTOP_PAGES, getProtopPage } from './protopPages.js';
import { PAGE_KEYS, PAGE_ALIASES, helpPageId, resolvePageKey } from './protopPageKeys.js';

test('nøklene i den lette modulen er de samme som i hjelpekatalogen', () => {
  assert.deepEqual([...PAGE_KEYS].sort(), Object.keys(PROTOP_PAGES).sort());
});

test('aliasene peker på sider som finnes', () => {
  for (const [from, to] of Object.entries(PAGE_ALIASES)) {
    assert.ok(PROTOP_PAGES[to], `${from} -> ${to}`);
  }
});

test('oppslagene gir samme side som før', () => {
  assert.equal(helpPageId('more', 'friends'), 'friends');
  assert.equal(helpPageId('iso'), 'iso.oversikt');
  assert.equal(resolvePageKey('hr.ansatte'), 'ansatte');
  assert.equal(resolvePageKey('finnes-ikke'), null);
  assert.equal(getProtopPage('more.help')?.key, 'help');
});
