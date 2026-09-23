/** Pure membership index checks (no Firebase). */

export function isListedOnFamilyData(family, uid) {
  if (!family || !uid) return false;
  const members = Array.isArray(family.members) ? family.members : [];
  const activeUsers = Array.isArray(family.activeUsers) ? family.activeUsers : [];
  const memberIds = Array.isArray(family.memberIds) ? family.memberIds : [];
  return members.includes(uid) || activeUsers.includes(uid) || memberIds.includes(uid);
}
