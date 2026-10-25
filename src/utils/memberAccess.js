/**
 * Shared membership access helpers.
 *
 * Soft-deleted / deactivated parent|child docs must NOT grant family access.
 * En ventende invitasjon (plassholder) gir heller ingen tilgang: personen svarer
 * i innboksen, og serveren gir medlemskapet når hen godtar (respondGroupInvite).
 */

/** True when a families/{id}/parents|children doc should grant live access. */
export function memberDocGrantsAccess(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.deleted === true) return false;
  if (data.leftAt != null) return false;
  if (data.placeholder === true || data.inviteStatus === 'pending') return false;
  return data.active !== false;
}
