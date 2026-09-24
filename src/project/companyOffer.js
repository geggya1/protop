/**
 * Bedrift tilbys etter innlogging og på organisasjonssiden — ikke under Prosjekt.
 * Opprettelse og innpass er gratis.
 */
import { isOrganizationType } from '../utils/groupTypes.js';
import { isPersonalShell } from '../utils/personalShell.js';

const dismissedThisSession = new Set();

export function dismissCompanyOffer(uid) {
  if (uid) dismissedThisSession.add(uid);
}

export function companyOfferDismissed(uid) {
  return !!(uid && dismissedThisSession.has(uid));
}

export function isLiveOrganization(group) {
  if (!group || !isOrganizationType(group.type)) return false;
  if (group.deleted === true || group.hiddenFromApp === true) return false;
  if (group.archived === true || group.active === false) return false;
  return true;
}

export function shouldOfferCompany({ uid, families = [], isChild = false } = {}) {
  if (!uid || isChild) return false;
  if (companyOfferDismissed(uid)) return false;
  return !(families || []).some(isLiveOrganization);
}

/** One personal workspace. Extra shells with the same role are the duplicate on the platform page. */
export function dedupePersonalShells(groups = [], preferredId = '') {
  let kept = null;
  const rest = [];
  for (const group of groups || []) {
    if (!isPersonalShell(group)) {
      rest.push(group);
      continue;
    }
    if (preferredId && group.id === preferredId) {
      kept = group;
      continue;
    }
    if (kept?.id === preferredId) continue;
    kept = kept ? preferPersonalShell(kept, group) : group;
  }
  return kept ? [kept, ...rest] : rest;
}

function preferPersonalShell(a, b) {
  const aTime = shellTime(a);
  const bTime = shellTime(b);
  if (aTime !== bTime) return aTime < bTime ? a : b;
  return String(a.id || '') <= String(b.id || '') ? a : b;
}

function shellTime(group) {
  const raw = group?.createdAt?.seconds || group?.createdAt || 0;
  const n = typeof raw === 'number' ? raw : Date.parse(raw);
  return Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER;
}

/** Label shown in the shell when the open workspace is a company. */
export function companyContextLabel(family) {
  if (!family || !isOrganizationType(family.type)) return '';
  const name = String(family.company?.navn || family.name || '').trim();
  return name ? `Bedrift · ${name}` : 'Bedrift';
}
