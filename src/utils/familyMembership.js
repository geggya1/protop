/**
 * Family membership indexes used by Firestore LIST rules (isFamilyMemberLite).
 */
import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { isListedOnFamilyData } from './familyMembershipLogic';

export { isListedOnFamilyData };

/**
 * Ensure uid is on family.members / activeUsers so collection LIST rules
 * (isFamilyMemberLite) succeed. Parent/child docs alone grant GET/create via
 * isFamilyMember, but LIST of chats/messages requires the lite index.
 * Safe to call repeatedly; no-op when already listed.
 */
export async function ensureListedOnFamily(familyId, uid) {
  if (!familyId || !uid) return false;
  const ref = doc(db, 'families', familyId);
  const snap = await getDoc(ref).catch(() => null);
  if (!snap?.exists()) return false;
  if (isListedOnFamilyData(snap.data() || {}, uid)) return true;
  await updateDoc(ref, {
    members: arrayUnion(uid),
    activeUsers: arrayUnion(uid),
    updatedAt: serverTimestamp(),
  });
  return true;
}
