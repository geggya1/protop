/**
 * Second-pass UX/logic tests for Reiseplanlegger — past collapse, next event, roles.
 */
import assert from 'node:assert/strict';
import {
  buildTimeline,
  tripStatus,
  canEditTrip,
  canViewTrip,
  formatTripDates,
  projectRoute,
  routePoints,
  syncMemberRoles,
  ROLES,
} from './reiseplanleggerLogic.js';

const trip = {
  title: 'Italia',
  startDate: '2026-07-01',
  endDate: '2026-07-12',
  createdBy: 'u1',
  memberIds: ['u1', 'u2', 'u3'],
  memberRoles: { u1: ROLES.planner, u2: ROLES.planner, u3: ROLES.reader },
  destinations: [
    {
      id: 'a', name: 'Oslo', order: 0, arriveAt: '2026-07-01T08:00', leaveAt: '2026-07-01T12:00',
      location: { lat: 59.91, lng: 10.75, label: 'Oslo' },
      items: [{ id: 't1', type: 'ticket', ticketKind: 'flight', title: 'Fly OSL-FCO', startAt: '2026-07-01T09:30' }],
    },
    {
      id: 'b', name: 'Roma', order: 1, arriveAt: '2026-07-01T15:00', leaveAt: '2026-07-06',
      location: { lat: 41.9, lng: 12.5, label: 'Roma' },
      checkedIn: true,
      items: [
        { id: 'a1', type: 'activity', title: 'Colosseum', startAt: '2026-07-02T10:00' },
        { id: 'm1', type: 'memory', title: 'Minne', description: 'Gelato!', startAt: '2026-07-03' },
      ],
    },
    {
      id: 'c', name: 'Firenze', order: 2, arriveAt: '2026-07-07', leaveAt: '2026-07-10',
      location: { lat: 43.77, lng: 11.25, label: 'Firenze' },
      items: [{ id: 'e1', type: 'event', title: 'Uffizi', startAt: '2026-07-08T11:00' }],
    },
    {
      id: 'd', name: 'Venezia', order: 3, arriveAt: '2026-07-11',
      location: { lat: 45.44, lng: 12.32, label: 'Venezia' },
      items: [],
    },
  ],
};

// Mid-trip: past days collapsed, next event points ahead
{
  const now = Date.parse('2026-07-05T12:00:00');
  assert.equal(tripStatus(trip, now), 'active');
  const tl = buildTimeline(trip, { now, expandPast: false });
  assert.ok(tl.pastCount > 0);
  assert.ok(tl.pastDays.every((d) => d.collapsed && d.muted));
  assert.ok(tl.liveDays.every((d) => !d.collapsed));
  assert.ok(tl.nextEvent);
  assert.ok(['Firenze', 'Venezia', 'Uffizi', 'Roma', 'Colosseum', 'Minne'].includes(tl.nextEvent.title)
    || tl.nextEvent.destinationName);
}

// Before trip starts — nothing muted as past relative to start? days before now still past
{
  const now = Date.parse('2026-06-01T12:00:00');
  assert.equal(tripStatus(trip, now), 'upcoming');
  const tl = buildTimeline(trip, { now, expandPast: false });
  assert.equal(tl.pastDays.length, 0);
  assert.ok(tl.liveDays.length >= 3);
}

// After trip — all days past/collapsed
{
  const now = Date.parse('2026-08-01T12:00:00');
  assert.equal(tripStatus(trip, now), 'past');
  const tl = buildTimeline(trip, { now, expandPast: false });
  assert.ok(tl.pastDays.length >= 1);
  assert.equal(tl.liveDays.length, 0);
}

// Roles
{
  assert.equal(canEditTrip(trip, 'u1'), true);
  assert.equal(canEditTrip(trip, 'u2'), true);
  assert.equal(canEditTrip(trip, 'u3'), false);
  assert.equal(canViewTrip(trip, 'u3', { isFamilyMember: true }), true);
  assert.equal(canViewTrip(trip, 'u4', { isFamilyMember: true, isGrandparent: true }), false);
  assert.equal(canViewTrip(trip, 'u2', { isFamilyMember: true, isGrandparent: true }), true);
  assert.equal(canViewTrip({ ...trip, deleted: true }, 'u1', { isFamilyMember: true }), false);
}

// Route projection stays in bounds with 4 stops
{
  const pts = routePoints(trip);
  assert.equal(pts.map((p) => p.label).join(''), 'ABCD');
  const proj = projectRoute(pts);
  proj.forEach((p) => {
    assert.ok(p.x >= 0 && p.x <= 1);
    assert.ok(p.y >= 0 && p.y <= 1);
    assert.equal(p.hasCoords, true);
  });
}

assert.match(formatTripDates(trip), /–/);
assert.equal(formatTripDates({}), 'Uten dato');

{
  const synced = syncMemberRoles(['u3'], { u3: ROLES.planner }, { ownerUid: 'u1' });
  assert.equal(synced.memberRoles.u1, ROLES.planner);
  assert.ok(synced.memberIds.includes('u1'));
}

console.log('reiseplanleggerLogic.ux.test.mjs: all ok');
