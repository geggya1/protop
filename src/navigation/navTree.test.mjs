import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildNavTree,
  collapsedNavItems,
  findActiveNavItem,
  navSectionExpanded,
  navSections,
  navTreeInput,
  runNavAction,
} from './navTree.js';
import { COMPANY_DRAWER_GROUPS } from './shellModules.js';
import { standardGrants } from '../access/companyAccess.js';
import { setCompanyModuleActive } from '../access/companyModules.js';

const t = (k) => k;
const company = { id: 'C', type: 'company', name: 'Hjelpebot Bygg AS', company: { navn: 'Hjelpebot Bygg AS' } };
const owner = { isParent: true, isAdmin: true, family: company, familyId: 'C', kids: [] };

/** Menyen slik sidemenyen (PC) og skuffen (telefon) får den fra useNavTree. */
function menus(input) {
  return {
    rail: navSections(buildNavTree(input, { hideChat: true })),
    drawer: navSections(buildNavTree(input)),
  };
}

/** Alt som tegnes: seksjon, overskrift, grupper og rader med handling og lås. */
function shape(sections) {
  const row = (item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon || null,
    action: item.action || null,
    locked: !!item.locked,
    lockedNote: item.lockedNote || '',
    group: !!item.group,
    children: (item.children || []).map(row),
    pages: (item.pages || []).map((page) => page.id),
  });
  return sections.map((section) => ({
    id: section.id,
    heading: section.heading,
    foldable: section.foldable,
    items: section.items.map(row),
  }));
}

/** Sidemenyen viser ikke Chat på web (chat-docken), ellers er innholdet likt. */
function withoutChat(sections) {
  return sections.map((section) => ({ ...section, items: section.items.filter((item) => item.id !== 'chat') }));
}

const personas = [
  ['eier', { grants: null, modules: null }],
  ['administrator', { grants: standardGrants('administrator'), modules: null }],
  ['ansatt', { grants: standardGrants('ansatt'), modules: null }],
  ['avdelingsleder', { grants: standardGrants('avdelingsleder'), modules: null }],
  ['innleid', { grants: standardGrants('innleie_ekstern'), modules: null }],
  ['ISO og utstyr slått av', {
    grants: standardGrants('administrator'),
    modules: setCompanyModuleActive(setCompanyModuleActive(null, 'iso', false), 'utstyr', false),
  }],
];

test('sidemenyen og skuffen får samme meny for samme bruker og rettigheter', () => {
  for (const [name, { grants, modules }] of personas) {
    const input = navTreeInput({
      t,
      app: owner,
      companyGrants: grants,
      companyModules: modules,
      companyModuleNote: 'Ikke aktivert · kontakt administrator',
    });
    const { rail, drawer } = menus(input);
    assert.deepEqual(shape(rail), shape(withoutChat(drawer)), `${name}: sidemeny og skuff er like`);
    assert.ok(drawer.some((section) => section.id === 'company'), `${name}: bedriftsmenyen finnes`);
  }
});

test('rettigheter og moduler av/på gir samme utslag begge steder', () => {
  const ansatt = menus(navTreeInput({ t, app: owner, companyGrants: standardGrants('ansatt') }));
  const flatIds = (sections) => shape(sections).flatMap((section) => section.items)
    .flatMap(function walk(item) { return [item.id, ...item.children.flatMap(walk)]; });
  for (const variant of ['rail', 'drawer']) {
    const ids = flatIds(ansatt[variant]);
    assert.equal(ids.includes('selskapsinnstillinger'), false, `${variant}: ansatt ser ikke bedriftsinnstillinger`);
    assert.ok(ids.includes('selskap'), `${variant}: ansatt ser Bedriften`);
  }

  const off = menus(navTreeInput({
    t,
    app: owner,
    companyModules: setCompanyModuleActive(null, 'utstyr', false),
    companyModuleNote: 'Ikke aktivert',
  }));
  for (const variant of ['rail', 'drawer']) {
    const resources = off[variant].find((section) => section.id === 'company').items
      .find((group) => group.id === 'company-resources');
    const utstyr = resources.children.find((item) => item.id === 'utstyr');
    assert.equal(utstyr.locked, true, `${variant}: Utstyr er låst, ikke borte`);
    assert.equal(utstyr.lockedNote, 'Ikke aktivert');
  }
});

test('bedriftsmenyen grupperes likt fra COMPANY_DRAWER_GROUPS', () => {
  const { rail, drawer } = menus(navTreeInput({ t, app: owner }));
  for (const sections of [rail, drawer]) {
    const groups = sections.find((section) => section.id === 'company').items;
    assert.deepEqual(groups.map((group) => group.id), COMPANY_DRAWER_GROUPS.map((group) => group.id));
    assert.ok(groups.every((group) => group.group));
  }
});

test('privat arbeidsområde: ingen bedriftsmeny i noen av variantene', () => {
  const privat = { ...owner, isAdmin: false, family: { id: 'P', isPersonal: true, name: 'Hjelpe' }, familyId: 'P' };
  const { rail, drawer } = menus(navTreeInput({ t, app: privat }));
  assert.equal(rail.some((section) => section.id === 'company'), false);
  assert.equal(drawer.some((section) => section.id === 'company'), false);
  assert.deepEqual(shape(rail), shape(withoutChat(drawer)));
});

test('bryteren Privat/Bedrift styrer menyen; ingen egen «Personlig»-overskrift (EGEN-04)', () => {
  const bedrift = navSections(buildNavTree(navTreeInput({ t, app: owner })));
  const privat = navSections(buildNavTree(navTreeInput({
    t, app: { ...owner, isAdmin: false, family: { id: 'P', isPersonal: true, name: 'Hjelpe' }, familyId: 'P' },
  })));
  for (const sections of [bedrift, privat]) {
    const main = sections.find((section) => section.id === 'main');
    assert.equal(main.heading, '', 'øverste del har ingen overskrift');
    assert.equal(main.foldable, false);
    assert.ok(main.items.some((item) => item.id === 'plan'), 'Kalender står øverst i begge');
  }
  assert.equal(bedrift.find((section) => section.id === 'company').heading, 'shell.company');
  assert.deepEqual(bedrift.map((section) => section.id), ['main', 'company', 'account']);
  assert.deepEqual(privat.map((section) => section.id), ['main', 'account']);
});

test('søk viser undersider med modulen åpen og tar bort tomme seksjoner', () => {
  const sections = buildNavTree(navTreeInput({ t, app: owner }));
  const hits = navSections(sections, { query: 'faktura' });
  const companySection = hits.find((section) => section.id === 'company');
  assert.ok(companySection);
  const finance = companySection.items.find((group) => group.id === 'company-finance');
  const okonomi = finance.children.find((item) => item.id === 'okonomi');
  assert.equal(okonomi.forceOpen, true);
  assert.ok(okonomi.children.every((child) => /faktura/i.test(child.label)));
  assert.equal(navSections(sections, { query: 'finnes-ikke-xyz' }).length, 0);
});

test('seksjonene åpnes og lukkes etter samme regler', () => {
  const sections = navSections(buildNavTree(navTreeInput({ t, app: owner })));
  const account = sections.find((section) => section.id === 'account');
  const companySection = sections.find((section) => section.id === 'company');
  assert.equal(account.foldable, true);
  assert.equal(companySection.foldable, false);
  assert.equal(navSectionExpanded(account), false, 'Konto er lukket til den åpnes');
  assert.equal(navSectionExpanded(account, { activeTab: 'more', activeSubView: 'settings' }), true, 'åpen når siden er der');
  assert.equal(navSectionExpanded(account, { open: { account: true } }), true);
  assert.equal(navSectionExpanded(account, { query: 'inn' }), true);
  assert.equal(navSectionExpanded(companySection, { open: { company: false } }), true, 'bedriftsmenyen lukkes gruppe for gruppe');
});

test('aktiv side finnes som raden menyen faktisk viser', () => {
  const sections = navSections(buildNavTree(navTreeInput({ t, app: owner })));
  assert.deepEqual(findActiveNavItem(sections, 'okonomi', 'faktura'), { itemId: 'okonomi', sectionId: 'company' });
  assert.deepEqual(findActiveNavItem(sections, 'plan', null), { itemId: 'plan', sectionId: 'main' });
  assert.equal(findActiveNavItem(sections, 'ukjent', null), null);
});

test('kollapset sidemeny: øverste punkter og modulene i bedriftsmenyen', () => {
  const sections = buildNavTree(navTreeInput({ t, app: owner }), { hideChat: true });
  const { main, company: modules } = collapsedNavItems(sections);
  assert.ok(main.some((item) => item.id === 'home'));
  assert.equal(main.some((item) => item.id === 'chat'), false);
  assert.ok(modules.some((item) => item.id === 'okonomi'));
  assert.equal(modules.some((item) => item.group), false);
});

test('menyvalg utføres likt', () => {
  const calls = [];
  const handlers = {
    onSelectTab: (tab, sub) => calls.push(['tab', tab, sub]),
    navigate: (screen, params) => calls.push(['nav', screen, params]),
  };
  assert.equal(runNavAction({ type: 'tab', tab: 'okonomi', subView: 'faktura' }, handlers), true);
  assert.equal(runNavAction({ type: 'tab', tab: 'selskap' }, handlers), true);
  assert.equal(runNavAction({ type: 'nav', screen: 'ChildSettings', params: { a: 1 } }, handlers), true);
  assert.equal(runNavAction(null, handlers), false);
  assert.deepEqual(calls, [
    ['tab', 'okonomi', 'faktura'],
    ['tab', 'selskap', null],
    ['nav', 'ChildSettings', { a: 1 }],
  ]);
});

test('sidemenyen, skuffen og Meny-siden tegner menyen med NavTree, ikke hver for seg', () => {
  for (const path of ['components/DesktopRail.jsx', 'components/ShellDrawer.jsx']) {
    const src = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
    assert.match(src, /useNavTree\(/, `${path} henter menyen fra useNavTree`);
    assert.match(src, /<NavTree\b/, `${path} tegner med NavTree`);
    assert.equal(src.includes('buildShellModules'), false, `${path} bygger ikke menyen selv`);
    assert.equal(src.includes('groupCompanyDrawerItems'), false, `${path} grupperer ikke selv`);
    assert.equal(src.includes('AiImportChildPicker'), false, `${path} har ikke familieimporten`);
  }
  const more = readFileSync(new URL('../../screens/v2/MoreHubScreen.jsx', import.meta.url), 'utf8');
  assert.match(more, /useNavTree\(/, 'Meny-siden i docken henter samme meny');
  assert.match(more, /<NavTree\b/, 'Meny-siden i docken tegner med NavTree');
  const tree = readFileSync(new URL('../../components/NavTree.jsx', import.meta.url), 'utf8');
  assert.match(tree, /drawerSubmenuOpen/);
  assert.match(tree, /drawerGroupOpen/);
  assert.match(tree, /module-nav-expand-/);
  assert.match(tree, /navSectionExpanded/);
});
