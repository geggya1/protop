// src/utils/invite.js
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

/** Deep link for existing users who must accept/decline a family invite. */
export function familyInviteAcceptUrl({ familyId, inviteId }) {
  const fid = encodeURIComponent(String(familyId || ''));
  const iid = encodeURIComponent(String(inviteId || ''));
  return `https://www.protop.no/family-invite/${fid}/${iid}`;
}

export async function sendParentInvite({
  email,
  name = '',
  familyId = 'familie',
  familyName = '',
  groupType = '',
  registerUrl,
  existingUser = false,
  inviteKind = '',
}) {
  const sendInviteV2 = httpsCallable(functions, 'sendInviteV2');
  const res = await sendInviteV2({
    email,
    name,
    familyId,
    familyName,
    groupType,
    registerUrl,
    inviteLink: registerUrl,
    existingUser: !!existingUser || inviteKind === 'existing',
    inviteKind: existingUser ? 'existing' : (inviteKind || ''),
  });
  if (!res?.data?.ok) {
    throw new Error(res?.data?.error || 'Kunne ikke sende invitasjon');
  }
  return res.data;
}

export async function sendParentInviteSms({
  phone,
  name = '',
  familyId = 'familie',
  familyName = '',
  groupType = '',
  joinCode = '',
  registerUrl,
  existingUser = false,
  inviteKind = '',
}) {
  const sendInviteSmsV2 = httpsCallable(functions, 'sendInviteSmsV2');
  const res = await sendInviteSmsV2({
    phone,
    name,
    familyId,
    familyName,
    groupType,
    joinCode,
    registerUrl,
    existingUser: !!existingUser || inviteKind === 'existing',
    inviteKind: existingUser ? 'existing' : (inviteKind || ''),
  });
  if (!res?.data?.ok) {
    throw new Error(res?.data?.error || 'Kunne ikke sende SMS-invitasjon');
  }
  return res.data;
}
