import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleTabsFor } from './moduleTabs.js';
import { companyNavItems, groupCompanyDrawerItems, isNavItemActive } from './shellModules.js';

test('modulmeny: ISO får deler og sider, med aktiv side', () => {
  const m = moduleTabsFor('iso', 'avvik');
  assert.equal(m.moduleId, 'iso');
  assert.equal(m.activeId, 'iso-avvik');
  assert.deepEqual(m.sections.map((s) => s.label), ['Oversikt', 'Styring', 'Drift', 'Evaluering', 'Innstillinger']);
  assert.equal(m.activeSectionId, 'drift');
  assert.deepEqual(m.sections[0].pages.map((p) => p.id), ['iso-oversikt']);
  assert.ok(m.sections[2].pages.some((p) => p.label === 'Beredskap'));
  assert.equal(m.sections.reduce((n, s) => n + s.pages.length, 0), m.pages.length, 'alle sidene ligger i en del');
  assert.equal(moduleTabsFor('iso', null).activeId, 'iso-oversikt', 'uten underside: oversikten');
  const settings = moduleTabsFor('iso', 'innstillinger');
  assert.equal(settings.activeSectionId, 'innstillinger', 'Innstillinger er en egen fane, ikke gjemt under Evaluering');
  assert.deepEqual(settings.sections.at(-1).pages.map((p) => p.id), ['iso-innstillinger']);
  assert.equal(settings.sections.find((s) => s.id === 'evaluering').pages.some((p) => p.id === 'iso-innstillinger'), false);
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

test('modulmeny: ingen meny der modulen ikke har undersider eller har egen meny', () => {
  assert.equal(moduleTabsFor('selskap', null), null);
  assert.equal(moduleTabsFor('kunder', null), null);
  assert.equal(moduleTabsFor('arbeid', 'produktivitet'), null);
  assert.equal(moduleTabsFor('hr', 'oversikt'), null, 'HR har egen meny på siden');
  assert.equal(moduleTabsFor('anbud', 'varsling'), null, 'Anbud har egen meny på siden');
  assert.equal(moduleTabsFor('home', null), null);
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
