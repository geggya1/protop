/**
 * Brukslogg. IP og user-agent leses fra forespørselen, ikke fra klienten.
 * Hendelser eldre enn 90 dager slettes ved innlogging og når loggen leses.
 * Bedriften kan slå av logging av innlogging, aktivitet og sidevisninger
 * (company.privacy.usageLog). Timer og invitasjoner logges alltid.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { allows, grantsForEmployee } from '../src/access/companyAccess.js';
import { aclFor, aclIsFresh, companyMemberUids } from '../src/iso/aclSync.js';
import { isOrganizationType } from '../src/utils/groupTypes.js';
import { assertFamilyMember, assertRateLimit, hashRateKey, requireAuth } from './security.js';
import {
  applyUsageSummary,
  clientIpFromHeaders,
  normalizeUsageEvent,
  sanitizeIp,
} from '../src/employees/usage.js';
import {
  USAGE_RETENTION_DAYS,
  usageCutoffIso,
  usageEventAllowed,
  usageLogNotice,
  withinUsageRetention,
} from '../src/privacy/companyPrivacy.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

const CALL = {
  region: 'europe-west1',
  timeoutSeconds: 20,
  memory: '256MiB',
  cors: true,
  invoker: 'public',
};

function requestMeta(req) {
  const headers = req?.rawRequest?.headers || {};
  const forwarded = clientIpFromHeaders(headers);
  const socketIp = sanitizeIp(req?.rawRequest?.ip || '');
  return {
    ip: forwarded || socketIp,
    userAgent: String(headers['user-agent'] || '').slice(0, 180),
  };
}

const INACTIVE = ['deleted', 'inactive', 'former'];

/**
 * Bedriften og den innloggedes ansattpost. Hele ansattlisten lastes bare når den trengs
 * (allEmployees, f.eks. når tilgangsspeilet må skrives på nytt); før ble den lest ved hver
 * hendelse, også sidevisninger.
 */
async function companyContext(companyId, uid) {
  const [fam, ownSnap] = await Promise.all([
    assertFamilyMember(db, companyId, uid),
    db.collection(`families/${companyId}/employees`).where('personUid', '==', uid).limit(10).get(),
  ]);
  const data = fam.data() || {};
  const adminUids = Array.isArray(data.adminUids) ? data.adminUids : [];
  const owner = data.ownerUid === uid || data.ownerId === uid || data.createdBy === uid;
  const admin = owner || adminUids.includes(uid);
  const own = ownSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  const linked = own.find((row) => !INACTIVE.includes(row.company?.status)) || null;
  const grants = linked ? grantsForEmployee(data.company?.accessPolicy, linked) : null;
  let all = null;
  return {
    data,
    admin,
    linked,
    grants,
    async employee(id) {
      if (!id) return null;
      const hit = own.find((row) => row.id === id);
      if (hit) return hit;
      const snap = await db.doc(`families/${companyId}/employees/${id}`).get();
      return snap.exists ? { id: snap.id, ...snap.data() } : null;
    },
    async allEmployees() {
      if (!all) {
        const snap = await db.collection(`families/${companyId}/employees`).get();
        all = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      }
      return all;
    },
  };
}

function canWriteEmployees(ctx) {
  return ctx.admin || !!(ctx.grants && allows(ctx.grants, 'employees', 'read'));
}

function canLogHoursOn(ctx, employee, uid) {
  if (!employee) return false;
  if (employee.personUid === uid) return true;
  if (ctx.admin) return true;
  return !!(ctx.grants && allows(ctx.grants, 'hoursOthers', 'read'));
}

/** Slett hendelser eldre enn lagringstiden. Begrenset per kall, resten tas neste gang. */
export async function pruneUsage(collectionRef, now = new Date(), limit = 200) {
  const old = await collectionRef.where('at', '<', usageCutoffIso(now)).limit(limit).get();
  await Promise.all(old.docs.map((item) => item.ref.delete()));
  return old.size;
}

async function pruneQuietly(collectionRef) {
  try {
    await pruneUsage(collectionRef);
  } catch (err) {
    console.warn('[usageLog] prune failed', err?.message || err);
  }
}

export async function writeUsageEvent(database, input, { trusted = false } = {}) {
  const event = normalizeUsageEvent(input, {
    at: input?.at || new Date().toISOString(),
    ip: input?.ip || '',
    userAgent: input?.userAgent || '',
    actorUid: input?.actorUid || '',
  });
  if (!event?.actorUid) return null;
  const stamp = event.at;
  const userLog = database.collection(`users/${event.actorUid}/usage`);
  const userRef = database.doc(`users/${event.actorUid}`);
  const [, userSnap] = await Promise.all([
    userLog.add({
      ...event,
      createdAt: FieldValue.serverTimestamp(),
    }),
    userRef.get(),
  ]);
  if (event.type === 'login') await pruneQuietly(userLog);
  const userSummary = applyUsageSummary(userSnap.data()?.usage, event);
  await userRef.set({ usage: userSummary, updatedAt: stamp }, { merge: true });

  if (!trusted || !event.companyId || !event.employeeId) return event;
  const employeeRef = database.doc(`families/${event.companyId}/employees/${event.employeeId}`);
  const employeeSnap = await employeeRef.get();
  if (!employeeSnap.exists) return event;
  const employeeSummary = applyUsageSummary(employeeSnap.data()?.usage, event);
  await employeeRef.update({
    usage: employeeSummary,
    updatedAt: stamp,
  });
  await employeeRef.collection('usage').add({
    ...event,
    createdAt: FieldValue.serverTimestamp(),
  });
  if (event.type === 'login') await pruneQuietly(employeeRef.collection('usage'));
  return event;
}

/** Speilet fornyes når det har mindre enn dette igjen (som i appen, src/access/accessMirror.js). */
const ACL_REFRESH_MS = 3 * 3600 * 1000;

/**
 * Tilgangsspeilet (accessAcl) trengs for HR, fravær, faktura og ansatte. Eldre apper ber ikke om
 * det (bare ISO gjorde det), men de logger aktivitet hit. Mangler den innloggedes speil, eller går
 * det ut innen tre timer, skrives det på nytt for denne personen, med samme beregning som
 * syncCompanyAccess (aclFor). Administratorlisten røres ikke. Gir true når speilet ble skrevet.
 */
export async function refreshCallerAcl(database, companyId, uid, ctx, now = new Date()) {
  const family = ctx?.data || {};
  if (!companyId || !uid || !isOrganizationType(family.type) || !companyMemberUids(family).includes(uid)) return false;
  const ref = database.doc(`families/${companyId}/accessAcl/${uid}`);
  const snap = await ref.get();
  if (snap.exists && aclIsFresh(snap.data(), new Date(now.getTime() + ACL_REFRESH_MS))) return false;
  const employees = typeof ctx?.allEmployees === 'function' ? await ctx.allEmployees() : (ctx?.employees || []);
  await ref.set({ ...aclFor({ family, employees, uid, now }), source: 'function' });
  return true;
}

/** Endringsspor (timer, invitasjoner) har egen grense, så sidevisninger ikke fortrenger dem. */
const CHANGE_TYPES = new Set(['hour', 'hour_deleted', 'invite_sent']);

export const recordUsage = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const type = String(req.data?.type || '');
  const change = CHANGE_TYPES.has(type);
  const meta = requestMeta(req);
  const companyId = String(req.data?.companyId || '').trim();
  let employeeId = String(req.data?.employeeId || '').trim();
  let trusted = false;
  // Grensen og bedriftsoppslaget kjøres samtidig.
  const [, ctx] = await Promise.all([
    assertRateLimit(db, {
      key: hashRateKey([change ? 'usage-change' : 'usage', uid]),
      limit: change ? 600 : 180,
      windowMs: 60 * 60 * 1000,
    }),
    companyId ? companyContext(companyId, uid) : null,
  ]);
  if (companyId) {
    // Eldre apper fornyer ikke tilgangsspeilet selv (REV-13). Feil her stopper ikke loggingen.
    await refreshCallerAcl(db, companyId, uid, ctx).catch(() => false);
    // Bedriften har slått av aktivitetsloggen: lagre ingenting, verken hos brukeren eller den ansatte.
    if (!usageEventAllowed(ctx.data.company, type)) return { ok: true, skipped: 'company-off' };
    if (type === 'hour' || type === 'hour_deleted') {
      const employee = await ctx.employee(employeeId);
      if (!canLogHoursOn(ctx, employee, uid)) {
        throw new HttpsError('permission-denied', 'Du kan ikke logge timer for denne medarbeideren.');
      }
      trusted = true;
    } else if (type === 'invite_sent') {
      const employee = await ctx.employee(employeeId);
      if (!employee || !canWriteEmployees(ctx)) {
        throw new HttpsError('permission-denied', 'Du kan ikke logge invitasjonen.');
      }
      trusted = true;
    } else if (ctx.linked?.id) {
      employeeId = ctx.linked.id;
      trusted = true;
    } else {
      employeeId = '';
    }
  } else {
    employeeId = '';
  }
  await writeUsageEvent(db, {
    type,
    companyId,
    employeeId,
    summary: req.data?.summary,
    detail: req.data?.detail,
    actorUid: uid,
    at: new Date().toISOString(),
    ip: meta.ip,
    userAgent: meta.userAgent,
  }, { trusted });
  return { ok: true };
});

export const listEmployeeUsage = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const companyId = String(req.data?.companyId || '').trim();
  const employeeId = String(req.data?.employeeId || '').trim();
  if (!companyId || !employeeId) throw new HttpsError('invalid-argument', 'Mangler medarbeider.');
  const ctx = await companyContext(companyId, uid);
  const employee = await ctx.employee(employeeId);
  if (!employee) throw new HttpsError('not-found', 'Fant ikke medarbeideren.');
  const self = employee.personUid === uid;
  if (!self && !canWriteEmployees(ctx)) {
    throw new HttpsError('permission-denied', 'Du kan ikke se denne bruksloggen.');
  }
  const log = db.collection(`families/${companyId}/employees/${employeeId}/usage`);
  await pruneQuietly(log);
  const snap = await log
    .orderBy('at', 'desc')
    .limit(40)
    .get();
  const events = withinUsageRetention(snap.docs.map((item) => {
    const data = item.data() || {};
    return {
      id: item.id,
      type: data.type || '',
      at: data.at || '',
      summary: data.summary || '',
      ip: data.ip || '',
      detail: data.detail || {},
    };
  }));
  return {
    ok: true,
    summary: employee.usage || {},
    events,
    retentionDays: USAGE_RETENTION_DAYS,
    notice: usageLogNotice(ctx.data.company),
  };
});
