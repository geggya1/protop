/**
 * ProTop: eget arbeidsområde (personlig skall) og organisasjoner/firma.
 * Familie, idrett, skole og andre gamle plattformer vises ikke.
 */
import { isFamilyType, isOrganizationType } from './groupTypes.js';

export const PLATFORM_DEV_EMAILS = ['goa@invest-as.no'];

export const PUBLIC_PLATFORM_TYPES = ['family', 'organization', 'company'];

export function isProtopWorkspace(group) {
  if (!group) return false;
  if (group.isPersonal === true) return true;
  return isOrganizationType(group.type);
}

function emailOf(userOrEmail) {
  if (!userOrEmail) return '';
  if (typeof userOrEmail === 'string') return userOrEmail.trim().toLowerCase();
  return String(userOrEmail.email || '').trim().toLowerCase();
}

export function canAccessAllPlatforms(userOrEmail) {
  const email = emailOf(userOrEmail);
  return !!email && PLATFORM_DEV_EMAILS.includes(email);
}

export function canUsePlatformType(type, userOrEmail) {
  if (canAccessAllPlatforms(userOrEmail)) return true;
  return isFamilyType(type) || isOrganizationType(type);
}

export function assertCanCreatePlatformType(type, userOrEmail) {
  if (canUsePlatformType(type, userOrEmail)) return;
  const err = new Error('Denne plattformen er ikke tilgjengelig ennå.');
  err.code = 'platform-restricted';
  throw err;
}

export function visibleGroupsForUser(groups) {
  const list = Array.isArray(groups) ? groups : [];
  return list.filter((g) => isProtopWorkspace(g));
}
