/**
 * Innsynslogg (L-19): hvem åpnet en annens HR-mappe, lønn, fravær eller personnummer.
 * Serveren skriver loggen (tid, hvem og navn kan ikke settes av klienten) i
 * families/{id}/accessLog, og bare serveren leser den: eier, administratorer og Admin på HR
 * ser alt, den ansatte ser innsyn i egne opplysninger. Ingen verdier logges.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { allows, resolveActorAccess } from '../src/access/companyAccess.js';
import { accessLogDocId, normalizeAccessEvent } from '../src/hr/accessLog.js';
import {
  assertFamilyMember, assertRateLimit, hashRateKey, isFamilyOwnerOrAdmin, requireAuth,
} from './security.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

const CALL = {
  region: 'europe-west1',
  timeoutSeconds: 20,
  memory: '256MiB',
  cors: true,
  invoker: 'public',
};

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function employeeName(row) {
  const p = row?.person || {};
  return text([p.firstName, p.lastName].filter(Boolean).join(' '), 120) || text(row?.name, 120);
}

async function ownEmployees(store, familyId, uid) {
  const snap = await store.collection(`families/${familyId}/employees`).where('personUid', '==', uid).limit(5).get();
  return snap.docs.map((row) => ({ id: row.id, ...row.data() }));
}

/** Eier, administrator eller Admin på HR i tilgangsstyringen. */
export async function canReadAccessLog(store, familyId, uid, family) {
  if (isFamilyOwnerOrAdmin(family, uid)) return true;
  const employees = await ownEmployees(store, familyId, uid);
  const actor = resolveActorAccess({ policy: family?.company?.accessPolicy, employees, uid });
  return allows(actor.grants, 'hr', 'write');
}

/** Skriv én hendelse. Eget innsyn logges ikke. Svar: { ok, logged } */
export async function writeAccessEvent(store, { familyId, uid, actorName = '', event, now = Date.now() }) {
  const own = await ownEmployees(store, familyId, uid);
  if (event.employeeId && own.some((row) => row.id === event.employeeId)) return { ok: true, logged: false, own: true };
  let name = '';
  if (event.employeeId) {
    const snap = await store.doc(`families/${familyId}/employees/${event.employeeId}`).get();
    if (!snap.exists) return { ok: true, logged: false };
    name = employeeName(snap.data());
  }
  const id = accessLogDocId({ actorUid: uid, kind: event.kind, employeeId: event.employeeId }, now);
  try {
    await store.doc(`families/${familyId}/accessLog/${id}`).create({
      at: new Date(now).toISOString(),
      createdAt: FieldValue.serverTimestamp(),
      actorUid: uid,
      actorName: text(actorName, 120) || employeeName(own[0]) || 'Ukjent',
      kind: event.kind,
      employeeId: event.employeeId,
      employeeName: name,
    });
  } catch (error) {
    // Samme innsyn i samme vindu: allerede logget.
    if (error?.code === 6 || /already exists/i.test(String(error?.message || ''))) return { ok: true, logged: false, again: true };
    throw error;
  }
  return { ok: true, logged: true };
}

export const logSensitiveAccess = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const familyId = text(req.data?.familyId, 120);
  const event = normalizeAccessEvent(req.data);
  if (!familyId || familyId.includes('/') || !event) throw new HttpsError('invalid-argument', 'Mangler bedrift eller type.');
  await assertRateLimit(db, {
    key: hashRateKey(['access-log', uid]),
    limit: 600,
    windowMs: 60 * 60 * 1000,
  });
  await assertFamilyMember(db, familyId, uid);
  const actorName = text(req.auth?.token?.name) || text(req.auth?.token?.email);
  return writeAccessEvent(db, { familyId, uid, actorName, event });
});

/**
 * Loggen for bedriften (eier, administrator, Admin på HR), eller for én ansatt.
 * Den ansatte kan se innsyn i egne opplysninger.
 */
export const listAccessLog = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const familyId = text(req.data?.familyId, 120);
  const employeeId = text(req.data?.employeeId, 120);
  if (!familyId || familyId.includes('/') || employeeId.includes('/')) throw new HttpsError('invalid-argument', 'Mangler bedrift.');
  const fam = await assertFamilyMember(db, familyId, uid);
  const family = fam.data() || {};
  const admin = await canReadAccessLog(db, familyId, uid, family);
  if (!admin) {
    const own = await ownEmployees(db, familyId, uid);
    if (!employeeId || !own.some((row) => row.id === employeeId)) {
      throw new HttpsError('permission-denied', 'Du kan ikke se innsynsloggen.');
    }
  }
  const col = db.collection(`families/${familyId}/accessLog`);
  const snap = employeeId
    ? await col.where('employeeId', '==', employeeId).limit(300).get()
    : await col.orderBy('at', 'desc').limit(200).get();
  const rows = snap.docs.map((row) => {
    const data = row.data() || {};
    return {
      id: row.id,
      at: text(data.at, 40),
      actorName: text(data.actorName, 120),
      kind: text(data.kind, 40),
      employeeId: text(data.employeeId, 120),
      employeeName: text(data.employeeName, 120),
    };
  }).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 200);
  return { ok: true, rows, scope: admin ? 'company' : 'self' };
});
