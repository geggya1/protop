/**
 * Svar på gruppeinvitasjoner uten Firebase. Brukes av Cloud Functions
 * (functions/groupInvite.js) og av appen for tekster og feilmeldinger.
 *
 * Ingen blir medlem uten å trykke Godta. En ny bruker som ble invitert på e-post
 * får invitasjonen i innboksen når e-posten er bekreftet, og svarer der.
 */
import { companyDisplayName } from './companyName.js';

function text(value) {
  return String(value ?? '').trim();
}

/** En invitasjon som ikke er besvart, gjelder i 30 dager. Send på nytt gir 30 nye dager. */
export const INVITE_TTL_DAYS = 30;

export function inviteExpiresAt(now = new Date()) {
  const at = now instanceof Date ? now : new Date(now);
  return new Date(at.getTime() + INVITE_TTL_DAYS * 24 * 3600 * 1000).toISOString();
}

function millis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Er invitasjonen utløpt? expiresAt når den finnes; ellers 30 dager etter opprettelsen.
 * Uten noen av dem (eldre data) utløper den ikke.
 */
export function inviteExpired(invite, now = new Date()) {
  const row = invite || {};
  const at = now instanceof Date ? now.getTime() : millis(now);
  const expires = millis(row.expiresAt || row.inviteExpiresAt);
  if (expires) return expires <= at;
  const created = millis(row.createdAt || row.invitedAt);
  return !!created && created + INVITE_TTL_DAYS * 24 * 3600 * 1000 <= at;
}

/**
 * Svarkoder fra respondGroupInvite der invitasjonen ikke lenger gjelder. Innboksen lukkes da,
 * så invitasjonsvinduet ikke kommer tilbake, og Avslå regnes som gjort.
 */
export const STALE_INVITE_CODES = ['not-found', 'gone', 'already-handled', 'expired', 'revoked', 'no-employee', 'forbidden'];

export function isStaleInviteCode(code) {
  return STALE_INVITE_CODES.includes(text(code));
}

/** Status innboksen får når invitasjonen ikke lenger gjelder. */
export function staleInboxStatus(inviteStatus) {
  const status = text(inviteStatus);
  return ['accepted', 'declined', 'revoked', 'expired', 'cancelled'].includes(status) ? status : 'expired';
}

/**
 * Nøkkel for plassholderen til en ny bruker (families/{id}/parents/{nøkkel}).
 * Hash av hele e-posten (eller telefon/navn), så ola.n@ og olan@ ikke får samme dokument.
 */
export function invitePlaceholderKey({ email = '', phone = '', name = '' } = {}) {
  const source = text(email).toLowerCase() || text(phone) || text(name).toLowerCase();
  if (!source) return `inv${Date.now()}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `inv_${hash.toString(36)}`;
}

export function isCompanyGroupType(type) {
  return ['organization', 'company'].includes(text(type).toLowerCase());
}

/** Plassholder for en ny bruker som venter på å svare (families/{id}/parents/{nøkkel}). */
export function isPendingPlaceholder(data, email) {
  const row = data || {};
  const needle = text(email).toLowerCase();
  if (!needle || text(row.email).toLowerCase() !== needle) return false;
  if (row.deleted === true || row.archived === true) return false;
  if (row.inviteKind === 'existing') return false;
  const status = text(row.inviteStatus);
  if (status === 'accepted' || status === 'declined') return false;
  return row.placeholder === true || status === 'pending';
}

export function isConfirmedMember(family, uid) {
  const id = text(uid);
  if (!id) return false;
  const data = family || {};
  return ['members', 'activeUsers', 'memberIds']
    .some((key) => Array.isArray(data[key]) && data[key].includes(id));
}

/** Invitasjonen som legges i memberInvites og i personens innboks. */
export function inviteFromPlaceholder({
  placeholder, placeholderId, family, familyId, uid, authEmail, now,
} = {}) {
  const row = placeholder || {};
  const group = family || {};
  const isGrandparent = row.isGrandparent === true || row.adultRole === 'grandparent';
  return {
    status: 'pending',
    inviteKind: 'existing',
    source: 'email',
    expiresAt: inviteExpiresAt(now && !Number.isNaN(Date.parse(now)) ? new Date(now) : new Date()),
    placeholderId: text(placeholderId),
    inviteeUid: text(uid),
    inviteeName: text(row.name),
    inviteeEmail: text(authEmail).toLowerCase(),
    inviteeUsername: '',
    invitedBy: text(row.createdBy || row.invitedBy) || null,
    asAdmin: row.admin === true && !isGrandparent,
    adultRole: row.adultRole || null,
    asGrandparent: isGrandparent,
    familyId: text(familyId),
    familyName: companyDisplayName(group),
    groupType: text(group.type) || 'family',
    createdAt: now,
    updatedAt: now,
  };
}

/** Feilkoder fra respondGroupInvite → tekst i appen. */
export function inviteResponseMessage(code) {
  const value = text(code);
  if (value === 'already-handled') return 'Invitasjonen er allerede besvart.';
  if (value === 'forbidden') return 'Denne invitasjonen er ikke til deg.';
  if (value === 'not-found') return 'Invitasjonen finnes ikke lenger.';
  if (value === 'gone') return 'Gruppen er slettet.';
  if (value === 'expired') return 'Invitasjonen har utløpt. Be om en ny invitasjon.';
  if (value === 'revoked') return 'Invitasjonen er trukket tilbake.';
  if (value === 'no-employee') return 'Invitasjonen er trukket tilbake av bedriften. Kontakt bedriften hvis du skal inn.';
  if (value === 'email-not-verified') return 'Bekreft e-posten din før du godtar invitasjonen.';
  if (value === 'bad-request') return 'Mangler invitasjon.';
  return '';
}

export function acceptedNotice(groupType, familyName) {
  const name = text(familyName);
  if (isCompanyGroupType(groupType)) return name ? `Du er med i bedriften «${name}».` : 'Du er med i bedriften.';
  return name ? `Du er med i «${name}».` : 'Du er med.';
}
