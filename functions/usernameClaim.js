/**
 * claimUsername (SEC-19): brukernavn reserveres på serveren, ett aktivt navn per konto.
 *
 * Firestore-regler kan ikke telle navn per konto, så en konto kunne reservere mange
 * brukernavn med egne skript (usernames/{navn} med uid = seg selv). Denne callablen tar det
 * nye navnet og frigir de andre navnene som peker på samme konto, i én transaksjon.
 *
 * Voksen: bare til innlogget konto (en annen uid avvises). Barn: bare for et barn den innloggede
 * er foresatt til (children/{uid}.familyId, aktivt medlemsdokument i den familien, barneprofil),
 * som isGuardianOf i firestore.rules. Hvert barn har også bare ett navn.
 * Den gamle veien (direkte skriving fra appen, 86332db) står i reglene til en fast dato,
 * se docs/utrulling-regler.md.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { assertRateLimit, hashRateKey, memberDocGrantsAccess, requireAuth } from './security.js';
import { isSyntheticEmail, isValidUsername, normalizeUsername } from '../src/utils/usernamesLogic.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

const CALL = {
  region: 'europe-west1',
  timeoutSeconds: 30,
  memory: '256MiB',
  cors: true,
  invoker: 'public',
};

// Et navn velges sjelden; dette stopper skript som prøver mange navn, ikke vanlig bruk.
const CLAIMS_PER_HOUR = 20;

function text(value) {
  return String(value ?? '').trim();
}

/** Barnekonto, som childProfileData i firestore.rules. */
export function isChildProfileData(user) {
  if (!user || typeof user !== 'object') return false;
  const role = text(user.role);
  return role === 'child' || user.type === 'child' || (!role && isSyntheticEmail(user.email));
}

/**
 * Hva kallet gjelder: navnet, kontoen det skal peke på og typen. Kaster ved ugyldig navn.
 * Voksne tar bare navn til seg selv; uid i kallet brukes bare for barn.
 */
export function claimRequest(callerUid, data = {}) {
  const username = normalizeUsername(data.username);
  if (!isValidUsername(username)) {
    throw new HttpsError('invalid-argument', 'Brukernavnet må ha 3–24 tegn: a–z, 0–9, punktum, bindestrek eller understrek.');
  }
  const child = data.type === 'child';
  if (!child && text(data.uid) && text(data.uid) !== callerUid) {
    throw new HttpsError('permission-denied', 'Et brukernavn til en voksen tas av kontoen selv.');
  }
  const target = child ? text(data.uid) : callerUid;
  if (!target) throw new HttpsError('invalid-argument', 'Mangler barnet brukernavnet gjelder.');
  if (child && target === callerUid) throw new HttpsError('permission-denied', 'Et barnenavn tas av en foresatt.');
  return { username, target, type: child ? 'child' : 'adult' };
}

/**
 * Ett aktivt navn per konto: navnene som skal frigis når kontoen tar `username`.
 * owned: id-ene til usernames-dokumentene som peker på kontoen.
 */
export function namesToRelease(owned, username) {
  return [...new Set((owned || []).map(text).filter((id) => id && id !== username))];
}

async function assertGuardian(guardianUid, childUid) {
  const deny = () => new HttpsError('permission-denied', 'Bare en foresatt kan ta brukernavn til barnet.');
  const child = await db.doc(`children/${childUid}`).get();
  const familyId = child.exists ? text(child.data()?.familyId) : '';
  if (!familyId) throw deny();
  const member = await db.doc(`families/${familyId}/parents/${guardianUid}`).get();
  if (!member.exists || !memberDocGrantsAccess(member.data())) throw deny();
  const profile = await db.doc(`users/${childUid}`).get();
  if (!profile.exists || !isChildProfileData(profile.data())) throw deny();
}

/** Tar navnet til kontoen og frigir kontoens andre navn. Gir { username, released }. */
export async function claimUsernameFor(callerUid, data = {}) {
  const { username, target, type } = claimRequest(callerUid, data);
  if (type === 'child') await assertGuardian(callerUid, target);
  const ref = db.doc(`usernames/${username}`);
  // Eldre profiler som har navnet uten usernames-dokument (samme sjekk som usernameTaken i appen).
  const legacy = await db.collection('parents').where('usernameLower', '==', username).limit(3).get();
  if (legacy.docs.some((d) => text(d.data()?.uid || d.id) !== target)) {
    throw new HttpsError('already-exists', 'Brukernavnet er tatt.');
  }
  const released = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data() || {} : null;
    if (current && text(current.uid) && text(current.uid) !== target) {
      throw new HttpsError('already-exists', 'Brukernavnet er tatt.');
    }
    if (current && text(current.type) && text(current.type) !== type) {
      throw new HttpsError('already-exists', 'Brukernavnet er tatt.');
    }
    const owned = await tx.get(db.collection('usernames').where('uid', '==', target).limit(20));
    const release = namesToRelease(owned.docs.map((d) => d.id), username);
    tx.set(ref, {
      uid: target,
      type,
      username,
      updatedAt: FieldValue.serverTimestamp(),
      ...(current ? {} : { createdAt: FieldValue.serverTimestamp() }),
    });
    for (const id of release) tx.delete(db.doc(`usernames/${id}`));
    return release;
  });
  return { username, released };
}

export const claimUsername = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  await assertRateLimit(db, { key: `uname_${hashRateKey([uid])}`, limit: CLAIMS_PER_HOUR });
  try {
    const { username, released } = await claimUsernameFor(uid, req.data || {});
    if (released.length) logger.info('claimUsername released', { uid, count: released.length });
    return { ok: true, username, released: released.length };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error('claimUsername', error?.message || error);
    throw new HttpsError('internal', 'Kunne ikke lagre brukernavnet.');
  }
});
