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
  assert.match(src, /rememberSnapshot\(key, \{ \.\.\.next, loaded: true, at: Date\.now\(\) \}\)/);
  // En eldre lesing som blir ferdig sist, overskriver ikke en nyere.
  assert.match(src, /if \(LATEST\.get\(key\) === seq\) rememberSnapshot/);
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

test('siden og forhåndslastingen deler samme lesing', () => {
  const src = read('screens/economy/billing/useBillingData.js');
  assert.match(src, /if \(!force && INFLIGHT\.has\(key\)\) return INFLIGHT\.get\(key\)/);
  assert.match(src, /loadBillingBase\(familyId, \{ projectId, project, force: stamp > 0 \}\)/);
  assert.match(src, /export function prefetchBillingData\(familyId\)/);
  // 18 måneder timer skrives ikke til nettleserens lager.
  assert.match(src, /toDate: today, cache: false/);
});

test('Økonomi forhåndslaster for den som fakturerer, og laster ikke prosjektene dobbelt', () => {
  const src = read('screens/economy/EconomyScreen.jsx');
  assert.match(src, /const onBilling = page === 'fakturagrunnlag'/);
  assert.match(src, /if \(onBilling\) return undefined;\s*let live = true;/);
  assert.match(src, /prefetchBillingData\(familyId\)/);
  assert.match(src, /if \(!familyId \|\| !invoicesWork \|\| onBilling\) return undefined;/);
});

test('prosesslinjen på Til fakturering bruker sidens timer i stedet for å hente dem igjen', () => {
  assert.match(read('screens/economy/EconomyBilling.jsx'), /fetchEntries: false/);
  const chain = read('screens/economy/billing/useBillingChain.js');
  assert.match(chain, /if \(!enabled \|\| !familyId \|\| !fetchEntries\) return undefined;/);
});

test('etter en godkjenning brukes ikke en lesing som startet før den', () => {
  const src = read('screens/economy/billing/useBillingData.js');
  assert.match(src, /export function staleBillingData\(familyId\)/);
  assert.match(read('screens/economy/billing/useBillingChain.js'), /staleBillingData\(familyId\);\n\}/);
});
