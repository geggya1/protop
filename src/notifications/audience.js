/**
 * Hvem som kan få hvilke varsler, etter rettighetene.
 *
 * I bedrifter er tilgangsstyringen (matrisen) kilden: en varseltype med `access` går bare til
 * eieren, gruppeadministratorene og dem som har rettigheten i matrisen. Det er de samme som kan
 * gjøre noe med varselet. Eksempel: «Noen ber om å bli med i bedriften» krever Admin på Ansatte
 * (å invitere), som Øverste leder og Administrator har som standard.
 * Typer med scope 'company' (ferieplan, bedriftsveggen) gjelder alle i bedriften.
 *
 * Ren modul – brukes av innstillingssiden, av funksjonene som lager varsler og av leveringen.
 */
import { ACCESS_LEVELS, allows, levelGrants, resolveActorAccess } from '../access/companyAccess.js';
import { companyMemberUids, isCompanyOwner } from '../iso/aclSync.js';
import { isFamilyType, isOrganizationType } from '../utils/groupTypes.js';
import {
  groupedNotificationTypes,
  notificationAccess,
  notificationScope,
  notificationType,
} from './prefs.js';

/** Eier eller gruppeadministrator. De kan alltid invitere og styre bedriften. */
export function isGroupAdminOf(family, uid) {
  return !!uid && (isCompanyOwner(family, uid)
    || (Array.isArray(family?.adminUids) && family.adminUids.includes(uid)));
}

/** Å invitere til bedriften krever Admin på Ansatte (som «Inviter brukere» i appen). */
export const INVITE_ACCESS = { resource: 'employees', action: 'write' };

function actorAllows({ family, employees, uid, access }) {
  if (!uid || !family) return false;
  if (isGroupAdminOf(family, uid)) return true;
  const actor = resolveActorAccess({ policy: family?.company?.accessPolicy, employees, uid });
  return allows(actor.grants, access.resource, access.action);
}

/** Kan personen invitere til bedriften? Eier, administratorer og de med Admin på Ansatte. */
export function canInviteToCompany({ family, employees = [], uid }) {
  return actorAllows({ family, employees, uid, access: INVITE_ACCESS });
}

/**
 * Har personen rettigheten typen krever i denne bedriften?
 * employees: bedriftens ansatte (minst personens egen rad, koblet med personUid).
 */
export function companyAllows({ family, employees = [], uid, type }) {
  const access = notificationAccess(type);
  if (!access) return true;
  return actorAllows({ family, employees, uid, access });
}

/** Hvem i bedriften som skal få typen: medlemmer, eier og administratorer med rettigheten. */
export function companyRecipients({ family, employees = [], type, exclude = [] }) {
  const skip = new Set(exclude.filter(Boolean));
  const uids = new Set(companyMemberUids(family));
  for (const id of [family?.ownerUid, family?.ownerId, ...(family?.adminUids || [])]) {
    if (typeof id === 'string' && id) uids.add(id);
  }
  return [...uids].filter((uid) => !skip.has(uid) && companyAllows({ family, employees, uid, type }));
}

/** Nivåene i matrisen som gir typen, f.eks. ['Øverste leder', 'Administrator']. */
export function levelsReceiving({ policy, type }) {
  const access = notificationAccess(type);
  if (!access) return [];
  return ACCESS_LEVELS
    .filter((level) => allows(levelGrants(policy, level.id), access.resource, access.action))
    .map((level) => level.label);
}

function joinNorwegian(items) {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} og ${items[items.length - 1]}`;
}

/** Kort tekst om hvem som får typen i bedriften, eller '' når den gjelder alle. */
export function audienceText({ policy, type }) {
  const row = notificationType(type);
  if (row.audience) return row.audience;
  if (!row.access) return '';
  const levels = levelsReceiving({ policy, type });
  return levels.length
    ? `${joinNorwegian(levels)} (styres i tilgangsstyringen)`
    : 'Eier og administratorer (styres i tilgangsstyringen)';
}

/**
 * Typene brukeren kan få, gruppert for innstillingssiden, med tekst om hvem som får dem.
 * memberships: [{ family, employees }] for gruppene brukeren er med i. For bedrifter holder
 * det med personens egne ansattrader.
 */
export function visibleNotificationGroups({ uid, memberships = [] }) {
  const companies = memberships.filter((row) => isOrganizationType(row?.family?.type));
  const inFamily = memberships.some((row) => isFamilyType(row?.family?.type));
  return groupedNotificationTypes()
    .map((group) => ({
      ...group,
      types: group.types
        .map((type) => {
          const scope = notificationScope(type.id);
          if (scope === 'family') return inFamily ? { ...type, audience: '' } : null;
          if (scope !== 'company') return { ...type, audience: '' };
          const allowed = companies.find((row) => companyAllows({ ...row, uid, type: type.id }));
          if (!allowed) return null;
          return { ...type, audience: audienceText({ policy: allowed.family?.company?.accessPolicy, type: type.id }) };
        })
        .filter(Boolean),
    }))
    .filter((group) => group.types.length);
}
