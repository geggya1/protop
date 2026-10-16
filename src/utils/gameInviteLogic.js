/** Game invite fields shared by every family game (no Firebase). */

import { normalizeInviteAuthUids } from './inviteAuthUid.js';

export function normalizeInviteUids(invitedUids, hostUid) {
  return normalizeInviteAuthUids(invitedUids, hostUid);
}

/** Felter som legges på nytt spill-dokument. */
export function inviteFields(hostUid, invitedUids = []) {
  const invited = normalizeInviteUids(invitedUids, hostUid);
  const inviteStatus = { [hostUid]: 'accepted' };
  invited.forEach((id) => {
    inviteStatus[id] = 'pending';
  });
  return {
    invitedUids: invited,
    inviteStatus,
  };
}

export function gameInviteInboxDoc(inviteeUid, {
  familyId, gameId, gameType, hostUid, hostName, gameTitle,
} = {}) {
  return {
    status: 'pending',
    inviteKind: 'game',
    inviteeUid,
    familyId: familyId || null,
    gameId,
    gameType,
    hostUid: hostUid || null,
    hostName: hostName || '',
    gameTitle: gameTitle || '',
  };
}
