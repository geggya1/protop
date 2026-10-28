/**
 * Invitasjonslenke til en bedrift (UX-30): godta invitasjonen når e-posten er bekreftet,
 * og «Ikke meg? Avslå» etterpå. Reglene for hvem som kan bli med ligger på serveren:
 * syncMyInvites legger bare inn invitasjoner til personens bekreftede e-post, og
 * respondGroupInvite godtar bare personens egen invitasjon. Se inviteLinkJoin.js.
 */
import { deleteField, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { syncMyInvites } from './invite';
import { acceptFamilyMemberInvite } from './groups';
import { claimEmployeeSeat } from '../employees/inviteClient';
import { leaveCompany } from '../employees/membershipClient';
import { JOIN_INVITE_FIELD, pickJoinInvite } from './inviteLinkJoin';

/** Fjern ønsket (vanlig flyt videre, eller kortet er lest). */
export async function clearJoinInvite(uid) {
  if (!uid) return;
  await updateDoc(doc(db, 'users', uid), {
    [JOIN_INVITE_FIELD]: deleteField(),
    updatedAt: serverTimestamp(),
  }).catch(() => {});
}

/**
 * Godta invitasjonen fra lenken. Svarer { ok, familyId, familyName, groupType } eller
 * { ok: false, reason }. Finnes ingen invitasjon til denne e-posten (feil e-post, trukket
 * tilbake, utløpt), fjernes ønsket, og personen får den vanlige flyten.
 */
export async function runInviteLinkJoin({ uid, joinInvite }) {
  const me = auth.currentUser;
  if (!me || me.uid !== uid || !joinInvite?.familyId) return { ok: false, reason: 'no-user' };
  // Bekreftelsen skjedde nettopp: tokenet må si det før serveren gir invitasjonen.
  try {
    const token = await me.getIdTokenResult();
    if (!token?.claims?.email_verified) await me.getIdToken(true);
  } catch { /* bruker gammelt token */ }
  const sync = await syncMyInvites();
  const invite = pickJoinInvite(sync?.invites, joinInvite.familyId);
  if (!invite) {
    if (sync?.ok) await clearJoinInvite(uid);
    return { ok: false, reason: sync?.ok ? 'no-invite' : 'sync-failed' };
  }
  try {
    const res = await acceptFamilyMemberInvite({
      familyId: invite.familyId,
      inviteId: invite.inviteId || invite.id,
      uid,
    });
    await claimEmployeeSeat(invite.familyId).catch(() => {});
    const familyName = res?.familyName || invite.familyName || joinInvite.familyName || '';
    await setDoc(doc(db, 'users', uid), {
      [JOIN_INVITE_FIELD]: {
        ...joinInvite, status: 'joined', familyName, joinedAt: new Date().toISOString(),
      },
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});
    return {
      ok: true,
      familyId: res?.familyId || invite.familyId,
      familyName,
      groupType: invite.groupType || joinInvite.groupType || 'organization',
    };
  } catch (err) {
    // Gjelder ikke lenger: innboksen er lukket, og personen får den vanlige flyten.
    await clearJoinInvite(uid);
    return { ok: false, reason: err?.message || 'accept-failed' };
  }
}

/** «Ikke meg? Avslå»: ta personen ut av bedriften igjen (administrator får beskjed). */
export async function declineJoinedCompany({ uid, familyId }) {
  await leaveCompany(familyId);
  await clearJoinInvite(uid);
}
