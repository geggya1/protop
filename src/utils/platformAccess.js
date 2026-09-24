/**
 * Midlertidig plattform-gating: vanlige brukere ser og oppretter kun familie.
 * Superadmin/utvikler (goa@invest-as.no) har tilgang til alle plattformer.
 */
import { isFamilyType } from './groupTypes.js';

export const PLATFORM_DEV_EMAILS = ['goa@invest-as.no'];

export const PUBLIC_PLATFORM_TYPES = ['family'];

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
  return isFamilyType(type);
}

export function assertCanCreatePlatformType(type, userOrEmail) {
  if (canUsePlatformType(type, userOrEmail)) return;
  const err = new Error('Denne plattformen er ikke tilgjengelig ennå.');
  err.code = 'platform-restricted';
  throw err;
}

export function visibleGroupsForUser(groups, userOrEmail, { isChild = false } = {}) {
  const list = Array.isArray(groups) ? groups : [];
  if (isChild || canAccessAllPlatforms(userOrEmail)) return list;
  return list.filter((g) => isFamilyType(g?.type));
}
