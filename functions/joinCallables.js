/**
 * Secure join-by-code flow (team / classroom / platform).
 * Clients cannot list joinCodes or write joinRequests as non-members.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { requireAuth, assertRateLimit, hashRateKey, memberDocGrantsAccess } from './security.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function resolveJoinTarget(code) {
  const mapSnap = await db.doc(`joinCodes/${code}`).get();
  if (!mapSnap.exists) {
    throw new HttpsError('not-found', 'Fant ingen gruppe med denne koden.');
  }
  const mapped = mapSnap.data() || {};
  const familyId = mapped.familyId;
  if (!familyId) throw new HttpsError('not-found', 'Fant ingen gruppe med denne koden.');
  const famSnap = await db.doc(`families/${familyId}`).get();
  if (!famSnap.exists) throw new HttpsError('not-found', 'Fant ingen gruppe med denne koden.');
  const family = famSnap.data() || {};
  if (family.deleted === true || family.hiddenFromApp === true || family.active === false) {
    throw new HttpsError('not-found', 'Fant ingen gruppe med denne koden.');
  }
  // Prefer stored family joinCode match when present (rotation safety).
  if (family.joinCode && String(family.joinCode).toUpperCase() !== code) {
    throw new HttpsError('not-found', 'Koden er ugyldig eller utløpt.');
  }
  return {
    familyId,
    type: family.type || mapped.type || 'family',
    name: family.name || '',
    joinCode: code,
  };
}

/** Resolve a join code to minimal public group info (rate-limited). */
export const resolveJoinCode = onCall(
  // Pin region: setGlobalOptions can race under ESM and land in us-central1.
  { region: 'europe-west1', timeoutSeconds: 20, memory: '256MiB', cors: true },
  async (req) => {
    const uid = requireAuth(req.auth);
    await assertRateLimit(db, {
      key: hashRateKey(['resolve-join', uid]),
      limit: 30,
      windowMs: 60 * 60 * 1000,
    });
    const code = normalizeCode(req.data?.code || req.data?.joinCode);
    if (code.length < 6 || code.length > 12) {
      throw new HttpsError('invalid-argument', 'Ugyldig kode.');
    }
    const target = await resolveJoinTarget(code);
    return {
      ok: true,
      familyId: target.familyId,
      type: target.type,
      name: target.name,
      joinCode: target.joinCode,
    };
  },
);

/**
 * Submit a join request using a code.
 * Admin SDK writes under families/{id}/joinRequests.
 */
export const submitJoinRequestByCode = onCall(
  { region: 'europe-west1', timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req) => {
    const uid = requireAuth(req.auth);
    await assertRateLimit(db, {
      key: hashRateKey(['join-request', uid]),
      limit: 15,
      windowMs: 60 * 60 * 1000,
    });
    const code = normalizeCode(req.data?.code || req.data?.joinCode);
    if (code.length < 6 || code.length > 12) {
      throw new HttpsError('invalid-argument', 'Ugyldig kode.');
    }
    const target = await resolveJoinTarget(code);

    const childFirstName = String(req.data?.childFirstName || '').trim();
    const childLastName = String(req.data?.childLastName || '').trim();
    const parentName = String(req.data?.parentName || req.auth.token?.name || '').trim();
    const parentEmail = String(req.data?.parentEmail || req.auth.token?.email || '').trim().toLowerCase();
    const message = String(req.data?.message || '').trim().slice(0, 500);
    const kind = String(req.data?.kind || 'member').trim().slice(0, 40);

    // Duplicate pending request guard
    const existing = await db.collection(`families/${target.familyId}/joinRequests`)
      .where('parentUid', '==', uid)
      .where('status', '==', 'pending')
      .limit(20)
      .get();
    const dup = existing.docs.find((d) => {
      const data = d.data() || {};
      if (childFirstName || childLastName) {
        return String(data.childFirstName || '').toLowerCase() === childFirstName.toLowerCase()
          && String(data.childLastName || '').toLowerCase() === childLastName.toLowerCase();
      }
      return data.parentUid === uid;
    });
    if (dup) {
      throw new HttpsError('already-exists', 'Du har allerede en ventende forespørsel.');
    }

    const ref = await db.collection(`families/${target.familyId}/joinRequests`).add({
      status: 'pending',
      kind,
      parentUid: uid,
      parentName,
      parentEmail,
      childFirstName: childFirstName || null,
      childLastName: childLastName || null,
      childName: `${childFirstName} ${childLastName}`.trim() || null,
      message: message || null,
      joinCode: code,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info('join request created', {
      familyId: target.familyId,
      type: target.type,
      uid,
      requestId: ref.id,
    });

    return {
      ok: true,
      requestId: ref.id,
      familyId: target.familyId,
      familyName: target.name,
      type: target.type,
    };
  },
);

/**
 * List families the signed-in user belongs to (Admin SDK).
 * Client list queries can fail after security rules that use get()/exists()
 * in allow read — that leaves returning parents on GetStarted ("Start gruppen").
 */
export const listMyFamilies = onCall(
  { region: 'europe-west1', timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      await assertRateLimit(db, {
        key: hashRateKey(['list-my-families', uid]),
        limit: 60,
        windowMs: 60 * 60 * 1000,
      });

      const ids = new Set();

      const addIds = (raw) => {
        if (!raw) return;
        if (Array.isArray(raw)) raw.forEach((id) => { if (id) ids.add(String(id)); });
        else if (typeof raw === 'string' && raw) ids.add(raw);
      };

      try {
        const userSnap = await db.doc(`users/${uid}`).get();
        if (userSnap.exists) {
          const d = userSnap.data() || {};
          addIds(d.familyIds);
          addIds(d.familyId);
          addIds(d.activeFamilyId);
        }
      } catch (e) {
        logger.warn('listMyFamilies users read', e);
      }

      try {
        const parentSnap = await db.doc(`parents/${uid}`).get();
        if (parentSnap.exists) {
          const d = parentSnap.data() || {};
          addIds(d.familyIds);
          addIds(d.familyId);
        }
      } catch (e) {
        logger.warn('listMyFamilies parents read', e);
      }

      try {
        const [mSnap, aSnap, oSnap] = await Promise.all([
          db.collection('families').where('members', 'array-contains', uid).get(),
          db.collection('families').where('adminUids', 'array-contains', uid).get(),
          db.collection('families').where('ownerUid', '==', uid).get(),
        ]);
        [...mSnap.docs, ...aSnap.docs, ...oSnap.docs].forEach((d) => ids.add(d.id));
      } catch (e) {
        logger.warn('listMyFamilies family queries', e);
      }

      try {
        const cg = await db.collectionGroup('parents').where('uid', '==', uid).limit(50).get();
        cg.docs.forEach((d) => {
          if (!memberDocGrantsAccess(d.data() || {})) return;
          const famRef = d.ref.parent?.parent;
          if (famRef?.id) ids.add(famRef.id);
        });
      } catch (e) {
        logger.warn('listMyFamilies collectionGroup parents', e);
      }

      // Direct parents/{uid} under each candidate is already covered; also try
      // document-id path families/*/parents/{uid} via collectionGroup doc id is not
      // queryable the same way — get known ids only.

      const uidHasLiveAccess = async (familyId, famData) => {
        const data = famData || {};
        const adminUids = Array.isArray(data.adminUids) ? data.adminUids : [];
        const isOwnerOrAdmin =
          data.ownerUid === uid
          || data.ownerId === uid
          || data.createdBy === uid
          || adminUids.includes(uid);

        const parent = await db.doc(`families/${familyId}/parents/${uid}`).get();
        if (parent.exists) {
          if (memberDocGrantsAccess(parent.data() || {})) return true;
          return isOwnerOrAdmin;
        }
        const parentsSnap = await db.collection(`families/${familyId}/parents`).where('uid', '==', uid).limit(1).get();
        if (!parentsSnap.empty) {
          if (memberDocGrantsAccess(parentsSnap.docs[0].data() || {})) return true;
          return isOwnerOrAdmin;
        }
        const child = await db.doc(`families/${familyId}/children/${uid}`).get();
        if (child.exists) {
          return memberDocGrantsAccess(child.data() || {});
        }
        if (isOwnerOrAdmin) return true;
        const members = data.memberIds || data.members || [];
        if (Array.isArray(members) && members.includes(uid)) return true;
        return false;
      };

      const families = [];
      for (const id of ids) {
        try {
          const snap = await db.doc(`families/${id}`).get();
          if (!snap.exists) continue;
          const data = snap.data() || {};
          if (data.deleted === true || data.hiddenFromApp === true) continue;
          if (!(await uidHasLiveAccess(id, data))) continue;
          // Strip secrets / sensitive fields before returning to client.
          const {
            joinCode,
            inviteCode,
            password,
            kitchenPin,
            kitchenPinHash,
            ...safe
          } = data;
          families.push({ id: snap.id, ...safe });
        } catch (e) {
          logger.warn('listMyFamilies family get', id, e);
        }
      }

      logger.info('listMyFamilies', { uid, count: families.length });
      return { ok: true, families };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      logger.error('listMyFamilies unexpected', e);
      throw new HttpsError('unavailable', 'Kunne ikke hente familier. Prøv igjen om litt.');
    }
  },
);
