import assert from 'node:assert/strict';
import { projectAddressLabel, projectDestinationSuggestion } from './flow.js';
import { decodePolyline, planDrivingRoute, tollEstimateNok } from './drivingRoute.js';
import { ferryPassages, parseNvdbPoint, tollPassagesForRoute } from './tollPassages.js';
import { TOLL_STATIONS } from './tollStations.js';
import { suggestDriving } from './suggestRoute.js';

const school = {
  id: 'p1',
  name: 'Kvitsøy skole',
  street: '',
  postalCode: '',
  placeName: '',
  place: 'Ydstebøvegen 42, 4180 Kvitsøy',
};
assert.equal(projectAddressLabel(school), 'Ydstebøvegen 42, 4180 Kvitsøy');

const structured = { street: 'Kai 1', postalCode: '0150', placeName: 'Oslo', place: 'gammel' };
assert.equal(projectAddressLabel(structured), 'Kai 1, 0150 Oslo');

const bare = { id: 'p2', name: 'Kvitsøy skole' };
assert.equal(projectAddressLabel(bare), '');
assert.equal(projectDestinationSuggestion(bare), 'Kvitsøy skole');

const viaContract = projectAddressLabel(
  { id: 'p3', name: 'Skole', contractId: 'c1' },
  { contracts: [{ id: 'c1', fields: { address: 'Skoleveien 2', postalCode: '4180', place: 'Kvitsøy' } }] },
);
assert.equal(viaContract, 'Skoleveien 2, 4180 Kvitsøy');

const viaCustomer = projectAddressLabel(
  { id: 'p4', name: 'Lager', customerId: 'k1' },
  { customers: [{ id: 'k1', address: 'Havnegata 4', postalCode: '4313', place: 'Sandnes' }] },
);
assert.equal(viaCustomer, 'Havnegata 4, 4313 Sandnes');

assert.equal(tollEstimateNok(null), null);
assert.equal(tollEstimateNok({}), 0);
assert.equal(tollEstimateNok({ estimatedPrice: [{ currencyCode: 'NOK', units: '84', nanos: 500000000 }] }), 84.5);

const decoded = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
assert.equal(decoded.length, 3);
assert.ok(Math.abs(decoded[0].lat - 38.5) < 0.01);
assert.ok(Math.abs(decoded[2].lng + 126.453) < 0.01);

assert.deepEqual(parseNvdbPoint('POINT Z(58.905852 5.700746 22.399)'), { lat: 58.905852, lng: 5.700746 });

const line = [
  { lat: 58.90, lng: 5.70 },
  { lat: 58.91, lng: 5.71 },
];
const passages = tollPassagesForRoute(line, [
  { id: '1', name: 'E 39 Stokkamyra, mot Nord - Forus', lat: 58.90, lng: 5.70, price: 30 },
  { id: '2', name: 'E 39 Stokkamyra, mot Nord - Forus', lat: 58.9001, lng: 5.7001, price: 30 },
  { id: '3', name: 'Langt unna', lat: 59.5, lng: 6.2, price: 40 },
], { roundTrip: true });
assert.equal(passages.length, 1);
assert.equal(passages[0].name, 'E 39 Stokkamyra, mot Nord - Forus');
assert.equal(passages[0].passes, 2);
assert.equal(passages[0].amount, 60);
assert.equal(passages[0].source, 'nvdb');

const ferries = ferryPassages([{ name: 'Kvitsøy - Mekjarvik' }, { name: 'Kvitsøy - Mekjarvik' }], { roundTrip: true });
assert.equal(ferries.length, 1);
assert.equal(ferries[0].kind, 'ferry');
assert.equal(ferries[0].passes, 2);

const routed = await planDrivingRoute(
  { lat: 58.85, lng: 5.74 },
  { lat: 59.06, lng: 5.40 },
  {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        routes: [{
          distance: 39600,
          geometry: { coordinates: [[5.74, 58.85], [5.40, 59.06]] },
          legs: [{ steps: [{ mode: 'ferry', name: 'Kvitsøy - Mekjarvik' }, { mode: 'driving', name: 'E39' }] }],
        }],
      }),
    }),
  },
);
assert.equal(routed.source, 'osrm');
assert.equal(routed.oneWayKm, 39.6);
assert.equal(routed.ferries.length, 1);
assert.equal(routed.ferries[0].name, 'Kvitsøy - Mekjarvik');

const google = await planDrivingRoute(
  { lat: 58.85, lng: 5.74 },
  { lat: 59.06, lng: 5.40 },
  {
    apiKey: 'test-key',
    fetchImpl: async (url) => {
      if (String(url).includes('routes.googleapis')) {
        return {
          ok: true,
          json: async () => ({
            routes: [{
              distanceMeters: 40200,
              polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
              travelAdvisory: { tollInfo: { estimatedPrice: [{ currencyCode: 'NOK', units: '30' }] } },
              legs: [{ steps: [] }],
            }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          routes: [{
            distance: 1000,
            geometry: { coordinates: [[5.74, 58.85], [5.40, 59.06]] },
            legs: [{ steps: [{ mode: 'ferry', name: 'Kvitsøy - Mekjarvik' }] }],
          }],
        }),
      };
    },
  },
);
assert.equal(google.source, 'google');
assert.equal(google.oneWayKm, 40.2);
assert.equal(google.tollEstimate, 30);
assert.equal(google.ferries[0].name, 'Kvitsøy - Mekjarvik');

const suggested = await suggestDriving(
  { lat: 58.90, lng: 5.70 },
  { lat: 58.91, lng: 5.71 },
  {
    stations: [
      { id: '1', name: 'E 39 Refsnesveien, mot Sørøst - Forus', lat: 58.90, lng: 5.70, price: 30 },
      { id: '2', name: 'Langt unna', lat: 60.1, lng: 8.2, price: 40 },
    ],
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        routes: [{
          distance: 12000,
          geometry: { coordinates: [[5.70, 58.90], [5.71, 58.91]] },
          legs: [{ steps: [{ mode: 'ferry', name: 'Kvitsøy - Mekjarvik' }] }],
        }],
      }),
    }),
  },
);
assert.equal(suggested.source, 'osrm');
assert.equal(suggested.oneWayKm, 12);
assert.ok(suggested.charges.some((row) => row.name.includes('Refsnesveien') && row.amount === 60));
assert.ok(suggested.charges.some((row) => row.kind === 'ferry' && row.name === 'Kvitsøy - Mekjarvik'));
assert.equal(suggested.charges.filter((row) => row.kind === 'toll').length, 1);

assert.ok(TOLL_STATIONS.length > 400);
const forus = TOLL_STATIONS.find((row) => row.name.includes('Stokkamyra'));
assert.ok(forus);
const bundled = tollPassagesForRoute(
  [forus, { lat: forus.lat + 0.02, lng: forus.lng }],
  TOLL_STATIONS,
  { roundTrip: false },
);
assert.ok(bundled.some((row) => row.name.includes('Stokkamyra') && row.passes === 1));

console.log('routeSuggest.test.mjs: ok');
