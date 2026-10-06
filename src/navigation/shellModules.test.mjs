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
    for (const item of section.items || []) {
      ids.push(item.id);
      for (const child of item.children || []) ids.push(child.id);
    }
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
  for (const hidden of ['projects', 'anbud', 'kunder', 'kontrakt', 'skjema', 'chores', 'books', 'shop', 'meals', 'games', 'familyTree', 'boligmappa', 'matcoach', 'pantry']) {
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
    ['selskap', 'kunder', 'anbud', 'kontrakt', 'skjema', 'projects', 'okonomi'],
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
    ['1.1 Anbudsvarsling', '1.2 Anbudsforespørsel', '2. Tilbud', 'Innstillinger'],
  );
  assert.equal(companyItems.find((i) => i.id === 'kunder').action.tab, 'kunder');
  assert.equal(companyItems.find((i) => i.id === 'kontrakt').label, 'Kontrakt / avtale');
  assert.equal(companyItems.find((i) => i.id === 'kontrakt').action.tab, 'kontrakt');
  assert.equal(companyItems.find((i) => i.id === 'okonomi').label, 'Økonomi');
  assert.equal(companyItems.find((i) => i.id === 'okonomi').action.subView, 'oversikt');
  assert.deepEqual(
    companyItems.find((i) => i.id === 'okonomi').children.map((i) => i.label),
    ['Oversikt', 'Kunder', 'Avtaler', 'Indeksregulering'],
  );
  const okonomiKids = companyItems.find((i) => i.id === 'okonomi').children;
  assert.equal(okonomiKids.find((i) => i.id === 'okonomi-kunder').action.tab, 'okonomi');
  assert.equal(okonomiKids.find((i) => i.id === 'okonomi-kunder').action.subView, 'kunder');
  assert.equal(okonomiKids.find((i) => i.id === 'okonomi-avtaler').action.tab, 'okonomi');
  assert.equal(okonomiKids.find((i) => i.id === 'okonomi-avtaler').action.subView, 'avtaler');
  assert.equal(okonomiKids.find((i) => i.id === 'okonomi-avtaler').label, 'Avtaler');
  const order = company.map((s) => s.id);
  assert.ok(order.indexOf('main') < order.indexOf('company'));
  assert.ok(order.indexOf('company') < order.indexOf('account'));
  assert.equal(company.find((s) => s.id === 'company').title, 'shell.company');
}

{
  const items = companyNavItems();
  const anbud = items.find((item) => item.id === 'anbud');
  const tilbud = anbud.children.find((item) => item.id === 'anbud-tilbud');
  const okonomi = items.find((item) => item.id === 'okonomi');
  const kontrakt = items.find((item) => item.id === 'kontrakt');
  const kunder = items.find((item) => item.id === 'kunder');
  const okonomiKunder = okonomi.children.find((item) => item.id === 'okonomi-kunder');
  const okonomiAvtaler = okonomi.children.find((item) => item.id === 'okonomi-avtaler');
  assert.equal(isNavItemActive(anbud, 'anbud', 'varsling'), true);
  assert.equal(isNavItemActive(tilbud, 'anbud', 'tilbud'), true);
  assert.equal(isNavItemActive(tilbud, 'anbud', 'varsling'), false);
  assert.equal(isNavItemActive(kontrakt, 'kontrakt', null), true);
  assert.equal(isNavItemActive(kontrakt, 'anbud', 'tilbud'), false);
  assert.equal(isNavItemActive(kunder, 'kunder', null), true);
  assert.equal(isNavItemActive(okonomi, 'kunder', null), false);
  assert.equal(isNavItemActive(okonomi, 'kontrakt', null), false);
  assert.equal(isNavItemActive(okonomiKunder, 'okonomi', 'kunder'), true);
  assert.equal(isNavItemActive(okonomiKunder, 'kunder', null), false);
  assert.equal(isNavItemActive(okonomiAvtaler, 'okonomi', 'avtaler'), true);
  assert.equal(isNavItemActive(okonomiAvtaler, 'kontrakt', null), false);
  assert.equal(isNavItemActive(okonomi, 'okonomi', 'kunder'), true);
  assert.equal(isNavItemActive(okonomi, 'okonomi', 'avtaler'), true);
  const oversikt = okonomi.children.find((item) => item.id === 'okonomi-oversikt');
  const indeks = okonomi.children.find((item) => item.id === 'okonomi-indeks');
  assert.equal(okonomi.action.subView, 'oversikt');
  assert.equal(isNavItemActive(okonomi, 'okonomi', 'oversikt'), true);
  assert.equal(isNavItemActive(okonomi, 'okonomi', 'indeks'), true);
  assert.equal(isNavItemActive(oversikt, 'okonomi', 'oversikt'), true);
  assert.equal(isNavItemActive(oversikt, 'okonomi', 'indeks'), false);
  assert.equal(isNavItemActive(indeks, 'okonomi', 'indeks'), true);
  assert.equal(isNavItemActive(indeks, 'okonomi', 'oversikt'), false);
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
assert.match(company, /requestShellTab\?\.\('selskap', 'underenheter'\)/);
assert.equal(company.includes('GroupSettings'), false);

const landing = readFileSync(new URL('../../screens/project/CompanyLanding.jsx', import.meta.url), 'utf8');
assert.match(landing, /nativeID="company-landing-logo"/);
assert.match(landing, /marginLeft: 'auto'/);
assert.match(landing, /nativeID="company-landing-konsern"/);
assert.match(landing, /nativeID="company-landing-units"/);
assert.match(landing, /onUnits/);
assert.equal(landing.includes('Underenheter og avdelinger'), false);
assert.equal(landing.includes('Underenheter i Enhetsregisteret'), false);
assert.equal(landing.includes('Arbeidsflaten'), false);
assert.equal(landing.includes('Offentlige tildelinger på Doffin'), false);
assert.equal(landing.includes('Egne koder til anbudsvarsling'), false);
assert.match(landing, /Anbud · Innstillinger/);
assert.equal(landing.includes('primaryTxt'), false);
assert.equal(landing.includes('AccountHistoryCard'), false);
assert.equal(landing.includes('account-history'), false);
assert.equal(landing.includes('Regnskap og nøkkeltall'), false);

const economyWelcome = readFileSync(new URL('../../screens/economy/EconomyWelcome.jsx', import.meta.url), 'utf8');
assert.match(economyWelcome, /AccountHistoryCard/);
assert.match(economyWelcome, /nativeID="economy-accounts"/);

const unitsScreen = readFileSync(new URL('../../screens/project/CompanyUnitsScreen.jsx', import.meta.url), 'utf8');
assert.match(unitsScreen, /Underenheter/);
assert.match(unitsScreen, /CompanyStructureSettings/);

const appSrc = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
assert.match(appSrc, /StackShellChrome title="Velg organisasjon"/);

const anbudScreen = readFileSync(new URL('../../screens/anbud/AnbudScreen.jsx', import.meta.url), 'utf8');
assert.match(anbudScreen, /TenderInquiry/);
assert.match(anbudScreen, /WatchSettings/);
assert.equal(anbudScreen.includes("['kontrakt', 'Kontrakt']"), false);
assert.match(anbudScreen, /requestShellTab\?\.\('kontrakt'\)/);
assert.equal(anbudScreen.includes('motta eller send'), false);

const watchSettings = readFileSync(new URL('../../screens/anbud/WatchSettings.jsx', import.meta.url), 'utf8');
assert.match(watchSettings, /CPV fra offentlige tildelinger/);
assert.match(watchSettings, /Egne koder til anbudsvarsling/);
assert.match(watchSettings, /PortalSettings/);
assert.match(watchSettings, /AI-profil/);
assert.match(watchSettings, /La AI tolke bedriften/);
assert.match(watchSettings, /Hjemmeside/);

const tenderAlert = readFileSync(new URL('../../screens/anbud/TenderAlert.jsx', import.meta.url), 'utf8');
assert.equal(tenderAlert.includes('CPV som søkes'), false);
assert.match(tenderAlert, /Se og endre kodene under Innstillinger/);
assert.equal(tenderAlert.includes("label: 'Matcher'"), false);
assert.match(tenderAlert, /padStart\(2, '0'\)/);
assert.match(tenderAlert, /#64748b/);
assert.match(tenderAlert, /Godt treff/);
assert.match(tenderAlert, /Vurder treff med AI/);
assert.match(tenderAlert, /\['nye', 'Nye', 'emphasis'\]/);
assert.match(tenderAlert, /TenderMap/);
assert.match(tenderAlert, /\['uaktuelle', 'Uaktuelle', 'plain'\]/);

const tenderMap = readFileSync(new URL('../../screens/anbud/TenderMap.jsx', import.meta.url), 'utf8');
assert.match(tenderMap, /OpenStreetMap/);
assert.match(tenderMap, /Kartverket/);
assert.match(tenderMap, /Åpne i listen/);
assert.match(tenderMap, /Forrige/);
assert.match(tenderMap, /Neste/);
assert.match(tenderMap, /Uaktuell/);
assert.match(tenderMap, /Merk \$\{current\.title\} som aktuell/);
assert.match(tenderAlert, /busyId=\{pullingId\}/);
assert.match(tenderAlert, /toggle: false, reveal: true/);
assert.match(tenderAlert, /nextNoticeDecision/);
assert.match(tenderMap, /height: 440/);

const inquirySrc = readFileSync(new URL('../../screens/anbud/TenderInquiry.jsx', import.meta.url), 'utf8');
assert.equal(inquirySrc.includes('Send i ProTop'), false);
assert.equal(inquirySrc.includes('sendDirectAnbud'), false);
assert.match(inquirySrc, /Registrer forespørsler dere mottar/);

const intakeSrc = readFileSync(new URL('../../screens/anbud/IntakePanel.jsx', import.meta.url), 'utf8');
assert.equal(intakeSrc.includes('sendDirectAnbud'), false);
assert.equal(intakeSrc.includes('Send forespørsel'), false);
assert.match(intakeSrc, /Registrer forespørsel/);

const shellSrc = readFileSync(new URL('../../components/AppShell.jsx', import.meta.url), 'utf8');
assert.match(shellSrc, /tab === 'kontrakt'/);
assert.match(shellSrc, /tab === 'kunder'/);
assert.match(shellSrc, /CustomersScreen/);
assert.match(shellSrc, /tab === 'selskap'/);
assert.match(shellSrc, /moreSubView === 'underenheter'/);
assert.match(shellSrc, /CompanyUnitsScreen/);
assert.match(shellSrc, /tab === 'okonomi'/);
assert.match(shellSrc, /EconomyScreen/);
assert.match(shellSrc, /defaultOkonomiSubView/);
assert.match(shellSrc, /subView=\{moreSubView\}/);
assert.match(shellSrc, /ContractScreen/);
const economyScreen = readFileSync(new URL('../../screens/economy/EconomyScreen.jsx', import.meta.url), 'utf8');
assert.match(economyScreen, /EconomyWelcome/);
assert.match(economyScreen, /EconomyDesk/);
assert.match(economyScreen, /EconomyCustomers/);
assert.match(economyScreen, /EconomyContracts/);
assert.match(economyScreen, /openIndexIntentFromContract/);
assert.match(economyScreen, /EconomyIndex/);
assert.equal(economyScreen.includes('IndeksreguleringPanel'), false);
assert.match(economyScreen, /page === 'indeks'/);
assert.match(economyScreen, /page === 'kunder'/);
assert.match(economyScreen, /page === 'avtaler'/);
assert.match(economyScreen, /requestShellTab\?\.\('kunder'/);
assert.match(economyScreen, /requestShellTab\?\.\('kontrakt'/);
assert.match(economyScreen, /indexOpen/);
assert.equal(economyScreen.includes('phone: company'), false);
const economyIndex = readFileSync(new URL('../../screens/economy/EconomyIndex.jsx', import.meta.url), 'utf8');
assert.match(economyIndex, /draftFromRegisteredContract/);
assert.match(economyIndex, /fetchSeriesById/);
assert.match(economyIndex, /Påkrevd for beregningen/);
const customerScreen = readFileSync(new URL('../../screens/customers/CustomersScreen.jsx', import.meta.url), 'utf8');
assert.match(customerScreen, /searchBrregCompanies/);
assert.match(customerScreen, /parseCustomerFile/);
assert.match(customerScreen, /identityFieldsForKind/);
const projectScreen = readFileSync(new URL('../../screens/project/ProjectWorkScreen.jsx', import.meta.url), 'utf8');
assert.equal(projectScreen.includes("['indeks', 'Indeksregulering']"), false);

console.log('shellModules.test.mjs: ok');
