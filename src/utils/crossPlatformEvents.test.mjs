import assert from 'node:assert/strict';
import { resolveEventWriteTarget } from './eventWriteTarget.js';

/**
 * Mirrors the mapping rule in listenEventsAcrossPlatforms:
 * cross-platform ProTop events stay editable; only source readOnly sticks.
 */
function mapCrossPlatformEvent(ev, { isActive, platformId = 'other' }) {
  return {
    ...ev,
    id: isActive ? ev.id : `xp:${platformId}:${ev.id}`,
    sourceEventId: ev.id,
    crossPlatform: !isActive,
    readOnly: !!ev.readOnly,
    private: !isActive ? true : !!ev.private,
    familyId: isActive ? 'active' : platformId,
    sourcePlatformId: isActive ? undefined : platformId,
  };
}

const personal = {
  id: 'e1',
  title: 'Privat avtale',
  createdBy: 'uid1',
  audience: 'selected',
  memberIds: ['uid1'],
};

const fromOther = mapCrossPlatformEvent(personal, { isActive: false });
assert.equal(fromOther.crossPlatform, true);
assert.equal(fromOther.private, true);
assert.equal(fromOther.readOnly, false, 'ProTop cross-family must be editable');
assert.equal(fromOther.sourceEventId, 'e1');
assert.equal(fromOther.familyId, 'other');

const target = resolveEventWriteTarget(fromOther, 'active');
assert.equal(target.familyId, 'other');
assert.equal(target.eventId, 'e1');

// Even if navigation forgot to remap id, xp: prefix must resolve.
const rawXp = {
  ...fromOther,
  id: 'xp:famA:real-event-99',
  sourceEventId: undefined,
  familyId: undefined,
};
const rawTarget = resolveEventWriteTarget(rawXp, 'active');
assert.equal(rawTarget.familyId, 'famA');
assert.equal(rawTarget.eventId, 'real-event-99');

const external = mapCrossPlatformEvent(
  { ...personal, readOnly: true, source: 'google' },
  { isActive: false },
);
assert.equal(external.readOnly, true, 'External calendars stay locked');

const local = mapCrossPlatformEvent(personal, { isActive: true });
assert.equal(local.crossPlatform, false);
assert.equal(local.readOnly, false);
assert.equal(local.private, false);
assert.deepEqual(
  resolveEventWriteTarget(local, 'active'),
  { familyId: 'active', eventId: 'e1' },
);

console.log('crossPlatformEvents.test.mjs: ok');
