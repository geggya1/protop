import assert from 'node:assert/strict';
import {
  _resetHelpCatalogCache,
  articlesForCategory,
  buildHelpKnowledgeSnippets,
  listHelpArticles,
  listHelpCategories,
  resolveHelpAudience,
  resolveHelpDevice,
  searchHelpArticles,
} from './helpCatalog.js';

_resetHelpCatalogCache();

assert.equal(resolveHelpAudience({ isParent: true, isChild: false }), 'parent');
assert.equal(resolveHelpAudience({ isChild: true, ageBand: 'child' }), 'child');
assert.equal(resolveHelpAudience({ isChild: true, ageBand: 'teen' }), 'teen');
assert.equal(resolveHelpDevice({ isDesktop: true }), 'desktop');
assert.equal(resolveHelpDevice({ isTablet: true }), 'tablet');
assert.equal(resolveHelpDevice({}), 'phone');

const articles = listHelpArticles({ scope: 'family' });
assert.ok(articles.length > 10, 'expected module + extra articles');
assert.ok(articles.some((a) => a.id === 'help.lightbulb'));
assert.ok(articles.some((a) => a.moduleId === 'plan' || a.id === 'family.plan'));

const cats = listHelpCategories('nb');
assert.ok(cats.length >= 3);
assert.ok(cats[0].title);
assert.ok(articles.some((a) => a.moduleId === 'mail' || a.moduleId === 'notes' || a.moduleId === 'settings'));
assert.equal(articles.some((a) => a.moduleId === 'shop' || a.moduleId === 'lekser'), false);

const hits = searchHelpArticles('lyspære', { lang: 'nb', audience: 'parent', device: 'phone' });
assert.ok(hits.length >= 1);
assert.match(hits[0].title.toLowerCase() + hits[0].summary.toLowerCase(), /lysp|hjelp|guide/);

const phone = searchHelpArticles('kalender', { lang: 'nb', device: 'phone' });
const desk = searchHelpArticles('kalender', { lang: 'nb', device: 'desktop' });
assert.ok(phone.length >= 1);
assert.ok(desk.length >= 1);
assert.notEqual(phone[0].deviceTip, desk[0].deviceTip);

const planHelp = articlesForCategory('plan', { lang: 'nb' });
assert.ok(planHelp.some((a) => a.moduleId === 'plan'));
assert.equal(articlesForCategory('school', { lang: 'nb' }).some((a) => a.moduleId === 'lekser'), false);

const snippets = buildHelpKnowledgeSnippets({ lang: 'nb', limit: 5 });
assert.equal(snippets.length, 5);
assert.ok(snippets[0].title && snippets[0].moduleId);

console.log('helpCatalog.test.mjs: ok', { articles: articles.length, cats: cats.length });
