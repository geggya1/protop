import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateOpenFeedUrl } from './openFeedAllow.js';

const vg = validateOpenFeedUrl('https://www.vg.no/rss/feed/?format=json&limit=6');
assert.match(vg, /vg\.no\/rss\/feed/);

const dn = validateOpenFeedUrl('https://services.dn.no/api/feed/rss/nyheter');
assert.match(dn, /services\.dn\.no/);

const yahoo = validateOpenFeedUrl('https://query1.finance.yahoo.com/v8/finance/chart/EQNR.OL?interval=1d&range=5d');
assert.match(yahoo, /EQNR\.OL/);
const yahoo2 = validateOpenFeedUrl('https://query2.finance.yahoo.com/v8/finance/chart/EQNR.OL?interval=1d&range=5d');
assert.match(yahoo2, /query2\.finance\.yahoo\.com/);

assert.throws(() => validateOpenFeedUrl('https://example.com/rss'), /ikke tillatt/);
assert.throws(() => validateOpenFeedUrl('http://www.vg.no/rss/feed/'), /https/);
assert.throws(() => validateOpenFeedUrl('https://query1.finance.yahoo.com/v8/finance/chart/..%2Fsecret'), /symbol|tillatt|adresse/i);
assert.throws(() => validateOpenFeedUrl('https://www.vg.no/not-rss'), /ikke tillatt/);
assert.throws(() => validateOpenFeedUrl('not a url'), /Ugyldig/);

const index = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const feed = readFileSync(new URL('./openFeed.js', import.meta.url), 'utf8');
assert.match(index, /fetchOpenFeed/);
assert.match(feed, /redirect: 'manual'/);
assert.match(feed, /requireAuth/);
assert.match(feed, /AbortSignal\.timeout/);
assert.match(feed, /Mozilla\/5\.0/);
assert.match(feed, /invoker: 'public'/);

const feedIndex = readFileSync(new URL('./openFeedIndex.js', import.meta.url), 'utf8');
assert.match(feedIndex, /export \{ fetchOpenFeed \}/);

console.log('openFeedAllow.test.mjs: ok');
