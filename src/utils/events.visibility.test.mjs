import assert from 'node:assert/strict';

function isFamilyAudience(ev) {
  if (!ev) return true;
  if (ev.audience === 'family') return true;
  if (ev.audience === 'selected') return false;
  return !Array.isArray(ev.memberIds) || ev.memberIds.length === 0;
}

function findMemberByAnyId(members, id) {
  if (!id || !Array.isArray(members)) return null;
  return members.find((m) => (
    m?.uid === id || m?.id === id || m?.docId === id || m?.childId === id
  )) || null;
}

function memberAliases(m) {
  if (!m) return [];
  return [m.uid, m.id, m.docId, m.childId].filter(Boolean);
}

function viewerSeesChildMember(m, set) {
  if (!m || m.role !== 'child') return false;
  return memberAliases(m).some((a) => set.has(a));
}

function eventVisibleToUser(ev, viewerIds, opts = {}) {
  if (!ev) return false;
  const set = viewerIds instanceof Set
    ? viewerIds
    : new Set((Array.isArray(viewerIds) ? viewerIds : [viewerIds]).filter(Boolean));
  if (!set.size) return false;
  const asChild = opts.asChild === true;
  const members = Array.isArray(opts.members) ? opts.members : [];
  const memberIds = Array.isArray(ev.memberIds) ? ev.memberIds.filter(Boolean) : [];
  const childIds = Array.isArray(ev.childIds) ? ev.childIds.filter(Boolean) : [];

  if (asChild) {
    if (ev.audience === 'family') return true;
    if (ev.audience === 'selected' || memberIds.length > 0) {
      if (!memberIds.length) return false;
      return memberIds.some((id) => {
        const m = findMemberByAnyId(members, id);
        if (m) return viewerSeesChildMember(m, set);
        return set.has(id);
      });
    }
    if (!ev.audience) {
      if (childIds.length > 0) return childIds.some((id) => set.has(id));
      if (memberIds.length === 0) return true;
    }
    return false;
  }

  if (isFamilyAudience(ev)) return true;
  if (memberIds.length > 0 || ev.audience === 'selected') {
    if (!memberIds.length) return false;
    return memberIds.some((id) => {
      const m = findMemberByAnyId(members, id);
      if (m) return memberAliases(m).some((a) => set.has(a));
      return set.has(id);
    });
  }
  return false;
}

const parentUid = 'parent-1';
const childUid = 'child-uid';
const childDocId = 'child-doc';
const members = [
  { role: 'parent', uid: parentUid, id: parentUid, name: 'Geir' },
  { role: 'child', uid: childUid, id: childDocId, childId: childDocId, name: 'Ada' },
];
const childView = new Set([childUid, childDocId]);
const leaky = new Set([childUid, childDocId, parentUid]);

assert.equal(eventVisibleToUser({ audience: 'family' }, childView, { asChild: true, members }), true);

const parentOnly = { audience: 'selected', memberIds: [parentUid], childIds: [childDocId] };
assert.equal(eventVisibleToUser(parentOnly, childView, { asChild: true, members }), false);
assert.equal(eventVisibleToUser(parentOnly, leaky, { asChild: true, members }), false);
assert.equal(eventVisibleToUser(parentOnly, new Set([parentUid]), { asChild: false, members }), true);

// memberIds uten audience (eldre lagring med kun foresatt)
assert.equal(eventVisibleToUser({ memberIds: [parentUid], childIds: [childDocId] }, childView, { asChild: true, members }), false);
assert.equal(eventVisibleToUser({ memberIds: [parentUid] }, leaky, { asChild: true, members }), false);

assert.equal(eventVisibleToUser({
  audience: 'selected',
  memberIds: [parentUid, childDocId],
}, childView, { asChild: true, members }), true);

assert.equal(eventVisibleToUser({ childIds: [childDocId] }, childView, { asChild: true, members }), true);
assert.equal(eventVisibleToUser({}, childView, { asChild: true, members }), true);

console.log('events.visibility.test.mjs: ok');
