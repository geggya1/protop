/**
 * Navigation helpers for game invite deep links / notification taps.
 */

/** Route params so invitee lands on online hub and can accept the invite. */
export function gameInviteNavParams(payload = {}) {
  const params = { mode: 'online' };
  if (payload.familyId) params.familyId = payload.familyId;
  // Do not open gameId before accept — invitee is not seated yet.
  if (payload.gameId) params.inviteGameId = payload.gameId;
  return params;
}
