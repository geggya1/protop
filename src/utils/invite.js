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

function callableUnavailable(error) {
  const code = String(error?.code || '');
  return ['functions/not-found', 'functions/unavailable', 'functions/deadline-exceeded', 'functions/internal'].includes(code)
    || /Failed to fetch|NetworkError|network/i.test(String(error?.message || ''));
}

export { callableUnavailable };

/** Godta eller avslå en invitasjon på serveren. Returnerer { ok, error?, … }. */
export async function respondGroupInviteCall({ familyId, inviteId, response }) {
  const call = httpsCallable(functions, 'respondGroupInvite', { timeout: 30000 });
  const res = await call({ familyId, inviteId, response });
  return res?.data || { ok: false, error: 'unknown' };
}

/** Ny bruker med bekreftet e-post: hent invitasjoner til innboksen (Godta/Avslå). */
export async function syncMyInvites() {
  try {
    const call = httpsCallable(functions, 'syncMyInvites', { timeout: 20000 });
    const res = await call({});
    return res?.data || { ok: true, invites: [] };
  } catch (error) {
    return { ok: false, error: error?.message || 'sync-failed', invites: [] };
  }
}

/** Navn og type på gruppen som har invitert e-posten (registreringssiden). */
export async function fetchInvitePreview({ familyId, email }) {
  try {
    const call = httpsCallable(functions, 'invitePreview', { timeout: 15000 });
    const res = await call({ familyId, email });
    return res?.data || { ok: false };
  } catch {
    return { ok: false, unavailable: true };
  }
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
