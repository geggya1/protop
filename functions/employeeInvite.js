/**
 * Sender medarbeiderinvitasjoner og knytter registrert bruker til bedriften
 * med tilgangsnivået som allerede ligger på ansettelsen.
 */
import { randomBytes } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { allows, grantsForEmployee, levelById } from '../src/access/companyAccess.js';
import { sendMail, friendlyMailError } from './mail.js';
import { resolveMailApiKey } from './mailApiKey.js';
import {
  assertFamilyMember,
  assertRateLimit,
  assertSafeAppContinueUrl,
  hashRateKey,
  redactEmail,
  requireAuth,
} from './security.js';
import {
  buildEmployeeInviteMessage,
  claimInvitePlan,
  employeeInviteUrl,
  inviteExpiry,
  placedAccessLevel,
} from '../src/employees/invite.js';
import { clientIpFromHeaders, sanitizeIp } from '../src/employees/usage.js';
import { writeUsageEvent } from './usageLog.js';

if (!getApps().length) initializeApp();
const db = getFirestore();
const adminAuth = getAuth();

const CALL = {
  region: 'europe-west1',
  timeoutSeconds: 60,
  memory: '256MiB',
  cors: true,
  invoker: 'public',
};

function text(value) {
  return String(value ?? '').trim();
}

function token() {
  return randomBytes(24).toString('base64url');
}

async function inviteContext(companyId, uid) {
  const fam = await assertFamilyMember(db, companyId, uid);
  const data = fam.data() || {};
  const adminUids = Array.isArray(data.adminUids) ? data.adminUids : [];
  const owner = data.ownerUid === uid || data.ownerId === uid || data.createdBy === uid;
  const admin = owner || adminUids.includes(uid);
  if (admin) return { data, admin: true };
  const snap = await db.collection(`families/${companyId}/employees`).where('personUid', '==', uid).limit(5).get();
  const linked = snap.docs.map((item) => item.data()).find((row) => !['deleted', 'inactive', 'former'].includes(row.company?.status));
  const grants = linked ? grantsForEmployee(data.company?.accessPolicy, linked) : null;
  if (!grants || !allows(grants, 'employees', 'write')) {
    throw new HttpsError('permission-denied', 'Du kan ikke invitere medarbeidere.');
  }
  return { data, admin: false };
}

async function emailHasAccount(email) {
  try {
    await adminAuth.getUserByEmail(email);
    return true;
  } catch (error) {
    if (error?.code === 'auth/user-not-found') return false;
    throw error;
  }
}

function displayName(employee) {
  const person = employee?.person || {};
  return [person.firstName, person.lastName].map(text).filter(Boolean).join(' ');
}

export const sendEmployeeInvites = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const companyId = text(req.data?.companyId);
  const employeeIds = [...new Set((Array.isArray(req.data?.employeeIds) ? req.data.employeeIds : []).map(text).filter(Boolean))];
  if (!companyId) throw new HttpsError('invalid-argument', 'Mangler bedrift.');
  if (!employeeIds.length) throw new HttpsError('invalid-argument', 'Ingen medarbeidere er valgt.');
  if (employeeIds.length > 40) throw new HttpsError('invalid-argument', 'Du kan invitere opptil 40 om gangen.');
  await assertRateLimit(db, {
    key: hashRateKey(['employee-invite', uid]),
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  const { data } = await inviteContext(companyId, uid);
  const companyName = text(data.company?.navn || data.name) || 'Bedriften';
  const apiKey = await resolveMailApiKey();
  const sent = [];
  const failed = [];
  const now = new Date().toISOString();

  for (const employeeId of employeeIds) {
    const ref = db.doc(`families/${companyId}/employees/${employeeId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      failed.push({ id: employeeId, error: 'Fant ikke medarbeideren.' });
      continue;
    }
    const employee = { id: snap.id, ...snap.data() };
    const status = text(employee.invite?.status);
    if (status !== 'queued' && status !== 'sent') {
      failed.push({ id: employeeId, error: 'Personen er ikke lagt klar til invitasjon.' });
      continue;
    }
    const email = text(employee.invite?.email || employee.company?.email || employee.person?.email).toLowerCase();
    const levelId = placedAccessLevel(employee);
    const level = levelById(levelId);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      failed.push({ id: employeeId, error: 'E-post mangler eller er ugyldig.' });
      continue;
    }
    if (!level) {
      failed.push({ id: employeeId, error: 'Tilgangsnivå mangler.' });
      continue;
    }
    if (['deleted', 'inactive', 'former'].includes(employee.company?.status)) {
      failed.push({ id: employeeId, error: 'Ansettelsen er ikke aktiv.' });
      continue;
    }
    const inviteToken = token();
    let existingUser = false;
    try {
      existingUser = await emailHasAccount(email);
    } catch (error) {
      failed.push({ id: employeeId, error: 'Kunne ikke sjekke om e-posten allerede har konto.' });
      logger.warn('employee invite lookup failed', { message: error?.message });
      continue;
    }
    const inviteDoc = {
      companyId,
      employeeId,
      email,
      accessLevel: level.id,
      status: 'pending',
      createdAt: now,
      expiresAt: inviteExpiry(now),
      createdBy: uid,
      existingUser,
    };
    const registerUrl = assertSafeAppContinueUrl(
      employeeInviteUrl({ email, companyId, token: inviteToken, existingUser }),
      employeeInviteUrl({ email, companyId, token: inviteToken, existingUser }),
    );
    const message = buildEmployeeInviteMessage({
      to: email,
      name: displayName(employee),
      companyName,
      accessLabel: level.label,
      registerUrl,
      existingUser,
    });
    try {
      await sendMail(apiKey, message);
    } catch (error) {
      const friendly = friendlyMailError(error);
      await ref.update({
        'invite.error': String(friendly).slice(0, 280),
        'invite.email': email,
        'invite.accessLevel': level.id,
        updatedAt: now,
      }).catch(() => {});
      failed.push({ id: employeeId, error: friendly });
      continue;
    }
    const batch = db.batch();
    batch.set(db.doc(`employeeInvites/${inviteToken}`), inviteDoc);
    batch.set(db.doc(`families/${companyId}/employeeInvites/${inviteToken}`), inviteDoc);
    batch.update(ref, {
      'invite.status': 'sent',
      'invite.email': email,
      'invite.accessLevel': level.id,
      'invite.sentAt': now,
      'invite.queuedAt': employee.invite?.queuedAt || now,
      'invite.error': '',
      updatedAt: now,
    });
    await batch.commit();
    await writeUsageEvent(db, {
      type: 'invite_sent',
      companyId,
      employeeId,
      actorUid: uid,
      summary: `Invitasjon sendt til ${email}`,
      detail: { accessLevel: level.label },
      at: now,
    }, { trusted: true }).catch((error) => {
      logger.warn('usage log for invite failed', { message: error?.message });
    });
    sent.push({ id: employeeId, email: redactEmail(email), existingUser });
  }

  return {
    ok: sent.length > 0,
    sent,
    failed,
    error: sent.length ? '' : (failed[0]?.error || 'Ingen invitasjoner ble sendt.'),
  };
});

async function ensureCompanyMembership({ companyId, uid, email, name, now }) {
  await db.doc(`families/${companyId}`).update({
    members: FieldValue.arrayUnion(uid),
    activeUsers: FieldValue.arrayUnion(uid),
    updatedAt: now,
  });
  const userRef = db.doc(`users/${uid}`);
  const parentRef = db.doc(`parents/${uid}`);
  const memberRef = db.doc(`families/${companyId}/parents/${uid}`);
  const [userSnap, parentSnap, memberSnap] = await Promise.all([
    userRef.get(),
    parentRef.get(),
    memberRef.get(),
  ]);
  const userPatch = {
    uid,
    email,
    familyIds: FieldValue.arrayUnion(companyId),
    updatedAt: now,
  };
  if (name && !text(userSnap.data()?.displayName)) userPatch.displayName = name;
  await userRef.set(userPatch, { merge: true });
  const parentPatch = {
    uid,
    email,
    active: true,
    familyIds: FieldValue.arrayUnion(companyId),
    updatedAt: now,
  };
  if (name && !text(parentSnap.data()?.name)) parentPatch.name = name;
  if (!parentSnap.exists) parentPatch.role = 'parent';
  await parentRef.set(parentPatch, { merge: true });
  const memberPatch = {
    uid,
    email,
    familyId: companyId,
    active: true,
    placeholder: false,
    inviteStatus: 'accepted',
    acceptedAt: now,
    deleted: false,
    archived: false,
    updatedAt: now,
  };
  if (name) memberPatch.name = name;
  if (!memberSnap.exists) {
    memberPatch.admin = false;
    memberPatch.superAdmin = false;
  }
  await memberRef.set(memberPatch, { merge: true });
}

export const claimEmployeeInvite = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const inviteToken = text(req.data?.token);
  if (!inviteToken || inviteToken.length > 80) {
    throw new HttpsError('invalid-argument', 'Invitasjonen mangler.');
  }
  await assertRateLimit(db, {
    key: hashRateKey(['employee-invite-claim', uid]),
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  const inviteSnap = await db.doc(`employeeInvites/${inviteToken}`).get();
  if (!inviteSnap.exists) throw new HttpsError('not-found', 'Invitasjonen finnes ikke.');
  const invite = inviteSnap.data() || {};
  const companyId = text(invite.companyId);
  const employeeId = text(invite.employeeId);
  const employeeSnap = companyId && employeeId
    ? await db.doc(`families/${companyId}/employees/${employeeId}`).get()
    : null;
  const employee = employeeSnap?.exists ? { id: employeeSnap.id, ...employeeSnap.data() } : null;
  const authEmail = text(req.auth?.token?.email).toLowerCase();
  const now = new Date().toISOString();
  const plan = claimInvitePlan({
    invite: { ...invite, companyId, employeeId },
    employee,
    uid,
    authEmail,
    now,
  });
  if (!plan.ok) throw new HttpsError('failed-precondition', plan.error);
  const companySnap = await db.doc(`families/${companyId}`).get();
  const companyName = text(companySnap.data()?.company?.navn || companySnap.data()?.name) || 'Bedriften';
  const name = displayName(employee) || text(req.auth?.token?.name);
  if (!plan.already) {
    await employeeSnap.ref.update({
      personUid: uid,
      linkStatus: 'linked',
      'company.canLogin': true,
      'invite.status': 'accepted',
      'invite.acceptedAt': now,
      'invite.acceptedUid': uid,
      'invite.email': text(invite.email).toLowerCase(),
      'invite.accessLevel': plan.accessLevel || '',
      'invite.error': '',
      updatedAt: now,
    });
    await inviteSnap.ref.set({
      status: 'accepted',
      acceptedAt: now,
      acceptedUid: uid,
    }, { merge: true });
    await db.doc(`families/${companyId}/employeeInvites/${inviteToken}`).set({
      status: 'accepted',
      acceptedAt: now,
      acceptedUid: uid,
    }, { merge: true });
  }
  await ensureCompanyMembership({ companyId, uid, email: authEmail, name, now });
  await writeUsageEvent(db, {
    type: 'invite_accepted',
    companyId,
    employeeId,
    actorUid: uid,
    summary: `Kom inn i ${companyName}`,
    detail: { accessLevel: levelById(plan.accessLevel)?.label || plan.accessLevel || '' },
    at: now,
    ip: clientIp(req),
    userAgent: String(req.rawRequest?.headers?.['user-agent'] || '').slice(0, 180),
  }, { trusted: true }).catch(() => {});
  return {
    ok: true,
    already: !!plan.already,
    companyId,
    companyName,
    accessLevel: plan.accessLevel || '',
    accessLabel: levelById(plan.accessLevel)?.label || '',
  };
});

function clientIp(req) {
  const headers = req?.rawRequest?.headers || {};
  return clientIpFromHeaders(headers) || sanitizeIp(req?.rawRequest?.ip || '');
}
