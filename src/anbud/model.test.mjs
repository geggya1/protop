import assert from 'node:assert/strict';
import { buildDoffinBody, searchDoffinNotices } from './doffinQuery.js';
import { buildTedQuery } from './tedQuery.js';
import {
  emptyAnbudState,
  mergeTenderNotices,
  normalizeAnbudState,
  normalizeCpvCode,
  saveTenderWatch,
  setNoticeDecision,
  attachDossier,
  createBidWork,
  registerInterest,
  saveSupplierProfile,
  watchQuery,
  watchFingerprint,
  formatMatchLabel,
  noticeInArea,
  workCandidates,
} from './model.js';

assert.equal(normalizeCpvCode('45'), '45000000');
assert.equal(normalizeCpvCode('45233120'), '45233120');
assert.equal(normalizeCpvCode('45000000-7'), '45000000');
assert.equal(normalizeCpvCode('abc'), '');

let state = emptyAnbudState();
assert.equal(saveTenderWatch(state, { companyName: '', cpvCodes: ['45000000'], nationwide: true }).ok, false);
assert.equal(saveTenderWatch(state, { companyName: 'Nord Bygg', cpvCodes: [], nationwide: true }).ok, false);
assert.equal(saveTenderWatch(state, { companyName: 'Nord Bygg', cpvCodes: ['45000000'], areas: [] }).ok, false);

state = saveTenderWatch(state, {
  companyName: 'Nord Bygg',
  cpvCodes: ['45000000', '45310000'],
  areas: ['NO071', 'NO081'],
}).state;
assert.equal(state.watch.companyName, 'Nord Bygg');
assert.deepEqual(watchQuery(state.watch).locationIds, ['NO071', 'NO081']);
assert.equal(watchQuery(state.watch).cpvCodes[0], '45000000');

const restored = normalizeAnbudState({ watch: { companyName: 'Beholdt', cpvCodes: [{ code: '45000000', label: 'Bygg' }] } });
assert.equal(restored.watch.companyName, 'Beholdt');
assert.deepEqual(restored.notices, []);

const first = mergeTenderNotices(state, [
  { id: '2026-1', heading: 'Skole', buyer: [{ name: 'Kommune' }], status: 'ACTIVE', publicationDate: '2026-09-20', locationId: ['NO071'], placeOfPerformance: ['Nordland'], deadline: '2026-10-01T10:00:00Z' },
  { id: '2026-2', heading: 'Ferdig', status: 'EXPIRED', publicationDate: '2026-09-19' },
], '2026-09-24T10:00:00Z').state;
assert.equal(first.notices.length, 1);
assert.equal(first.notices[0].isNew, false);

const second = mergeTenderNotices(first, [
  { id: '2026-1', heading: 'Skole', status: 'ACTIVE', publicationDate: '2026-09-20' },
  { id: '2026-3', heading: 'Veilys', buyer: [{ name: 'Sortland kommune' }], status: 'ACTIVE', publicationDate: '2026-09-24', estimatedValue: { amount: 14000000, currencyCode: 'NOK' } },
], '2026-09-24T12:00:00Z').state;
assert.equal(second.notices[0].id, '2026-3');
assert.equal(second.notices[0].isNew, true);
assert.equal(second.notices[0].amount, 14000000);
assert.equal(second.notices[1].isNew, false);
const retained = mergeTenderNotices(second, [
  { id: '2026-1', heading: 'Skole', status: 'ACTIVE', publicationDate: '2026-09-20' },
], '2026-09-25T08:00:00Z').state;
assert.ok(retained.notices.some((row) => row.id === '2026-3'), 'tidligere treff blir stående');
assert.equal(retained.notices.find((row) => row.id === '2026-3').isNew, true, 'nytt treff som ikke kom med i neste søk, forblir nytt');
const stillNew = mergeTenderNotices(second, [
  { id: '2026-3', heading: 'Veilys', status: 'ACTIVE', publicationDate: '2026-09-24' },
], '2026-09-24T18:00:00Z').state;
assert.equal(stillNew.notices.find((row) => row.id === '2026-3').isNew, true);
const decidedKeep = setNoticeDecision(second, '2026-3', 'aktuell').state;
const afterRefresh = mergeTenderNotices(decidedKeep, [
  { id: '2026-4', heading: 'Ny bro', description: 'Adgangskontroll', status: 'ACTIVE', publicationDate: '2026-09-26', matchedKeywords: ['bro'] },
], '2026-09-26T08:00:00Z').state;
assert.equal(afterRefresh.notices.find((row) => row.id === '2026-3').decision, 'aktuell');
assert.equal(afterRefresh.notices.find((row) => row.id === '2026-3').isNew, false);
assert.equal(afterRefresh.notices.find((row) => row.id === '2026-4').isNew, true);
assert.equal(afterRefresh.notices[0].id, '2026-4');

const withWords = saveTenderWatch(emptyAnbudState(), {
  companyName: 'Nord Bygg',
  cpvCodes: ['45000000'],
  nationwide: true,
  keywords: ['Sykehus', 'sykehus', 'a', 'adgangskontroll'],
}).state;
assert.deepEqual(withWords.watch.keywords, ['Sykehus', 'adgangskontroll']);
assert.notEqual(watchFingerprint(withWords.watch), watchFingerprint(state.watch));
assert.match(formatMatchLabel({
  title: 'Scanning av gamle Narvik sykehus',
  description: 'ombygging',
  buyer: 'Nordland fylkeskommune',
  places: ['Nordland/Nordlánnda'],
  cpvCodes: ['71000000'],
}, withWords.watch), /Sykehus/);
assert.match(formatMatchLabel({
  title: 'Veilys',
  matchedKeywords: ['bro'],
  cpvCodes: [],
}, { ...withWords.watch, keywords: ['bro', 'Sykehus'] }), /^bro$/);
assert.equal(noticeInArea({ places: ['Nordland/Nordlánnda'], locationIds: ['NO071'] }, { id: 'NO081', name: 'Oslo' }), false);
assert.equal(noticeInArea({ places: ['Nordland/Nordlánnda'], locationIds: [] }, { id: 'NO071', name: 'Nordland' }), true);
assert.equal(noticeInArea({ places: ['Møre og Romsdal'], locationIds: [] }, { id: 'NO0A3', name: 'Møre og Romsdal' }), true);

const wordBody = buildDoffinBody({ searchString: 'sykehus', publishedFrom: '2026-09-20' });
assert.equal(wordBody.searchString, 'sykehus');
assert.equal(wordBody.facets.cpvCodesId.checkedItems.length, 0);
assert.equal(wordBody.facets.publicationDate.from, '2026-09-20');
assert.match(buildTedQuery({ keywords: ['sykehus'], locationIds: ['NO071'] }), /FT~"sykehus"/);
assert.match(buildTedQuery({ keywords: ['sykehus'], publishedFrom: '2026-09-20' }), /publication-date>=20260920/);

const body = buildDoffinBody({ cpvCodes: ['45000000'], locationIds: ['NO071'] });
assert.deepEqual(body.facets.cpvCodesId.checkedItems, ['45000000']);
assert.deepEqual(buildDoffinBody({ cpvCodes: ['45', '45000000-7'] }).facets.cpvCodesId.checkedItems, ['45000000']);
assert.deepEqual(body.facets.status.checkedItems, ['ACTIVE']);
assert.deepEqual(body.facets.location.checkedItems, ['NO071']);
assert.equal(buildDoffinBody({ cpvCodes: ['45'], locationIds: ['drop table'] }).facets.location.checkedItems.length, 0);

const live = await searchDoffinNotices({ cpvCodes: ['45000000'], locationIds: ['NO071'], numHitsPerPage: 5 });
assert.equal(live.ok, true);
assert.ok(live.hits.length > 0, 'forventet treff fra Doffin');
assert.ok(live.hits.every((hit) => hit.status === 'ACTIVE'));
assert.ok(live.hits.every((hit) => (hit.locationId || []).includes('NO071')));
const merged = mergeTenderNotices(state, live.hits, live.fetchedAt).state;
assert.ok(merged.notices.length > 0);
assert.match(merged.notices[0].url, /^https:\/\/www\.doffin\.no\/notices\//);
console.log(`Doffin ${live.numHitsTotal} treff i Nordland, viste ${merged.notices.length}: ${merged.notices[0].title}`);

const marked = setNoticeDecision(merged, merged.notices[0].id, 'aktuell').state;
assert.equal(marked.notices[0].decision, 'aktuell');
assert.ok(marked.notices[0].interestAt);
const withFile = attachDossier(marked, marked.notices[0].id, { procedure: 'Åpen', documentsUrl: 'https://example.test/docs' }).state;
const kept = mergeTenderNotices(withFile, live.hits, '2026-09-24T13:00:00Z').state;
const same = kept.notices.find((row) => row.id === marked.notices[0].id);
assert.equal(same.decision, 'aktuell');
assert.equal(same.dossier.procedure, 'Åpen');
assert.equal(createBidWork(merged, merged.notices[0].id).ok, false);
const queued = setNoticeDecision(merged, merged.notices[0].id, 'aktuell').state;
assert.equal(workCandidates(queued).length >= 1, true);
assert.equal(workCandidates({ ...queued, bids: [{ noticeId: queued.notices[0].id }] }).some((row) => row.id === queued.notices[0].id), false);
const blocked = registerInterest(withFile, withFile.notices[0].id, withFile.notices[0].dossier);
assert.equal(blocked.ok, false);
const withProfile = saveSupplierProfile(withFile, {
  contactName: 'Kari Nord',
  email: 'anbud@nordbygg.no',
  username: 'nordbygg',
  portal: 'Mercell',
  portalUrl: 'https://app.mercell.com/auth/login?bidding',
  companyName: 'Nord Bygg',
}).state;
assert.equal(withProfile.supplierProfile.username, 'nordbygg');
assert.equal(withProfile.supplierProfile.portal, 'Mercell');
assert.match(withProfile.supplierProfile.portalUrl, /^https:\/\/app\.mercell\.com\/auth\/login/);
assert.equal(saveSupplierProfile(withFile, {
  contactName: 'Kari Nord',
  email: 'anbud@nordbygg.no',
  username: 'nordbygg',
  portalUrl: 'ikke en adresse',
}).ok, false);
const filed = registerInterest(withProfile, withProfile.notices[0].id, withProfile.notices[0].dossier).state;
assert.equal(filed.bids[0].interest.username, 'nordbygg');
assert.equal(filed.bids[0].dossier.procedure, 'Åpen');
const bidState = createBidWork(withFile, withFile.notices[0].id).state;
assert.equal(bidState.bids[0].phase, 'trinn2');
assert.equal(bidState.bids[0].noticeId, withFile.notices[0].id);
assert.equal(bidState.notices.find((row) => row.id === withFile.notices[0].id).decision, 'tilbud');
