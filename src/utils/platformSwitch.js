/**
 * Privat <-> bedrift switch for the shell header.
 * Personal workspace is the isPersonal shell. Company is any live organisation.
 */
import { isLiveOrganization } from '../project/companyOffer.js';
import { findPersonalShell, isPersonalShell } from './personalShell.js';
import { isProtopWorkspace } from './platformAccess.js';
import { platformHomeRoute } from './groupTypes.js';
import { companyDisplayName } from './companyName.js';
import { leaveShellPathForSwitch } from '../navigation/shellPaths.js';

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
  return companyDisplayName(group);
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

function companyPairLinked(a, b) {
  if (isUnderenhetWorkspace(a) || isUnderenhetWorkspace(b)) return true;
  const aOrg = companyOrgnr(a);
  const bOrg = companyOrgnr(b);
  const aOver = digits(a?.company?.overordnetEnhet || a?.overordnetEnhet);
  const bOver = digits(b?.company?.overordnetEnhet || b?.overordnetEnhet);
  if (aOver && aOver === bOrg) return true;
  if (bOver && bOver === aOrg) return true;
  if (aOrg && subunitOrgnrs(b).includes(aOrg)) return true;
  if (bOrg && subunitOrgnrs(a).includes(bOrg)) return true;
  return false;
}

function sameNameCluster(group, companies = []) {
  const name = companyNameKey(group);
  if (!group?.id || !name) return [];
  return [group, ...(companies || []).filter((item) => (
    item?.id
    && item.id !== group.id
    && companyNameKey(item) === name
    && companyPairLinked(group, item)
  ))];
}

/**
 * Hovednummeret i en klynge med samme selskapsnavn.
 * Underenheten er alltid alias. Et annet navn (Sør, Øst) er et eget selskap.
 * Belegg brukes ikke: to org.nr skal aldri vises som to bedrifter.
 */
export function hovedenhetWorkspace(group, companies = []) {
  const cluster = sameNameCluster(group, companies);
  if (!cluster.length) return group || null;
  const ranked = cluster.slice().sort((a, b) => {
    const byKind = Number(isUnderenhetWorkspace(a)) - Number(isUnderenhetWorkspace(b));
    if (byKind) return byKind;
    const aOrg = companyOrgnr(a);
    const bOrg = companyOrgnr(b);
    const bPointsAtA = digits(b?.company?.overordnetEnhet || b?.overordnetEnhet) === aOrg && aOrg;
    const aPointsAtB = digits(a?.company?.overordnetEnhet || a?.overordnetEnhet) === bOrg && bOrg;
    if (bPointsAtA && !aPointsAtB) return -1;
    if (aPointsAtB && !bPointsAtA) return 1;
    return aOrg.localeCompare(bOrg);
  });
  return ranked[0];
}

/** Annet arbeidsområde med samme navn. Ulikt navn er aldri alias. */
export function sameCompanyTwin(group, companies = []) {
  const main = hovedenhetWorkspace(group, companies);
  if (!main?.id || main.id === group?.id) {
    const cluster = sameNameCluster(group, companies);
    return cluster.find((item) => item.id !== group?.id) || null;
  }
  return main;
}

/** @deprecated Belegg styrer ikke lenger synlighet. Tellingen ligger igjen til tester. */
export function workspaceRecordCount(occupancy, id) {
  if (!occupancy || !id) return null;
  const row = occupancy[id];
  if (!row || row.unknown) return null;
  return (Number(row.employees) || 0)
    + (Number(row.hours) || 0)
    + (Number(row.notices) || 0)
    + (Number(row.subUnits) || 0);
}

/**
 * Hovedenhet et alias skal åpnes som. Null når området selv skal vises.
 * Alltid hovednummeret, også når aliaset har ansatte eller timer.
 */
export function aliasHovedenhet(group, companies = []) {
  if (!group?.id) return null;
  const main = hovedenhetWorkspace(group, companies);
  if (!main?.id || main.id === group.id) return null;
  return main;
}

/** Skjulte famili-id som hører til hovedenheten og skal lastes sammen med den. */
export function aliasFamilyIds(canonical, families = []) {
  if (!canonical?.id) return [];
  const companies = companyWorkspaces(families);
  const ids = companies
    .filter((group) => aliasHovedenhet(group, companies)?.id === canonical.id)
    .map((group) => group.id);
  const extra = new Set(
    (Array.isArray(canonical?.company?.aliasOrganisasjonsnummer) ? canonical.company.aliasOrganisasjonsnummer : [])
      .map((value) => digits(value))
      .filter((value) => value.length === 9),
  );
  if (extra.size) {
    companies.forEach((group) => {
      if (!group?.id || group.id === canonical.id || ids.includes(group.id)) return;
      const org = companyOrgnr(group);
      if (!extra.has(org)) return;
      // Annet navn er bare alias når Brreg sier at det er en underenhet av hovednummeret.
      // Et eget selskap koblet under (parentCompanyId) skal aldri få dataene slått sammen.
      if (companyNameKey(group) !== companyNameKey(canonical)) {
        const over = digits(group?.company?.overordnetEnhet || group?.overordnetEnhet);
        if (!over || over !== companyOrgnr(canonical)) return;
      }
      ids.push(group.id);
    });
  }
  return ids;
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
export function preferHovedenhetWorkspace(chosen, companies = [], occupancy = null) {
  if (!chosen) return chosen;
  const seen = new Set();
  let current = chosen;
  while (current?.id && !seen.has(current.id)) {
    seen.add(current.id);
    const next = aliasHovedenhet(current, companies, occupancy);
    if (!next || next.id === current.id) return current;
    current = next;
  }
  return current || chosen;
}

/** Bedrifter som skal vises. Tomt alias skjules bare når belegget er kjent. */
export function visibleCompanyWorkspaces(families = [], occupancy = null) {
  const companies = companyWorkspaces(families);
  return companies.filter((group) => !aliasHovedenhet(group, companies, occupancy));
}

/**
 * Id bryteren skal åpne.
 * Uten kjent belegg åpnes id-en som ble bedt om, så data ikke byttes bort.
 */
export function resolveWorkspaceId(families, groupId, occupancy = null) {
  if (!groupId) return null;
  const group = liveWorkspaces(families).find((item) => item.id === groupId);
  if (!group) return null;
  if (!isLiveOrganization(group)) return group.id;
  return preferHovedenhetWorkspace(group, companyWorkspaces(families), occupancy)?.id || group.id;
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
export function platformSwitchSegments(families = [], occupancy = null) {
  const personal = personalWorkspace(families);
  const companies = visibleCompanyWorkspaces(families, occupancy);
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
export function workspacePickerItems(families = [], occupancy = null) {
  const seen = new Set();
  const items = [];
  for (const group of visibleCompanyWorkspaces(families, occupancy)) {
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

export function platformSegmentActive(segment, family, families = null, occupancy = null) {
  if (!segment) return false;
  if (segment.side === 'personal') return platformSwitchSide(family) !== 'company';
  const companies = families ? companyWorkspaces(families) : [];
  const resolved = companies.length
    ? preferHovedenhetWorkspace(family, companies, occupancy)
    : family;
  if (segment.groupId) return resolved?.id === segment.groupId || family?.id === segment.groupId;
  return platformSwitchSide(family) === 'company';
}

/**
 * Where a signed-in person lands.
 * No company → personal workspace.
 * One or more companies → a company (last used company when we know it).
 */
export function resolveLoginLanding(families, storedId = '', preferredCompanyId = '', occupancy = null) {
  const companies = companyWorkspaces(families);
  if (companies.length) {
    const chosen = companies.find((group) => group.id === preferredCompanyId)
      || companies.find((group) => group.id === storedId)
      || companies[0];
    // Uten belegg blir valgt id stående. Et bekreftet tomt alias kan flyttes
    // til tvillingen som faktisk har ansatte eller timer.
    return preferHovedenhetWorkspace(chosen, companies, occupancy);
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
export function resolvePlatformSwitch(families, family, side, occupancy = null) {
  if (side === 'company') {
    const orgs = companyWorkspaces(families);
    if (!orgs.length) return { kind: 'overview' };
    const currentId = family?.id;
    const current = orgs.find((group) => group.id === currentId);
    const group = preferHovedenhetWorkspace(current || orgs[0], orgs, occupancy);
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
  occupancy = null,
} = {}) {
  let next = null;
  if (groupId) {
    const resolvedId = resolveWorkspaceId(families, groupId, occupancy);
    const group = liveWorkspaces(families).find((item) => item.id === resolvedId);
    if (group) next = { kind: 'workspace', group };
  }
  if (!next) next = resolvePlatformSwitch(families, family, side, occupancy);
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
  // En bedriftsside blir ikke med over i Privat (EGEN-04). Før byttet, så skallet monteres på Hjem.
  leaveShellPathForSwitch(isLiveOrganization(group) ? 'company' : 'personal');
  await selectFamily?.(group.id, group);
  openPlatformHome(navigation, group);
  return { applied: true, kind: 'workspace', id: group.id };
}
