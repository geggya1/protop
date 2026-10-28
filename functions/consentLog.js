/**
 * Samtykkelogg (GDPR art. 7 nr. 1): hver godkjenning av vilkår, markedsføring og
 * databehandleravtale lagres med versjon og servertid i consentLog/{id}.
 * Samlingen har ingen regler for klienter, så bare serveren kan skrive og lese den.
 * Ingen hemmeligheter — trygg for membership-deployen.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { assertRateLimit, hashRateKey, requireAuth } from './security.js';
import { appendConsentHistory, consentLogEntry, consentLogId } from '../src/utils/consentState.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

/** Bare eier eller administrator kan godta databehandleravtalen for bedriften. */
export function canAcceptForCompany(data, uid) {
  if (!data || !uid) return false;
  const adminUids = Array.isArray(data.adminUids) ? data.adminUids : [];
  return data.ownerUid === uid || data.ownerId === uid || data.createdBy === uid || adminUids.includes(uid);
}

/** Skriver raden. Svarer false når samme godkjenning allerede er logget. */
export async function writeConsentLog(database, entry) {
  const payload = { ...entry, at: FieldValue.serverTimestamp() };
  const id = consentLogId(entry);
  if (!id) {
    await database.collection('consentLog').add(payload);
    return true;
  }
  try {
    // create, ikke set: en godkjenning som sendes på nytt, skal beholde første servertid.
    await database.doc(`consentLog/${id}`).create(payload);
    return true;
  } catch (err) {
    if (err?.code !== 6 && !/already exists/i.test(String(err?.message || ''))) throw err;
    return false;
  }
}

export const recordConsent = onCall(
  { region: 'europe-west1', timeoutSeconds: 20, memory: '256MiB', cors: true },
  async (req) => {
    const uid = requireAuth(req.auth);
    await assertRateLimit(db, {
      key: hashRateKey(['consent-log', uid]),
      limit: 60,
      windowMs: 60 * 60 * 1000,
    });
    const entry = consentLogEntry(req.data, { uid });
    if (!entry) throw new HttpsError('invalid-argument', 'Ukjent samtykke.');
    if (entry.kind === 'dpa') {
      const fam = await db.doc(`families/${entry.familyId}`).get();
      if (!fam.exists || !canAcceptForCompany(fam.data(), uid)) {
        throw new HttpsError('permission-denied', 'Bare eier eller administrator kan godta for bedriften.');
      }
    }
    const created = await writeConsentLog(db, entry);
    if (!created) return { ok: true, duplicate: true };
    // Kopi på kontoen så brukeren ser historikken i appen. Loggen over er fasiten.
    const userRef = db.doc(`users/${uid}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const patch = { consentHistory: appendConsentHistory(snap.data()?.consentHistory, entry, Timestamp.now()) };
      if (entry.kind === 'terms') {
        patch.consentsServerAt = FieldValue.serverTimestamp();
        patch.consentsServerVersion = entry.version;
      }
      tx.set(userRef, patch, { merge: true });
    });
    return { ok: true };
  },
);
