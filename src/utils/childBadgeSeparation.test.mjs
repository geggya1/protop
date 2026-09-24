import assert from 'node:assert/strict';

/** Speiler logikken i useModuleActivity for barn-badges (uten Firestore). */
function childModuleCounts({ openChores, openParentTasks }) {
  const counts = {};
  if (openParentTasks > 0) counts.stars = openParentTasks;
  if (openChores > 0) counts.chores = openChores;
  return counts;
}

/** Speiler mergeBadgeCounts uten Firebase-import. */
function mergeBadgeCounts(unreadCounts, activityCounts, { asChild = false } = {}) {
  const out = { ...(activityCounts || {}) };
  Object.entries(unreadCounts || {}).forEach(([key, value]) => {
    if (asChild && (key === 'stars' || key === 'chores')) return;
    out[key] = Math.max(Number(out[key]) || 0, Number(value) || 0);
  });
  return out;
}

assert.deepEqual(childModuleCounts({ openChores: 2, openParentTasks: 0 }), { chores: 2 });
assert.deepEqual(childModuleCounts({ openChores: 2, openParentTasks: 1 }), { stars: 1, chores: 2 });
assert.deepEqual(childModuleCounts({ openChores: 0, openParentTasks: 0 }), {});

const merged = mergeBadgeCounts(
  { stars: 2, chores: 0, chat: 1 },
  { chores: 2 },
  { asChild: true },
);
assert.equal(merged.stars, undefined);
assert.equal(merged.chores, 2);
assert.equal(merged.chat, 1);

const mergedParent = mergeBadgeCounts(
  { stars: 2 },
  { stars: 1 },
  { asChild: false },
);
assert.equal(mergedParent.stars, 2);

console.log('childBadgeSeparation.test.mjs: ok');
