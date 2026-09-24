import assert from 'node:assert/strict';
import {
  isExternalCalendarEvent,
  externalEventVisibilityDocId,
  defaultExternalEventVisibility,
  applyVisibilityToFormState,
  isOwnerOnlyVisibility,
  buildExternalVisibilityPayload,
  overlayExternalEventVisibility,
} from './externalEventVisibility.js';

assert.equal(isExternalCalendarEvent({ connectionId: 'c1', readOnly: true }), true);
assert.equal(isExternalCalendarEvent({ sharedFromExternal: true }), false);
assert.equal(isExternalCalendarEvent({ title: 'x' }), false);

assert.ok(externalEventVisibilityDocId('ms/a=b').includes('_'));

const def = defaultExternalEventVisibility('owner-1');
assert.equal(def.wholeFamily, false);
assert.deepEqual(def.picked, ['owner-1']);

const family = applyVisibilityToFormState({ audience: 'family' }, 'owner-1');
assert.equal(family.wholeFamily, true);

assert.equal(isOwnerOnlyVisibility({ wholeFamily: false, picked: ['u1'], ownerUid: 'u1' }), true);
assert.equal(isOwnerOnlyVisibility({ wholeFamily: true, picked: [], ownerUid: 'u1' }), false);

const payload = buildExternalVisibilityPayload({
  existing: { id: 'ms-1', title: 'Møte', dateKey: '2026-09-17' },
  wholeFamily: false,
  picked: ['u1', 'u2'],
  ownerUid: 'u1',
});
assert.equal(payload.audience, 'selected');
assert.deepEqual(payload.memberIds, ['u1', 'u2']);

const ext = { id: 'ms-1', connectionId: 'c1', readOnly: true, private: true };
const withDefault = overlayExternalEventVisibility(ext, {}, 'owner-1');
assert.equal(withDefault.audience, 'selected');
assert.deepEqual(withDefault.memberIds, ['owner-1']);

const withSaved = overlayExternalEventVisibility(ext, {
  'ms-1': { audience: 'selected', memberIds: ['u1', 'u2'], ownerUid: 'u1' },
}, 'u1');
assert.deepEqual(withSaved.memberIds, ['u1', 'u2']);

console.log('externalEventVisibility.test.mjs: ok');
