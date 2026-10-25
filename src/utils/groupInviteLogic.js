/**
 * Svar på gruppeinvitasjoner uten Firebase. Brukes av Cloud Functions
 * (functions/groupInvite.js) og av appen for tekster og feilmeldinger.
 *
 * Ingen blir medlem uten å trykke Godta. En ny bruker som ble invitert på e-post
 * får invitasjonen i innboksen når e-posten er bekreftet, og svarer der.
 */

function text(value) {
  return String(value ?? '').trim();
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
    familyName: text(group.name) || text(group.company?.navn),
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
  if (value === 'email-not-verified') return 'Bekreft e-posten din før du godtar invitasjonen.';
  if (value === 'bad-request') return 'Mangler invitasjon.';
  return '';
}

export function acceptedNotice(groupType, familyName) {
  const name = text(familyName);
  if (isCompanyGroupType(groupType)) return name ? `Du er med i bedriften «${name}».` : 'Du er med i bedriften.';
  return name ? `Du er med i «${name}».` : 'Du er med.';
}
