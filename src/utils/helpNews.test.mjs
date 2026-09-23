import assert from 'node:assert/strict';
import { formatNewsDate, listHelpNews } from './helpNews.js';

const news = listHelpNews({ lang: 'nb', limit: 5 });
assert.ok(news.length >= 1);
assert.ok(news[0].title.includes('Hjelp') || news[0].title.length > 3);
assert.ok(formatNewsDate(news[0].date, 'nb').length > 4);

const en = listHelpNews({ lang: 'en', limit: 1 });
assert.ok(en[0].title.length > 3);
assert.notEqual(en[0].title, news[0].title);

console.log('helpNews.test.mjs: ok');
