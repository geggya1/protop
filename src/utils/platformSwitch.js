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

/** Annet arbeidsområde med samme navn som hører til samme selskap. Ulikt navn er aldri alias. */
export function sameCompanyTwin(group, companies = []) {
  const name = companyNameKey(group);
  if (!group?.id || !name) return null;
  return (companies || []).find((item) => (
    item?.id
    && item.id !== group.id
    && companyNameKey(item) === name
    && companyPairLinked(group, item)
  )) || null;
}

/**
 * Kjent mengde ansatte, timer, anbud og underenheter.
 * Null betyr ukjent. Ukjent skal aldri behandles som tomt.
 */
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
 * Hovedenhet dette arbeidsområdet kan skjules til fordel for.
 * Null når området skal vises.
 *
 * Uten kjent belegg skjules ingenting og ingen blir sendt videre.
 * Et arbeidsområde med ansatte, timer, anbud eller underenheter skjules aldri.
 * Et bekreftet tomt område skjules når tvillingen med samme navn har data,
 * eller når begge er tomme og dette er underenheten.
 * Selskaper med et annet navn (Sør, Øst) er egne tilknytninger.
 */
export function aliasHovedenhet(group, companies = [], occupancy = null) {
  const twin = sameCompanyTwin(group, companies);
  if (!twin) return null;
  const self = workspaceRecordCount(occupancy, group.id);
  const other = workspaceRecordCount(occupancy, twin.id);
  if (self === null || other === null) return null;
  if (self > 0) return null;
  if (other > 0) return twin;
  if (isUnderenhetWorkspace(group) && !isUnderenhetWorkspace(twin)) return twin;
  if (!isUnderenhetWorkspace(group) && isUnderenhetWorkspace(twin)) return null;
  return group.id > twin.id ? twin : null;
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
  await selectFamily?.(group.id, group);
  openPlatformHome(navigation, group);
  return { applied: true, kind: 'workspace', id: group.id };
}
