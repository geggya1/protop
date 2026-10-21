import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildShellModules,
  buildParentDashboardApps,
  buildChildDashboardApps,
  companyHasRegisteredUnits,
  companyNavItems,
  defaultOkonomiSubView,
  drawerGroupOpen,
  drawerHasSubmenuToggle,
  drawerSubmenuOpen,
  groupCompanyDrawerItems,
  isNavItemActive,
  releaseClosedActiveGroups,
  releaseClosedActiveSubmenus,
  normalizeShellSelection,
  okonomiMenuTitle,
} from './shellModules.js';
import { filterCompanyNav, standardGrants } from '../access/companyAccess.js';
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
  for (const hidden of ['projects', 'anbud', 'kunder', 'ansatte', 'kontrakt', 'skjema', 'chores', 'books', 'shop', 'meals', 'games', 'familyTree', 'boligmappa', 'matcoach', 'pantry']) {
    assert.equal(ids.includes(hidden), false, `${hidden} stays out of the personal shell`);
  }
  const main = sections.find((s) => s.id === 'main').items.map((i) => i.id);
  assert.deepEqual(main, ['home', 'chat', 'friends', 'plan', 'mail', 'stars', 'notes', 'timeliste']);
  const ownSheet = sections.find((s) => s.id === 'main').items.find((i) => i.id === 'timeliste');
  assert.equal(ownSheet.label, 'Timeliste');
  assert.equal(ownSheet.action.tab, 'timeliste');
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
  assert.ok(mainIds.includes('timeliste'));
  assert.equal(company.find((s) => s.id === 'main').items.find((i) => i.id === 'timeliste').action.tab, 'timeliste');
  assert.equal(mainIds.includes('anbud'), false);
  assert.equal(mainIds.includes('projects'), false);
  const companyItems = company.find((s) => s.id === 'company').items;
  assert.deepEqual(
    companyItems.map((i) => i.id),
    [
      'selskap', 'selskapsinnstillinger', 'ansatte', 'hr', 'fravaer', 'arbeid', 'produktivitet',
      'kunder', 'anbud', 'kontrakt', 'projects', 'produkt', 'utstyr', 'kjorebok', 'okonomi', 'iso',
    ],
  );
  assert.equal(companyItems[0].label, 'Selskap');
  assert.equal(companyItems[0].action.tab, 'selskap');
  assert.equal(companyItems[0].children, undefined);
  assert.equal(companyItems[0].forceOpen, undefined);
  assert.equal(companyItems.some((i) => i.id === 'underenheter'), false);
  assert.equal(companyHasRegisteredUnits(undefined), false);
  assert.equal(companyHasRegisteredUnits({}), false);
  assert.equal(companyHasRegisteredUnits({ subUnits: [] }), false);
  assert.equal(
    companyHasRegisteredUnits({
      subUnits: [{ kind: 'underenhet', name: 'Filial', organisasjonsnummer: '123456789' }],
    }),
    true,
  );
  const withUnits = buildShellModules({
    t, asChild: false, asParent: true, isSuperAdmin: false,
    familyId: 'F',
    family: {
      type: 'organization',
      name: 'ProTop AS',
      company: {
        navn: 'ProTop AS',
        subUnits: [{ kind: 'underenhet', name: 'Filial', organisasjonsnummer: '123456789' }],
      },
    },
    hasKids: false, childForSchedule: null, firstKid: null,
  });
  const withUnitIds = withUnits.find((s) => s.id === 'company').items.map((i) => i.id);
  assert.ok(withUnitIds.includes('underenheter'));
  assert.ok(withUnitIds.indexOf('selskap') < withUnitIds.indexOf('underenheter'));
  assert.ok(withUnitIds.indexOf('underenheter') < withUnitIds.indexOf('selskapsinnstillinger'));
  const settings = companyItems.find((i) => i.id === 'selskapsinnstillinger');
  assert.equal(settings.label, 'Selskapsinnstillinger');
  assert.equal(settings.action.subView, 'innstillinger');
  assert.deepEqual(
    settings.children.map((i) => i.label),
    ['Tilgangsstyring'],
  );
  assert.equal(settings.children[0].action.subView, 'tilgang');
  assert.equal(companyItems.find((i) => i.id === 'ansatte').action.tab, 'ansatte');
  const hr = companyItems.find((i) => i.id === 'hr');
  assert.equal(hr.action.tab, 'hr');
  assert.equal(hr.children.length, 7);
  assert.deepEqual(
    companyItems.find((i) => i.id === 'anbud').children.map((i) => i.label),
    ['1.1 Anbudsvarsling', '1.2 Anbudsforespørsel', '2. Vurdering av aktuelle', '3. Tilbud', 'Innstillinger'],
  );
  assert.equal(
    companyItems.find((i) => i.id === 'anbud').children.find((i) => i.id === 'anbud-innstillinger').action.subView,
    'innstillinger',
  );
  assert.equal(companyItems.find((i) => i.id === 'kunder').action.tab, 'kunder');
  assert.equal(companyItems.find((i) => i.id === 'kontrakt').label, 'Kontrakt / avtale');
  assert.equal(companyItems.find((i) => i.id === 'kontrakt').action.tab, 'kontrakt');
  assert.equal(companyItems.find((i) => i.id === 'okonomi').label, 'Økonomi');
  assert.equal(companyItems.find((i) => i.id === 'okonomi').action.subView, 'oversikt');
  assert.equal(companyItems.find((i) => i.id === 'okonomi').forceOpen, undefined);
  const arbeid = companyItems.find((i) => i.id === 'arbeid');
  const fravaer = companyItems.find((i) => i.id === 'fravaer');
  const produktivitet = companyItems.find((i) => i.id === 'produktivitet');
  assert.deepEqual(
    arbeid.children.map((i) => i.label),
    ['Timeliste', 'Timerapport', 'Timesaldo', 'Godkjenninger'],
  );
  assert.deepEqual(
    fravaer.children.map((i) => i.label),
    ['Fraværsoversikt', 'Fraværsrapport', 'Planlagt fravær', 'Innstillinger'],
  );
  assert.equal(fravaer.children.find((i) => i.id === 'fravaer-innstillinger').action.subView, 'fravaer-innstillinger');
  assert.equal(produktivitet.action.tab, 'arbeid');
  assert.equal(produktivitet.action.subView, 'produktivitet');
  assert.deepEqual(
    companyItems.find((i) => i.id === 'produkt').children.map((i) => i.label),
    ['Produktsalg', 'Produkt'],
  );
  assert.equal(companyItems.find((i) => i.id === 'produkt').children[0].action.tab, 'arbeid');
  assert.equal(companyItems.find((i) => i.id === 'produkt').children[0].action.subView, 'salg');
  assert.equal(companyItems.find((i) => i.id === 'produkt').children[1].action.tab, 'okonomi');
  assert.equal(companyItems.find((i) => i.id === 'produkt').children[1].action.subView, 'produkter');
  assert.equal(arbeid.action.subView, 'timeliste');
  assert.equal(arbeid.children[1].action.tab, 'arbeid');
  assert.equal(arbeid.children[1].action.subView, 'timerapport');
  const kjorebok = companyItems.find((i) => i.id === 'kjorebok');
  assert.equal(kjorebok.label, 'Kjørebok');
  assert.equal(kjorebok.action.tab, 'okonomi');
  assert.equal(kjorebok.action.subView, 'kjorebok');
  assert.equal(kjorebok.children, undefined);
  assert.ok(companyItems.findIndex((i) => i.id === 'kjorebok') < companyItems.findIndex((i) => i.id === 'okonomi'));
  assert.ok(companyItems.findIndex((i) => i.id === 'okonomi') < companyItems.findIndex((i) => i.id === 'iso'));
  assert.deepEqual(
    companyItems.find((i) => i.id === 'okonomi').children.map((i) => i.label),
    ['Oversikt', 'Inntjening', 'Kundesummer', 'Avtalesummer', 'Faktura', 'Fakturagrunnlag', 'Utlegg', 'Prosjektutlegg', 'Indeksregulering', 'Indekser', 'Innstillinger'],
  );
  const okonomiKids = companyItems.find((i) => i.id === 'okonomi').children;
  assert.equal(okonomiKids.find((i) => i.id === 'okonomi-kunder').action.tab, 'okonomi');
  assert.equal(okonomiKids.find((i) => i.id === 'okonomi-kunder').action.subView, 'kunder');
  assert.equal(okonomiKids.find((i) => i.id === 'okonomi-avtaler').action.tab, 'okonomi');
  assert.equal(okonomiKids.find((i) => i.id === 'okonomi-avtaler').action.subView, 'avtaler');
  assert.equal(okonomiKids.find((i) => i.id === 'okonomi-avtaler').label, 'Avtalesummer');
  assert.equal(okonomiKids.find((i) => i.id === 'okonomi-kunder').label, 'Kundesummer');
  assert.equal(okonomiKids.find((i) => i.id === 'okonomi-prosjektutlegg').action.tab, 'arbeid');
  assert.equal(okonomiKids.find((i) => i.id === 'okonomi-prosjektutlegg').action.subView, 'utlegg');
  const accountItems = company.find((s) => s.id === 'account').items;
  assert.equal(accountItems[0].id, 'tilgang');
  assert.equal(accountItems[0].action.subView, 'tilgang');
  assert.equal(accountItems[1].id, 'skjema');
  assert.equal(accountItems[1].label, 'Skjemabygger');
  assert.equal(accountItems[1].action.tab, 'skjema');
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
  const kjorebok = items.find((item) => item.id === 'kjorebok');
  assert.equal(isNavItemActive(kjorebok, 'okonomi', 'kjorebok'), true);
  assert.equal(isNavItemActive(kjorebok, 'okonomi', 'oversikt'), false);
  assert.equal(isNavItemActive(okonomi, 'okonomi', 'kjorebok'), false);
  assert.equal(drawerSubmenuOpen(okonomi, 'okonomi', {}, 'kjorebok'), false);
  assert.equal(defaultOkonomiSubView('kjorebok'), 'kjorebok');
  assert.equal(okonomiMenuTitle('kjorebok'), 'Kjørebok');
  const selskap = items.find((item) => item.id === 'selskap');
  const settings = items.find((item) => item.id === 'selskapsinnstillinger');
  const units = companyNavItems({ includeUnderenheter: true }).find((item) => item.id === 'underenheter');
  assert.equal(isNavItemActive(selskap, 'selskap', null), true);
  assert.equal(isNavItemActive(selskap, 'selskap', 'innstillinger'), false);
  assert.equal(isNavItemActive(settings, 'selskap', 'innstillinger'), true);
  assert.equal(isNavItemActive(settings, 'selskap', 'underenheter'), false);
  assert.equal(isNavItemActive(settings, 'selskap', null), false);
  assert.equal(isNavItemActive(units, 'selskap', 'underenheter'), true);
  assert.equal(isNavItemActive(units, 'selskap', 'innstillinger'), false);
  assert.deepEqual(normalizeShellSelection('friends'), { tab: 'more', subView: 'friends' });
  assert.deepEqual(normalizeShellSelection('friends', 'ignored'), { tab: 'more', subView: 'friends' });
  assert.deepEqual(normalizeShellSelection('anbud', 'tilbud'), { tab: 'anbud', subView: 'tilbud' });
  assert.deepEqual(normalizeShellSelection('projects'), { tab: 'projects', subView: null });
}

{
  const child = buildShellModules({
    t, asChild: true, asParent: false, isSuperAdmin: false,
    familyId: 'F', hasKids: false, childForSchedule: kid, firstKid: kid,
  });
  const ids = idsIn(child);
  assert.ok(ids.includes('mail'), 'e-post stays in the shell');
  assert.equal(ids.includes('chores'), false);
  assert.equal(ids.includes('timeliste'), false);
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
assert.match(company, /Selskapsinnstillinger/);
assert.match(company, /Tilgangsstyring/);
assert.equal(company.includes('Fraværstyper'), false);
assert.equal(company.includes('Kontoplan'), false);
assert.equal(company.includes('Virksomhetskoder og fagområder'), false);
assert.equal(company.includes('Søk i CPV'), false);
assert.equal(company.includes('GroupSettings'), false);

const landing = readFileSync(new URL('../../screens/project/CompanyLanding.jsx', import.meta.url), 'utf8');
const phoneHome = readFileSync(new URL('../../screens/project/CompanyHomePhone.jsx', import.meta.url), 'utf8');
const desktopLanding = readFileSync(new URL('../../screens/project/CompanyDesktopLanding.jsx', import.meta.url), 'utf8');
const companyHomeModel = readFileSync(new URL('../companyHome/model.js', import.meta.url), 'utf8');
assert.equal(landing.includes('CompanyHomePhone'), false);
assert.match(landing, /CompanyDesktopLanding/);
assert.match(landing, /innstillinger/);
assert.match(phoneHome, /nativeID="company-home"/);
assert.match(phoneHome, /Mine gjøremål/);
assert.match(phoneHome, /COMPANY_HOME_SHORTCUTS/);
assert.match(phoneHome, /DashboardThemeSettings/);
assert.match(companyHomeModel, /Timeføring/);
assert.match(companyHomeModel, /Fravær\/Ferie/);
assert.match(companyHomeModel, /'Gjøremål'/);
assert.match(companyHomeModel, /'Utlegg'/);
assert.equal((phoneHome.match(/fontWeight:\s*'700'/g) || []).length, 1);
assert.equal(phoneHome.includes('WidgetBoard'), false);
assert.equal(phoneHome.includes('company-landing-konsern'), false);
assert.match(desktopLanding, /CompanyPublicProfile/);
assert.match(desktopLanding, /publicPage/);
const profilePage = readFileSync(new URL('../../components/project/CompanyPublicProfile.jsx', import.meta.url), 'utf8');
assert.match(profilePage, /company-landing-konsern/);
assert.match(profilePage, /Om bedriften/);
assert.match(profilePage, /Underenheter/);
assert.match(profilePage, /CompanyNewsWall/);
assert.match(profilePage, /Rediger side/);
assert.match(profilePage, /company-landing-logo/);
assert.equal(desktopLanding.includes('COMPANY_HOME_SHORTCUTS'), false);
assert.equal(desktopLanding.includes('Mine gjøremål'), false);
assert.equal(desktopLanding.includes('WidgetBoard'), false);
assert.equal(desktopLanding.includes('Underenheter og avdelinger'), false);
assert.equal(desktopLanding.includes('Underenheter i Enhetsregisteret'), false);
assert.equal(desktopLanding.includes('Arbeidsflaten'), false);
assert.equal(desktopLanding.includes('Offentlige tildelinger på Doffin'), false);
assert.equal(desktopLanding.includes('Egne koder til anbudsvarsling'), false);
assert.equal(desktopLanding.includes('primaryTxt'), false);
assert.equal(desktopLanding.includes('AccountHistoryCard'), false);
assert.equal(desktopLanding.includes('account-history'), false);
assert.equal(desktopLanding.includes('Regnskap og nøkkeltall'), false);

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
assert.match(anbudScreen, /ScrollSheet/);
assert.match(anbudScreen, /go\('innstillinger'\)/);
assert.match(anbudScreen, /step === 'innstillinger'/);
assert.equal(anbudScreen.includes("['kontrakt', 'Kontrakt']"), false);
assert.match(anbudScreen, /requestShellTab\?\.\('kontrakt'\)/);
assert.equal(anbudScreen.includes('Registrer inngått'), false);
assert.equal(anbudScreen.includes('ContractFollowUp'), false);
assert.equal(anbudScreen.includes('AVROP_PATH'), false);
assert.equal(anbudScreen.includes('4. Avtale'), false);
assert.equal(anbudScreen.includes('PipelineBoard'), false);
assert.equal(anbudScreen.includes('motta eller send'), false);
const contractScreen = readFileSync(new URL('../../screens/anbud/ContractScreen.jsx', import.meta.url), 'utf8');
assert.equal(contractScreen.includes('AVROP_PATH'), false);
assert.equal(contractScreen.includes('CalloffInbox'), false);
assert.match(contractScreen, /Ny avtale/);
assert.match(contractScreen, /AgreementCreateWizard/);
assert.match(contractScreen, /AgreementTreatment/);
assert.equal(contractScreen.includes('Pipeline'), false);

const watchSettings = readFileSync(new URL('../../screens/anbud/WatchSettings.jsx', import.meta.url), 'utf8');
assert.match(watchSettings, /Anbudsinnstillinger/);
assert.match(watchSettings, /CPV fra offentlige tildelinger/);
assert.match(watchSettings, /Egne koder til anbudsvarsling/);
assert.match(watchSettings, /PortalSettings/);
assert.match(watchSettings, /AI-profil/);
assert.match(watchSettings, /La AI tolke bedriften/);
assert.match(watchSettings, /Hjemmeside/);

const tenderAlert = readFileSync(new URL('../../screens/anbud/TenderAlert.jsx', import.meta.url), 'utf8');
assert.equal(tenderAlert.includes('CPV som søkes'), false);
assert.match(tenderAlert, /Åpne innstillinger for CPV og søk/);
assert.equal(tenderAlert.includes('Se og endre kodene under Innstillinger'), false);
assert.equal(tenderAlert.includes("label: 'Matcher'"), false);
assert.match(tenderAlert, /padStart\(2, '0'\)/);
assert.match(tenderAlert, /#64748b/);
assert.match(tenderAlert, /Godt treff/);
assert.match(tenderAlert, /Vurder treff med AI/);
assert.match(tenderAlert, /\['nye', 'Nye', 'emphasis'\]/);
assert.match(tenderAlert, /TenderMap/);
assert.match(tenderAlert, /InfoButton title="Oppsummering"/);
assert.match(tenderAlert, /PhoneMapDock/);
assert.match(tenderAlert, /PHONE_PREVIEW_MAP_HEIGHT/);
assert.match(tenderAlert, /brief/);
assert.equal(tenderAlert.includes('{phone ? summary : null}'), false);
const phoneMapDock = readFileSync(new URL('../../screens/anbud/PhoneMapDock.jsx', import.meta.url), 'utf8');
assert.match(phoneMapDock, /Dra inn fra høyre marg/);
assert.match(phoneMapDock, /Mindre visning/);
assert.match(tenderAlert, /\['uaktuelle', 'Uaktuelle', 'plain'\]/);

const tenderMap = readFileSync(new URL('../../screens/anbud/TenderMap.jsx', import.meta.url), 'utf8');
assert.match(tenderMap, /brief/);
assert.match(tenderMap, /OpenStreetMap/);
assert.match(tenderMap, /Kartverket/);
assert.match(tenderMap, /Åpne i listen/);
assert.match(tenderMap, /Forrige/);
assert.match(tenderMap, /Neste/);
assert.match(tenderMap, /Uaktuell/);
assert.match(tenderMap, /Merk \$\{current\.title\} som aktuell/);
assert.match(tenderAlert, /busyId=\{pullingId\}/);
assert.match(tenderAlert, /toggle: false, reveal: false/);
assert.equal(tenderAlert.includes('reveal: true'), false);
assert.equal(tenderAlert.includes('reveal: !phone'), false);
assert.match(tenderAlert, /followList: false/);
assert.match(tenderAlert, /Uaktuell er tatt ut av listen/);
assert.match(tenderAlert, /nextRowAfterRemoval/);
assert.match(tenderAlert, /followId=\{mapFollow\.id\}/);
assert.match(tenderMap, /silent: true/);
assert.match(tenderAlert, /mapFollowsList/);
assert.match(tenderAlert, /asShown: true/);
assert.match(tenderAlert, /view=\{mapFollowsList\(filter\) \? filter : ''\}/);
assert.match(tenderMap, /Ingen treff å vise på kartet i denne visningen/);
const tenderMapHtml = readFileSync(new URL('../../src/anbud/tenderMapHtml.js', import.meta.url), 'utf8');
assert.match(tenderMapHtml, /pin\.uaktuell/);
assert.match(tenderMap, /focusId/);
assert.match(tenderAlert, /nextNoticeDecision/);
assert.match(tenderAlert, /Valgt på kartet/);
assert.match(tenderAlert, /onPreview=\{highlightFromMap\}/);
assert.match(tenderMap, /onPreview\?\.\(id\)/);
assert.match(tenderMap, /height: 440/);
assert.match(tenderMap, /mapHeight/);
assert.match(tenderAlert, /Dra for å endre bredden på kartet/);
assert.match(tenderAlert, /RegionCoverage/);
assert.match(watchSettings, /RegionCoverage/);
assert.match(anbudScreen, /units=\{units\}/);

const inquirySrc = readFileSync(new URL('../../screens/anbud/TenderInquiry.jsx', import.meta.url), 'utf8');
assert.equal(inquirySrc.includes('Send i ProTop'), false);
assert.equal(inquirySrc.includes('sendDirectAnbud'), false);
assert.match(inquirySrc, /IntakePanel/);
assert.equal(inquirySrc.includes('Registrer forespørsler dere mottar'), false);

const intakeSrc = readFileSync(new URL('../../screens/anbud/IntakePanel.jsx', import.meta.url), 'utf8');
assert.equal(intakeSrc.includes('sendDirectAnbud'), false);
assert.equal(intakeSrc.includes('Send forespørsel'), false);
assert.match(intakeSrc, /Registrer forespørsel/);

const shellSrc = readFileSync(new URL('../../components/AppShell.jsx', import.meta.url), 'utf8');
assert.match(shellSrc, /tab === 'kontrakt'/);
assert.match(shellSrc, /tab === 'kunder'/);
assert.match(shellSrc, /tab === 'ansatte'/);
assert.match(shellSrc, /EmployeesScreen/);
assert.match(shellSrc, /CustomersScreen/);
assert.match(shellSrc, /tab === 'selskap'/);
assert.match(shellSrc, /moreSubView === 'underenheter'/);
assert.match(shellSrc, /moreSubView === 'innstillinger'/);
assert.match(shellSrc, /AbsenceSettingsScreen/);
assert.match(shellSrc, /EconomySettingsScreen/);
assert.match(shellSrc, /CompanyLanding/);
assert.match(shellSrc, /CompanyUnitsScreen/);
const absenceSettingsSrc = readFileSync(new URL('../../screens/arbeid/AbsenceSettingsScreen.jsx', import.meta.url), 'utf8');
assert.match(absenceSettingsSrc, /Fraværsinnstillinger/);
assert.match(absenceSettingsSrc, /id: 'ferieplan'/);
assert.match(absenceSettingsSrc, /VacationPlanPanel/);
assert.match(absenceSettingsSrc, /variant="settings"/);
assert.match(
  readFileSync(new URL('../../screens/arbeid/AbsenceScreens.jsx', import.meta.url), 'utf8'),
  /variant="board"/,
);
const vacationPanelSrc = readFileSync(new URL('../../components/arbeid/VacationPlanPanel.jsx', import.meta.url), 'utf8');
assert.match(vacationPanelSrc, /Skal godkjennes/);
assert.match(vacationPanelSrc, /openingBalanceYearLabel/);
assert.match(vacationPanelSrc, /firstWorkingDayBalanceReminder/);
assert.match(vacationPanelSrc, /Dager igjen/);
assert.match(
  readFileSync(new URL('../../src/arbeid/vacationPlan.js', import.meta.url), 'utf8'),
  /Inngående feriedagssaldo til/,
);
assert.match(
  readFileSync(new URL('../../screens/economy/EconomySettingsScreen.jsx', import.meta.url), 'utf8'),
  /Økonomiinnstillinger/,
);
assert.equal(shellSrc.includes("tab === 'home'\n      && !isChild"), false);
assert.equal(/isOrganizationType\(family\?\.type\)\s*\n\s*&& tab === 'home'/.test(shellSrc), false);
assert.match(shellSrc, /tab === 'okonomi'/);
assert.match(shellSrc, /EconomyScreen/);
assert.match(shellSrc, /defaultOkonomiSubView/);
assert.match(shellSrc, /subView=\{moreSubView\}/);
assert.match(shellSrc, /ContractScreen/);
const moreHubSrc = readFileSync(new URL('../../screens/v2/MoreHubScreen.jsx', import.meta.url), 'utf8');
assert.match(moreHubSrc, /drawerHasSubmenuToggle/);
assert.match(moreHubSrc, /drawerSubmenuOpen/);
assert.match(moreHubSrc, /module-nav-expand-/);
const drawerSrc = readFileSync(new URL('../../components/ShellDrawer.jsx', import.meta.url), 'utf8');
assert.match(drawerSrc, /drawerSubmenuOpen/);
assert.match(drawerSrc, /groupCompanyDrawerItems/);
assert.match(drawerSrc, /module-nav-expand-/);
assert.match(drawerSrc, /onToggle=\{expandable/);
const railSrc = readFileSync(new URL('../../components/DesktopRail.jsx', import.meta.url), 'utf8');
assert.match(railSrc, /drawerHasSubmenuToggle/);
assert.match(railSrc, /drawerSubmenuOpen/);
assert.match(railSrc, /groupCompanyDrawerItems/);
assert.match(railSrc, /module-nav-expand-/);
{
  const items = companyNavItems();
  const selskap = items.find((item) => item.id === 'selskap');
  const okonomi = items.find((item) => item.id === 'okonomi');
  const anbud = items.find((item) => item.id === 'anbud');
  const arbeid = items.find((item) => item.id === 'arbeid');
  const fravaer = items.find((item) => item.id === 'fravaer');
  const produkt = items.find((item) => item.id === 'produkt');
  const kunder = items.find((item) => item.id === 'kunder');
  assert.equal(drawerHasSubmenuToggle(selskap), false);
  assert.equal(drawerHasSubmenuToggle(okonomi), true);
  assert.equal(drawerHasSubmenuToggle(anbud), true);
  assert.equal(drawerHasSubmenuToggle(arbeid), true);
  assert.equal(drawerHasSubmenuToggle(fravaer), true);
  assert.equal(drawerHasSubmenuToggle(produkt), true);
  assert.equal(drawerHasSubmenuToggle(kunder), false);
  assert.equal(drawerSubmenuOpen(selskap, 'home'), false);
  assert.equal(drawerSubmenuOpen(okonomi, 'home'), false);
  assert.equal(drawerSubmenuOpen(okonomi, 'okonomi', {}, 'oversikt'), true);
  assert.equal(drawerSubmenuOpen(okonomi, 'home', { okonomi: true }), true);
  assert.equal(drawerSubmenuOpen(okonomi, 'okonomi', { okonomi: false }, 'oversikt'), false);
  assert.equal(drawerSubmenuOpen(anbud, 'home'), false);
  assert.equal(drawerSubmenuOpen(anbud, 'anbud', {}, 'varsling'), true);
  assert.equal(drawerSubmenuOpen(anbud, 'home', { anbud: true }), true);
  assert.equal(drawerSubmenuOpen(arbeid, 'home'), false);
  assert.equal(drawerSubmenuOpen(arbeid, 'arbeid', {}, 'timeliste'), true);
  assert.equal(drawerSubmenuOpen(arbeid, 'arbeid', {}, 'fravaer'), false);
  assert.equal(drawerSubmenuOpen(fravaer, 'arbeid', {}, 'fravaer'), true);
  assert.equal(drawerSubmenuOpen(fravaer, 'arbeid', {}, 'timeliste'), false);
  assert.equal(drawerSubmenuOpen(produkt, 'arbeid', {}, 'salg'), true);
  assert.equal(drawerSubmenuOpen(produkt, 'okonomi', {}, 'produkter'), true);
  assert.equal(drawerSubmenuOpen(produkt, 'arbeid', {}, 'timeliste'), false);
  assert.equal(drawerSubmenuOpen(okonomi, 'arbeid', {}, 'utlegg'), true);
  assert.equal(drawerSubmenuOpen(kunder, 'kunder'), false);
}
assert.match(
  readFileSync(new URL('./shellModules.js', import.meta.url), 'utf8'),
  /Kundesummer/,
);
assert.equal(
  readFileSync(new URL('./shellModules.js', import.meta.url), 'utf8').includes("label: 'Økonomi',\n      action: { type: 'tab', tab: 'okonomi', subView: 'oversikt' },\n      forceOpen: true,"),
  false,
);
const economyScreen = readFileSync(new URL('../../screens/economy/EconomyScreen.jsx', import.meta.url), 'utf8');
assert.match(economyScreen, /EconomyWelcome/);
assert.match(economyScreen, /EconomyDesk/);
assert.match(economyScreen, /EconomyCustomers/);
const economyCustomers = readFileSync(new URL('../../screens/economy/EconomyCustomers.jsx', import.meta.url), 'utf8');
assert.match(economyCustomers, /phoneName/);
assert.match(economyCustomers, /stackRows/);
assert.match(economyCustomers, /minWidth: 280/);
assert.match(economyScreen, /EconomyContracts/);
assert.equal(economyScreen.includes('EconomyHours'), false);
assert.equal(economyScreen.includes("page === 'timer'"), false);
assert.match(shellSrc, /defaultArbeidSubView/);
assert.match(shellSrc, /ArbeidHub/);
assert.match(
  readFileSync(new URL('../../screens/arbeid/ArbeidHub.jsx', import.meta.url), 'utf8'),
  /timerapport/,
);
const economyContracts = readFileSync(new URL('../../screens/economy/EconomyContracts.jsx', import.meta.url), 'utf8');
assert.equal(economyContracts.includes('System-ID'), false);
assert.equal(economyContracts.includes('systemId'), false);
assert.match(economyContracts, /phoneName/);
assert.match(economyContracts, /stackRows/);
assert.match(economyScreen, /openIndexIntentFromContract/);
assert.match(economyScreen, /EconomyIndex/);
assert.equal(economyScreen.includes('IndeksreguleringPanel'), false);
assert.match(economyScreen, /page === 'indeks'/);
assert.match(economyScreen, /page === 'kunder'/);
assert.match(economyScreen, /page === 'avtaler'/);
assert.equal(economyScreen.includes('Kunder og avtaler'), false);
assert.match(economyScreen, /requestShellTab\?\.\('kunder'/);
assert.match(economyScreen, /requestShellTab\?\.\('kontrakt'/);
assert.match(economyScreen, /indexOpen/);
assert.equal(economyScreen.includes('phone: company'), false);
const economyIndex = readFileSync(new URL('../../screens/economy/EconomyIndex.jsx', import.meta.url), 'utf8');
assert.match(economyIndex, /draftFromRegisteredContract/);
assert.match(economyIndex, /fetchSeriesById/);
assert.match(economyIndex, /Påkrevd for beregningen/);
const filterMenu = readFileSync(new URL('../../components/FilterMenu.jsx', import.meta.url), 'utf8');
assert.match(filterMenu, /Filter og sortering/);
assert.match(filterMenu, /nativeID="filter-menu"/);
const customerScreen = readFileSync(new URL('../../screens/customers/CustomersScreen.jsx', import.meta.url), 'utf8');
assert.match(customerScreen, /FilterMenu/);
for (const file of [
  '../../screens/v2/RecipesHubScreen.jsx',
  '../../screens/v2/MealsHubScreen.jsx',
  '../../screens/v2/MailHubScreen.jsx',
  '../../screens/v2/BoligmappaHubScreen.jsx',
  '../../screens/ActivitiesScreen.jsx',
  '../../screens/anbud/TenderHitCards.jsx',
]) {
  assert.match(readFileSync(new URL(file, import.meta.url), 'utf8'), /FilterMenu/);
}
assert.match(customerScreen, /searchBrregCompanies/);
assert.match(customerScreen, /readCustomerImport/);
assert.match(customerScreen, /identityFieldsForKind/);
assert.match(customerScreen, /CustomerPhoneRow/);
assert.equal(customerScreen.includes('Adresse ${address}'), false);
const projectScreen = readFileSync(new URL('../../screens/project/ProjectWorkScreen.jsx', import.meta.url), 'utf8');
assert.equal(projectScreen.includes("['indeks', 'Indeksregulering']"), false);

function collectPresented(items, acc = []) {
  for (const item of items || []) {
    if (item.group) {
      collectPresented(item.children, acc);
      continue;
    }
    acc.push({
      id: item.id,
      label: item.label,
      icon: item.icon || null,
      tab: item.action?.tab || null,
      subView: item.action?.subView ?? null,
    });
    collectPresented(item.children, acc);
  }
  return acc;
}

{
  const source = companyNavItems({ includeUnderenheter: true });
  const presented = groupCompanyDrawerItems(source);
  assert.deepEqual(
    presented.filter((item) => item.group).map((item) => item.label),
    [
      'Selskap og organisasjon',
      'Ansatte og arbeidstid',
      'Kunder og oppdrag',
      'Produktivitet',
      'Produkter og driftsressurser',
      'Økonomi og fakturering',
      'Kvalitet og styringssystem',
    ],
  );
  assert.deepEqual(
    presented.filter((item) => item.group).map((item) => item.children.map((child) => child.id)),
    [
      ['selskap', 'underenheter', 'selskapsinnstillinger'],
      ['ansatte', 'hr', 'fravaer', 'arbeid'],
      ['kunder', 'anbud', 'kontrakt', 'projects'],
      ['produktivitet'],
      ['produkt', 'utstyr', 'kjorebok'],
      [
        'okonomi-oversikt',
        'okonomi-inntjening',
        'okonomi-kunder',
        'okonomi-avtaler',
        'okonomi-faktura',
        'okonomi-fakturagrunnlag',
        'okonomi-utlegg',
        'okonomi-prosjektutlegg',
        'okonomi-indeks',
        'okonomi-indekser',
        'okonomi-innstillinger',
      ],
      ['iso'],
    ],
  );
  assert.deepEqual(
    presented.filter((item) => item.group).map((item) => item.icon),
    ['business', 'people', 'briefcase', 'stats-chart', 'cube', 'wallet', 'shield-checkmark'],
  );
  const org = presented.find((item) => item.id === 'company-org');
  const people = presented.find((item) => item.id === 'company-people');
  const customers = presented.find((item) => item.id === 'company-customers');
  assert.equal(org.children.find((item) => item.id === 'selskap').children, undefined);
  assert.equal(org.children.find((item) => item.id === 'selskap').icon, 'business');
  assert.equal(org.children.find((item) => item.id === 'underenheter').action.subView, 'underenheter');
  const companySettings = org.children.find((item) => item.id === 'selskapsinnstillinger');
  assert.equal(companySettings.action.subView, 'innstillinger');
  assert.deepEqual(
    companySettings.children.map((item) => item.id),
    ['selskapsinnstillinger-tilgang'],
  );
  assert.equal(customers.children.find((item) => item.id === 'anbud').children.some((row) => row.id === 'anbud-innstillinger'), true);
  const fravaer = people.children.find((item) => item.id === 'fravaer');
  assert.equal(fravaer.icon, 'sunny');
  assert.deepEqual(
    fravaer.children.map((item) => item.label),
    ['Fraværsoversikt', 'Fraværsrapport', 'Planlagt fravær', 'Innstillinger'],
  );
  assert.equal(fravaer.children[0].action.tab, 'arbeid');
  assert.equal(fravaer.children[0].action.subView, 'fravaer');
  assert.equal(customers.processOrder, true);
  assert.equal(people.children.find((item) => item.id === 'arbeid').children.some((c) => c.label === 'Produktivitet'), false);
  const finance = presented.find((item) => item.id === 'company-finance');
  assert.equal(finance.children.some((child) => child.id === 'okonomi' || child.label === 'Økonomi'), false);
  assert.equal(finance.children.every((child) => !(child.children || []).length), true);
  assert.deepEqual(finance.collapsedItems.map((item) => item.id), ['okonomi']);
  assert.equal(people.collapsedItems, undefined);
  assert.equal(drawerGroupOpen(finance, 'okonomi', {}, 'faktura'), true);
  assert.equal(drawerGroupOpen(finance, 'okonomi', { 'company-finance': false }, 'faktura'), false);
  assert.equal(drawerGroupOpen(finance, 'home', {}, null), false);
  const byId = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(
    byId(collectPresented(presented)),
    byId(collectPresented(source).filter((row) => row.id !== 'okonomi')),
  );
  assert.equal(presented.some((item) => !item.group), false);

  const withExtra = groupCompanyDrawerItems([
    ...source,
    { id: 'ekstra', icon: 'star', label: 'Ekstra', action: { type: 'tab', tab: 'ekstra' } },
  ]);
  assert.equal(withExtra.at(-1).id, 'ekstra');
  assert.equal(withExtra.at(-1).label, 'Ekstra');
  assert.equal(withExtra.filter((item) => item.group).length, 7);

  const innleie = groupCompanyDrawerItems(filterCompanyNav(source, standardGrants('innleie_ekstern')));
  const innleieIds = innleie.filter((item) => item.group).flatMap((item) => item.children.map((child) => child.id));
  assert.deepEqual(innleieIds, ['selskap', 'fravaer', 'arbeid', 'produktivitet', 'produkt', 'utstyr', 'okonomi-prosjektutlegg']);
  assert.deepEqual(
    innleie.find((item) => item.id === 'company-finance').collapsedItems.map((item) => item.id),
    ['okonomi'],
  );
  assert.equal(innleie.find((item) => item.id === 'company-people').children.find((item) => item.id === 'fravaer').children.length, 3);

  assert.equal(drawerGroupOpen(org, 'home', {}, null), false);
  assert.equal(drawerGroupOpen(org, 'selskap', {}, 'innstillinger'), true);
  assert.equal(drawerGroupOpen(people, 'hr', {}, 'personell'), true);
  assert.equal(drawerGroupOpen(people, 'arbeid', {}, 'fravaer'), true);
  assert.equal(drawerGroupOpen(people, 'arbeid', { 'company-people': false }, 'fravaer'), false);
  assert.equal(drawerGroupOpen(customers, 'projects', {}, null), true);
  assert.equal(drawerGroupOpen(customers, 'kunder', {}, null), true);
  assert.deepEqual(
    releaseClosedActiveGroups({ 'company-people': false, 'company-finance': false }, source, 'hr', 'oversikt'),
    { 'company-finance': false },
  );
  assert.deepEqual(
    releaseClosedActiveSubmenus({ fravaer: false, okonomi: false }, source, 'arbeid', 'fravaer'),
    { okonomi: false },
  );

  const personal = buildShellModules({
    t, asChild: false, asParent: true, isSuperAdmin: false,
    familyId: 'F', family: { type: 'organization', name: 'ProTop AS' },
    hasKids: false, childForSchedule: null, firstKid: null,
  });
  assert.deepEqual(
    personal.find((section) => section.id === 'main').items.map((item) => item.id),
    ['home', 'chat', 'friends', 'plan', 'mail', 'stars', 'notes', 'timeliste'],
  );
  assert.deepEqual(
    personal.find((section) => section.id === 'account').items.map((item) => item.id).slice(0, 2),
    ['tilgang', 'skjema'],
  );
}

console.log('shellModules.test.mjs: ok');
