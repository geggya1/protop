/**
 * Medlemskap i et selskap, lest bare fra feltene på selskapsdokumentet
 * (ownerUid/ownerId og members/activeUsers/memberIds). Aldri fra toppnivå
 * parents/{uid} eller users/{uid}.familyIds, som brukeren skriver selv.
 */
import { HttpsError } from 'firebase-functions/v2/https';

const MEMBER_LISTS = ['members', 'activeUsers', 'memberIds'];

export function isCompanyMemberRecord(family, uid) {
  const id = String(uid || '').trim();
  if (!family || !id || family.deleted === true) return false;
  if (family.ownerUid === id || family.ownerId === id) return true;
  return MEMBER_LISTS.some((key) => Array.isArray(family[key]) && family[key].includes(id));
}

export function cleanFamilyId(value) {
  const id = String(value || '').trim();
  if (!id || id.includes('/') || id.length > 128) return '';
  return id;
}

/** Kaster permission-denied når uid ikke er medlem. Svarer med selskapets data. */
export async function assertCompanyMember(db, familyId, uid) {
  const id = cleanFamilyId(familyId);
  if (!id) throw new HttpsError('invalid-argument', 'Bedrift mangler.');
  const snap = await db.doc(`families/${id}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Fant ikke bedriften.');
  const family = snap.data() || {};
  if (!isCompanyMemberRecord(family, uid)) {
    throw new HttpsError('permission-denied', 'Du er ikke med i denne bedriften.');
  }
  return family;
}
