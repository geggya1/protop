/**
 * Knytter en bruker som allerede har godtatt bedriftsinvitasjonen til medarbeideren.
 * Medlemskapet kommer fra Godta (respondGroupInvite). Her settes personUid,
 * innlogging og tilgangsnivået som ligger på ansettelsen. Ingen meldes inn her.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { levelById } from '../src/access/companyAccess.js';
import {
  assertRateLimit, emailTrusted, hashRateKey, requireAuth,
} from './security.js';
import { claimEmployeeSeatPlan } from '../src/employees/invite.js';
import { clientIpFromHeaders, sanitizeIp } from '../src/employees/usage.js';
import { writeUsageEvent } from './usageLog.js';
import { isConfirmedMember } from '../src/utils/groupInviteLogic.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

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

function displayName(employee) {
  const person = employee?.person || {};
  return [person.firstName, person.lastName].map(text).filter(Boolean).join(' ');
}

async function ensureCompanyMembership({
  companyId, uid, email, name, now, asAdmin,
}) {
  const familyPatch = {
    members: FieldValue.arrayUnion(uid),
    activeUsers: FieldValue.arrayUnion(uid),
    updatedAt: now,
  };
  if (asAdmin) familyPatch.adminUids = FieldValue.arrayUnion(uid);
  await db.doc(`families/${companyId}`).update(familyPatch);
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
  if (!parentSnap.exists) parentPatch.role = asAdmin ? 'admin' : 'parent';
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
    memberPatch.admin = !!asAdmin;
    memberPatch.superAdmin = false;
  } else if (asAdmin) {
    memberPatch.admin = true;
  }
  await memberRef.set(memberPatch, { merge: true });
}

export const claimEmployeeInvite = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const companyId = text(req.data?.familyId || req.data?.companyId);
  const authEmail = text(req.auth?.token?.email).toLowerCase();
  if (!companyId || !authEmail) return { ok: true, skipped: true };
  await assertRateLimit(db, {
    key: hashRateKey(['employee-invite-claim', uid]),
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  const companySnap = await db.doc(`families/${companyId}`).get();
  if (!companySnap.exists) return { ok: true, skipped: true };
  // Bare den som har godtatt invitasjonen, og med bekreftet e-post (eller Google/Microsoft/Apple),
  // knyttes til en ansatt.
  if (!isConfirmedMember(companySnap.data(), uid)) return { ok: true, skipped: true, needsAccept: true };
  if (!emailTrusted(req.auth)) return { ok: true, skipped: true, needsVerifiedEmail: true };
  const snap = await db.collection(`families/${companyId}/employees`).get();
  const employees = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
  const now = new Date().toISOString();
  const plan = claimEmployeeSeatPlan({
    employees,
    uid,
    authEmail,
    now,
    companyId,
  });
  if (plan.skipped) return { ok: true, skipped: true };
  if (!plan.ok) throw new HttpsError('failed-precondition', plan.error);
  const employee = employees.find((row) => row.id === plan.employeeId) || null;
  const companyName = text(companySnap.data()?.company?.navn || companySnap.data()?.name) || 'Bedriften';
  const name = displayName(employee) || text(req.auth?.token?.name);
  // Administrator gis bare når koblingen skjer. Kalles ved hver økt (UsageRecorder), og skal
  // ikke legge personen tilbake i adminUids etter at eieren har fjernet det.
  const asAdmin = !plan.already && plan.accessLevel === 'administrator';
  if (!plan.already && employee) {
    await db.doc(`families/${companyId}/employees/${plan.employeeId}`).update({
      personUid: uid,
      linkStatus: 'linked',
      'company.canLogin': true,
      'invite.status': 'accepted',
      'invite.acceptedAt': now,
      'invite.acceptedUid': uid,
      'invite.email': authEmail,
      'invite.accessLevel': plan.accessLevel || '',
      'invite.error': '',
      updatedAt: now,
    });
    await writeUsageEvent(db, {
      type: 'invite_accepted',
      companyId,
      employeeId: plan.employeeId,
      actorUid: uid,
      summary: `Kom inn i ${companyName}`,
      detail: { accessLevel: levelById(plan.accessLevel)?.label || plan.accessLevel || '' },
      at: now,
      ip: clientIp(req),
      userAgent: String(req.rawRequest?.headers?.['user-agent'] || '').slice(0, 180),
    }, { trusted: true }).catch((error) => {
      logger.warn('usage log for employee claim failed', { message: error?.message });
    });
  }
  await ensureCompanyMembership({
    companyId, uid, email: authEmail, name, now, asAdmin,
  });
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
