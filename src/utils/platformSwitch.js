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

function companyName(group) {
  return String(group?.company?.navn || group?.name || '').trim();
}

export function companyOrgnr(group) {
  return String(group?.company?.organisasjonsnummer || group?.orgnr || '').replace(/\D/g, '');
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

/** Underenhet fra Brreg (BEDR) eller et arbeidsområde opprettet under et morselskap. */
export function isUnderenhetWorkspace(group) {
  if (!group) return false;
  if (String(group.parentCompanyId || '').trim()) return true;
  const code = String(group.company?.organisasjonsformKode || '').trim().toUpperCase();
  if (code === 'BEDR') return true;
  if (group.company?.kind === 'underenhet') return true;
  return String(group.company?.organisasjonsform || '').toLowerCase().includes('underenhet');
}

function subunitOrgnrs(group) {
  const units = group?.company?.subUnits;
  if (!Array.isArray(units)) return [];
  return units
    .map((unit) => digits(unit?.organisasjonsnummer))
    .filter((value) => value.length === 9);
}

/**
 * Hovedenhet som dette arbeidsområdet bare er et skjult alias for.
 * Null når området skal vises: hovedenheten selv, eller en underenhet
 * brukeren har alene (uten morselskapet i medlemslisten).
 *
 * Samme selskap er ett av disse:
 * - underenhetens org.nr ligger som Brreg-barn på en annen bedrift i listen
 * - overordnetEnhet peker på org.nr til en bedrift i listen
 * - samme visningsnavn som en hovedenhet, og området er en underenhet
 *   (parentCompanyId, BEDR, kind eller organisasjonsform)
 * Et annet navn uten den org.nr-koblingen er en egen tilknytning og blir stående.
 */
export function aliasHovedenhet(group, companies = []) {
  if (!group?.id) return null;
  const others = (companies || []).filter((item) => item && item.id && item.id !== group.id);
  if (!others.length) return null;

  const orgnr = companyOrgnr(group);
  if (orgnr.length === 9) {
    const owners = others.filter((item) => subunitOrgnrs(item).includes(orgnr));
    const owner = owners.find((item) => !isUnderenhetWorkspace(item)) || owners[0];
    if (owner) return owner;
  }

  const overordnet = digits(group.company?.overordnetEnhet || group.overordnetEnhet);
  if (overordnet.length === 9) {
    const owner = others.find((item) => companyOrgnr(item) === overordnet);
    if (owner) return owner;
  }

  if (!isUnderenhetWorkspace(group)) return null;
  const name = companyNameKey(group);
  if (!name) return null;
  return others.find((item) => (
    companyNameKey(item) === name && !isUnderenhetWorkspace(item)
  )) || null;
}

export function companySwitchLabel(group) {
  const name = companyName(group) || 'Bedrift';
  const orgnr = companyOrgnr(group);
  return orgnr ? `${name} · ${orgnr}` : name;
}

function companyNameKey(group) {
  return companyName(group).toLocaleLowerCase('nb');
}

/**
 * Innlogging og bytte som treffer en underenhet lander på hovedenheten
 * når begge ligger i listen. Underenheten blir liggende i Firestore.
 */
export function preferHovedenhetWorkspace(chosen, companies = []) {
  if (!chosen) return chosen;
  const seen = new Set();
  let current = chosen;
  while (current?.id && !seen.has(current.id)) {
    seen.add(current.id);
    const next = aliasHovedenhet(current, companies);
    if (!next || next.id === current.id) return current;
    current = next;
  }
  return current || chosen;
}

/** Bedrifter som skal vises i bryteren. Underenhet-alias er tatt ut. */
export function visibleCompanyWorkspaces(families = []) {
  const companies = companyWorkspaces(families);
  return companies.filter((group) => !aliasHovedenhet(group, companies));
}

/** Id bryteren skal åpne. Et underenhet-alias peker på hovedenheten. */
export function resolveWorkspaceId(families, groupId) {
  if (!groupId) return null;
  const group = liveWorkspaces(families).find((item) => item.id === groupId);
  if (!group) return null;
  if (!isLiveOrganization(group)) return group.id;
  return preferHovedenhetWorkspace(group, companyWorkspaces(families))?.id || group.id;
}

export function companyWorkspaces(families = []) {
  return liveWorkspaces(families)
    .filter(isLiveOrganization)
    .slice()
    .sort((a, b) => {
      const byName = companyName(a).localeCompare(companyName(b), 'nb');
      if (byName) return byName;
      const byKind = Number(isUnderenhetWorkspace(a)) - Number(isUnderenhetWorkspace(b));
      if (byKind) return byKind;
      return companyOrgnr(a).localeCompare(companyOrgnr(b));
    });
}

/**
 * Header buttons. Privat and Bedrift stay visible.
 * One visible company: Bedrift opens that workspace.
 * Several: Bedrift has no single groupId; the menu lists them.
 */
export function platformSwitchSegments(families = []) {
  const personal = personalWorkspace(families);
  const companies = visibleCompanyWorkspaces(families);
  return [
    {
      id: 'personal',
      side: 'personal',
      label: 'Privat',
      groupId: personal?.id || null,
    },
    {
      id: 'company',
      side: 'company',
      label: 'Bedrift',
      groupId: companies.length === 1 ? companies[0].id : null,
    },
  ];
}

/**
 * Selskaper i Bedrift-menyen. Hvert ekte selskap én gang, med org.nr.
 * Privat er en egen knapp og ligger ikke i listen.
 */
export function workspacePickerItems(families = []) {
  const seen = new Set();
  const items = [];
  for (const group of visibleCompanyWorkspaces(families)) {
    if (!group?.id || seen.has(group.id)) continue;
    seen.add(group.id);
    items.push({
      id: group.id,
      side: 'company',
      label: companySwitchLabel(group),
      groupId: group.id,
    });
  }
  return items;
}

export function platformSegmentActive(segment, family, families = null) {
  if (!segment) return false;
  if (segment.side === 'personal') return platformSwitchSide(family) !== 'company';
  const companies = families ? companyWorkspaces(families) : [];
  const resolved = companies.length
    ? preferHovedenhetWorkspace(family, companies)
    : family;
  if (segment.groupId) return resolved?.id === segment.groupId || family?.id === segment.groupId;
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
    const chosen = companies.find((group) => group.id === preferredCompanyId)
      || companies.find((group) => group.id === storedId)
      || companies[0];
    return preferHovedenhetWorkspace(chosen, companies);
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
    const group = preferHovedenhetWorkspace(current || orgs[0], orgs);
    return { kind: 'workspace', group };
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
    const resolvedId = resolveWorkspaceId(families, groupId);
    const group = liveWorkspaces(families).find((item) => item.id === resolvedId);
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
