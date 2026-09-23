/**
 * Friend graph mutations via Admin SDK — works without new Firestore client rules.
 * Clients call these; Admin bypasses security rules for cross-user writes.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  requireAuth,
  hashRateKey,
  assertRateLimit,
  isValidEmail,
  redactEmail,
  assertFamilyMember,
  memberDocGrantsAccess,
} from './security.js';
import { sendMail } from './mail.js';
import { sendSms } from './sms.js';
import { resolveMailApiKey } from './mailApiKey.js';
import { buildFriendInviteMessage, buildFriendInviteSms } from './friendInviteCopy.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

function pairId(a, b) {
  return [String(a), String(b)].filter(Boolean).sort().join('_');
}

function chatIdFor(a, b) {
  const p = pairId(a, b);
  return p ? `dm_${p}` : '';
}

async function loadContactEmail(uid) {
  const [u, p, c] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`parents/${uid}`).get(),
    db.doc(`children/${uid}`).get(),
  ]);
  const ud = u.exists ? u.data() : {};
  const pd = p.exists ? p.data() : {};
  const cd = c.exists ? c.data() : {};
  const email = String(ud.email || pd.email || cd.email || '').trim().toLowerCase();
  return isValidEmail(email) ? email : '';
}

async function loadContactPhone(uid) {
  const [u, p, c] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`parents/${uid}`).get(),
    db.doc(`children/${uid}`).get(),
  ]);
  const ud = u.exists ? u.data() : {};
  const pd = p.exists ? p.data() : {};
  const cd = c.exists ? c.data() : {};
  return String(ud.phone || pd.phone || cd.phone || ud.phoneNumber || pd.phoneNumber || '').trim();
}

async function loadPublic(uid) {
  const [u, p, c] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`parents/${uid}`).get(),
    db.doc(`children/${uid}`).get(),
  ]);
  const ud = u.exists ? u.data() : {};
  const pd = p.exists ? p.data() : {};
  const cd = c.exists ? c.data() : {};
  const isChild = ud.role === 'child' || ud.type === 'child' || c.exists;
  return {
    uid,
    name: ud.displayName || ud.name || pd.name || cd.name || 'Bruker',
    username: ud.username || pd.username || cd.username || '',
    photoURL: ud.photoURL || pd.photoURL || cd.photoURL || null,
    avatarId: ud.avatarId || pd.avatarId || cd.avatarId || null,
    role: isChild ? 'child' : 'adult',
  };
}

/**
 * Parent/admin may manage a child's personal friends graph on the same family.
 * Used when a parent views a child profile and invites/removes on their behalf.
 */
async function assertParentCanManageChildFriends(familyId, callerUid, childUid) {
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
async function resolveFriendActorUid(callerUid, { asUid = '', familyId = '' } = {}) {
  const caller = String(callerUid || '').trim();
  const target = String(asUid || '').trim();
  if (!target || target === caller) return caller;
  await assertParentCanManageChildFriends(familyId, caller, target);
  return target;
}

/** List accepted friends for the caller (from Admin-managed mirror docs). */
export const listMyFriends = onCall(
  { region: 'europe-west1', timeoutSeconds: 20, memory: '256MiB', cors: true },
  async (req) => {
    const uid = requireAuth(req.auth);
    const snap = await db.collection(`users/${uid}/friends`).get();
    const friends = snap.docs
      .map((d) => ({ id: d.id, friendUid: d.id, ...d.data() }))
      .filter((f) => f.status !== 'removed');
    return { ok: true, friends };
  },
);

/**
 * Remove a friendship. Parent may pass asUid to remove on a child's graph.
 */
export const removeFriendAdmin = onCall(
  { region: 'europe-west1', timeoutSeconds: 20, memory: '256MiB', cors: true },
  async (req) => {
    try {
      const callerUid = requireAuth(req.auth);
      const uid = await resolveFriendActorUid(callerUid, {
        asUid: req.data?.asUid,
        familyId: req.data?.familyId,
      });
      const friendUid = String(req.data?.friendUid || '').trim();
      if (!friendUid) return { ok: false, error: 'bad-params' };
      if (friendUid === uid) return { ok: false, error: 'bad-params' };

      const friendshipId = pairId(uid, friendUid);
      const now = FieldValue.serverTimestamp();
      const batch = db.batch();
      batch.delete(db.doc(`users/${uid}/friends/${friendUid}`));
      batch.delete(db.doc(`users/${friendUid}/friends/${uid}`));
      batch.set(db.doc(`friendships/${friendshipId}`), {
        status: 'removed',
        updatedAt: now,
        removedBy: callerUid,
      }, { merge: true });
      await batch.commit();
      return { ok: true, friendshipId, actorUid: uid };
    } catch (error) {
      if (error instanceof HttpsError) return { ok: false, error: error.message };
      logger.error('[removeFriendAdmin]', error?.message);
      return { ok: false, error: error?.message || 'failed' };
    }
  },
);

/**
 * Parent (or self) may list another profile's friends — used when a parent
 * views a child profile. Never returns a sibling's or parent's friends by
 * accident: targetUid must be the child's Auth uid, and caller must be a
 * live parent/admin on the same family.
 */
export const listFriendsForUid = onCall(
  { region: 'europe-west1', timeoutSeconds: 20, memory: '256MiB', cors: true },
  async (req) => {
    const callerUid = requireAuth(req.auth);
    const targetUid = String(req.data?.targetUid || '').trim();
    const familyId = String(req.data?.familyId || '').trim();
    if (!targetUid) return { ok: false, error: 'bad-params' };

    if (targetUid !== callerUid) {
      try {
        await assertParentCanManageChildFriends(familyId, callerUid, targetUid);
      } catch (error) {
        if (error instanceof HttpsError) {
          return { ok: false, error: error.message };
        }
        throw error;
      }
    }

    const snap = await db.collection(`users/${targetUid}/friends`).get();
    const friends = snap.docs
      .map((d) => ({ id: d.id, friendUid: d.id, ...d.data() }))
      .filter((f) => f.status !== 'removed');
    return { ok: true, friends, targetUid };
  },
);

export const listFriendRequests = onCall(
  { region: 'europe-west1', timeoutSeconds: 20, memory: '256MiB', cors: true },
  async (req) => {
    try {
      const callerUid = requireAuth(req.auth);
      const uid = await resolveFriendActorUid(callerUid, {
        asUid: req.data?.asUid || req.data?.targetUid,
        familyId: req.data?.familyId,
      });
      const snap = await db.collection(`users/${uid}/friendRequests`)
        .where('status', '==', 'pending')
        .get();
      const requests = snap.docs.map((d) => ({ id: d.id, requestId: d.id, ...d.data() }));
      return { ok: true, requests, actorUid: uid };
    } catch (error) {
      if (error instanceof HttpsError) return { ok: false, error: error.message };
      throw error;
    }
  },
);

/** Outgoing friend invites the caller has sent (pending / declined / withdrawn). */
export const listOutgoingFriendRequests = onCall(
  { region: 'europe-west1', timeoutSeconds: 20, memory: '256MiB', cors: true },
  async (req) => {
    try {
      const callerUid = requireAuth(req.auth);
      const uid = await resolveFriendActorUid(callerUid, {
        asUid: req.data?.asUid || req.data?.targetUid,
        familyId: req.data?.familyId,
      });
      const snap = await db.collection(`users/${uid}/outgoingFriendRequests`).limit(60).get();
      const requests = snap.docs
        .map((d) => ({ id: d.id, requestId: d.id, ...d.data() }))
        .filter((r) => {
          const st = String(r.status || 'pending');
          return st === 'pending' || st === 'declined' || st === 'withdrawn';
        })
        .sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || a.createdAt?._seconds * 1000 || 0;
          const tb = b.createdAt?.toMillis?.() || b.createdAt?._seconds * 1000 || 0;
          return tb - ta;
        })
        .slice(0, 40);
      return { ok: true, requests, actorUid: uid };
    } catch (error) {
      if (error instanceof HttpsError) return { ok: false, error: error.message };
      throw error;
    }
  },
);

/**
 * Withdraw a pending outgoing friend request (existing user or new-user invite).
 */
export const withdrawFriendRequestAdmin = onCall(
  { region: 'europe-west1', timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req) => {
    try {
      const callerUid = requireAuth(req.auth);
      const uid = await resolveFriendActorUid(callerUid, {
        asUid: req.data?.asUid,
        familyId: req.data?.familyId,
      });
      const requestId = String(req.data?.requestId || '').trim();
      if (!requestId) return { ok: false, error: 'bad-params' };
      const outRef = db.doc(`users/${uid}/outgoingFriendRequests/${requestId}`);
      const outSnap = await outRef.get();
      if (!outSnap.exists) return { ok: false, error: 'not-found' };
      const out = outSnap.data() || {};
      if (out.fromUid && out.fromUid !== uid) return { ok: false, error: 'forbidden' };
      const status = String(out.status || 'pending');
      if (status !== 'pending') return { ok: false, error: 'already-handled' };

      const now = FieldValue.serverTimestamp();
      const batch = db.batch();
      batch.set(outRef, { status: 'withdrawn', withdrawnAt: now, updatedAt: now }, { merge: true });

      const toUid = out.toUid || out.inviteeUid || '';
      if (toUid) {
        batch.set(db.doc(`users/${toUid}/friendRequests/${requestId}`), {
          status: 'withdrawn',
          withdrawnAt: now,
          updatedAt: now,
        }, { merge: true });
        batch.delete(db.doc(`users/${toUid}/notifications/friendInvite_${requestId}`));
      }

      const pendingInviteId = out.pendingInviteId || (out.inviteKind === 'new' ? requestId : '');
      if (pendingInviteId) {
        batch.set(db.doc(`pendingFriendInvites/${pendingInviteId}`), {
          status: 'withdrawn',
          withdrawnAt: now,
          updatedAt: now,
        }, { merge: true });
        if (out.token) {
          batch.set(db.doc(`friendInviteTokens/${out.token}`), {
            status: 'withdrawn',
            updatedAt: now,
          }, { merge: true });
        }
      }
      await batch.commit();
      return { ok: true, status: 'withdrawn', requestId };
    } catch (error) {
      if (error instanceof HttpsError) return { ok: false, error: error.message };
      logger.error('[withdrawFriendRequestAdmin]', error?.message);
      return { ok: false, error: error?.message || 'failed' };
    }
  },
);

/**
 * Remove a withdrawn/declined outgoing request from the sender's list (hard-delete outbox).
 */
export const dismissOutgoingFriendRequestAdmin = onCall(
  { region: 'europe-west1', timeoutSeconds: 20, memory: '256MiB', cors: true },
  async (req) => {
    try {
      const callerUid = requireAuth(req.auth);
      const uid = await resolveFriendActorUid(callerUid, {
        asUid: req.data?.asUid,
        familyId: req.data?.familyId,
      });
      const requestId = String(req.data?.requestId || '').trim();
      if (!requestId) return { ok: false, error: 'bad-params' };
      const outRef = db.doc(`users/${uid}/outgoingFriendRequests/${requestId}`);
      const outSnap = await outRef.get();
      if (!outSnap.exists) return { ok: true, requestId, alreadyGone: true };
      const out = outSnap.data() || {};
      if (out.fromUid && out.fromUid !== uid) return { ok: false, error: 'forbidden' };
      const status = String(out.status || 'pending');
      if (status !== 'withdrawn' && status !== 'declined') {
        return { ok: false, error: 'not-dismissible' };
      }
      await outRef.delete();
      return { ok: true, requestId, status };
    } catch (error) {
      if (error instanceof HttpsError) return { ok: false, error: error.message };
      logger.error('[dismissOutgoingFriendRequestAdmin]', error?.message);
      return { ok: false, error: error?.message || 'failed' };
    }
  },
);

/**
 * Resend reminder for a pending outgoing friend request (inbox + e-post/SMS when possible).
 */
export const resendFriendRequestAdmin = onCall(
  { region: 'europe-west1', timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req) => {
    try {
      const callerUid = requireAuth(req.auth);
      const uid = await resolveFriendActorUid(callerUid, {
        asUid: req.data?.asUid,
        familyId: req.data?.familyId,
      });
      await assertRateLimit(db, {
        key: hashRateKey(['friend-resend', callerUid]),
        limit: 20,
        windowMs: 60 * 60 * 1000,
      });
      const requestId = String(req.data?.requestId || '').trim();
      if (!requestId) return { ok: false, error: 'bad-params' };
      const outRef = db.doc(`users/${uid}/outgoingFriendRequests/${requestId}`);
      const outSnap = await outRef.get();
      if (!outSnap.exists) return { ok: false, error: 'not-found' };
      const out = outSnap.data() || {};
      if (out.fromUid && out.fromUid !== uid) return { ok: false, error: 'forbidden' };
      if (String(out.status || 'pending') !== 'pending') {
        return { ok: false, error: 'already-handled' };
      }

      const sender = await loadPublic(uid);
      const fromName = (sender.name && sender.name !== 'Bruker' ? sender.name : null)
        || String(out.fromName || 'Noen').slice(0, 80);
      const toUid = out.toUid || out.inviteeUid || '';
      const now = FieldValue.serverTimestamp();
      let emailSent = false;
      let emailError = null;
      let smsSent = false;
      let smsError = null;

      if (toUid) {
        const invitee = await loadPublic(toUid);
        await db.doc(`users/${toUid}/friendRequests/${requestId}`).set({
          status: 'pending',
          updatedAt: now,
          fromName,
          fromPhotoURL: sender.photoURL || out.fromPhotoURL || null,
          fromAvatarId: sender.avatarId || out.fromAvatarId || null,
        }, { merge: true });
        await db.doc(`users/${toUid}/notifications/friendInvite_${requestId}`).set({
          eventType: 'friendInvite',
          title: 'Venneforespørsel',
          body: `${fromName} vil gjerne bli venn med deg på Weekplan.`,
          requestId,
          inviteId: requestId,
          fromUid: uid,
          createdBy: uid,
          createdAt: now,
          seen: false,
          read: false,
        }, { merge: true });
        await outRef.set({ updatedAt: now, fromName, lastResentAt: now }, { merge: true });

        const acceptUrl = `https://www.protop.no/friend-invite/${encodeURIComponent(requestId)}`;
        try {
          const toEmail = await loadContactEmail(toUid);
          const apiKey = await resolveMailApiKey();
          if (toEmail && apiKey) {
            await sendMail(
              apiKey,
              buildFriendInviteMessage({
                to: toEmail,
                name: invitee.name,
                fromName,
                registerUrl: acceptUrl,
                existingUser: true,
              }),
            );
            emailSent = true;
          } else if (toEmail && !apiKey) {
            emailError = 'mail-key-missing';
          }
        } catch (mailErr) {
          emailError = mailErr?.message || 'mail-failed';
        }

        try {
          const toPhone = String(out.toPhone || '').trim() || await loadContactPhone(toUid);
          const apiKey = await resolveMailApiKey();
          if (toPhone && apiKey) {
            await sendSms(apiKey, {
              to: toPhone,
              content: buildFriendInviteSms({
                name: invitee.name,
                fromName,
                registerUrl: acceptUrl,
                existingUser: true,
              }),
            });
            smsSent = true;
          } else if (toPhone && !apiKey) {
            smsError = 'mail-key-missing';
          }
        } catch (smsErr) {
          smsError = smsErr?.message || 'sms-failed';
        }
      } else {
        // New-user pending invite: re-queue outbox + mail/SMS when contact present.
        const toEmail = String(out.toEmail || '').trim().toLowerCase();
        const toPhone = String(out.toPhone || '').trim();
        const pendingId = out.pendingInviteId || requestId;
        const token = out.token || '';
        const registerUrl = token
          ? `https://www.protop.no/register?friendInvite=${encodeURIComponent(token)}&email=${encodeURIComponent(toEmail || '')}`
          : `https://www.protop.no/register`;
        await outRef.set({ updatedAt: now, lastResentAt: now, fromName }, { merge: true });
        await db.doc(`friendInviteOutbox/out_${pendingId}`).set({
          pendingInviteId: pendingId,
          fromUid: uid,
          fromName,
          toName: out.toName || '',
          toEmail,
          toPhone,
          registerUrl,
          existingUser: false,
          channels: [
            ...(toEmail ? ['email'] : []),
            ...(toPhone ? ['sms'] : []),
          ],
          status: 'queued',
          deliveryAttempted: false,
          resentAt: now,
          createdAt: now,
        }, { merge: true });
        const apiKey = await resolveMailApiKey().catch(() => '');
        if (toEmail) {
          try {
            if (apiKey) {
              await sendMail(
                apiKey,
                buildFriendInviteMessage({
                  to: toEmail,
                  name: out.toName || '',
                  fromName,
                  registerUrl,
                  existingUser: false,
                }),
              );
              emailSent = true;
            } else {
              emailError = 'mail-key-missing';
            }
          } catch (mailErr) {
            emailError = mailErr?.message || 'mail-failed';
          }
        }
        if (toPhone) {
          try {
            if (apiKey) {
              await sendSms(apiKey, {
                to: toPhone,
                content: buildFriendInviteSms({
                  name: out.toName || '',
                  fromName,
                  registerUrl,
                  existingUser: false,
                }),
              });
              smsSent = true;
            } else {
              smsError = 'mail-key-missing';
            }
          } catch (smsErr) {
            smsError = smsErr?.message || 'sms-failed';
          }
        }
      }

      return {
        ok: true, requestId, emailSent, emailError, smsSent, smsError,
      };
    } catch (error) {
      if (error instanceof HttpsError) return { ok: false, error: error.message };
      logger.error('[resendFriendRequestAdmin]', error?.message);
      return { ok: false, error: error?.message || 'failed' };
    }
  },
);

/**
 * Create friend request to an existing user (by uid).
 * Writes inbox + notification, and emails the invitee when MAIL_API_KEY is available.
 */
export const createFriendRequestAdmin = onCall(
  { region: 'europe-west1', timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req) => {
    try {
      const callerUid = requireAuth(req.auth);
      const fromUid = await resolveFriendActorUid(callerUid, {
        asUid: req.data?.asUid,
        familyId: req.data?.familyId,
      });
      await assertRateLimit(db, {
        key: hashRateKey(['friend-req', callerUid]),
        limit: 40,
        windowMs: 60 * 60 * 1000,
      });
      const toUid = String(req.data?.toUid || '').trim();
      if (!toUid) return { ok: false, error: 'missing-invitee' };
      if (toUid === fromUid) return { ok: false, error: 'cannot-invite-self' };

      const existing = await db.doc(`users/${fromUid}/friends/${toUid}`).get();
      if (existing.exists && existing.data()?.status !== 'removed') {
        return { ok: false, error: 'already-friends' };
      }
      const pending = await db.collection(`users/${toUid}/friendRequests`)
        .where('fromUid', '==', fromUid)
        .where('status', '==', 'pending')
        .limit(1)
        .get();
      if (!pending.empty) return { ok: false, error: 'invite-pending' };

      // Prefer sender's server profile so invitee always sees the real name.
      const sender = await loadPublic(fromUid);
      const clientName = String(req.data?.fromName || '').trim().slice(0, 80);
      const fromName = (sender.name && sender.name !== 'Bruker' ? sender.name : null)
        || clientName
        || 'Noen';
      const fromPhotoURL = sender.photoURL || req.data?.fromPhotoURL || null;
      const fromAvatarId = sender.avatarId || req.data?.fromAvatarId || null;

      const invitee = await loadPublic(toUid);
      const ref = db.collection(`users/${toUid}/friendRequests`).doc();
      const now = FieldValue.serverTimestamp();
      const acceptUrl = `https://www.protop.no/friend-invite/${encodeURIComponent(ref.id)}`;
      const payload = {
        status: 'pending',
        inviteKind: 'existing',
        fromUid,
        fromName,
        fromPhotoURL,
        fromAvatarId,
        toUid,
        toName: invitee.name,
        toUsername: invitee.username || '',
        createdAt: now,
        updatedAt: now,
      };
      const batch = db.batch();
      batch.set(ref, payload);
      batch.set(db.doc(`users/${fromUid}/outgoingFriendRequests/${ref.id}`), {
        ...payload,
        requestId: ref.id,
        inviteeUid: toUid,
      });
      batch.set(db.doc(`users/${toUid}/notifications/friendInvite_${ref.id}`), {
        eventType: 'friendInvite',
        title: 'Venneforespørsel',
        body: `${fromName} vil gjerne bli venn med deg på Weekplan.`,
        requestId: ref.id,
        inviteId: ref.id,
        fromUid,
        createdBy: fromUid,
        createdAt: now,
        seen: false,
        read: false,
      });
      await batch.commit();

      let emailSent = false;
      let emailError = null;
      try {
        const toEmail = await loadContactEmail(toUid);
        const apiKey = await resolveMailApiKey();
        if (toEmail && apiKey) {
          await sendMail(
            apiKey,
            buildFriendInviteMessage({
              to: toEmail,
              name: invitee.name,
              fromName,
              registerUrl: acceptUrl,
              existingUser: true,
            }),
          );
          emailSent = true;
          logger.info('[createFriendRequestAdmin] email sent', {
            to: redactEmail(toEmail),
            requestId: ref.id,
          });
        } else if (toEmail && !apiKey) {
          emailError = 'mail-key-missing';
          logger.warn('[createFriendRequestAdmin] MAIL_API_KEY missing — inbox/notification only');
        }
      } catch (mailErr) {
        emailError = mailErr?.message || 'mail-failed';
        logger.warn('[createFriendRequestAdmin] email failed', { message: emailError });
      }

      return {
        ok: true,
        requestId: ref.id,
        invitee,
        emailSent,
        emailError,
        acceptUrl,
        actorUid: fromUid,
      };
    } catch (error) {
      if (error instanceof HttpsError) return { ok: false, error: error.message };
      logger.error('[createFriendRequestAdmin]', error?.message);
      return { ok: false, error: error?.message || 'failed' };
    }
  },
);

export const respondFriendRequestAdmin = onCall(
  { region: 'europe-west1', timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req) => {
    try {
      const callerUid = requireAuth(req.auth);
      const uid = await resolveFriendActorUid(callerUid, {
        asUid: req.data?.asUid,
        familyId: req.data?.familyId,
      });
      const requestId = String(req.data?.requestId || '').trim();
      const response = String(req.data?.response || '').trim(); // accepted | declined
      if (!requestId || !['accepted', 'declined'].includes(response)) {
        return { ok: false, error: 'bad-params' };
      }
      const ref = db.doc(`users/${uid}/friendRequests/${requestId}`);
      const snap = await ref.get();
      if (!snap.exists) return { ok: false, error: 'not-found' };
      const inv = snap.data() || {};
      if (inv.status && inv.status !== 'pending') return { ok: false, error: 'already-handled' };
      if (inv.toUid && inv.toUid !== uid) return { ok: false, error: 'forbidden' };
      const fromUid = inv.fromUid;
      if (!fromUid) return { ok: false, error: 'invalid-invite' };

      const now = FieldValue.serverTimestamp();
      if (response === 'declined') {
        await ref.update({ status: 'declined', declinedAt: now, updatedAt: now });
        await db.doc(`users/${fromUid}/outgoingFriendRequests/${requestId}`).set({
          status: 'declined', updatedAt: now,
        }, { merge: true });
        return { ok: true, status: 'declined' };
      }

      const [me, them] = await Promise.all([loadPublic(uid), loadPublic(fromUid)]);
      const friendshipId = pairId(uid, fromUid);
      const batch = db.batch();
      batch.set(db.doc(`friendships/${friendshipId}`), {
        memberIds: [uid, fromUid].sort(),
        status: 'active',
        createdAt: now,
        updatedAt: now,
        createdBy: fromUid,
      }, { merge: true });
      batch.set(db.doc(`users/${uid}/friends/${fromUid}`), {
        friendUid: fromUid,
        name: them.name,
        username: them.username || '',
        photoURL: them.photoURL,
        avatarId: them.avatarId,
        role: them.role,
        friendshipId,
        status: 'active',
        addedBy: fromUid,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });
      batch.set(db.doc(`users/${fromUid}/friends/${uid}`), {
        friendUid: uid,
        name: me.name,
        username: me.username || '',
        photoURL: me.photoURL,
        avatarId: me.avatarId,
        role: me.role,
        friendshipId,
        status: 'active',
        addedBy: fromUid,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });
      batch.update(ref, { status: 'accepted', acceptedAt: now, updatedAt: now });
      batch.set(db.doc(`users/${fromUid}/outgoingFriendRequests/${requestId}`), {
        status: 'accepted', updatedAt: now,
      }, { merge: true });
      batch.set(db.doc(`users/${fromUid}/notifications/friendAccepted_${friendshipId}`), {
        eventType: 'friendInviteAccepted',
        title: 'Venneforespørsel godtatt',
        body: `${me.name} godtok venneforespørselen din.`,
        friendUid: uid,
        createdBy: uid,
        createdAt: now,
        seen: false,
        read: false,
      });
      await batch.commit();
      return { ok: true, status: 'accepted', friendshipId, friendUid: fromUid };
    } catch (error) {
      if (error instanceof HttpsError) return { ok: false, error: error.message };
      logger.error('[respondFriendRequestAdmin]', error?.message);
      return { ok: false, error: error?.message || 'failed' };
    }
  },
);

export const sendFriendChatAdmin = onCall(
  { region: 'europe-west1', timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req) => {
    try {
      const senderUid = requireAuth(req.auth);
      const friendUid = String(req.data?.friendUid || '').trim();
      const text = String(req.data?.text || '').trim().slice(0, 4000);
      const senderName = String(req.data?.senderName || '').slice(0, 80);
      if (!friendUid || !text) return { ok: false, error: 'missing-params' };

      const friendDoc = await db.doc(`users/${senderUid}/friends/${friendUid}`).get();
      if (!friendDoc.exists || friendDoc.data()?.status === 'removed') {
        return { ok: false, error: 'not-friends' };
      }

      const chatId = chatIdFor(senderUid, friendUid);
      const chatRef = db.doc(`friendChats/${chatId}`);
      const chatSnap = await chatRef.get();
      if (!chatSnap.exists) {
        await chatRef.set({
          type: 'dm',
          title: 'Chat',
          memberIds: [senderUid, friendUid].sort(),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          createdAtMs: Date.now(),
        });
      }
      const msgRef = await chatRef.collection('messages').add({
        text,
        type: 'text',
        senderId: senderUid,
        senderName,
        createdAt: FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
      });
      await chatRef.update({
        lastText: text.slice(0, 120),
        lastSenderId: senderUid,
        lastAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        unreadStampId: msgRef.id,
        [`unreadCounts.${friendUid}`]: FieldValue.increment(1),
        [`unreadCounts.${senderUid}`]: 0,
      });
      await db.doc(`users/${friendUid}/notifications/friendChat_${msgRef.id}`).set({
        eventType: 'messageReceived',
        title: senderName || 'Melding',
        body: text.slice(0, 80),
        chatId,
        friendChat: true,
        friendUid: senderUid,
        createdBy: senderUid,
        createdAt: FieldValue.serverTimestamp(),
        seen: false,
        read: false,
      });
      return { ok: true, chatId, messageId: msgRef.id };
    } catch (error) {
      logger.error('[sendFriendChatAdmin]', error?.message);
      return { ok: false, error: error?.message || 'failed' };
    }
  },
);

export const listFriendChatMessagesAdmin = onCall(
  { region: 'europe-west1', timeoutSeconds: 20, memory: '256MiB', cors: true },
  async (req) => {
    const uid = requireAuth(req.auth);
    const friendUid = String(req.data?.friendUid || '').trim();
    const chatIdParam = String(req.data?.chatId || '').trim();
    const chatId = chatIdParam || chatIdFor(uid, friendUid);
    if (!chatId) return { ok: false, error: 'missing-params', messages: [] };
    const chatSnap = await db.doc(`friendChats/${chatId}`).get();
    if (!chatSnap.exists) return { ok: true, chatId, messages: [] };
    const members = chatSnap.data()?.memberIds || [];
    if (!members.includes(uid)) return { ok: false, error: 'forbidden', messages: [] };
    const msgs = await chatSnap.ref.collection('messages')
      .orderBy('createdAt', 'asc')
      .limit(100)
      .get();
    return {
      ok: true,
      chatId,
      messages: msgs.docs.map((d) => ({ id: d.id, ...d.data() })),
    };
  },
);

function randomToken(bytes = 20) {
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i += 1) arr[i] = Math.floor(Math.random() * 256);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function assertAreFriends(a, b) {
  const snap = await db.doc(`users/${a}/friends/${b}`).get();
  return snap.exists && snap.data()?.status !== 'removed';
}

/**
 * Invite a brand-new user (not in the app) — creates pending invite + token + outbox.
 * Actual e-post/SMS delivery is via sendFriendInviteV2 / Sms (env MAIL_API_KEY).
 * We always queue an outbox row for QA even if delivery callables are down.
 */
export const createPendingFriendInviteAdmin = onCall(
  { region: 'europe-west1', timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req) => {
    try {
      const callerUid = requireAuth(req.auth);
      const fromUid = await resolveFriendActorUid(callerUid, {
        asUid: req.data?.asUid,
        familyId: req.data?.familyId,
      });
      await assertRateLimit(db, {
        key: hashRateKey(['friend-pending', callerUid]),
        limit: 30,
        windowMs: 60 * 60 * 1000,
      });
      const name = String(req.data?.name || '').slice(0, 80);
      const email = String(req.data?.email || '').trim().toLowerCase();
      const phone = String(req.data?.phone || '').trim();
      const fromName = String(req.data?.fromName || 'Noen').slice(0, 80);
      const fromPhotoURL = req.data?.fromPhotoURL || null;
      const fromAvatarId = req.data?.fromAvatarId || null;
      if (!email && !phone) return { ok: false, error: 'contact-required' };
      if (email && !isValidEmail(email)) return { ok: false, error: 'invalid-email' };

      const token = randomToken(20);
      const pendingRef = db.collection('pendingFriendInvites').doc();
      const outboxRef = db.collection('users').doc(fromUid).collection('outgoingFriendRequests').doc();
      const now = FieldValue.serverTimestamp();
      const payload = {
        status: 'pending',
        inviteKind: 'new',
        fromUid,
        fromName,
        fromPhotoURL,
        fromAvatarId,
        toName: name || (email ? email.split('@')[0] : 'Venn'),
        toEmail: email || '',
        toPhone: phone || '',
        token,
        createdAt: now,
        updatedAt: now,
      };
      const registerUrl = `https://www.protop.no/register?friendInvite=${encodeURIComponent(token)}&email=${encodeURIComponent(email || '')}`;
      const batch = db.batch();
      batch.set(pendingRef, { ...payload, requestId: pendingRef.id });
      batch.set(outboxRef, {
        ...payload,
        requestId: pendingRef.id,
        pendingInviteId: pendingRef.id,
      });
      batch.set(db.doc(`friendInviteTokens/${token}`), {
        pendingInviteId: pendingRef.id,
        fromUid,
        status: 'pending',
        createdAt: now,
      });
      const deliveryId = `out_${pendingRef.id}`;
      batch.set(db.doc(`friendInviteOutbox/${deliveryId}`), {
        pendingInviteId: pendingRef.id,
        fromUid,
        fromName,
        toName: payload.toName,
        toEmail: email || '',
        toPhone: phone || '',
        registerUrl,
        existingUser: false,
        channels: [
          ...(email ? ['email'] : []),
          ...(phone ? ['sms'] : []),
        ],
        status: 'queued',
        deliveryAttempted: false,
        createdAt: now,
      });
      await batch.commit();
      return {
        ok: true,
        requestId: pendingRef.id,
        token,
        registerUrl,
        outboxId: deliveryId,
        existingUser: false,
        emailQueued: !!email,
        smsQueued: !!phone,
        actorUid: fromUid,
      };
    } catch (error) {
      if (error instanceof HttpsError) return { ok: false, error: error.message };
      logger.error('[createPendingFriendInviteAdmin]', error?.message);
      return { ok: false, error: error?.message || 'failed' };
    }
  },
);

/** Claim pending invite after registration — friendship only, never family membership. */
export const claimFriendInviteAdmin = onCall(
  { region: 'europe-west1', timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      const token = String(req.data?.token || '').trim();
      if (!token) return { ok: false, error: 'missing-params' };
      const tokRef = db.doc(`friendInviteTokens/${token}`);
      const tokSnap = await tokRef.get();
      if (!tokSnap.exists) return { ok: false, error: 'not-found' };
      const tok = tokSnap.data() || {};
      if (tok.status !== 'pending') return { ok: false, error: 'already-handled' };
      const pendingId = tok.pendingInviteId;
      if (!pendingId) return { ok: false, error: 'invalid-invite' };

      const pendingRef = db.doc(`pendingFriendInvites/${pendingId}`);
      const pendingSnap = await pendingRef.get();
      if (!pendingSnap.exists) return { ok: false, error: 'not-found' };
      const pending = pendingSnap.data() || {};
      if (pending.status !== 'pending') return { ok: false, error: 'already-handled' };
      const fromUid = pending.fromUid;
      if (!fromUid || fromUid === uid) return { ok: false, error: 'invalid-invite' };

      const [me, them] = await Promise.all([loadPublic(uid), loadPublic(fromUid)]);
      if (req.data?.displayName) me.name = String(req.data.displayName).slice(0, 80);
      const friendshipId = pairId(uid, fromUid);
      const now = FieldValue.serverTimestamp();
      const batch = db.batch();
      batch.set(db.doc(`friendships/${friendshipId}`), {
        memberIds: [uid, fromUid].sort(),
        status: 'active',
        createdAt: now,
        updatedAt: now,
        createdBy: fromUid,
      }, { merge: true });
      batch.set(db.doc(`users/${uid}/friends/${fromUid}`), {
        friendUid: fromUid,
        name: them.name,
        username: them.username || '',
        photoURL: them.photoURL,
        avatarId: them.avatarId,
        role: them.role,
        friendshipId,
        status: 'active',
        addedBy: fromUid,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });
      batch.set(db.doc(`users/${fromUid}/friends/${uid}`), {
        friendUid: uid,
        name: me.name,
        username: me.username || '',
        photoURL: me.photoURL,
        avatarId: me.avatarId,
        role: me.role,
        friendshipId,
        status: 'active',
        addedBy: fromUid,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });
      batch.update(pendingRef, {
        status: 'accepted',
        acceptedBy: uid,
        acceptedAt: now,
        updatedAt: now,
      });
      batch.update(tokRef, {
        status: 'accepted',
        acceptedBy: uid,
        updatedAt: now,
      });
      batch.set(db.doc(`users/${fromUid}/notifications/friendClaimed_${friendshipId}`), {
        eventType: 'friendInviteAccepted',
        title: 'Ny venn',
        body: `${me.name} ble med på Weekplan og er nå vennen din.`,
        friendUid: uid,
        createdBy: uid,
        createdAt: now,
        seen: false,
        read: false,
      });
      await batch.commit();

      // Rights check: never add to inviter family
      const fromUser = await db.doc(`users/${fromUid}`).get();
      const familyIds = fromUser.data()?.familyIds || [];
      return {
        ok: true,
        friendshipId,
        friendUid: fromUid,
        familyIdsUnchanged: true,
        inviterFamilyIds: familyIds,
      };
    } catch (error) {
      if (error instanceof HttpsError) return { ok: false, error: error.message };
      logger.error('[claimFriendInviteAdmin]', error?.message);
      return { ok: false, error: error?.message || 'failed' };
    }
  },
);

/**
 * List albums shared with the signed-in user (Admin — reliable under App Check / rules lag).
 */
export const listSharedAlbumsAdmin = onCall(
  { region: 'europe-west1', timeoutSeconds: 20, memory: '256MiB', cors: true },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      const snap = await db.collection(`users/${uid}/sharedAlbums`).get();
      const albums = snap.docs.map((d) => ({ id: d.id, albumId: d.id, ...d.data() }));
      albums.sort((a, b) => {
        const at = a.sharedAt?.toMillis?.() || a.sharedAt?._seconds || 0;
        const bt = b.sharedAt?.toMillis?.() || b.sharedAt?._seconds || 0;
        return bt - at;
      });
      return { ok: true, albums };
    } catch (error) {
      logger.error('[listSharedAlbumsAdmin]', error?.message);
      return { ok: false, error: error?.message || 'failed', albums: [] };
    }
  },
);

/**
 * List wishlists shared with the signed-in user (Admin — same reliability as albums).
 */
export const listSharedWishlistsAdmin = onCall(
  { region: 'europe-west1', timeoutSeconds: 20, memory: '256MiB', cors: true },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      const snap = await db.collection(`users/${uid}/sharedWishlists`).get();
      const wishlists = snap.docs.map((d) => ({ id: d.id, listId: d.id, ...d.data() }));
      wishlists.sort((a, b) => {
        const at = a.sharedAt?.toMillis?.() || a.sharedAt?._seconds || 0;
        const bt = b.sharedAt?.toMillis?.() || b.sharedAt?._seconds || 0;
        return bt - at;
      });
      return { ok: true, wishlists };
    } catch (error) {
      logger.error('[listSharedWishlistsAdmin]', error?.message);
      return { ok: false, error: error?.message || 'failed', wishlists: [] };
    }
  },
);

/**
 * Share album / wishlist / document folder / shopping list / calendar event with friends (peer pointers only).
 */
export const shareWithFriendsAdmin = onCall(
  { region: 'europe-west1', timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req) => {
    try {
      const ownerUid = requireAuth(req.auth);
      const kind = String(req.data?.kind || '').trim(); // album | wishlist | document | event | shopping
      const friendUids = Array.isArray(req.data?.friendUids)
        ? req.data.friendUids.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
      const familyId = String(req.data?.familyId || '').trim();
      if (!kind || !friendUids.length) return { ok: false, error: 'missing-params' };

      const shared = [];
      const skipped = [];
      const now = FieldValue.serverTimestamp();
      for (const fid of friendUids) {
        if (fid === ownerUid) continue;
        const okFriend = await assertAreFriends(ownerUid, fid);
        if (!okFriend) {
          skipped.push({ fid, reason: 'not-friends' });
          continue;
        }
        if (kind === 'album') {
          const albumId = String(req.data?.albumId || '').trim();
          if (!albumId) return { ok: false, error: 'missing-album' };
          const title = String(req.data?.title || 'Album').slice(0, 120);
          await db.doc(`users/${fid}/sharedAlbums/${albumId}`).set({
            familyId: familyId || null,
            albumId,
            title,
            sharedBy: ownerUid,
            sharedAt: now,
            kind: 'album',
          }, { merge: true });
          await db.doc(`users/${fid}/notifications/sharedAlbum_${albumId}`).set({
            eventType: 'albumShared',
            title: 'Album delt med deg',
            body: `${title} er delt med deg.`,
            familyId: familyId || null,
            albumId,
            createdBy: ownerUid,
            createdAt: now,
            seen: false,
            read: false,
          }, { merge: true });
          shared.push(fid);
        } else if (kind === 'wishlist') {
          const listId = String(req.data?.listId || '').trim();
          if (!listId) return { ok: false, error: 'missing-list' };
          const title = String(req.data?.title || 'Ønskeliste').slice(0, 120);
          const sharedByName = String(req.data?.sharedByName || '').trim().slice(0, 80) || null;
          await db.doc(`users/${fid}/sharedWishlists/${listId}`).set({
            familyId: familyId || null,
            listId,
            title,
            sharedBy: ownerUid,
            sharedByName,
            sharedAt: now,
            kind: 'wishlist',
          }, { merge: true });
          await db.doc(`users/${fid}/notifications/sharedWishlist_${listId}`).set({
            eventType: 'wishShared',
            title: 'Ønskeliste delt',
            body: sharedByName
              ? `${sharedByName} delte «${title}» med deg.`
              : `${title} er delt med deg.`,
            familyId: familyId || null,
            listId,
            createdBy: ownerUid,
            createdAt: now,
            seen: false,
            read: false,
          }, { merge: true });
          shared.push(fid);
        } else if (kind === 'document') {
          const folderId = String(req.data?.folderId || '').trim();
          if (!folderId) return { ok: false, error: 'missing-folder' };
          await db.doc(`users/${fid}/sharedDocuments/${folderId}`).set({
            familyId: familyId || null,
            folderId,
            name: String(req.data?.name || 'Mappe').slice(0, 120),
            sharedBy: ownerUid,
            sharedAt: now,
            kind: 'document',
          }, { merge: true });
          shared.push(fid);
        } else if (kind === 'shopping') {
          const listId = String(req.data?.listId || '').trim();
          if (!listId) return { ok: false, error: 'missing-list' };
          const title = String(req.data?.title || req.data?.name || 'Handleliste').slice(0, 120);
          const sharedByName = String(req.data?.sharedByName || '').trim().slice(0, 80) || null;
          await db.doc(`users/${fid}/sharedShoppingLists/${listId}`).set({
            familyId: familyId || null,
            listId,
            title,
            name: title,
            sharedBy: ownerUid,
            sharedByName,
            sharedAt: now,
            kind: 'shopping',
          }, { merge: true });
          await db.doc(`users/${fid}/notifications/sharedShopping_${listId}`).set({
            eventType: 'shoppingShared',
            title: 'Handleliste delt',
            body: sharedByName
              ? `${sharedByName} delte «${title}» med deg.`
              : `${title} er delt med deg.`,
            familyId: familyId || null,
            listId,
            createdBy: ownerUid,
            createdAt: now,
            seen: false,
            read: false,
          }, { merge: true });
          shared.push(fid);
        } else if (kind === 'event') {
          const eventId = String(req.data?.eventId || '').trim();
          if (!eventId) return { ok: false, error: 'missing-event' };
          await db.doc(`users/${fid}/sharedEvents/${eventId}`).set({
            familyId: familyId || null,
            eventId,
            title: String(req.data?.title || 'Kalenderhendelse').slice(0, 120),
            startsAt: req.data?.startsAt || null,
            sharedBy: ownerUid,
            sharedAt: now,
            status: 'pending',
            kind: 'event',
          }, { merge: true });
          await db.doc(`users/${fid}/notifications/friendEvent_${eventId}`).set({
            eventType: 'eventCreated',
            title: 'Kalenderinvitasjon',
            body: `${String(req.data?.title || 'En hendelse').slice(0, 80)} er delt med deg.`,
            familyId: familyId || null,
            eventId,
            createdBy: ownerUid,
            createdAt: now,
            seen: false,
            read: false,
          }, { merge: true });
          shared.push(fid);
        } else {
          return { ok: false, error: 'bad-kind' };
        }
      }
      return { ok: true, kind, shared, skipped };
    } catch (error) {
      logger.error('[shareWithFriendsAdmin]', error?.message);
      return { ok: false, error: error?.message || 'failed' };
    }
  },
);

/**
 * Friend accepts/declines a game invite without needing family membership rules.
 * On accept: seats the player (player2 / playerO / …) and sets status to playing
 * so the game actually starts — not only inviteStatus.
 */
export const respondFriendGameInviteAdmin = onCall(
  { region: 'europe-west1', timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      const familyId = String(req.data?.familyId || '').trim();
      const gameType = String(req.data?.gameType || '').trim();
      const gameId = String(req.data?.gameId || '').trim();
      const response = String(req.data?.response || '').trim();
      const displayName = String(req.data?.name || '').trim().slice(0, 80) || 'Spiller';
      const colName = String(req.data?.collection || '').trim();
      if (!familyId || !gameId || !['accepted', 'declined'].includes(response)) {
        return { ok: false, error: 'bad-params' };
      }
      const col = colName || ({
        memory: 'memoryGames',
        ttt: 'tttGames',
        rps: 'rpsGames',
        guess: 'guessGames',
        draw: 'drawGuessGames',
        connect4: 'connect4Games',
        chess: 'chessGames',
        quiz: 'quizGames',
      })[gameType];
      if (!col) return { ok: false, error: 'unknown-game' };

      const ref = db.doc(`families/${familyId}/${col}/${gameId}`);
      const snap = await ref.get();
      if (!snap.exists) return { ok: false, error: 'not-found' };
      const data = snap.data() || {};
      const invited = data.invitedUids || [];
      if (!invited.includes(uid) && data.hostUid !== uid) {
        return { ok: false, error: 'not-invited' };
      }
      if (data.hostUid && data.hostUid !== uid) {
        const friends = await assertAreFriends(uid, data.hostUid);
        if (!friends) {
          // Same-family invitees are allowed even without a friend edge / inbox doc.
          const famSnap = await db.doc(`families/${familyId}`).get();
          const members = Array.isArray(famSnap.data()?.members) ? famSnap.data().members : [];
          let isFamily = members.includes(uid);
          if (!isFamily) {
            const parentSnap = await db.doc(`families/${familyId}/parents/${uid}`).get();
            const p = parentSnap.exists ? parentSnap.data() : null;
            isFamily = !!(p && p.deleted !== true && p.active !== false);
          }
          if (!isFamily) {
            const inbox = await db.doc(`users/${uid}/gameInvites/${gameType}_${gameId}`).get();
            if (!inbox.exists) return { ok: false, error: 'not-friends' };
          }
        }
      }

      const now = FieldValue.serverTimestamp();
      const patch = {
        [`inviteStatus.${uid}`]: response,
        updatedAt: now,
      };

      if (response === 'accepted') {
        const seat = { uid, name: displayName };
        if (gameType === 'memory' || gameType === 'connect4') {
          if (data.player1?.uid !== uid && !data.player2) {
            patch.player2 = seat;
            if (data.status === 'waiting' || !data.status) patch.status = 'playing';
          }
        } else if (gameType === 'ttt') {
          if (data.playerX?.uid !== uid && !data.playerO) {
            patch.playerO = seat;
            if (data.status === 'waiting' || !data.status) patch.status = 'playing';
          }
        } else if (gameType === 'chess') {
          if (data.playerWhite?.uid !== uid && !data.playerBlack) {
            patch.playerBlack = seat;
            if (data.status === 'waiting' || !data.status) patch.status = 'playing';
          }
        } else if (gameType === 'draw') {
          if (data.status === 'waiting') patch.status = 'drawing';
        } else if (gameType === 'rps' || gameType === 'guess' || gameType === 'quiz') {
          // Multi-player via players subcollection
          await db.doc(`families/${familyId}/${col}/${gameId}/players/${uid}`).set({
            uid,
            name: displayName,
            score: 0,
            joinedAt: now,
            updatedAt: now,
          }, { merge: true });
        }
      }

      await ref.update(patch);
      const inboxId = `${gameType || 'game'}_${gameId}`;
      await db.doc(`users/${uid}/gameInvites/${inboxId}`).set({
        status: response,
        familyId,
        gameId,
        gameType,
        updatedAt: now,
        ...(response === 'accepted' ? { acceptedAt: now } : {}),
        ...(response === 'declined' ? { declinedAt: now } : {}),
      }, { merge: true });
      return { ok: true, familyId, gameId, gameType, response };
    } catch (error) {
      logger.error('[respondFriendGameInviteAdmin]', error?.message);
      return { ok: false, error: error?.message || 'failed' };
    }
  },
);

/**
 * Host notifies invitees (esp. friends) via Admin — inbox + notification.
 * Used when client writes to users/{friend}/gameInvites fail or as primary path.
 */
export const notifyFriendGameInvitesAdmin = onCall(
  { region: 'europe-west1', timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req) => {
    try {
      const hostUid = requireAuth(req.auth);
      const familyId = String(req.data?.familyId || '').trim();
      const gameId = String(req.data?.gameId || '').trim();
      const gameType = String(req.data?.gameType || '').trim();
      const gameTitle = String(req.data?.gameTitle || 'familiespill').slice(0, 80);
      const hostName = String(req.data?.hostName || 'Noen').slice(0, 80);
      const invitedUids = Array.isArray(req.data?.invitedUids)
        ? req.data.invitedUids.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
      if (!familyId || !gameId || !gameType || !invitedUids.length) {
        return { ok: false, error: 'bad-params' };
      }
      const now = FieldValue.serverTimestamp();
      let notified = 0;
      for (const inviteeUid of invitedUids) {
        if (inviteeUid === hostUid) continue;
        const inboxId = `${gameType}_${gameId}`;
        await db.doc(`users/${inviteeUid}/gameInvites/${inboxId}`).set({
          status: 'pending',
          inviteKind: 'game',
          inviteeUid,
          familyId,
          gameId,
          gameType,
          hostUid,
          hostName,
          gameTitle,
          createdAt: now,
          updatedAt: now,
        }, { merge: true });
        await db.doc(`users/${inviteeUid}/notifications/gameInvite_${gameType}_${gameId}`).set({
          eventType: 'gameInvite',
          title: 'Spillinvitasjon',
          body: `${hostName} inviterer deg til ${gameTitle}. Godta eller avslå.`,
          familyId,
          gameId,
          gameType,
          createdBy: hostUid,
          createdAt: now,
          seen: false,
          read: false,
        }, { merge: true });
        notified += 1;
      }
      return { ok: true, notified };
    } catch (error) {
      logger.error('[notifyFriendGameInvitesAdmin]', error?.message);
      return { ok: false, error: error?.message || 'failed' };
    }
  },
);

export { isValidEmail };
