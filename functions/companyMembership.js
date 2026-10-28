/**
 * Medlemskap i bedriften når en ansettelse avsluttes eller tas opp igjen, og når en
 * person selv forlater bedriften. Reglene gir tilgang ut fra families.members og
 * medlemsdokumentet (families/{id}/parents/{uid}), så det er her tilgangen faktisk stenges.
 *
 * setEmploymentStatus: setter status (og ev. sluttdato) på medarbeideren, eller sletter den
 *   permanent, og fjerner eller gir tilbake medlemskapet i samme operasjon. Avslutning fjerner
 *   uid fra members/activeUsers/memberIds/adminUids, setter medlemsdokumentet til active:false
 *   med leftAt, sletter accessAcl/{uid}, trekker tilbake ventende invitasjoner og logger ut
 *   personen (revokeRefreshTokens). Reaktivering legger medlemskapet tilbake, uten admin med
 *   mindre nivået er Administrator, og aldri for den som har gått selv.
 * withdrawEmployeeInvite: trekker tilbake en sendt bedriftsinvitasjon.
 * leaveCompany: personen forlater bedriften selv.
 *
 * Bare eier, administrator (adminUids) eller den som har Admin på Ansatte eller Tilgangsstyring
 * i den speilede tilgangen (accessAcl, eller samme beregning når speilet mangler) kan endre
 * andres ansettelse. Selvskrevne felt som parents.admin brukes ikke.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { allows } from '../src/access/companyAccess.js';
import { aclFor, aclIsFresh } from '../src/iso/aclSync.js';
import { employmentStatusOf, isActiveEmployee, todayKey } from '../src/employees/employmentState.js';
import { emptyInvite, normalizeInviteState } from '../src/employees/invite.js';
import {
  companyMemberIds,
  inviteBelongsTo,
  inviteEmailsToRevoke,
  isCompanyOwnerUid,
  membershipEndedNotice,
  membershipPlan,
} from '../src/employees/membership.js';
import { isPendingPlaceholder } from '../src/utils/groupInviteLogic.js';
import { assertRateLimit, hashRateKey, requireAuth } from './security.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

const CALL = {
  region: 'europe-west1',
  timeoutSeconds: 60,
  memory: '256MiB',
  cors: true,
  invoker: 'public',
};

/** Byttes ut i emulatortester (der finnes ikke Auth). */
export const membershipDeps = {
  revokeTokens: (uid) => getAuth().revokeRefreshTokens(uid),
};

const STATUSES = new Set(['active', 'leave', 'inactive', 'deleted']);

function text(value) {
  return String(value ?? '').trim();
}

function cleanId(value) {
  const id = text(value);
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : '';
}

function live(family) {
  return !!family && family.deleted !== true && family.hiddenFromApp !== true;
}

function companyLabel(family) {
  return text(family?.company?.navn || family?.name) || 'bedriften';
}

function personName(employee) {
  const person = employee?.person || {};
  return [person.firstName, person.lastName].map(text).filter(Boolean).join(' ');
}

/** åååå-mm-dd, dd.mm.åååå eller tom (fjerner sluttdatoen). null = ugyldig. */
function periodDate(value) {
  const raw = text(value);
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;
  const nb = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (nb) return `${nb[3]}-${nb[2].padStart(2, '0')}-${nb[1].padStart(2, '0')}`;
  return null;
}

async function companyEmployees(companyId) {
  const snap = await db.collection(`families/${companyId}/employees`).get();
  return snap.docs.map((row) => ({ ...row.data(), id: row.id }));
}

/**
 * Hvem som kan endre andres ansettelse: eier, administrator, eller Admin på Ansatte eller
 * Tilgangsstyring. Rettighetene leses fra accessAcl (skrevet av serveren). Mangler speilet
 * (bedrifter uten ISO), regnes de ut på samme måte som syncCompanyAccess gjør.
 */
async function actorRights(companyId, family, uid, employees = null) {
  if (isCompanyOwnerUid(family, uid)) return { ok: true, owner: true, admin: true };
  const admin = Array.isArray(family?.adminUids) && family.adminUids.includes(uid);
  if (!companyMemberIds(family).has(uid)) return { ok: false, owner: false, admin: false };
  if (admin) return { ok: true, owner: false, admin: true };
  const aclSnap = await db.doc(`families/${companyId}/accessAcl/${uid}`).get();
  let acl = aclSnap.exists ? aclSnap.data() : null;
  if (!aclIsFresh(acl)) {
    acl = aclFor({ family, employees: employees || await companyEmployees(companyId), uid });
  }
  const grants = acl?.grants || {};
  const ok = allows(grants, 'employees', 'write') || allows(grants, 'accessControl', 'write');
  return { ok, owner: false, admin: false };
}

async function notify(uid, payload) {
  const to = text(uid);
  if (!to) return;
  await db.collection(`users/${to}/notifications`).add({
    eventType: payload.eventType,
    title: payload.title,
    body: payload.body,
    familyId: payload.familyId || null,
    createdBy: payload.createdBy || null,
    createdAt: FieldValue.serverTimestamp(),
    seen: false,
  }).catch((error) => {
    logger.warn('membership notification failed', { message: error?.message });
  });
}

async function displayNameOf(uid) {
  if (!uid) return '';
  const snap = await db.doc(`users/${uid}`).get().catch(() => null);
  const data = snap?.exists ? snap.data() || {} : {};
  return text(data.displayName || data.name);
}

/**
 * Trekk tilbake ventende invitasjoner for personen: memberInvites og innboksen settes til
 * «revoked», e-posten tas av invitasjonslisten og ventende plassholdere ryddes.
 */
async function revokePendingInvites({
  companyId, family, uid = '', emails = [], at, actorUid,
}) {
  const batch = db.batch();
  let count = 0;
  const listed = companyMemberIds(family);
  const snap = await db.collection(`families/${companyId}/memberInvites`).where('status', '==', 'pending').get();
  for (const row of snap.docs) {
    const invite = row.data() || {};
    if (!inviteBelongsTo(invite, { uid, emails })) continue;
    batch.update(row.ref, { status: 'revoked', revokedAt: at, revokedBy: actorUid, updatedAt: at });
    const invitee = text(invite.inviteeUid);
    if (invitee) {
      batch.set(db.doc(`users/${invitee}/familyInvites/${row.id}`), {
        status: 'revoked', revokedAt: at, updatedAt: at,
      }, { merge: true });
      // Plassholderen for en eksisterende bruker frigjøres, så personen kan inviteres på nytt.
      if (!listed.has(invitee)) {
        const memberSnap = await db.doc(`families/${companyId}/parents/${invitee}`).get();
        const member = memberSnap.exists ? memberSnap.data() || {} : null;
        if (member && (member.placeholder === true || member.inviteStatus === 'pending')) {
          batch.set(memberSnap.ref, { inviteStatus: 'revoked', active: false, updatedAt: at }, { merge: true });
        }
      }
    }
    count += 1;
  }
  for (const email of emails) {
    const placeholders = await db.collection(`families/${companyId}/parents`).where('email', '==', email).get();
    for (const row of placeholders.docs) {
      if (row.id === uid || !isPendingPlaceholder(row.data(), email)) continue;
      batch.set(row.ref, {
        inviteStatus: 'revoked', placeholder: true, active: false, deleted: true, archived: true, updatedAt: at,
      }, { merge: true });
    }
  }
  if (emails.length) {
    batch.update(db.doc(`families/${companyId}`), { invitedEmails: FieldValue.arrayRemove(...emails), updatedAt: at });
  }
  await batch.commit();
  return count;
}

/** Fjern personen fra bedriften: medlemslister, medlemsdokument, speilet tilgang og indekser. */
async function removeMembership({ companyId, uid, at, actorUid, reason }) {
  const batch = db.batch();
  batch.update(db.doc(`families/${companyId}`), {
    members: FieldValue.arrayRemove(uid),
    activeUsers: FieldValue.arrayRemove(uid),
    memberIds: FieldValue.arrayRemove(uid),
    adminUids: FieldValue.arrayRemove(uid),
    updatedAt: at,
  });
  batch.set(db.doc(`families/${companyId}/parents/${uid}`), {
    uid,
    active: false,
    admin: false,
    leftAt: at,
    leftReason: reason,
    endedBy: actorUid,
    updatedAt: at,
  }, { merge: true });
  batch.delete(db.doc(`families/${companyId}/accessAcl/${uid}`));
  const [userSnap, parentSnap] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`parents/${uid}`).get(),
  ]);
  for (const snap of [userSnap, parentSnap]) {
    if (!snap.exists) continue;
    const data = snap.data() || {};
    const patch = { familyIds: FieldValue.arrayRemove(companyId), updatedAt: at };
    if (data.familyId === companyId) patch.familyId = null;
    if (data.activeFamilyId === companyId) patch.activeFamilyId = null;
    batch.set(snap.ref, patch, { merge: true });
  }
  await batch.commit();
}

/** Legg medlemskapet tilbake. Ikke for den som gikk selv eller aldri har vært medlem. */
async function restoreMembership({ companyId, uid, admin, at }) {
  const memberRef = db.doc(`families/${companyId}/parents/${uid}`);
  const memberSnap = await memberRef.get();
  const member = memberSnap.exists ? memberSnap.data() || {} : null;
  if (!member || member.leftReason === 'self' || member.inviteStatus === 'declined') return false;
  const batch = db.batch();
  const familyPatch = {
    members: FieldValue.arrayUnion(uid),
    activeUsers: FieldValue.arrayUnion(uid),
    updatedAt: at,
  };
  if (admin) familyPatch.adminUids = FieldValue.arrayUnion(uid);
  batch.update(db.doc(`families/${companyId}`), familyPatch);
  batch.set(memberRef, {
    active: true,
    deleted: false,
    archived: false,
    placeholder: false,
    inviteStatus: 'accepted',
    admin: !!admin,
    leftAt: FieldValue.delete(),
    leftReason: FieldValue.delete(),
    endedBy: FieldValue.delete(),
    restoredAt: at,
    updatedAt: at,
  }, { merge: true });
  batch.set(db.doc(`users/${uid}`), { familyIds: FieldValue.arrayUnion(companyId), updatedAt: at }, { merge: true });
  batch.set(db.doc(`parents/${uid}`), { familyIds: FieldValue.arrayUnion(companyId), updatedAt: at }, { merge: true });
  await batch.commit();
  return true;
}

async function signOut(uid) {
  try {
    await membershipDeps.revokeTokens(uid);
  } catch (error) {
    logger.warn('revokeRefreshTokens failed', { uid, message: error?.message });
  }
}

/**
 * Sett status på en medarbeider (eller slett permanent) og la medlemskapet følge.
 * data: { companyId, employeeId, employeeCompanyId?, status?, periodTo?, purge? }
 */
export const setEmploymentStatus = onCall(CALL, async (req) => {
  const actor = requireAuth(req.auth);
  const companyId = cleanId(req.data?.companyId);
  const employeeId = cleanId(req.data?.employeeId);
  const sourceId = cleanId(req.data?.employeeCompanyId) || companyId;
  const status = text(req.data?.status);
  const purge = req.data?.purge === true;
  const hasPeriod = Object.prototype.hasOwnProperty.call(req.data || {}, 'periodTo');
  const periodTo = hasPeriod ? periodDate(req.data.periodTo) : undefined;
  if (!companyId || !employeeId) throw new HttpsError('invalid-argument', 'Mangler bedrift eller medarbeider.');
  if (status && !STATUSES.has(status)) throw new HttpsError('invalid-argument', 'Ukjent status.');
  if (periodTo === null) throw new HttpsError('invalid-argument', '«Ansatt til» må skrives som dd.mm.åååå.');
  await assertRateLimit(db, {
    key: hashRateKey(['employment-status', actor]),
    limit: 300,
    windowMs: 60 * 60 * 1000,
  });

  const familyRef = db.doc(`families/${companyId}`);
  const familySnap = await familyRef.get();
  const family = familySnap.exists ? familySnap.data() || {} : null;
  if (!live(family)) throw new HttpsError('not-found', 'Fant ikke bedriften.');
  const employees = await companyEmployees(companyId);
  const rights = await actorRights(companyId, family, actor, employees);
  if (!rights.ok) {
    throw new HttpsError('permission-denied', 'Bare eier, administrator eller den som har Admin på Ansatte kan avslutte eller aktivere en ansettelse.');
  }
  if (sourceId !== companyId) {
    const sourceSnap = await db.doc(`families/${sourceId}`).get();
    const source = sourceSnap.exists ? sourceSnap.data() || {} : null;
    if (!live(source) || !(await actorRights(sourceId, source, actor)).ok) {
      throw new HttpsError('permission-denied', 'Du kan ikke endre ansatte i dette selskapet.');
    }
  }
  const employeeRef = db.doc(`families/${sourceId}/employees/${employeeId}`);
  const employeeSnap = await employeeRef.get();
  if (!employeeSnap.exists) throw new HttpsError('not-found', 'Fant ikke medarbeideren.');
  const before = { ...employeeSnap.data(), id: employeeId };
  const now = new Date();
  const at = now.toISOString();

  const company = { ...(before.company || {}) };
  if (status) company.status = status;
  if (hasPeriod) company.periodTo = periodTo;
  if (purge) company.status = 'deleted';
  const after = { ...before, company };
  const closing = !isActiveEmployee(after, { now });
  const roster = sourceId === companyId
    ? employees.map((row) => (row.id === employeeId ? after : row))
    : [...employees, after];
  const plan = membershipPlan({ family, employee: after, employees: roster, now });

  if (closing && plan.action === 'owner') {
    throw new HttpsError('failed-precondition', 'Eieren av bedriften kan ikke deaktiveres.');
  }
  if (closing && plan.uid && plan.uid === actor && plan.action === 'remove') {
    throw new HttpsError('failed-precondition', 'Du kan ikke avslutte din egen konto her. Bruk «Forlat bedriften» på Min side.');
  }
  if (closing && plan.action === 'remove' && !rights.admin && (family.adminUids || []).includes(plan.uid)) {
    throw new HttpsError('permission-denied', 'Bare eier eller administrator kan avslutte en administrator.');
  }
  if (purge && employmentStatusOf(before) !== 'deleted') {
    throw new HttpsError('failed-precondition', 'Flytt medarbeideren til papirkurven før du sletter permanent.');
  }

  // 1. Medarbeideren. Permanent sletting tar med personnummer, pårørende og kommentar
  // (employeesPrivate) og det HR har delt på Min side (hrSelf), så en ny post med samme id
  // ikke arver dem (den som er koblet til posten, leser dem, SEC-26).
  if (purge) {
    const batch = db.batch();
    batch.delete(employeeRef);
    batch.delete(db.doc(`families/${sourceId}/employeesPrivate/${employeeId}`));
    batch.delete(db.doc(`families/${sourceId}/hrSelf/${employeeId}`));
    await batch.commit();
  } else {
    const patch = { updatedAt: at };
    if (status && status !== employmentStatusOf(before)) patch['company.status'] = status;
    if (hasPeriod && text(before.company?.periodTo) !== periodTo) patch['company.periodTo'] = periodTo;
    if (closing) {
      patch['company.canLogin'] = false;
      if (status && status !== employmentStatusOf(before)) patch['company.accessOverrides'] = {};
      const invite = normalizeInviteState(before.invite);
      // En invitasjon som ikke er besvart, gjelder ikke lenger.
      if (invite.status === 'sent' || invite.status === 'queued') {
        patch.invite = { ...emptyInvite(), email: invite.email, accessLevel: invite.accessLevel };
      }
    }
    if (Object.keys(patch).length > 1) await employeeRef.update(patch);
  }

  // 2. Invitasjoner som ikke er besvart.
  let revokedInvites = 0;
  if (closing) {
    revokedInvites = await revokePendingInvites({
      companyId,
      family,
      uid: plan.uid,
      emails: inviteEmailsToRevoke(after, roster),
      at,
      actorUid: actor,
    });
  }

  // 3. Medlemskapet.
  let membership = plan.action === 'none' ? 'none' : 'kept';
  if (plan.action === 'remove') {
    await removeMembership({ companyId, uid: plan.uid, at, actorUid: actor, reason: 'ended' });
    membership = 'removed';
    if (plan.listed) {
      await signOut(plan.uid);
      const actorName = await displayNameOf(actor);
      await notify(plan.uid, {
        eventType: 'companyMembershipEnded',
        ...membershipEndedNotice(companyLabel(family), actorName),
        familyId: companyId,
        createdBy: actor,
      });
    }
  } else if (plan.action === 'restore') {
    membership = await restoreMembership({ companyId, uid: plan.uid, admin: plan.admin, at })
      ? 'restored'
      : 'needs-invite';
  }
  logger.info('[setEmploymentStatus]', {
    companyId, employeeId, status: company.status, purge, membership, revokedInvites,
  });
  return {
    ok: true,
    status: purge ? 'purged' : employmentStatusOf(after),
    active: !closing,
    membership,
    revokedInvites,
  };
});

/** Trekk tilbake en sendt bedriftsinvitasjon. Medarbeideren står igjen som «Ikke invitert». */
export const withdrawEmployeeInvite = onCall(CALL, async (req) => {
  const actor = requireAuth(req.auth);
  const companyId = cleanId(req.data?.companyId);
  const employeeId = cleanId(req.data?.employeeId);
  if (!companyId || !employeeId) throw new HttpsError('invalid-argument', 'Mangler bedrift eller medarbeider.');
  await assertRateLimit(db, {
    key: hashRateKey(['invite-withdraw', actor]),
    limit: 120,
    windowMs: 60 * 60 * 1000,
  });
  const familySnap = await db.doc(`families/${companyId}`).get();
  const family = familySnap.exists ? familySnap.data() || {} : null;
  if (!live(family)) throw new HttpsError('not-found', 'Fant ikke bedriften.');
  const employees = await companyEmployees(companyId);
  if (!(await actorRights(companyId, family, actor, employees)).ok) {
    throw new HttpsError('permission-denied', 'Bare den som kan invitere, kan trekke tilbake en invitasjon.');
  }
  const employee = employees.find((row) => row.id === employeeId);
  if (!employee) throw new HttpsError('not-found', 'Fant ikke medarbeideren.');
  const invite = normalizeInviteState(employee.invite);
  if (invite.status === 'accepted') {
    throw new HttpsError('failed-precondition', 'Invitasjonen er allerede godtatt. Deaktiver kontoen i stedet.');
  }
  const at = new Date().toISOString();
  // Bare en eksisterende bruker som ikke er medlem, kan ha en ventende invitasjon på uid.
  const listed = companyMemberIds(family);
  const inviteeUid = invite.parentKey && !listed.has(invite.parentKey) ? invite.parentKey : '';
  const revoked = await revokePendingInvites({
    companyId,
    family,
    uid: inviteeUid,
    emails: inviteEmailsToRevoke(employee, employees),
    at,
    actorUid: actor,
  });
  await db.doc(`families/${companyId}/employees/${employeeId}`).update({
    invite: { ...emptyInvite(), email: invite.email, accessLevel: invite.accessLevel },
    updatedAt: at,
  });
  return { ok: true, revokedInvites: revoked };
});

/**
 * Forlat bedriften selv. Eieren kan ikke gå (overfør eller slett bedriften i stedet).
 * Ansettelsen markeres som avsluttet, og administratorene får beskjed.
 */
export const leaveCompany = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const companyId = cleanId(req.data?.companyId);
  if (!companyId) throw new HttpsError('invalid-argument', 'Mangler bedrift.');
  await assertRateLimit(db, {
    key: hashRateKey(['company-leave', uid]),
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  const familySnap = await db.doc(`families/${companyId}`).get();
  const family = familySnap.exists ? familySnap.data() || {} : null;
  if (!family) throw new HttpsError('not-found', 'Fant ikke bedriften.');
  if (isCompanyOwnerUid(family, uid)) {
    throw new HttpsError('failed-precondition', 'Eieren kan ikke forlate bedriften. Overfør eierskapet eller slett bedriften.');
  }
  const memberSnap = await db.doc(`families/${companyId}/parents/${uid}`).get();
  if (!companyMemberIds(family).has(uid) && !memberSnap.exists) {
    return { ok: true, already: true };
  }
  const at = new Date().toISOString();
  const employees = await companyEmployees(companyId);
  const mine = employees.filter((row) => text(row.personUid) === uid);
  for (const row of mine) {
    if (!isActiveEmployee(row)) continue;
    const patch = { 'company.status': 'inactive', 'company.canLogin': false, updatedAt: at };
    if (!text(row.company?.periodTo)) patch['company.periodTo'] = todayKey(new Date(at));
    await db.doc(`families/${companyId}/employees/${row.id}`).update(patch);
  }
  await removeMembership({ companyId, uid, at, actorUid: uid, reason: 'self' });
  const name = personName(mine[0]) || text(req.auth?.token?.name) || await displayNameOf(uid) || 'En medarbeider';
  const admins = new Set([family.ownerUid, family.ownerId, ...(family.adminUids || [])].map(text).filter(Boolean));
  admins.delete(uid);
  await Promise.all([...admins].map((to) => notify(to, {
    eventType: 'companyMemberLeft',
    title: 'Har forlatt bedriften',
    body: `${name} har forlatt «${companyLabel(family)}». Ansettelsen er satt til deaktivert.`,
    familyId: companyId,
    createdBy: uid,
  })));
  logger.info('[leaveCompany]', { companyId, employees: mine.length });
  return { ok: true, companyName: companyLabel(family) };
});
