import assert from 'node:assert/strict';
import {
  friendUidsFromPicked,
  resolveEventPeople,
  synligForSummary,
  whoVisibilityLabel,
} from './eventSharing.js';

const members = [
  { uid: 'geir', name: 'Geir Ove Andersen' },
  { id: 'adelen', name: 'Adelen', childId: 'adelen' },
];
const friends = [
  { uid: 'eli', name: 'Eli-Margrethe Uglem' },
  { uid: 'monica', name: 'Monica' },
];

assert.deepEqual(
  friendUidsFromPicked(['geir', 'eli', 'adelen'], { members, ownerUid: 'geir' }),
  ['eli'],
);

assert.deepEqual(
  friendUidsFromPicked(['geir'], { members, ownerUid: 'geir' }),
  [],
);

const people = resolveEventPeople(members, ['geir', 'eli'], friends);
assert.equal(people.length, 2);
assert.equal(people[0].name, 'Geir Ove Andersen');
assert.equal(people[1].role, 'friend');
assert.equal(people[1].uid, 'eli');

assert.equal(
  whoVisibilityLabel(['geir', 'eli'], 'selected', members, friends),
  'Geir, Eli-Margrethe (venn)',
);

assert.equal(
  synligForSummary({
    wholeFamily: false,
    picked: ['geir', 'eli'],
    members,
    friendPeople: friends,
  }),
  'Synlig for: Geir, Eli-Margrethe',
);

assert.equal(
  synligForSummary({
    wholeFamily: false,
    picked: ['geir'],
    members,
    friendPeople: friends,
  }),
  'Synlig for: Geir',
);

assert.equal(
  synligForSummary({ wholeFamily: true, picked: [], members, friendPeople: friends }),
  'Synlig for: hele familien',
);

// Regression: friend-only selection must not collapse to "deg"
assert.equal(
  synligForSummary({
    wholeFamily: false,
    picked: ['geir', 'eli'],
    members: [{ uid: 'geir', name: 'Geir' }],
    friendPeople: friends,
  }),
  'Synlig for: Geir, Eli-Margrethe',
);

console.log('eventSharing.test.mjs: ok');
