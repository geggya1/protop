import assert from 'node:assert/strict';
import { collectWatchHits, watchHitRequests } from './watchHits.js';

const preference = watchHitRequests({
  cpvCodes: [],
  keywords: ['bro', 'samferdsel', 'bro'],
  channels: ['doffin', 'ted'],
  locationIds: ['NO071'],
  publishedFrom: '',
});
assert.equal(preference.some((row) => row.via === 'proxy' && !row.query.searchString), false);
assert.deepEqual(
  preference.filter((row) => row.via === 'proxy').map((row) => row.query.searchString),
  ['bro', 'samferdsel'],
);
assert.equal(preference.filter((row) => row.via === 'ted').length, 2);

const calls = [];
const data = await collectWatchHits({
  cpvCodes: [],
  keywords: ['bro'],
  channels: ['doffin'],
  locationIds: [],
}, {
  proxy: async (query) => {
    calls.push(query);
    if (!query.searchString && !(query.cpvCodes || []).length) {
      throw new Error('Minst én CPV-kode eller et søkeord må følge med.');
    }
    return {
      hits: [{ id: '2026-9', heading: 'Ny bro' }],
      fetchedAt: '2026-10-09T12:00:00.000Z',
    };
  },
  ted: async () => {
    throw new Error('TED skal ikke kalles når kanalen er av');
  },
});
assert.equal(calls.length, 1);
assert.equal(calls[0].searchString, 'bro');
assert.equal(data.hits[0].id, '2026-9');
assert.deepEqual(data.hits[0].matchedKeywords, ['bro']);
assert.equal(data.fetchedAt, '2026-10-09T12:00:00.000Z');

const mixed = await collectWatchHits({
  cpvCodes: ['45000000'],
  keywords: ['bro'],
  channels: ['doffin'],
}, {
  proxy: async (query) => {
    if ((query.cpvCodes || []).length) throw new Error('Doffin svarte 503');
    return { hits: [{ id: 'k1', heading: 'Bro over elv' }] };
  },
  ted: async () => ({ hits: [] }),
});
assert.equal(mixed.hits.length, 1);
assert.equal(mixed.hits[0].id, 'k1');
assert.deepEqual(mixed.errors, []);

await assert.rejects(
  () => collectWatchHits({ keywords: ['bro'], channels: ['doffin'] }, {
    proxy: async () => { throw new Error('Doffin svarte 502'); },
    ted: async () => ({ hits: [] }),
  }),
  /Doffin svarte 502/,
);

await assert.rejects(
  () => collectWatchHits({ cpvCodes: [], keywords: [] }, {
    proxy: async () => ({ hits: [] }),
    ted: async () => ({ hits: [] }),
  }),
  /CPV-kode eller et søkeord/,
);

console.log('watchHits.test.mjs ok');
