/**
 * Unit tests for reiseplanleggerLogic — timeline, roles, route projection.
 */
import assert from 'node:assert/strict';
import {
  assertValidTripInput,
  assertValidDestinationInput,
  assertValidItemInput,
  canEditTrip,
  tripStatus,
  buildTimeline,
  categorizeTrips,
  syncMemberRoles,
  routePoints,
  projectRoute,
  worldRouteLayout,
  latLngToWorldXY,
  routeMapsUrl,
  splitDateTime,
  joinDateTime,
  localDateKey,
  ROLES,
  ITEM_TYPES,
} from './reiseplanleggerLogic.js';

// --- validation ---
{
  assert.throws(() => assertValidTripInput({ title: '' }), /navn/);
  const t = assertValidTripInput({ title: '  Sommer i Italia  ', startDate: '2026-07-01', endDate: '2026-07-10' });
  assert.equal(t.title, 'Sommer i Italia');
  assert.throws(
    () => assertValidTripInput({ title: 'X', startDate: '2026-08-01', endDate: '2026-07-01' }),
    /Sluttdato/,
  );
}

{
  assert.throws(() => assertValidDestinationInput({ name: '' }), /destinasjonen/);
  const d = assertValidDestinationInput({
    name: 'Roma',
    location: { label: 'Roma, Italia', lat: 41.9, lng: 12.5 },
    arriveAt: '2026-07-02T14:00',
  }, 1);
  assert.equal(d.order, 1);
  assert.equal(d.location.lat, 41.9);
}

{
  const item = assertValidItemInput({ type: 'ticket', ticketKind: 'flight', title: 'OSL–FCO' });
  assert.equal(item.type, ITEM_TYPES.ticket);
  assert.equal(item.ticketKind, 'flight');
}

// --- roles ---
{
  const trip = {
    createdBy: 'owner',
    memberIds: ['owner', 'reader1', 'planner2'],
    memberRoles: { owner: ROLES.planner, reader1: ROLES.reader, planner2: ROLES.planner },
  };
  assert.equal(canEditTrip(trip, 'owner'), true);
  assert.equal(canEditTrip(trip, 'planner2'), true);
  assert.equal(canEditTrip(trip, 'reader1'), false);
  assert.equal(canEditTrip(trip, 'stranger'), false);
  assert.equal(canEditTrip(trip, 'stranger', { isFamilyAdmin: true }), true);
}

{
  const synced = syncMemberRoles(['a', 'b'], { a: ROLES.reader }, { ownerUid: 'owner' });
  assert.ok(synced.memberIds.includes('owner'));
  assert.equal(synced.memberRoles.owner, ROLES.planner);
  assert.equal(synced.memberRoles.a, ROLES.reader);
  assert.equal(synced.memberRoles.b, ROLES.reader);
}

// --- status & categorize ---
{
  const now = Date.parse('2026-07-05T12:00:00');
  assert.equal(tripStatus({ startDate: '2026-08-01', endDate: '2026-08-10' }, now), 'upcoming');
  assert.equal(tripStatus({ startDate: '2026-07-01', endDate: '2026-07-10' }, now), 'active');
  assert.equal(tripStatus({ startDate: '2026-06-01', endDate: '2026-06-10' }, now), 'past');
  assert.equal(tripStatus({ title: 'Ide' }, now), 'draft');

  const cats = categorizeTrips([
    { id: '1', startDate: '2026-08-01', endDate: '2026-08-05' },
    { id: '2', startDate: '2026-07-01', endDate: '2026-07-10' },
    { id: '3', startDate: '2026-01-01', endDate: '2026-01-05' },
    { id: '4', title: 'Drøm' },
  ], now);
  assert.equal(cats.upcoming.length, 1);
  assert.equal(cats.active.length, 1);
  assert.equal(cats.past.length, 1);
  assert.equal(cats.draft.length, 1);
}

// --- timeline collapse ---
{
  const now = Date.parse('2026-07-05T12:00:00');
  const trip = {
    startDate: '2026-07-01',
    endDate: '2026-07-10',
    destinations: [
      {
        id: 'd1', name: 'Oslo', order: 0, arriveAt: '2026-07-01', leaveAt: '2026-07-02',
        location: { label: 'Oslo', lat: 59.9, lng: 10.7 },
        items: [
          { id: 'i1', type: 'ticket', ticketKind: 'flight', title: 'Fly', startAt: '2026-07-01T08:00' },
        ],
      },
      {
        id: 'd2', name: 'Roma', order: 1, arriveAt: '2026-07-05T15:00',
        location: { label: 'Roma', lat: 41.9, lng: 12.5 },
        items: [
          { id: 'i2', type: 'activity', title: 'Colosseum', startAt: '2026-07-06T10:00' },
        ],
      },
      {
        id: 'd3', name: 'Firenze', order: 2, arriveAt: '2026-07-08',
        location: { label: 'Firenze', lat: 43.7, lng: 11.2 },
        items: [],
      },
    ],
  };
  const tl = buildTimeline(trip, { now, expandPast: false });
  assert.equal(tl.status, 'active');
  assert.ok(tl.pastDays.length >= 1);
  assert.ok(tl.pastDays.every((d) => d.collapsed === true));
  assert.ok(tl.liveDays.length >= 1);
  assert.ok(tl.liveDays.every((d) => d.collapsed === false));
  assert.ok(tl.nextEvent);

  const expanded = buildTimeline(trip, { now, expandPast: true });
  assert.ok(expanded.pastDays.every((d) => d.collapsed === false));
}

// --- route ---
{
  const trip = {
    destinations: [
      { id: 'a', name: 'Oslo', order: 0, location: { lat: 59.9, lng: 10.7 } },
      { id: 'b', name: 'Roma', order: 1, location: { lat: 41.9, lng: 12.5 } },
      { id: 'c', name: 'Firenze', order: 2, location: { lat: 43.7, lng: 11.2 } },
    ],
  };
  const pts = routePoints(trip);
  assert.equal(pts.length, 3);
  assert.equal(pts[0].label, 'A');
  assert.equal(pts[1].label, 'B');
  const projected = projectRoute(pts);
  assert.equal(projected.length, 3);
  projected.forEach((p) => {
    assert.ok(p.x >= 0 && p.x <= 1);
    assert.ok(p.y >= 0 && p.y <= 1);
  });
}

// --- date/time helpers & route maps ---
{
  assert.deepEqual(splitDateTime('2026-07-02T15:00'), { date: '2026-07-02', time: '15:00' });
  assert.deepEqual(splitDateTime('2026-07-05'), { date: '2026-07-05', time: '' });
  assert.equal(joinDateTime('2026-07-02', '9:05'), '2026-07-02T09:05');
  assert.equal(joinDateTime('2026-07-02', ''), '2026-07-02');
  assert.equal(localDateKey(new Date(2026, 6, 5, 23, 30)), '2026-07-05');

  const trip = {
    destinations: [
      {
        id: 'a', name: 'Oslo', order: 0, arriveAt: '2026-07-01', leaveAt: '2026-07-03',
        location: { lat: 59.9, lng: 10.7, label: 'Oslo' },
      },
      {
        id: 'b', name: 'Roma', order: 1, arriveAt: '2026-07-03T15:00',
        location: { lat: 41.9, lng: 12.5, label: 'Roma' },
      },
    ],
  };
  const tl = buildTimeline(trip, { now: Date.parse('2026-07-05T12:00:00') });
  assert.ok(tl.days.some((d) => d.events.some((e) => e.kind === 'departure')));
  assert.ok(tl.days.every((d) => d.events.filter((e) => e.kind === 'destination')
    .every((e) => e.destinationName)));
  const pts = routePoints(trip);
  assert.match(routeMapsUrl(pts), /\/dir\//);
}

// --- world map route layout (verdenskart) ---
{
  const oslo = latLngToWorldXY(59.9, 10.7);
  const alicante = latLngToWorldXY(38.35, -0.49);
  assert.ok(oslo.x > alicante.x);
  assert.ok(oslo.y < alicante.y); // north = smaller y

  const layout = worldRouteLayout([
    { id: 'a', label: 'A', name: 'Alacant', lat: 38.35, lng: -0.49 },
    { id: 'b', label: 'B', name: 'Kristiansand', lat: 58.15, lng: 8.0 },
    { id: 'c', label: 'C', name: 'Norge', lat: 60.5, lng: 8.5 },
  ]);
  assert.equal(layout.hasCoords, true);
  assert.equal(layout.markers.length, 3);
  assert.ok(layout.spanX > 0 && layout.spanY > 0);
  assert.match(layout.viewBox, /^-?\d/);
  // Alicante should sit south-west of the Norway stops inside the view
  const [a, b] = layout.markers;
  assert.ok(a.x < b.x);
  assert.ok(a.y > b.y);
  assert.equal(a.hasCoords, true);

  const empty = worldRouteLayout([{ id: 'x', label: 'A', name: 'Uten sted' }]);
  assert.equal(empty.hasCoords, false);
  assert.equal(empty.markers[0].hasCoords, false);
}

console.log('reiseplanleggerLogic.test.mjs: all ok');
