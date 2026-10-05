/**
 * Whose friend graph to read or mutate. Kept out of friendCallables so slim
 * HTTP deploys can list friends without loading mail/SMS.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { assertFamilyMember, memberDocGrantsAccess } from './security.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

/**
 * Parent/admin may manage a child's personal friends graph on the same family.
 * Used when a parent views a child profile and invites/removes on their behalf.
 */
export async function assertParentCanManageChildFriends(familyId, callerUid, childUid) {
  const famId = String(familyId || '').trim();
  const caller = String(callerUid || '').trim();
  const child = String(childUid || '').trim();
  if (!famId || !caller || !child) {
    throw new HttpsError('invalid-argument', 'bad-params');
  }
  await assertFamilyMember(db, famId, caller);

  const parentDoc = await db.doc(`families/${famId}/parents/${caller}`).get();
  let callerIsParent = parentDoc.exists && memberDocGrantsAccess(parentDoc.data());
  if (!callerIsParent) {
    const byUid = await db.collection(`families/${famId}/parents`)
      .where('uid', '==', caller).limit(1).get();
    callerIsParent = !byUid.empty && memberDocGrantsAccess(byUid.docs[0].data());
  }
  const famSnap = await db.doc(`families/${famId}`).get();
  const fam = famSnap.exists ? (famSnap.data() || {}) : {};
  const adminUids = Array.isArray(fam.adminUids) ? fam.adminUids : [];
  const adminIds = Array.isArray(fam.adminIds) ? fam.adminIds : [];
  const isOwnerOrAdmin = fam.ownerUid === caller
    || fam.ownerId === caller
    || adminUids.includes(caller)
    || adminIds.includes(caller);
  if (!callerIsParent && !isOwnerOrAdmin) {
    throw new HttpsError('permission-denied', 'forbidden');
  }

  const childById = await db.doc(`families/${famId}/children/${child}`).get();
  let childOk = childById.exists && memberDocGrantsAccess(childById.data());
  if (!childOk) {
    const byUid = await db.collection(`families/${famId}/children`)
      .where('uid', '==', child).limit(1).get();
    childOk = !byUid.empty && memberDocGrantsAccess(byUid.docs[0].data());
  }
  if (!childOk) throw new HttpsError('permission-denied', 'forbidden');
}

/**
 * Resolve whose friend graph to mutate.
 * Optional asUid: parent/admin acts as that child (requires familyId).
 */
export async function resolveFriendActorUid(callerUid, { asUid = '', familyId = '' } = {}) {
  const caller = String(callerUid || '').trim();
  const target = String(asUid || '').trim();
  if (!target || target === caller) return caller;
  await assertParentCanManageChildFriends(familyId, caller, target);
  return target;
}
