/**
 * syncMyProfile (DS-07): «Rediger profil» lagrer navn, bilde og telefon i users/{uid}.
 * Denne callablen legger dem på medlemskapet i alle selskaper personen er med i
 * (families/{id}/parents, funnet med collectionGroup slik deleteAccount.js gjør), og på
 * ansattkortet som er koblet til personen (employees.personUid) i de samme selskapene.
 *
 * Bare personens egne dokumenter røres: medlemsdokumenter med uid lik innlogget bruker og
 * ansattkort med personUid lik innlogget bruker. Avsluttede medlemskap og ansettelser får ikke
 * nye opplysninger. Reglene for ansattkortet håndheves her (se src/employees/profileSync.js).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  employeePersonPatch,
  memberProfilePatch,
  memberStillActive,
  previousProfile,
  profileFromUser,
} from '../src/employees/profileSync.js';
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

const MAX_COMPANIES = 40;

function text(value) {
  return String(value ?? '').trim();
}

function idsFrom(raw) {
  if (Array.isArray(raw)) return raw.map(text).filter(Boolean);
  return text(raw) ? [text(raw)] : [];
}

/** Medlemsdokumentene til personen, per selskap. Dokument-id kan være uid eller en eldre nøkkel. */
async function membershipsOf(uid, user) {
  const byFamily = new Map();
  const remember = (familyId, snap) => {
    if (!familyId || !snap?.exists) return;
    const data = snap.data() || {};
    const current = byFamily.get(familyId);
    // Et aktivt medlemskap går foran en gammel invitasjon i samme selskap.
    if (!current || (!memberStillActive(current.data) && memberStillActive(data))) {
      byFamily.set(familyId, { ref: snap.ref, data });
    }
  };
  try {
    const group = await db.collectionGroup('parents').where('uid', '==', uid).limit(MAX_COMPANIES).get();
    for (const snap of group.docs) {
      const familyRef = snap.ref.parent?.parent;
      // parents/{uid} på toppnivå er personens egen og lagres av klienten.
      if (familyRef?.id) remember(familyRef.id, snap);
    }
  } catch (error) {
    logger.warn('syncMyProfile parents group', error?.message || error);
  }
  const listed = [...new Set([...idsFrom(user?.familyIds), ...idsFrom(user?.activeFamilyId)])];
  for (const familyId of listed.slice(0, MAX_COMPANIES)) {
    if (byFamily.has(familyId)) continue;
    remember(familyId, await db.doc(`families/${familyId}/parents/${uid}`).get());
  }
  return byFamily;
}

export async function syncProfileFor(uid, { previous = null } = {}) {
  const userSnap = await db.doc(`users/${uid}`).get();
  const user = userSnap.exists ? userSnap.data() || {} : {};
  const profile = profileFromUser(user);
  if (!profile.name) return { ok: true, members: 0, employees: 0, skipped: 'no-name' };
  const memberships = await membershipsOf(uid, user);
  const stamp = new Date().toISOString();
  let members = 0;
  let employees = 0;
  const writer = db.bulkWriter();
  for (const [familyId, { ref, data }] of memberships) {
    if (!memberStillActive(data)) continue;
    const memberPatch = memberProfilePatch(data, profile);
    if (memberPatch) {
      writer.set(ref, { ...memberPatch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      members += 1;
    }
    // Hva personen het før: det klienten sendte, og medlemsdokumentet i dette selskapet.
    const before = [previous, previousProfile(data)].filter(Boolean);
    const linked = await db.collection(`families/${familyId}/employees`).where('personUid', '==', uid).limit(5).get();
    for (const snap of linked.docs) {
      const patch = employeePersonPatch({ id: snap.id, ...snap.data() }, profile, before);
      if (!patch) continue;
      writer.set(snap.ref, { person: patch, personSyncedAt: stamp, updatedAt: stamp }, { merge: true });
      employees += 1;
    }
  }
  await writer.close();
  return { ok: true, members, employees };
}

export const syncMyProfile = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  await assertRateLimit(db, {
    key: hashRateKey(['sync-profile', uid]),
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  try {
    return await syncProfileFor(uid, { previous: previousProfile(req.data?.previous) });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error('syncMyProfile', error?.message || error);
    throw new HttpsError('internal', 'Kunne ikke oppdatere profilen i bedriftene.');
  }
});
