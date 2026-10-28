/**
 * Speiler tilgangsmatrisen til families/{id}/accessAcl/{uid}, som Firestore-reglene
 * for ISO / K-HMS leser. Beregningen er den samme som i appen (src/iso/aclSync.js →
 * resolveActorAccess), så det finnes én kilde til sannhet: tilgangsmatrisen.
 *
 * syncCompanyAccess (callable): kalles av appen når et bedriftsskall åpnes, når ISO åpnes og
 * når et tilgangsnivå endres. Ethvert medlem kan be om ny beregning; resultatet avhenger bare
 * av data i selskapet, ikke av hvem som spør. Speilet gjelder dermed alle selskaper, og
 * Firestore-reglene bruker det for selskapsdokumentet og ansatte, ikke bare for ISO.
 * Samme kall holder administratorlisten (adminUids) i takt med nivået Administrator
 * (planAdminUids). Eieren mister aldri administratorrettigheten.
 *
 * onCompanyAccessChanged / onEmployeeAccessChanged (Firestore-triggere): beregner på
 * nytt straks matrisen, eierskap, medlemskap eller en ansatt endres, så tilbaketrekking
 * slår inn med en gang. Triggerne deployes manuelt (se docs/product/iso-khms/UTRULLING.md),
 * fordi deploy-kontoen i CI ikke kan opprette Firestore-triggere.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { planAclSync, planAdminUids } from '../src/iso/aclSync.js';
import { isOrganizationType } from '../src/utils/groupTypes.js';
import {
  assertRateLimit, hashRateKey, isFamilyOwnerOrAdmin, listedOnFamily, requireAuth,
} from './security.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

const CALL = {
  region: 'europe-west1',
  timeoutSeconds: 60,
  memory: '256MiB',
  cors: true,
  invoker: 'public',
};

function cleanId(value) {
  const id = String(value ?? '').trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : '';
}

function isMember(family, uid) {
  return listedOnFamily(family, uid) || isFamilyOwnerOrAdmin(family, uid);
}

/**
 * Administratorlisten følger nivået Administrator (bare bedrifter). Skrives i en transaksjon
 * mot den ferske gruppen, så en samtidig endring av medlemmer ikke går tapt.
 */
async function syncAdminUids(familyRef, employees) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(familyRef);
    if (!snap.exists) return { add: [], remove: [] };
    const family = snap.data() || {};
    if (!isOrganizationType(family.type)) return { add: [], remove: [] };
    const plan = planAdminUids({ family, employees });
    if (plan.add.length || plan.remove.length) {
      tx.update(familyRef, { adminUids: plan.adminUids, updatedAt: new Date().toISOString() });
    }
    return { add: plan.add, remove: plan.remove };
  });
}

/** Beregn og skriv alle accessAcl-dokumenter for selskapet. */
export async function syncCompany(companyId, now = new Date()) {
  const familyRef = db.doc(`families/${companyId}`);
  const [familySnap, employeesSnap, aclSnap] = await Promise.all([
    familyRef.get(),
    familyRef.collection('employees').get(),
    familyRef.collection('accessAcl').get(),
  ]);
  if (!familySnap.exists) return { written: 0, removed: 0, acl: {} };
  const family = familySnap.data() || {};
  const employees = employeesSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
  const plan = planAclSync({ family, employees, existingUids: aclSnap.docs.map((d) => d.id), now });
  const acl = {};
  const ops = [
    ...plan.write.map((row) => ({ type: 'set', ref: familyRef.collection('accessAcl').doc(row.uid), data: { ...row, source: 'function' } })),
    ...plan.remove.map((uid) => ({ type: 'delete', ref: familyRef.collection('accessAcl').doc(uid) })),
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + 400)) {
      if (op.type === 'set') batch.set(op.ref, op.data);
      else batch.delete(op.ref);
    }
    await batch.commit();
  }
  for (const row of plan.write) acl[row.uid] = row;
  const admins = await syncAdminUids(familyRef, employees);
  if (admins.add.length || admins.remove.length) {
    logger.info('companyAccessSync adminUids', { companyId, add: admins.add, remove: admins.remove });
  }
  return { written: plan.write.length, removed: plan.remove.length, acl, admins };
}

export const syncCompanyAccess = onCall(CALL, async (request) => {
  const uid = requireAuth(request.auth);
  const companyId = cleanId(request.data?.companyId);
  if (!companyId) throw new HttpsError('invalid-argument', 'Mangler selskap.');
  const familySnap = await db.doc(`families/${companyId}`).get();
  if (!familySnap.exists || !isMember(familySnap.data(), uid)) {
    throw new HttpsError('permission-denied', 'Du er ikke medlem av dette selskapet.');
  }
  await assertRateLimit(db, { key: hashRateKey(['accessSync', companyId, uid]), limit: 60, windowMs: 60 * 60 * 1000 });
  const res = await syncCompany(companyId);
  const mine = res.acl[uid] || null;
  return {
    ok: true,
    written: res.written,
    removed: res.removed,
    iso: mine ? mine.iso : 0,
    expiresAt: mine ? mine.expiresAt.toISOString() : '',
  };
});

/** Bare selskaper som allerede har speilet tilgang (bruker ISO) beregnes på nytt. */
async function resyncIfMirrored(companyId) {
  const any = await db.collection(`families/${companyId}/accessAcl`).limit(1).get();
  if (any.empty) return;
  try {
    await syncCompany(companyId);
  } catch (err) {
    logger.error('companyAccessSync failed', { companyId, message: err?.message });
  }
}

const ACCESS_KEYS = ['ownerUid', 'ownerId', 'members', 'activeUsers', 'memberIds', 'adminUids'];

export const onCompanyAccessChanged = onDocumentWritten({ document: 'families/{companyId}', region: 'europe-west1' }, async (event) => {
  const before = event.data?.before?.data() || {};
  const after = event.data?.after?.data() || {};
  const same = ACCESS_KEYS.every((k) => JSON.stringify(before[k] ?? null) === JSON.stringify(after[k] ?? null))
    && JSON.stringify(before.company?.accessPolicy ?? null) === JSON.stringify(after.company?.accessPolicy ?? null);
  if (same) return;
  await resyncIfMirrored(event.params.companyId);
});

export const onEmployeeAccessChanged = onDocumentWritten({ document: 'families/{companyId}/employees/{employeeId}', region: 'europe-west1' }, async (event) => {
  const before = event.data?.before?.data() || null;
  const after = event.data?.after?.data() || null;
  const pick = (e) => (e ? JSON.stringify({
    personUid: e.personUid || '',
    status: e.company?.status || '',
    accessLevel: e.company?.accessLevel || '',
    accessLevels: e.company?.accessLevels || null,
    accessRole: e.company?.accessRole || '',
    accessOverrides: e.company?.accessOverrides || null,
  }) : '');
  if (pick(before) === pick(after)) return;
  await resyncIfMirrored(event.params.companyId);
});
