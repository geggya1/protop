import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMPANY_DRAWER_GROUPS,
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
import { PRICING_VISIBLE } from '../utils/billingMethods.js';

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
  assert.equal(account.items.some((i) => i.id === 'subscription'), PRICING_VISIBLE, 'Abonnement vises bare når priser er på');
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
      'selskap', 'selskapsinnstillinger', 'ansatte', 'hr', 'fravaer', 'arbeid', 'produktivitet', 'fremdrift',
      'okonomi-inntjening', 'kunder', 'anbud', 'kontrakt', 'projects', 'produkt', 'utstyr', 'kjorebok', 'okonomi', 'iso',
      'skjema',
    ],
  );
  assert.equal(companyItems[0].label, 'Bedriften');
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
  assert.equal(settings.label, 'Bedriftsinnstillinger');
  assert.equal(settings.action.subView, 'innstillinger');
  assert.deepEqual(
    settings.children.map((i) => i.label),
    ['Modulinnstillinger', 'Tilgangsstyring'],
  );
  assert.equal(settings.children[1].action.subView, 'tilgang');
  assert.equal(companyItems.find((i) => i.id === 'ansatte').action.tab, 'ansatte');
  const hr = companyItems.find((i) => i.id === 'hr');
  assert.equal(hr.action.tab, 'hr');
  assert.equal(hr.children.length, 9);
  assert.deepEqual(
    companyItems.find((i) => i.id === 'anbud').children.map((i) => i.label),
    ['1.1 Anbudsvarsling', '1.2 Anbudsforespørsel', '2. Vurdering av aktuelle', '3. Tilbud', 'Innstillinger'],
  );
  assert.equal(
    companyItems.find((i) => i.id === 'anbud').children.find((i) => i.id === 'anbud-innstillinger').action.subView,
    'innstillinger',
  );
  assert.equal(companyItems.find((i) => i.id === 'kunder').action.tab, 'kunder');
  assert.equal(companyItems.find((i) => i.id === 'kontrakt').label, 'Kontrakter');
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
  const fremdrift = companyItems.find((i) => i.id === 'fremdrift');
  assert.equal(fremdrift.label, 'Prosjektfremdrift');
  assert.equal(fremdrift.action.tab, 'arbeid');
  assert.equal(fremdrift.action.subView, 'fremdrift');
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
    ['Oversikt', 'Faktura', 'Til fakturering', 'Utlegg', 'Prosjektutlegg', 'Indeksregulering', 'Indekser', 'Innstillinger'],
  );
  const okonomiKids = companyItems.find((i) => i.id === 'okonomi').children;
  assert.equal(okonomiKids.some((i) => i.id === 'okonomi-inntjening'), false);
  const inntjeningKid = companyItems.find((i) => i.id === 'okonomi-inntjening');
  assert.equal(inntjeningKid.action.tab, 'okonomi');
  assert.equal(inntjeningKid.action.subView, 'inntjening');
  assert.deepEqual(inntjeningKid.activeSubViews, ['inntjening', 'kunder', 'avtaler']);
  assert.equal(okonomiKids.some((i) => i.id === 'okonomi-kunder'), false);
  assert.equal(okonomiKids.some((i) => i.id === 'okonomi-avtaler'), false);
  assert.equal(okonomiKids.find((i) => i.id === 'okonomi-prosjektutlegg').action.tab, 'arbeid');
  assert.equal(okonomiKids.find((i) => i.id === 'okonomi-prosjektutlegg').action.subView, 'utlegg');
  // UX-17: Tilgang under Konto gikk til samme side som Tilgangsstyring, og Skjemabygger ligger i bedriftsmenyen.
  const accountItems = company.find((s) => s.id === 'account').items;
  assert.equal(accountItems.some((i) => i.id === 'tilgang'), false);
  assert.equal(accountItems.some((i) => i.id === 'skjema'), false);
  const skjema = companyItems.find((i) => i.id === 'skjema');
  assert.equal(skjema.label, 'Skjemabygger');
  assert.equal(skjema.action.tab, 'skjema');
  assert.equal(skjema.children, undefined);
  assert.deepEqual(COMPANY_DRAWER_GROUPS.find((g) => g.id === 'company-quality').itemIds, ['iso', 'skjema']);
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
  const inntjening = items.find((item) => item.id === 'okonomi-inntjening');
  assert.equal(isNavItemActive(anbud, 'anbud', 'varsling'), true);
  assert.equal(isNavItemActive(tilbud, 'anbud', 'tilbud'), true);
  assert.equal(isNavItemActive(tilbud, 'anbud', 'varsling'), false);
  assert.equal(isNavItemActive(kontrakt, 'kontrakt', null), true);
  assert.equal(isNavItemActive(kontrakt, 'anbud', 'tilbud'), false);
  assert.equal(isNavItemActive(kunder, 'kunder', null), true);
  assert.equal(isNavItemActive(okonomi, 'kunder', null), false);
  assert.equal(isNavItemActive(okonomi, 'kontrakt', null), false);
  assert.equal(isNavItemActive(inntjening, 'okonomi', 'inntjening'), true);
  assert.equal(isNavItemActive(inntjening, 'okonomi', 'kunder'), true);
  assert.equal(isNavItemActive(inntjening, 'okonomi', 'avtaler'), true);
  assert.equal(isNavItemActive(inntjening, 'okonomi', 'faktura'), false);
  assert.equal(isNavItemActive(inntjening, 'kunder', null), false);
  assert.equal(isNavItemActive(okonomi, 'okonomi', 'kunder'), false);
  assert.equal(isNavItemActive(okonomi, 'okonomi', 'avtaler'), false);
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
assert.equal(watchSettings.includes('PortalSettings'), false);
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
// Meny-siden i docken tegner samme meny som skuffen (NavTree).
assert.match(moreHubSrc, /useNavTree\(/);
assert.match(moreHubSrc, /<NavTree\b/);
assert.equal(moreHubSrc.includes('companyMenuItems('), false);
// Skuffen og sidemenyen tegner menyen med NavTree (UX-22); se navTree.test.mjs.
const navTreeSrc = readFileSync(new URL('../../components/NavTree.jsx', import.meta.url), 'utf8');
assert.match(navTreeSrc, /drawerHasSubmenuToggle/);
assert.match(navTreeSrc, /drawerSubmenuOpen/);
assert.match(navTreeSrc, /module-nav-expand-/);
assert.match(navTreeSrc, /onToggle=\{expandable/);
assert.match(readFileSync(new URL('./navTree.js', import.meta.url), 'utf8'), /groupCompanyDrawerItems/);
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
// Kunder og Avtaler er faner i Inntjening, ikke egne sider med eget navn (UX-17).
assert.equal(okonomiMenuTitle('kunder'), 'Inntjening');
assert.equal(okonomiMenuTitle('avtaler'), 'Inntjening');
assert.equal(
  readFileSync(new URL('./shellModules.js', import.meta.url), 'utf8').includes("label: 'Økonomi',\n      action: { type: 'tab', tab: 'okonomi', subView: 'oversikt' },\n      forceOpen: true,"),
  false,
);
const economyScreen = readFileSync(new URL('../../screens/economy/EconomyScreen.jsx', import.meta.url), 'utf8');
assert.match(economyScreen, /EconomyWelcome/);
assert.match(economyScreen, /EconomyDesk/);
assert.match(economyScreen, /EconomyEarnings/);
const economyEarnings = readFileSync(new URL('../../screens/economy/EconomyEarnings.jsx', import.meta.url), 'utf8');
assert.match(economyEarnings, /EconomyCustomers/);
assert.match(economyEarnings, /earnings-subnav/);
const economyCustomers = readFileSync(new URL('../../screens/economy/EconomyCustomers.jsx', import.meta.url), 'utf8');
assert.match(economyCustomers, /phoneName/);
assert.match(economyCustomers, /stackRows/);
assert.match(economyCustomers, /minWidth: 280/);
assert.match(economyEarnings, /EconomyContracts/);
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
      'Bedrift og organisasjon',
      'Ansatte og arbeidstid',
      'Kvalitet og styringssystem',
      'Produktivitet og inntjening',
      'Økonomi og fakturering',
      'Produkter og driftsressurser',
      'Anbud',
      'Kunder og oppdrag',
    ],
  );
  assert.deepEqual(
    presented.filter((item) => item.group).map((item) => item.children.map((child) => child.id)),
    [
      ['selskap', 'underenheter', 'selskapsinnstillinger'],
      ['ansatte', 'hr', 'fravaer', 'arbeid'],
      ['iso', 'skjema'],
      ['produktivitet', 'fremdrift', 'okonomi-inntjening'],
      ['okonomi'],
      ['produkt', 'utstyr', 'kjorebok'],
      ['anbud'],
      ['kunder', 'kontrakt', 'projects'],
    ],
  );
  assert.deepEqual(
    presented.filter((item) => item.group).map((item) => item.icon),
    ['business', 'people', 'shield-checkmark', 'stats-chart', 'wallet', 'cube', 'megaphone', 'briefcase'],
  );
  const org = presented.find((item) => item.id === 'company-org');
  const people = presented.find((item) => item.id === 'company-people');
  const customers = presented.find((item) => item.id === 'company-customers');
  assert.equal(org.children.find((item) => item.id === 'selskap').children, undefined);
  assert.equal(org.children.find((item) => item.id === 'selskap').icon, 'business');
  assert.equal(org.children.find((item) => item.id === 'underenheter').action.subView, 'underenheter');
  // To nivåer: gruppe → modul. Undersidene ligger i modulens vannrette meny (moduleTabsFor) og som `pages`.
  const companySettings = org.children.find((item) => item.id === 'selskapsinnstillinger');
  assert.equal(companySettings.action.subView, 'innstillinger');
  assert.equal(companySettings.children, undefined);
  assert.deepEqual(
    companySettings.pages.map((item) => item.id),
    ['selskapsinnstillinger-moduler', 'selskapsinnstillinger-tilgang'],
  );
  const tenders = presented.find((item) => item.id === 'company-tenders');
  assert.equal(customers.children.some((item) => item.id === 'anbud'), false);
  assert.deepEqual(tenders.children.map((item) => item.id), ['anbud']);
  assert.equal(tenders.processOrder, false);
  assert.equal(drawerGroupOpen(tenders, 'anbud', {}, 'vurdering'), true);
  const fravaer = people.children.find((item) => item.id === 'fravaer');
  assert.equal(fravaer.icon, 'sunny');
  assert.deepEqual(
    fravaer.pages.map((item) => item.label),
    ['Fraværsoversikt', 'Fraværsrapport', 'Planlagt fravær', 'Innstillinger'],
  );
  assert.equal(fravaer.pages[0].action.tab, 'arbeid');
  assert.equal(fravaer.pages[0].action.subView, 'fravaer');
  assert.equal(customers.processOrder, true);
  assert.equal(people.children.find((item) => item.id === 'arbeid').pages.some((c) => c.label === 'Produktivitet'), false);
  const finance = presented.find((item) => item.id === 'company-finance');
  assert.deepEqual(finance.children.map((child) => child.id), ['okonomi']);
  assert.equal(presented.every((g) => !g.group || g.children.every((child) => !(child.children || []).length)), true);
  assert.equal(drawerGroupOpen(finance, 'okonomi', {}, 'faktura'), true);
  assert.equal(drawerGroupOpen(finance, 'okonomi', { 'company-finance': false }, 'faktura'), false);
  assert.equal(drawerGroupOpen(finance, 'home', {}, null), false);
  const byId = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(
    byId(collectPresented(presented)),
    byId(source.map((item) => ({ id: item.id, label: item.label, icon: item.icon || null, tab: item.action?.tab || null, subView: item.action?.subView ?? null }))),
    'alle modulene er med i menyen',
  );
  assert.equal(presented.some((item) => !item.group), false);

  const withExtra = groupCompanyDrawerItems([
    ...source,
    { id: 'ekstra', icon: 'star', label: 'Ekstra', action: { type: 'tab', tab: 'ekstra' } },
  ]);
  assert.equal(withExtra.at(-1).id, 'ekstra');
  assert.equal(withExtra.at(-1).label, 'Ekstra');
  assert.equal(withExtra.filter((item) => item.group).length, 8);

  const innleie = groupCompanyDrawerItems(filterCompanyNav(source, standardGrants('innleie_ekstern')));
  const innleieIds = innleie.filter((item) => item.group).flatMap((item) => item.children.map((child) => child.id));
  // Innleide har Tildelte prosjekt, og ser derfor Prosjekt (bare egne prosjekter).
  assert.deepEqual(innleieIds, ['selskap', 'fravaer', 'arbeid', 'produktivitet', 'okonomi-prosjektutlegg', 'produkt-salg', 'utstyr', 'projects']);
  assert.equal(innleie.find((item) => item.id === 'company-people').children.find((item) => item.id === 'fravaer').pages.length, 3);

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
  // Eier i Bedrift: Aktiverte moduler ligger i Modulinnstillinger, ikke under Konto (UX-17).
  assert.deepEqual(
    personal.find((section) => section.id === 'account').items.map((item) => item.id),
    ['settings', 'help', 'legal'],
  );
  const ansattAccount = buildShellModules({
    t, asChild: false, asParent: true, isSuperAdmin: false,
    familyId: 'F', family: { type: 'organization', name: 'ProTop AS' },
    hasKids: false, childForSchedule: null, firstKid: null,
    companyGrants: standardGrants('ansatt'),
  }).find((section) => section.id === 'account').items.map((item) => item.id);
  assert.ok(ansattAccount.includes('moduleAccess'), 'ansatt uten Modulinnstillinger beholder Aktiverte moduler under Konto');
  const privatAccount = buildShellModules({
    t, asChild: false, asParent: true, isSuperAdmin: false,
    familyId: 'P', family: { type: 'family', isPersonal: true, name: 'Meg' },
    hasKids: false, childForSchedule: null, firstKid: null,
  }).find((section) => section.id === 'account').items.map((item) => item.id);
  assert.ok(privatAccount.includes('moduleAccess'), 'Privat har Aktiverte moduler under Konto');
}

console.log('shellModules.test.mjs: ok');
