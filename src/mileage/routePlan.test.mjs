import assert from 'node:assert/strict';
import { chargesForRoute, haversineKm, straightSamples } from './routePlan.js';
import { planDrivingRoute } from './drivingRoute.js';
import { roundTripKm } from './flow.js';

const horten = { lat: 59.414, lng: 10.486 };
const moss = { lat: 59.432, lng: 10.661 };
const ferry = chargesForRoute(straightSamples(horten, moss));
assert.ok(ferry.some((row) => row.id === 'bastosambandet'));
assert.equal(ferry.find((row) => row.id === 'bastosambandet').passes, 2);
assert.equal(ferry.find((row) => row.id === 'bastosambandet').amount, 496);

const oslo = { lat: 59.913, lng: 10.752 };
const sandnes = { lat: 58.852, lng: 5.735 };
const inland = chargesForRoute(straightSamples(oslo, sandnes));
assert.equal(inland.some((row) => row.kind === 'ferry'), false);

const lysaker = { lat: 59.913, lng: 10.639 };
assert.ok(haversineKm(oslo, lysaker) < 15);
const ring = chargesForRoute([oslo, lysaker], { roundTrip: false });
assert.equal(ring.find((row) => row.id === 'oslo-bomring').amount, 37);
assert.equal(roundTripKm(12.4), 24.8);

const estimated = await planDrivingRoute(horten, moss, {
  fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
});
assert.equal(estimated.source, 'estimate');
assert.ok(estimated.oneWayKm > 5);
assert.ok(estimated.points.length > 2);

const routed = await planDrivingRoute(horten, moss, {
  fetchImpl: async () => ({
    ok: true,
    json: async () => ({
      routes: [{
        distance: 18600,
        geometry: { coordinates: [[10.486, 59.414], [10.661, 59.432]] },
      }],
    }),
  }),
});
assert.equal(routed.source, 'osrm');
assert.equal(routed.oneWayKm, 18.6);
assert.equal(roundTripKm(routed.oneWayKm), 37.2);
