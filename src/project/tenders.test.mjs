import assert from 'node:assert/strict';
import { emptyProjectState, normalizeProjectState } from './engine.js';
import { buildDoffinBody, searchDoffinNotices } from './doffinQuery.js';
import {
  mergeTenderNotices,
  normalizeCpvCode,
  saveTenderWatch,
  watchQuery,
} from './tenders.js';

assert.equal(normalizeCpvCode('45'), '45000000');
assert.equal(normalizeCpvCode('45233120'), '45233120');
assert.equal(normalizeCpvCode('abc'), '');

let state = emptyProjectState();
assert.equal(saveTenderWatch(state, { companyName: '', cpvCodes: ['45000000'], nationwide: true }).ok, false);
assert.equal(saveTenderWatch(state, { companyName: 'Nord Bygg', cpvCodes: [], nationwide: true }).ok, false);
assert.equal(saveTenderWatch(state, { companyName: 'Nord Bygg', cpvCodes: ['45000000'], areas: [] }).ok, false);

state = saveTenderWatch(state, {
  companyName: 'Nord Bygg',
  cpvCodes: ['45000000', '45310000'],
  areas: ['NO071', 'NO081'],
}).state;
assert.equal(state.tenderWatch.companyName, 'Nord Bygg');
assert.deepEqual(watchQuery(state.tenderWatch).locationIds, ['NO071', 'NO081']);
assert.equal(watchQuery(state.tenderWatch).cpvCodes[0], '45000000');

const restored = normalizeProjectState({ tenderWatch: { companyName: 'Beholdt', cpvCodes: [{ code: '45000000', label: 'Bygg' }] } });
assert.equal(restored.tenderWatch.companyName, 'Beholdt');
assert.deepEqual(restored.tenderNotices, []);

const first = mergeTenderNotices(state, [
  { id: '2026-1', heading: 'Skole', buyer: [{ name: 'Kommune' }], status: 'ACTIVE', publicationDate: '2026-09-20', locationId: ['NO071'], placeOfPerformance: ['Nordland'], deadline: '2026-10-01T10:00:00Z' },
  { id: '2026-2', heading: 'Ferdig', status: 'EXPIRED', publicationDate: '2026-09-19' },
], '2026-09-24T10:00:00Z').state;
assert.equal(first.tenderNotices.length, 1);
assert.equal(first.tenderNotices[0].isNew, false);

const second = mergeTenderNotices(first, [
  { id: '2026-1', heading: 'Skole', status: 'ACTIVE', publicationDate: '2026-09-20' },
  { id: '2026-3', heading: 'Veilys', buyer: [{ name: 'Sortland kommune' }], status: 'ACTIVE', publicationDate: '2026-09-24', estimatedValue: { amount: 14000000, currencyCode: 'NOK' } },
], '2026-09-24T12:00:00Z').state;
assert.equal(second.tenderNotices[0].id, '2026-3');
assert.equal(second.tenderNotices[0].isNew, true);
assert.equal(second.tenderNotices[0].amount, 14000000);
assert.equal(second.tenderNotices[1].isNew, false);

const body = buildDoffinBody({ cpvCodes: ['45000000'], locationIds: ['NO071'] });
assert.deepEqual(body.facets.cpvCodesId.checkedItems, ['45000000']);
assert.deepEqual(body.facets.status.checkedItems, ['ACTIVE']);
assert.deepEqual(body.facets.location.checkedItems, ['NO071']);
assert.equal(buildDoffinBody({ cpvCodes: ['45'], locationIds: ['drop table'] }).facets.location.checkedItems.length, 0);

const live = await searchDoffinNotices({ cpvCodes: ['45000000'], locationIds: ['NO071'], numHitsPerPage: 5 });
assert.equal(live.ok, true);
assert.ok(live.hits.length > 0, 'forventet treff fra Doffin');
assert.ok(live.hits.every((hit) => hit.status === 'ACTIVE'));
assert.ok(live.hits.every((hit) => (hit.locationId || []).includes('NO071')));
const merged = mergeTenderNotices(state, live.hits, live.fetchedAt).state;
assert.ok(merged.tenderNotices.length > 0);
assert.match(merged.tenderNotices[0].url, /^https:\/\/www\.doffin\.no\/notices\//);
console.log(`Doffin ${live.numHitsTotal} treff i Nordland, viste ${merged.tenderNotices.length}: ${merged.tenderNotices[0].title}`);
