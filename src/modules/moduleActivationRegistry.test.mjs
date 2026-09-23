import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import catalogJsonFile from './moduler.catalog.js';
import { buildAlleModultekster } from './export-modultekster.mjs';
import {
  createModuleRegistry,
  reassuranceForRole,
  SHELL_SKIP_MODULE_IDS,
  CATEGORY_ORDER,
  ILLUSTRATION_CACHE,
} from './moduleActivationLogic.js';
import {
  ACTIVATABLE_MODULE_IDS,
  getModuleConfig,
  isActivatableModule,
  activationModuleIdForShell,
  activationModuleIdForStack,
  listModulesByCategory,
  MODULE_CATALOG,
  STACK_MODULE_IDS,
} from './moduleActivationRegistry.js';

const EXPECTED_IDS = [
  'plan', 'mail', 'stars', 'notes', 'chat', 'chores',
  'shop', 'meals', 'recipes', 'pantry',
  'albums', 'wall', 'childDrawings', 'familyTree', 'scratchMap', 'reiseplanlegger', 'wishes',
  'location', 'rememberDates', 'activities', 'books', 'games', 'progress',
  'skole', 'lekser', 'leksehjelp', 'mattehjelp', 'week-plan',
  'holdings', 'documents', 'boligmappa', 'hospitality',
];

const json = JSON.parse(readFileSync(new URL('./moduler.json', import.meta.url), 'utf8'));
assert.deepEqual(catalogJsonFile, json, 'moduler.catalog.js must match moduler.json');
assert.deepEqual(MODULE_CATALOG, json);

const registry = createModuleRegistry(json);
assert.deepEqual(registry.ACTIVATABLE_MODULE_IDS, EXPECTED_IDS);
assert.deepEqual(ACTIVATABLE_MODULE_IDS, EXPECTED_IDS);
assert.equal(EXPECTED_IDS.length, 32);

for (const id of EXPECTED_IDS) {
  const mod = getModuleConfig(id);
  assert.ok(mod, `missing ${id}`);
  assert.equal(mod.id, id);
  assert.ok(mod.name, `${id} name`);
  assert.ok(mod.category, `${id} category`);
  assert.ok(mod.eyebrow, `${id} eyebrow`);
  assert.ok(mod.headline, `${id} headline`);
  assert.ok(mod.pitch, `${id} pitch`);
  assert.equal(mod.benefits.length, 3, `${id} needs 3 benefits`);
  assert.ok(mod.illustration.endsWith('--module-activation-illustration.png'), `${id} illustration filename`);
  assert.equal(
    mod.illustrationPath,
    `/assets/module-activation/${mod.illustration}?v=${ILLUSTRATION_CACHE}`,
    `${id} illustrationPath must cache-bust`,
  );
  assert.match(mod.activationLabel, /^Aktiver /);
  assert.equal(mod.backLabel, 'Tilbake');
  assert.equal(
    mod.reassuranceText,
    'Aktivering er gratis nå. Du kan deaktivere modulen senere.',
  );
  assert.ok(mod.childReassuranceText);
  assert.equal(mod.childReassuranceText.toLowerCase().includes('gratis'), false, `${id} child copy must not mention gratis`);
  assert.equal(
    mod.mobileReassuranceText,
    'Gratis nå · Kan deaktiveres senere',
  );
  assert.equal(mod.reassuranceTextCompact, mod.mobileReassuranceText);
  const blob = [mod.eyebrow, mod.headline, mod.pitch, ...mod.benefits].join(' ');
  assert.equal(blob.includes('⭐'), false, `${id} must not use star symbols`);
}

assert.equal(getModuleConfig('home'), null);
assert.equal(isActivatableModule('settings'), false);
assert.equal(isActivatableModule('plan'), true);

assert.equal(activationModuleIdForShell('home'), null);
assert.equal(activationModuleIdForShell('plan'), 'plan');
assert.equal(activationModuleIdForShell('more', null), null);
assert.equal(activationModuleIdForShell('more', 'settings'), null);
assert.equal(activationModuleIdForShell('more', 'shop'), 'shop');
assert.equal(activationModuleIdForShell('more', 'moduleAccess'), null);
assert.equal(activationModuleIdForShell('chores'), 'chores');
assert.equal(activationModuleIdForShell('mail'), 'mail');

assert.equal(STACK_MODULE_IDS.Activities, 'activities');
assert.equal(STACK_MODULE_IDS.FamilyProgress, 'progress');
assert.equal(STACK_MODULE_IDS.LocationSettings, 'location');
assert.equal(STACK_MODULE_IDS.StarGoals, 'chores');
assert.equal(activationModuleIdForStack('Activities'), 'activities');
assert.equal(activationModuleIdForStack('FamilyDashboard'), null);
assert.equal(activationModuleIdForStack('Home'), null);

for (const skip of SHELL_SKIP_MODULE_IDS) {
  assert.equal(activationModuleIdForShell(skip), null, skip);
}

const sections = listModulesByCategory();
assert.deepEqual(sections.map((s) => s.id), CATEGORY_ORDER.map((c) => c.id));
const listed = sections.flatMap((s) => s.items.map((i) => i.id));
assert.deepEqual(listed, EXPECTED_IDS);

const plan = getModuleConfig('plan');
assert.equal(reassuranceForRole(plan, { isChild: false }), plan.reassuranceText);
assert.equal(reassuranceForRole(plan, { isChild: true }), plan.childReassuranceText);
assert.equal(reassuranceForRole(plan, { isChild: false, compact: true }), plan.mobileReassuranceText);
assert.equal(reassuranceForRole(plan, { isChild: false, stacked: true }), plan.mobileReassuranceText);
assert.equal(reassuranceForRole(plan, { isChild: true, compact: true }), plan.childReassuranceText);
assert.equal(reassuranceForRole(plan, { isChild: true, stacked: true }), plan.childReassuranceText);
assert.equal(plan.mobileReassuranceText.toLowerCase().includes('gratis'), true);

const broken = createModuleRegistry({ modules: [{ id: '' }, null, { name: 'x' }] });
assert.deepEqual(broken.ACTIVATABLE_MODULE_IDS, []);
assert.equal(broken.getModuleConfig('plan'), null);

const exported = readFileSync(new URL('./alle-modultekster.txt', import.meta.url), 'utf8');
assert.equal(exported, buildAlleModultekster(json), 'alle-modultekster.txt must match export-modultekster.mjs');
assert.match(exported, /Id: plan/);
assert.match(exported, /Illustrasjon: kalender--module-activation-illustration\.png/);
assert.match(exported, /Trygghetstekst mobil: Gratis nå · Kan deaktiveres senere/);
assert.match(exported, /Trygghetstekst barn: Du kan åpne modulen når du vil/);
assert.equal(exported.includes('Trygghetstekst barn mobil:'), false);
assert.equal(exported.includes('⭐'), false);

const modalSrc = readFileSync(new URL('../../components/ModuleWelcomeModal.jsx', import.meta.url), 'utf8');
assert.equal(modalSrc.includes('Gratis nå'), false, 'do not hardcode mobile reassurance in the component');
assert.equal(modalSrc.includes('Aktivering er gratis'), false, 'do not hardcode desktop reassurance in the component');
assert.match(modalSrc, /createPortal/, 'web overlay must portal so it is not clipped');
assert.match(modalSrc, /overlayDismissAllowedAt/, 'opening click must not dismiss the dialog');
assert.match(modalSrc, /<Modal/, 'native overlay must use Modal so it actually appears');
assert.match(modalSrc, /stackedHeight/, 'stacked dialog needs an explicit height or copy/buttons collapse');

const gateSrc = readFileSync(new URL('../../components/ModuleActivationGate.jsx', import.meta.url), 'utf8');
assert.match(gateSrc, /height: '100%'/, 'gate wrap must keep a real height while the overlay is open');
assert.match(gateSrc, /source: 'welcome'/, 'Aktiver from the overlay is billed as welcome');
assert.equal(gateSrc.includes('accessReady && isActivatableModule'), false, 'do not hide the dialog while access is loading');

const appSrc = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
assert.match(appSrc, /ActivitiesWithGate/, 'FamilyDashboard → Activities must be gated');
assert.match(appSrc, /FamilyProgressWithGate/, 'stack FamilyProgress must be gated');
assert.match(appSrc, /gatedStackScreen/, 'stack routes share one gate helper');

const accessSrc = readFileSync(new URL('../utils/moduleAccess.js', import.meta.url), 'utf8');
assert.equal(accessSrc.includes("activatedAt: 'legacy'"), false, 'do not fake-activate existing families');
assert.match(accessSrc, /boolean `true`/, 'boolean true is not a billed activation');

const ctxSrc = readFileSync(new URL('../context/ModuleAccessContext.jsx', import.meta.url), 'utf8');
assert.equal(ctxSrc.includes('isLegacyModuleAccess(liveFamily) return true'), false);
assert.match(ctxSrc, /needsWelcome: \(\) => true/, 'missing provider must not silently unlock');

const shellSrc = readFileSync(new URL('../../components/AppShell.jsx', import.meta.url), 'utf8');
assert.match(shellSrc, /<ModuleActivationGate[\s\S]*?enabled=\{!kitchenMode\}/, 'do not disable the gate while family data is loading');

console.log(`moduleActivationRegistry.test.mjs: ok (${EXPECTED_IDS.length} modules)`);
