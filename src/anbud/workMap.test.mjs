import assert from 'node:assert/strict';
import { applyGeoHits, bidMapRows, mergeWorkGeo, reviewMapRows, workGeocodeQuery } from './workMap.js';

const rows = reviewMapRows({
  notices: [{ id: 'n1', title: 'Bro', buyer: 'Oslo kommune', places: ['Oslo'], deadline: '2026-10-01', source: 'doffin' }],
  direct: [{ id: 'in1', title: 'Direkte', fromName: 'Bergen kommune', queueKind: 'protop' }],
});
assert.equal(rows.length, 2);
assert.equal(rows[0].decision, 'aktuell');
assert.equal(rows[0].places[0], 'Oslo');
assert.equal(rows[1].buyer, 'Bergen kommune');
assert.equal(rows[1].source, 'protop');
assert.equal(rows[0].mapNo, 1);
assert.equal(rows[1].mapNo, 2);

assert.equal(workGeocodeQuery({ buyer: 'Kvitsøy kommune', places: [] }), 'Kvitsøy kommune');
assert.equal(workGeocodeQuery({ places: ['Oslo'], buyer: 'Annen' }), 'Oslo');
assert.equal(workGeocodeQuery({ title: 'AB', buyer: 'X' }), '');

const bids = bidMapRows(
  [{ id: 'b1', title: 'Rammeavtale', buyer: 'Kvitsøy kommune', noticeId: 'n1', deadline: '2026-10-07' }],
  [{ id: 'n1', places: ['Rogaland'], geo: { lat: 59, lng: 5, label: 'Rogaland' }, buyer: 'Kvitsøy kommune', source: 'doffin' }],
);
assert.equal(bids[0].geo.label, 'Rogaland');
assert.equal(bids[0].places[0], 'Rogaland');
assert.equal(bids[0].source, 'doffin');
assert.equal(bids[0].decision, 'aktuell');
assert.equal(bids[0].mapNo, 1);

const manual = bidMapRows([{ id: 'b2', title: 'Eget', buyer: 'Stavanger kommune', source: 'manuell' }], []);
assert.equal(manual[0].source, 'manuell');
assert.equal(manual[0].geo, null);
assert.equal(manual[0].mapNo, 1);

const kept = applyGeoHits([{ id: 'n1', geo: { lat: 1, lng: 2 } }], [{ id: 'n1', geo: { lat: 9, lng: 9 } }]);
assert.equal(kept.changed, false);
assert.equal(kept.rows[0].geo.lat, 1);

const merged = mergeWorkGeo({
  bids: [{ id: 'b1', noticeId: 'n1', title: 'Tilbud' }],
  notices: [{ id: 'n1', title: 'Kunngjøring' }],
}, [{ id: 'b1', geo: { lat: 59.1, lng: 5.4, label: 'Kvitsøy' } }]);
assert.equal(merged.changed, true);
assert.equal(merged.bids[0].geo.label, 'Kvitsøy');
assert.equal(merged.notices[0].geo.label, 'Kvitsøy');
assert.equal(mergeWorkGeo({ bids: [], notices: [] }, []).changed, false);

console.log('workMap.test.mjs ok');
