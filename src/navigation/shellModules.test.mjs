import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildShellModules,
  buildParentDashboardApps,
  buildChildDashboardApps,
  companyNavItems,
  isNavItemActive,
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
  for (const hidden of ['projects', 'anbud', 'kontrakt', 'skjema', 'chores', 'books', 'shop', 'meals', 'games', 'familyTree', 'boligmappa', 'matcoach', 'pantry']) {
    assert.equal(ids.includes(hidden), false, `${hidden} stays out of the personal shell`);
  }
  const main = sections.find((s) => s.id === 'main').items.map((i) => i.id);
  assert.deepEqual(main, ['home', 'chat', 'friends', 'plan', 'mail', 'stars', 'notes']);
  assert.equal(sections.some((s) => s.id === 'company'), false);
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
  assert.ok(ids.includes('kontrakt'));
  assert.ok(ids.includes('projects'));
  assert.equal(ids.includes('members'), false);
  assert.ok(ids.includes('mail'));
  const mainIds = company.find((s) => s.id === 'main').items.map((i) => i.id);
  assert.equal(mainIds.includes('anbud'), false);
  assert.equal(mainIds.includes('projects'), false);
  const companyItems = company.find((s) => s.id === 'company').items;
  assert.deepEqual(
    companyItems.map((i) => i.id),
    ['selskap', 'anbud', 'kontrakt', 'skjema', 'projects', 'okonomi'],
  );
  assert.equal(companyItems[0].label, 'Selskap');
  assert.equal(companyItems[0].action.tab, 'selskap');
  assert.equal(companyItems[0].forceOpen, true);
  assert.deepEqual(
    companyItems.find((i) => i.id === 'selskap').children.map((i) => i.label),
    ['Underenheter'],
  );
  assert.equal(companyItems.find((i) => i.id === 'selskap').children[0].action.subView, 'underenheter');
  assert.deepEqual(
    companyItems.find((i) => i.id === 'anbud').children.map((i) => i.label),
    ['1.1 Anbudsvarsling', '1.2 Anbudsforespørsel', '2. Tilbud'],
  );
  assert.equal(companyItems.find((i) => i.id === 'kontrakt').label, 'Kontrakt / avtale');
  assert.equal(companyItems.find((i) => i.id === 'okonomi').label, 'Økonomi');
  assert.deepEqual(
    companyItems.find((i) => i.id === 'okonomi').children.map((i) => i.label),
    ['Indeksregulering'],
  );
  const order = company.map((s) => s.id);
  assert.ok(order.indexOf('main') < order.indexOf('company'));
  assert.ok(order.indexOf('company') < order.indexOf('account'));
  assert.equal(company.find((s) => s.id === 'company').title, 'shell.company');
}

{
  const items = companyNavItems();
  const anbud = items.find((item) => item.id === 'anbud');
  const tilbud = anbud.children.find((item) => item.id === 'anbud-tilbud');
  const kontrakt = items.find((item) => item.id === 'kontrakt');
  assert.equal(isNavItemActive(anbud, 'anbud', 'varsling'), true);
  assert.equal(isNavItemActive(tilbud, 'anbud', 'tilbud'), true);
  assert.equal(isNavItemActive(tilbud, 'anbud', 'varsling'), false);
  assert.equal(isNavItemActive(kontrakt, 'kontrakt', null), true);
  assert.equal(isNavItemActive(kontrakt, 'anbud', 'tilbud'), false);
  const okonomi = items.find((item) => item.id === 'okonomi');
  const indeks = okonomi.children.find((item) => item.id === 'okonomi-indeks');
  assert.equal(isNavItemActive(okonomi, 'okonomi', 'indeks'), true);
  assert.equal(isNavItemActive(indeks, 'okonomi', 'indeks'), true);
  assert.equal(isNavItemActive(indeks, 'projects', null), false);
  const selskap = items.find((item) => item.id === 'selskap');
  const units = selskap.children.find((item) => item.id === 'underenheter');
  assert.equal(isNavItemActive(units, 'selskap', 'underenheter'), true);
  assert.equal(isNavItemActive(units, 'selskap', null), false);
  assert.equal(isNavItemActive(selskap, 'selskap', 'underenheter'), true);
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
assert.match(company, /CompanyStructureSettings/);
assert.match(company, /dataSet=\{\{ heading: '1' \}\}/);
assert.match(company, /alignSelf: 'flex-start'/);
assert.equal(company.includes('GroupSettings'), false);

const landing = readFileSync(new URL('../../screens/project/CompanyLanding.jsx', import.meta.url), 'utf8');
assert.match(landing, /nativeID="company-landing-logo"/);
assert.match(landing, /marginLeft: 'auto'/);
assert.equal(landing.includes('Underenheter og avdelinger'), false);
assert.equal(landing.includes('Underenheter i Enhetsregisteret'), false);

const unitsScreen = readFileSync(new URL('../../screens/project/CompanyUnitsScreen.jsx', import.meta.url), 'utf8');
assert.match(unitsScreen, /Underenheter/);
assert.match(unitsScreen, /CompanyStructureSettings/);

const appSrc = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
assert.match(appSrc, /StackShellChrome title="Velg organisasjon"/);

const anbudScreen = readFileSync(new URL('../../screens/anbud/AnbudScreen.jsx', import.meta.url), 'utf8');
assert.match(anbudScreen, /TenderInquiry/);
assert.equal(anbudScreen.includes("['kontrakt', 'Kontrakt']"), false);
assert.match(anbudScreen, /requestShellTab\?\.\('kontrakt'\)/);

const shellSrc = readFileSync(new URL('../../components/AppShell.jsx', import.meta.url), 'utf8');
assert.match(shellSrc, /tab === 'kontrakt'/);
assert.match(shellSrc, /tab === 'selskap'/);
assert.match(shellSrc, /moreSubView === 'underenheter'/);
assert.match(shellSrc, /CompanyUnitsScreen/);
assert.match(shellSrc, /tab === 'okonomi'/);
assert.match(shellSrc, /EconomyScreen/);
assert.match(shellSrc, /ContractScreen/);
const projectScreen = readFileSync(new URL('../../screens/project/ProjectWorkScreen.jsx', import.meta.url), 'utf8');
assert.equal(projectScreen.includes("['indeks', 'Indeksregulering']"), false);

console.log('shellModules.test.mjs: ok');
