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

// HR under families/{familyId}/hr — medlemskap og HR-tilgang i speilet (L-01), ikke på tvers av selskaper.
assert.match(familyBlock, /match \/hr\/\{document=\*\*\}/);
const hrIdx = familyBlock.indexOf('match /hr/{document=**}');
assert.ok(hrIdx >= 0, 'hr match missing');
const hrBlock = familyBlock.slice(hrIdx, familyBlock.indexOf('match /hrSelf/', hrIdx));
assert.match(hrBlock, /allow get: if isFamilyMember\(familyId\) && hrReader\(familyId\)/);
assert.match(hrBlock, /allow list: if isFamilyMemberLite\(familyId\) && hrReader\(familyId\)/);
assert.match(rules, /coll == 'hr' \|\| coll == 'hrSelf'/, 'hr må være unntatt fra den generelle regelen');

// Catch-all family subcollections (incl. chats/.../messages): GET uses full
// isFamilyMember (parent/child docs OK), LIST uses Lite (members/activeUsers).
// ISO-samlingene, accessAcl og de skjermede samlingene er unntatt (isProtected) og har egne regler.
// Dokumentnivå og underlag er delt i to, så bruksloggen på ansattposten kan skjermes (isProtectedSub).
const catchAllIdx = familyBlock.indexOf('match /{coll}/{docId} {');
assert.ok(catchAllIdx >= 0, 'family catch-all match missing');
assert.ok(hrIdx < catchAllIdx, 'hr match must precede catch-all');
const catchAll = familyBlock.slice(catchAllIdx);
assert.match(catchAll, /match \/\{coll\}\/\{docId\}\/\{sub\}\/\{rest=\*\*\}/);
assert.match(catchAll, /allow get: if !isProtected\(coll\) && isFamilyMember\(familyId\)/);
assert.match(catchAll, /allow list: if !isProtected\(coll\) && isFamilyMemberLite\(familyId\)/);

const open = (rules.match(/\{/g) || []).length;
const close = (rules.match(/\}/g) || []).length;
assert.equal(open, close, `unbalanced rules braces: ${open} vs ${close}`);

console.log('firestoreRules.list.test.mjs: ok');
