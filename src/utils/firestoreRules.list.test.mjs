import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rules = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../firestore.rules'),
  'utf8',
);

assert.match(rules, /function isFamilyMemberLite\(familyId\)/);
assert.match(rules, /function canReadShoppingListData\(d\)/);
assert.match(
  rules,
  /allow list: if isFamilyMemberLite\(familyId\) && canReadShoppingListData\(resource\.data\);/,
);
assert.match(rules, /match \/\{path=\*\*\}\/shoppingLists\/\{listId\}/);
assert.match(rules, /allow list: if isFamilyMemberLite\(familyId\)/);
assert.match(rules, /allow get: if isFamilyMember\(familyId\) && canReadShoppingListData\(resource\.data\);/);

// Family subcollection LIST must not call the heavy isFamilyMember() helper
// (parent/child exists+get blows the 10-get budget and 400s the Listen channel).
const familyStart = rules.indexOf('match /families/{familyId}');
const topLevelParents = rules.indexOf('\n    match /parents/{parentId}');
const familyBlock = rules.slice(familyStart, topLevelParents > familyStart ? topLevelParents : undefined);
assert.doesNotMatch(
  familyBlock,
  /allow list: if isFamilyMember\(familyId\)/,
);

// Catch-all family subcollections (incl. chats/.../messages): GET uses full
// isFamilyMember (parent/child docs OK), LIST uses Lite (members/activeUsers).
const catchAllIdx = familyBlock.lastIndexOf('match /{document=**}');
assert.ok(catchAllIdx >= 0, 'family catch-all match missing');
const catchAll = familyBlock.slice(catchAllIdx);
assert.match(catchAll, /allow get: if isFamilyMember\(familyId\)/);
assert.match(catchAll, /allow list: if isFamilyMemberLite\(familyId\)/);

const open = (rules.match(/\{/g) || []).length;
const close = (rules.match(/\}/g) || []).length;
assert.equal(open, close, `unbalanced rules braces: ${open} vs ${close}`);

console.log('firestoreRules.list.test.mjs: ok');
