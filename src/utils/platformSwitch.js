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

export function companyWorkspaces(families = []) {
  return liveWorkspaces(families).filter(isLiveOrganization);
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
} = {}) {
  const next = resolvePlatformSwitch(families, family, side);
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
