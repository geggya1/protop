import assert from 'node:assert/strict';
import {
  HELP_SECTIONS,
  PAGE_ALIASES,
  PROTOP_PAGES,
  getProtopPage,
  helpPageId,
  resolvePageKey,
} from './protopPages.js';
import {
  ARBEID_ROUTE_IDS,
  HR_SUBVIEW_IDS,
  ISO_SUBVIEW_IDS,
  OKONOMI_ROUTE_IDS,
  ANBUD_SUBVIEW_IDS,
  companyNavItems,
} from '../navigation/shellModules.js';
import { PROTOP_SHELL_MODULE_IDS } from '../navigation/protopShell.js';
import { getModuleIntro, localizeIntro } from '../utils/moduleIntros.js';

const sectionIds = new Set(HELP_SECTIONS.map((s) => s.id));
const both = (v) => !!(v && typeof v.nb === 'string' && v.nb.trim() && typeof v.en === 'string' && v.en.trim());

// Hver side har komplett innhold på norsk og engelsk.
for (const [key, page] of Object.entries(PROTOP_PAGES)) {
  for (const field of ['label', 'path', 'kicker', 'title', 'pitch']) {
    assert.ok(both(page[field]), `${key}: ${field} mangler nb/en`);
  }
  assert.ok(sectionIds.has(page.section), `${key}: ukjent seksjon ${page.section}`);
  assert.ok(page.nav?.tab, `${key}: mangler nav`);
  assert.ok(page.icon && page.accent && page.soft, `${key}: mangler ikon/farger`);
  assert.ok(Array.isArray(page.steps) && page.steps.length >= 1, `${key}: trenger steg`);
  page.steps.forEach((s, i) => {
    assert.ok(both(s.title), `${key} steg ${i + 1}: tittel mangler nb/en`);
    assert.ok(s.nb && s.en, `${key} steg ${i + 1}: tekst mangler nb/en`);
    assert.equal(s.scene, 'hub', `${key} steg ${i + 1}: ProTop-steg ligger på siden (hub)`);
    if (s.find) {
      assert.ok(Array.isArray(s.find) && s.find.every((f) => typeof f === 'string' && f.trim()), `${key} steg ${i + 1}: find må være tekster`);
    }
    if (s.via) {
      assert.ok(Array.isArray(s.via) && s.via.length && s.via.every((f) => typeof f === 'string' && f.trim()), `${key} steg ${i + 1}: via må være tekster`);
      assert.ok(s.find?.length, `${key} steg ${i + 1}: via uten find`);
    }
    if (s.viaText) assert.ok(both(s.viaText), `${key} steg ${i + 1}: viaText mangler nb/en`);
    if (s.pending) assert.ok(both(s.pending), `${key} steg ${i + 1}: pending mangler nb/en`);
  });
  (page.faq || []).forEach((f, i) => assert.ok(both(f.q) && both(f.a), `${key} FAQ ${i + 1} mangler nb/en`));
  // Navigasjonen til siden gir tilbake samme hjelp.
  assert.equal(resolvePageKey(helpPageId(page.nav.tab, page.nav.subView || null)), key, `${key}: nav peker ikke tilbake`);
}

assert.ok(Object.keys(PROTOP_PAGES).length >= 75, 'alle sider i ProTop har hjelp');

for (const [alias, target] of Object.entries(PAGE_ALIASES)) {
  assert.ok(PROTOP_PAGES[target], `alias ${alias} peker på ukjent side ${target}`);
}

// Alle sider i bedriftsmenyen (inkludert undermenyer) har egen hjelp.
function routesOf(items) {
  const out = [];
  for (const item of items || []) {
    if (item.action?.type === 'tab') out.push([item.action.tab, item.action.subView || null, item.id]);
    out.push(...routesOf(item.children));
  }
  return out;
}
const routes = [
  ...routesOf(companyNavItems({ includeUnderenheter: true })),
  ...ARBEID_ROUTE_IDS.map((id) => ['arbeid', id, `arbeid-${id}`]),
  ...OKONOMI_ROUTE_IDS.map((id) => ['okonomi', id, `okonomi-${id}`]),
  ...HR_SUBVIEW_IDS.map((id) => ['hr', id, `hr-${id}`]),
  ...ISO_SUBVIEW_IDS.map((id) => ['iso', id, `iso-${id}`]),
  ...ANBUD_SUBVIEW_IDS.map((id) => ['anbud', id, `anbud-${id}`]),
];
const missing = routes
  .filter(([tab, sub]) => !resolvePageKey(helpPageId(tab, sub)))
  .map(([tab, sub, id]) => `${id} (${tab}/${sub || ''})`);
assert.deepEqual(missing, [], `Sider uten hjelp: ${missing.join(', ')}`);

// Undersider får sin egen hjelp, ikke fanens.
const exact = routes.filter(([tab, sub]) => sub && ['anbud', 'arbeid', 'okonomi', 'hr', 'iso'].includes(tab));
for (const [tab, sub] of exact) {
  const key = resolvePageKey(helpPageId(tab, sub));
  assert.ok(key === `${tab}.${sub}` || PAGE_ALIASES[`${tab}.${sub}`] === key, `${tab}/${sub} bruker ${key}, ikke egen side`);
}

// Personlige moduler i ProTop-skallet har hjelp.
const personal = PROTOP_SHELL_MODULE_IDS.filter((id) => !['more', 'members', 'groupSettings', 'help-lightbulb', 'support', 'news', 'restrictions', 'notifications'].includes(id));
for (const id of personal) {
  const tab = ['home', 'chat', 'plan', 'mail', 'stars', 'notes'].includes(id) ? id : 'more';
  const sub = tab === 'more' ? id : null;
  assert.ok(resolvePageKey(helpPageId(tab, sub)), `personlig modul ${id} mangler hjelp`);
}

assert.equal(helpPageId('anbud', null), 'anbud.varsling');
assert.equal(helpPageId('anbud', 'pipeline'), 'anbud.pipeline');
assert.equal(resolvePageKey('anbud.pipeline'), 'anbud.tilbud');
assert.equal(helpPageId('selskap', null), 'selskap');
assert.equal(helpPageId('more', 'help'), 'help');
assert.equal(helpPageId('projects', null), 'projects');
assert.equal(resolvePageKey('finnes.ikke'), null);
assert.equal(getProtopPage('okonomi.kunder').key, 'okonomi.inntjening');

// Lyspæren og hjelpesenteret får ProTop-innholdet gjennom getModuleIntro.
const intro = localizeIntro(getModuleIntro('family', 'anbud.varsling'), 'nb');
assert.equal(intro.pageKey, 'anbud.varsling');
assert.equal(intro.label, '1.1 Anbudsvarsling');
assert.match(intro.path, /Bedrift → Anbud/);
assert.equal(intro.tour.length, 4);
assert.equal(intro.tour[1].title, 'Hent treff');
assert.deepEqual(intro.tour[1].find, ['Oppdater nå']);
assert.ok(intro.tour.every((s) => s.scene === 'hub' && s.advance === false));
const introEn = localizeIntro(getModuleIntro('family', 'anbud.varsling'), 'en');
assert.equal(introEn.tour[1].title, 'Fetch hits');

// Varianter: menysteget peker på bunnmenyen på mobil.
const homePhone = localizeIntro(getModuleIntro('family', 'home'), 'nb', { isPhone: true });
const homeDesk = localizeIntro(getModuleIntro('family', 'home'), 'nb', { isDesktop: true });
assert.equal(homeDesk.tour[3].anchor, 'rail');
assert.ok(homePhone.tour.length === homeDesk.tour.length);

console.log(`protopPages.test.mjs: ok (${Object.keys(PROTOP_PAGES).length} sider, ${routes.length} menyruter)`);
