/**
 * Invitasjon av medarbeidere inn i bedriften.
 * Personer kan legges klare i kø. E-post går først når Inviter trykkes,
 * og da gjennom den vanlige invitasjonen (registrering eller godkjenning).
 * Rettigheten ligger på ansettelsen og følges når personen kommer inn.
 */
import {
  canonicalLevelId,
  levelById,
  levelIdFromRoleLabel,
  normalizeEmployeeLevelIds,
  placedLevelId,
} from '../access/companyAccess.js';
import { isActiveEmployee } from './employmentState.js';

const STATUSES = new Set(['none', 'queued', 'sent', 'accepted', 'declined']);

function text(value) {
  return String(value ?? '').trim();
}

export function emptyInvite() {
  return {
    status: 'none',
    email: '',
    accessLevel: '',
    queuedAt: '',
    sentAt: '',
    acceptedAt: '',
    acceptedUid: '',
    declinedAt: '',
    parentKey: '',
    error: '',
  };
}

export function employeeContactEmail(employee) {
  return text(employee?.invite?.email || employee?.company?.email || employee?.person?.email).toLowerCase();
}

/** Alle e-poster som kan treffe brukeren (person, arbeid, invitasjon). */
export function employeeMatchEmails(employee) {
  const out = [];
  for (const value of [
    employee?.person?.email,
    employee?.company?.email,
    employee?.invite?.email,
  ]) {
    const email = text(value).toLowerCase();
    if (!email || !email.includes('@') || out.includes(email)) continue;
    out.push(email);
  }
  return out;
}

export function normalizeInviteState(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const invite = emptyInvite();
  const status = text(source.status);
  invite.status = STATUSES.has(status) ? status : 'none';
  invite.email = text(source.email).toLowerCase();
  invite.accessLevel = canonicalLevelId(source.accessLevel) || levelIdFromRoleLabel(source.accessLevel);
  invite.queuedAt = text(source.queuedAt);
  invite.sentAt = text(source.sentAt);
  invite.acceptedAt = text(source.acceptedAt);
  invite.acceptedUid = text(source.acceptedUid);
  invite.declinedAt = text(source.declinedAt);
  invite.parentKey = text(source.parentKey);
  invite.error = text(source.error).slice(0, 280);
  return invite;
}

export function placedAccessLevel(employee) {
  return canonicalLevelId(employee?.company?.accessLevel)
    || levelIdFromRoleLabel(employee?.company?.accessRole)
    || canonicalLevelId(employee?.invite?.accessLevel)
    || '';
}

// Nivåene som gir ledertilgang (samme som empPrivilegedLevels i firestore.rules).
const ELEVATED_LEVELS = new Set([
  'administrator', 'leder', 'avdelingsleder', 'hr_ansvarlig', 'kvalitetsansvarlig', 'hms_ansvarlig', 'iso_rolle',
]);

/** Posten gir ledertilgang: et ledernivå (også i invitasjonen) eller avvik fra nivået, som i reglene. */
export function employeeLinkElevated(employee) {
  const company = employee?.company || {};
  const inviteLevel = employee?.invite?.accessLevel;
  const levels = [
    ...normalizeEmployeeLevelIds(company.accessLevels),
    placedLevelId(employee),
    canonicalLevelId(inviteLevel) || levelIdFromRoleLabel(inviteLevel),
  ];
  const overrides = company.accessOverrides;
  return levels.some((id) => ELEVATED_LEVELS.has(id))
    || (!!overrides && typeof overrides === 'object' && Object.keys(overrides).length > 0);
}

export function inviteStatusLabel(status) {
  if (status === 'queued') return 'Klar til invitasjon';
  if (status === 'sent') return 'Invitasjon sendt – venter på at personen godtar';
  if (status === 'accepted') return 'Godtok invitasjonen – inne i bedriften';
  if (status === 'declined') return 'Avslo invitasjonen';
  return '';
}

/** Tilgang når personen ikke har fått satt nivå, for eksempel fra import. */
export const DEFAULT_INVITE_LEVEL = 'ansatt';

export function inviteLevelFor(employee) {
  return placedAccessLevel(employee) || DEFAULT_INVITE_LEVEL;
}

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invitasjonsstatus slik administrator ser den på personen.
 * key: closed | member | accepted | sent | queued | declined | missingEmail | none
 */
export function employeeInviteState(employee) {
  const employment = text(employee?.company?.status || 'active');
  if (employment === 'deleted' || employment === 'inactive' || employment === 'former') {
    return { key: 'closed', label: '' };
  }
  const status = normalizeInviteState(employee?.invite).status;
  if (status === 'accepted') return { key: 'accepted', label: inviteStatusLabel('accepted') };
  if (status === 'sent') return { key: 'sent', label: 'Invitert – venter på svar' };
  if (status === 'queued') return { key: 'queued', label: inviteStatusLabel('queued') };
  if (status === 'declined') return { key: 'declined', label: inviteStatusLabel('declined') };
  if (text(employee?.personUid)) return { key: 'member', label: '' };
  if (!VALID_EMAIL.test(employeeContactEmail(employee))) {
    return { key: 'missingEmail', label: 'Ikke invitert – mangler e-post' };
  }
  return { key: 'none', label: 'Ikke invitert' };
}

/**
 * Når invitasjonen ble sendt og besvart, for Brukerkonto på personen.
 * «Lagt klar» vises bare mens invitasjonen venter på å bli sendt.
 */
export function inviteTimeline(employee) {
  const invite = normalizeInviteState(employee?.invite);
  return [
    { id: 'queued', label: 'Lagt klar', at: invite.status === 'queued' ? invite.queuedAt : '' },
    { id: 'sent', label: 'Sendt', at: invite.sentAt },
    { id: 'accepted', label: 'Godtatt', at: invite.acceptedAt },
    { id: 'declined', label: 'Avslått', at: invite.declinedAt },
  ].filter((row) => row.at);
}

/** Ligger i ansattlisten (for eksempel fra import) og kan inviteres med dataene som finnes. */
export function employeesNotInvited(rows) {
  return (rows || []).filter((row) => employeeInviteState(row).key === 'none');
}

export function employeesMissingInviteEmail(rows) {
  return (rows || []).filter((row) => employeeInviteState(row).key === 'missingEmail');
}

export function inviteOverview(rows) {
  const counts = { none: 0, missingEmail: 0, queued: 0, sent: 0, declined: 0 };
  for (const row of rows || []) {
    const { key } = employeeInviteState(row);
    if (key in counts) counts[key] += 1;
  }
  return counts;
}

export function matchEmployeeByEmail(rows, email) {
  const needle = text(email).toLowerCase();
  if (!needle || !needle.includes('@')) return null;
  return (rows || []).find((row) => employeeMatchEmails(row).includes(needle)) || null;
}

function splitName(name) {
  const parts = text(name).split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || '',
    lastName: parts.join(' '),
  };
}

export function draftInviteEmployee({
  firstName = '',
  lastName = '',
  email = '',
  accessLevel = '',
  at = '',
  id = '',
} = {}) {
  const level = levelById(canonicalLevelId(accessLevel));
  const address = text(email).toLowerCase();
  const names = {
    firstName: text(firstName),
    lastName: text(lastName),
  };
  if (!names.firstName && !names.lastName) {
    const parsed = splitName(`${firstName} ${lastName}`);
    names.firstName = parsed.firstName;
    names.lastName = parsed.lastName;
  }
  return {
    id: text(id),
    createdAt: text(at),
    person: {
      firstName: names.firstName,
      lastName: names.lastName,
      email: address,
    },
    company: {
      status: 'active',
      personnelKind: level?.kind === 'external' ? 'external' : level?.kind === 'innleid' ? 'innleid' : 'staff',
      canLogin: false,
      email: address,
      accessLevel: level?.id || '',
      accessRole: level?.label || '',
    },
    invite: {
      ...emptyInvite(),
      status: 'queued',
      email: address,
      accessLevel: level?.id || '',
      queuedAt: text(at),
    },
  };
}

export function queueEmployeeInvite(employee, { at = '', accessLevel = '' } = {}) {
  const email = employeeContactEmail(employee);
  const levelId = canonicalLevelId(accessLevel) || placedAccessLevel(employee);
  const level = levelById(levelId);
  const status = text(employee?.company?.status || 'active');
  if (status === 'deleted') return { ok: false, error: 'Medarbeideren ligger i papirkurven.' };
  if (status === 'inactive' || status === 'former') return { ok: false, error: 'Medarbeideren er deaktivert.' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'E-post mangler eller er ugyldig.' };
  }
  if (!level) return { ok: false, error: 'Velg tilgangsnivå før invitasjon.' };
  const current = normalizeInviteState(employee?.invite);
  if (current.status === 'accepted' || (text(employee?.personUid) && current.status === 'accepted')) {
    return { ok: false, error: 'Personen er allerede inne i bedriften.' };
  }
  if (text(employee?.personUid) && current.status !== 'sent' && current.status !== 'queued') {
    return { ok: false, error: 'Personen er allerede knyttet til en bruker.' };
  }
  const nextStatus = current.status === 'sent' ? 'sent' : 'queued';
  // Etter avslag lages en ny invitasjon. Den gamle er besvart og kan ikke godtas.
  const fresh = current.status === 'declined';
  return {
    ok: true,
    employee: {
      ...employee,
      person: {
        ...(employee?.person || {}),
        email: text(employee?.person?.email).toLowerCase() || email,
      },
      company: {
        ...(employee?.company || {}),
        email: text(employee?.company?.email).toLowerCase() || email,
        accessLevel: level.id,
        accessRole: level.label,
      },
      invite: {
        ...current,
        status: nextStatus,
        email,
        accessLevel: level.id,
        queuedAt: (!fresh && current.queuedAt) || text(at) || new Date().toISOString(),
        parentKey: fresh ? '' : current.parentKey,
        declinedAt: fresh ? '' : current.declinedAt,
        error: '',
      },
    },
  };
}

export function unqueueEmployeeInvite(employee) {
  const current = normalizeInviteState(employee?.invite);
  if (current.status !== 'queued') {
    return { ok: false, error: 'Bare invitasjoner som ikke er sendt kan tas ut av køen.' };
  }
  return {
    ok: true,
    employee: {
      ...employee,
      invite: emptyInvite(),
    },
  };
}

export function invitesAwaitingSend(rows) {
  return (rows || []).filter((row) => normalizeInviteState(row?.invite).status === 'queued');
}

export function invitesAwaitingAccept(rows) {
  return (rows || []).filter((row) => normalizeInviteState(row?.invite).status === 'sent');
}

export function invitesDeclined(rows) {
  return (rows || []).filter((row) => normalizeInviteState(row?.invite).status === 'declined');
}

/** Samme registreringslenke som den vanlige vokseninvitasjonen. */
export function employeeRegisterUrl({ email, companyId }) {
  const to = text(email).toLowerCase();
  const familyId = text(companyId);
  return `https://www.protop.no/register?email=${encodeURIComponent(to)}&familyId=${encodeURIComponent(familyId)}`;
}

export function inviteDeliveryError(error) {
  const code = text(error?.message || error);
  if (/contact-required/i.test(code)) return 'E-post mangler.';
  if (/already-member/i.test(code)) return 'Personen er allerede med i bedriften.';
  if (/invite-pending/i.test(code)) return 'Invitasjonen venter allerede. Bruk Send på nytt.';
  if (/cannot-invite-self/i.test(code)) return 'Du kan ikke invitere deg selv.';
  if (/user-not-found/i.test(code)) return 'Fant ikke brukeren.';
  if (/not-found|missing-parent/i.test(code)) return 'Invitasjonen finnes ikke lenger.';
  if (/Kun administrator|Bare admin|permission-denied/i.test(code)) return 'Bare administrator kan sende invitasjonen.';
  const cleaned = code.replace(/^FirebaseError:\s*/i, '').trim();
  return cleaned.slice(0, 280) || 'Kunne ikke sende invitasjonen.';
}

export function applyInviteSendResult(employee, result, { at = '' } = {}) {
  const current = normalizeInviteState(employee?.invite);
  const parentKey = text(result?.invitee?.uid || result?.key || current.parentKey);
  const emailSent = result?.emailSent === true;
  // Eksisterende bruker: invitasjonen ligger i appen (inviteId) selv om e-posten feilet.
  // Da er den sendt, og personen kan godta den. E-postfeilen vises fortsatt.
  const delivered = emailSent || !!text(result?.inviteId);
  const stamp = text(at) || new Date().toISOString();
  const error = text(result?.emailError).slice(0, 280);
  return {
    ...employee,
    invite: {
      ...current,
      parentKey,
      status: delivered ? 'sent' : (current.status === 'none' ? 'queued' : current.status),
      sentAt: delivered ? stamp : current.sentAt,
      error: emailSent ? '' : error,
    },
  };
}

// Samme definisjon som tilgangen: deaktivert, papirkurv og passert sluttdato er avsluttet.
function employmentOpen(employee) {
  return isActiveEmployee(employee);
}

function acceptedPatch(employee, actor, email, stamp) {
  const levelId = placedAccessLevel(employee);
  const currentInvite = normalizeInviteState(employee.invite);
  return {
    personUid: actor,
    company: {
      ...(employee.company || {}),
      canLogin: true,
    },
    invite: {
      ...currentInvite,
      status: 'accepted',
      email: email || currentInvite.email,
      accessLevel: levelId || currentInvite.accessLevel,
      acceptedAt: stamp,
      acceptedUid: actor,
      error: '',
    },
  };
}

/**
 * Knytt innlogget bruker til medarbeideren med samme e-post.
 * Treff krever at invitasjonen er sendt. Kø uten utsendt e-post hoppes over.
 */
export function claimEmployeeSeatPlan({
  employees,
  uid,
  authEmail,
  now,
  companyId,
} = {}) {
  const actor = text(uid);
  const email = text(authEmail).toLowerCase();
  const stamp = text(now) || new Date().toISOString();
  if (!actor) return { ok: false, error: 'Du må være innlogget.' };
  // Eksisterende bruker invitert på brukernavn eller telefon: invitasjonens nøkkel er uid-en.
  const ownKey = (row) => normalizeInviteState(row.invite).parentKey === actor;
  const matches = (employees || []).filter((row) => (
    (email && employeeMatchEmails(row).includes(email)) || ownKey(row)
  ));
  if (!matches.length) return { ok: true, skipped: true };

  const accepted = matches.find((row) => (
    text(row.personUid) === actor && normalizeInviteState(row.invite).status === 'accepted'
  ));
  if (accepted) {
    // Avsluttet ansettelse: ingenting skal legges tilbake (medlemskap eller administrator).
    if (!employmentOpen(accepted)) return { ok: true, skipped: true, closed: true };
    return {
      ok: true,
      already: true,
      skipped: false,
      companyId: text(companyId),
      employeeId: text(accepted.id),
      accessLevel: placedAccessLevel(accepted),
    };
  }

  const invited = (row) => {
    const status = normalizeInviteState(row.invite).status;
    // «queued» med personens uid: invitasjonen i appen kom fram, men e-posten feilet.
    return status === 'sent' || (status === 'queued' && ownKey(row));
  };
  const eligible = matches.filter((row) => {
    const linked = text(row.personUid);
    if (linked && linked !== actor) return false;
    const status = normalizeInviteState(row.invite).status;
    return invited(row) || (linked === actor && status !== 'accepted');
  });
  // Aktiv ansettelse før avsluttet, utsendt invitasjon før annen kobling.
  const rank = (row) => (employmentOpen(row) ? 4 : 0) + (invited(row) ? 2 : 1);
  eligible.sort((a, b) => rank(b) - rank(a));
  // Ledertilgang knyttes bare på bekreftet e-post lik invitasjonsadressen. Nøkkelen (invite.parentKey)
  // alene er ikke nok: med eldre regler (86332db) kan et medlem skrive den på en annens post (SEC-26).
  // En post som allerede er knyttet til personen, står som før.
  const leaderOk = (row) => text(row.personUid) === actor || !employeeLinkElevated(row)
    || (!!email && normalizeInviteState(row.invite).email === email);
  const employee = eligible.find(leaderOk);
  if (!employee && eligible.length) {
    return {
      ok: false,
      code: email ? 'other-email' : 'email-not-verified',
      error: 'Invitasjonen gir ledertilgang og må godtas med bekreftet e-post, den invitasjonen ble sendt til.',
    };
  }
  if (!employee) {
    const taken = matches.some((row) => {
      const linked = text(row.personUid);
      return linked && linked !== actor;
    });
    if (taken) return { ok: false, error: 'Medarbeideren er knyttet til en annen bruker.' };
    return { ok: true, skipped: true };
  }
  if (!employmentOpen(employee)) return { ok: false, error: 'Ansettelsen er ikke aktiv.' };
  const levelId = placedAccessLevel(employee);
  return {
    ok: true,
    already: false,
    skipped: false,
    companyId: text(companyId),
    employeeId: text(employee.id),
    accessLevel: levelId,
    employeePatch: acceptedPatch(employee, actor, email, stamp),
  };
}

/**
 * Medarbeideren med sendt invitasjon til e-posten, som ingen annen bruker har tatt.
 * Gjelder når plassholderen fra en tidligere runde er ryddet bort, men invitasjonen
 * er sendt på nytt fra Ansatte.
 */
export function sentInviteEmployee({ employees, uid, authEmail } = {}) {
  const email = text(authEmail).toLowerCase();
  const actor = text(uid);
  if (!email) return null;
  return (employees || []).find((row) => {
    if (!employeeMatchEmails(row).includes(email)) return false;
    if (normalizeInviteState(row.invite).status !== 'sent') return false;
    const linked = text(row.personUid);
    if (linked && linked !== actor) return false;
    return employmentOpen(row);
  }) || null;
}

/**
 * Personen avslo bedriftsinvitasjonen. Sendte invitasjoner med samme e-post, eller som venter
 * på kontoen (invitasjonens nøkkel er uid-en), markeres som avslått, så administrator ser svaret
 * og kan invitere på nytt. authEmail skal være bekreftet (inviteDeclineEmail, REV-23).
 */
export function declineEmployeeInvitePlan({ employees, authEmail, uid = '', now } = {}) {
  const email = text(authEmail).toLowerCase();
  const actor = text(uid);
  const stamp = text(now) || new Date().toISOString();
  if (!email && !actor) return [];
  const ownKey = (row) => !!actor && normalizeInviteState(row.invite).parentKey === actor;
  return (employees || [])
    .filter((row) => (email && employeeMatchEmails(row).includes(email)) || ownKey(row))
    .filter((row) => {
      const status = normalizeInviteState(row.invite).status;
      return (status === 'sent' || (status === 'queued' && ownKey(row))) && !text(row.personUid);
    })
    .map((row) => ({
      employeeId: text(row.id),
      patch: {
        invite: {
          ...normalizeInviteState(row.invite),
          status: 'declined',
          declinedAt: stamp,
          error: '',
        },
      },
    }));
}
