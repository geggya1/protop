/**
 * Privat <-> bedrift switch for the shell header.
 * Personal workspace is the isPersonal shell. Company is any live organisation.
 */
import { isLiveOrganization } from '../project/companyOffer.js';
import { findPersonalShell, isPersonalShell } from './personalShell.js';
import { isProtopWorkspace } from './platformAccess.js';
import { platformHomeRoute } from './groupTypes.js';

export function liveWorkspaces(families = []) {
  return (families || []).filter((group) => (
    group
    && group.deleted !== true
    && group.hiddenFromApp !== true
    && group.archived !== true
    && group.active !== false
    && isProtopWorkspace(group)
  ));
}

export function personalWorkspace(families = []) {
  const live = liveWorkspaces(families);
  return findPersonalShell(live) || live.find((group) => !isLiveOrganization(group)) || null;
}

export function companySwitchLabel(group) {
  const name = String(group?.company?.navn || group?.name || '').trim();
  return name || 'Bedrift';
}

export function companyWorkspaces(families = []) {
  return liveWorkspaces(families)
    .filter(isLiveOrganization)
    .slice()
    .sort((a, b) => companySwitchLabel(a).localeCompare(companySwitchLabel(b), 'nb'));
}

/**
 * Header segments. One company keeps the Privat / Bedrift pair.
 * Several companies are listed by name so they can be switched here.
 */
export function platformSwitchSegments(families = []) {
  const personal = personalWorkspace(families);
  const companies = companyWorkspaces(families);
  const segments = [{
    id: 'personal',
    side: 'personal',
    label: 'Privat',
    groupId: personal?.id || null,
  }];
  if (companies.length <= 1) {
    segments.push({
      id: 'company',
      side: 'company',
      label: 'Bedrift',
      groupId: companies[0]?.id || null,
    });
    return segments;
  }
  companies.forEach((group) => {
    segments.push({
      id: group.id,
      side: 'company',
      label: companySwitchLabel(group),
      groupId: group.id,
    });
  });
  return segments;
}

export function platformSegmentActive(segment, family) {
  if (!segment) return false;
  if (segment.side === 'personal') return platformSwitchSide(family) !== 'company';
  if (segment.groupId) return family?.id === segment.groupId;
  return platformSwitchSide(family) === 'company';
}

/**
 * Where a signed-in person lands.
 * No company → personal workspace.
 * One or more companies → a company (last used company when we know it).
 */
export function resolveLoginLanding(families, storedId = '', preferredCompanyId = '') {
  const companies = companyWorkspaces(families);
  if (companies.length) {
    return companies.find((group) => group.id === preferredCompanyId)
      || companies.find((group) => group.id === storedId)
      || companies[0];
  }
  return personalWorkspace(families) || liveWorkspaces(families)[0] || null;
}

export function platformSwitchSide(family) {
  if (isLiveOrganization(family)) return 'company';
  if (isPersonalShell(family) || family) return 'personal';
  return 'personal';
}

/**
 * @returns {{ kind: 'workspace', group: object } | { kind: 'overview' } | null}
 */
export function resolvePlatformSwitch(families, family, side) {
  if (side === 'company') {
    const orgs = companyWorkspaces(families);
    if (!orgs.length) return { kind: 'overview' };
    const currentId = family?.id;
    const current = orgs.find((group) => group.id === currentId);
    return { kind: 'workspace', group: current || orgs[0] };
  }
  const personal = personalWorkspace(families);
  if (!personal) return { kind: 'overview' };
  return { kind: 'workspace', group: personal };
}

export async function applyPlatformSwitch({
  navigation,
  selectFamily,
  families,
  family,
  side,
  groupId,
} = {}) {
  let next = null;
  if (groupId) {
    const group = liveWorkspaces(families).find((item) => item.id === groupId);
    if (group) next = { kind: 'workspace', group };
  }
  if (!next) next = resolvePlatformSwitch(families, family, side);
  if (!next) return { applied: false };
  if (next.kind === 'overview') {
    const { goPlatformOverview } = await import('./platformNav.js');
    goPlatformOverview(navigation);
    return { applied: true, kind: 'overview' };
  }
  const group = next.group;
  if (!group?.id) return { applied: false };
  const { openPlatformHome } = await import('./platformNav.js');
  if (group.id === family?.id) {
    const target = platformHomeRoute(group.type);
    const state = navigation?.getState?.();
    const current = state?.routes?.[state.index || 0]?.name;
    if (current && current !== target) openPlatformHome(navigation, group);
    return { applied: true, kind: 'workspace', id: group.id, same: true };
  }
  await selectFamily?.(group.id, group);
  openPlatformHome(navigation, group);
  return { applied: true, kind: 'workspace', id: group.id };
}
