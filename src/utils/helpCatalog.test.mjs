import assert from 'node:assert/strict';
import {
  _resetHelpCatalogCache,
  articlesForCategory,
  buildHelpKnowledgeSnippets,
  getHelpArticle,
  listHelpArticles,
  listHelpCategories,
  localizeHelpArticle,
  moduleLabel,
  resolveHelpAudience,
  resolveHelpDevice,
  searchHelpArticles,
} from './helpCatalog.js';
import { PROTOP_PAGES } from '../help/protopPages.js';
import { PROTOP_PROCESSES } from '../help/protopProcesses.js';

_resetHelpCatalogCache();

assert.equal(resolveHelpAudience({ isParent: true, isChild: false }), 'parent');
assert.equal(resolveHelpAudience({ isChild: true, ageBand: 'child' }), 'child');
assert.equal(resolveHelpAudience({ isChild: true, ageBand: 'teen' }), 'teen');
assert.equal(resolveHelpDevice({ isDesktop: true }), 'desktop');
assert.equal(resolveHelpDevice({ isTablet: true }), 'tablet');
assert.equal(resolveHelpDevice({}), 'phone');

const articles = listHelpArticles();
// Én artikkel per synlig side og arbeidsflyt, pluss tips. Skjulte sider får ingen.
for (const [key, def] of Object.entries(PROTOP_PAGES)) {
  const has = articles.some((a) => a.id === `page.${key}`);
  assert.equal(has, !def.hidden, def.hidden ? `skjult side ${key} har artikkel` : `mangler artikkel for ${key}`);
}
for (const id of Object.keys(PROTOP_PROCESSES)) {
  assert.ok(articles.some((a) => a.id === `process.${id}`), `mangler arbeidsflyt ${id}`);
}
assert.ok(articles.some((a) => a.id === 'help.lightbulb'));
assert.ok(articles.some((a) => a.id === 'help.assistant'));
assert.equal(new Set(articles.map((a) => a.id)).size, articles.length, 'unike artikkel-id-er');
assert.equal(articles.some((a) => a.moduleId === 'shop' || a.moduleId === 'lekser'), false, 'ingen familiemoduler');

const cats = listHelpCategories('nb');
assert.equal(cats[0].id, 'workflows', 'arbeidsflyter først');
assert.ok(cats.some((c) => c.id === 'company-tenders'));
assert.ok(cats.every((c) => c.title && c.count > 0));
for (const a of articles) {
  assert.ok(cats.some((c) => c.id === a.categoryId), `${a.id} ligger i en synlig kategori`);
}

const anbud = localizeHelpArticle(getHelpArticle('page.anbud.varsling'), { lang: 'nb' });
assert.equal(anbud.pageKey, 'anbud.varsling');
assert.match(anbud.path, /Bedrift → Anbud/);
assert.equal(anbud.stepItems[1].title, 'Hent treff');
assert.match(anbud.steps[1], /^Hent treff: /);
assert.deepEqual(anbud.nav, { tab: 'anbud', subView: 'varsling' });
assert.ok(anbud.faq.length >= 1);

const flow = localizeHelpArticle(getHelpArticle('process.anbud-til-faktura'), { lang: 'en' });
assert.equal(flow.processId, 'anbud-til-faktura');
assert.equal(flow.title, 'From tender to invoice');

// Søket bruker samme rangering som assistenten (synonymer og bøyning).
const hits = searchHelpArticles('føre timer', { lang: 'nb' });
assert.ok(hits.length >= 1);
assert.match(hits[0].pageKey || '', /timeliste/);
assert.equal(searchHelpArticles('kjørebok', { lang: 'nb' })[0].pageKey, 'okonomi.kjorebok');
assert.ok(searchHelpArticles('lyspære', { lang: 'nb' }).some((a) => a.id === 'help.lightbulb' || a.id === 'topic.lightbulb'));
assert.equal(searchHelpArticles('xyzzy', { lang: 'nb' }).length, 0);

const popular = searchHelpArticles('', { lang: 'nb', limit: 4 });
assert.equal(popular[0].processId, 'anbud-til-faktura');

const phone = searchHelpArticles('kalender', { lang: 'nb', device: 'phone' });
const desk = searchHelpArticles('kalender', { lang: 'nb', device: 'desktop' });
assert.notEqual(phone[0].deviceTip, desk[0].deviceTip);

assert.ok(articlesForCategory('company-tenders', { lang: 'nb' }).some((a) => a.pageKey === 'anbud.tilbud'));
assert.equal(articlesForCategory('workflows', { lang: 'nb' }).length, Object.keys(PROTOP_PROCESSES).length);

const snippets = buildHelpKnowledgeSnippets({ lang: 'nb', limit: 5 });
assert.equal(snippets.length, 5);
assert.ok(snippets[0].title && snippets[0].moduleId);

assert.equal(moduleLabel('anbud.varsling', 'nb'), '1.1 Anbudsvarsling');

console.log('helpCatalog.test.mjs: ok', { articles: articles.length, cats: cats.length });
