import assert from 'node:assert/strict';
import {
  custodyParentSlotForDate,
  custodyOverlayForDay,
  defaultCustodySchedule,
  normalizeCustody,
  normalizeCustodyForm,
  defaultCustodyRules,
  slotIsMine,
  viewerCustodySlot,
  resolveCustodyLabels,
  custodyLegendLabels,
} from './custodySchedule.js';
import { parseDateKey } from './dates.js';

const parentA = 'parent-a-uid';
const parentB = 'parent-b-uid';

const alternating = defaultCustodySchedule({ parentAUid: parentA, parentBUid: parentB });

assert.equal(
  custodyParentSlotForDate(alternating, parseDateKey(alternating.rules[0].dateKey)),
  'parentA',
  'first anchor week should be parentA',
);
assert.equal(
  custodyParentSlotForDate(alternating, parseDateKey(alternating.rules[1].dateKey)),
  'parentB',
  'offset week should be parentB',
);

const weeklyNorm = normalizeCustody({
  enabled: true,
  parentAUid: parentA,
  parentBUid: parentB,
  rules: [
    {
      id: 'a',
      parentSlot: 'parentA',
      dateKey: '2026-09-01',
      recurring: true,
      recurrenceType: 'weekly',
      recurrenceInterval: 1,
      recurrenceByDays: [1, 2, 3],
    },
    {
      id: 'b',
      parentSlot: 'parentB',
      dateKey: '2026-09-01',
      recurring: true,
      recurrenceType: 'weekly',
      recurrenceInterval: 1,
      recurrenceByDays: [4, 5, 6, 0],
    },
  ],
});

assert.equal(custodyParentSlotForDate(weeklyNorm, parseDateKey('2026-09-01')), 'parentA');
assert.equal(custodyParentSlotForDate(weeklyNorm, parseDateKey('2026-09-03')), 'parentB');

const kids = [
  { id: 'kid-1', name: 'Ola', custody: alternating },
  { id: 'kid-2', name: 'Kari', custody: weeklyNorm },
];

const overlayMine = custodyOverlayForDay({
  date: parseDateKey(alternating.rules[0].dateKey),
  kids,
  viewerUid: parentA,
  childFilter: 'all',
});
assert.equal(overlayMine.kind, 'mine');

const overlayMixed = custodyOverlayForDay({
  date: parseDateKey('2026-09-03'),
  kids,
  viewerUid: parentA,
  childFilter: 'all',
});
assert.equal(overlayMixed.kind, 'mixed');

const draft = normalizeCustodyForm({
  enabled: true,
  parentAUid: parentA,
  parentBUid: parentA,
  rules: defaultCustodyRules(),
});
assert.equal(draft.enabled, true, 'form should stay enabled while picking second parent');
assert.equal(draft.rules.length, 2);

const singleParent = normalizeCustody({
  enabled: true,
  parentAUid: parentA,
  parentBUid: null,
  parentALabel: 'Meg',
  parentBLabel: 'Mor',
  myParentSlot: 'parentA',
  rules: defaultCustodyRules(),
});
assert.equal(singleParent.enabled, true, 'single parent without account should be valid');
assert.equal(singleParent.parentBUid, null);

const labels = resolveCustodyLabels(singleParent, { parents: [], viewerUid: parentA });
assert.equal(labels.parentA, 'Meg');
assert.equal(labels.parentB, 'Mor');

assert.equal(viewerCustodySlot(singleParent, parentA), 'parentA');
assert.equal(
  slotIsMine(singleParent, 'parentA', parentA),
  true,
  'logged-in parent should see own slot as mine',
);
assert.equal(
  slotIsMine(singleParent, 'parentB', parentA),
  false,
  'other parent slot should not be mine',
);

const singleKid = [{ id: 'kid-1', name: 'Ola', custody: singleParent }];
const singleOverlayMine = custodyOverlayForDay({
  date: parseDateKey(singleParent.rules[0].dateKey),
  kids: singleKid,
  viewerUid: parentA,
  childFilter: 'all',
});
assert.equal(singleOverlayMine.kind, 'mine');

const singleOverlayOther = custodyOverlayForDay({
  date: parseDateKey(singleParent.rules[1].dateKey),
  kids: singleKid,
  viewerUid: parentA,
  childFilter: 'all',
});
assert.equal(singleOverlayOther.kind, 'other');

const childSchedule = defaultCustodySchedule({
  parentAUid: parentA,
  parentBUid: parentB,
  parentALabel: 'Geir Ove',
  parentBLabel: 'Mor',
});
const adelen = { id: 'adelen', name: 'Adelen', custody: childSchedule };
const childLegend = custodyLegendLabels({
  kids: [adelen, { id: 'vanessa', name: 'Vanessa', custody: childSchedule }],
  viewerUid: parentA,
  childFilter: 'adelen',
  members: [{ role: 'parent', uid: parentA, name: 'Geir Ove Andersen' }],
  viewerIsChild: false,
});
assert.equal(childLegend.mine, 'Hos Geir Ove');
assert.equal(childLegend.other, null);
assert.equal(childLegend.mixed, 'Bytter i løpet av uken');

const loggedInChildLegend = custodyLegendLabels({
  kids: [adelen],
  viewerUid: 'child-uid',
  childFilter: 'adelen',
  members: [],
  viewerIsChild: true,
});
assert.equal(loggedInChildLegend.mine, 'Hos Geir Ove');
assert.equal(loggedInChildLegend.other, null);

console.log('custodySchedule.test.mjs: ok');
