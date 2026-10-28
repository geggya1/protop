import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PHONE_MAX_TABS, moduleTabsFor, splitModuleTabs, tabWidth } from './moduleTabs.js';
import { badgedLabel, clearModuleTabBadges, moduleTabBadges, setModuleTabBadges, subscribeModuleTabBadges } from './moduleTabBadges.js';
import { companyMenuItems, companyNavItems, groupCompanyDrawerItems, isNavItemActive } from './shellModules.js';

// Plassen raden har: telefon 390 px minus 2 × 12 px luft; PC med venstremeny og tipsfelt.
const PHONE = { width: 366, max: PHONE_MAX_TABS, short: true };
const DESKTOP = { width: 868 };

test('modulmeny: ISO får de mest brukte sidene først, og delene som titler i «Mer»', () => {
  const m = moduleTabsFor('iso', 'avvik');
  assert.equal(m.moduleId, 'iso');
  assert.equal(m.activeId, 'iso-avvik');
  assert.deepEqual(m.pages.slice(0, 4).map((p) => p.id), ['iso-oversikt', 'iso-avvik', 'iso-risiko', 'iso-hms']);
  assert.equal(m.pages.length, 23, 'alle ISO-sidene er med');
  assert.deepEqual(m.groups.map((g) => g.label), ['Styring', 'Drift', 'Evaluering', 'Innstillinger']);
  assert.equal(m.groups.reduce((n, g) => n + g.pageIds.length, 0), m.pages.length - 1, 'alle utenom Oversikt ligger i en del');
  assert.ok(m.groups.find((g) => g.id === 'drift').pageIds.includes('iso-beredskap'));
  assert.deepEqual(m.groups.at(-1).pageIds, ['iso-innstillinger'], 'Innstillinger er en egen del, ikke gjemt under Evaluering');
  assert.equal(m.pages.find((p) => p.id === 'iso-avvik').short, 'Avvik', 'kortnavn på telefon');
  assert.equal(moduleTabsFor('iso', null).activeId, 'iso-oversikt', 'uten underside: oversikten');
});

test('modulmeny: Økonomi, Arbeid, Fravær, Produkt og Selskapsinnstillinger', () => {
  const ok = moduleTabsFor('okonomi', 'faktura');
  assert.equal(ok.moduleId, 'okonomi');
  assert.equal(ok.activeId, 'okonomi-faktura');
  assert.equal(ok.sections, undefined);
  assert.equal(moduleTabsFor('arbeid', 'utlegg').moduleId, 'okonomi', 'prosjektutlegg ligger i Økonomi-menyen');
  assert.equal(moduleTabsFor('arbeid', 'timesaldo').moduleId, 'arbeid');
  assert.equal(moduleTabsFor('arbeid', 'planlagt').moduleId, 'fravaer');
  assert.equal(moduleTabsFor('okonomi', 'produkter').moduleId, 'produkt');
  const settings = moduleTabsFor('selskap', 'tilgang');
  assert.equal(settings.moduleId, 'selskapsinnstillinger');
  assert.deepEqual(settings.pages.map((p) => p.label), ['Generelt', 'Modulinnstillinger', 'Tilgangsstyring']);
  assert.equal(settings.activeId, 'selskapsinnstillinger-tilgang');
});

test('modulmeny: ingen meny der modulen ikke har undersider', () => {
  assert.equal(moduleTabsFor('selskap', null), null);
  assert.equal(moduleTabsFor('kunder', null), null);
  assert.equal(moduleTabsFor('arbeid', 'produktivitet'), null);
  assert.equal(moduleTabsFor('home', null), null);
});

test('modulmeny: HR og Anbud bruker samme meny som de andre modulene (UX-19)', () => {
  const hr = moduleTabsFor('hr', 'lonn');
  assert.equal(hr.moduleId, 'hr');
  assert.equal(hr.activeId, 'hr-lonn');
  assert.deepEqual(hr.pages.map((p) => p.label), ['Oversikt', 'Personell', 'Avtaler', 'Lønn', 'Oppfølging', 'Lovpålagt', 'Rekruttering', 'Personalhåndbok', 'Skjemaer']);
  assert.equal(moduleTabsFor('hr', null).activeId, 'hr-oversikt');
  const anbud = moduleTabsFor('anbud', 'vurdering');
  assert.equal(anbud.moduleId, 'anbud');
  assert.equal(anbud.activeId, 'anbud-vurdering');
  assert.deepEqual(anbud.pages.map((p) => p.label), ['1.1 Anbudsvarsling', '1.2 Anbudsforespørsel', '2. Vurdering av aktuelle', '3. Tilbud', 'Innstillinger']);
  assert.deepEqual(anbud.pages.map((p) => p.short || p.label), ['Varsling', 'Forespørsel', 'Vurdering', 'Tilbud', 'Innstillinger']);
});

test('modulmeny: tilgangen styrer fanene i HR og Anbud', () => {
  // Bare personell og avtaler i HR, ingen anbudsinnstillinger.
  const grants = {
    hr: 'read', hrPeople: 'read', hrAgreements: 'read', tenders: 'read', offers: 'read', companyPublic: 'read',
  };
  const items = companyMenuItems({ grants });
  const hr = moduleTabsFor('hr', 'oversikt', items);
  assert.deepEqual(hr.pages.map((p) => p.id).filter((id) => ['hr-lonn', 'hr-rekruttering', 'hr-compliance'].includes(id)), []);
  assert.ok(hr.pages.some((p) => p.id === 'hr-personell'));
  const anbud = moduleTabsFor('anbud', 'tilbud', items);
  assert.equal(anbud.pages.some((p) => p.id === 'anbud-innstillinger'), false, 'innstillingene krever Admin');
  assert.equal(anbud.pages.some((p) => p.id === 'anbud-vurdering'), false);
});

test('modulmeny: telefon viser 3–4 faner og «Mer» med resten', () => {
  const hr = splitModuleTabs(moduleTabsFor('hr', 'oversikt'), PHONE);
  assert.deepEqual(hr.visible.map((p) => p.label), ['Oversikt', 'Personell', 'Avtaler']);
  assert.deepEqual(hr.more[0].pages.map((p) => p.label), ['Lønn', 'Oppfølging', 'Lovpålagt', 'Rekruttering', 'Personalhåndbok', 'Skjemaer']);
  const anbud = splitModuleTabs(moduleTabsFor('anbud', 'varsling'), PHONE);
  assert.deepEqual(anbud.visible.map((p) => p.short), ['Varsling', 'Forespørsel', 'Vurdering']);
  const iso = splitModuleTabs(moduleTabsFor('iso', 'avvik'), PHONE);
  assert.deepEqual(iso.visible.map((p) => p.short || p.label), ['Oversikt', 'Avvik', 'Risiko', 'HMS']);
  assert.deepEqual(iso.more.map((g) => g.label), ['Styring', 'Drift', 'Evaluering', 'Innstillinger'], 'ISO-delene er titler i arket');
  const settings = splitModuleTabs(moduleTabsFor('selskap', 'tilgang'), PHONE);
  assert.deepEqual(settings.visible.map((p) => p.short || p.label), ['Generelt', 'Moduler', 'Tilgang'], 'tre korte faner, ingen «Mer»');
  assert.deepEqual(settings.more[0]?.pages || [], []);
  const companyModules = companyNavItems({ includeUnderenheter: true }).filter((item) => (item.children || []).length);
  for (const item of companyModules) {
    for (const child of item.children) {
      const menu = moduleTabsFor(child.action.tab, child.action.subView);
      const split = splitModuleTabs(menu, PHONE);
      const where = `${menu.moduleId}/${child.action.subView}`;
      assert.ok(split.visible.length >= 2 && split.visible.length <= PHONE_MAX_TABS, where);
      assert.ok(split.visible.some((p) => p.id === menu.activeId), `${where}: siden du står på, er i raden`);
      const extra = split.more.some((g) => g.pages.length) ? tabWidth('Mer') + 20 : 0;
      assert.ok(split.visible.reduce((n, p) => n + tabWidth(p.short || p.label), 0) + extra <= PHONE.width, `${where} får plass`);
      assert.equal(split.visible.length + split.more.reduce((n, g) => n + g.pages.length, 0), menu.pages.length, `${where}: ingen side forsvinner`);
    }
  }
});

test('modulmeny: står du på en side under «Mer», tar den plassen til den siste fanen', () => {
  const split = splitModuleTabs(moduleTabsFor('hr', 'rekruttering'), PHONE);
  assert.deepEqual(split.visible.map((p) => p.label), ['Oversikt', 'Personell', 'Rekruttering']);
  assert.ok(split.more[0].pages.some((p) => p.label === 'Avtaler'), 'den som måtte vike, ligger under «Mer»');
  const iso = splitModuleTabs(moduleTabsFor('iso', 'ledelse'), PHONE);
  assert.equal(iso.visible.at(-1).id, 'iso-ledelse');
  assert.equal(iso.more.some((g) => g.pages.some((p) => p.id === 'iso-ledelse')), false);
});

test('modulmeny: PC viser alt som får plass, ISO har resten under «Mer»', () => {
  const ok = splitModuleTabs(moduleTabsFor('okonomi', 'faktura'), { width: 1180 });
  assert.deepEqual(ok.more, [], 'Økonomi får plass i én rad');
  const hr = splitModuleTabs(moduleTabsFor('hr', 'oversikt'), DESKTOP);
  assert.equal(hr.visible.length, 9, 'alle HR-sidene på PC');
  const iso = splitModuleTabs(moduleTabsFor('iso', 'avvik'), DESKTOP);
  assert.deepEqual(iso.visible.slice(0, 3).map((p) => p.label), ['Oversikt', 'Avvik og forbedring', 'Risiko']);
  assert.ok(iso.visible.length >= 6 && iso.visible.length < 23);
  const sheet = iso.more.flatMap((g) => g.pages.map((p) => p.id));
  assert.equal(new Set([...iso.visible.map((p) => p.id), ...sheet]).size, 23, 'alle sidene finnes i raden eller arket');
});

test('modulmeny: tall på fanene (Anbud) meldes av modulen', () => {
  let calls = 0;
  const stop = subscribeModuleTabBadges(() => { calls += 1; });
  setModuleTabBadges('anbud', { 'anbud-tilbud': 2, 'anbud-vurdering': 0 });
  assert.deepEqual(moduleTabBadges('anbud'), { 'anbud-tilbud': 2 });
  setModuleTabBadges('anbud', { 'anbud-tilbud': 2 });
  assert.equal(calls, 1, 'samme tall varsler ikke på nytt');
  assert.equal(badgedLabel('3. Tilbud', 2), '3. Tilbud (2)');
  assert.equal(badgedLabel('Tilbud', 0), 'Tilbud');
  clearModuleTabBadges('anbud');
  assert.deepEqual(moduleTabBadges('anbud'), {});
  stop();
});

test('modulmeny: låste moduler og sider vises ikke', () => {
  const items = companyNavItems({ includeUnderenheter: true }).map((item) => (item.id === 'iso' ? { ...item, locked: true } : item));
  assert.equal(moduleTabsFor('iso', 'avvik', items), null);
  const partly = companyNavItems({ includeUnderenheter: true }).map((item) => (item.id === 'okonomi'
    ? { ...item, children: item.children.map((c) => (c.id === 'okonomi-faktura' ? { ...c, locked: true } : c)) }
    : item));
  assert.equal(moduleTabsFor('okonomi', 'oversikt', partly).pages.some((p) => p.id === 'okonomi-faktura'), false);
});

test('hamburgermeny: to nivåer, og modulen er aktiv på alle sine sider', () => {
  const presented = groupCompanyDrawerItems(companyNavItems({ includeUnderenheter: true }));
  for (const group of presented.filter((g) => g.group)) {
    for (const mod of group.children) assert.equal((mod.children || []).length, 0, `${mod.id} har ingen undermeny`);
  }
  const iso = presented.find((g) => g.id === 'company-quality').children[0];
  assert.equal(iso.id, 'iso');
  assert.ok(isNavItemActive(iso, 'iso', 'beredskap'));
  const finance = presented.find((g) => g.id === 'company-finance');
  assert.deepEqual(finance.children.map((c) => c.id), ['okonomi']);
  assert.ok(isNavItemActive(finance.children[0], 'okonomi', 'faktura'));
  // Søk: treff i en underside beholder undermenyen.
  const search = groupCompanyDrawerItems([{ ...companyNavItems().find((i) => i.id === 'iso'), forceOpen: true }]);
  assert.ok(search[0].children[0].children.length > 0);
});

test('modulmeny: én komponent for alle, med 44 px trykkflate på berøringsskjerm', () => {
  const tabs = readFileSync(new URL('../../components/ModuleTabs.jsx', import.meta.url), 'utf8');
  assert.match(tabs, /tabTouch: \{ minHeight: touch\.min/);
  // Tettheten følger pekeren (UX-23): også nettbrett og iPad i liggende format får 44 px.
  assert.match(tabs, /touchSize=\{isTouch\}/);
  assert.match(tabs, /module-tabs-more/);
  const src = readFileSync(new URL('./moduleTabs.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /OWN_NAV/, 'ingen moduler med egen meny');
  const hr = readFileSync(new URL('../../screens/hr/HrScreen.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(hr, /HrSectionNav/);
});
