/** Active platform ids for shopping-list listeners. */
export function activeShopFamilyIds(families, familyId) {
  const ids = (families || [])
    .filter((f) => f?.id && f.deleted !== true && f.archived !== true && f.active !== false)
    .map((f) => f.id);
  if (familyId && !ids.includes(familyId)) ids.push(familyId);
  return ids;
}

export function shopFamilyIdsKey(families, familyId) {
  return activeShopFamilyIds(families, familyId).join('|');
}
