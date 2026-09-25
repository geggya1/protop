/**
 * Person-til-person venner — uavhengig av familieplattform.
 * En venn får ALDRI automatisk medlemskap eller tilgang til familien.
 */
import {
  collection, collectionGroup, doc, writeBatch, serverTimestamp, updateDoc, getDoc, getDocs,
  setDoc, deleteDoc, query, where, limit, onSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { classifyInviteIdentifier, inviteLookupCandidates } from './inviteIdentifiers';
import { hasContactInfo, isValidEmail } from './account';
import { normalizePhone, hasValidPhone } from './phone';
import { normalizeUsername } from './usernames';
import { notifyUsers } from './notifications';
import { listenAfterAccess, warnPermissionOnce } from './firestoreAccess';

async function callFriendFn(name, data) {
  const fn = httpsCallable(functions, name);
  const res = await fn(data || {});
  return res?.data || {};
}

import { friendshipPairId, friendChatId, friendInviteAcceptUrl } from './friendsLogic';

export { friendshipPairId, friendChatId, friendInviteAcceptUrl };

function randomToken(bytes = 16) {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i += 1) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function loadPublicProfile(uid) {
  if (!uid) return null;
  try {
    const [userSnap, parentSnap, childSnap] = await Promise.all([
      getDoc(doc(db, 'users', uid)),
      getDoc(doc(db, 'parents', uid)),
      getDoc(doc(db, 'children', uid)),
    ]);
    const u = userSnap.exists() ? (userSnap.data() || {}) : {};
    const p = parentSnap.exists() ? (parentSnap.data() || {}) : {};
    const c = childSnap.exists() ? (childSnap.data() || {}) : {};
    const merged = { ...c, ...p, ...u };
    return {
      uid,
      name: merged.displayName || merged.name || merged.username || 'Bruker',
      username: merged.username || '',
      usernameLower: merged.usernameLower || normalizeUsername(merged.username || ''),
      photoURL: merged.photoURL || merged.photoUrl || null,
      avatarId: merged.avatarId || null,
      email: '',
      phone: '',
      role: merged.role === 'child' || merged.type === 'child' || childSnap.exists() ? 'child' : 'adult',
    };
  } catch {
    return { uid, name: 'Bruker', username: '', photoURL: null, avatarId: null, email: '', phone: '', role: 'adult' };
  }
}

/** Finn eksisterende bruker (voksen ELLER barn) for venneinvitasjon. */
export async function findExistingUserForFriend(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return null;
  const classified = classifyInviteIdentifier(raw);

  try {
    const fn = httpsCallable(functions, 'lookupFriendProfile');
    const lookupValue = classified.kind === 'phone'
      ? (classified.value || raw)
      : (classified.kind === 'email' ? classified.value : raw);
    const res = await fn({ identifier: lookupValue });
    if (res?.data?.ok && res.data.profile?.uid) return res.data.profile;
    if (res?.data?.ok) {
      // Fall through for username client fallback
    }
  } catch {
    /* fall through */
  }

  // Username client fallback (inkl. barn)
  const u = classified.kind === 'username' ? classified.value : normalizeUsername(raw);
  if (!u || u.length < 3) {
    // Adult-only server lookup already tried; email/phone without server = nothing
    if (classified.kind === 'email' || classified.kind === 'phone') return null;
    return null;
  }
  try {
    const unameSnap = await getDoc(doc(db, 'usernames', u));
    if (!unameSnap.exists()) return null;
    const data = unameSnap.data() || {};
    const uid = data.uid;
    if (!uid) return null;
    return {
      uid,
      email: '',
      username: data.username || u,
      usernameLower: u,
      name: data.username || u,
      phone: '',
      photoURL: null,
      avatarId: null,
      role: data.type === 'child' ? 'child' : 'adult',
    };
  } catch {
    return null;
  }
}

/**
 * Inviter eksisterende bruker som venn (peer — ikke familie).
 */
export async function inviteExistingFriend({
  fromUid,
  fromName = '',
  fromPhotoURL = null,
  fromAvatarId = null,
  identifier,
  inviteeUid: inviteeUidHint,
  deliveryEmail,
  deliveryPhone,
  email,
  phone,
  asUid = null,
  familyId = null,
}) {
  if (!fromUid) throw new Error('missing-params');

  let invitee = null;
  if (inviteeUidHint) invitee = await loadPublicProfile(inviteeUidHint);
  if (!invitee?.uid && identifier) {
    invitee = await findExistingUserForFriend(identifier);
  }
  if (!invitee?.uid) throw new Error('user-not-found');
  if (invitee.uid === fromUid) throw new Error('cannot-invite-self');

  // Do not read friends/friendRequests on the client — rules often deny these
  // (or are not yet deployed). createFriendRequestAdmin enforces already-friends
  // and invite-pending.

  const emailForDelivery = (() => {
    const typed = String(deliveryEmail || email || '').trim().toLowerCase();
    if (typed && isValidEmail(typed)) return typed;
    return '';
  })();
  const phoneForDelivery = (() => {
    const typed = normalizePhone(deliveryPhone || phone || '') || String(deliveryPhone || phone || '').trim();
    if (hasValidPhone(typed)) return typed;
    return '';
  })();

  const now = serverTimestamp();
  const requestRef = doc(collection(db, 'users', invitee.uid, 'friendRequests'));
  const token = randomToken();
  const payload = {
    status: 'pending',
    inviteKind: 'existing',
    fromUid,
    fromName: fromName || 'Noen',
    fromPhotoURL: fromPhotoURL || null,
    fromAvatarId: fromAvatarId || null,
    toUid: invitee.uid,
    toName: invitee.name || '',
    toUsername: invitee.username || '',
    toEmail: emailForDelivery,
    toPhone: phoneForDelivery,
    token,
    createdAt: now,
    updatedAt: now,
  };

  // Prefer Admin callable (works without new Firestore client rules).
  let requestId = requestRef.id;
  let usedAdmin = false;
  let adminEmailSent = false;
  let adminEmailError = null;
  const actorAsUid = String(asUid || '').trim();
  try {
    const adminRes = await callFriendFn('createFriendRequestAdmin', {
      toUid: invitee.uid,
      fromName: fromName || 'Noen',
      fromPhotoURL,
      fromAvatarId,
      ...(actorAsUid ? { asUid: actorAsUid, familyId: familyId || null } : {}),
    });
    if (adminRes?.ok && adminRes.requestId) {
      requestId = adminRes.requestId;
      usedAdmin = true;
      adminEmailSent = !!adminRes.emailSent;
      adminEmailError = adminRes.emailError || null;
    } else if (adminRes?.error === 'already-friends') {
      throw new Error('already-friends');
    } else if (adminRes?.error === 'invite-pending') {
      throw new Error('invite-pending');
    } else if (adminRes?.error === 'cannot-invite-self') {
      throw new Error('cannot-invite-self');
    } else if (adminRes?.error === 'missing-invitee') {
      throw new Error('user-not-found');
    } else if (!adminRes?.ok) {
      throw new Error(adminRes?.error || 'invite-failed');
    }
  } catch (err) {
    if (['already-friends', 'invite-pending', 'cannot-invite-self', 'user-not-found'].includes(err?.message)) {
      throw err;
    }
    if (usedAdmin) throw err;
    // Callable unreachable — best-effort client write when rules allow.
    try {
      const batch = writeBatch(db);
      batch.set(requestRef, payload);
      batch.set(doc(db, 'users', fromUid, 'outgoingFriendRequests', requestRef.id), {
        ...payload,
        requestId: requestRef.id,
        inviteeUid: invitee.uid,
      });
      await batch.commit();
      await notifyUsers([invitee.uid], {
        eventType: 'friendInvite',
        title: 'Venneforespørsel',
        body: `${fromName || 'Noen'} vil gjerne bli venn med deg på ProTop.`,
        requestId: requestRef.id,
        fromUid,
        createdBy: fromUid,
        notificationId: `friendInvite_${requestRef.id}`,
      }).catch(() => {});
      requestId = requestRef.id;
    } catch (writeErr) {
      throw new Error(writeErr?.message || err?.message || 'invite-failed');
    }
  }

  const acceptUrl = friendInviteAcceptUrl({ requestId, token });
  let emailSent = adminEmailSent;
  let emailError = adminEmailError;
  let smsSent = false;
  let smsError = null;

  // Admin already emails the invitee's registered address. Only send again if
  // the user typed a different delivery email on the form.
  if (emailForDelivery && !adminEmailSent) {
    try {
      await sendFriendInviteMail({
        email: emailForDelivery,
        name: invitee.name,
        fromName,
        registerUrl: acceptUrl,
        existingUser: true,
      });
      emailSent = true;
    } catch (err) {
      emailError = err?.message || 'Kunne ikke sende e-post';
    }
  }
  if (phoneForDelivery) {
    try {
      await sendFriendInviteSms({
        phone: phoneForDelivery,
        name: invitee.name,
        fromName,
        registerUrl: acceptUrl,
        existingUser: true,
      });
      smsSent = true;
    } catch (err) {
      smsError = err?.message || 'Kunne ikke sende SMS';
    }
  }

  return {
    requestId,
    invitee,
    existingUser: true,
    emailSent,
    emailError,
    smsSent,
    smsError,
    inviteStatus: 'pending',
  };
}

/**
 * Inviter ny bruker (ikke i appen) via e-post og/eller SMS med registreringslenke.
 */
export async function inviteNewFriend({
  fromUid,
  fromName = '',
  fromPhotoURL = null,
  fromAvatarId = null,
  name = '',
  email = '',
  phone = '',
  asUid = null,
  familyId = null,
}) {
  if (!fromUid) throw new Error('missing-params');
  const emailNorm = String(email || '').trim().toLowerCase();
  const phoneNorm = normalizePhone(phone) || String(phone || '').trim();
  if (!hasContactInfo(emailNorm, phoneNorm)) throw new Error('contact-required');
  if (emailNorm && !isValidEmail(emailNorm)) throw new Error('invalid-email');
  const actorAsUid = String(asUid || '').trim();

  // If they already exist, route to existing flow
  for (const lookup of inviteLookupCandidates({ email: emailNorm, phone: phoneNorm })) {
    const existing = await findExistingUserForFriend(lookup);
    if (existing?.uid) {
      return inviteExistingFriend({
        fromUid,
        fromName,
        fromPhotoURL,
        fromAvatarId,
        inviteeUid: existing.uid,
        deliveryEmail: emailNorm,
        deliveryPhone: phoneNorm,
        asUid: actorAsUid || null,
        familyId,
      });
    }
  }

  // Prefer Admin callable (works without new Firestore client rules).
  let requestId = null;
  let token = null;
  let registerUrl = null;
  let toName = name || (emailNorm ? emailNorm.split('@')[0] : 'Venn');
  try {
    const adminRes = await callFriendFn('createPendingFriendInviteAdmin', {
      name: toName,
      email: emailNorm,
      phone: hasValidPhone(phoneNorm) ? phoneNorm : phoneNorm,
      fromName: fromName || 'Noen',
      fromPhotoURL,
      fromAvatarId,
      ...(actorAsUid ? { asUid: actorAsUid, familyId: familyId || null } : {}),
    });
    if (adminRes?.ok) {
      requestId = adminRes.requestId;
      token = adminRes.token;
      registerUrl = adminRes.registerUrl;
    }
  } catch {
    /* fall through to client write */
  }

  if (!requestId || !token) {
    const now = serverTimestamp();
    token = randomToken(20);
    const pendingRef = doc(collection(db, 'pendingFriendInvites'));
    const outboxRef = doc(collection(db, 'users', fromUid, 'outgoingFriendRequests'));
    const payload = {
      status: 'pending',
      inviteKind: 'new',
      fromUid,
      fromName: fromName || 'Noen',
      fromPhotoURL: fromPhotoURL || null,
      fromAvatarId: fromAvatarId || null,
      toName,
      toEmail: emailNorm || '',
      toPhone: hasValidPhone(phoneNorm) ? phoneNorm : '',
      token,
      createdAt: now,
      updatedAt: now,
    };
    const batch = writeBatch(db);
    batch.set(pendingRef, { ...payload, requestId: pendingRef.id });
    batch.set(outboxRef, { ...payload, requestId: pendingRef.id, pendingInviteId: pendingRef.id });
    batch.set(doc(db, 'friendInviteTokens', token), {
      pendingInviteId: pendingRef.id,
      fromUid,
      status: 'pending',
      createdAt: now,
    });
    await batch.commit();
    requestId = pendingRef.id;
    registerUrl = `https://www.protop.no/register?friendInvite=${encodeURIComponent(token)}&email=${encodeURIComponent(emailNorm || '')}`;
  }

  if (!registerUrl) {
    registerUrl = `https://www.protop.no/register?friendInvite=${encodeURIComponent(token)}&email=${encodeURIComponent(emailNorm || '')}`;
  }

  let emailSent = false;
  let emailError = null;
  let smsSent = false;
  let smsError = null;
  let emailQueued = !!emailNorm;
  let smsQueued = hasValidPhone(phoneNorm);

  if (emailNorm) {
    try {
      await sendFriendInviteMail({
        email: emailNorm,
        name: toName,
        fromName,
        registerUrl,
        existingUser: false,
      });
      emailSent = true;
    } catch (err) {
      emailError = err?.message || 'Kunne ikke sende e-post';
    }
  }
  if (hasValidPhone(phoneNorm)) {
    try {
      await sendFriendInviteSms({
        phone: phoneNorm,
        name: toName,
        fromName,
        registerUrl,
        existingUser: false,
      });
      smsSent = true;
    } catch (err) {
      smsError = err?.message || 'Kunne ikke sende SMS';
    }
  }

  return {
    requestId,
    token,
    existingUser: false,
    emailSent,
    emailError,
    smsSent,
    smsError,
    emailQueued,
    smsQueued,
    registerUrl,
    inviteStatus: 'pending',
  };
}

/** Smart invite: eksisterende bruker → forespørsel; ellers ny via e-post/SMS. */
export async function inviteFriendSmart(params) {
  const {
    fromUid, fromName, fromPhotoURL, fromAvatarId,
    email, phone, username, identifier, name,
    asUid, familyId,
  } = params || {};
  const candidates = inviteLookupCandidates({ email, phone, identifier, username });

  for (const lookup of candidates) {
    const existing = await findExistingUserForFriend(lookup);
    if (existing?.uid) {
      return inviteExistingFriend({
        fromUid,
        fromName,
        fromPhotoURL,
        fromAvatarId,
        identifier: lookup,
        inviteeUid: existing.uid,
        deliveryEmail: email,
        deliveryPhone: phone,
        asUid,
        familyId,
      });
    }
  }

  const onlyUsername = candidates.length > 0
    && candidates.every((c) => classifyInviteIdentifier(c).kind === 'username')
    && !hasContactInfo(email, phone);
  if (onlyUsername) throw new Error('user-not-found');
  if (!hasContactInfo(email, phone)) throw new Error('contact-required');

  return inviteNewFriend({
    fromUid,
    fromName,
    fromPhotoURL,
    fromAvatarId,
    name: name || '',
    email,
    phone,
    asUid,
    familyId,
  });
}

export async function sendFriendInviteMail({
  email, name = '', fromName = '', registerUrl, existingUser = false,
}) {
  const fn = httpsCallable(functions, 'sendFriendInviteV2');
  const res = await fn({
    email,
    name,
    fromName,
    registerUrl,
    inviteLink: registerUrl,
    existingUser: !!existingUser,
  });
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Kunne ikke sende invitasjon');
  return res.data;
}

export async function sendFriendInviteSms({
  phone, name = '', fromName = '', registerUrl, existingUser = false,
}) {
  const fn = httpsCallable(functions, 'sendFriendInviteSmsV2');
  const res = await fn({
    phone,
    name,
    fromName,
    registerUrl,
    existingUser: !!existingUser,
  });
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Kunne ikke sende SMS-invitasjon');
  return res.data;
}

function friendDocPayload(profile, friendshipId, fromUid) {
  return {
    friendUid: profile.uid,
    name: profile.name || 'Venn',
    username: profile.username || '',
    photoURL: profile.photoURL || null,
    avatarId: profile.avatarId || null,
    role: profile.role || 'adult',
    friendshipId,
    status: 'active',
    addedBy: fromUid || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

/** Godta venneforespørsel — oppretter speilet vennskap, IKKE familiemedlemskap. */
export async function acceptFriendRequest({
  uid, requestId, request, asUid = null, familyId = null,
}) {
  if (!uid || !requestId) throw new Error('missing-params');
  let inv = request;
  if (!inv) {
    const snap = await getDoc(doc(db, 'users', uid, 'friendRequests', requestId));
    if (!snap.exists()) throw new Error('not-found');
    inv = { id: snap.id, ...snap.data() };
  }
  if (inv.status && inv.status !== 'pending') throw new Error('already-handled');
  if (inv.toUid && inv.toUid !== uid) throw new Error('forbidden');

  const fromUid = inv.fromUid;
  if (!fromUid) throw new Error('invalid-invite');
  const actorAsUid = String(asUid || '').trim();

  // Prefer Admin callable (works without new client rules).
  try {
    const adminRes = await callFriendFn('respondFriendRequestAdmin', {
      requestId,
      response: 'accepted',
      ...(actorAsUid ? { asUid: actorAsUid, familyId: familyId || null } : {}),
    });
    if (adminRes?.ok) {
      return { friendshipId: adminRes.friendshipId || friendshipPairId(uid, fromUid), friendUid: fromUid };
    }
    if (adminRes?.error === 'already-handled') throw new Error('already-handled');
    if (adminRes?.error === 'forbidden') throw new Error('forbidden');
  } catch (err) {
    if (['already-handled', 'forbidden'].includes(err?.message)) throw err;
  }

  const [me, them] = await Promise.all([
    loadPublicProfile(uid),
    loadPublicProfile(fromUid),
  ]);
  const pairId = friendshipPairId(uid, fromUid);
  const now = serverTimestamp();

  const batch = writeBatch(db);
  batch.set(doc(db, 'friendships', pairId), {
    memberIds: [uid, fromUid].sort(),
    status: 'active',
    createdAt: now,
    updatedAt: now,
    createdBy: fromUid,
  }, { merge: true });
  batch.set(doc(db, 'users', uid, 'friends', fromUid), friendDocPayload(them || { uid: fromUid }, pairId, fromUid), { merge: true });
  batch.set(doc(db, 'users', fromUid, 'friends', uid), friendDocPayload(me || { uid }, pairId, fromUid), { merge: true });
  batch.update(doc(db, 'users', uid, 'friendRequests', requestId), {
    status: 'accepted',
    acceptedAt: now,
    updatedAt: now,
  });
  try {
    batch.set(doc(db, 'users', fromUid, 'outgoingFriendRequests', requestId), {
      status: 'accepted',
      updatedAt: now,
    }, { merge: true });
  } catch { /* ignore */ }
  await batch.commit();

  await notifyUsers([fromUid], {
    eventType: 'friendInviteAccepted',
    title: 'Venneforespørsel godtatt',
    body: `${me?.name || 'Noen'} godtok venneforespørselen din.`,
    friendUid: uid,
    createdBy: uid,
    notificationId: `friendAccepted_${pairId}`,
  }).catch(() => {});

  return { friendshipId: pairId, friendUid: fromUid };
}

export async function declineFriendRequest({
  uid, requestId, asUid = null, familyId = null,
}) {
  if (!uid || !requestId) throw new Error('missing-params');
  const ref = doc(db, 'users', uid, 'friendRequests', requestId);
  const snap = await getDoc(ref).catch(() => null);
  const inv = snap?.exists?.() ? (snap.data() || {}) : {};
  if (inv.status && inv.status !== 'pending') throw new Error('already-handled');
  if (inv.toUid && inv.toUid !== uid) throw new Error('forbidden');
  const actorAsUid = String(asUid || '').trim();

  try {
    const adminRes = await callFriendFn('respondFriendRequestAdmin', {
      requestId,
      response: 'declined',
      ...(actorAsUid ? { asUid: actorAsUid, familyId: familyId || null } : {}),
    });
    if (adminRes?.ok) return;
    if (adminRes?.error === 'already-handled') throw new Error('already-handled');
    if (adminRes?.error === 'forbidden') throw new Error('forbidden');
    if (adminRes?.error === 'not-found') throw new Error('not-found');
  } catch (err) {
    if (['already-handled', 'forbidden', 'not-found'].includes(err?.message)) throw err;
  }

  if (!snap?.exists?.()) throw new Error('not-found');
  await updateDoc(ref, {
    status: 'declined',
    declinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (inv.fromUid) {
    await setDoc(doc(db, 'users', inv.fromUid, 'outgoingFriendRequests', requestId), {
      status: 'declined',
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});
  }
}

/**
 * Claim pending invite after new-user registration (token from e-post/SMS).
 * Creates friendship with the inviter only — never joins their family.
 */
export async function claimPendingFriendInvite({ uid, token, profile }) {
  if (!uid || !token) throw new Error('missing-params');

  try {
    const adminRes = await callFriendFn('claimFriendInviteAdmin', {
      token,
      displayName: profile?.displayName || profile?.name || '',
    });
    if (adminRes?.ok) {
      return { friendshipId: adminRes.friendshipId, friendUid: adminRes.friendUid };
    }
    if (adminRes?.error === 'already-handled') throw new Error('already-handled');
    if (adminRes?.error === 'not-found') throw new Error('not-found');
    if (adminRes?.error === 'invalid-invite') throw new Error('invalid-invite');
  } catch (err) {
    if (['already-handled', 'not-found', 'invalid-invite'].includes(err?.message)) throw err;
  }

  const tokSnap = await getDoc(doc(db, 'friendInviteTokens', token));
  if (!tokSnap.exists()) throw new Error('not-found');
  const tok = tokSnap.data() || {};
  if (tok.status !== 'pending') throw new Error('already-handled');
  const pendingId = tok.pendingInviteId;
  if (!pendingId) throw new Error('invalid-invite');

  const pendingSnap = await getDoc(doc(db, 'pendingFriendInvites', pendingId));
  if (!pendingSnap.exists()) throw new Error('not-found');
  const pending = pendingSnap.data() || {};
  if (pending.status !== 'pending') throw new Error('already-handled');
  const fromUid = pending.fromUid;
  if (!fromUid || fromUid === uid) throw new Error('invalid-invite');

  const me = {
    uid,
    name: profile?.displayName || profile?.name || pending.toName || 'Venn',
    username: profile?.username || '',
    photoURL: profile?.photoURL || null,
    avatarId: profile?.avatarId || null,
    role: profile?.role === 'child' ? 'child' : 'adult',
  };
  const them = await loadPublicProfile(fromUid);
  const pairId = friendshipPairId(uid, fromUid);
  const now = serverTimestamp();

  const batch = writeBatch(db);
  batch.set(doc(db, 'friendships', pairId), {
    memberIds: [uid, fromUid].sort(),
    status: 'active',
    createdAt: now,
    updatedAt: now,
    createdBy: fromUid,
  }, { merge: true });
  batch.set(doc(db, 'users', uid, 'friends', fromUid), friendDocPayload(them || { uid: fromUid }, pairId, fromUid), { merge: true });
  batch.set(doc(db, 'users', fromUid, 'friends', uid), friendDocPayload(me, pairId, fromUid), { merge: true });
  batch.update(doc(db, 'pendingFriendInvites', pendingId), {
    status: 'accepted',
    acceptedBy: uid,
    acceptedAt: now,
    updatedAt: now,
  });
  batch.update(doc(db, 'friendInviteTokens', token), {
    status: 'accepted',
    acceptedBy: uid,
    updatedAt: now,
  });
  await batch.commit();

  await notifyUsers([fromUid], {
    eventType: 'friendInviteAccepted',
    title: 'Ny venn',
    body: `${me.name} ble med på ProTop og er nå vennen din.`,
    friendUid: uid,
    createdBy: uid,
    notificationId: `friendClaimed_${pairId}`,
  }).catch(() => {});

  return { friendshipId: pairId, friendUid: fromUid };
}

export async function removeFriend({ uid, friendUid, asUid = null, familyId = null }) {
  if (!uid || !friendUid) throw new Error('missing-params');
  const actorAsUid = String(asUid || '').trim();
  try {
    const adminRes = await callFriendFn('removeFriendAdmin', {
      friendUid,
      ...(actorAsUid ? { asUid: actorAsUid, familyId: familyId || null } : {}),
    });
    if (adminRes?.ok) return adminRes;
    if (adminRes?.error === 'forbidden' || adminRes?.error === 'bad-params') {
      throw new Error(adminRes.error);
    }
  } catch (err) {
    if (['forbidden', 'bad-params'].includes(err?.message)) throw err;
    // Fall through to client write when callable unavailable (own graph only).
    if (actorAsUid && actorAsUid !== uid) throw err;
  }
  const pairId = friendshipPairId(uid, friendUid);
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'friends', friendUid));
  batch.delete(doc(db, 'users', friendUid, 'friends', uid));
  batch.set(doc(db, 'friendships', pairId), {
    status: 'removed',
    updatedAt: serverTimestamp(),
    removedBy: uid,
  }, { merge: true });
  await batch.commit();
}

export function listenFriends(uid, onData, opts = {}) {
  const forUid = String(opts.forUid || uid || '').trim();
  const familyId = String(opts.familyId || '').trim();
  const authUid = String(uid || '').trim();
  if (!forUid) {
    onData?.([]);
    return () => {};
  }
  let cancelled = false;
  let delivered = false;
  let unsubSnap = () => {};
  const deliver = (list) => {
    if (cancelled) return;
    delivered = true;
    onData?.(list);
  };
  const poll = async () => {
    try {
      const call = (forUid === authUid)
        ? callFriendFn('listMyFriends', {})
        : callFriendFn('listFriendsForUid', { targetUid: forUid, familyId });
      const res = await Promise.race([
        call,
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('friends-timeout')), 8000);
        }),
      ]);
      if (!cancelled && res?.ok) deliver(res.friends || []);
      else if (!delivered) deliver([]);
    } catch {
      if (!delivered) deliver([]);
    }
  };
  poll();
  const interval = setInterval(() => {
    if (delivered) return;
    poll();
  }, 8000);
  // Client snapshot only works for own friends graph (rules).
  if (forUid === authUid) {
    const q = query(collection(db, 'users', forUid, 'friends'));
    unsubSnap = listenAfterAccess(authUid, (onErr) => onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, friendUid: d.id, ...d.data() }))
        .filter((f) => f.status !== 'removed');
      list.sort((a, b) => {
        const am = a.createdAt?.toMillis?.() || 0;
        const bm = b.createdAt?.toMillis?.() || 0;
        return bm - am;
      });
      deliver(list);
    }, onErr), (err) => {
      if (err) warnPermissionOnce(`friends:${forUid}`, '[listenFriends]', err?.code || err?.message || err);
      if (!delivered) deliver([]);
    });
  }
  return () => {
    cancelled = true;
    clearInterval(interval);
    try { unsubSnap(); } catch { /* ignore */ }
  };
}

/** One-shot friends list (for optimistic UI after accept). */
export async function refreshMyFriends(opts = {}) {
  const forUid = String(opts.forUid || '').trim();
  const familyId = String(opts.familyId || '').trim();
  const res = forUid
    ? await callFriendFn('listFriendsForUid', { targetUid: forUid, familyId })
    : await callFriendFn('listMyFriends', {});
  if (!res?.ok) return null;
  return res.friends || [];
}

export function listenIncomingFriendRequests(uid, onData, opts = {}) {
  if (!uid) {
    onData?.([]);
    return () => {};
  }
  const asUid = String(opts.asUid || '').trim();
  const familyId = String(opts.familyId || '').trim();
  // Parent acting as child: admin poll only (client rules block child's inbox).
  const pollAsOther = !!asUid;
  let cancelled = false;
  let unsubSnap = () => {};
  // Soften poll noise — permission-denied on client rules is expected; admin poll is source of truth.
  const poll = async () => {
    try {
      const res = await callFriendFn('listFriendRequests', {
        ...(pollAsOther ? { asUid, familyId } : {}),
      });
      if (!cancelled && res?.ok) onData?.(res.requests || []);
    } catch {
      requestMisses += 1;
    }
  };
  poll();
  let requestMisses = 0;
  const interval = setInterval(() => {
    if (requestMisses >= 1) return;
    poll().catch(() => { requestMisses += 1; });
  }, 8000);
  // Client snapshot only works for own inbox (rules).
  if (!pollAsOther) {
    const q = query(
      collection(db, 'users', uid, 'friendRequests'),
      where('status', '==', 'pending'),
    );
    unsubSnap = listenAfterAccess(uid, (onErr) => onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, requestId: d.id, ...d.data() }));
      onData?.(list);
    }, onErr), (err) => {
      if (err) {
        warnPermissionOnce(
          `friendRequests:${uid}`,
          '[listenIncomingFriendRequests]',
          err?.code || err?.message || err,
        );
      }
    });
  }
  return () => {
    cancelled = true;
    clearInterval(interval);
    try { unsubSnap(); } catch { /* ignore */ }
  };
}

/** Outgoing invites the user has sent — pending / declined / withdrawn. */
export function listenOutgoingFriendRequests(uid, onData, opts = {}) {
  if (!uid) {
    onData?.([]);
    return () => {};
  }
  const asUid = String(opts.asUid || '').trim();
  const familyId = String(opts.familyId || '').trim();
  const pollAsOther = !!asUid;
  let cancelled = false;
  let unsubSnap = () => {};
  const poll = async () => {
    try {
      const res = await callFriendFn('listOutgoingFriendRequests', {
        ...(pollAsOther ? { asUid, familyId } : {}),
      });
      if (!cancelled && res?.ok) onData?.(res.requests || []);
    } catch {
      /* retry next interval */
    }
  };
  poll();
  const interval = setInterval(poll, 10000);
  if (!pollAsOther) {
    const q = query(collection(db, 'users', uid, 'outgoingFriendRequests'));
    unsubSnap = listenAfterAccess(uid, (onErr) => onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, requestId: d.id, ...d.data() }))
        .filter((r) => {
          const st = String(r.status || 'pending');
          return st === 'pending' || st === 'declined' || st === 'withdrawn';
        });
      onData?.(list);
    }, onErr), (err) => {
      if (err) {
        warnPermissionOnce(
          `outgoingFriendRequests:${uid}`,
          '[listenOutgoingFriendRequests]',
          err?.code || err?.message || err,
        );
      }
    });
  }
  return () => {
    cancelled = true;
    clearInterval(interval);
    try { unsubSnap(); } catch { /* ignore */ }
  };
}

export async function withdrawFriendRequest({ requestId, asUid = null, familyId = null }) {
  const actorAsUid = String(asUid || '').trim();
  const res = await callFriendFn('withdrawFriendRequestAdmin', {
    requestId,
    ...(actorAsUid ? { asUid: actorAsUid, familyId: familyId || null } : {}),
  });
  if (!res?.ok) throw new Error(res?.error || 'withdraw-failed');
  return res;
}

/** Remove withdrawn/declined outgoing invite from own list (Admin — client rules often deny). */
export async function dismissOutgoingFriendRequest({
  uid, requestId, asUid = null, familyId = null,
}) {
  if (!requestId) throw new Error('missing-params');
  const actorAsUid = String(asUid || '').trim();
  try {
    const res = await callFriendFn('dismissOutgoingFriendRequestAdmin', {
      requestId,
      ...(actorAsUid ? { asUid: actorAsUid, familyId: familyId || null } : {}),
    });
    if (res?.ok) return res;
    if (res?.error === 'not-dismissible' || res?.error === 'forbidden' || res?.error === 'bad-params') {
      throw new Error(res.error);
    }
  } catch (e) {
    if (e?.message === 'not-dismissible' || e?.message === 'forbidden' || e?.message === 'bad-params') {
      throw e;
    }
    // Fallback when callable unavailable and client rules allow owner delete
    if (!uid || actorAsUid) throw e;
    try {
      const ref = doc(db, 'users', uid, 'outgoingFriendRequests', requestId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return { ok: true, requestId, alreadyGone: true };
      const st = String(snap.data()?.status || 'pending');
      if (st !== 'withdrawn' && st !== 'declined') throw new Error('not-dismissible');
      await deleteDoc(ref);
      return { ok: true, requestId, status: st };
    } catch (clientErr) {
      throw e;
    }
  }
  throw new Error('dismiss-failed');
}

export async function resendFriendRequest({ requestId, asUid = null, familyId = null }) {
  const actorAsUid = String(asUid || '').trim();
  const res = await callFriendFn('resendFriendRequestAdmin', {
    requestId,
    ...(actorAsUid ? { asUid: actorAsUid, familyId: familyId || null } : {}),
  });
  if (!res?.ok) throw new Error(res?.error || 'resend-failed');
  return res;
}

export async function refreshOutgoingFriendRequests(opts = {}) {
  const asUid = String(opts.asUid || '').trim();
  const familyId = String(opts.familyId || '').trim();
  const res = await callFriendFn('listOutgoingFriendRequests', {
    ...(asUid ? { asUid, familyId } : {}),
  });
  if (!res?.ok) return null;
  return res.requests || [];
}

/** Del album med venn — skriver pointer hos vennen (uten familiemedlemskap). */
export async function shareAlbumWithFriends({
  familyId, albumId, albumTitle, ownerUid, friendUids = [],
}) {
  if (!albumId || !ownerUid) return;
  try {
    const res = await callFriendFn('shareWithFriendsAdmin', {
      kind: 'album',
      familyId,
      albumId,
      title: albumTitle || 'Album',
      friendUids,
    });
    if (res?.ok) return res;
  } catch { /* fall through */ }
  const now = serverTimestamp();
  await Promise.all((friendUids || []).map(async (fid) => {
    if (!fid || fid === ownerUid) return;
    await setDoc(doc(db, 'users', fid, 'sharedAlbums', albumId), {
      familyId,
      albumId,
      title: albumTitle || 'Album',
      sharedBy: ownerUid,
      sharedAt: now,
      kind: 'album',
    }, { merge: true });
  }));
}

export async function unshareAlbumWithFriend({ albumId, friendUid }) {
  if (!albumId || !friendUid) return;
  await deleteDoc(doc(db, 'users', friendUid, 'sharedAlbums', albumId)).catch(() => {});
}

/** Del ønskeliste med venn — pointer uten familiemedlemskap (valgfritt). */
export async function shareWishlistWithFriends({
  familyId, listId, listTitle, ownerUid, ownerName, friendUids = [],
}) {
  if (!listId || !ownerUid) return;
  const title = listTitle || 'Ønskeliste';
  const sharedByName = (ownerName || '').trim() || null;
  try {
    const res = await callFriendFn('shareWithFriendsAdmin', {
      kind: 'wishlist',
      familyId,
      listId,
      title,
      sharedByName,
      friendUids,
    });
    if (res?.ok) return res;
  } catch { /* fall through */ }
  const now = serverTimestamp();
  await Promise.all((friendUids || []).map(async (fid) => {
    if (!fid || fid === ownerUid) return;
    await setDoc(doc(db, 'users', fid, 'sharedWishlists', listId), {
      familyId,
      listId,
      title,
      sharedBy: ownerUid,
      sharedByName,
      sharedAt: now,
      kind: 'wishlist',
    }, { merge: true });
  }));
}

export async function unshareWishlistWithFriend({ listId, friendUid }) {
  if (!listId || !friendUid) return;
  await deleteDoc(doc(db, 'users', friendUid, 'sharedWishlists', listId)).catch(() => {});
}

export async function shareDocumentFolderWithFriends({
  familyId, folderId, folderName, ownerUid, friendUids = [],
}) {
  if (!folderId || !ownerUid) return;
  try {
    const res = await callFriendFn('shareWithFriendsAdmin', {
      kind: 'document',
      familyId,
      folderId,
      name: folderName || 'Mappe',
      friendUids,
    });
    if (res?.ok) return res;
  } catch { /* fall through */ }
  const now = serverTimestamp();
  await Promise.all((friendUids || []).map(async (fid) => {
    if (!fid || fid === ownerUid) return;
    await setDoc(doc(db, 'users', fid, 'sharedDocuments', folderId), {
      familyId,
      folderId,
      name: folderName || 'Mappe',
      sharedBy: ownerUid,
      sharedAt: now,
      kind: 'document',
    }, { merge: true });
  }));
}

/** Del handleliste med venn — pointer uten familiemedlemskap. */
export async function shareShoppingListWithFriends({
  familyId, listId, listTitle, ownerUid, ownerName, friendUids = [],
}) {
  if (!listId || !ownerUid) return;
  const title = listTitle || 'Handleliste';
  const sharedByName = (ownerName || '').trim() || null;
  try {
    const res = await callFriendFn('shareWithFriendsAdmin', {
      kind: 'shopping',
      familyId,
      listId,
      title,
      name: title,
      sharedByName,
      friendUids,
    });
    if (res?.ok) return res;
  } catch { /* fall through */ }
  const now = serverTimestamp();
  await Promise.all((friendUids || []).map(async (fid) => {
    if (!fid || fid === ownerUid) return;
    await setDoc(doc(db, 'users', fid, 'sharedShoppingLists', listId), {
      familyId,
      listId,
      title,
      name: title,
      sharedBy: ownerUid,
      sharedByName,
      sharedAt: now,
      kind: 'shopping',
    }, { merge: true });
  }));
}

export async function unshareShoppingListWithFriend({ listId, friendUid }) {
  if (!listId || !friendUid) return;
  await deleteDoc(doc(db, 'users', friendUid, 'sharedShoppingLists', listId)).catch(() => {});
}

/** Fjern pointer for venner som ikke lenger er i memberIds. */
export async function syncShoppingListFriendShares({
  familyId, listId, listTitle, ownerUid, ownerName, friendUids = [], previousFriendUids = [],
}) {
  const next = new Set((friendUids || []).filter(Boolean));
  const prev = [...new Set((previousFriendUids || []).filter(Boolean))];
  const removed = prev.filter((fid) => !next.has(fid));
  await Promise.all(removed.map((fid) => unshareShoppingListWithFriend({ listId, friendUid: fid })));
  if (next.size) {
    await shareShoppingListWithFriends({
      familyId,
      listId,
      listTitle,
      ownerUid,
      ownerName,
      friendUids: [...next],
    });
  }
}

export async function shareCalendarEventWithFriends({
  familyId, eventId, title, startsAt, ownerUid, friendUids = [],
}) {
  if (!eventId || !ownerUid) return;
  try {
    const res = await callFriendFn('shareWithFriendsAdmin', {
      kind: 'event',
      familyId,
      eventId,
      title: title || 'Kalenderhendelse',
      startsAt: startsAt || null,
      friendUids,
    });
    if (res?.ok) return res;
  } catch { /* fall through */ }
  const now = serverTimestamp();
  await Promise.all((friendUids || []).map(async (fid) => {
    if (!fid || fid === ownerUid) return;
    await setDoc(doc(db, 'users', fid, 'sharedEvents', eventId), {
      familyId,
      eventId,
      title: title || 'Kalenderhendelse',
      startsAt: startsAt || null,
      sharedBy: ownerUid,
      sharedAt: now,
      status: 'pending',
      kind: 'event',
    }, { merge: true });
    await notifyUsers([fid], {
      eventType: 'eventCreated',
      title: 'Kalenderinvitasjon',
      body: `${title || 'En hendelse'} er delt med deg.`,
      familyId,
      eventId,
      createdBy: ownerUid,
      notificationId: `friendEvent_${eventId}_${fid}`,
    }).catch(() => {});
  }));
}

/** Fjern pointer slik at vennen mister kalender-invitasjonen. */
export async function unshareCalendarEventWithFriend({ eventId, friendUid }) {
  if (!eventId || !friendUid) return;
  await deleteDoc(doc(db, 'users', friendUid, 'sharedEvents', eventId)).catch(() => {});
}

/** Synk venne-pekere for kalenderhendelse (legg til / fjern). */
export async function syncCalendarEventFriendShares({
  familyId, eventId, title, startsAt, ownerUid, friendUids = [], previousFriendUids = [],
}) {
  if (!eventId || !ownerUid) return;
  const next = new Set((friendUids || []).filter(Boolean));
  const prev = [...new Set((previousFriendUids || []).filter(Boolean))];
  const removed = prev.filter((fid) => !next.has(fid));
  await Promise.all(removed.map((fid) => unshareCalendarEventWithFriend({ eventId, friendUid: fid })));
  if (next.size) {
    await shareCalendarEventWithFriends({
      familyId,
      eventId,
      title,
      startsAt,
      ownerUid,
      friendUids: [...next],
    });
  }
}

/**
 * Hendelser delt med meg (via memberIds) som ligger i andre familier.
 * Samme mønster som handlelister: collectionGroup + ekskluder egne plattformer.
 */
export function listenEventsSharedWithMe(uid, { excludeFamilyIds = [], onChange } = {}) {
  if (!uid) {
    onChange?.([]);
    return () => {};
  }
  const exclude = new Set((excludeFamilyIds || []).filter(Boolean));
  return listenAfterAccess(uid, (onErr) => onSnapshot(
    query(collectionGroup(db, 'events'), where('memberIds', 'array-contains', uid)),
    (snap) => {
      const out = [];
      snap.docs.forEach((d) => {
        const parts = d.ref.path.split('/');
        if (parts[0] !== 'families' || parts[2] !== 'events') return;
        const fid = parts[1];
        if (exclude.has(fid)) return;
        const data = d.data() || {};
        if (data.deleted === true || data.active === false) return;
        out.push({
          id: d.id,
          ...data,
          familyId: fid,
          sharedFromFriend: true,
          readOnly: true,
        });
      });
      onChange?.(out);
    },
    (err) => {
      warnPermissionOnce(
        `events-cg:${uid}`,
        '[listenEventsSharedWithMe]',
        err?.code || err?.message || err,
      );
      onErr(err);
    },
  ), (err) => {
    if (err) {
      warnPermissionOnce(
        `events-cg:${uid}`,
        '[listenEventsSharedWithMe]',
        err?.code || err?.message || err,
      );
    }
    onChange?.([]);
  });
}

export function listenSharedAlbums(uid, onData) {
  if (!uid) {
    onData?.([]);
    return () => {};
  }
  let cancelled = false;
  let unsubSnap = () => {};
  const poll = async () => {
    try {
      const res = await callFriendFn('listSharedAlbumsAdmin', {});
      if (!cancelled && res?.ok) onData?.(res.albums || []);
    } catch { /* fall through to snapshot */ }
  };
  poll();
  const interval = setInterval(poll, 10000);
  unsubSnap = listenAfterAccess(uid, (onErr) => onSnapshot(
    collection(db, 'users', uid, 'sharedAlbums'),
    (snap) => onData?.(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onErr,
  ), (err) => {
    if (err) {
      warnPermissionOnce(
        `sharedAlbums:${uid}`,
        '[listenSharedAlbums]',
        err?.code || err?.message || err,
      );
    }
  });
  return () => {
    cancelled = true;
    clearInterval(interval);
    try { unsubSnap(); } catch { /* ignore */ }
  };
}

export function listenSharedWishlists(uid, onData) {
  if (!uid) {
    onData?.([]);
    return () => {};
  }
  let cancelled = false;
  let unsubSnap = () => {};
  const poll = async () => {
    try {
      const res = await callFriendFn('listSharedWishlistsAdmin', {});
      if (!cancelled && res?.ok) onData?.(res.wishlists || []);
    } catch { /* fall through to snapshot */ }
  };
  poll();
  const interval = setInterval(poll, 10000);
  unsubSnap = listenAfterAccess(uid, (onErr) => onSnapshot(
    collection(db, 'users', uid, 'sharedWishlists'),
    (snap) => onData?.(snap.docs.map((d) => ({ id: d.id, listId: d.id, ...d.data() }))),
    onErr,
  ), (err) => {
    if (err) {
      warnPermissionOnce(
        `sharedWishlists:${uid}`,
        '[listenSharedWishlists]',
        err?.code || err?.message || err,
      );
    }
  });
  return () => {
    cancelled = true;
    clearInterval(interval);
    try { unsubSnap(); } catch { /* ignore */ }
  };
}

export function listenSharedDocuments(uid, onData) {
  if (!uid) {
    onData?.([]);
    return () => {};
  }
  return listenAfterAccess(uid, (onErr) => onSnapshot(
    collection(db, 'users', uid, 'sharedDocuments'),
    (snap) => onData?.(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onErr,
  ), (err) => {
    if (err) {
      warnPermissionOnce(
        `sharedDocuments:${uid}`,
        '[listenSharedDocuments]',
        err?.code || err?.message || err,
      );
    }
    onData?.([]);
  });
}

export function listenSharedShoppingLists(uid, onData) {
  if (!uid) {
    onData?.([]);
    return () => {};
  }
  return listenAfterAccess(uid, (onErr) => onSnapshot(
    collection(db, 'users', uid, 'sharedShoppingLists'),
    (snap) => onData?.(snap.docs.map((d) => ({
      id: d.id,
      listId: d.id,
      ...d.data(),
    }))),
    onErr,
  ), (err) => {
    if (err) {
      warnPermissionOnce(
        `sharedShoppingLists:${uid}`,
        '[listenSharedShoppingLists]',
        err?.code || err?.message || err,
      );
    }
    onData?.([]);
  });
}

export function listenSharedEvents(uid, onData) {
  if (!uid) {
    onData?.([]);
    return () => {};
  }
  return listenAfterAccess(uid, (onErr) => onSnapshot(
    collection(db, 'users', uid, 'sharedEvents'),
    (snap) => onData?.(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onErr,
  ), (err) => {
    if (err) {
      warnPermissionOnce(
        `sharedEvents:${uid}`,
        '[listenSharedEvents]',
        err?.code || err?.message || err,
      );
    }
    onData?.([]);
  });
}
