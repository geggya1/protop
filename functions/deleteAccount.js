/**
 * App Store 5.1.1(v): the signed-in user can permanently delete their account.
 * No secrets — safe for the membership deploy path.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as logger from 'firebase-functions/logger';
import {
  requireAuth,
  assertRateLimit,
  hashRateKey,
  memberDocGrantsAccess,
} from './security.js';
import { isDeleteConfirmed, planFamilyExit, withoutUid } from './deleteAccountLogic.js';

if (!getApps().length) initializeApp();
const db = getFirestore();
const adminAuth = getAuth();

function addIds(ids, raw) {
  if (!raw) return;
  if (Array.isArray(raw)) raw.forEach((id) => { if (id) ids.add(String(id)); });
  else if (typeof raw === 'string' && raw) ids.add(raw);
}

async function collectFamilyIds(uid) {
  const ids = new Set();
  const userSnap = await db.doc(`users/${uid}`).get();
  if (userSnap.exists) {
    const d = userSnap.data() || {};
    addIds(ids, d.familyIds);
    addIds(ids, d.familyId);
    addIds(ids, d.activeFamilyId);
  }
  const parentSnap = await db.doc(`parents/${uid}`).get();
  if (parentSnap.exists) {
    const d = parentSnap.data() || {};
    addIds(ids, d.familyIds);
    addIds(ids, d.familyId);
  }
  const [memberSnap, adminSnap, ownerSnap] = await Promise.all([
    db.collection('families').where('members', 'array-contains', uid).get(),
    db.collection('families').where('adminUids', 'array-contains', uid).get(),
    db.collection('families').where('ownerUid', '==', uid).get(),
  ]);
  [...memberSnap.docs, ...adminSnap.docs, ...ownerSnap.docs].forEach((d) => ids.add(d.id));
  try {
    const group = await db.collectionGroup('parents').where('uid', '==', uid).limit(40).get();
    group.docs.forEach((d) => {
      const famRef = d.ref.parent?.parent;
      if (famRef?.id) ids.add(famRef.id);
    });
  } catch (err) {
    logger.warn('deleteMyAccount parents group', err);
  }
  return [...ids];
}

async function otherLiveParents(familyId, uid) {
  const snap = await db.collection(`families/${familyId}/parents`).limit(80).get();
  const ids = [];
  snap.docs.forEach((d) => {
    const data = d.data() || {};
    const id = String(data.uid || d.id || '');
    if (!id || id === uid) return;
    if (!memberDocGrantsAccess(data)) return;
    ids.push(id);
  });
  return ids;
}

async function markMembershipLeft(familyId, col, uid) {
  const now = FieldValue.serverTimestamp();
  const patch = {
    active: false,
    deleted: true,
    archived: true,
    leftAt: now,
    updatedAt: now,
    accountDeleted: true,
  };
  const direct = db.doc(`families/${familyId}/${col}/${uid}`);
  const snap = await direct.get();
  if (snap.exists) {
    await direct.set(patch, { merge: true });
    return;
  }
  const found = await db.collection(`families/${familyId}/${col}`).where('uid', '==', uid).limit(5).get();
  await Promise.all(found.docs.map((d) => d.ref.set(patch, { merge: true })));
}

async function leaveFamily(uid, familyId) {
  const famRef = db.doc(`families/${familyId}`);
  const famSnap = await famRef.get();
  if (!famSnap.exists) return;
  const data = famSnap.data() || {};
  const others = await otherLiveParents(familyId, uid);
  const plan = planFamilyExit(uid, { id: familyId, data, otherLiveParentUids: others });
  const patch = {
    members: withoutUid(data.members, uid),
    adminUids: withoutUid(data.adminUids, uid),
    activeUsers: withoutUid(data.activeUsers, uid),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (plan.action === 'archive') {
    patch.deleted = true;
    patch.archived = true;
    patch.active = false;
    patch.deletedAt = FieldValue.serverTimestamp();
    patch.deletedBecause = 'last-adult-account-deleted';
  }
  if (plan.nextOwner) {
    if (data.ownerUid === uid) patch.ownerUid = plan.nextOwner;
    if (data.ownerId === uid) patch.ownerId = plan.nextOwner;
    if (data.adminUid === uid) patch.adminUid = plan.nextOwner;
    if (data.createdBy === uid) patch.createdBy = plan.nextOwner;
    const admins = Array.isArray(patch.adminUids) ? [...patch.adminUids] : [];
    if (!admins.includes(plan.nextOwner)) admins.push(plan.nextOwner);
    patch.adminUids = admins;
  }
  await famRef.set(patch, { merge: true });
  await markMembershipLeft(familyId, 'parents', uid);
  await markMembershipLeft(familyId, 'children', uid);
}

async function clearFriendships(uid) {
  const snap = await db.collection('friendships').where('memberIds', 'array-contains', uid).limit(100).get();
  for (const docSnap of snap.docs) {
    const members = Array.isArray(docSnap.data()?.memberIds) ? docSnap.data().memberIds : [];
    const others = members.filter((id) => id && id !== uid);
    await Promise.all(others.map((other) => db.doc(`users/${other}/friends/${uid}`).delete().catch(() => {})));
    await docSnap.ref.delete().catch(() => {});
  }
}

async function clearUsernames(uid, hints = []) {
  const ids = new Set(hints.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean));
  try {
    const snap = await db.collection('usernames').where('uid', '==', uid).limit(20).get();
    snap.docs.forEach((d) => ids.add(d.id));
  } catch (err) {
    logger.warn('deleteMyAccount usernames query', err);
  }
  await Promise.all([...ids].map((id) => db.doc(`usernames/${id}`).delete().catch(() => {})));
}

export const deleteMyAccount = onCall(
  { region: 'europe-west1', timeoutSeconds: 120, memory: '512MiB', cors: true },
  async (req) => {
    const uid = requireAuth(req.auth);
    if (!isDeleteConfirmed(req.data?.confirm)) {
      throw new HttpsError('failed-precondition', 'Type DELETE to confirm.');
    }
    await assertRateLimit(db, {
      key: hashRateKey(['delete-account', uid]),
      limit: 5,
      windowMs: 24 * 60 * 60 * 1000,
    });

    const userSnap = await db.doc(`users/${uid}`).get();
    const user = userSnap.exists ? (userSnap.data() || {}) : {};
    const familyIds = await collectFamilyIds(uid);
    for (const familyId of familyIds) {
      await leaveFamily(uid, familyId);
    }
    await clearFriendships(uid);
    await clearUsernames(uid, [user.username, user.usernameLower]);
    await db.doc(`parents/${uid}`).delete().catch(() => {});
    await db.doc(`children/${uid}`).delete().catch(() => {});
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await adminAuth.revokeRefreshTokens(uid).catch(() => {});
    await adminAuth.deleteUser(uid);
    logger.info('deleteMyAccount ok', { uid, families: familyIds.length });
    return { ok: true };
  },
);
