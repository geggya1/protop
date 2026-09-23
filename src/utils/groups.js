import {
  collection, doc, writeBatch, serverTimestamp, updateDoc, arrayUnion, arrayRemove,
  getDoc, setDoc, deleteDoc, getDocs, query, where, limit, onSnapshot, orderBy,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth, signOut as signOutAuth } from 'firebase/auth';
import { getApp, initializeApp } from 'firebase/app';
import { addDoc } from 'firebase/firestore';
import { db, auth, functions } from '../../firebase';
import { claimUsername, usernameToEmail, normalizeUsername, usernameTaken } from './usernames';
import { hasContactInfo, isValidEmail } from './account';
import { sendParentInvite, sendParentInviteSms, familyInviteAcceptUrl } from './invite';
import { normalizePhone, hasValidPhone } from './phone';
import { notifyUsers } from './notifications';
import { listenAfterAccess, warnPermissionOnce } from './firestoreAccess';
import { assertCanCreatePlatformType } from './platformAccess';
import { httpsCallable } from 'firebase/functions';
import {
  classifyInviteIdentifier,
  inviteLookupCandidates,
  groupInviteCopy,
} from './inviteIdentifiers';
import { setMemberPassword } from './setMemberPassword';

export { memberDocGrantsAccess } from './memberAccess';

export function isSuperAdmin(family, uid) {
  return !!(uid && family && (family.ownerUid === uid || family.ownerId === uid));
}

export function isGroupAdmin(family, uid) {
  if (!uid || !family) return false;
  if (isSuperAdmin(family, uid)) return true;
  return Array.isArray(family.adminUids) && family.adminUids.includes(uid);
}

/** Rolle for voksne i familien: foresatt eller besteforeldre. */
export function normalizeAdultRole(value, { asGrandparent = false } = {}) {
  if (value === 'grandparent' || asGrandparent === true) return 'grandparent';
  return 'parent';
}

function adultRoleFields({ asGrandparent = false, adultRole = null, grandparentModules = null } = {}) {
  const role = normalizeAdultRole(adultRole, { asGrandparent });
  const isGp = role === 'grandparent';
  const fields = {
    adultRole: role,
    isGrandparent: isGp,
  };
  if (isGp) {
    fields.admin = false;
    fields.superAdmin = false;
    if (grandparentModules && typeof grandparentModules === 'object') {
      fields.grandparentModules = grandparentModules;
    }
  }
  return fields;
}

/** Admin via family doc OR parent membership flags (idrettslag). */
export function isTeamAdmin(team, uid, parents = []) {
  if (isGroupAdmin(team, uid)) return true;
  if (!uid) return false;
  return (parents || []).some((p) => (
    (p.id === uid || p.uid === uid) && (p.admin || p.superAdmin) && p.active !== false
  ));
}

async function secondaryAuth() {
  const opts = getApp().options;
  const name = 'weekplan-secondary';
  let app;
  try { app = getApp(name); } catch {
    app = initializeApp(opts, name);
  }
  return getAuth(app);
}

export async function createAuthUser(email, password) {
  const secondary = await secondaryAuth();
  const cred = await createUserWithEmailAndPassword(secondary, email, password);
  const uid = cred.user.uid;
  try { await signOutAuth(secondary); } catch {}
  return uid;
}

export async function createGroup({
  name, type, language, user, profile, isPersonal = false,
}) {
  const resolvedType = type || 'family';
  assertCanCreatePlatformType(resolvedType, user);
  const batch = writeBatch(db);
  const famRef = doc(collection(db, 'families'));
  const now = serverTimestamp();
  const email = (user.email || '').toLowerCase();
  const personal = !!isPersonal;
  batch.set(famRef, {
    name,
    type: resolvedType,
    language: language || 'nb',
    ownerUid: user.uid,
    adminUids: [user.uid],
    members: [user.uid],
    moduleAccess: {},
    // Schema flag only — does not unlock modules. New families still see Aktiver.
    moduleAccessInitialized: true,
    active: true,
    archived: false,
    deleted: false,
    // Solo workspace until the user names/promotes it as a real family.
    isPersonal: personal,
    photoURL: profile?.photoURL || null,
    avatarId: profile?.avatarId || (personal ? 'fox' : 'home'),
    createdAt: now,
    updatedAt: now,
  });
  const parentPayload = {
    uid: user.uid,
    email,
    phone: profile?.phone || '',
    name: profile?.displayName || profile?.name || user.displayName || email.split('@')[0],
    username: profile?.username || '',
    usernameLower: profile?.usernameLower || '',
    admin: true,
    superAdmin: true,
    active: true,
    archived: false,
    placeholder: false,
    emailVerified: !!user.emailVerified,
    photoURL: profile?.photoURL || user.photoURL || '',
    avatarId: profile?.avatarId || null,
    gender: profile?.gender || null,
    birthday: profile?.birthday || null,
    age: profile?.age ?? null,
    location: profile?.location || null,
    createdAt: now,
    updatedAt: now,
  };
  batch.set(doc(db, 'families', famRef.id, 'parents', user.uid), parentPayload);
  batch.set(doc(db, 'parents', user.uid), {
    ...parentPayload,
    familyId: famRef.id,
    familyIds: arrayUnion(famRef.id),
    role: 'admin',
  }, { merge: true });
  batch.set(doc(db, 'users', user.uid), {
    familyIds: arrayUnion(famRef.id),
    updatedAt: now,
  }, { merge: true });
  await batch.commit();
  return famRef.id;
}

export async function updateGroup(familyId, patch) {
  // Gruppetype er låst etter opprettelse (familie ≠ idrettslag ≠ …).
  const { type: _ignoredType, ...safe } = patch || {};
  await updateDoc(doc(db, 'families', familyId), { ...safe, updatedAt: serverTimestamp() });
}

export function isGroupDeactivated(group) {
  if (!group || isGroupDeleted(group)) return false;
  return group.archived === true || group.active === false;
}

export function isGroupDeleted(group) {
  return group?.deleted === true || group?.hiddenFromApp === true;
}

/** Deaktiver: vises nedtonet, kan reaktiveres. Dokumentet beholdes. */
export async function deactivateGroup(familyId) {
  await updateGroup(familyId, {
    archived: true,
    active: false,
    deactivatedAt: serverTimestamp(),
  });
}

export async function reactivateGroup(familyId) {
  await updateGroup(familyId, {
    archived: false,
    active: true,
    deleted: false,
    hiddenFromApp: false,
    reactivatedAt: serverTimestamp(),
  });
}

/**
 * Slett i appen = skjul for brukeren. Ingen Firestore-dokumenter slettes.
 * IT kan restore ved å sette deleted:false, hiddenFromApp:false, active:true, archived:false
 * og eventuelt legge tilbake joinCodePrevious som joinCode.
 */
export async function deleteGroup(familyId) {
  const snap = await getDoc(doc(db, 'families', familyId));
  const prev = snap.exists() ? (snap.data() || {}) : {};
  const prevCode = prev.joinCode || null;
  await updateGroup(familyId, {
    deleted: true,
    active: false,
    archived: true,
    hiddenFromApp: true,
    deletedAt: serverTimestamp(),
    subscriptionStatus: 'cancelled',
    subscriptionCancelledAt: serverTimestamp(),
    subscriptionCancelReason: 'group_deleted',
    joinCode: null,
    joinCodePrevious: prev.joinCode || prev.joinCodePrevious || null,
  });
  if (prevCode) {
    await deleteDoc(doc(db, 'joinCodes', prevCode)).catch(() => {});
  }
}

/** @deprecated bruk deactivateGroup */
export async function archiveGroup(familyId, archived = true) {
  if (archived) return deactivateGroup(familyId);
  return reactivateGroup(familyId);
}

function hasContact(email, phone) {
  return hasContactInfo(email, phone);
}

export async function addChildMember({
  familyId, name, username, password, birthday, age, gender, location, phone, email, photoURL, avatarId, createdBy,
}) {
  const uname = normalizeUsername(username);
  if (await usernameTaken(uname)) throw new Error('taken');
  const authEmail = usernameToEmail(uname);
  const uid = await createAuthUser(authEmail, password);
  try {
    await claimUsername(uname, uid, 'child');
  } catch (e) {
    throw e;
  }
  const now = serverTimestamp();
  const payload = {
    uid,
    name: name.trim(),
    username: uname,
    usernameLower: uname,
    usernameEmail: authEmail,
    birthday: birthday || null,
    age: age ?? null,
    gender: gender || null,
    location: location || null,
    phone: phone || '',
    email: (email || '').toLowerCase(),
    photoURL: photoURL || '',
    avatarId: avatarId || 'fox',
    familyId,
    createdBy,
    createdAt: now,
    updatedAt: now,
    active: true,
    archived: false,
    deleted: false,
    linkedParents: createdBy ? [createdBy] : [],
    rewardMode: 'points',
  };
  await Promise.all([
    setDoc(doc(db, 'families', familyId, 'children', uid), payload, { merge: true }).catch(() => {}),
    setDoc(doc(db, 'children', uid), payload, { merge: true }).catch(() => {}),
    setDoc(doc(db, 'users', uid), {
      uid, role: 'child', displayName: name.trim(), username: uname, usernameLower: uname,
      email: payload.email || authEmail, phone: phone || '', birthday, age, gender, location, photoURL, avatarId,
      createdAt: now, updatedAt: now,
    }, { merge: true }).catch(() => {}),
  ]);
  // LIST of chats/messages requires members[] / activeUsers (isFamilyMemberLite).
  // Do not swallow — orphaned children get push/inbox but an empty message thread.
  await updateDoc(doc(db, 'families', familyId), {
    members: arrayUnion(uid),
    activeUsers: arrayUnion(uid),
    updatedAt: now,
  });
  // Sync Auth password into a foresatt-readable copy on the child profile.
  if (password) {
    await setMemberPassword({ uid, password, familyId }).catch(() => {});
  }
  return { uid, username: uname, login: uname };
}

export async function addAdultManual({
  familyId, name, username, password, email, phone, birthday, gender, location, photoURL, avatarId, createdBy, asAdmin,
  asGrandparent = false, adultRole = null, grandparentModules = null,
}) {
  if (!hasContact(email, phone)) throw new Error('contact-required');
  const uname = normalizeUsername(username);
  if (await usernameTaken(uname)) throw new Error('taken');
  const loginEmail = (email || '').toLowerCase() || usernameToEmail(uname);
  const uid = await createAuthUser(loginEmail, password);
  await claimUsername(uname, uid, 'adult');
  const now = serverTimestamp();
  const roleFields = adultRoleFields({ asGrandparent, adultRole, grandparentModules });
  const asAdminEffective = !!asAdmin && !roleFields.isGrandparent;
  const payload = {
    uid,
    name: name.trim(),
    email: (email || '').toLowerCase(),
    phone: phone || '',
    username: uname,
    usernameLower: uname,
    birthday: birthday || null,
    gender: gender || null,
    location: location || null,
    photoURL: photoURL || '',
    avatarId: avatarId || null,
    admin: asAdminEffective,
    superAdmin: false,
    active: true,
    archived: false,
    placeholder: false,
    emailVerified: false,
    familyId,
    createdBy,
    createdAt: now,
    updatedAt: now,
    ...roleFields,
  };
  await Promise.all([
    setDoc(doc(db, 'families', familyId, 'parents', uid), payload, { merge: true }).catch(() => {}),
    setDoc(doc(db, 'parents', uid), { ...payload, familyIds: [familyId], role: asAdminEffective ? 'admin' : 'parent' }, { merge: true }).catch(() => {}),
    setDoc(doc(db, 'users', uid), { uid, role: 'adult', displayName: name.trim(), ...payload }, { merge: true }).catch(() => {}),
  ]);
  await updateDoc(doc(db, 'families', familyId), {
    members: arrayUnion(uid),
    activeUsers: arrayUnion(uid),
    ...(asAdminEffective ? { adminUids: arrayUnion(uid) } : {}),
    updatedAt: now,
  });
  return { uid, username: uname, login: email || uname };
}

function inviteParentKey({ email, phone, name }) {
  return (email || phone || name).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40) || `inv${Date.now()}`;
}

async function deliverParentInviteEmail({ email, name, familyId, familyName, groupType }) {
  const to = String(email || '').toLowerCase().trim();
  const label = familyName || familyId;
  const registerUrl = `https://www.protop.no/register?email=${encodeURIComponent(to)}&familyId=${encodeURIComponent(familyId)}`;
  try {
    await sendParentInvite({
      email: to,
      name,
      familyId,
      familyName: label,
      groupType: groupType || '',
      registerUrl,
    });
    return { emailSent: true, emailError: null, registerUrl };
  } catch (err) {
    const primaryError = err?.message || 'Kunne ikke sende e-post';
    // Client /mail writes are denied — invite e-mail must go through authenticated callables.
    return { emailSent: false, emailError: primaryError, registerUrl };
  }
}

async function deliverParentInviteSms({ phone, name, familyId, familyName, groupType, joinCode }) {
  const to = normalizePhone(phone);
  if (!hasValidPhone(to) && !hasValidPhone(phone)) {
    return { smsSent: false, smsError: 'Ugyldig telefonnummer', phone: to || phone };
  }
  const target = normalizePhone(phone) || phone;
  const label = familyName || familyId;
  const registerUrl = `https://www.protop.no/register?familyId=${encodeURIComponent(familyId)}&phone=${encodeURIComponent(target)}`;
  try {
    await sendParentInviteSms({
      phone: target,
      name,
      familyId,
      familyName: label,
      groupType: groupType || '',
      joinCode: joinCode || '',
      registerUrl,
    });
    return { smsSent: true, smsError: null, phone: target };
  } catch (err) {
    return { smsSent: false, smsError: err?.message || 'Kunne ikke sende SMS', phone: target };
  }
}

async function writeInviteDeliveryStatus({ familyId, parentId, email, phone, delivery }) {
  const patch = {
    inviteStatus: 'pending',
    updatedAt: serverTimestamp(),
  };
  if (delivery?.emailSent) {
    patch.inviteEmailSentAt = serverTimestamp();
    patch.inviteEmailTo = email;
    patch.inviteEmailError = null;
  } else if (delivery?.emailError) {
    patch.inviteEmailError = String(delivery.emailError).slice(0, 280);
    patch.inviteEmailFailedAt = serverTimestamp();
  }
  if (delivery?.smsSent) {
    patch.inviteSmsSentAt = serverTimestamp();
    patch.inviteSmsTo = phone || delivery.phone;
    patch.inviteSmsError = null;
  } else if (delivery?.smsError) {
    patch.inviteSmsError = String(delivery.smsError).slice(0, 280);
    patch.inviteSmsFailedAt = serverTimestamp();
  }
  await updateDoc(doc(db, 'families', familyId, 'parents', parentId), patch).catch(() => {});
}

export async function inviteAdult({
  familyId, name, email, phone, familyName, groupType, joinCode, createdBy, asAdmin,
  asGrandparent = false, adultRole = null, grandparentModules = null,
}) {
  if (!hasContact(email, phone)) throw new Error('contact-required');
  const famSnap = await getDoc(doc(db, 'families', familyId));
  if (!famSnap.exists() || isGroupDeleted(famSnap.data())) {
    throw new Error('Familien er slettet og kan ikke invitere nye medlemmer.');
  }
  const now = serverTimestamp();
  const normalizedEmail = (email || '').toLowerCase().trim();
  const normalizedPhone = normalizePhone(phone) || (phone || '');
  const roleFields = adultRoleFields({ asGrandparent, adultRole, grandparentModules });
  const asAdminEffective = !!asAdmin && !roleFields.isGrandparent;
  // Safety net: never create a "new user" placeholder for someone who already has an account.
  if (normalizedEmail) {
    const existing = await findExistingAdultByIdentifier(normalizedEmail);
    if (existing?.uid) {
      return inviteExistingAdult({
        familyId,
        inviteeUid: existing.uid,
        identifier: normalizedEmail,
        createdBy,
        asAdmin: asAdminEffective,
        asGrandparent: roleFields.isGrandparent,
        adultRole: roleFields.adultRole,
        grandparentModules: roleFields.grandparentModules,
        familyName,
        groupType,
      });
    }
  }
  const key = inviteParentKey({ email: normalizedEmail, phone: normalizedPhone, name });
  const famData = famSnap.data() || {};
  const resolvedName = familyName || famData.name || '';
  const resolvedType = groupType || famData.type || 'family';

  const payload = {
    uid: key,
    name: name.trim(),
    email: normalizedEmail,
    phone: normalizedPhone,
    familyId,
    createdBy,
    createdAt: now,
    invitedAt: now,
    inviteStatus: 'pending',
    // Klienten sender e-post/SMS via callable — trigger skal ikke sende dobbelt
    clientSendsInvite: true,
    active: false,
    emailVerified: false,
    placeholder: true,
    admin: asAdminEffective,
    superAdmin: false,
    deleted: false,
    archived: false,
    ...roleFields,
  };
  await setDoc(doc(db, 'families', familyId, 'parents', key), payload, { merge: true });

  let emailSent = false;
  let emailError = null;
  let smsSent = false;
  let smsError = null;

  if (normalizedEmail) {
    await setDoc(
      doc(db, 'parents', normalizedEmail),
      { ...payload, familyIds: arrayUnion(familyId), role: 'parent' },
      { merge: true },
    );
    await updateDoc(doc(db, 'families', familyId), {
      invitedEmails: arrayUnion(normalizedEmail),
      updatedAt: now,
    });
    const delivery = await deliverParentInviteEmail({
      email: normalizedEmail,
      name,
      familyId,
      familyName: resolvedName,
      groupType: resolvedType,
    });
    emailSent = !!delivery.emailSent;
    emailError = delivery.emailError;
    await writeInviteDeliveryStatus({
      familyId,
      parentId: key,
      email: normalizedEmail,
      delivery,
    });
  }

  if (normalizedPhone && hasValidPhone(normalizedPhone)) {
    const delivery = await deliverParentInviteSms({
      phone: normalizedPhone,
      name,
      familyId,
      familyName: resolvedName,
      groupType: resolvedType,
      joinCode,
    });
    smsSent = !!delivery.smsSent;
    smsError = delivery.smsError;
    await writeInviteDeliveryStatus({
      familyId,
      parentId: key,
      phone: normalizedPhone,
      delivery,
    });
  } else if (phone && !normalizedEmail) {
    // Phone provided but not valid E.164 — still stored, report soft error
    smsError = 'Ugyldig telefonnummer. Bruk landskode, f.eks. +47…';
    await writeInviteDeliveryStatus({
      familyId,
      parentId: key,
      phone: phone || '',
      delivery: { smsSent: false, smsError },
    });
  }

  return { key, emailSent, emailError, smsSent, smsError, inviteStatus: 'pending' };
}

/** Send invitasjon på nytt (e-post og/eller SMS) til ventende foresatt. */
export async function resendAdultInvite({ familyId, parentId, familyName, groupType, joinCode }) {
  if (!familyId || !parentId) throw new Error('missing-parent');
  const ref = doc(db, 'families', familyId, 'parents', parentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('not-found');
  const data = snap.data() || {};
  const email = String(data.email || '').toLowerCase().trim();
  const phone = normalizePhone(data.phone) || String(data.phone || '').trim();
  if (!email && !phone) throw new Error('no-contact');

  let resolvedName = familyName || '';
  let resolvedType = groupType || '';
  if (!resolvedName || !resolvedType) {
    try {
      const fam = await getDoc(doc(db, 'families', familyId));
      if (fam.exists()) {
        const d = fam.data() || {};
        if (!resolvedName) resolvedName = d.name || '';
        if (!resolvedType) resolvedType = d.type || 'family';
      }
    } catch {}
  }

  let emailSent = null;
  let emailError = null;
  let smsSent = null;
  let smsError = null;
  const isExisting = data.inviteKind === 'existing' && data.inviteId;
  const acceptUrl = isExisting
    ? familyInviteAcceptUrl({ familyId, inviteId: data.inviteId })
    : null;

  // Re-write invitee inbox + in-app notification so they see the invite even if
  // the original familyInvites write was missing or notifications were dismissed.
  if (isExisting) {
    const inviteeUid = data.uid || parentId;
    await ensureInviteeFamilyInviteInbox({
      familyId,
      inviteId: data.inviteId,
      inviteeUid,
      invitedBy: data.createdBy || data.invitedBy || null,
      inviteeName: data.name || '',
      inviteeEmail: email,
      inviteeUsername: data.username || '',
      asAdmin: !!data.admin,
      familyName: resolvedName,
      groupType: resolvedType,
    }).catch(() => {});
  }

  if (email) {
    if (isExisting) {
      try {
        await sendParentInvite({
          email,
          name: data.name || '',
          familyId,
          familyName: resolvedName || familyId,
          groupType: resolvedType,
          registerUrl: acceptUrl,
          existingUser: true,
          inviteKind: 'existing',
        });
        emailSent = true;
        emailError = null;
      } catch (err) {
        emailSent = false;
        emailError = err?.message || 'Kunne ikke sende e-post';
      }
      await writeInviteDeliveryStatus({
        familyId,
        parentId,
        email,
        delivery: { emailSent, emailError },
      });
    } else {
      const delivery = await deliverParentInviteEmail({
        email,
        name: data.name || '',
        familyId,
        familyName: resolvedName || familyId,
        groupType: resolvedType,
      });
      emailSent = !!delivery.emailSent;
      emailError = delivery.emailError || null;
      await writeInviteDeliveryStatus({
        familyId,
        parentId,
        email,
        delivery,
      });
    }
  }

  if (phone && hasValidPhone(phone)) {
    if (isExisting) {
      try {
        await sendParentInviteSms({
          phone,
          name: data.name || '',
          familyId,
          familyName: resolvedName || familyId,
          groupType: resolvedType,
          joinCode: joinCode || '',
          registerUrl: acceptUrl,
          existingUser: true,
          inviteKind: 'existing',
        });
        smsSent = true;
        smsError = null;
      } catch (err) {
        smsSent = false;
        smsError = err?.message || 'Kunne ikke sende SMS';
      }
      await writeInviteDeliveryStatus({
        familyId,
        parentId,
        phone,
        delivery: { smsSent, smsError },
      });
    } else {
      const delivery = await deliverParentInviteSms({
        phone,
        name: data.name || '',
        familyId,
        familyName: resolvedName || familyId,
        groupType: resolvedType,
        joinCode: joinCode || '',
      });
      smsSent = !!delivery.smsSent;
      smsError = delivery.smsError || null;
      await writeInviteDeliveryStatus({
        familyId,
        parentId,
        phone,
        delivery,
      });
    }
  }

  await updateDoc(ref, {
    invitedAt: serverTimestamp(),
    inviteResentAt: serverTimestamp(),
    inviteStatus: 'pending',
    placeholder: true,
    active: false,
  }).catch(() => {});

  return {
    key: parentId,
    emailSent,
    emailError,
    smsSent,
    smsError,
  };
}

/**
 * Når en invitert bruker registrerer seg: aktiver placeholder-medlemskap
 * og knytt uid til laget/familien.
 *
 * Placeholder-doc har ofte id ≠ Firebase uid (e-post-nøkkel). Vi migrerer til
 * parents/{uid} og arkiverer den gamle, ellers blir foresatt listet dobbelt.
 */
export async function claimAdultInvitesOnRegister({
  uid,
  email,
  name,
  phone,
  preferredFamilyId,
}) {
  if (!uid) return { claimed: [] };
  const emailLower = String(email || '').toLowerCase().trim();
  const phoneNorm = normalizePhone(phone) || '';
  const familyIds = new Set();
  if (preferredFamilyId) familyIds.add(preferredFamilyId);

  if (emailLower) {
    try {
      const snap = await getDocs(
        query(collection(db, 'families'), where('invitedEmails', 'array-contains', emailLower)),
      );
      snap.docs.forEach((d) => familyIds.add(d.id));
    } catch {}
  }

  const claimed = [];
  const now = serverTimestamp();

  for (const familyId of familyIds) {
    let matched = false;
    let promoteAdmin = false;
    const removeAdminPlaceholders = [];
    try {
      const famSnap = await getDoc(doc(db, 'families', familyId));
      const existingAdminUids = Array.isArray(famSnap.data()?.adminUids)
        ? famSnap.data().adminUids
        : [];
      const parentsSnap = await getDocs(collection(db, 'families', familyId, 'parents'));
      for (const pDoc of parentsSnap.docs) {
        const p = pDoc.data() || {};
        if (p.deleted === true) continue;
        const emailMatch = emailLower && String(p.email || '').toLowerCase() === emailLower;
        const phoneMatch = phoneNorm && normalizePhone(p.phone) === phoneNorm;
        if (!emailMatch && !phoneMatch) continue;
        matched = true;
        const wasAdmin = existingAdminUids.includes(pDoc.id)
          || !!p.admin
          || !!p.superAdmin
          || ['principal', 'teacher', 'admin'].includes(p.staffRole);
        if (wasAdmin) promoteAdmin = true;
        if (pDoc.id !== uid && existingAdminUids.includes(pDoc.id)) {
          removeAdminPlaceholders.push(pDoc.id);
        }
        const patch = {
          uid,
          active: true,
          placeholder: false,
          inviteStatus: 'accepted',
          acceptedAt: now,
          updatedAt: now,
          deleted: false,
          archived: false,
        };
        if (name) patch.name = name;
        if (emailLower) patch.email = emailLower;
        if (phoneNorm) patch.phone = phoneNorm;

        if (pDoc.id === uid) {
          await updateDoc(pDoc.ref, patch).catch(() => {});
        } else {
          // Canonical membership keyed by Firebase uid
          await setDoc(
            doc(db, 'families', familyId, 'parents', uid),
            { ...p, ...patch, id: uid },
            { merge: true },
          ).catch(() => {});
          // Skjul invite-placeholder så den ikke vises som dobbel foresatt
          await updateDoc(pDoc.ref, {
            deleted: true,
            archived: true,
            active: false,
            placeholder: true,
            inviteStatus: 'accepted',
            migratedToUid: uid,
            updatedAt: now,
          }).catch(() => {});
        }
      }

      if (!matched && (emailLower || phoneNorm)) {
        await setDoc(
          doc(db, 'families', familyId, 'parents', uid),
          {
            uid,
            name: name || '',
            email: emailLower,
            phone: phoneNorm,
            familyId,
            active: true,
            placeholder: false,
            inviteStatus: 'accepted',
            acceptedAt: now,
            createdAt: now,
            admin: false,
            superAdmin: false,
            deleted: false,
            archived: false,
          },
          { merge: true },
        ).catch(() => {});
      }

      const famPatch = {
        members: arrayUnion(uid),
        updatedAt: now,
      };
      if (emailLower) famPatch.invitedEmails = arrayRemove(emailLower);
      if (promoteAdmin) famPatch.adminUids = arrayUnion(uid);
      await updateDoc(doc(db, 'families', familyId), famPatch).catch(() => {});
      if (removeAdminPlaceholders.length) {
        await updateDoc(doc(db, 'families', familyId), {
          adminUids: arrayRemove(...removeAdminPlaceholders),
          updatedAt: now,
        }).catch(() => {});
      }

      await setDoc(
        doc(db, 'parents', uid),
        {
          uid,
          name: name || '',
          email: emailLower,
          phone: phoneNorm,
          familyIds: arrayUnion(familyId),
          role: 'parent',
          active: true,
          updatedAt: now,
        },
        { merge: true },
      ).catch(() => {});

      await setDoc(
        doc(db, 'users', uid),
        {
          uid,
          displayName: name || '',
          email: emailLower,
          familyIds: arrayUnion(familyId),
          updatedAt: now,
        },
        { merge: true },
      ).catch(() => {});

      claimed.push(familyId);
    } catch {}
  }

  return { claimed };
}

/** Høyere score = mer «ekte» medlemsdoc (uid-nøkkel, aktiv, bilde). */
export function parentCanonicalScore(p) {
  if (!p) return -1;
  let s = 0;
  if (p.id && p.uid && p.id === p.uid) s += 8;
  if (p.placeholder !== true) s += 4;
  if (p.active !== false && p.archived !== true) s += 2;
  if (p.inviteStatus === 'accepted') s += 1;
  if (p.photoURL || p.photoUrl) s += 1;
  if (p.username || p.usernameLower || p.handle) s += 1;
  // Invite-nøkler er korte slug-er; Firebase uid er lengre
  if (p.id && String(p.id).length >= 20) s += 2;
  return s;
}

function normalizeParentName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Identitet-nøkler for å koble invite-placeholder og ekte parents/{uid}. */
export function parentIdentityKeys(p) {
  if (!p) return [];
  const keys = [];
  const email = String(p.email || p.inviteEmailTo || '').toLowerCase().trim();
  const phone = normalizePhone(p.phone || p.inviteSmsTo || '') || '';
  const uid = p.uid ? String(p.uid).trim() : '';
  const id = p.id ? String(p.id).trim() : '';
  const name = normalizeParentName(p.name);
  if (email) keys.push(`e:${email}`);
  if (phone && phone.length >= 8) keys.push(`p:${phone}`);
  if (uid) keys.push(`u:${uid}`);
  if (id) keys.push(`u:${id}`);
  // Navn som siste utvei i samme familie (korte navn som «Geir» må også treffe)
  if (name && name.length >= 2) keys.push(`n:${name}`);
  return keys;
}

function groupParentsByIdentity(list) {
  const parents = (list || []).filter((p) => p && p.deleted !== true);
  const find = (arr, i) => {
    while (arr[i] !== i) i = arr[i];
    return i;
  };
  const uf = parents.map((_, i) => i);
  const keyRoot = new Map();

  parents.forEach((p, i) => {
    parentIdentityKeys(p).forEach((key) => {
      if (keyRoot.has(key)) {
        const a = find(uf, i);
        const b = find(uf, keyRoot.get(key));
        if (a !== b) uf[a] = b;
      } else {
        keyRoot.set(key, i);
      }
    });
  });

  const groups = new Map();
  parents.forEach((p, i) => {
    const root = find(uf, i);
    const arr = groups.get(root) || [];
    arr.push(p);
    groups.set(root, arr);
  });
  return [...groups.values()];
}

/**
 * Skjul dobbelt foresatt (invite-placeholder + uid-doc, samme e-post/telefon/navn).
 */
export function dedupeFamilyParents(list) {
  const groups = groupParentsByIdentity(list);
  return groups
    .map((group) => [...group].sort((a, b) => parentCanonicalScore(b) - parentCanonicalScore(a))[0])
    .filter(Boolean)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'nb'));
}

/**
 * Arkiver overflødige invite-placeholders når samme person finnes flere ganger.
 * Henter ferske docs fra Firestore (ikke UI-dedupet liste). Idempotent.
 */
export async function archiveSupersededParentPlaceholders(familyId, parentsHint = null) {
  if (!familyId) return 0;
  let parents = parentsHint;
  if (!Array.isArray(parents) || parents.length < 2) {
    try {
      const snap = await getDocs(collection(db, 'families', familyId, 'parents'));
      parents = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {
      return 0;
    }
  }
  if (!Array.isArray(parents) || parents.length < 2) return 0;

  const groups = groupParentsByIdentity(parents);
  let archived = 0;
  const now = serverTimestamp();

  for (const group of groups) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => parentCanonicalScore(b) - parentCanonicalScore(a));
    const keep = ranked[0];
    for (const p of ranked.slice(1)) {
      if (!p.id || p.id === keep.id) continue;
      try {
        await updateDoc(doc(db, 'families', familyId, 'parents', p.id), {
          deleted: true,
          archived: true,
          active: false,
          placeholder: true,
          supersededBy: keep.id,
          migratedToUid: keep.uid || keep.id,
          updatedAt: now,
        });
        archived += 1;
      } catch { /* ignore permission / missing */ }
    }
  }
  return archived;
}

/** Pending invite on a family parent doc (existing-user or classic placeholder). */
export function isPendingMemberInvite(person) {
  if (!person) return false;
  if (person.inviteStatus === 'pending') return true;
  if (person.placeholder === true && person.inviteStatus !== 'accepted' && person.inviteStatus !== 'declined') {
    return person.active === false;
  }
  return false;
}

/**
 * Resolve a real Auth uid for a pending parent invite.
 * Returns null for classic new-user placeholders that have no matching account yet.
 */
export async function resolveInviteeUidForActivation(parent, parentId) {
  if (!parent && !parentId) return null;
  const p = parent || {};
  if (p.inviteKind === 'existing') {
    return p.uid || parentId || null;
  }
  for (const id of [p.email, p.username, p.usernameLower]) {
    if (!id) continue;
    const found = await findExistingAdultByIdentifier(id);
    if (found?.uid) return found.uid;
  }
  if (p.uid) {
    const profile = await loadUserProfile(p.uid);
    if (profile) return p.uid;
  }
  if (parentId) {
    const profile = await loadUserProfile(parentId);
    if (profile) return parentId;
  }
  return null;
}

/** Ensure invitee has users/{uid}/familyInvites/{inviteId} + optional in-app notification. */
async function ensureInviteeFamilyInviteInbox({
  familyId,
  inviteId,
  inviteeUid,
  invitedBy,
  inviteeName,
  inviteeEmail,
  inviteeUsername,
  asAdmin,
  familyName,
  groupType,
  notify = true,
}) {
  if (!familyId || !inviteId || !inviteeUid) return;
  const now = serverTimestamp();
  const payload = {
    status: 'pending',
    inviteKind: 'existing',
    inviteeUid,
    inviteeName: inviteeName || '',
    inviteeEmail: inviteeEmail || '',
    inviteeUsername: inviteeUsername || '',
    invitedBy: invitedBy || null,
    asAdmin: !!asAdmin,
    familyId,
    familyName: familyName || '',
    groupType: groupType || 'family',
    inviteId,
    updatedAt: now,
    createdAt: now,
  };
  await setDoc(doc(db, 'users', inviteeUid, 'familyInvites', inviteId), payload, { merge: true });
  if (notify) {
    const copy = groupInviteCopy(groupType, familyName);
    await notifyUsers([inviteeUid], {
      eventType: 'familyInvite',
      title: copy.title,
      body: `Du er invitert til «${copy.bodyName}» på ProTop. Godta eller avslå invitasjonen.`,
      familyId,
      inviteId,
      createdBy: invitedBy || null,
      notificationId: `familyInvite_${familyId}_${inviteId}`,
    }).catch(() => {});
  }
}

/**
 * Admin "Aktiver" on a pending invite must grant real membership (members + familyIds),
 * otherwise the invitee cannot switch to the family in settings.
 */
async function adminCompletePendingMemberInvite({ familyId, parentId, parent }) {
  const now = serverTimestamp();
  const inviteeUid = await resolveInviteeUidForActivation(parent, parentId);
  if (!inviteeUid) {
    // Classic new-user placeholder — flip active until they register/claim.
    await updateDoc(doc(db, 'families', familyId, 'parents', parentId), {
      active: true,
      archived: false,
      updatedAt: now,
    });
    return { completedMembership: false };
  }

  await activateExistingMember({
    familyId,
    inviteeUid,
    inviteeName: parent.name || '',
    inviteeEmail: parent.email || '',
    asAdmin: !!parent.admin,
    now,
  });

  let inviteId = parent.inviteId || null;
  if (!inviteId) {
    try {
      const pendingSnap = await getDocs(
        query(
          collection(db, 'families', familyId, 'memberInvites'),
          where('inviteeUid', '==', inviteeUid),
          where('status', '==', 'pending'),
          limit(1),
        ),
      );
      if (!pendingSnap.empty) inviteId = pendingSnap.docs[0].id;
    } catch { /* ignore */ }
  }

  if (inviteId) {
    await updateDoc(doc(db, 'families', familyId, 'memberInvites', inviteId), {
      status: 'accepted',
      acceptedAt: now,
      acceptedBy: inviteeUid,
      activatedByAdmin: true,
      updatedAt: now,
    }).catch(() => {});
    await setDoc(doc(db, 'users', inviteeUid, 'familyInvites', inviteId), {
      status: 'accepted',
      acceptedAt: now,
      updatedAt: now,
    }, { merge: true }).catch(() => {});
  }

  // Email/phone placeholder docs must not keep showing as a second pending person.
  if (parentId && parentId !== inviteeUid) {
    await updateDoc(doc(db, 'families', familyId, 'parents', parentId), {
      active: false,
      archived: true,
      deleted: true,
      placeholder: false,
      inviteStatus: 'accepted',
      supersededBy: inviteeUid,
      updatedAt: now,
    }).catch(() => {});
  }

  return { completedMembership: true, inviteeUid };
}

/**
 * Strip family membership indexes so the user cannot list or open the family.
 * Does not touch the families/{id}/parents|children doc itself.
 *
 * Note: clearing users/{uid} and parents/{uid} familyIds only succeeds when the
 * signed-in user is the member (self-leave) or via Admin SDK. Family admins
 * still revoke access by updating families.members/adminUids + the parent doc;
 * Firestore rules and listMyFamilies deny access even if familyIds is stale.
 */
export async function revokeMemberFamilyAccess({ familyId, uid }) {
  if (!familyId || !uid) return;
  const now = serverTimestamp();
  await updateDoc(doc(db, 'families', familyId), {
    members: arrayRemove(uid),
    adminUids: arrayRemove(uid),
    updatedAt: now,
  }).catch(() => {});

  const clearIndex = async (collectionName) => {
    const ref = doc(db, collectionName, uid);
    const snap = await getDoc(ref).catch(() => null);
    if (!snap?.exists()) return;
    const data = snap.data() || {};
    const patch = {
      familyIds: arrayRemove(familyId),
      updatedAt: now,
    };
    if (data.familyId === familyId) patch.familyId = null;
    if (data.activeFamilyId === familyId) patch.activeFamilyId = null;
    await updateDoc(ref, patch).catch(() => {});
  };
  await Promise.all([clearIndex('users'), clearIndex('parents')]);
}

/**
 * Ensure uid is on family.members / activeUsers so collection LIST rules
 * (isFamilyMemberLite) succeed. Parent/child docs alone grant GET/create via
 * isFamilyMember, but LIST of chats/messages requires the lite index.
 * Safe to call repeatedly; no-op when already listed.
 */
export { ensureListedOnFamily, isListedOnFamilyData } from './familyMembership';

/** Re-grant membership indexes after reactivation. */
export async function restoreMemberFamilyAccess({ familyId, uid, asAdmin = false }) {
  if (!familyId || !uid) return;
  const now = serverTimestamp();
  const famPatch = {
    members: arrayUnion(uid),
    activeUsers: arrayUnion(uid),
    updatedAt: now,
  };
  if (asAdmin) famPatch.adminUids = arrayUnion(uid);
  await updateDoc(doc(db, 'families', familyId), famPatch).catch(() => {});

  await setDoc(doc(db, 'users', uid), {
    familyIds: arrayUnion(familyId),
    updatedAt: now,
  }, { merge: true }).catch(() => {});
  await setDoc(doc(db, 'parents', uid), {
    familyIds: arrayUnion(familyId),
    familyId,
    active: true,
    updatedAt: now,
  }, { merge: true }).catch(() => {});
}

/**
 * Soft-delete a parent in the family: mark deleted + revoke all access indexes.
 * Used by Family Dashboard / Parent Profile.
 */
export async function softDeleteParentFromFamily({ familyId, parentRefs, uid }) {
  if (!familyId) return;
  const now = serverTimestamp();
  const refs = (parentRefs || []).filter(Boolean);
  if (refs.length) {
    const batch = writeBatch(db);
    refs.forEach((r) => batch.set(r, {
      deleted: true,
      active: false,
      archived: true,
      leftAt: now,
      updatedAt: now,
    }, { merge: true }));
    await batch.commit();
  }
  if (uid) await revokeMemberFamilyAccess({ familyId, uid });
}

export async function setMemberActive({ familyId, role, id, active }) {
  const col = role === 'child' ? 'children' : 'parents';

  if (active && role !== 'child' && familyId && id) {
    const parentSnap = await getDoc(doc(db, 'families', familyId, 'parents', id));
    if (parentSnap.exists()) {
      const parent = parentSnap.data() || {};
      if (isPendingMemberInvite(parent)) {
        await adminCompletePendingMemberInvite({ familyId, parentId: id, parent });
        return;
      }
    }
  }

  const uid = id;
  let asAdmin = false;
  if (role !== 'child' && uid) {
    const parentSnap = await getDoc(doc(db, 'families', familyId, 'parents', uid)).catch(() => null);
    asAdmin = !!(parentSnap?.exists() && parentSnap.data()?.admin === true);
  }

  await updateDoc(doc(db, 'families', familyId, col, id), {
    active,
    archived: !active,
    ...(active
      ? { leftAt: null, deleted: false }
      : {}),
    updatedAt: serverTimestamp(),
  });
  if (role === 'child') {
    await updateDoc(doc(db, 'children', id), { active, archived: !active }).catch(() => {});
  } else {
    await updateDoc(doc(db, 'parents', id), { active, archived: !active }).catch(() => {});
  }

  // Deactivated / reactivated adults must lose / regain family membership indexes.
  // Otherwise Firestore rules that key off members[] / familyIds keep granting access.
  if (role !== 'child' && uid) {
    if (active) {
      await restoreMemberFamilyAccess({ familyId, uid, asAdmin });
    } else {
      await revokeMemberFamilyAccess({ familyId, uid });
    }
  }
}

export async function setMemberAdmin({ familyId, uid, admin }) {
  if (!uid) return;
  const parentRef = doc(db, 'families', familyId, 'parents', uid);
  const snap = await getDoc(parentRef);
  const data = snap.exists() ? (snap.data() || {}) : {};
  if (normalizeAdultRole(data.adultRole, { asGrandparent: data.isGrandparent }) === 'grandparent') {
    // Besteforeldre kan ikke være admin
    await updateDoc(parentRef, { admin: false, updatedAt: serverTimestamp() }).catch(() => {});
    await updateDoc(doc(db, 'families', familyId), {
      adminUids: arrayRemove(uid),
      updatedAt: serverTimestamp(),
    }).catch(() => {});
    return;
  }
  await updateDoc(parentRef, { admin, updatedAt: serverTimestamp() });
  await updateDoc(doc(db, 'families', familyId), {
    adminUids: admin ? arrayUnion(uid) : arrayRemove(uid),
    updatedAt: serverTimestamp(),
  });
}

/** Overstyr voksenrolle (foresatt ↔ besteforeldre) og valgfrie modulinvitasjoner. */
export async function setMemberAdultRole({
  familyId,
  uid,
  asGrandparent,
  adultRole = null,
  grandparentModules = null,
}) {
  if (!familyId || !uid) return;
  const roleFields = adultRoleFields({ asGrandparent, adultRole, grandparentModules });
  const patch = {
    ...roleFields,
    updatedAt: serverTimestamp(),
  };
  if (roleFields.isGrandparent) {
    patch.admin = false;
    patch.superAdmin = false;
  }
  if (grandparentModules && typeof grandparentModules === 'object') {
    patch.grandparentModules = grandparentModules;
  } else if (roleFields.isGrandparent && grandparentModules === null) {
    // behold eksisterende modules — ikke overskriv med undefined
    delete patch.grandparentModules;
  }
  await updateDoc(doc(db, 'families', familyId, 'parents', uid), patch);
  if (roleFields.isGrandparent) {
    await updateDoc(doc(db, 'families', familyId), {
      adminUids: arrayRemove(uid),
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }
  await setDoc(doc(db, 'parents', uid), {
    adultRole: roleFields.adultRole,
    isGrandparent: roleFields.isGrandparent,
    updatedAt: serverTimestamp(),
  }, { merge: true }).catch(() => {});
}

export async function setMemberGrandparentModules({ familyId, uid, grandparentModules }) {
  if (!familyId || !uid || !grandparentModules) return;
  await updateDoc(doc(db, 'families', familyId, 'parents', uid), {
    grandparentModules,
    updatedAt: serverTimestamp(),
  });
}

export async function removeMemberFromGroup({ familyId, role, member, wipePersonal }) {
  const col = role === 'child' ? 'children' : 'parents';
  const id = member.uid || member.id;
  const email = member.email;
  const phone = member.phone;
  const keepProfile = hasContact(email, phone) && !wipePersonal;

  if (keepProfile) {
    await updateDoc(doc(db, 'families', familyId, col, id), {
      active: false,
      deleted: false,
      leftAt: serverTimestamp(),
      familyId: null,
    });
    await revokeMemberFamilyAccess({ familyId, uid: id });
    return { keptProfile: true };
  }

  if (role === 'child') {
    try {
      const todos = await getDocs(collection(db, 'families', familyId, 'children', id, 'todos'));
      await Promise.all(todos.docs.map((d) => deleteDoc(d.ref)));
    } catch {}
    await deleteDoc(doc(db, 'families', familyId, 'children', id)).catch(() => {});
    await setDoc(doc(db, 'children', id), { deleted: true, active: false, familyId: null, wipedAt: serverTimestamp() }, { merge: true });
  } else {
    await deleteDoc(doc(db, 'families', familyId, 'parents', id)).catch(() => {});
  }
  await revokeMemberFamilyAccess({ familyId, uid: id });
  const uname = normalizeUsername(member.username || member.usernameLower || '');
  if (uname) await deleteDoc(doc(db, 'usernames', uname)).catch(() => {});
  return { keptProfile: false };
}

export async function getFamily(familyId) {
  const snap = await getDoc(doc(db, 'families', familyId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

function profileFromDocs(uid, userData = {}, parentData = {}) {
  if (!uid) return null;
  const email = String(userData.email || parentData.email || '').toLowerCase().trim();
  const username = String(
    userData.username || userData.usernameLower || parentData.username || parentData.usernameLower || '',
  ).trim();
  const name = String(
    userData.displayName || userData.name || parentData.name || parentData.displayName || '',
  ).trim();
  return {
    uid,
    email,
    username: username || '',
    usernameLower: normalizeUsername(username) || '',
    name: name || (email ? email.split('@')[0] : username) || 'Bruker',
    phone: String(userData.phone || parentData.phone || '').trim(),
    photoURL: userData.photoURL || parentData.photoURL || null,
    avatarId: userData.avatarId || parentData.avatarId || null,
  };
}

async function loadUserProfile(uid) {
  if (!uid) return null;
  const [userSnap, parentSnap] = await Promise.all([
    getDoc(doc(db, 'users', uid)).catch(() => null),
    getDoc(doc(db, 'parents', uid)).catch(() => null),
  ]);
  const userData = userSnap?.exists() ? userSnap.data() : {};
  const parentData = parentSnap?.exists() ? parentSnap.data() : {};
  if (!userSnap?.exists() && !parentSnap?.exists()) return null;
  return profileFromDocs(uid, userData, parentData);
}

/** Finn eksisterende voksen bruker via e-post, telefon eller brukernavn. */
export async function findExistingAdultByIdentifier(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return null;
  const classified = classifyInviteIdentifier(raw);

  // Prefer server lookup — clients can no longer list arbitrary users/parents.
  try {
    const fn = httpsCallable(functions, 'lookupAdultProfile');
    const lookupValue = classified.kind === 'phone'
      ? (classified.value || raw)
      : (classified.kind === 'email' ? classified.value : raw);
    const res = await fn({ identifier: lookupValue });
    if (res?.data?.ok && res.data.profile?.uid) {
      return res.data.profile;
    }
    if (res?.data?.ok) return null;
  } catch {
    /* fall through to local best-effort */
  }

  // E-post/telefon krever Admin SDK — uten servertreff finnes ingen klient-fallback.
  if (classified.kind === 'email' || classified.kind === 'phone') {
    return null;
  }

  const u = classified.kind === 'username' ? classified.value : normalizeUsername(raw);
  if (!u || u.length < 3) return null;
  try {
    const unameSnap = await getDoc(doc(db, 'usernames', u));
    if (unameSnap.exists()) {
      const data = unameSnap.data() || {};
      if (data.type === 'child') return null;
      const uid = data.uid;
      if (!uid) return null;
      // Username map is enough for invite flow when profile docs are private.
      return {
        uid,
        email: data.email || '',
        username: data.username || u,
        usernameLower: u,
        name: data.username || u,
        phone: '',
        photoURL: null,
        avatarId: null,
      };
    }
  } catch {}
  return null;
}

async function assertCanInviteToFamily(familyId, inviterUid) {
  const famSnap = await getDoc(doc(db, 'families', familyId));
  if (!famSnap.exists() || isGroupDeleted(famSnap.data())) {
    throw new Error('Familien er slettet og kan ikke invitere nye medlemmer.');
  }
  const family = { id: famSnap.id, ...famSnap.data() };
  if (!isGroupAdmin(family, inviterUid)) {
    throw new Error('Kun administrator kan invitere.');
  }
  return family;
}

/**
 * Inviter en eksisterende bruker til familien.
 * Personen må akseptere før medlemskap aktiveres.
 */
export async function inviteExistingAdult({
  familyId,
  identifier,
  inviteeUid: inviteeUidHint,
  createdBy,
  asAdmin = false,
  asGrandparent = false,
  adultRole = null,
  grandparentModules = null,
  familyName,
  groupType,
  deliveryEmail,
  deliveryPhone,
  email,
  phone,
}) {
  if (!familyId || !createdBy) throw new Error('missing-params');
  const family = await assertCanInviteToFamily(familyId, createdBy);

  let invitee = null;
  if (inviteeUidHint) {
    invitee = await loadUserProfile(inviteeUidHint);
  }
  if (!invitee && identifier) {
    invitee = await findExistingAdultByIdentifier(identifier);
  }
  if (!invitee?.uid) throw new Error('user-not-found');
  if (invitee.uid === createdBy) throw new Error('cannot-invite-self');

  const members = Array.isArray(family.members) ? family.members : [];
  if (members.includes(invitee.uid)) throw new Error('already-member');

  const existingParent = await getDoc(doc(db, 'families', familyId, 'parents', invitee.uid));
  if (existingParent.exists()) {
    const p = existingParent.data() || {};
    if (p.deleted !== true && p.active !== false && p.placeholder !== true) {
      throw new Error('already-member');
    }
    if (p.inviteStatus === 'pending' && p.inviteKind === 'existing') {
      throw new Error('invite-pending');
    }
  }

  const pendingSnap = await getDocs(
    query(
      collection(db, 'families', familyId, 'memberInvites'),
      where('inviteeUid', '==', invitee.uid),
      where('status', '==', 'pending'),
      limit(1),
    ),
  );
  if (!pendingSnap.empty) throw new Error('invite-pending');

  const now = serverTimestamp();
  const resolvedName = familyName || family.name || '';
  const resolvedType = groupType || family.type || 'family';
  const copy = groupInviteCopy(resolvedType, resolvedName);
  const inviteRef = doc(collection(db, 'families', familyId, 'memberInvites'));
  const roleFields = adultRoleFields({ asGrandparent, adultRole, grandparentModules });
  const asAdminEffective = !!asAdmin && !roleFields.isGrandparent;

  // Leveranse bruker kontakt oppgitt av inviterer (GDPR: profil returnerer ikke e-post/telefon).
  const emailForDelivery = (() => {
    const typed = String(deliveryEmail || email || '').trim().toLowerCase();
    if (typed && isValidEmail(typed)) return typed;
    if (invitee.email && isValidEmail(invitee.email)) return String(invitee.email).toLowerCase();
    return '';
  })();
  const phoneForDelivery = (() => {
    const typed = normalizePhone(deliveryPhone || phone || '') || String(deliveryPhone || phone || '').trim();
    if (hasValidPhone(typed)) return typed;
    if (hasValidPhone(invitee.phone)) return normalizePhone(invitee.phone) || invitee.phone;
    return '';
  })();

  const invitePayload = {
    status: 'pending',
    inviteKind: 'existing',
    inviteeUid: invitee.uid,
    inviteeName: invitee.name,
    inviteeEmail: emailForDelivery || invitee.email || '',
    inviteeUsername: invitee.username || '',
    invitedBy: createdBy,
    asAdmin: asAdminEffective,
    adultRole: roleFields.adultRole,
    asGrandparent: roleFields.isGrandparent,
    familyId,
    familyName: resolvedName,
    groupType: resolvedType,
    createdAt: now,
    updatedAt: now,
  };

  const parentPayload = {
    uid: invitee.uid,
    name: invitee.name,
    email: emailForDelivery || invitee.email || '',
    phone: phoneForDelivery || invitee.phone || '',
    username: invitee.username || '',
    usernameLower: invitee.usernameLower || '',
    photoURL: invitee.photoURL || '',
    avatarId: invitee.avatarId || null,
    familyId,
    createdBy,
    createdAt: now,
    invitedAt: now,
    inviteStatus: 'pending',
    inviteKind: 'existing',
    inviteId: inviteRef.id,
    active: false,
    emailVerified: true,
    placeholder: true,
    admin: asAdminEffective,
    superAdmin: false,
    deleted: false,
    archived: false,
    ...roleFields,
  };

  const batch = writeBatch(db);
  batch.set(inviteRef, invitePayload);
  batch.set(doc(db, 'families', familyId, 'parents', invitee.uid), parentPayload, { merge: true });
  batch.set(doc(db, 'users', invitee.uid, 'familyInvites', inviteRef.id), {
    ...invitePayload,
    inviteId: inviteRef.id,
  }, { merge: true });
  await batch.commit();

  await notifyUsers([invitee.uid], {
    eventType: 'familyInvite',
    title: copy.title,
    body: `Du er invitert til «${copy.bodyName}» på ProTop. Godta eller avslå invitasjonen.`,
    familyId,
    inviteId: inviteRef.id,
    createdBy,
    notificationId: `familyInvite_${familyId}_${inviteRef.id}`,
  }).catch(() => {});

  const acceptUrl = familyInviteAcceptUrl({ familyId, inviteId: inviteRef.id });
  let emailSent = false;
  let emailError = null;
  let smsSent = false;
  let smsError = null;

  if (emailForDelivery) {
    try {
      await sendParentInvite({
        email: emailForDelivery,
        name: invitee.name,
        familyId,
        familyName: resolvedName,
        groupType: resolvedType,
        registerUrl: acceptUrl,
        existingUser: true,
        inviteKind: 'existing',
      });
      emailSent = true;
      await writeInviteDeliveryStatus({
        familyId,
        parentId: invitee.uid,
        email: emailForDelivery,
        delivery: { emailSent: true, emailError: null },
      });
    } catch (err) {
      emailError = err?.message || 'Kunne ikke sende e-post';
      await writeInviteDeliveryStatus({
        familyId,
        parentId: invitee.uid,
        email: emailForDelivery,
        delivery: { emailSent: false, emailError },
      });
    }
  }

  if (phoneForDelivery) {
    try {
      await sendParentInviteSms({
        phone: phoneForDelivery,
        name: invitee.name,
        familyId,
        familyName: resolvedName,
        groupType: resolvedType,
        registerUrl: acceptUrl,
        existingUser: true,
        inviteKind: 'existing',
      });
      smsSent = true;
      await writeInviteDeliveryStatus({
        familyId,
        parentId: invitee.uid,
        phone: phoneForDelivery,
        delivery: { smsSent: true, smsError: null, phone: phoneForDelivery },
      });
    } catch (err) {
      smsError = err?.message || 'Kunne ikke sende SMS';
      await writeInviteDeliveryStatus({
        familyId,
        parentId: invitee.uid,
        phone: phoneForDelivery,
        delivery: { smsSent: false, smsError, phone: phoneForDelivery },
      });
    }
  }

  return {
    inviteId: inviteRef.id,
    invitee,
    existingUser: true,
    emailSent,
    emailError,
    smsSent,
    smsError,
    inviteStatus: 'pending',
  };
}

/** Inviter voksen: eksisterende bruker får forespørsel; ellers klassisk ny-bruker-invitasjon. */
export async function inviteAdultSmart(params) {
  const { email, username, identifier, phone, name } = params || {};
  const candidates = inviteLookupCandidates({ email, phone, identifier, username });

  for (const lookup of candidates) {
    const existing = await findExistingAdultByIdentifier(lookup);
    if (existing?.uid) {
      return inviteExistingAdult({
        ...params,
        identifier: lookup,
        inviteeUid: existing.uid,
        deliveryEmail: email,
        deliveryPhone: phone,
      });
    }
  }

  // Brukernavn uten treff og uten kontakt → ikke fall tilbake til ny-bruker-flyt
  const onlyUsername = candidates.length > 0
    && candidates.every((c) => classifyInviteIdentifier(c).kind === 'username')
    && !hasContact(email, phone);
  if (onlyUsername) throw new Error('user-not-found');

  if (!hasContact(email, phone)) throw new Error('contact-required');
  return inviteAdult({
    ...params,
    name: name || (email ? String(email).split('@')[0] : 'Foresatt'),
  });
}

async function activateExistingMember({
  familyId, inviteeUid, inviteeName, inviteeEmail, asAdmin, now,
  asGrandparent = false, adultRole = null, grandparentModules = null,
}) {
  const roleFields = adultRoleFields({ asGrandparent, adultRole, grandparentModules });
  const asAdminEffective = !!asAdmin && !roleFields.isGrandparent;
  const parentPayload = {
    uid: inviteeUid,
    name: inviteeName || '',
    email: (inviteeEmail || '').toLowerCase(),
    active: true,
    placeholder: false,
    inviteStatus: 'accepted',
    acceptedAt: now,
    updatedAt: now,
    deleted: false,
    archived: false,
    admin: asAdminEffective,
    ...roleFields,
  };
  await setDoc(doc(db, 'families', familyId, 'parents', inviteeUid), parentPayload, { merge: true });

  const famPatch = {
    members: arrayUnion(inviteeUid),
    updatedAt: now,
  };
  if (asAdminEffective) famPatch.adminUids = arrayUnion(inviteeUid);
  if (inviteeEmail) famPatch.invitedEmails = arrayRemove(String(inviteeEmail).toLowerCase());
  await updateDoc(doc(db, 'families', familyId), famPatch);

  await setDoc(doc(db, 'parents', inviteeUid), {
    uid: inviteeUid,
    name: inviteeName || '',
    email: (inviteeEmail || '').toLowerCase(),
    familyIds: arrayUnion(familyId),
    role: asAdminEffective ? 'admin' : 'parent',
    active: true,
    updatedAt: now,
    ...roleFields,
  }, { merge: true });

  await setDoc(doc(db, 'users', inviteeUid), {
    uid: inviteeUid,
    displayName: inviteeName || '',
    email: (inviteeEmail || '').toLowerCase(),
    familyIds: arrayUnion(familyId),
    updatedAt: now,
  }, { merge: true });
}

export async function acceptFamilyMemberInvite({ familyId, inviteId, uid }) {
  if (!familyId || !inviteId || !uid) throw new Error('missing-params');
  const inviteRef = doc(db, 'families', familyId, 'memberInvites', inviteId);
  const inviteSnap = await getDoc(inviteRef);
  if (!inviteSnap.exists()) throw new Error('not-found');
  const invite = inviteSnap.data() || {};
  if (invite.inviteeUid !== uid) throw new Error('forbidden');
  if (invite.status !== 'pending') throw new Error('already-handled');

  const famSnap = await getDoc(doc(db, 'families', familyId));
  if (!famSnap.exists() || isGroupDeleted(famSnap.data())) {
    throw new Error('Familien er slettet.');
  }

  const now = serverTimestamp();
  await activateExistingMember({
    familyId,
    inviteeUid: uid,
    inviteeName: invite.inviteeName,
    inviteeEmail: invite.inviteeEmail,
    asAdmin: !!invite.asAdmin,
    asGrandparent: !!invite.asGrandparent || invite.adultRole === 'grandparent',
    adultRole: invite.adultRole || null,
    now,
  });

  await updateDoc(inviteRef, {
    status: 'accepted',
    acceptedAt: now,
    acceptedBy: uid,
    updatedAt: now,
  });
  await setDoc(doc(db, 'users', uid, 'familyInvites', inviteId), {
    status: 'accepted',
    acceptedAt: now,
    updatedAt: now,
  }, { merge: true }).catch(() => {});

  if (invite.invitedBy) {
    await notifyUsers([invite.invitedBy], {
      eventType: 'familyInviteAccepted',
      title: 'Invitasjon akseptert',
      body: `${invite.inviteeName || 'Noen'} ble med i «${invite.familyName || 'familien'}».`,
      familyId,
      inviteId,
      createdBy: uid,
    }).catch(() => {});
  }

  return { familyId, familyName: invite.familyName || famSnap.data()?.name || '' };
}

export async function declineFamilyMemberInvite({ familyId, inviteId, uid }) {
  if (!familyId || !inviteId || !uid) throw new Error('missing-params');
  const inviteRef = doc(db, 'families', familyId, 'memberInvites', inviteId);
  const inviteSnap = await getDoc(inviteRef);
  if (!inviteSnap.exists()) throw new Error('not-found');
  const invite = inviteSnap.data() || {};
  if (invite.inviteeUid !== uid) throw new Error('forbidden');
  if (invite.status !== 'pending') throw new Error('already-handled');

  const now = serverTimestamp();
  await updateDoc(inviteRef, {
    status: 'declined',
    declinedAt: now,
    declinedBy: uid,
    updatedAt: now,
  });
  await setDoc(doc(db, 'users', uid, 'familyInvites', inviteId), {
    status: 'declined',
    declinedAt: now,
    updatedAt: now,
  }, { merge: true }).catch(() => {});

  await updateDoc(doc(db, 'families', familyId, 'parents', uid), {
    inviteStatus: 'declined',
    active: false,
    archived: true,
    deleted: true,
    updatedAt: now,
  }).catch(() => {});

  if (invite.invitedBy) {
    await notifyUsers([invite.invitedBy], {
      eventType: 'familyInviteDeclined',
      title: 'Invitasjon avslått',
      body: `${invite.inviteeName || 'Noen'} avslo invitasjonen til «${invite.familyName || 'familien'}».`,
      familyId,
      inviteId,
      createdBy: uid,
    }).catch(() => {});
  }

  return { familyId };
}

export function listenIncomingFamilyInvites(uid, cb) {
  if (!uid) {
    cb([]);
    return () => {};
  }
  const qy = query(
    collection(db, 'users', uid, 'familyInvites'),
    where('status', '==', 'pending'),
  );

  return listenAfterAccess(uid, (onErr) => onSnapshot(qy, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, inviteId: d.id, ...d.data() }));
    list.sort((a, b) => {
      const at = a.createdAt?.toMillis?.() || 0;
      const bt = b.createdAt?.toMillis?.() || 0;
      return bt - at;
    });
    cb(list);
  }, onErr), (err) => {
    if (err) {
      warnPermissionOnce(
        `familyInvites:${uid}`,
        '[listenIncomingFamilyInvites]',
        err?.code || err?.message || err,
      );
    }
    cb([]);
  });
}

export function listenFamilyMemberInvites(familyId, cb) {
  if (!familyId) {
    cb([]);
    return () => {};
  }
  const qy = query(
    collection(db, 'families', familyId, 'memberInvites'),
    orderBy('createdAt', 'desc'),
    limit(40),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function getFamilyMemberInvite(familyId, inviteId) {
  if (!familyId || !inviteId) return null;
  const snap = await getDoc(doc(db, 'families', familyId, 'memberInvites', inviteId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
