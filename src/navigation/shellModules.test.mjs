import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildShellModules,
  buildParentDashboardApps,
  buildChildDashboardApps,
} from './shellModules.js';
import { applyProtopActivationSections, PROTOP_SHELL_MODULE_IDS } from './protopShell.js';
import { listModulesByCategory } from '../modules/moduleActivationRegistry.js';

const t = (k) => k;
const kid = { id: 'k1', name: 'Kari' };

function idsIn(sections) {
  const ids = [];
  for (const section of sections) {
    for (const item of section.items || []) ids.push(item.id);
  }
  return ids;
}

{
  const sections = buildShellModules({
    t, asChild: false, asParent: true, isSuperAdmin: true,
    familyId: 'F', hasKids: true, childForSchedule: kid, firstKid: kid,
  });
  const ids = idsIn(sections);
  for (const id of ['home', 'friends', 'chat', 'plan', 'mail', 'stars', 'notes', 'settings', 'help', 'legal', 'moduleAccess']) {
    assert.ok(ids.includes(id), id);
  }
  const account = sections.find((s) => s.id === 'account');
  assert.ok(account.items.some((i) => i.id === 'settings'));
  assert.ok(account.items.some((i) => i.id === 'help'));
  assert.ok(account.items.some((i) => i.id === 'legal'));
  for (const hidden of ['projects', 'anbud', 'chores', 'books', 'shop', 'meals', 'games', 'familyTree', 'boligmappa', 'matcoach', 'pantry']) {
    assert.equal(ids.includes(hidden), false, `${hidden} stays out of the personal shell`);
  }
  const main = sections.find((s) => s.id === 'main').items.map((i) => i.id);
  assert.deepEqual(main, ['home', 'chat', 'friends', 'plan', 'mail', 'stars', 'notes']);
  assert.ok(main.indexOf('friends') < main.indexOf('plan'));
  assert.ok(main.includes('mail'));
  assert.ok(main.includes('notes'));
}

{
  const noFamily = buildShellModules({
    t, asChild: false, asParent: true, isSuperAdmin: false,
    familyId: null, hasKids: false, childForSchedule: null, firstKid: null,
  });
  assert.ok(idsIn(noFamily).includes('friends'), 'Venner is in the shell without a family id');
  assert.ok(idsIn(noFamily).includes('mail'));
  assert.equal(idsIn(noFamily).includes('anbud'), false);
}

{
  const company = buildShellModules({
    t, asChild: false, asParent: true, isSuperAdmin: false,
    familyId: 'F', family: { type: 'organization', name: 'ProTop AS' },
    hasKids: false, childForSchedule: null, firstKid: null,
  });
  const ids = idsIn(company);
  assert.ok(ids.includes('anbud'));
  assert.ok(ids.includes('projects'));
  assert.equal(ids.includes('members'), false);
  assert.ok(ids.includes('mail'));
}

{
  const child = buildShellModules({
    t, asChild: true, asParent: false, isSuperAdmin: false,
    familyId: 'F', hasKids: false, childForSchedule: kid, firstKid: kid,
  });
  const ids = idsIn(child);
  assert.ok(ids.includes('mail'), 'e-post stays in the shell');
  assert.equal(ids.includes('chores'), false);
  assert.equal(ids.includes('klassen'), false);
  assert.ok(PROTOP_SHELL_MODULE_IDS.includes('notes'));
}

{
  const parentApps = buildParentDashboardApps({
    t, familyId: 'F', eventCount: 2, hasKids: true, firstKid: kid,
  });
  const ids = parentApps.map((a) => a.id);
  assert.deepEqual(ids.sort(), ['chat', 'friends', 'mail', 'notes', 'plan', 'stars']);
}

{
  const childApps = buildChildDashboardApps({
    t, familyId: 'F', child: kid, eventCount: 0,
  });
  const ids = childApps.map((a) => a.id);
  for (const id of ids) {
    assert.ok(['home', 'friends', 'chat', 'plan', 'mail', 'stars', 'notes'].includes(id), id);
  }
  assert.ok(ids.includes('plan'));
  assert.ok(ids.includes('notes'));
  assert.equal(ids.includes('chores'), false);
  assert.equal(ids.includes('skole'), false);
}

{
  const activation = applyProtopActivationSections(listModulesByCategory());
  assert.deepEqual(activation.map((s) => s.id), ['main']);
  assert.deepEqual(
    activation.flatMap((s) => s.items.map((i) => i.id)),
    ['plan', 'mail', 'stars', 'notes', 'chat'],
  );
  const names = activation.flatMap((s) => s.items.map((i) => i.name));
  for (const hidden of ['Gjøremål', 'Handleliste', 'Familiealbum', 'Skole', 'Kjøretøy', 'Dokumenter', 'Utleie']) {
    assert.equal(names.includes(hidden), false, `${hidden} stays out of activation settings`);
  }
}

const linking = readFileSync(new URL('./linking.js', import.meta.url), 'utf8');
assert.match(linking, /FamilyOverview:\s*'organisasjoner'/);
assert.equal(linking.includes("FamilyOverview: 'families'"), false);

const orgScreen = readFileSync(new URL('../../screens/FamilyOverviewScreen.jsx', import.meta.url), 'utf8');
assert.equal(/fontWeight:\s*'[6-9]00'/.test(orgScreen), false);
assert.match(orgScreen, /styles\.grid/);
assert.match(orgScreen, /width: 320/);

const company = readFileSync(new URL('../../screens/project/ProjectPlatformScreen.jsx', import.meta.url), 'utf8');
assert.equal(/fontWeight:\s*'[7-9]00'/.test(company), false);
assert.match(company, /dataSet=\{\{ heading: '1' \}\}/);
assert.match(company, /alignSelf: 'flex-start'/);
assert.equal(company.includes('GroupSettings'), false);

const appSrc = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
assert.match(appSrc, /StackShellChrome title="Velg organisasjon"/);

console.log('shellModules.test.mjs: ok');
