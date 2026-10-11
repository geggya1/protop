/**
 * Invitasjon av medarbeidere inn i bedriften.
 * Personer kan legges klare i kø. E-post sendes først når invitasjonen bekreftes.
 * Rettigheten ligger på ansettelsen og følges når personen registrerer seg.
 */
import {
  canonicalLevelId,
  levelById,
  levelIdFromRoleLabel,
} from '../access/companyAccess.js';

export const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const INVITE_TOKEN_KEY = 'protop.employeeInvite.v1';

const STATUSES = new Set(['none', 'queued', 'sent', 'accepted']);

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
    error: '',
  };
}

export function employeeContactEmail(employee) {
  return text(employee?.invite?.email || employee?.company?.email || employee?.person?.email).toLowerCase();
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
  invite.error = text(source.error).slice(0, 280);
  return invite;
}

export function placedAccessLevel(employee) {
  return canonicalLevelId(employee?.company?.accessLevel)
    || levelIdFromRoleLabel(employee?.company?.accessRole)
    || canonicalLevelId(employee?.invite?.accessLevel)
    || '';
}

export function inviteStatusLabel(status) {
  if (status === 'queued') return 'Klar til invitasjon';
  if (status === 'sent') return 'Invitasjon sendt';
  if (status === 'accepted') return 'Inne i bedriften';
  return '';
}

export function matchEmployeeByEmail(rows, email) {
  const needle = text(email).toLowerCase();
  if (!needle) return null;
  return (rows || []).find((row) => employeeContactEmail(row) === needle) || null;
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
        queuedAt: current.queuedAt || text(at) || new Date().toISOString(),
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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function employeeInviteUrl({ email, companyId, token, existingUser = false }) {
  const params = new URLSearchParams();
  if (email) params.set('email', email);
  if (companyId) params.set('familyId', companyId);
  if (token) params.set('employeeInvite', token);
  const path = existingUser ? '/login' : '/register';
  return `https://www.protop.no${path}?${params.toString()}`;
}

export function buildEmployeeInviteMessage({
  to,
  name,
  companyName,
  accessLabel,
  registerUrl,
  existingUser = false,
}) {
  const who = text(name);
  const hello = who ? `Hei ${who}` : 'Hei';
  const company = text(companyName) || 'bedriften';
  const role = text(accessLabel);
  const roleBit = role ? ` Du får tilgangsnivået «${role}».` : '';
  const action = existingUser ? 'Logg inn for å åpne bedriften' : 'Registrer deg og kom inn i bedriften';
  const subject = `Du er invitert til ${company} i ProTop`;
  const textBody = [
    `${hello},`,
    '',
    `Du er invitert inn i ${company} på ProTop.${roleBit}`,
    existingUser
      ? 'Du har allerede en konto. Logg inn med samme e-post for å komme inn i bedriften.'
      : 'Opprett konto med denne e-postadressen, så knyttes du til bedriften med rettigheten som er satt.',
    '',
    `${action}: ${registerUrl}`,
    '',
    'Hilsen ProTop',
  ].join('\n');
  const html = `
    <p>${escapeHtml(hello)},</p>
    <p>Du er invitert inn i <strong>${escapeHtml(company)}</strong> på ProTop.${role ? ` Du får tilgangsnivået <strong>${escapeHtml(role)}</strong>.` : ''}</p>
    <p>${existingUser
      ? 'Du har allerede en konto. Logg inn med samme e-post for å komme inn i bedriften.'
      : 'Opprett konto med denne e-postadressen, så knyttes du til bedriften med rettigheten som er satt.'}</p>
    <p>
      <a href="${escapeHtml(registerUrl)}"
         style="background:#1099F4;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">
        ${escapeHtml(action)}
      </a>
    </p>
    <p style="color:#475569;font-size:13px">Hvis knappen ikke virker: ${escapeHtml(registerUrl)}</p>
    <p>Med vennlig hilsen,<br/>ProTop</p>
  `;
  return {
    to: text(to).toLowerCase(),
    name: who,
    subject,
    text: textBody,
    html,
  };
}

export function inviteExpiry(at, ttlMs = INVITE_TTL_MS) {
  const start = Date.parse(at);
  const base = Number.isFinite(start) ? start : Date.now();
  return new Date(base + ttlMs).toISOString();
}

export function claimInvitePlan({
  invite,
  employee,
  uid,
  authEmail,
  now,
} = {}) {
  const actor = text(uid);
  const email = text(authEmail).toLowerCase();
  const stamp = text(now) || new Date().toISOString();
  if (!actor) return { ok: false, error: 'Du må være innlogget.' };
  if (!invite || typeof invite !== 'object') return { ok: false, error: 'Invitasjonen finnes ikke.' };
  if (invite.status === 'accepted' && text(invite.acceptedUid) === actor) {
    return { ok: true, already: true, companyId: text(invite.companyId), employeeId: text(invite.employeeId) };
  }
  if (invite.status !== 'pending') return { ok: false, error: 'Invitasjonen er allerede brukt.' };
  const expires = Date.parse(invite.expiresAt || '');
  const current = Date.parse(stamp);
  if (Number.isFinite(expires) && Number.isFinite(current) && expires < current) {
    return { ok: false, error: 'Invitasjonen er utløpt. Be om en ny invitasjon.' };
  }
  if (!email || email !== text(invite.email).toLowerCase()) {
    return { ok: false, error: 'Logg inn med e-postadressen invitasjonen ble sendt til.' };
  }
  if (!employee) return { ok: false, error: 'Medarbeideren finnes ikke lenger.' };
  const employment = text(employee?.company?.status || 'active');
  if (employment === 'deleted' || employment === 'inactive' || employment === 'former') {
    return { ok: false, error: 'Ansettelsen er ikke aktiv.' };
  }
  const linked = text(employee.personUid);
  if (linked && linked !== actor) {
    return { ok: false, error: 'Medarbeideren er knyttet til en annen bruker.' };
  }
  const levelId = placedAccessLevel(employee);
  const currentInvite = normalizeInviteState(employee.invite);
  return {
    ok: true,
    already: false,
    companyId: text(invite.companyId),
    employeeId: text(invite.employeeId || employee.id),
    accessLevel: levelId,
    employeePatch: {
      personUid: actor,
      company: {
        ...(employee.company || {}),
        canLogin: true,
      },
      invite: {
        ...currentInvite,
        status: 'accepted',
        email: text(invite.email).toLowerCase() || currentInvite.email,
        accessLevel: levelId || currentInvite.accessLevel,
        acceptedAt: stamp,
        acceptedUid: actor,
        error: '',
      },
    },
  };
}
