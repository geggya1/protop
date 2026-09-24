/**
 * Shared membership access helpers.
 *
 * Soft-deleted / deactivated parent|child docs must NOT grant family access.
 * Pending invites keep active:false until accepted — those still need limited
 * membership signals so invitees can accept.
 */

/** True when a families/{id}/parents|children doc should grant live access. */
export function memberDocGrantsAccess(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.deleted === true) return false;
  if (data.leftAt != null) return false;
  if (data.active === false) {
    return data.inviteStatus === 'pending';
  }
  return true;
}
