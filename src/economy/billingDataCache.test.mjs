/**
 * Til fakturering tegnes fra forrige grunnlag i økten og henter ferske tall i bakgrunnen.
 * Mens det skjer, er godkjenning og fakturautkast låst. Hooken gir samme objekt så lenge
 * ingenting er endret, så grunnlaget ikke bygges på nytt ved hvert tastetrykk.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

test('useBillingData husker grunnlaget per selskap og prosjekt, og starter fra det', () => {
  const src = read('screens/economy/billing/useBillingData.js');
  assert.match(src, /const SNAPSHOTS = new Map\(\)/);
  assert.match(src, /snapshotKey\(familyId, projectId\)/);
  assert.match(src, /useState\(\(\) => !!warm\?\.loaded\)/);
  assert.match(src, /rememberSnapshot\(key, \{ \.\.\.next, loaded: true \}\)/);
  // Demo og egne lagre (tester) skal ikke dele minnet med appen.
  assert.match(src, /const cacheable = !demo && !storage/);
});

test('useBillingData sier fra når den oppdaterer, og gir stabilt objekt', () => {
  const src = read('screens/economy/billing/useBillingData.js');
  assert.match(src, /setRefreshing\(true\)/);
  assert.match(src, /return useMemo\(\(\) => \(\{\s*ready,\s*refreshing,/);
});

test('godkjenning og utkast er låst mens grunnlaget oppdateres', () => {
  const billing = read('screens/economy/EconomyBilling.jsx');
  assert.match(billing, /const locked = !!workflow\.busy \|\| !!data\.refreshing/);
  assert.equal((billing.match(/disabled=\{!checkedProjects\.length \|\| locked\}/g) || []).length, 2);
  assert.match(billing, /locked=\{!!data\.refreshing\}/);
  assert.match(read('components/project/ProjectBillingReadyTab.jsx'), /locked=\{!!data\.refreshing\}/);
  const row = read('screens/economy/billing/BillingProjectRow.jsx');
  assert.equal((row.match(/disabled=\{!picked\.length \|\| busy \|\| locked\}/g) || []).length, 2);
});
