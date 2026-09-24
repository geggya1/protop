/**
 * Plattformtyper for ProTop.
 * Hver type har egen skall — typen låses ved opprettelse.
 */

export const FAMILY_TYPES = ['family'];
export const FRIENDS_TYPES = ['friends'];
export const CONGREGATION_TYPES = ['congregation'];
export const DAYCARE_TYPES = ['daycare'];
export const FLEX_GROUP_TYPES = ['group'];
export const COMPANY_TYPES = ['company'];
export const TEAM_TYPES = ['team', 'club'];
export const CLASSROOM_TYPES = ['class', 'classroom'];

export const ALL_PLATFORM_TYPES = [
  ...FAMILY_TYPES,
  ...FRIENDS_TYPES,
  ...CONGREGATION_TYPES,
  ...DAYCARE_TYPES,
  ...FLEX_GROUP_TYPES,
  ...COMPANY_TYPES,
  ...TEAM_TYPES,
  ...CLASSROOM_TYPES,
];

function norm(type) {
  return String(type || 'family').toLowerCase();
}

export function isFamilyType(type) {
  return FAMILY_TYPES.includes(norm(type));
}

export function isFriendsType(type) {
  return FRIENDS_TYPES.includes(norm(type));
}

export function isCongregationType(type) {
  return CONGREGATION_TYPES.includes(norm(type));
}

export function isDaycareType(type) {
  return DAYCARE_TYPES.includes(norm(type));
}

export function isFlexGroupType(type) {
  return FLEX_GROUP_TYPES.includes(norm(type));
}

export function isCompanyType(type) {
  return COMPANY_TYPES.includes(norm(type));
}

export function isTeamType(type) {
  return TEAM_TYPES.includes(norm(type));
}

export function isClassroomType(type) {
  return CLASSROOM_TYPES.includes(norm(type));
}

export function isSocialPlatformType(type) {
  const t = norm(type);
  return isFriendsType(t) || isCongregationType(t) || isDaycareType(t) || isFlexGroupType(t);
}

export function platformTypeLabel(type) {
  const t = norm(type);
  if (isFriendsType(t)) return 'Vennegjeng';
  if (isCongregationType(t)) return 'Forsamling';
  if (isDaycareType(t)) return 'Barnehage / SFO';
  if (isFlexGroupType(t)) return 'Gruppe';
  if (isCompanyType(t)) return 'Bedrift';
  if (isTeamType(t)) return 'Idrettslag';
  if (isClassroomType(t)) return 'Klasserom';
  return 'Familie';
}

export function platformHomeRoute(type) {
  const t = norm(type);
  if (isTeamType(t)) return 'TeamHome';
  if (isClassroomType(t)) return 'ClassroomHome';
  if (isFriendsType(t)) return 'FriendsHome';
  if (isCongregationType(t)) return 'CongregationHome';
  if (isDaycareType(t)) return 'DaycareHome';
  if (isFlexGroupType(t)) return 'GroupHome';
  if (isCompanyType(t)) return 'CompanyHome';
  return 'Home';
}

export function platformTypesForFilter(type) {
  const t = norm(type);
  if (isFriendsType(t)) return FRIENDS_TYPES;
  if (isCongregationType(t)) return CONGREGATION_TYPES;
  if (isDaycareType(t)) return DAYCARE_TYPES;
  if (isFlexGroupType(t)) return FLEX_GROUP_TYPES;
  if (isCompanyType(t)) return COMPANY_TYPES;
  if (isTeamType(t)) return TEAM_TYPES;
  if (isClassroomType(t)) return CLASSROOM_TYPES;
  return FAMILY_TYPES;
}
