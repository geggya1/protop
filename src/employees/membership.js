/**
 * Medlemskap i bedriften følger ansettelsen. Når en ansettelse avsluttes (deaktivert,
 * papirkurv, permanent slettet eller sluttdato passert), fjernes personen fra bedriften
 * på serveren (functions/companyMembership.js). Tas den opp igjen, legges medlemskapet
 * tilbake – men ikke for den som har forlatt bedriften selv.
 *
 * Ren modul: brukes av Cloud Functions, appen og tester.
 */
import { employeeLevelIds } from '../access/companyAccess.js';
import { employmentState, isActiveEmployee } from './employmentState.js';
import { employeeMatchEmails, normalizeInviteState } from './invite.js';

function text(value) {
  return String(value ?? '').trim();
}

export function companyMemberIds(family) {
  const out = new Set();
  for (const key of ['members', 'activeUsers', 'memberIds']) {
    for (const id of Array.isArray(family?.[key]) ? family[key] : []) {
      if (typeof id === 'string' && id) out.add(id);
    }
  }
  return out;
}

export function isCompanyOwnerUid(family, uid) {
  const id = text(uid);
  return !!id && (text(family?.ownerUid) === id || text(family?.ownerId) === id);
}

/**
 * Kontoen ansettelsen gjelder. personUid først; ellers den som godtok invitasjonen,
 * eller (eksisterende bruker) invitasjonens nøkkel – men bare når den faktisk er medlem.
 */
export function membershipUid(family, employee) {
  const listed = companyMemberIds(family);
  const invite = normalizeInviteState(employee?.invite);
  const candidates = [employee?.personUid, invite.acceptedUid, invite.parentKey].map(text).filter(Boolean);
  return candidates.find((id) => listed.has(id)) || text(employee?.personUid) || invite.acceptedUid || '';
}

/**
 * Endrer lagringen tilstanden på en måte som berører tilgangen? Da må den gå via serveren.
 * Fra aktiv til avsluttet, fra avsluttet til aktiv, eller mellom to avsluttede tilstander
 * (f.eks. deaktivert → papirkurv), så ventende invitasjoner også ryddes.
 */
export function employmentChangeNeedsServer(before, after, options) {
  if (!before || !after) return false;
  const from = employmentState(before, options);
  const to = employmentState(after, options);
  if (from === to) return false;
  return !isActiveEmployee(before, options) || !isActiveEmployee(after, options);
}

/**
 * Hva som skal skje med medlemskapet når ansettelsen har tilstanden i employee.
 * action:
 *   none     – ingen konto er knyttet
 *   owner    – eieren fjernes aldri
 *   keep     – aktiv, eller personen har en annen aktiv ansettelse i bedriften
 *   remove   – avsluttet: fjern medlemskap og tilgang
 *   restore  – aktiv igjen, men står ikke som medlem (serveren sjekker om personen gikk selv)
 */
export function membershipPlan({ family, employee, employees = [], now = new Date() } = {}) {
  const uid = membershipUid(family, employee);
  if (!uid) return { action: 'none', uid: '' };
  const listed = companyMemberIds(family).has(uid);
  const owner = isCompanyOwnerUid(family, uid);
  if (!isActiveEmployee(employee, { now })) {
    if (owner) return { action: 'owner', uid, listed };
    const other = (employees || []).some((row) => (
      text(row?.id) !== text(employee?.id)
      && text(row?.personUid) === uid
      && isActiveEmployee(row, { now })
    ));
    if (other) return { action: 'keep', uid, listed, reason: 'other-employment' };
    return { action: 'remove', uid, listed };
  }
  if (listed || owner) return { action: 'keep', uid, listed };
  return {
    action: 'restore',
    uid,
    listed,
    admin: employeeLevelIds(employee).includes('administrator'),
  };
}

/**
 * E-postene en ventende invitasjon for ansettelsen kan stå på. E-post som også tilhører en
 * annen åpen ansettelse med utsendt invitasjon, røres ikke.
 */
export function inviteEmailsToRevoke(employee, employees = []) {
  const mine = employeeMatchEmails(employee);
  const busy = new Set();
  for (const row of employees || []) {
    if (text(row?.id) === text(employee?.id) || !isActiveEmployee(row)) continue;
    const status = normalizeInviteState(row?.invite).status;
    if (status !== 'sent' && status !== 'queued') continue;
    employeeMatchEmails(row).forEach((email) => busy.add(email));
  }
  return mine.filter((email) => !busy.has(email));
}

/** Ventende invitasjon (memberInvites) som gjelder personen. */
export function inviteBelongsTo(invite, { uid = '', emails = [] } = {}) {
  const row = invite || {};
  if (text(row.status) !== 'pending') return false;
  if (uid && text(row.inviteeUid) === text(uid)) return true;
  const email = text(row.inviteeEmail).toLowerCase();
  return !!email && emails.includes(email);
}

/** Varselteksten personen får når kontoen i bedriften avsluttes. */
export function membershipEndedNotice(companyName, actorName = '') {
  const name = text(companyName) || 'bedriften';
  const who = text(actorName);
  return {
    title: 'Kontoen din er avsluttet',
    body: who
      ? `Kontoen din i «${name}» er avsluttet, og du har ikke lenger tilgang. Kontakt ${who} hvis dette er feil.`
      : `Kontoen din i «${name}» er avsluttet, og du har ikke lenger tilgang. Kontakt bedriften hvis dette er feil.`,
  };
}
