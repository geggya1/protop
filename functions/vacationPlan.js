/**
 * Ferieplan: utsending til ansatte og daglig påminnelse / purring / lås.
 * E-post går til arbeidseposten. Varsel i appen skrives med skipEmail
 * slik at den generelle varseltriggeren ikke sender en ekstra kopi.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { sendMail } from './mail.js';
import { resolveMailApiKey } from './mailApiKey.js';
import { allows, allowsHr, grantsForEmployee } from '../src/access/companyAccess.js';
import {
  assertFamilyMember,
  assertRateLimit,
  hashRateKey,
  isValidEmail,
  requireAuth,
} from './security.js';
import {
  buildAnnouncement,
  employeePlanEmails,
  employeePlanName,
  isPlanningEmployee,
  normalizeVacationPlan,
  osloToday,
  planSweep,
  vacationQuota,
} from '../src/arbeid/vacationPlan.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

const CALL = {
  region: 'europe-west1',
  cors: true,
  invoker: 'public',
  timeoutSeconds: 120,
  memory: '512MiB',
};

function companyIdFromPlanDoc(doc) {
  return doc.ref.parent?.parent?.id || '';
}

async function canManagePlan(companyId, uid) {
  const fam = await assertFamilyMember(db, companyId, uid);
  const data = fam.data() || {};
  const adminUids = Array.isArray(data.adminUids) ? data.adminUids : [];
  const admin = data.ownerUid === uid || data.ownerId === uid || data.createdBy === uid || adminUids.includes(uid);
  if (admin) return { fam, data };
  const snap = await db.collection(`families/${companyId}/employees`).where('personUid', '==', uid).limit(5).get();
  const linked = snap.docs.map((item) => ({ id: item.id, ...item.data() })).find((row) => isPlanningEmployee(row));
  const grants = linked ? grantsForEmployee(data.company?.accessPolicy, linked) : null;
  const allowed = !!(grants && (allows(grants, 'hoursOthers', 'write') || allowsHr(grants, 'write')));
  if (!allowed) throw new HttpsError('permission-denied', 'Bare HR eller leder kan sende ferieplanen.');
  return { fam, data };
}

async function loadEmployees(companyId) {
  const snap = await db.collection(`families/${companyId}/employees`).get();
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function companyDayHours(companyId) {
  try {
    const snap = await db.doc(`families/${companyId}/projects/state`).get();
    const hours = Number(snap.data()?.fullDayHours);
    return hours > 0 ? hours : 8;
  } catch {
    return 8;
  }
}

async function loadYearAbsences(companyId, year) {
  const snap = await db.collection(`families/${companyId}/absences`)
    .where('date', '>=', `${year}-01-01`)
    .where('date', '<=', `${year}-12-31`)
    .get();
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function deliverMessage({ companyId, employee, kind, year, subject, text, html, apiKey }) {
  const emails = new Set(employeePlanEmails(employee).filter((row) => isValidEmail(row)));
  const uid = String(employee.personUid || '').trim();
  let notified = 0;
  if (uid) {
    try {
      const userSnap = await db.doc(`users/${uid}`).get();
      const account = String(userSnap.data()?.email || '').trim().toLowerCase();
      if (isValidEmail(account)) emails.add(account);
    } catch {
      // Kontoen kan mangle. Arbeidseposten er nok.
    }
    const id = kind === 'announce'
      ? `vacation_${companyId}_${year}_${kind}_${employee.id}_${Date.now()}`
      : `vacation_${companyId}_${year}_${kind}_${employee.id}`;
    await db.doc(`users/${uid}/notifications/${id}`).set({
      eventType: 'vacationPlan',
      title: subject,
      body: String(text || '').slice(0, 700),
      familyId: companyId,
      skipEmail: true,
      seen: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    notified = 1;
  }
  let mailed = 0;
  if (!apiKey) return { mailed, notified, mailMissing: true };
  for (const to of emails) {
    await sendMail(apiKey, { to, name: employeePlanName(employee), subject, text, html });
    mailed += 1;
  }
  return { mailed, notified, mailMissing: false };
}

export async function publishPlanForCompany(companyId) {
  const ref = db.doc(`families/${companyId}/hr/vacationPlan`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('failed-precondition', 'Lagre ferieplanen før du sender den.');
  const plan = normalizeVacationPlan(snap.data() || {});
  const fam = await db.doc(`families/${companyId}`).get();
  const companyName = String(fam.data()?.company?.navn || fam.data()?.name || 'Bedriften');
  const employees = (await loadEmployees(companyId)).filter(isPlanningEmployee);
  const absences = await loadYearAbsences(companyId, plan.year);
  const apiKey = await resolveMailApiKey();
  let mailed = 0;
  let notified = 0;
  const failures = [];
  for (const employee of employees) {
    const quota = vacationQuota(employee, plan, { absences, today: osloToday(), dayHours: 8 });
    const message = buildAnnouncement({ companyName, employee, plan, quota });
    try {
      const sent = await deliverMessage({
        companyId,
        employee,
        kind: 'announce',
        year: plan.year,
        ...message,
        apiKey,
      });
      mailed += sent.mailed;
      notified += sent.notified;
      if (!sent.mailed && !sent.notified) failures.push(employeePlanName(employee));
    } catch (error) {
      failures.push(employeePlanName(employee));
      logger.warn('ferieplan utsending feilet', { companyId, message: error?.message });
    }
  }
  const announcedAt = plan.announcedAt || new Date().toISOString();
  await ref.set({ ...plan, announcedAt, active: !!(announcedAt && plan.planDeadline), companyId }, { merge: true });
  return {
    ok: failures.length === 0,
    sent: mailed,
    notified,
    employees: employees.length,
    failures,
    mailConfigured: !!apiKey,
    error: failures.length ? `Fikk ikke sendt til ${failures.slice(0, 3).join(', ')}.` : '',
  };
}

export async function sweepPlanForCompany(companyId, { today = osloToday() } = {}) {
  const ref = db.doc(`families/${companyId}/hr/vacationPlan`);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { claimed: false, plan: null };
    const data = snap.data() || {};
    if (data.lastSweepOn === today) return { claimed: false, plan: data };
    tx.set(ref, { lastSweepOn: today }, { merge: true });
    return { claimed: true, plan: data };
  });
  if (!claimed.plan) return { ok: true, skipped: true };
  if (!claimed.claimed) return { ok: true, skipped: true, plan: normalizeVacationPlan(claimed.plan) };
  const plan = normalizeVacationPlan(claimed.plan);
  if (!plan.active) return { ok: true, skipped: true, plan };
  const employees = await loadEmployees(companyId);
  const absences = await loadYearAbsences(companyId, plan.year);
  const dayHours = await companyDayHours(companyId);
  const swept = planSweep({ plan, employees, absences, today, dayHours });
  const apiKey = await resolveMailApiKey();
  let mailed = 0;
  let notified = 0;
  let notices = { ...swept.plan.notices };
  for (const message of swept.messages) {
    const employeeId = message.employee?.id;
    try {
      const sent = await deliverMessage({
        companyId,
        employee: message.employee,
        kind: message.kind,
        year: plan.year,
        subject: message.subject,
        text: message.text,
        html: message.html,
        apiKey,
      });
      mailed += sent.mailed;
      notified += sent.notified;
      if (!sent.mailed && !sent.notified) notices = clearNotice(notices, employeeId, message.kind);
    } catch (error) {
      notices = clearNotice(notices, employeeId, message.kind);
      logger.warn('ferieplan varsel feilet', { companyId, kind: message.kind, message: error?.message });
    }
  }
  const nextPlan = normalizeVacationPlan({ ...swept.plan, notices });
  await ref.set({ ...nextPlan, companyId, lastSweepOn: today }, { merge: true });
  return { ok: true, skipped: false, mailed, notified, messages: swept.messages.length, plan: nextPlan };
}

function clearNotice(notices, employeeId, kind) {
  if (!employeeId) return notices;
  const row = { ...(notices[employeeId] || {}) };
  if (kind === 'reminder') delete row.reminderAt;
  if (kind === 'dunning') delete row.dunningAt;
  if (kind === 'lock') delete row.lockAt;
  return { ...notices, [employeeId]: row };
}

export const publishVacationPlan = onCall(CALL, async (request) => {
  const uid = requireAuth(request.auth);
  const companyId = String(request.data?.companyId || '').trim();
  await canManagePlan(companyId, uid);
  await assertRateLimit(db, {
    key: hashRateKey(['vacation-plan', companyId]),
    limit: 8,
    windowMs: 60 * 60 * 1000,
  });
  return publishPlanForCompany(companyId);
});

export const sweepVacationPlan = onCall(CALL, async (request) => {
  const uid = requireAuth(request.auth);
  const companyId = String(request.data?.companyId || '').trim();
  await assertFamilyMember(db, companyId, uid);
  await assertRateLimit(db, {
    key: hashRateKey(['vacation-sweep', companyId, uid]),
    limit: 12,
    windowMs: 60 * 60 * 1000,
  });
  return sweepPlanForCompany(companyId);
});

export async function runVacationPlanSweep() {
  const snap = await db.collectionGroup('hr').where('active', '==', true).limit(400).get();
  let companies = 0;
  for (const doc of snap.docs) {
    if (doc.id !== 'vacationPlan' && doc.data()?.docKind !== 'vacationPlan') continue;
    const companyId = companyIdFromPlanDoc(doc);
    if (!companyId) continue;
    try {
      await sweepPlanForCompany(companyId);
      companies += 1;
    } catch (error) {
      logger.warn('ferieplan sweep feilet', { companyId, message: error?.message });
    }
  }
  logger.info('ferieplan sweep ferdig', { companies });
  return { ok: true, companies };
}

